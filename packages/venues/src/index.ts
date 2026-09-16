/**
 * @floatrouter/venues — generic venue adapters for the FLOAT liquidity agent.
 *
 * First implementation: Uniswap V3 LP (offline quote + pessimistic simulate).
 * ACTFUN graduated public pools are a pool SOURCE consumed through the V3
 * adapter after verification — never a shortcut around eligibility.
 * Phase 2 (swap / broader Arc DeFi) adds a swap-router adapter behind the
 * same interface; SWAP is already typed but unsupported by the V3 adapter.
 */

export * from './types.ts';
export * from './math.ts';
export * from './eligibility.ts';
export * from './adapter.ts';
export * from './uniswapV3.ts';
export * from './actfun.ts';
