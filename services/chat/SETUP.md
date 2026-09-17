# Chat shell — live wiring (iMessage via Photon + OpenAI)

The code is transport-ready; going live is config, not code. Nothing here
takes a secret as an argument — keys live in the environment only. Never
paste keys into chat, tickets, or source.

## 1. Photon project

1. Create a project at the Photon dashboard; note `PROJECT_ID`.
2. Get `projectSecret` (`photon projects show`) and enable the **iMessage**
   provider/line for the project.
3. Register this server's public HTTPS webhook URL for the `messages` event.
   Save the per-webhook **signing secret** (shown once — lose it and you
   re-register).
4. Server env:
   - `SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET`
   - `SPECTRUM_WEBHOOK_SECRET` (the per-webhook signing secret)
   - iMessage provider fields per its setup page (`SPECTRUM_IMESSAGE_*`)

## 2. OpenAI brain

- `OPENAI_API_KEY` (server env only), `FLO_MODEL` (e.g. a current GPT model).
- Without the key the shell still answers HELP/STATUS/PAUSE/APPROVE and says
  plainly the full brain is unconfigured — deterministic skills keep working.

## 3. Owner authorization

- `FLO_OWNER_IDS` — comma-separated sender IDs allowed financial data/actions.
  Unknown senders get a refusal with zero data. Start with exactly one owner.

## 4. Local dev without keys

- Use the `terminal` provider shape (projectless) plus `FakeBrain` to drive
  the shell end to end offline — this is what the test suite does.
- Verify a real signature locally with the `verifySignature` helper before
  exposing the URL; Photon retries 6x then drops, so a 2xx on skips matters.

## 5. What is NOT live yet

Swap / screener / launch skills are the next slice — they plug into
`Skill[]` behind the existing policy gates. This shell ships the door
(webhook → allowlist → skill-or-brain → reply) and the lock (APPROVE-gated
execution); it does not trade on its own.
