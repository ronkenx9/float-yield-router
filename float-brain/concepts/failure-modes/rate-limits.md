# Failure Mode: HTTP 429 Rate Limits

## Symptom
Multiple agents sharing one Circle Agent Wallet fire concurrent `circle wallet balance`
and `circle wallet execute` commands, saturating the CLI's per-session rate limit.
Result: cascading balance-refresh failures, stale-balance HOLDs, and failed park/withdraw.

## Root Cause
`refreshBalances()` called `getUSDCBalance()` once per agent in parallel via `Promise.all`.
With 3 agents on the same wallet = 3 simultaneous CLI calls within the same 600ms window.

## Fix Applied (Orchestrator.ts — 2026-05-19)
1. **Deduplicated refresh**: group agents by wallet address; call CLI once per unique address,
   distribute result to all agents sharing it.
2. **Per-address CLI gate** (`CircleAgentAdapter.acquireCliSlot`): minimum 600ms gap between
   consecutive CLI calls on the same address, enforced via a static `Map<address, lastCallMs>`.

## Lesson
In production each trader wallet is a separate address, eliminating this problem entirely.
For single-wallet demos/tests, the deduplication fix ensures correctness.
