import { Router } from 'express';
import { ethers } from 'ethers';
import { Contract } from '../db';
import { STAKE_TOKEN_ABI } from '../utils/constants';
import { syncUserBalanceToCache } from '../utils/sync';

const router = Router();

router.post('/', async (req, res) => {
  const { address, amount } = req.body;
  const provider = req.app.get('provider') as ethers.JsonRpcProvider;
  const ENABLE_CACHE = req.app.get('ENABLE_CACHE') as boolean;
  
  if (!address || !amount) {
    return res.status(400).json({ error: 'address and amount required' });
  }

  // Validate amount (max 1000 tokens)
  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0 || amountNum > 1000) {
    return res.status(400).json({ error: 'Amount must be between 0 and 1000 tokens' });
  }

  const privateKey = process.env.FAUCET_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!privateKey) {
    return res.status(500).json({ error: 'Faucet not configured' });
  }

  try {
    const wallet = new ethers.Wallet(privateKey, provider);

    // Get stake token address from database
    const stakeTokenContract = await Contract.findOne({ type: 'stakeToken' });
    if (!stakeTokenContract || !stakeTokenContract.address) {
      return res.status(500).json({ error: 'Stake token not found in database. Deploy contracts first.' });
    }

    console.log(`💰 Faucet: Sending ${amount} tokens to ${address} using token ${stakeTokenContract.address}`);

    const stakeToken = new ethers.Contract(
      stakeTokenContract.address,
      STAKE_TOKEN_ABI,
      wallet
    );

    // Check faucet balance first
    const faucetBalance = await stakeToken.balanceOf(wallet.address);
    const amountWei = ethers.parseEther(amount.toString());
    
    if (faucetBalance < amountWei) {
      return res.status(500).json({ 
        error: `Insufficient faucet balance. Faucet has ${ethers.formatEther(faucetBalance)} tokens, requested ${amount}` 
      });
    }

    const tx = await stakeToken.transfer(address, amountWei);
    console.log(`  Transaction hash: ${tx.hash}`);
    await tx.wait();
    console.log(`  ✅ Tokens sent successfully`);

    // Update cache if enabled
    if (ENABLE_CACHE) {
      await syncUserBalanceToCache(address, provider);
    }

    res.json({ success: true, txHash: tx.hash });
  } catch (error: any) {
    console.error('Faucet error:', error);
    res.status(500).json({ error: error.message || 'Failed to send tokens' });
  }
});

export default router;

