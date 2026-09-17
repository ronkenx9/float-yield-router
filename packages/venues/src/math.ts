/**
 * Deterministic bigint math for venue quotes.
 *
 * No JS float ever holds money. All currency is bigint atomic; bps are
 * integers in [0, 10000]. Division floors so caps never round up past
 * themselves.
 */

export const BPS_DENOMINATOR = 10_000;

/** Uniswap V3 tick bounds (real constants, used for range validation only). */
export const V3_MIN_TICK = -887272;
export const V3_MAX_TICK = 887272;

export function isValidBps(bps: number): boolean {
  return Number.isInteger(bps) && bps >= 0 && bps <= BPS_DENOMINATOR;
}

export function applyBps(amount: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0) {
    throw new Error(`applyBps: bps must be a non-negative integer, got ${bps}`);
  }
  return (amount * BigInt(bps)) / BigInt(BPS_DENOMINATOR);
}

/**
 * Parse a plain decimal string into atomic bigint for a token with `decimals`.
 * Rejects floats, exponents, and excess precision (silent rounding is a bug).
 */
export function toAtomic(value: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error(`toAtomic: decimals must be an integer in [0, 36], got ${decimals}`);
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`toAtomic: expected a non-empty string, got ${JSON.stringify(value)}`);
  }
  const s = value.trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`toAtomic: not a plain decimal string: ${JSON.stringify(value)}`);
  const [, sign, intPart, fracRaw] = m;
  const frac = fracRaw ?? '';
  if (frac.length > decimals) {
    throw new Error(`toAtomic: ${value} exceeds ${decimals} decimal places`);
  }
  let scale = 1n;
  for (let i = 0; i < decimals; i++) scale *= 10n;
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  const atomic = BigInt(intPart) * scale + BigInt(padded || '0');
  return sign === '-' ? -atomic : atomic;
}

/** Render atomic bigint back to a canonical decimal string (no trailing zeros). */
export function fromAtomic(atomic: bigint, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error(`fromAtomic: decimals must be an integer in [0, 36], got ${decimals}`);
  }
  let scale = 1n;
  for (let i = 0; i < decimals; i++) scale *= 10n;
  const neg = atomic < 0n;
  const abs = neg ? -atomic : atomic;
  const intPart = abs / scale;
  const frac = abs % scale;
  let out = intPart.toString();
  if (frac > 0n) {
    const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
    out += `.${fracStr}`;
  }
  return neg ? `-${out}` : out;
}

export const usdcToAtomic = (v: string): bigint => toAtomic(v, 6);
export const atomicToUsdc = (a: bigint): string => fromAtomic(a, 6);

/**
 * Minimum received after slippage: amount * (10000 - slippageBps) / 10000.
 * Floors; rejects out-of-range slippage.
 */
export function minReceivedAfterSlippage(amountAtomic: bigint, slippageBps: number): bigint {
  if (!isValidBps(slippageBps)) throw new Error(`minReceivedAfterSlippage: bad slippage ${slippageBps}`);
  if (amountAtomic < 0n) throw new Error('minReceivedAfterSlippage: amount must be >= 0');
  return (amountAtomic * BigInt(BPS_DENOMINATOR - slippageBps)) / BigInt(BPS_DENOMINATOR);
}

/**
 * Pessimistic fee estimate: observed fees reduced by a haircut buffer.
 * A haircut of 2000bps (=20%) models fees coming in lighter than observed.
 */
export function pessimisticFeeEstimate(observedFeesAtomic: bigint, haircutBps: number): bigint {
  if (observedFeesAtomic < 0n) throw new Error('pessimisticFeeEstimate: fees must be >= 0');
  if (!isValidBps(haircutBps)) throw new Error(`pessimisticFeeEstimate: bad haircut ${haircutBps}`);
  return (observedFeesAtomic * BigInt(BPS_DENOMINATOR - haircutBps)) / BigInt(BPS_DENOMINATOR);
}

/**
 * Net-of-costs check: pessimisticFees - (gas + swapCost + extraBuffer).
 * Returns the signed net; callers map net <= 0 to HOLD.
 */
export function netAfterCosts(
  pessimisticFeesAtomic: bigint,
  gasAtomic: bigint,
  swapCostAtomic: bigint,
  extraBufferAtomic: bigint = 0n,
): bigint {
  if (gasAtomic < 0n || swapCostAtomic < 0n || extraBufferAtomic < 0n) {
    throw new Error('netAfterCosts: costs must be >= 0');
  }
  return pessimisticFeesAtomic - gasAtomic - swapCostAtomic - extraBufferAtomic;
}

/** True when a tick range spans the full V3 range (ACTFUN graduation style). */
export function isFullV3Range(tickLower: number | null, tickUpper: number | null): boolean {
  return tickLower === V3_MIN_TICK && tickUpper === V3_MAX_TICK;
}

/** Validate a concentrated range against tick spacing (spacing > 0 required). */
export function validateV3Range(tickLower: number, tickUpper: number, tickSpacing: number): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(tickLower) || !Number.isInteger(tickUpper) || !Number.isInteger(tickSpacing)) {
    errors.push('ticks and spacing must be integers');
    return errors;
  }
  if (tickSpacing <= 0) errors.push('tickSpacing must be > 0');
  if (tickLower >= tickUpper) errors.push('tickLower must be < tickUpper');
  if (tickLower < V3_MIN_TICK || tickUpper > V3_MAX_TICK) errors.push('ticks outside V3 bounds');
  if (tickSpacing > 0 && (tickLower % tickSpacing !== 0 || tickUpper % tickSpacing !== 0)) {
    errors.push('ticks must align to tickSpacing');
  }
  return errors;
}
