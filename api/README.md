# Backend API

Express server with MongoDB for market and leaderboard data.

## Setup

```bash
npm install
```

## Configuration

Create `.env`:
```env
RPC_URL=https://sepolia.base.org
FAUCET_PRIVATE_KEY=0x...
ADMIN_PRIVATE_KEY=0x...
MONGO_URI=mongodb://127.0.0.1:27017/mindshare
PORT=3001
```

## Run

```bash
npm run dev
```

## Endpoints

- `GET /api/leaderboard/today` - Today's leaderboard
- `GET /api/leaderboard/yesterday` - Yesterday's leaderboard
- `GET /api/markets` - List markets
- `GET /api/contracts` - Contract addresses
- `POST /api/contracts` - Update contract addresses
- `POST /api/admin/markets/import` - Import markets
- `POST /api/admin/close-all` - Close all markets
- `POST /api/faucet` - Request tokens

