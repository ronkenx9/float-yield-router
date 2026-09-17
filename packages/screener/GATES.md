# Gates: @floatrouter/screener

OWNS: packages/screener/**

Scope: Parameter-based memecoin screen over observed token metrics
(PHASE-2 trading core, read-only). Pure, deterministic, dependency-free.

- [x] G1: Behavioral tests pass (filters, ranking, flags, stale-exclusion, bounds).
  CHECK: cd packages/screener && node --test --test-reporter=tap "test/*.test.ts" 2>&1 | awk '/^# fail/{f=$3} /^# pass/{p=$3} END{if(p>0 && f==0) print "SCREENER_TESTS_PASS"; else print "SCREENER_TESTS_FAIL"}'
  EXPECT: SCREENER_TESTS_PASS
  EVIDENCE: manual; 6 pass / 0 fail, 17 September 2026.

- [x] G2: Strict typecheck clean.
  CHECK: cd packages/screener && ../../sdk/node_modules/.bin/tsc -p tsconfig.json >/dev/null 2>&1 && echo SCREENER_TYPECHECK_CLEAN
  EXPECT: SCREENER_TYPECHECK_CLEAN
  EVIDENCE: manual; clean, 17 September 2026.

## Notes
- A screen is observations with evidence, never a buy recommendation.
- Stale/unobserved metrics exclude the token; deferred mechanics
  (fee-on-transfer, rebasing, creator-locked) are dropped with reasons.
