# Gates: @floatrouter/policy

OWNS: packages/policy/**

Scope: The FLOAT policy contract and risk-engine primitives (PLAN.md §4–§5) —
typed policy, validator, authority-change detection, and the permission
compiler + fail-closed action check. Pure, deterministic, dependency-free.
Run all checks from the repository root.

- [x] G1: The full behavioral test suite passes (units, validation, authority diff, compile + checkAction incl. adversarial rejections, SWAP gate).
  CHECK: cd packages/policy && node --test --test-reporter=tap "test/*.test.ts" 2>&1 | awk '/^# fail/{f=$3} /^# pass/{p=$3} END{if(p>0 && f==0) print "POLICY_TESTS_PASS"; else print "POLICY_TESTS_FAIL"}'
  EXPECT: POLICY_TESTS_PASS
  EVIDENCE: manual; 35 pass / 0 fail, 17 September 2026.

- [x] G2: The source typechecks under strict TypeScript with no errors.
  CHECK: cd packages/policy && ../../sdk/node_modules/.bin/tsc -p tsconfig.json >/dev/null 2>&1 && echo POLICY_TYPECHECK_CLEAN
  EXPECT: POLICY_TYPECHECK_CLEAN

- [x] G3: The public API surface is present and Arc is the default chain (chainId 5042002).
  CHECK: node --input-type=module -e "import('./packages/policy/src/index.ts').then(m=>{for(const k of ['validatePolicy','authorityIncreased','compilePermissions','checkAction','usdcToAtomic','atomicToUsdc','serializePolicy','parsePolicy']){if(typeof m[k]!=='function')throw new Error('missing '+k);} if(m.ARC_TESTNET.chainId!==5042002)throw new Error('arc chainid'); console.log('POLICY_API_OK');})"
  EXPECT: POLICY_API_OK

## Notes
- Money is bigint atomic (USDC 6dp) in memory, decimal strings on the wire — no JS float ever holds currency (PLAN.md §4).
- `checkAction` fails closed: pause, stale quote/data, unknown token/pool/contract/selector, disabled capability, or any exceeded numeric cap all reject.
- Arc mainnet config is intentionally unpopulated in src/arc.ts pending the readiness gate (PLAN.md §6). Testnet values are verified.
- Automated approval is rejected by the MVP validator; per-action signing only until the M6 automation release.
- SWAP is gated by `allowSwap` (default off); enabling it is an authority increase (`SWAP_ENABLED`) requiring fresh user approval. Sell notionals are gated in USDC value.
