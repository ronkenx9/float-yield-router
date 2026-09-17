/**
 * ACTFUN pool-source notes (reference data, not an integration claim).
 *
 * What was observed on the ACTFUN launch UI (Sept 2026, testnet-era):
 * - Bonding curve → graduates into Uniswap V3 (0.30% full-range) or V4
 *   (native-USDC) pools; LP fees split 70/30 creator/platform.
 * - USDC is the only live pair; other pairs unlock only after verification.
 * - Fallback: if V4 cannot be seeded, liquidity opens on V3; if neither can
 *   be seeded, the graduating trade reverts and the curve keeps trading.
 *
 * What this means for FLOAT:
 * - Bonding-curve buys are NOT LP positions and earn NO LP fees.
 * - Creator-locked graduation LP is NOT a FLOAT pool (fees belong to
 *   creator/platform).
 * - Graduated PUBLIC V3/V4 pools are CANDIDATES for the V3 adapter (or a
 *   future V4 adapter) — subject to verification, 14-day history, and the
 *   standard eligibility screen. V3 and V4 are different implementations.
 */

import type { PoolInfo, VenueKind } from './types.ts';

/** ACTFUN V3 graduation tier: 0.30% = 30 bps full-range pool. */
export const ACTFUN_V3_GRADUATION_FEE_BPS = 30;

/** ACTFUN curve-trade fee split: 70% creator / 30% platform. */
export const ACTFUN_CREATOR_FEE_SPLIT_BPS = 7000;
export const ACTFUN_PLATFORM_FEE_SPLIT_BPS = 3000;

/** USDC (testnet reference observed on ACTFUN UI). Never reuse for mainnet. */
export const ACTFUN_USDC_TESTNET = '0x3600000000000000000000000000000000000000';

export type ActfunPoolClass =
  | 'bonding-curve'
  | 'creator-locked-graduation-lp'
  | 'graduated-public-pool'
  | 'unknown';

export interface ActfunClassification {
  klass: ActfunPoolClass;
  /** True only for graduated PUBLIC pools that may enter eligibility screening. */
  floatCandidate: boolean;
  reasons: string[];
}

/**
 * Classify an ACTFUN-origin pool for FLOAT. Pure.
 *
 * - bonding-curve: never an LP candidate.
 * - creator-locked-graduation-lp: fees go to creator/platform; not FLOAT's.
 * - graduated-public-pool: candidate for screening (not an approval).
 */
export function classifyActfunPool(input: {
  isBondingCurve: boolean;
  isCreatorLocked: boolean;
  allowsPublicMint: boolean;
  venueKind: VenueKind;
}): ActfunClassification {
  if (input.isBondingCurve) {
    return {
      klass: 'bonding-curve',
      floatCandidate: false,
      reasons: ['bonding-curve trades are not LP positions and earn no LP fees'],
    };
  }
  if (input.isCreatorLocked || !input.allowsPublicMint) {
    return {
      klass: 'creator-locked-graduation-lp',
      floatCandidate: false,
      reasons: [
        'locked graduation LP fees split 70/30 creator/platform and do not belong to new FLOAT LPs',
      ],
    };
  }
  if (input.venueKind !== 'uniswap-v3' && input.venueKind !== 'uniswap-v4') {
    return {
      klass: 'unknown',
      floatCandidate: false,
      reasons: [`venue ${input.venueKind} is not an ACTFUN graduation venue`],
    };
  }
  return {
    klass: 'graduated-public-pool',
    floatCandidate: true,
    reasons: [
      'graduated public pool: candidate for eligibility screening, 14-day history, and bytecode verification (not an approval)',
    ],
  };
}

/**
 * Map a graduated ACTFUN pool into a V3 PoolInfo candidate.
 * Returns null for anything that is not a public V3 graduation pool —
 * callers must still run checkPoolCompatible + screenPool.
 */
export function actfunGraduationToV3PoolCandidate(input: {
  poolAddress: string;
  chainId: number;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  usdcAddress?: string;
  feeBps?: number;
  allowsPublicMint: boolean;
  isCreatorLocked: boolean;
}): PoolInfo | null {
  if (input.isCreatorLocked || !input.allowsPublicMint) return null;
  const feeBps = input.feeBps ?? ACTFUN_V3_GRADUATION_FEE_BPS;
  if (feeBps !== ACTFUN_V3_GRADUATION_FEE_BPS) return null;
  const usdc = input.usdcAddress ?? ACTFUN_USDC_TESTNET;
  const token0 =
    usdc.toLowerCase() < input.tokenAddress.toLowerCase()
      ? { address: usdc, symbol: 'USDC', decimals: 6, isFeeOnTransfer: false, isRebasing: false }
      : {
          address: input.tokenAddress,
          symbol: input.tokenSymbol,
          decimals: input.tokenDecimals,
          isFeeOnTransfer: false,
          isRebasing: false,
        };
  const token1 =
    token0.address === usdc
      ? {
          address: input.tokenAddress,
          symbol: input.tokenSymbol,
          decimals: input.tokenDecimals,
          isFeeOnTransfer: false,
          isRebasing: false,
        }
      : { address: usdc, symbol: 'USDC', decimals: 6, isFeeOnTransfer: false, isRebasing: false };
  return {
    poolAddress: input.poolAddress,
    venueKind: 'uniswap-v3',
    chainId: input.chainId,
    token0,
    token1,
    feeBps,
    isFullRange: true,
    isCreatorLocked: false,
    allowsPublicMint: true,
    tickLower: -887272,
    tickUpper: 887272,
  };
}
