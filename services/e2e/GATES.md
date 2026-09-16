# Gates: @floatrouter/e2e

OWNS: services/e2e/**

Scope: Offline end-to-end proof across policy → venues → indexer → agent →
executor → accounting (PLAN.md §5 pipeline, M1–M3 logic). Fake submitter, no
network, no mainnet, no real funds.

- [x] G1: End-to-end tests pass (executed path with receipt + ledger + explanation; HOLD on dust fees; HOLD on stale data; NEEDS_INPUT without capital).
  CHECK: cd services/e2e && node --test --test-reporter=tap "test/*.test.ts" 2>&1 | awk '/^# fail/{f=$3} /^# pass/{p=$3} END{if(p>0 && f==0) print "E2E_TESTS_PASS"; else print "E2E_TESTS_FAIL"}'
  EXPECT: E2E_TESTS_PASS
  EVIDENCE: manual; 4 pass / 0 fail, 16 September 2026.

- [x] G2: Strict typecheck clean.
  CHECK: cd services/e2e && ../../sdk/node_modules/.bin/tsc -p tsconfig.json >/dev/null 2>&1 && echo E2E_TYPECHECK_CLEAN
  EXPECT: E2E_TYPECHECK_CLEAN
  EVIDENCE: manual; clean, 16 September 2026.

## Notes
- Proves the wiring, not production readiness. Real funds additionally need
  the Arc readiness gate, verified bytecode, reviewed authority, monitoring,
  incident response, and legal review (PLAN.md §14 definition of ready).
