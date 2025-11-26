import { Router } from 'express';
import { ethers } from 'ethers';
import { UserBalance, Contract } from '../db';
import { STAKE_TOKEN_ABI } from '../utils/constants';
import { syncUserBalanceToCache } from '../utils/sync';

const router = Router();

// Get user balance - uses cache if enabled
router.get('/:address/balance', async (req, res) => {
  const { address } = req.params;
  const provider = req.app.get('provider') as ethers.JsonRpcProvider;
  const ENABLE_CACHE = req.app.get('ENABLE_CACHE') as boolean;
  
  try {
    if (ENABLE_CACHE) {
      const balanceDoc = await UserBalance.findOne({ userAddress: address });
      if (balanceDoc && balanceDoc.lastSyncedAt) {
        const cacheAge = Date.now() - balanceDoc.lastSyncedAt.getTime();
        if (cacheAge < 30000) {
          return res.json({
            balance: balanceDoc.balance,
            cached: true,
          });
        }
      }
    }
    
    // Fetch from chain
    const contracts = await Contract.find();
    const stakeTokenContract = contracts.find(c => c.type === 'stakeToken');
    if (!stakeTokenContract) {
      return res.status(404).json({ error: 'Stake token not found' });
    }

    const stakeToken = new ethers.Contract(stakeTokenContract.address, STAKE_TOKEN_ABI, provider);
    const balance = await stakeToken.balanceOf(address) as Promise<bigint>;

    // Update cache if enabled
    if (ENABLE_CACHE) {
      await syncUserBalanceToCache(address, provider);
    }

    res.json({
      balance: (await balance).toString(),
      cached: false,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

