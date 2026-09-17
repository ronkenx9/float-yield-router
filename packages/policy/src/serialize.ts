/**
 * Convert between the in-memory `Policy` (bigint money) and the on-the-wire
 * `SerializedPolicy` (decimal strings). Storage and the user-approval digest
 * always operate on the serialized form so money is never a JS float.
 */

import type { Policy, SerializedPolicy } from './types.ts';
import { atomicToUsdc, usdcToAtomic } from './units.ts';

export function serializePolicy(p: Policy): SerializedPolicy {
  const {
    capitalBudgetUsdcAtomic,
    minUsdcReserveAtomic,
    maxGasPerActionAtomic,
    dailyExecutionBudgetAtomic,
    ...rest
  } = p;
  return {
    ...rest,
    capitalBudgetUsdc: atomicToUsdc(capitalBudgetUsdcAtomic),
    minUsdcReserve: atomicToUsdc(minUsdcReserveAtomic),
    maxGasPerAction: atomicToUsdc(maxGasPerActionAtomic),
    dailyExecutionBudget: atomicToUsdc(dailyExecutionBudgetAtomic),
  };
}

export function parsePolicy(s: SerializedPolicy): Policy {
  const {
    capitalBudgetUsdc,
    minUsdcReserve,
    maxGasPerAction,
    dailyExecutionBudget,
    ...rest
  } = s;
  return {
    ...rest,
    capitalBudgetUsdcAtomic: usdcToAtomic(capitalBudgetUsdc),
    minUsdcReserveAtomic: usdcToAtomic(minUsdcReserve),
    maxGasPerActionAtomic: usdcToAtomic(maxGasPerAction),
    dailyExecutionBudgetAtomic: usdcToAtomic(dailyExecutionBudget),
  };
}

/**
 * Deterministic, stable-key JSON of the serialized policy. This is the exact
 * string a user's approval binds to; any authority-relevant change alters it.
 * (A real deployment would hash this with a vetted digest; kept dependency-free
 * here so the contract is testable in isolation.)
 */
export function canonicalPolicyJson(p: Policy): string {
  const s = serializePolicy(p) as unknown as Record<string, unknown>;
  const keys = Object.keys(s).sort();
  const ordered: Record<string, unknown> = {};
  for (const k of keys) {
    const v = s[k];
    ordered[k] = Array.isArray(v) ? [...v].sort() : v;
  }
  return JSON.stringify(ordered);
}
