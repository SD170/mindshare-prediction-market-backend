import mongoose, { Schema, Document, Model } from 'mongoose';

export interface LeaderboardEntryAttrs {
  date: Date;
  index: number;
  name: string;
  rank: number;
  score: number;
  logo: string;
}

export interface LeaderboardEntryDoc extends LeaderboardEntryAttrs, Document {}

const LeaderboardEntrySchema = new Schema<LeaderboardEntryDoc>(
  {
    date: { type: Date, required: true, index: true },
    index: { type: Number, required: true, default: 0 },
    name: { type: String, required: true },
    rank: { type: Number, required: true },
    score: { type: Number, required: true },
    logo: { type: String, required: true },
  },
  { timestamps: true }
);

// Compound index for efficient queries: date + index
LeaderboardEntrySchema.index({ date: 1, index: -1 });

export interface MarketAttrs {
  type: 'top10' | 'h2h';
  projectName?: string;
  projectA?: string;
  projectB?: string;
  lockTime: number;
  resolveTime: number;
  questionHash: string;
  marketId: string;
  marketAddress: string;
  phase?: number;
  status?: string;
  winner?: number;
  lastTxHash?: string;
  deploymentDate?: Date;
  deploymentIndex?: number;
  // Cache fields
  poolA?: string; // BigInt as string for precision
  poolB?: string;
  lastSyncedAt?: Date;
}

export interface MarketDoc extends MarketAttrs, Document {}

const MarketSchema = new Schema<MarketDoc>(
  {
    type: { type: String, enum: ['top10', 'h2h'], required: true },
    projectName: String,
    projectA: String,
    projectB: String,
    lockTime: { type: Number, required: true },
    resolveTime: { type: Number, required: true },
    questionHash: { type: String, required: true },
    marketId: { type: String, required: true },
    marketAddress: { type: String, required: true, unique: true },
    phase: { type: Number, default: 0 },
    status: { type: String, default: 'trading' },
    winner: Number,
    lastTxHash: String,
    deploymentDate: { type: Date, index: true },
    deploymentIndex: { type: Number, index: true },
    // Cache fields
    poolA: String,
    poolB: String,
    lastSyncedAt: Date,
  },
  { timestamps: true }
);

// Compound index for finding latest deployment
MarketSchema.index({ deploymentDate: -1, deploymentIndex: -1 });

export const LeaderboardEntry: Model<LeaderboardEntryDoc> = mongoose.model(
  'LeaderboardEntry',
  LeaderboardEntrySchema
);

export const Market: Model<MarketDoc> = mongoose.model('Market', MarketSchema);

export interface ContractAttrs {
  type: string;
  address: string;
  metadata?: Record<string, unknown>;
}

export interface ContractDoc extends ContractAttrs, Document {}

const ContractSchema = new Schema<ContractDoc>(
  {
    type: { type: String, required: true, unique: true },
    address: { type: String, required: true },
    metadata: Schema.Types.Mixed,
  },
  { timestamps: true }
);

export const Contract: Model<ContractDoc> = mongoose.model('Contract', ContractSchema);

// User Investment Cache
export interface UserInvestmentAttrs {
  marketAddress: string;
  userAddress: string;
  aClaims: string; // BigInt as string
  bClaims: string;
  redeemed: boolean;
  lastSyncedAt: Date;
}

export interface UserInvestmentDoc extends UserInvestmentAttrs, Document {}

const UserInvestmentSchema = new Schema<UserInvestmentDoc>(
  {
    marketAddress: { type: String, required: true, index: true },
    userAddress: { type: String, required: true, index: true },
    aClaims: { type: String, required: true, default: '0' },
    bClaims: { type: String, required: true, default: '0' },
    redeemed: { type: Boolean, required: true, default: false },
    lastSyncedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

// Compound index for efficient lookups
UserInvestmentSchema.index({ marketAddress: 1, userAddress: 1 }, { unique: true });

export const UserInvestment: Model<UserInvestmentDoc> = mongoose.model(
  'UserInvestment',
  UserInvestmentSchema
);

// User Balance Cache
export interface UserBalanceAttrs {
  userAddress: string;
  balance: string; // BigInt as string
  lastSyncedAt: Date;
}

export interface UserBalanceDoc extends UserBalanceAttrs, Document {}

const UserBalanceSchema = new Schema<UserBalanceDoc>(
  {
    userAddress: { type: String, required: true, unique: true, index: true },
    balance: { type: String, required: true, default: '0' },
    lastSyncedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

export const UserBalance: Model<UserBalanceDoc> = mongoose.model(
  'UserBalance',
  UserBalanceSchema
);

export async function connectToDatabase(uri: string) {
  await mongoose.connect(uri, {
    dbName: process.env.MONGO_DB || 'mindshare',
  });
  console.log('Connected to MongoDB');
}

// Full 80-project leaderboard
const FULL_LEADERBOARD: Array<{ name: string; rank: number; score: number; logo: string }> = [
  {"name": "Ethereum", "rank": 1, "score": 9500, "logo": "https://assets.coingecko.com/coins/images/279/small/ethereum.png"},
  {"name": "Bitcoin", "rank": 2, "score": 9200, "logo": "https://assets.coingecko.com/coins/images/1/small/bitcoin.png"},
  {"name": "Uniswap", "rank": 3, "score": 8800, "logo": "https://assets.coingecko.com/coins/images/12504/small/uniswap-uni.png"},
  {"name": "Aave", "rank": 4, "score": 8500, "logo": "https://assets.coingecko.com/coins/images/12645/small/aave.png"},
  {"name": "Chainlink", "rank": 5, "score": 8200, "logo": "https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png"},
  {"name": "Polygon", "rank": 6, "score": 8000, "logo": "https://assets.coingecko.com/coins/images/4713/small/polygon.png"},
  {"name": "Arbitrum", "rank": 7, "score": 7800, "logo": "https://assets.coingecko.com/coins/images/16547/small/arbitrum.png"},
  {"name": "Optimism", "rank": 8, "score": 7600, "logo": "https://assets.coingecko.com/coins/images/25244/small/Optimism.png"},
  {"name": "Base", "rank": 9, "score": 7400, "logo": "https://assets.coingecko.com/coins/images/27508/small/base.png"},
  {"name": "Solana", "rank": 10, "score": 7200, "logo": "https://assets.coingecko.com/coins/images/4128/small/solana.png"},
  {"name": "MakerDAO", "rank": 11, "score": 7000, "logo": "https://assets.coingecko.com/coins/images/1364/small/maker.png"},
  {"name": "Compound", "rank": 12, "score": 6800, "logo": "https://assets.coingecko.com/coins/images/10775/small/compound.png"},
  {"name": "Curve", "rank": 13, "score": 6600, "logo": "https://assets.coingecko.com/coins/images/12124/small/curve.png"},
  {"name": "Lido", "rank": 14, "score": 6400, "logo": "https://assets.coingecko.com/coins/images/13573/small/lido.png"},
  {"name": "Rocket Pool", "rank": 15, "score": 6200, "logo": "https://assets.coingecko.com/coins/images/20764/small/rocket_pool.png"},
  {"name": "Frax", "rank": 16, "score": 6000, "logo": "https://assets.coingecko.com/coins/images/13422/small/frax.png"},
  {"name": "Synthetix", "rank": 17, "score": 5800, "logo": "https://assets.coingecko.com/coins/images/3406/small/synthetix.png"},
  {"name": "1inch", "rank": 18, "score": 5600, "logo": "https://assets.coingecko.com/coins/images/13469/small/1inch.png"},
  {"name": "Yearn Finance", "rank": 19, "score": 5400, "logo": "https://assets.coingecko.com/coins/images/11849/small/yfi-192x192.png"},
  {"name": "Balancer", "rank": 20, "score": 5200, "logo": "https://assets.coingecko.com/coins/images/11683/small/balancer.png"},
  {"name": "SushiSwap", "rank": 21, "score": 5000, "logo": "https://assets.coingecko.com/coins/images/12271/small/sushiswap.png"},
  {"name": "PancakeSwap", "rank": 22, "score": 4800, "logo": "https://assets.coingecko.com/coins/images/12632/small/pancakeswap.png"},
  {"name": "Avalanche", "rank": 23, "score": 4600, "logo": "https://assets.coingecko.com/coins/images/12559/small/avalanche.png"},
  {"name": "Cosmos", "rank": 24, "score": 4400, "logo": "https://assets.coingecko.com/coins/images/1481/small/cosmos.png"},
  {"name": "Polkadot", "rank": 25, "score": 4200, "logo": "https://assets.coingecko.com/coins/images/12171/small/polkadot.png"},
  {"name": "Cardano", "rank": 26, "score": 4000, "logo": "https://assets.coingecko.com/coins/images/975/small/cardano.png"},
  {"name": "Near Protocol", "rank": 27, "score": 3800, "logo": "https://assets.coingecko.com/coins/images/10365/small/near.png"},
  {"name": "Aptos", "rank": 28, "score": 3600, "logo": "https://assets.coingecko.com/coins/images/26455/small/aptos.png"},
  {"name": "Sui", "rank": 29, "score": 3400, "logo": "https://assets.coingecko.com/coins/images/26375/small/sui.png"},
  {"name": "Celestia", "rank": 30, "score": 3200, "logo": "https://assets.coingecko.com/coins/images/31967/small/celestia.png"},
  {"name": "Starknet", "rank": 31, "score": 3000, "logo": "https://assets.coingecko.com/coins/images/26433/small/starknet.png"},
  {"name": "zkSync", "rank": 32, "score": 2800, "logo": "https://assets.coingecko.com/coins/images/25725/small/zksync.png"},
  {"name": "Scroll", "rank": 33, "score": 2600, "logo": "https://assets.coingecko.com/coins/images/31099/small/scroll.png"},
  {"name": "Linea", "rank": 34, "score": 2400, "logo": "https://assets.coingecko.com/coins/images/31098/small/linea.png"},
  {"name": "Mantle", "rank": 35, "score": 2200, "logo": "https://assets.coingecko.com/coins/images/30980/small/mantle.png"},
  {"name": "Blast", "rank": 36, "score": 2000, "logo": "https://assets.coingecko.com/coins/images/34115/small/blast.png"},
  {"name": "Metis", "rank": 37, "score": 1800, "logo": "https://assets.coingecko.com/coins/images/15595/small/metis.png"},
  {"name": "Gnosis Chain", "rank": 38, "score": 1600, "logo": "https://assets.coingecko.com/coins/images/11062/small/gnosis.png"},
  {"name": "Celo", "rank": 39, "score": 1400, "logo": "https://assets.coingecko.com/coins/images/11090/small/celo.png"},
  {"name": "Moonbeam", "rank": 40, "score": 1200, "logo": "https://assets.coingecko.com/coins/images/22459/small/moonbeam.png"},
  {"name": "Moonriver", "rank": 41, "score": 1100, "logo": "https://assets.coingecko.com/coins/images/17984/small/moonriver.png"},
  {"name": "Fantom", "rank": 42, "score": 1000, "logo": "https://assets.coingecko.com/coins/images/4001/small/fantom.png"},
  {"name": "Harmony", "rank": 43, "score": 950, "logo": "https://assets.coingecko.com/coins/images/4344/small/harmony.png"},
  {"name": "Cronos", "rank": 44, "score": 900, "logo": "https://assets.coingecko.com/coins/images/7310/small/cronos.png"},
  {"name": "BSC", "rank": 45, "score": 850, "logo": "https://assets.coingecko.com/coins/images/825/small/bnb.png"},
  {"name": "Immutable X", "rank": 46, "score": 800, "logo": "https://assets.coingecko.com/coins/images/17233/small/immutable-x.png"},
  {"name": "Loopring", "rank": 47, "score": 750, "logo": "https://assets.coingecko.com/coins/images/9138/small/loopring.png"},
  {"name": "Polygon zkEVM", "rank": 48, "score": 700, "logo": "https://assets.coingecko.com/coins/images/27423/small/polygon-zkevm.png"},
  {"name": "Manta Network", "rank": 49, "score": 650, "logo": "https://assets.coingecko.com/coins/images/34212/small/manta.png"},
  {"name": "Mode", "rank": 50, "score": 600, "logo": "https://assets.coingecko.com/coins/images/34519/small/mode.png"},
  {"name": "EigenLayer", "rank": 51, "score": 550, "logo": "https://assets.coingecko.com/coins/images/32365/small/eigenlayer.png"},
  {"name": "Renzo", "rank": 52, "score": 500, "logo": "https://assets.coingecko.com/coins/images/34056/small/renzo.png"},
  {"name": "Puffer Finance", "rank": 53, "score": 480, "logo": "https://assets.coingecko.com/coins/images/34057/small/puffer.png"},
  {"name": "Kelp DAO", "rank": 54, "score": 460, "logo": "https://assets.coingecko.com/coins/images/34058/small/kelp.png"},
  {"name": "Ether.fi", "rank": 55, "score": 440, "logo": "https://assets.coingecko.com/coins/images/33019/small/etherfi.png"},
  {"name": "Swell", "rank": 56, "score": 420, "logo": "https://assets.coingecko.com/coins/images/33914/small/swell.png"},
  {"name": "Morpho", "rank": 57, "score": 400, "logo": "https://assets.coingecko.com/coins/images/28420/small/morpho.png"},
  {"name": "Spark Protocol", "rank": 58, "score": 380, "logo": "https://assets.coingecko.com/coins/images/32033/small/spark.png"},
  {"name": "GMX", "rank": 59, "score": 360, "logo": "https://assets.coingecko.com/coins/images/18323/small/gmx.png"},
  {"name": "dYdX", "rank": 60, "score": 340, "logo": "https://assets.coingecko.com/coins/images/17500/small/dydx.png"},
  {"name": "Perpetual Protocol", "rank": 61, "score": 320, "logo": "https://assets.coingecko.com/coins/images/12331/small/perpetual.png"},
  {"name": "Gains Network", "rank": 62, "score": 300, "logo": "https://assets.coingecko.com/coins/images/19737/small/gains.png"},
  {"name": "Radiant Capital", "rank": 63, "score": 280, "logo": "https://assets.coingecko.com/coins/images/26536/small/radiant.png"},
  {"name": "Venus Protocol", "rank": 64, "score": 260, "logo": "https://assets.coingecko.com/coins/images/12677/small/venus.png"},
  {"name": "JustLend", "rank": 65, "score": 240, "logo": "https://assets.coingecko.com/coins/images/13120/small/justlend.png"},
  {"name": "Benqi", "rank": 66, "score": 220, "logo": "https://assets.coingecko.com/coins/images/23657/small/benqi.png"},
  {"name": "Trader Joe", "rank": 67, "score": 200, "logo": "https://assets.coingecko.com/coins/images/17527/small/traderjoe.png"},
  {"name": "Raydium", "rank": 68, "score": 180, "logo": "https://assets.coingecko.com/coins/images/13928/small/raydium.png"},
  {"name": "Orca", "rank": 69, "score": 160, "logo": "https://assets.coingecko.com/coins/images/20603/small/orca.png"},
  {"name": "Jupiter", "rank": 70, "score": 140, "logo": "https://assets.coingecko.com/coins/images/34188/small/jupiter.png"},
  {"name": "Meteora", "rank": 71, "score": 120, "logo": "https://assets.coingecko.com/coins/images/33915/small/meteora.png"},
  {"name": "Drift Protocol", "rank": 72, "score": 100, "logo": "https://assets.coingecko.com/coins/images/33916/small/drift.png"},
  {"name": "MarginFi", "rank": 73, "score": 90, "logo": "https://assets.coingecko.com/coins/images/33917/small/marginfi.png"},
  {"name": "Kamino Finance", "rank": 74, "score": 80, "logo": "https://assets.coingecko.com/coins/images/33918/small/kamino.png"},
  {"name": "Tensor", "rank": 75, "score": 70, "logo": "https://assets.coingecko.com/coins/images/33919/small/tensor.png"},
  {"name": "Magic Eden", "rank": 76, "score": 60, "logo": "https://assets.coingecko.com/coins/images/22331/small/magic-eden.png"},
  {"name": "OpenSea", "rank": 77, "score": 50, "logo": "https://assets.coingecko.com/coins/images/26349/small/opensea.png"},
  {"name": "Blur", "rank": 78, "score": 40, "logo": "https://assets.coingecko.com/coins/images/28423/small/blur.png"},
  {"name": "LooksRare", "rank": 79, "score": 30, "logo": "https://assets.coingecko.com/coins/images/22188/small/looksrare.png"},
  {"name": "Foundation", "rank": 80, "score": 20, "logo": "https://assets.coingecko.com/coins/images/26350/small/foundation.png"}
];

function getDateOnly(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

const DEFAULT_MARKETS: MarketAttrs[] = [
  {
    type: 'top10',
    projectName: 'Ethereum',
    lockTime: 1763621282,
    resolveTime: 1763622182,
    questionHash: '0x97df221ebe9ad9623b2240f618c0338e5df72ee22d6179885f9c72cc899788f9',
    marketId: '0x245acae687e4eed498b715baabcca3fd859af0398a4fcfa394acb5c5e5317692',
    marketAddress: '0x59bB76926893e45379c62F296E061750c98b6e9d',
  },
  {
    type: 'top10',
    projectName: 'Uniswap',
    lockTime: 1763621282,
    resolveTime: 1763622182,
    questionHash: '0x3d0b8d89f5621a05faef58eb6a666fbf9f260432cc27898bf375b282b0aac969',
    marketId: '0x0c1610d6e50ad1d9ae9699ecc1126b1bd7ceee4fd640bfd5d44ce5155a6c37c2',
    marketAddress: '0xbC603a622e7CE65EAb61b93CBcF31C90F8be4b0F',
  },
  {
    type: 'top10',
    projectName: 'Aave',
    lockTime: 1763621282,
    resolveTime: 1763622182,
    questionHash: '0x95f49a858f1350bac646ff70547b8024163edf4e0bf6598e3d51e045e97c06d0',
    marketId: '0xe02232d6f0835b6be71e01b6f7b9d1869aeb3b68a43315da56feb5a0bc7ded3d',
    marketAddress: '0x153e8B1537AEb69Eb26EaeF70d73e29458537e81',
  },
  {
    type: 'top10',
    projectName: 'Chainlink',
    lockTime: 1763621282,
    resolveTime: 1763622182,
    questionHash: '0x5fe38447833ab492f61436572c813280752fdcb1ab29783b7c5b472bec6b8a1a',
    marketId: '0x01f4af04089bdb6edaf4197abae73fc663aca4f83b7702c870c9c7053d405898',
    marketAddress: '0x91B62DE722f3d05742A2e02A7b221bBf1941475C',
  },
  {
    type: 'top10',
    projectName: 'Polygon',
    lockTime: 1763621282,
    resolveTime: 1763622182,
    questionHash: '0x85675d30bd4da9842bfbc996a929888928db0a7cf15a17ddca441cda5cf3d62f',
    marketId: '0x3fe34e5567f859cc194a0f6d4b62afa8dd2f45b89e07929c9e37beee16a45282',
    marketAddress: '0xd585CA2D97B7f81f42014598AaAB0dCC9e03e4A1',
  },
  {
    type: 'h2h',
    projectA: 'Ethereum',
    projectB: 'Bitcoin',
    lockTime: 1763621282,
    resolveTime: 1763622182,
    questionHash: '0xbdbe23b7bc4d117d3c824e2438ac057324f8dd2a88264d519e292bdcdb01d1a8',
    marketId: '0x0068a52c4abd3d8ab1a3d2e8e80e6361fec192ba3663ce771de0f5d0fc7ebd06',
    marketAddress: '0x29568c02E9a3A56b6fD1325F168883948015D5DB',
  },
  {
    type: 'h2h',
    projectA: 'Uniswap',
    projectB: 'Aave',
    lockTime: 1763621282,
    resolveTime: 1763622182,
    questionHash: '0xa105c1209dcdc0622e38d8ca80e9224fa334650b78bc75d742ce0efe758ef713',
    marketId: '0x5ecf84e8038300ba59aa4417356a6615321861d94eada2db16114a58a2da852c',
    marketAddress: '0xab1643176117BE98D51AaE703E843F88f5e34F90',
  },
  {
    type: 'h2h',
    projectA: 'Arbitrum',
    projectB: 'Optimism',
    lockTime: 1763621282,
    resolveTime: 1763622182,
    questionHash: '0x1c9dd0b22a80f4c8764deb3757dcd2d3c15b526abfcc14f678b321a1930c3650',
    marketId: '0x2f4d124eb6c96f621793bd233e1a6f438e0f169649cf733754e3dad55a314683',
    marketAddress: '0x4eDFB46455E5ae09254B0078944c26b7a799d953',
  },
  {
    type: 'h2h',
    projectA: 'Base',
    projectB: 'Polygon',
    lockTime: 1763621282,
    resolveTime: 1763622182,
    questionHash: '0x631ae58652fd5c1cdd845ecc18416fafd72116c4d30302b5ea8a7751584112ef',
    marketId: '0xd0169735b7df2bf04a6bf4fe6d0b7e191813955c08b7df8a2ec86365db06de4f',
    marketAddress: '0xC87bC001ed535BF118B39dD512b3e6a5e2973717',
  },
  {
    type: 'h2h',
    projectA: 'Solana',
    projectB: 'Avalanche',
    lockTime: 1763621282,
    resolveTime: 1763622182,
    questionHash: '0x2cc99d304b90dee9b45ebf7aeda554e190fee41bf7d7f88885817533b633cd95',
    marketId: '0xfa2c305d3e7bf18ccf2df719ca54a4f77da3d2ef40aa87ea511f23ebf193c1f9',
    marketAddress: '0xdF1ff0b29545435440B7dCAec8eBFc85B5f8d98f',
  },
];

export async function ensureSeedData() {
  const today = getDateOnly(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Check if today's leaderboard exists (any index)
  const todayCount = await LeaderboardEntry.countDocuments({ date: today });
  if (todayCount === 0) {
    const todayEntries: LeaderboardEntryAttrs[] = FULL_LEADERBOARD.map(entry => ({
      ...entry,
      date: today,
      index: 0,
    }));
    await LeaderboardEntry.insertMany(todayEntries);
    console.log(`Seeded leaderboard for ${today.toISOString().split('T')[0]} (index 0, ${todayEntries.length} projects)`);
  }

  // Check if yesterday's leaderboard exists (any index)
  const yesterdayCount = await LeaderboardEntry.countDocuments({ date: yesterday });
  if (yesterdayCount === 0) {
    // Create a slightly different order for yesterday (shuffle top 10)
    const yesterdayEntries: LeaderboardEntryAttrs[] = FULL_LEADERBOARD.map((entry, idx) => {
      // Swap positions 1-2 for variety
      let rank = entry.rank;
      if (rank === 1) rank = 2;
      else if (rank === 2) rank = 1;
      return {
        ...entry,
        rank,
        date: yesterday,
        index: 0,
      };
    });
    await LeaderboardEntry.insertMany(yesterdayEntries);
    console.log(`Seeded leaderboard for ${yesterday.toISOString().split('T')[0]} (index 0, ${yesterdayEntries.length} projects)`);
  }

  // Don't seed default markets - they'll be imported via deployment script
  // This prevents showing old market addresses with existing deposits
}

