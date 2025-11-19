/// <reference types="node" />
import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { connectToDatabase, ensureSeedData, LeaderboardEntry, Market, Contract } from './db';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';
const provider = new ethers.JsonRpcProvider(RPC_URL);

const MARKET_ADMIN_ABI = [
  'function phase() view returns (uint8)',
  'function close() external',
  'function lockTime() view returns (uint64)'
];

const STAKE_TOKEN_ABI = [
  'function transfer(address to, uint256 amount) external returns (bool)',
];

function phaseToStatus(phase: number): string {
  switch (phase) {
    case 0:
      return 'trading';
    case 1:
      return 'locked';
    case 2:
      return 'resolved';
    case 3:
      return 'cancelled';
    default:
      return 'unknown';
  }
}

async function syncMarketPhases() {
  const markets = await Market.find();
  console.log(`🔄 Syncing ${markets.length} markets...`);
  
  for (const market of markets) {
    const marketName = market.type === 'top10' ? market.projectName : `${market.projectA} vs ${market.projectB}`;
    console.log(`  Checking: ${marketName} (${market.marketAddress})`);
    
    try {
      // Check if contract has code
      const code = await provider.getCode(market.marketAddress);
      if (code === '0x' || code === '0x0') {
        console.warn(`    ⚠️  No contract code at ${market.marketAddress} - market may not exist`);
        continue;
      }

      const contract = new ethers.Contract(market.marketAddress, MARKET_ADMIN_ABI, provider);
      const phase = Number(await contract.phase());
      const status = phaseToStatus(phase);
      if (market.phase !== phase || market.status !== status) {
        market.phase = phase;
        market.status = status;
        await market.save();
        console.log(`    ✅ Updated: Phase=${phase}, Status=${status}`);
      } else {
        console.log(`    ✓ Already synced: Phase=${phase}, Status=${status}`);
      }
    } catch (error: any) {
      console.error(`    ❌ Failed to sync ${market.marketAddress}:`, error.message || error);
    }
  }
}

// Helper: Get date-only (UTC midnight)
function getDateOnly(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Helper: Get leaderboard for a specific date (highest index)
async function getLeaderboardForDate(date: Date): Promise<any[]> {
  const dateOnly = getDateOnly(date);
  
  // Find the highest index for this date
  const maxIndexDoc = await LeaderboardEntry.findOne({ date: dateOnly })
    .sort({ index: -1 })
    .select('index')
    .lean();
  
  if (!maxIndexDoc) {
    return [];
  }
  
  const maxIndex = maxIndexDoc.index;
  
  // Get all entries for this date and index, sorted by rank
  const entries = await LeaderboardEntry.find({ date: dateOnly, index: maxIndex })
    .sort({ rank: 1 })
    .lean();
  
  return entries;
}

// Leaderboard endpoints
app.get('/api/leaderboard/today', async (req, res) => {
  const today = getDateOnly(new Date());
  const entries = await getLeaderboardForDate(today);
  res.json(entries);
});

app.get('/api/leaderboard/yesterday', async (req, res) => {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const entries = await getLeaderboardForDate(yesterday);
  res.json(entries);
});

// Get leaderboard for a specific date (optional: ?date=2025-01-15)
app.get('/api/leaderboard/date', async (req, res) => {
  const dateStr = req.query.date as string;
  if (!dateStr) {
    return res.status(400).json({ error: 'date query parameter required (YYYY-MM-DD)' });
  }
  
  const date = new Date(dateStr + 'T00:00:00Z');
  if (isNaN(date.getTime())) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
  }
  
  const entries = await getLeaderboardForDate(date);
  res.json(entries);
});

// POST endpoint to save a new leaderboard snapshot (increments index automatically)
app.post('/api/leaderboard/snapshot', async (req, res) => {
  try {
    const { date, entries } = req.body;
    
    if (!date || !Array.isArray(entries)) {
      return res.status(400).json({ error: 'date (YYYY-MM-DD) and entries array required' });
    }
    
    console.log(`📥 Received leaderboard snapshot: ${entries.length} entries for date ${date}`);
    
    const dateOnly = getDateOnly(new Date(date + 'T00:00:00Z'));
    
    // Find the highest index for this date
    const maxIndexDoc = await LeaderboardEntry.findOne({ date: dateOnly })
      .sort({ index: -1 })
      .select('index')
      .lean();
    
    const nextIndex = maxIndexDoc ? maxIndexDoc.index + 1 : 0;
    console.log(`  Next index for ${dateOnly.toISOString().split('T')[0]}: ${nextIndex}`);
    
    // Delete any existing entries for this date/index (in case of retry)
    const deleted = await LeaderboardEntry.deleteMany({ date: dateOnly, index: nextIndex });
    if (deleted.deletedCount > 0) {
      console.log(`  Cleared ${deleted.deletedCount} existing entries for this date/index`);
    }
    
    // Insert all entries with the new index
    const leaderboardEntries: any[] = entries.map((entry: any) => ({
      ...entry,
      date: dateOnly,
      index: nextIndex,
    }));
    
    console.log(`  Inserting ${leaderboardEntries.length} entries...`);
    await LeaderboardEntry.insertMany(leaderboardEntries, { ordered: false }).catch((error: any) => {
      // If there are duplicate key errors, that's okay - some entries might have been inserted
      if (error.code === 11000) {
        console.log(`  ⚠️  Some entries already exist (duplicate key), continuing...`);
        // Check how many were actually inserted
        return Promise.resolve();
      }
      throw error;
    });
    console.log(`  ✅ Successfully inserted ${leaderboardEntries.length} entries`);
    
    res.json({ 
      success: true, 
      date: dateOnly.toISOString().split('T')[0], 
      index: nextIndex,
      count: leaderboardEntries.length 
    });
  } catch (error: any) {
    console.error('Error saving leaderboard snapshot:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to save leaderboard snapshot',
      details: error.stack 
    });
  }
});

// Markets endpoint - only returns markets from the latest deployment
app.get('/api/markets', async (req, res) => {
  // Always sync phases before returning markets
  await syncMarketPhases();
  
  // Find the latest deployment (highest date + index)
  const latestDeployment = await Market.findOne()
    .sort({ deploymentDate: -1, deploymentIndex: -1 })
    .select('deploymentDate deploymentIndex')
    .lean();
  
  if (!latestDeployment || !latestDeployment.deploymentDate) {
    // No deployment tracking, return all (backward compatibility)
    const markets = await Market.find().sort({ lockTime: 1 });
    return res.json(markets);
  }
  
  // Only return markets from the latest deployment
  const markets = await Market.find({
    deploymentDate: latestDeployment.deploymentDate,
    deploymentIndex: latestDeployment.deploymentIndex,
  }).sort({ lockTime: 1 });
  
  console.log(`📊 Returning ${markets.length} markets from latest deployment (${latestDeployment.deploymentDate.toISOString().split('T')[0]}, index ${latestDeployment.deploymentIndex})`);
  res.json(markets);
});

// Force sync endpoint for manual refresh
app.post('/api/admin/sync-phases', async (req, res) => {
  try {
    await syncMarketPhases();
    res.json({ success: true, message: 'Market phases synced' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to sync phases' });
  }
});


// Contracts endpoints
app.get('/api/contracts', async (req, res) => {
  const contracts = await Contract.find().sort({ type: 1 });
  res.json(contracts);
});

app.post('/api/contracts', async (req, res) => {
  const { contracts } = req.body;
  if (!Array.isArray(contracts)) {
    return res.status(400).json({ error: 'contracts array required' });
  }

  try {
    const results = [];
    for (const entry of contracts) {
      if (!entry?.type || !entry?.address) continue;
      const updated = await Contract.findOneAndUpdate(
        { type: entry.type },
        { address: entry.address, metadata: entry.metadata || {} },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      results.push(updated);
    }
    res.json({ success: true, count: results.length, contracts: results });
  } catch (error: any) {
    console.error('Contract import error:', error);
    res.status(500).json({ error: error.message || 'Failed to save contracts' });
  }
});

// Faucet endpoint
app.post('/api/faucet', async (req, res) => {
  const { address, amount } = req.body;

  if (!address || !amount) {
    return res.status(400).json({ error: 'Address and amount required' });
  }

  const privateKey = process.env.FAUCET_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!privateKey) {
    return res.status(500).json({ error: 'Faucet not configured' });
  }

  try {
    const wallet = new ethers.Wallet(privateKey, provider);

    const contractsPath = join(__dirname, '../../../oracle/config/contracts.json');
    const contracts = JSON.parse(readFileSync(contractsPath, 'utf-8'));

    const stakeToken = new ethers.Contract(
      contracts.stakeToken,
      STAKE_TOKEN_ABI,
      wallet
    );

    const amountWei = ethers.parseEther(amount.toString());
    const tx = await stakeToken.transfer(address, amountWei);
    await tx.wait();

    res.json({ success: true, txHash: tx.hash });
  } catch (error: any) {
    console.error('Faucet error:', error);
    res.status(500).json({ error: error.message || 'Failed to send tokens' });
  }
});

// Admin: close all markets
app.post('/api/admin/close-all', async (req, res) => {
  const adminKey = process.env.ADMIN_PRIVATE_KEY;
  if (!adminKey) {
    return res.status(500).json({ error: 'ADMIN_PRIVATE_KEY not configured' });
  }

  try {
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

app.post('/api/admin/markets/import', async (req, res) => {
  const { markets, clearExisting } = req.body;
  if (!Array.isArray(markets)) {
    return res.status(400).json({ error: 'markets array required' });
  }

  try {
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
      
      deploymentIndex = maxDeploymentDoc ? maxDeploymentDoc.deploymentIndex! + 1 : 0;
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
    await syncMarketPhases();
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

const startServer = async () => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mindshare';
  await connectToDatabase(mongoUri);
  await ensureSeedData();
  await syncMarketPhases();

  app.listen(PORT, () => {
    console.log(`API server running on http://localhost:${PORT}`);
  });
};

startServer().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});

