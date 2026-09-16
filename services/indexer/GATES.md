# Gates: @floatrouter/indexer

OWNS: services/indexer/**

Scope: Block cursors, pool snapshots, event dedupe/reconciliation, stale
flags (PLAN.md §5). Deterministic, offline, dependency-free.

- [x] G1: Behavioral tests pass (dedupe, out-of-order, monotonic cursor, windowed snapshot, stale fail-closed, reconcile mismatch).
  CHECK: cd services/indexer && node --test --test-reporter=tap "test/*.test.ts" 2>&1 | awk '/^# fail/{f=$3} /^# pass/{p=$3} END{if(p>0 && f==0) print "INDEXER_TESTS_PASS"; else print "INDEXER_TESTS_FAIL"}'
  EXPECT: INDEXER_TESTS_PASS
  EVIDENCE: manual; 8 pass / 0 fail, 16 September 2026.

- [x] G2: Strict typecheck clean.
  CHECK: cd services/indexer && ../../sdk/node_modules/.bin/tsc -p tsconfig.json >/dev/null 2>&1 && echo INDEXER_TYPECHECK_CLEAN
  EXPECT: INDEXER_TYPECHECK_CLEAN
  EVIDENCE: manual; clean, 16 September 2026.

## Notes
- Cursor never moves backwards. Stale/empty snapshots are marked stale and
  must not back execution. Reconcile mismatches block execution.
