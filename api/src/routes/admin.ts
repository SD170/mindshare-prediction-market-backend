import { Router } from 'express';
import { ethers } from 'ethers';
import { Market, LeaderboardEntry } from '../db';
import { MARKET_ADMIN_ABI, phaseToStatus, getDateOnly } from '../utils/constants';
import { syncMarketPhases, syncMarketToCache } from '../utils/sync';

const router = Router();

// Regenerate leaderboard (randomize and save new snapshot)
router.post('/regenerate-leaderboard', async (req, res) => {
  try {
    const today = getDateOnly(new Date());
    
    // Get latest leaderboard
    const maxIndexDoc = await LeaderboardEntry.findOne({ date: today })
      .sort({ index: -1 })
      .select('index')
      .lean();
    
    if (!maxIndexDoc) {
      return res.status(404).json({ error: 'No leaderboard found for today' });
    }
    
    const maxIndex = maxIndexDoc.index;
    const entries = await LeaderboardEntry.find({ date: today, index: maxIndex })
      .sort({ rank: 1 })
      .lean();
    
    // Fisher-Yates shuffle
    const randomized = [...entries];
    for (let i = randomized.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [randomized[i], randomized[j]] = [randomized[j], randomized[i]];
    }
    
    // Assign new ranks and update scores based on new standings
    // Score formula: 10000 - (rank - 1) * 250 (gives rank 1 = 10000, rank 2 = 9750, etc.)
    const newEntries = randomized.map((entry: any, index: number) => {
      const newRank = index + 1;
      const newScore = 10000 - (newRank - 1) * 250;
      return {
        ...entry,
        _id: undefined,
        rank: newRank,
        score: newScore,
        date: today,
        index: maxIndex + 1,
      };
    });
    
    // Save new snapshot with incremented index
    const nextIndex = maxIndex + 1;
    await LeaderboardEntry.deleteMany({ date: today, index: nextIndex });
    
    await LeaderboardEntry.insertMany(newEntries);
    
    res.json({
      success: true,
      date: today.toISOString().split('T')[0],
      index: nextIndex,
      count: newEntries.length,
      top10: randomized.slice(0, 10).map((e: any) => e.name)
    });
  } catch (error: any) {
    console.error('Error regenerating leaderboard:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to regenerate leaderboard',
      details: error.stack 
    });
  }
});

// Force sync phases
router.post('/sync-phases', async (req, res) => {
  try {
    const provider = req.app.get('provider') as ethers.JsonRpcProvider;
    await syncMarketPhases(provider);
    res.json({ success: true, message: 'Market phases synced' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Close all markets
router.post('/close-all', async (req, res) => {
  const adminKey = process.env.ADMIN_PRIVATE_KEY;
  if (!adminKey) {
    return res.status(500).json({ error: 'ADMIN_PRIVATE_KEY not configured' });
  }

  try {
    const provider = req.app.get('provider') as ethers.JsonRpcProvider;
    const ENABLE_CACHE = req.app.get('ENABLE_CACHE') as boolean;
    const wallet = new ethers.Wallet(adminKey, provider);
    const markets = await Market.find();
    const block = await provider.getBlock('latest');
    const currentTime = block?.timestamp ?? Math.floor(Date.now() / 1000);

    console.log(`🔒 Attempting to close markets (current time: ${currentTime})`);

    const results: { marketAddress: string; phase: number; status: string; lockTime?: number; canClose?: boolean }[] = [];

    for (const market of markets) {
      const marketName = market.type === 'top10' ? market.projectName : `${market.projectA} vs ${market.projectB}`;
      try {
        const contract = new ethers.Contract(market.marketAddress, MARKET_ADMIN_ABI, wallet);
        const phase: number = Number(await contract.phase());
        const lockTime: number = Number(await contract.lockTime());

        if (phase !== 0) {
          results.push({ 
            marketAddress: market.marketAddress, 
            phase, 
            status: 'already-closed-or-not-trading',
            lockTime 
          });
          console.log(`  ⏭️  ${marketName}: Already in phase ${phase}`);
          continue;
        }

        // Check if lockTime has passed
        if (currentTime < lockTime) {
          const waitSeconds = lockTime - currentTime;
          const waitHours = Math.floor(waitSeconds / 3600);
          const waitMinutes = Math.floor((waitSeconds % 3600) / 60);
          results.push({ 
            marketAddress: market.marketAddress, 
            phase, 
            status: `not-ready (lockTime in ${waitHours}h ${waitMinutes}m)`,
            lockTime,
            canClose: false
          });
          console.log(`  ⏳ ${marketName}: Not ready (lockTime: ${new Date(lockTime * 1000).toISOString()})`);
          continue;
        }

        // Close the market
        console.log(`  🔒 Closing ${marketName}...`);
        const tx = await contract.close();
        await tx.wait();
        market.phase = 1;
        market.status = 'locked';
        market.lastTxHash = tx.hash;
        await market.save();
        
        // Update cache if enabled
        if (ENABLE_CACHE) {
          await syncMarketToCache(market.marketAddress, provider);
        }
        
        results.push({ 
          marketAddress: market.marketAddress, 
          phase: 1, 
          status: `closed (${tx.hash})`,
          lockTime,
          canClose: true
        });
        console.log(`  ✅ ${marketName}: Closed successfully`);
      } catch (error: any) {
        console.error(`  ❌ Error closing ${marketName}:`, error.message || error);
        results.push({ 
          marketAddress: market.marketAddress, 
          phase: -1, 
          status: error.message || 'error',
          canClose: false
        });
      }
    }

    const closed = results.filter(r => r.status.includes('closed')).length;
    const notReady = results.filter(r => r.status.includes('not-ready')).length;
    const alreadyClosed = results.filter(r => r.status.includes('already-closed')).length;

    console.log(`📊 Summary: ${closed} closed, ${notReady} not ready, ${alreadyClosed} already closed`);

    res.json({ 
      success: true, 
      summary: {
        total: markets.length,
        closed,
        notReady,
        alreadyClosed,
        errors: results.filter(r => r.phase === -1).length
      },
      results 
    });
  } catch (error: any) {
    console.error('Close-all error:', error);
    res.status(500).json({ error: error.message || 'Failed to close markets' });
  }
});

// Generate market suggestions based on current leaderboard
router.get('/markets/suggest', async (req, res) => {
  try {
    const { top10Count = 5, h2hCount = 5 } = req.query;
    const numTop10 = parseInt(top10Count as string, 10);
    const numH2h = parseInt(h2hCount as string, 10);

    // Get latest leaderboard (today's, highest index)
    const today = getDateOnly(new Date());
    
    const latestLeaderboard = await LeaderboardEntry.find({ date: today })
      .sort({ index: -1 })
      .limit(1)
      .exec();

    if (latestLeaderboard.length === 0) {
      return res.status(404).json({ error: 'No leaderboard found for today' });
    }

    const leaderboardIndex = latestLeaderboard[0].index;
    const allProjects = await LeaderboardEntry.find({ 
      date: today, 
      index: leaderboardIndex 
    })
      .sort({ rank: 1 })
      .exec();

    if (allProjects.length < 2) {
      return res.status(400).json({ error: 'Not enough projects in leaderboard' });
    }

    // Shuffle array for random selection
    const shuffled = [...allProjects].sort(() => Math.random() - 0.5);

    // Select Top-10 markets (random projects)
    const top10Markets = [];
    for (let i = 0; i < numTop10 && i < shuffled.length; i++) {
      top10Markets.push({
        type: 'top10',
        projectName: shuffled[i].name
      });
    }

    // Select H2H markets (random pairs, ensure different projects)
    const h2hMarkets = [];
    const usedProjects = new Set<string>();
    let attempts = 0;
    const maxAttempts = shuffled.length * 2;

    while (h2hMarkets.length < numH2h && attempts < maxAttempts) {
      const projectA = shuffled[Math.floor(Math.random() * shuffled.length)];
      const projectB = shuffled[Math.floor(Math.random() * shuffled.length)];

      if (projectA.name !== projectB.name && 
          !usedProjects.has(projectA.name) && 
          !usedProjects.has(projectB.name)) {
        h2hMarkets.push({
          type: 'h2h',
          projectA: projectA.name,
          projectB: projectB.name
        });
        usedProjects.add(projectA.name);
        usedProjects.add(projectB.name);
      }
      attempts++;
    }

    res.json({
      top10: top10Markets,
      h2h: h2hMarkets,
      top10Count: top10Markets.length,
      h2hCount: h2hMarkets.length,
      leaderboardDate: today.toISOString().split('T')[0],
      leaderboardIndex
    });
  } catch (error: any) {
    console.error('Error generating market suggestions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Import markets
router.post('/markets/import', async (req, res) => {
  const { markets, clearExisting } = req.body;
  if (!Array.isArray(markets)) {
    return res.status(400).json({ error: 'markets array required' });
  }

  try {
    const provider = req.app.get('provider') as ethers.JsonRpcProvider;
    const deploymentDate = new Date();
    const deploymentDateOnly = getDateOnly(deploymentDate);
    
    let deploymentIndex = 0;

    // Optionally clear all existing markets before importing
    if (clearExisting) {
      const deleted = await Market.deleteMany({});
      console.log(`🗑️  Cleared ${deleted.deletedCount} existing markets`);
      deploymentIndex = 0; // Start fresh at 0
    } else {
      // Find the highest deployment index for today
      const maxDeploymentDoc = await Market.findOne({ deploymentDate: deploymentDateOnly })
        .sort({ deploymentIndex: -1 })
        .select('deploymentIndex')
        .lean();
      
      deploymentIndex = maxDeploymentDoc ? (maxDeploymentDoc.deploymentIndex || 0) + 1 : 0;
    }

    console.log(`📦 Importing ${markets.length} markets (deployment date: ${deploymentDateOnly.toISOString().split('T')[0]}, index: ${deploymentIndex})`);

    let upserted = 0;
    for (const market of markets) {
      if (!market.marketAddress || !market.marketId) continue;
      await Market.findOneAndUpdate(
        { marketAddress: market.marketAddress },
        { 
          ...market, 
          status: market.status || phaseToStatus(market.phase ?? 0),
          deploymentDate: deploymentDateOnly,
          deploymentIndex: deploymentIndex,
        },
        { upsert: true }
      );
      upserted++;
    }
    await syncMarketPhases(provider);
    res.json({ 
      success: true, 
      count: upserted, 
      cleared: clearExisting || false,
      deploymentDate: deploymentDateOnly.toISOString().split('T')[0],
      deploymentIndex: clearExisting ? 0 : deploymentIndex,
    });
  } catch (error: any) {
    console.error('Import error:', error);
    res.status(500).json({ error: error.message || 'Failed to import markets' });
  }
});

export default router;

