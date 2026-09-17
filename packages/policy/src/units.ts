/**
 * Money and basis-point math for FLOAT.
 *
 * Rule (PLAN.md §4): store integers / decimal strings, never JS floating-point
 * currency. In memory we use bigint atomic units (USDC has 6 decimals); on the
 * wire we serialize to decimal strings. No `number` ever holds a currency value.
 */

import { USDC_DECIMALS } from './arc.ts';

export const BPS_DENOMINATOR = 10_000; // 100.00%
const TEN = 10n;

function pow10(n: number): bigint {
  let r = 1n;
  for (let i = 0; i < n; i++) r *= TEN;
  return r;
}

const USDC_SCALE = pow10(USDC_DECIMALS);

/**
 * Parse a decimal USDC string ("12.5", "0", "1000000") into atomic bigint.
 * Rejects floats, exponents, and more than USDC_DECIMALS fractional digits
 * (silent rounding of money is a bug, not a convenience).
 */
export function usdcToAtomic(value: string): bigint {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`usdcToAtomic: expected a non-empty string, got ${JSON.stringify(value)}`);
  }
  const s = value.trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`usdcToAtomic: not a plain decimal string: ${JSON.stringify(value)}`);
  const [, sign, intPart, fracPartRaw] = m;
  const fracPart = fracPartRaw ?? '';
  if (fracPart.length > USDC_DECIMALS) {
    throw new Error(
      `usdcToAtomic: ${value} has more than ${USDC_DECIMALS} decimal places (would lose precision)`,
    );
  }
  const padded = (fracPart + '0'.repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS);
  const atomic = BigInt(intPart) * USDC_SCALE + BigInt(padded || '0');
  return sign === '-' ? -atomic : atomic;
}

/** Render atomic USDC bigint back to a canonical decimal string (no trailing zeros). */
export function atomicToUsdc(atomic: bigint): string {
  const neg = atomic < 0n;
  const abs = neg ? -atomic : atomic;
  const intPart = abs / USDC_SCALE;
  const frac = abs % USDC_SCALE;
  let out = intPart.toString();
  if (frac > 0n) {
    const fracStr = frac.toString().padStart(USDC_DECIMALS, '0').replace(/0+$/, '');
    out += `.${fracStr}`;
  }
  return neg ? `-${out}` : out;
}

/**
 * amount * bps / 10000, using floor division (a cap must never round UP past
 * itself). Both operands are integers, so the result is exact-then-floored.
 */
export function applyBps(amount: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0) {
    throw new Error(`applyBps: bps must be a non-negative integer, got ${bps}`);
  }
  return (amount * BigInt(bps)) / BigInt(BPS_DENOMINATOR);
}

/** True when `bps` is a valid basis-point value in [0, 10000]. */
export function isValidBps(bps: number): boolean {
  return Number.isInteger(bps) && bps >= 0 && bps <= BPS_DENOMINATOR;
}
