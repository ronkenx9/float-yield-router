# Gates: @floatrouter/chat

OWNS: services/chat/**

Scope: iMessage-first chat shell — Photon Spectrum webhook verifier,
transport-agnostic shell (allowlist, dedupe, approvals), OpenAI brain
adapter, deterministic skills over the existing services. Offline-testable
with fakes; no secrets in repo.

- [x] G1: Behavioral tests pass (signature verify, skew, parser, allowlist refusal, dedupe, skills, approve→receipt, reject, brain fallback, chunking).
  CHECK: cd services/chat && node --test --test-reporter=tap "test/*.test.ts" 2>&1 | awk '/^# fail/{f=$3} /^# pass/{p=$3} END{if(p>0 && f==0) print "CHAT_TESTS_PASS"; else print "CHAT_TESTS_FAIL"}'
  EXPECT: CHAT_TESTS_PASS
  EVIDENCE: manual; 11 pass / 0 fail, 17 September 2026.

- [x] G2: Strict typecheck clean.
  CHECK: cd services/chat && ../../sdk/node_modules/.bin/tsc -p tsconfig.json >/dev/null 2>&1 && echo CHAT_TYPECHECK_CLEAN
  EXPECT: CHAT_TYPECHECK_CLEAN
  EVIDENCE: manual; clean, 17 September 2026.

## Notes
- Money moves only via APPROVE <id> → injected approver. Unknown senders get
  zero data. Duplicates ack silently. Brain drafts; skills execute.
- Live iMessage + OpenAI need env keys (see SETUP.md) and are NOT exercised
  by these gates.
