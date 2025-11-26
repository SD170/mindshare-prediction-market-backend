/// <reference types="node" />
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { ethers } from 'ethers';
import { connectToDatabase, ensureSeedData } from './db';
import leaderboardRoutes from './routes/leaderboard';
import marketsRoutes from './routes/markets';
import userRoutes from './routes/user';
import cacheRoutes from './routes/cache';
import contractsRoutes from './routes/contracts';
import faucetRoutes from './routes/faucet';
import adminRoutes from './routes/admin';
import { syncMarketPhases } from './utils/sync';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';
const ENABLE_CACHE = process.env.ENABLE_CACHE === 'true';
const provider = new ethers.JsonRpcProvider(RPC_URL);

// Make provider and config available to routes
app.set('provider', provider);
app.set('ENABLE_CACHE', ENABLE_CACHE);

// Register routes
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/markets', marketsRoutes);
app.use('/api/user', userRoutes);
app.use('/api/cache', cacheRoutes);
app.use('/api/contracts', contractsRoutes);
app.use('/api/faucet', faucetRoutes);
app.use('/api/admin', adminRoutes);

const startServer = async () => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mindshare';
  await connectToDatabase(mongoUri);
  await ensureSeedData();
  await syncMarketPhases(provider);

  app.listen(PORT, () => {
    console.log(`API server running on http://localhost:${PORT}`);
  });
};

startServer().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
