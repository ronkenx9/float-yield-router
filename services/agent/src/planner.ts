/**
 * Deterministic planner (PLAN.md §5, strategy engine).
 *
 * Pure eligibility → cost → proposal math. HOLD is first-class. Uses a
 * pessimistic fee estimate + cost buffer and never claims expected fees are
 * guaranteed. Policy caps arrive as a plain struct so this module stays
 * dependency-free; the executor re-checks the real policy before submission.
 */

export type PlanAction = 'ENTER' | 'RANGE_CHANGE' | 'COLLECT' | 'EXIT';

export interface PlannerCaps {
  paused: boolean;
  maxPositionUsdcAtomic: bigint;
  maxSlippageBps: number;
  maxPriceImpactBps: number;
  maxGasUsdcAtomic: bigint;
  maxQuoteAgeSeconds: number;
  maxDataAgeSeconds: number;
  allowNewPoolEntry: boolean;
  allowRangeChange: boolean;
  allowFeeCollection: boolean;
  allowExitSwap: boolean;
  isNewPool: (pool: string) => boolean;
}

export interface PlanCandidate {
  pool: string;
  action: PlanAction;
  eligible: boolean;
  amountUsdcAtomic: bigint;
  slippageBps: number;
  priceImpactBps: number;
  gasUsdcAtomic: bigint;
  swapCostUsdcAtomic: bigint;
  quoteAgeSeconds: number;
  dataAgeSeconds: number;
  observedFeesUsdcAtomic: bigint;
  feeHaircutBps: number;
}

export interface Proposal {
  pool: string;
  action: PlanAction;
  amountUsdcAtomic: bigint;
  minReceivedUsdcAtomic: bigint;
  pessimisticFeesUsdcAtomic: bigint;
  netAfterCostsUsdcAtomic: bigint;
  reasons: string[];
}

export interface PlanResult {
  decision: 'HOLD' | 'PROPOSE';
  proposals: Proposal[];
  holdReasons: string[];
}

const BPS = 10_000n;

function actionAllowed(caps: PlannerCaps, action: PlanAction, isNew: boolean): boolean {
  if (action === 'ENTER' && isNew && !caps.allowNewPoolEntry) return false;
  if (action === 'ENTER') return true; // existing-pool entry needs no extra flag in MVP
  if (action === 'RANGE_CHANGE') return caps.allowRangeChange;
  if (action === 'COLLECT') return caps.allowFeeCollection;
  if (action === 'EXIT') return caps.allowExitSwap || true; // plain withdraw always shapable; swap leg gated at quote
  return false;
}

export function plan(candidates: PlanCandidate[], caps: PlannerCaps): PlanResult {
  const holdReasons: string[] = [];
  const proposals: Proposal[] = [];

  if (caps.paused) {
    return { decision: 'HOLD', proposals: [], holdReasons: ['policy is paused; no new actions'] };
  }

  for (const c of candidates) {
    const tag = `${c.action} ${c.pool}`;
    if (!c.eligible) {
      holdReasons.push(`${tag}: pool ineligible — skipped`);
      continue;
    }
    const isNew = caps.isNewPool(c.pool);
    if (!actionAllowed(caps, c.action, isNew)) {
      holdReasons.push(`${tag}: disabled by policy — skipped`);
      continue;
    }
    if (c.quoteAgeSeconds < 0 || c.quoteAgeSeconds > caps.maxQuoteAgeSeconds) {
      holdReasons.push(`${tag}: stale quote — skipped`);
      continue;
    }
    if (c.dataAgeSeconds < 0 || c.dataAgeSeconds > caps.maxDataAgeSeconds) {
      holdReasons.push(`${tag}: stale data — skipped`);
      continue;
    }
    if (c.slippageBps > caps.maxSlippageBps || c.priceImpactBps > caps.maxPriceImpactBps) {
      holdReasons.push(`${tag}: slippage/impact over caps — skipped`);
      continue;
    }
    if (c.gasUsdcAtomic > caps.maxGasUsdcAtomic) {
      holdReasons.push(`${tag}: gas over per-action cap — skipped`);
      continue;
    }
    if (c.amountUsdcAtomic < 0n) {
      holdReasons.push(`${tag}: negative amount — skipped`);
      continue;
    }
    if (c.action === 'ENTER' && c.amountUsdcAtomic > caps.maxPositionUsdcAtomic) {
      holdReasons.push(`${tag}: position size over cap — skipped`);
      continue;
    }
    if (c.action === 'ENTER' && c.amountUsdcAtomic <= 0n) {
      holdReasons.push(`${tag}: ENTER needs amount > 0 — skipped`);
      continue;
    }

    const pessimistic = (c.observedFeesUsdcAtomic * (BPS - BigInt(c.feeHaircutBps))) / BPS;
    const net = pessimistic - c.gasUsdcAtomic - c.swapCostUsdcAtomic;
    if (net <= 0n) {
      holdReasons.push(`${tag}: HOLD — pessimistic fees do not cover costs after buffer`);
      continue;
    }
    const minReceived = (c.amountUsdcAtomic * (BPS - BigInt(c.slippageBps))) / BPS;
    proposals.push({
      pool: c.pool,
      action: c.action,
      amountUsdcAtomic: c.amountUsdcAtomic,
      minReceivedUsdcAtomic: minReceived,
      pessimisticFeesUsdcAtomic: pessimistic,
      netAfterCostsUsdcAtomic: net,
      reasons: [`net ${net} atomic USDC after pessimistic fees and costs (simulation, not a forecast)`],
    });
  }

  proposals.sort((a, b) => (b.netAfterCostsUsdcAtomic > a.netAfterCostsUsdcAtomic ? 1 : b.netAfterCostsUsdcAtomic < a.netAfterCostsUsdcAtomic ? -1 : 0));
  if (proposals.length === 0 && holdReasons.length === 0) holdReasons.push('HOLD — no candidates');
  return { decision: proposals.length > 0 ? 'PROPOSE' : 'HOLD', proposals, holdReasons };
}
