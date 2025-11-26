import { Router } from 'express';
import { ethers } from 'ethers';
import { syncMarketToCache, syncUserInvestmentToCache, syncUserBalanceToCache } from '../utils/sync';

const router = Router();

// Cache update endpoint - call this after on-chain writes (deposit, redeem, close, settle)
router.post('/update', async (req, res) => {
  try {
    const { marketAddress, userAddress } = req.body;
    const provider = req.app.get('provider') as ethers.JsonRpcProvider;
    const ENABLE_CACHE = req.app.get('ENABLE_CACHE') as boolean;
    
    if (!ENABLE_CACHE) {
      return res.json({ success: true, message: 'Cache disabled, skipped' });
    }

    const updates: string[] = [];

    // Always update market cache
    if (marketAddress) {
      await syncMarketToCache(marketAddress, provider);
      updates.push(`market:${marketAddress}`);
    }

    // Update user investment cache if user address provided
    if (marketAddress && userAddress) {
      await syncUserInvestmentToCache(marketAddress, userAddress, provider);
      updates.push(`investment:${marketAddress}:${userAddress}`);
    }

    // Update user balance if user address provided
    if (userAddress) {
      await syncUserBalanceToCache(userAddress, provider);
      updates.push(`balance:${userAddress}`);
    }

    res.json({ success: true, updated: updates });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

