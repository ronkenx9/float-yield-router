/**
 * Cash-flow ledger + valuation + benchmark P&L (PLAN.md §7).
 *
 * Pure, deterministic, dependency-free. Canonical balances are computed here,
 * never by an LLM. Money is bigint atomic (USDC 6dp); no JS float holds money.
 *
 * Economic net P&L over a window:
 *   endingValue + externalWithdrawals − externalDeposits − startingValue
 * Gas / swap / service charges already reflected in endingValue MUST NOT be
 * subtracted again — they appear in the component breakdown, with
 * separately-paid outside-account charges identified distinctly.
 * Internal swaps, collects, and rebalances are NOT deposits/withdrawals.
 */

export const FLOW_KINDS = [
  'deposit', // external capital in (tracked account receives from owner)
  'withdrawal', // external capital out (to owner)
  'fee_collected', // trading fees moved into the account (internal gain leg)
  'gas', // network cost leg
  'swap_cost', // swap fee / impact cost leg
  'service_fee', // FLOAT subscription leg (inside-account portion)
  'service_fee_outside', // subscription paid outside the tracked account
] as const;
export type FlowKind = (typeof FLOW_KINDS)[number];

/** External kinds enter the net-P&L cash-flow terms; internal kinds do not. */
export const EXTERNAL_IN: readonly FlowKind[] = ['deposit'];
export const EXTERNAL_OUT: readonly FlowKind[] = ['withdrawal'];

export interface CashFlow {
  id: string;
  timestampSeconds: number;
  kind: FlowKind;
  /** Signed? No — always >= 0; direction comes from `kind`. */
  amountUsdcAtomic: bigint;
  txHash?: string;
  note?: string;
}

export interface ValuationInputs {
  timestampSeconds: number;
  /** Marked LP inventory (token amounts × stated prices), USDC atomic. */
  lpInventoryUsdcAtomic: bigint;
  uncollectedFeesUsdcAtomic: bigint;
  idleCashUsdcAtomic: bigint;
  priceSource: string;
  priceFreshnessSeconds: number;
  maxPriceAgeSeconds: number;
  /** True when any required price is unknown. */
  pricesUnknown: boolean;
}

export type ValuationResult =
  | { status: 'ok'; valueUsdcAtomic: bigint; timestampSeconds: number; priceSource: string }
  | { status: 'unavailable'; reason: string; timestampSeconds: number };

export interface PnlInputs {
  startingValueUsdcAtomic: bigint;
  endingValueUsdcAtomic: bigint;
  flows: CashFlow[];
  windowStartSeconds: number;
  windowEndSeconds: number;
}

export interface PnlComponents {
  collectedFeesUsdcAtomic: bigint;
  gasUsdcAtomic: bigint;
  swapCostsUsdcAtomic: bigint;
  serviceFeesInsideUsdcAtomic: bigint;
  serviceFeesOutsideUsdcAtomic: bigint;
}

export interface PerformanceReport {
  windowStartSeconds: number;
  windowEndSeconds: number;
  startingValueUsdcAtomic: bigint;
  endingValueUsdcAtomic: bigint;
  depositsUsdcAtomic: bigint;
  withdrawalsUsdcAtomic: bigint;
  netResultUsdcAtomic: bigint;
  components: PnlComponents;
  /** Value of the matched-hold benchmark at window end (same entry mix + dated flows). */
  holdBenchmarkEndUsdcAtomic: bigint;
  holdBenchmarkPnlUsdcAtomic: bigint;
  /** Plain USDC-cash comparison (distinct from the hold benchmark). */
  usdcCashEndUsdcAtomic: bigint;
}

function sumKind(flows: CashFlow[], kinds: readonly FlowKind[]): bigint {
  let total = 0n;
  for (const f of flows) {
    if ((kinds as readonly string[]).includes(f.kind)) {
      if (f.amountUsdcAtomic < 0n) throw new Error(`sumKind: negative amount in flow ${f.id}`);
      total += f.amountUsdcAtomic;
    }
  }
  return total;
}

/** Flows must sit inside the window and carry non-negative amounts. */
export function validateFlows(flows: CashFlow[], windowStart: number, windowEnd: number): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const f of flows) {
    if (seen.has(f.id)) errors.push(`duplicate flow id ${f.id}`);
    seen.add(f.id);
    if (f.amountUsdcAtomic < 0n) errors.push(`negative amount ${f.id}`);
    if (!Number.isInteger(f.timestampSeconds)) errors.push(`bad timestamp ${f.id}`);
    if (f.timestampSeconds < windowStart || f.timestampSeconds > windowEnd) {
      errors.push(`flow ${f.id} outside window`);
    }
    if (!(FLOW_KINDS as readonly string[]).includes(f.kind)) errors.push(`unknown kind ${f.id}`);
  }
  return errors;
}

/**
 * Mark a portfolio at a timestamp. Unknown/stale prices produce
 * "valuation unavailable" — never zero or fabricated gains. Avoids adding
 * fees twice: callers pass inventory EXCLUSIVE of uncollected fees, or pass
 * inventory-inclusive with uncollected = 0n (documented at the call site).
 */
export function markPortfolio(v: ValuationInputs): ValuationResult {
  if (v.pricesUnknown) {
    return { status: 'unavailable', reason: 'unknown prices: valuation unavailable', timestampSeconds: v.timestampSeconds };
  }
  if (v.priceFreshnessSeconds < 0 || v.priceFreshnessSeconds > v.maxPriceAgeSeconds) {
    return { status: 'unavailable', reason: 'stale prices: valuation unavailable', timestampSeconds: v.timestampSeconds };
  }
  if (v.lpInventoryUsdcAtomic < 0n || v.uncollectedFeesUsdcAtomic < 0n || v.idleCashUsdcAtomic < 0n) {
    throw new Error('markPortfolio: amounts must be >= 0');
  }
  return {
    status: 'ok',
    valueUsdcAtomic: v.lpInventoryUsdcAtomic + v.uncollectedFeesUsdcAtomic + v.idleCashUsdcAtomic,
    timestampSeconds: v.timestampSeconds,
    priceSource: v.priceSource,
  };
}

/** Core P&L identity: ending + withdrawals − deposits − starting. */
export function computeNetPnl(p: PnlInputs): bigint {
  const errors = validateFlows(p.flows, p.windowStartSeconds, p.windowEndSeconds);
  if (errors.length > 0) throw new Error(`computeNetPnl: ${errors.join('; ')}`);
  const deposits = sumKind(p.flows, EXTERNAL_IN);
  const withdrawals = sumKind(p.flows, EXTERNAL_OUT);
  return p.endingValueUsdcAtomic + withdrawals - deposits - p.startingValueUsdcAtomic;
}

export function componentBreakdown(flows: CashFlow[]): PnlComponents {
  return {
    collectedFeesUsdcAtomic: sumKind(flows, ['fee_collected']),
    gasUsdcAtomic: sumKind(flows, ['gas']),
    swapCostsUsdcAtomic: sumKind(flows, ['swap_cost']),
    serviceFeesInsideUsdcAtomic: sumKind(flows, ['service_fee']),
    serviceFeesOutsideUsdcAtomic: sumKind(flows, ['service_fee_outside']),
  };
}

/**
 * Full performance report with matched-hold benchmark.
 * `holdEnd` must be computed from the SAME entry mix + dated external flows
 * at hold prices (caller-supplied; this function never invents prices).
 * `usdcCashEnd` is the distinct plain-cash comparison.
 */
export function buildReport(
  p: PnlInputs,
  opts: { holdBenchmarkEndUsdcAtomic: bigint; usdcCashEndUsdcAtomic: bigint },
): PerformanceReport {
  const deposits = sumKind(p.flows, EXTERNAL_IN);
  const withdrawals = sumKind(p.flows, EXTERNAL_OUT);
  const net = computeNetPnl(p);
  const holdPnl =
    opts.holdBenchmarkEndUsdcAtomic + withdrawals - deposits - p.startingValueUsdcAtomic;
  return {
    windowStartSeconds: p.windowStartSeconds,
    windowEndSeconds: p.windowEndSeconds,
    startingValueUsdcAtomic: p.startingValueUsdcAtomic,
    endingValueUsdcAtomic: p.endingValueUsdcAtomic,
    depositsUsdcAtomic: deposits,
    withdrawalsUsdcAtomic: withdrawals,
    netResultUsdcAtomic: net,
    components: componentBreakdown(p.flows),
    holdBenchmarkEndUsdcAtomic: opts.holdBenchmarkEndUsdcAtomic,
    holdBenchmarkPnlUsdcAtomic: holdPnl,
    usdcCashEndUsdcAtomic: opts.usdcCashEndUsdcAtomic,
  };
}
