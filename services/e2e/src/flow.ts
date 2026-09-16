/**
 * Offline end-to-end orchestration (PLAN.md §5 pipeline, M1–M3 logic).
 *
 *   goal → draft policy → validated policy → indexer snapshot →
 *   eligibility screen → V3 quote + simulate → deterministic plan →
 *   policy checkAction → executor job → receipt → ledger report → explanation
 *
 * Everything is deterministic and offline. Submission is an injected fake;
 * no keys, no RPC, no mainnet. Any stage can end in NEEDS_INPUT / HOLD /
 * BLOCKED — those are first-class, honest outcomes, not errors.
 */

import {
  checkAction,
  compilePermissions,
  validatePolicy,
  usdcToAtomic,
} from '../../../packages/policy/src/index.ts';
import type { Policy } from '../../../packages/policy/src/index.ts';
import {
  UniswapV3Adapter,
  screenPool,
} from '../../../packages/venues/src/index.ts';
import type { PoolEvent } from '../../indexer/src/index.ts';
import {
  buildSnapshot,
  createIndexer,
  ingestEvents,
} from '../../indexer/src/index.ts';
import {
  DRAFT_DEFAULTS,
  explain,
  parseGoal,
  plan,
} from '../../agent/src/index.ts';
import {
  attachApproval,
  bindApproval,
  confirmJob,
  createJob,
  createStore,
  markReconciled,
  markSimulated,
  requestApproval,
  submitJob,
} from '../../executor/src/index.ts';
import type { Submitter } from '../../executor/src/index.ts';
import {
  buildReport,
} from '../../../packages/accounting/src/index.ts';
import type { CashFlow } from '../../../packages/accounting/src/index.ts';

export interface E2EAllowlist {
  usdc: string;
  token: string;
  tokenSymbol: string;
  tokenDecimals: number;
  pool: string;
  npm: string;
  selector: string;
}

export interface E2EInput {
  goalText: string;
  account: string;
  chainId: number;
  allowlist: E2EAllowlist;
  nowSeconds: number;
  /** Historical pool events feeding the indexer (14-day window expected). */
  events: PoolEvent[];
  /** Observed fees over the modeled horizon, USDC atomic. */
  observedFeesUsdcAtomic: bigint;
  feeHaircutBps: number;
  poolAgeSeconds: number | null;
  submitter: Submitter;
  idempotencyKey: string;
}

export type E2EOutcome = 'EXECUTED' | 'HOLD' | 'BLOCKED' | 'NEEDS_INPUT';

export interface E2EResult {
  outcome: E2EOutcome;
  detail: string[];
  policyVersion: number;
  jobState: string | null;
  txHash: string | null;
  netUsdcAtomic: bigint | null;
  explanation: string[];
}

const DAY = 24 * 3600;

function atomicToUsdc(a: bigint): string {
  const neg = a < 0n;
  const abs = neg ? -a : a;
  const intPart = abs / 1_000_000n;
  const frac = abs % 1_000_000n;
  let out = intPart.toString();
  if (frac > 0n) out += `.${frac.toString().padStart(6, '0').replace(/0+$/, '')}`;
  return neg ? `-${out}` : out;
}

export async function runManagedLpOnce(input: E2EInput): Promise<E2EResult> {
  const explanation: string[] = [];
  const detail: string[] = [];

  // ---- 1. goal → draft ----
  const parsed = parseGoal(input.goalText);
  if (parsed.draft.capitalBudgetUsdcAtomic === null) {
    return {
      outcome: 'NEEDS_INPUT',
      detail: parsed.questions,
      policyVersion: 0,
      jobState: null,
      txHash: null,
      netUsdcAtomic: null,
      explanation: explain({
        kind: 'hold', policyVersion: 0, pool: null, action: null,
        amountUsdc: null, pessimisticFeesUsdc: null, costsUsdc: null,
        netUsdc: null, txHash: null,
        holdReason: 'amount unstated — explicit capital required before any policy',
        extra: [],
      }),
    };
  }
  const budget = parsed.draft.capitalBudgetUsdcAtomic;
  // "Avoid newly launched" restricts token eligibility, but an explicit
  // "ask me before entering a new pool" still permits approval-gated
  // proposals (MVP always asks). Only a bare avoid with no ask-first closes
  // new-pool entry.
  const allowNewPoolEntry = parsed.draft.askBeforeNewPool ? true : !parsed.draft.avoidNewPools;
  const defaults = DRAFT_DEFAULTS[parsed.draft.mode];
  const reserveBps = parsed.draft.reserveBps ?? defaults.reserveBps;
  const maxPositionBps = parsed.draft.maxPositionBps ?? defaults.maxPositionBps;
  const reserveAtomic = (budget * BigInt(reserveBps)) / 10_000n;
  const maxPositionAtomic = (budget * BigInt(maxPositionBps)) / 10_000n;

  // ---- 2. draft → validated versioned policy ----
  const policy: Policy = {
    policyId: `e2e-${input.idempotencyKey}`,
    version: 1,
    userId: 'e2e-user',
    chainId: input.chainId,
    effectiveAt: input.nowSeconds,
    expiresAt: input.nowSeconds + 30 * DAY,
    mode: parsed.draft.mode === 'Custom' ? 'Custom' : parsed.draft.mode,
    accountAddress: input.account,
    capitalBudgetUsdcAtomic: budget,
    allowedTokens: [input.allowlist.usdc, input.allowlist.token],
    allowedPools: [input.allowlist.pool],
    allowedContracts: [input.allowlist.npm],
    allowedSelectors: [input.allowlist.selector],
    maxPositionBps,
    maxTokenExposureBps: Math.max(maxPositionBps, 5000),
    minUsdcReserveAtomic: reserveAtomic,
    maxSlippageBps: 50,
    maxPriceImpactBps: 100,
    maxGasPerActionAtomic: usdcToAtomic('1'),
    dailyExecutionBudgetAtomic: usdcToAtomic('5'),
    maxActionsPerDay: 5,
    cooldownSeconds: 300,
    maxQuoteAgeSeconds: 30,
    maxDataAgeSeconds: 60,
    approvalMode: 'per_action',
    allowNewPoolEntry,
    allowRangeChange: true,
    allowFeeCollection: true,
    allowExitSwap: true,
    pauseState: 'active',
    userApprovalDigest: `e2e-approval-${input.idempotencyKey}`,
  };
  // Pool-level cap must not bypass token-level cap (policy invariant).
  if (policy.maxPositionBps > policy.maxTokenExposureBps) {
    policy.maxTokenExposureBps = policy.maxPositionBps;
  }
  const pv = validatePolicy(policy);
  if (!pv.ok) {
    return {
      outcome: 'NEEDS_INPUT',
      detail: pv.violations.map((v) => `${v.code}: ${v.message}`),
      policyVersion: 0,
      jobState: null,
      txHash: null,
      netUsdcAtomic: null,
      explanation: [],
    };
  }
  detail.push(`policy v1 valid (${policy.mode}, budget ${atomicToUsdc(budget)} USDC)`);

  // ---- 3. indexer → snapshot ----
  const indexer = createIndexer();
  ingestEvents(indexer, input.chainId, input.events);
  const snap = buildSnapshot(indexer, input.allowlist.pool, {
    chainId: input.chainId,
    nowSeconds: input.nowSeconds,
    windowSeconds: 14 * DAY,
    maxDataAgeSeconds: 60,
  });
  if (snap.stale) {
    const lines = explain({
      kind: 'hold', policyVersion: 1, pool: input.allowlist.pool, action: 'ENTER',
      amountUsdc: null, pessimisticFeesUsdc: null, costsUsdc: null, netUsdc: null,
      txHash: null, holdReason: 'pool data stale or missing — fails closed, no quote attempted', extra: [],
    });
    return { outcome: 'HOLD', detail: [...detail, 'snapshot stale — HOLD'], policyVersion: 1, jobState: null, txHash: null, netUsdcAtomic: null, explanation: lines };
  }

  // ---- 4. eligibility screen ----
  const poolInfo = {
    poolAddress: input.allowlist.pool,
    venueKind: 'uniswap-v3' as const,
    chainId: input.chainId,
    token0: { address: input.allowlist.usdc, symbol: 'USDC', decimals: 6, isFeeOnTransfer: false, isRebasing: false },
    token1: { address: input.allowlist.token, symbol: input.allowlist.tokenSymbol, decimals: input.allowlist.tokenDecimals, isFeeOnTransfer: false, isRebasing: false },
    feeBps: 30,
    isFullRange: true,
    isCreatorLocked: false,
    allowsPublicMint: true,
    tickLower: -887272,
    tickUpper: 887272,
  };
  const screening = screenPool({
    pool: poolInfo,
    snapshot: {
      pool: snap.pool,
      venueKind: 'uniswap-v3',
      chainId: snap.chainId,
      blockNumber: snap.blockNumber,
      timestampSeconds: snap.timestampSeconds,
      liquidityAtomic: snap.liquidityAtomic,
      reserve0Atomic: snap.liquidityAtomic,
      reserve1Atomic: snap.liquidityAtomic,
      volumeWindowUsdcAtomic: snap.volumeWindowUsdcAtomic,
      feesWindowUsdcAtomic: snap.feesWindowUsdcAtomic,
      sampleWindowSeconds: snap.sampleWindowSeconds,
      dataAgeSeconds: snap.dataAgeSeconds,
    },
    nowSeconds: input.nowSeconds,
    minSampleWindowSeconds: 14 * DAY,
    minVolumeUsdcAtomic: usdcToAtomic('1000'),
    minLiquidityAtomic: 1000n,
    minPoolAgeSeconds: 14 * DAY,
    poolAgeSeconds: input.poolAgeSeconds,
  });
  if (!screening.eligible) {
    const lines = explain({
      kind: 'hold', policyVersion: 1, pool: input.allowlist.pool, action: 'ENTER',
      amountUsdc: null, pessimisticFeesUsdc: null, costsUsdc: null, netUsdc: null,
      txHash: null, holdReason: `pool ineligible: ${screening.reasons.join('; ')}`, extra: [],
    });
    return { outcome: 'HOLD', detail: [...detail, ...screening.reasons], policyVersion: 1, jobState: null, txHash: null, netUsdcAtomic: null, explanation: lines };
  }

  // ---- 5. quote + simulate ----
  const adapter = new UniswapV3Adapter({ chainId: input.chainId });
  let amount = maxPositionAtomic;
  const headroom = budget - reserveAtomic;
  if (amount > headroom) amount = headroom;
  if (amount <= 0n) {
    const lines = explain({
      kind: 'hold', policyVersion: 1, pool: input.allowlist.pool, action: 'ENTER',
      amountUsdc: null, pessimisticFeesUsdc: null, costsUsdc: null, netUsdc: null,
      txHash: null, holdReason: 'reserve plus max position exceeds budget — no affordable size', extra: [],
    });
    return { outcome: 'HOLD', detail: [...detail, 'no affordable size'], policyVersion: 1, jobState: null, txHash: null, netUsdcAtomic: null, explanation: lines };
  }
  const gas = usdcToAtomic('0.5');
  const swapCost = usdcToAtomic('0.2');
  const quote = adapter.quote({
    action: 'ENTER',
    pool: poolInfo,
    amountUsdcAtomic: amount,
    slippageBps: 30,
    priceImpactBps: 50,
    gasUsdcAtomic: gas,
    swapCostUsdcAtomic: swapCost,
    quoteAgeSeconds: 5,
    dataAgeSeconds: snap.dataAgeSeconds,
    expiresAtSeconds: input.nowSeconds + 60,
    nowSeconds: input.nowSeconds,
  });
  const sim = adapter.simulate(quote, { observedFeesUsdcAtomic: input.observedFeesUsdcAtomic, feeHaircutBps: input.feeHaircutBps });

  // ---- 6. deterministic plan ----
  const decision = plan(
    [{
      pool: input.allowlist.pool,
      action: 'ENTER',
      eligible: true,
      amountUsdcAtomic: amount,
      slippageBps: 30,
      priceImpactBps: 50,
      gasUsdcAtomic: gas,
      swapCostUsdcAtomic: swapCost,
      quoteAgeSeconds: 5,
      dataAgeSeconds: snap.dataAgeSeconds,
      observedFeesUsdcAtomic: input.observedFeesUsdcAtomic,
      feeHaircutBps: input.feeHaircutBps,
    }],
    {
      paused: false,
      maxPositionUsdcAtomic: maxPositionAtomic,
      maxSlippageBps: 50,
      maxPriceImpactBps: 100,
      maxGasUsdcAtomic: usdcToAtomic('1'),
      maxQuoteAgeSeconds: 30,
      maxDataAgeSeconds: 60,
      allowNewPoolEntry,
      allowRangeChange: true,
      allowFeeCollection: true,
      allowExitSwap: true,
      isNewPool: () => false,
    },
  );
  if (decision.decision === 'HOLD' || sim.decision === 'HOLD') {
    const reason = decision.holdReasons[0] ?? sim.holdReason ?? 'HOLD';
    const lines = explain({
      kind: 'hold', policyVersion: 1, pool: input.allowlist.pool, action: 'ENTER',
      amountUsdc: atomicToUsdc(amount), pessimisticFeesUsdc: atomicToUsdc(sim.quote.pessimisticFeesUsdcAtomic),
      costsUsdc: atomicToUsdc(gas + swapCost), netUsdc: atomicToUsdc(sim.netAfterCostsUsdcAtomic),
      txHash: null, holdReason: reason, extra: [],
    });
    return { outcome: 'HOLD', detail: [...detail, reason], policyVersion: 1, jobState: null, txHash: null, netUsdcAtomic: sim.netAfterCostsUsdcAtomic, explanation: lines };
  }

  // ---- 7. policy gate (fail closed, pre-submit shape) ----
  const shape = adapter.toPolicyActionShape(quote, {
    contract: input.allowlist.npm,
    selector: input.allowlist.selector,
    pool: input.allowlist.pool,
    tokensTouched: [input.allowlist.usdc, input.allowlist.token],
  });
  const gateCheck = checkAction(compilePermissions(policy), {
    type: shape.type,
    pool: shape.pool,
    contract: shape.contract,
    selector: shape.selector,
    tokensTouched: shape.tokensTouched,
    notionalAtomic: shape.notionalAtomic,
    slippageBps: shape.slippageBps,
    priceImpactBps: shape.priceImpactBps,
    gasAtomic: shape.gasAtomic,
    quoteAgeSeconds: shape.quoteAgeSeconds,
    dataAgeSeconds: shape.dataAgeSeconds,
  });
  if (!gateCheck.ok) {
    return {
      outcome: 'BLOCKED',
      detail: gateCheck.violations.map((v) => `${v.code}: ${v.message}`),
      policyVersion: 1,
      jobState: null,
      txHash: null,
      netUsdcAtomic: null,
      explanation: explain({
        kind: 'hold', policyVersion: 1, pool: input.allowlist.pool, action: 'ENTER',
        amountUsdc: null, pessimisticFeesUsdc: null, costsUsdc: null, netUsdc: null,
        txHash: null, holdReason: `policy gate blocked: ${gateCheck.violations.map((v) => v.code).join(', ')}`, extra: [],
      }),
    };
  }

  // ---- 8. execute: durable job → receipt → reconciled ----
  const store = createStore();
  const job = createJob(store, {
    idempotencyKey: input.idempotencyKey,
    account: input.account,
    chainId: input.chainId,
    policyVersion: 1,
    calldataDigest: '0xe2e-calldata',
    intent: {
      type: shape.type,
      pool: shape.pool,
      contract: shape.contract,
      selector: shape.selector,
      tokensTouched: shape.tokensTouched,
      notionalAtomic: shape.notionalAtomic,
      slippageBps: shape.slippageBps,
      priceImpactBps: shape.priceImpactBps,
      gasAtomic: shape.gasAtomic,
      quoteAgeSeconds: shape.quoteAgeSeconds,
      dataAgeSeconds: shape.dataAgeSeconds,
    },
  });
  markSimulated(job);
  requestApproval(job);
  const minReceived = quote.minReceivedUsdcAtomic;
  const digest = bindApproval({
    policyVersion: 1,
    chainId: input.chainId,
    account: input.account,
    calldataDigest: '0xe2e-calldata',
    valueAtomic: amount,
    spender: input.allowlist.npm,
    expirySeconds: input.nowSeconds + 300,
    minReceivedAtomic: minReceived,
    quoteExpiresAtSeconds: input.nowSeconds + 60,
  });
  attachApproval(job, {
    digest,
    spender: input.allowlist.npm,
    valueAtomic: amount,
    expiresAtSeconds: input.nowSeconds + 300,
    minReceivedAtomic: minReceived,
    quoteExpiresAtSeconds: input.nowSeconds + 60,
  }, input.nowSeconds);
  await submitJob(store, job, (j) => {
    const recheck = checkAction(compilePermissions(policy), {
      type: j.intent.type, pool: j.intent.pool, contract: j.intent.contract,
      selector: j.intent.selector, tokensTouched: j.intent.tokensTouched,
      notionalAtomic: j.intent.notionalAtomic, slippageBps: j.intent.slippageBps,
      priceImpactBps: j.intent.priceImpactBps, gasAtomic: j.intent.gasAtomic,
      quoteAgeSeconds: j.intent.quoteAgeSeconds, dataAgeSeconds: j.intent.dataAgeSeconds,
    });
    return recheck.ok ? { ok: true, violations: [] } : { ok: false, violations: recheck.violations.map((v) => v.code) };
  }, input.submitter, input.nowSeconds);
  if (job.state !== 'SUBMITTED' || !job.txHash) {
    return { outcome: 'BLOCKED', detail: [...detail, `submit ended in ${job.state}: ${job.error ?? ''}`], policyVersion: 1, jobState: job.state, txHash: job.txHash, netUsdcAtomic: null, explanation: [] };
  }
  confirmJob(store, job, { txHash: job.txHash, status: 'success', blockNumber: 9999 });
  markReconciled(store, job);

  // ---- 9. ledger + report ----
  const flows: CashFlow[] = [
    { id: 'dep1', timestampSeconds: input.nowSeconds, kind: 'deposit', amountUsdcAtomic: budget },
    { id: 'fee1', timestampSeconds: input.nowSeconds + 1, kind: 'fee_collected', amountUsdcAtomic: sim.quote.pessimisticFeesUsdcAtomic },
    { id: 'gas1', timestampSeconds: input.nowSeconds + 1, kind: 'gas', amountUsdcAtomic: gas },
    { id: 'sw1', timestampSeconds: input.nowSeconds + 1, kind: 'swap_cost', amountUsdcAtomic: swapCost },
  ];
  const ending = budget + sim.netAfterCostsUsdcAtomic;
  const report = buildReport(
    { startingValueUsdcAtomic: 0n, endingValueUsdcAtomic: ending, flows, windowStartSeconds: input.nowSeconds, windowEndSeconds: input.nowSeconds + 2 },
    { holdBenchmarkEndUsdcAtomic: budget, usdcCashEndUsdcAtomic: budget },
  );

  // ---- 10. evidence-backed explanation ----
  const lines = [
    ...explain({
      kind: 'execution', policyVersion: 1, pool: input.allowlist.pool, action: 'ENTER',
      amountUsdc: atomicToUsdc(amount), pessimisticFeesUsdc: null, costsUsdc: null,
      netUsdc: null, txHash: job.txHash, holdReason: null, extra: [],
    }),
    ...explain({
      kind: 'performance', policyVersion: 1, pool: input.allowlist.pool, action: null,
      amountUsdc: null, pessimisticFeesUsdc: atomicToUsdc(sim.quote.pessimisticFeesUsdcAtomic),
      costsUsdc: atomicToUsdc(gas + swapCost), netUsdc: atomicToUsdc(report.netResultUsdcAtomic),
      txHash: null, holdReason: null, extra: [],
    }),
  ];

  return {
    outcome: 'EXECUTED',
    detail,
    policyVersion: 1,
    jobState: job.state,
    txHash: job.txHash,
    netUsdcAtomic: report.netResultUsdcAtomic,
    explanation: lines,
  };
}
