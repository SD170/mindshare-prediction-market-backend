import { Router } from 'express';
import { ethers } from 'ethers';
import { Market, UserInvestment } from '../db';
import { MARKET_ADMIN_ABI } from '../utils/constants';
import { syncMarketPhases, syncMarketToCache, syncUserInvestmentToCache } from '../utils/sync';

const router = Router();

// Get market info (phase, pools, winner, etc.) - uses cache if enabled
router.get('/:address/info', async (req, res) => {
  const { address } = req.params;
  const provider = req.app.get('provider') as ethers.JsonRpcProvider;
  const ENABLE_CACHE = req.app.get('ENABLE_CACHE') as boolean;
  
  try {
    if (ENABLE_CACHE) {
      const market = await Market.findOne({ marketAddress: address });
      if (market && market.lastSyncedAt) {
        // Check if cache is fresh (less than 30 seconds old)
        const cacheAge = Date.now() - market.lastSyncedAt.getTime();
        if (cacheAge < 30000) {
          return res.json({
            phase: market.phase ?? 0,
            pools: {
              A: market.poolA || '0',
              B: market.poolB || '0',
            },
            winner: market.winner,
            lockTime: market.lockTime,
            resolveTime: market.resolveTime,
            cached: true,
          });
        }
      }
    }
    
    // Fetch from chain
    const marketContract = new ethers.Contract(address, MARKET_ADMIN_ABI, provider);
    const [phase, pools, winner, lockTime, resolveTime] = await Promise.all([
      marketContract.phase() as Promise<bigint>,
      marketContract.pools() as Promise<{ A: bigint; B: bigint } | [bigint, bigint]>,
      marketContract.winner() as Promise<bigint>,
      marketContract.lockTime() as Promise<bigint>,
      marketContract.resolveTime() as Promise<bigint>,
    ]);

    const poolA = 'A' in pools ? pools.A : (pools as [bigint, bigint])[0];
    const poolB = 'B' in pools ? pools.B : (pools as [bigint, bigint])[1];

    // Update cache if enabled
    if (ENABLE_CACHE) {
      await syncMarketToCache(address, provider);
    }

    res.json({
      phase: Number(phase),
      pools: {
        A: poolA.toString(),
        B: poolB.toString(),
      },
      winner: Number(winner) > 0 ? Number(winner) : undefined,
      lockTime: Number(lockTime),
      resolveTime: Number(resolveTime),
      cached: false,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get user investment for a market - uses cache if enabled
router.get('/:address/user/:userAddress', async (req, res) => {
  const { address, userAddress } = req.params;
  const provider = req.app.get('provider') as ethers.JsonRpcProvider;
  const ENABLE_CACHE = req.app.get('ENABLE_CACHE') as boolean;
  
  try {
    if (ENABLE_CACHE) {
      const { UserInvestment } = await import('../db');
      const investment = await UserInvestment.findOne({ marketAddress: address, userAddress });
      if (investment && investment.lastSyncedAt) {
        const cacheAge = Date.now() - investment.lastSyncedAt.getTime();
        if (cacheAge < 30000) {
          return res.json({
            aClaims: investment.aClaims,
            bClaims: investment.bClaims,
            redeemed: investment.redeemed,
            cached: true,
          });
        }
      }
    }
    
    // Fetch from chain
    const marketContract = new ethers.Contract(address, MARKET_ADMIN_ABI, provider);
    const accountInfo = await marketContract.a(userAddress) as Promise<[bigint, bigint, boolean]>;
    const [aClaims, bClaims, redeemed] = await accountInfo;

    // Update cache if enabled
    if (ENABLE_CACHE) {
      await syncUserInvestmentToCache(address, userAddress, provider);
    }

    res.json({
      aClaims: aClaims.toString(),
      bClaims: bClaims.toString(),
      redeemed,
      cached: false,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all markets
router.get('/', async (req, res) => {
  const provider = req.app.get('provider') as ethers.JsonRpcProvider;
  const ENABLE_CACHE = req.app.get('ENABLE_CACHE') as boolean;
  
  // Find the latest deployment (highest date + index)
  const latestDeployment = await Market.findOne()
    .sort({ deploymentDate: -1, deploymentIndex: -1 })
    .select('deploymentDate deploymentIndex')
    .lean();
  
  let markets;
  if (!latestDeployment || !latestDeployment.deploymentDate) {
    // No deployment tracking, return all (backward compatibility)
    markets = await Market.find().sort({ lockTime: 1 });
  } else {
    // Only return markets from the latest deployment
    markets = await Market.find({
      deploymentDate: latestDeployment.deploymentDate,
      deploymentIndex: latestDeployment.deploymentIndex,
    }).sort({ lockTime: 1 });
  }
  
  // Return cached data immediately
  console.log(`📊 Returning ${markets.length} markets (cached)`);
  res.json(markets);
  
  // Sync in background (fire and forget)
  if (!ENABLE_CACHE) {
    // Always sync if cache disabled
    syncMarketPhases(provider).catch(err => console.error('Background sync error:', err));
  } else {
    // Check if cache needs refresh (any market cache older than 30s)
    const staleMarkets = await Market.find({
      $or: [
        { lastSyncedAt: { $exists: false } },
        { lastSyncedAt: { $lt: new Date(Date.now() - 30000) } }
      ]
    }).limit(1);
    
    if (staleMarkets.length > 0) {
      console.log(`🔄 Cache stale, syncing markets in background...`);
      syncMarketPhases(provider).catch(err => console.error('Background sync error:', err));
    } else {
      console.log(`✅ Cache is fresh, skipping sync`);
    }
  }
});

export default router;

