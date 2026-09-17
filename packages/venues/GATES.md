# Gates: @floatrouter/venues

OWNS: packages/venues/**

Scope: Generic venue-adapter interface (PLAN.md §5) with Uniswap V3 LP as the
first implementation and ACTFUN graduated pools as a pool SOURCE. Pure,
deterministic, dependency-free. No keys, no RPC, no calldata execution.
Run all checks from the repository root.

- [x] G1: The full behavioral test suite passes (math, V3 adapter, eligibility, ACTFUN classification).
  CHECK: cd packages/venues && node --test --test-reporter=tap "test/*.test.ts" 2>&1 | awk '/^# fail/{f=$3} /^# pass/{p=$3} END{if(p>0 && f==0) print "VENUES_TESTS_PASS"; else print "VENUES_TESTS_FAIL"}'
  EXPECT: VENUES_TESTS_PASS
  EVIDENCE: manual; 30 pass / 0 fail on Node v26.0.0, 16 September 2026.

- [x] G2: The source typechecks under strict TypeScript with no errors.
  CHECK: cd packages/venues && ../../sdk/node_modules/.bin/tsc -p tsconfig.json >/dev/null 2>&1 && echo VENUES_TYPECHECK_CLEAN
  EXPECT: VENUES_TYPECHECK_CLEAN
  EVIDENCE: manual; VENUES_TYPECHECK_CLEAN on 16 September 2026.

- [x] G3: The public API surface is present; V3 is LP-only and SWAP is typed-but-unsupported.
  CHECK: node --input-type=module -e "import('./packages/venues/src/index.ts').then(m=>{for(const k of ['UniswapV3Adapter','screenPool','classifyActfunPool','actfunGraduationToV3PoolCandidate','minReceivedAfterSlippage','pessimisticFeeEstimate']){if(!m[k])throw new Error('missing '+k);} const a=new m.UniswapV3Adapter({chainId:5042002}); if(!a.supportsAction('ENTER')||a.supportsAction('SWAP'))throw new Error('action matrix'); console.log('VENUES_API_OK');})"
  EXPECT: VENUES_API_OK

## Notes
- Money is bigint atomic in memory; no JS float ever holds currency (PLAN.md §4).
- v3, v4, and Aerodrome are distinct implementations (PLAN.md §5–§6). This
  release implements v3 only; v4/aerodrome quotes must fail closed.
- SWAP is typed for the Phase-2 Arc bot but rejected by the V3 adapter; it
  requires a swap-router adapter plus a policy extension and fresh approval.
- ACTFUN bonding-curve trades and creator-locked graduation LP are never FLOAT
  pools. Only graduated PUBLIC pools may enter screening (14-day history,
  verification, bytecode), and screening is not an approval.
- Arc mainnet is intentionally unconfigured; supported chain is testnet 5042002
  pending the readiness gate (PLAN.md §6).
