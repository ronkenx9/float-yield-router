/**
 * Permission compiler + action check (PLAN.md §5, risk/policy engine).
 *
 * `compilePermissions` turns a Policy into the flat, deterministic allowlist the
 * executor enforces. `checkAction` validates a single proposed action against it
 * and FAILS CLOSED: pause, stale quote/data, unknown token/pool/contract/
 * selector, or a disabled capability all reject. This is the last gate before a
 * proposal is shown for signature, and must be re-run immediately before submit.
 */

import type { ActionType, Policy, ProposedAction, Result, Violation } from './types.ts';
import { applyBps } from './units.ts';

export interface PermissionSet {
  chainId: number;
  account: string;
  paused: boolean;
  tokens: ReadonlySet<string>;
  pools: ReadonlySet<string>;
  contracts: ReadonlySet<string>;
  selectors: ReadonlySet<string>;
  limits: {
    maxPositionAtomic: bigint; // absolute, derived from bps of budget
    minReserveAtomic: bigint;
    maxSlippageBps: number;
    maxPriceImpactBps: number;
    maxGasPerActionAtomic: bigint;
    maxQuoteAgeSeconds: number;
    maxDataAgeSeconds: number;
  };
  actions: Record<ActionType, boolean>;
}

export function compilePermissions(p: Policy): PermissionSet {
  return {
    chainId: p.chainId,
    account: p.accountAddress,
    paused: p.pauseState === 'paused',
    tokens: new Set(p.allowedTokens.map(norm)),
    pools: new Set(p.allowedPools.map(norm)),
    contracts: new Set(p.allowedContracts.map(norm)),
    selectors: new Set(p.allowedSelectors.map(normSelector)),
    limits: {
      maxPositionAtomic: applyBps(p.capitalBudgetUsdcAtomic, p.maxPositionBps),
      minReserveAtomic: p.minUsdcReserveAtomic,
      maxSlippageBps: p.maxSlippageBps,
      maxPriceImpactBps: p.maxPriceImpactBps,
      maxGasPerActionAtomic: p.maxGasPerActionAtomic,
      maxQuoteAgeSeconds: p.maxQuoteAgeSeconds,
      maxDataAgeSeconds: p.maxDataAgeSeconds,
    },
    actions: {
      ENTER: p.allowNewPoolEntry,
      RANGE_CHANGE: p.allowRangeChange,
      COLLECT: p.allowFeeCollection,
      EXIT: p.allowExitSwap,
    },
  };
}

/**
 * Validate a proposed action against a compiled permission set. Returns every
 * violation found (not just the first), so proposals can be explained fully.
 */
export function checkAction(perm: PermissionSet, a: ProposedAction): Result {
  const v: Violation[] = [];
  const add = (code: string, message: string) => v.push({ code, message });

  // Fail-closed global gates first.
  if (perm.paused) add('PAUSED', 'policy is paused; no new actions permitted');

  if (a.quoteAgeSeconds < 0 || a.quoteAgeSeconds > perm.limits.maxQuoteAgeSeconds) {
    add('QUOTE_STALE', `quote age ${a.quoteAgeSeconds}s exceeds max ${perm.limits.maxQuoteAgeSeconds}s`);
  }
  if (a.dataAgeSeconds < 0 || a.dataAgeSeconds > perm.limits.maxDataAgeSeconds) {
    add('DATA_STALE', `data age ${a.dataAgeSeconds}s exceeds max ${perm.limits.maxDataAgeSeconds}s`);
  }

  // Capability gate.
  if (!perm.actions[a.type]) add('ACTION_NOT_ALLOWED', `action ${a.type} is disabled by policy`);

  // Allowlist gates.
  if (!perm.pools.has(norm(a.pool))) add('POOL_NOT_ALLOWED', `pool ${a.pool} not in allowlist`);
  if (!perm.contracts.has(norm(a.contract))) add('CONTRACT_NOT_ALLOWED', `contract ${a.contract} not in allowlist`);
  if (!perm.selectors.has(normSelector(a.selector))) add('SELECTOR_NOT_ALLOWED', `selector ${a.selector} not in allowlist`);
  for (const t of a.tokensTouched) {
    if (!perm.tokens.has(norm(t))) add('TOKEN_NOT_ALLOWED', `token ${t} not in allowlist`);
  }

  // Numeric limit gates.
  if (a.slippageBps > perm.limits.maxSlippageBps) add('SLIPPAGE_EXCEEDED', `slippage ${a.slippageBps}bps > max ${perm.limits.maxSlippageBps}bps`);
  if (a.priceImpactBps > perm.limits.maxPriceImpactBps) add('IMPACT_EXCEEDED', `price impact ${a.priceImpactBps}bps > max ${perm.limits.maxPriceImpactBps}bps`);
  if (a.gasAtomic > perm.limits.maxGasPerActionAtomic) add('GAS_EXCEEDED', 'gas estimate exceeds maxGasPerAction');
  if (a.notionalAtomic < 0n) add('NOTIONAL_NEGATIVE', 'notional must be >= 0');
  if (a.type === 'ENTER' && a.notionalAtomic > perm.limits.maxPositionAtomic) {
    add('POSITION_SIZE_EXCEEDED', 'ENTER notional exceeds maxPosition');
  }

  return { ok: v.length === 0, violations: v };
}

function norm(addr: string): string {
  return addr.trim().toLowerCase();
}

function normSelector(sel: string): string {
  const s = sel.trim().toLowerCase();
  return s.startsWith('0x') ? s : `0x${s}`;
}
