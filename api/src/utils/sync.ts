import { ethers } from 'ethers';
import { Market, UserInvestment, UserBalance, Contract } from '../db';
import { MARKET_ADMIN_ABI, STAKE_TOKEN_ABI, phaseToStatus } from './constants';

export async function syncMarketToCache(
  marketAddress: string,
  provider: ethers.JsonRpcProvider
) {
  try {
    // Check if contract has code first
    const code = await provider.getCode(marketAddress);
    if (code === '0x' || code === '0x0') {
      console.warn(`⚠️  No contract code at ${marketAddress} - skipping cache update`);
      return;
    }

    const marketContract = new ethers.Contract(marketAddress, MARKET_ADMIN_ABI, provider);
    const [phase, pools, winner, lockTime, resolveTime] = await Promise.all([
      marketContract.phase() as Promise<bigint>,
      marketContract.pools() as Promise<{ A: bigint; B: bigint } | [bigint, bigint]>,
      marketContract.winner() as Promise<bigint>,
      marketContract.lockTime() as Promise<bigint>,
      marketContract.resolveTime() as Promise<bigint>,
    ]);

    const poolA = 'A' in pools ? pools.A : (pools as [bigint, bigint])[0];
    const poolB = 'B' in pools ? pools.B : (pools as [bigint, bigint])[1];

    await Market.findOneAndUpdate(
      { marketAddress },
      {
        phase: Number(phase),
        status: phaseToStatus(Number(phase)),
        winner: Number(winner) > 0 ? Number(winner) : undefined,
        poolA: poolA.toString(),
        poolB: poolB.toString(),
        lockTime: Number(lockTime),
        resolveTime: Number(resolveTime),
        lastSyncedAt: new Date(),
      },
      { upsert: false }
    );
  } catch (error: any) {
    // Check for "missing revert data" or CALL_EXCEPTION - means contract doesn't exist or is invalid
    if (error.code === 'CALL_EXCEPTION' || error.message?.includes('missing revert data')) {
      console.warn(`⚠️  Invalid contract at ${marketAddress} - skipping cache update`);
      return;
    }
    console.error(`Error syncing market ${marketAddress} to cache:`, error.message);
  }
}

export async function syncUserInvestmentToCache(
  marketAddress: string,
  userAddress: string,
  provider: ethers.JsonRpcProvider
) {
  try {
    // Check if contract has code first
    const code = await provider.getCode(marketAddress);
    if (code === '0x' || code === '0x0') {
      return; // Silently skip invalid contracts
    }

    const marketContract = new ethers.Contract(marketAddress, MARKET_ADMIN_ABI, provider);
    const accountInfo = await marketContract.a(userAddress) as Promise<[bigint, bigint, boolean]>;
    const [aClaims, bClaims, redeemed] = await accountInfo;

    await UserInvestment.findOneAndUpdate(
      { marketAddress, userAddress },
      {
        aClaims: aClaims.toString(),
        bClaims: bClaims.toString(),
        redeemed,
        lastSyncedAt: new Date(),
      },
      { upsert: true }
    );
  } catch (error: any) {
    // Check for "missing revert data" or CALL_EXCEPTION - means contract doesn't exist or is invalid
    if (error.code === 'CALL_EXCEPTION' || error.message?.includes('missing revert data')) {
      return; // Silently skip invalid contracts
    }
    console.error(`Error syncing user investment ${userAddress} in ${marketAddress}:`, error.message);
  }
}

export async function syncUserBalanceToCache(
  userAddress: string,
  provider: ethers.JsonRpcProvider
) {
  try {
    const contracts = await Contract.find();
    const stakeTokenContract = contracts.find(c => c.type === 'stakeToken');
    if (!stakeTokenContract) return;

    const stakeToken = new ethers.Contract(stakeTokenContract.address, STAKE_TOKEN_ABI, provider);
    const balance = await stakeToken.balanceOf(userAddress) as Promise<bigint>;

    await UserBalance.findOneAndUpdate(
      { userAddress },
      {
        balance: (await balance).toString(),
        lastSyncedAt: new Date(),
      },
      { upsert: true }
    );
  } catch (error: any) {
    console.error(`Error syncing user balance ${userAddress}:`, error.message);
  }
}

export async function syncMarketPhases(provider: ethers.JsonRpcProvider) {
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
      const [phase, pools, winner] = await Promise.all([
        contract.phase() as Promise<bigint>,
        contract.pools() as Promise<{ A: bigint; B: bigint } | [bigint, bigint]>,
        contract.winner() as Promise<bigint>,
      ]);
      
      const poolA = 'A' in pools ? pools.A : (pools as [bigint, bigint])[0];
      const poolB = 'B' in pools ? pools.B : (pools as [bigint, bigint])[1];
      const phaseNum = Number(phase);
      const status = phaseToStatus(phaseNum);
      const winnerNum = Number(winner);
      
      // Always update cache fields
      market.phase = phaseNum;
      market.status = status;
      market.poolA = poolA.toString();
      market.poolB = poolB.toString();
      market.winner = winnerNum > 0 ? winnerNum : undefined;
      market.lastSyncedAt = new Date();
      await market.save();
      console.log(`    ✅ Synced: Phase=${phaseNum}, Pools A=${poolA}, B=${poolB}, Winner=${winnerNum || 'none'}`);
    } catch (error: any) {
      // Check for "missing revert data" or CALL_EXCEPTION - means contract doesn't exist or is invalid
      if (error.code === 'CALL_EXCEPTION' || error.message?.includes('missing revert data')) {
        console.warn(`    ⚠️  Invalid contract at ${market.marketAddress} - skipping`);
        continue;
      }
      console.error(`    ❌ Failed to sync ${market.marketAddress}:`, error.message || error);
    }
  }
}

