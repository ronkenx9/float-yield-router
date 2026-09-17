# Gates: @floatrouter/executor

OWNS: services/executor/**

Scope: Durable jobs, account serialization, policy-gated submit, receipts,
recovery (PLAN.md §5). No keys, no RPC here; submission is injected.

- [x] G1: Behavioral tests pass (happy path, idempotency, gate rejection, expiry, timeout→reconcile→retry, no blind resubmit, locks, cancel semantics).
  CHECK: cd services/executor && node --test --test-reporter=tap "test/*.test.ts" 2>&1 | awk '/^# fail/{f=$3} /^# pass/{p=$3} END{if(p>0 && f==0) print "EXECUTOR_TESTS_PASS"; else print "EXECUTOR_TESTS_FAIL"}'
  EXPECT: EXECUTOR_TESTS_PASS
  EVIDENCE: manual; 10 pass / 0 fail, 16 September 2026.

- [x] G2: Strict typecheck clean.
  CHECK: cd services/executor && ../../sdk/node_modules/.bin/tsc -p tsconfig.json >/dev/null 2>&1 && echo EXECUTOR_TYPECHECK_CLEAN
  EXPECT: EXECUTOR_TYPECHECK_CLEAN
  EVIDENCE: manual; clean, 16 September 2026.

## Notes
- Intent persisted before submit; approval binds version/chain/account/
  digest/value/spender/expiry/bounds. Policy changes expire pre-broadcast jobs.
