# Failure Mode: ESTIMATION_ERROR on Vault Withdraw

## Symptom
`circle wallet execute "withdraw(uint256)" <amount>` returns `ESTIMATION_ERROR`.
Circle CLI can't estimate gas because the requested amount exceeds `deposits[agent]` in the vault.

## Root Cause
Multiple agents share one vault deposit slot (`deposits[0xd19228...]`).
Agent A parks and the deposit grows. Agent B then decides to withdraw based on its own
cached `parkedBalance` — but by the time Agent B's withdraw executes, Agent A may have
already depleted the vault (or vice versa). The stale cache causes the withdraw amount
to exceed the actual onchain balance.

## Fix Applied (Orchestrator.executeWithdraw — 2026-05-19)
Pre-flight RPC read before submitting the withdraw transaction:
```typescript
const rawVaultBalance = await rpcCall('eth_call', [
  { to: FLOAT_VAULT, data: `0xfc7e286d${paddedAddr}` }, 'latest'
]);
const actualParked = parseInt(rawVaultBalance, 16) / 1e6;
if (actualParked < 0.000001) {
  // abort gracefully — log HOLD with explanation, sync cache to 0
  return;
}
const withdrawAmount = Math.min(amount, actualParked);
```

## Lesson
The onchain state is always the source of truth. Never trust per-agent in-memory balance
caches for transaction sizing. The ground-truth read costs one extra RPC call but
eliminates failed transactions entirely.
