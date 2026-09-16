# Gates: @floatrouter/accounting

OWNS: packages/accounting/**

Scope: Cash-flow ledger, portfolio marking, net-P&L identity, component
breakdown, and matched-hold benchmark (PLAN.md §7). Pure, deterministic,
dependency-free. Run all checks from the repository root.

- [x] G1: Behavioral tests pass (rising/falling/sideways, additions, partial exits, failed-tx exclusion, depeg/missing-price unavailability, no double-count).
  CHECK: cd packages/accounting && node --test --test-reporter=tap "test/*.test.ts" 2>&1 | awk '/^# fail/{f=$3} /^# pass/{p=$3} END{if(p>0 && f==0) print "ACCOUNTING_TESTS_PASS"; else print "ACCOUNTING_TESTS_FAIL"}'
  EXPECT: ACCOUNTING_TESTS_PASS
  EVIDENCE: manual; 11 pass / 0 fail, 16 September 2026.

- [x] G2: Strict typecheck clean.
  CHECK: cd packages/accounting && ../../sdk/node_modules/.bin/tsc -p tsconfig.json >/dev/null 2>&1 && echo ACCOUNTING_TYPECHECK_CLEAN
  EXPECT: ACCOUNTING_TYPECHECK_CLEAN
  EVIDENCE: manual; clean, 16 September 2026.

## Notes
- Net P&L = ending + withdrawals − deposits − starting. Costs already in
  ending value are not subtracted again; outside-account charges are
  identified separately. Internal swaps/collects/rebalances are never
  deposits/withdrawals. Unknown/stale prices → "valuation unavailable".
