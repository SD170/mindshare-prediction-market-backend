import { ethers } from 'ethers';

export const MARKET_ADMIN_ABI = [
  'function phase() view returns (uint8)',
  'function close() external',
  'function lockTime() view returns (uint64)',
  'function pools() view returns (uint128 A, uint128 B)',
  'function winner() view returns (uint8)',
  'function resolveTime() view returns (uint64)',
  'function a(address) view returns (uint128 aClaims, uint128 bClaims, bool redeemed)',
] as const;

export const STAKE_TOKEN_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function transfer(address to, uint256 amount) external returns (bool)',
] as const;

export function phaseToStatus(phase: number): string {
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

export function getDateOnly(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

