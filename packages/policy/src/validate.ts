/**
 * Policy validation + authority-change detection (PLAN.md §4).
 *
 * `validatePolicy` proves a policy is internally consistent and MVP-legal.
 * `authorityIncreased` answers the release-critical question: does moving from
 * `prev` to `next` grant the agent MORE power? If so, a new user approval is
 * required and outstanding proposals are invalidated.
 */

import { MODES, APPROVAL_MODES, PAUSE_STATES } from './types.ts';
import type { Policy, Result, Violation } from './types.ts';
import { applyBps, isValidBps } from './units.ts';
import { isKnownArcChainId } from './arc.ts';

const BPS_FIELDS: Array<keyof Policy> = [
  'maxPositionBps',
  'maxTokenExposureBps',
  'maxSlippageBps',
  'maxPriceImpactBps',
];

export function validatePolicy(p: Policy): Result {
  const v: Violation[] = [];
  const add = (code: string, message: string) => v.push({ code, message });

  // ---- structural ----
  if (!p.policyId) add('POLICY_ID_REQUIRED', 'policyId is required');
  if (!p.userId) add('USER_ID_REQUIRED', 'userId is required');
  if (!p.accountAddress) add('ACCOUNT_REQUIRED', 'accountAddress is required');
  if (!p.userApprovalDigest) add('APPROVAL_DIGEST_REQUIRED', 'userApprovalDigest is required');
  if (!Number.isInteger(p.version) || p.version < 1) add('VERSION_INVALID', 'version must be an integer >= 1');
  if (!MODES.includes(p.mode)) add('MODE_INVALID', `mode must be one of ${MODES.join(', ')}`);
  if (!APPROVAL_MODES.includes(p.approvalMode)) add('APPROVAL_MODE_INVALID', 'approvalMode invalid');
  if (!PAUSE_STATES.includes(p.pauseState)) add('PAUSE_STATE_INVALID', 'pauseState invalid');

  // ---- chain ----
  if (!Number.isInteger(p.chainId) || p.chainId <= 0) add('CHAIN_ID_INVALID', 'chainId must be a positive integer');
  else if (!isKnownArcChainId(p.chainId)) add('CHAIN_NOT_ARC', `chainId ${p.chainId} is not a known Arc chain`);

  // ---- time ----
  if (!Number.isInteger(p.effectiveAt) || !Number.isInteger(p.expiresAt)) {
    add('TIME_INVALID', 'effectiveAt and expiresAt must be integer unix seconds');
  } else if (p.expiresAt <= p.effectiveAt) {
    add('EXPIRY_BEFORE_EFFECTIVE', 'expiresAt must be after effectiveAt');
  }

  // ---- bps ranges ----
  for (const f of BPS_FIELDS) {
    if (!isValidBps(p[f] as number)) add('BPS_OUT_OF_RANGE', `${String(f)} must be an integer in [0, 10000]`);
  }

  // ---- money non-negative ----
  if (p.capitalBudgetUsdcAtomic <= 0n) add('BUDGET_INVALID', 'capitalBudgetUsdcAtomic must be > 0');
  if (p.minUsdcReserveAtomic < 0n) add('RESERVE_NEGATIVE', 'minUsdcReserveAtomic must be >= 0');
  if (p.maxGasPerActionAtomic < 0n) add('GAS_NEGATIVE', 'maxGasPerActionAtomic must be >= 0');
  if (p.dailyExecutionBudgetAtomic < 0n) add('DAILY_BUDGET_NEGATIVE', 'dailyExecutionBudgetAtomic must be >= 0');

  // ---- counters ----
  if (!Number.isInteger(p.maxActionsPerDay) || p.maxActionsPerDay < 0) add('MAX_ACTIONS_INVALID', 'maxActionsPerDay must be an integer >= 0');
  if (!Number.isInteger(p.cooldownSeconds) || p.cooldownSeconds < 0) add('COOLDOWN_INVALID', 'cooldownSeconds must be an integer >= 0');
  if (!Number.isInteger(p.maxQuoteAgeSeconds) || p.maxQuoteAgeSeconds <= 0) add('QUOTE_AGE_INVALID', 'maxQuoteAgeSeconds must be an integer > 0');
  if (!Number.isInteger(p.maxDataAgeSeconds) || p.maxDataAgeSeconds <= 0) add('DATA_AGE_INVALID', 'maxDataAgeSeconds must be an integer > 0');

  // ---- consistency (only meaningful once basic money/bps are sane) ----
  if (p.capitalBudgetUsdcAtomic > 0n) {
    // Reserve must fit inside the budget.
    if (p.minUsdcReserveAtomic > p.capitalBudgetUsdcAtomic) {
      add('RESERVE_EXCEEDS_BUDGET', 'minUsdcReserve cannot exceed capitalBudget');
    }
    // A single max position + the reserve must fit the budget, else the caps
    // are internally contradictory.
    if (isValidBps(p.maxPositionBps)) {
      const maxPosition = applyBps(p.capitalBudgetUsdcAtomic, p.maxPositionBps);
      if (maxPosition + p.minUsdcReserveAtomic > p.capitalBudgetUsdcAtomic) {
        add('POSITION_PLUS_RESERVE_EXCEEDS_BUDGET', 'maxPosition + reserve exceeds budget');
      }
    }
  }

  // A pool-level cap must not exceed the token-level concentration cap,
  // otherwise one pool could quietly bypass token concentration limits.
  if (isValidBps(p.maxPositionBps) && isValidBps(p.maxTokenExposureBps)) {
    if (p.maxPositionBps > p.maxTokenExposureBps) {
      add('POSITION_CAP_BYPASSES_TOKEN_CAP', 'maxPositionBps must not exceed maxTokenExposureBps');
    }
  }

  // Daily budget must afford at least one action if any are allowed.
  if (p.maxActionsPerDay > 0 && p.maxGasPerActionAtomic > 0n && p.dailyExecutionBudgetAtomic < p.maxGasPerActionAtomic) {
    add('DAILY_BUDGET_BELOW_ONE_ACTION', 'dailyExecutionBudget cannot cover a single maxGasPerAction');
  }

  // ---- MVP legality ----
  if (p.approvalMode === 'automated') {
    add('AUTOMATION_NOT_IN_MVP', 'automated approval requires the separately-gated automation release (M6); MVP is per_action');
  }

  return { ok: v.length === 0, violations: v };
}

/**
 * Detect whether `next` grants more authority than `prev`. Any `true` reason
 * means the change must be re-approved by the user before it can take effect.
 */
export function authorityIncreased(prev: Policy, next: Policy): Result {
  const reasons: Violation[] = [];
  const add = (code: string, message: string) => reasons.push({ code, message });

  if (next.capitalBudgetUsdcAtomic > prev.capitalBudgetUsdcAtomic) add('BUDGET_UP', 'capital budget increased');
  if (next.minUsdcReserveAtomic < prev.minUsdcReserveAtomic) add('RESERVE_DOWN', 'reserve lowered');
  if (next.maxPositionBps > prev.maxPositionBps) add('POSITION_CAP_UP', 'position cap increased');
  if (next.maxTokenExposureBps > prev.maxTokenExposureBps) add('TOKEN_CAP_UP', 'token exposure cap increased');
  if (next.maxSlippageBps > prev.maxSlippageBps) add('SLIPPAGE_UP', 'slippage tolerance increased');
  if (next.maxPriceImpactBps > prev.maxPriceImpactBps) add('IMPACT_UP', 'price-impact tolerance increased');
  if (next.maxGasPerActionAtomic > prev.maxGasPerActionAtomic) add('GAS_UP', 'gas-per-action increased');
  if (next.dailyExecutionBudgetAtomic > prev.dailyExecutionBudgetAtomic) add('DAILY_BUDGET_UP', 'daily execution budget increased');
  if (next.maxActionsPerDay > prev.maxActionsPerDay) add('ACTIONS_UP', 'max actions per day increased');
  if (next.maxQuoteAgeSeconds > prev.maxQuoteAgeSeconds) add('QUOTE_AGE_UP', 'accepts staler quotes');
  if (next.maxDataAgeSeconds > prev.maxDataAgeSeconds) add('DATA_AGE_UP', 'accepts staler data');

  // Newly-added allowlist entries widen authority.
  addedEntries(prev.allowedTokens, next.allowedTokens) && add('TOKENS_ADDED', 'tokens added to allowlist');
  addedEntries(prev.allowedPools, next.allowedPools) && add('POOLS_ADDED', 'pools added to allowlist');
  addedEntries(prev.allowedContracts, next.allowedContracts) && add('CONTRACTS_ADDED', 'contracts added to allowlist');
  addedEntries(prev.allowedSelectors, next.allowedSelectors) && add('SELECTORS_ADDED', 'selectors added to allowlist');

  // Enabling a previously-disabled capability widens authority.
  if (next.allowNewPoolEntry && !prev.allowNewPoolEntry) add('NEW_POOL_ENABLED', 'new-pool entry enabled');
  if (next.allowRangeChange && !prev.allowRangeChange) add('RANGE_CHANGE_ENABLED', 'range change enabled');
  if (next.allowFeeCollection && !prev.allowFeeCollection) add('FEE_COLLECTION_ENABLED', 'fee collection enabled');
  if (next.allowExitSwap && !prev.allowExitSwap) add('EXIT_SWAP_ENABLED', 'exit swap enabled');
  if (next.allowSwap && !prev.allowSwap) add('SWAP_ENABLED', 'swap enabled (trading authority)');

  // per_action -> automated is the largest authority jump.
  if (prev.approvalMode === 'per_action' && next.approvalMode === 'automated') add('APPROVAL_MODE_RELAXED', 'switched to automated approval');

  return { ok: reasons.length === 0, violations: reasons };
}

function addedEntries(prev: string[], next: string[]): boolean {
  const prevSet = new Set(prev);
  return next.some((x) => !prevSet.has(x));
}
