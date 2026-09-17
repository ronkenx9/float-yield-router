import type { PoolInfo, PoolSnapshot, QuoteRequest } from '../src/index.ts';
import { usdcToAtomic } from '../src/index.ts';

export const CHAIN = 5042002;
export const USDC = '0x3600000000000000000000000000000000000000';
export const TOKEN = '0x0000000000000000000000000000000000000001';
export const POOL = '0x00000000000000000000000000000000000000aa';
export const NPM = '0x00000000000000000000000000000000000000bb';
export const SEL_MINT = '0x88316456';

export function v3Pool(overrides: Partial<PoolInfo> = {}): PoolInfo {
  const base: PoolInfo = {
    poolAddress: POOL,
    venueKind: 'uniswap-v3',
    chainId: CHAIN,
    token0: { address: USDC, symbol: 'USDC', decimals: 6, isFeeOnTransfer: false, isRebasing: false },
    token1: { address: TOKEN, symbol: 'TKN', decimals: 18, isFeeOnTransfer: false, isRebasing: false },
    feeBps: 30,
    isFullRange: true,
    isCreatorLocked: false,
    allowsPublicMint: true,
    tickLower: -887272,
    tickUpper: 887272,
  };
  return { ...base, ...overrides };
}

export function snapshot(overrides: Partial<PoolSnapshot> = {}): PoolSnapshot {
  const base: PoolSnapshot = {
    pool: POOL,
    venueKind: 'uniswap-v3',
    chainId: CHAIN,
    blockNumber: 1_000,
    timestampSeconds: 1_700_000_000,
    liquidityAtomic: 1_000_000_000n,
    reserve0Atomic: 500_000_000n,
    reserve1Atomic: 500_000_000n,
    volumeWindowUsdcAtomic: usdcToAtomic('10000'),
    feesWindowUsdcAtomic: usdcToAtomic('30'),
    sampleWindowSeconds: 14 * 24 * 3600,
    dataAgeSeconds: 10,
  };
  return { ...base, ...overrides };
}

export function quoteReq(overrides: Partial<QuoteRequest> = {}): QuoteRequest {
  const base: QuoteRequest = {
    action: 'ENTER',
    pool: v3Pool(),
    amountUsdcAtomic: usdcToAtomic('40'),
    slippageBps: 30,
    priceImpactBps: 50,
    gasUsdcAtomic: usdcToAtomic('0.5'),
    swapCostUsdcAtomic: usdcToAtomic('0.2'),
    quoteAgeSeconds: 5,
    dataAgeSeconds: 10,
    expiresAtSeconds: 1_700_000_100,
    nowSeconds: 1_700_000_000,
  };
  return { ...base, ...overrides };
}
