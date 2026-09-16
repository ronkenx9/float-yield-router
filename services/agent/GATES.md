# Gates: @floatrouter/agent

OWNS: services/agent/**

Scope: Typed goal parsing, deterministic planner, evidence-backed
explanations (PLAN.md §3–§5). No keys, no calldata, no self-authorized
policy changes.

- [x] G1: Behavioral tests pass (goal parsing incl. no-inferred-capital, planner HOLD/propose/caps, explanations cite evidence).
  CHECK: cd services/agent && node --test --test-reporter=tap "test/*.test.ts" 2>&1 | awk '/^# fail/{f=$3} /^# pass/{p=$3} END{if(p>0 && f==0) print "AGENT_TESTS_PASS"; else print "AGENT_TESTS_FAIL"}'
  EXPECT: AGENT_TESTS_PASS
  EVIDENCE: manual; 9 pass / 0 fail, 16 September 2026.

- [x] G2: Strict typecheck clean.
  CHECK: cd services/agent && ../../sdk/node_modules/.bin/tsc -p tsconfig.json >/dev/null 2>&1 && echo AGENT_TYPECHECK_CLEAN
  EXPECT: AGENT_TYPECHECK_CLEAN
  EVIDENCE: manual; clean, 16 September 2026.

## Notes
- Parser never infers capital; ambiguities become blocking questions.
- Planner HOLD is first-class; simulations labeled, never forecasts.
