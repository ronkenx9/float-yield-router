/**
 * Arc chain configuration for the FLOAT liquidity agent.
 *
 * IMPORTANT (per docs/float-agent/PLAN.md §6):
 *  - Testnet values below are verified from the project reference and are safe
 *    for local/testnet development.
 *  - MAINNET values are intentionally NOT hardcoded. Arc mainnet integration is
 *    a later verification gate: official chainId, RPC, verified contract
 *    addresses and bytecode must be confirmed before any execution code uses
 *    them. Never copy a third-party RPC or assumed chain id into execution.
 *  - This module is CONFIG only. It carries no signing keys and performs no I/O.
 */

export const USDC_DECIMALS = 6;

/** A chain FLOAT can be configured against. `verified` gates execution. */
export interface ArcChain {
  readonly name: string;
  readonly chainId: number;
  readonly rpc: string | null;
  readonly explorer: string | null;
  /** ERC-20 view of USDC (6 decimals). Native gas on Arc is also USDC. */
  readonly usdcAddress: string | null;
  /** True only when network + contracts have passed the readiness gate. */
  readonly verified: boolean;
}

export const ARC_TESTNET: ArcChain = {
  name: 'Arc Testnet',
  chainId: 5042002,
  rpc: 'https://rpc.testnet.arc.network',
  explorer: 'https://testnet.arcscan.app',
  usdcAddress: '0x3600000000000000000000000000000000000000',
  verified: true,
};

/**
 * Placeholder. DO NOT populate with guessed values. Fill only after the Arc
 * readiness gate (official chainId, RPC, USDC address + bytecode) is passed.
 */
export const ARC_MAINNET: ArcChain = {
  name: 'Arc Mainnet',
  chainId: 0,
  rpc: null,
  explorer: null,
  usdcAddress: null,
  verified: false,
};

/** Default chain for development and fixtures. */
export const DEFAULT_CHAIN = ARC_TESTNET;

/** Known Arc chain ids, for policy chain-id sanity checks. */
export const KNOWN_ARC_CHAIN_IDS: readonly number[] = [ARC_TESTNET.chainId];

export function isKnownArcChainId(chainId: number): boolean {
  return KNOWN_ARC_CHAIN_IDS.includes(chainId);
}
