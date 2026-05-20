# dashboard/

**The FLOAT orchestrator + Brain + audit dashboard.**

A Next.js app that runs the autonomous yield-routing loop for one or more Circle Agent Wallets, compiles their decision history into a human-readable knowledge base, and exposes an HTTP API + UI for observation and human-in-the-loop strategy adaptation.

```bash
npm install
npm run dev
# → http://localhost:3000
```

---

## What lives here

```
dashboard/
├── src/
│   ├── app/
│   │   ├── api/                      ← HTTP routes
│   │   │   ├── agent/loop/route.ts   ← orchestrator status + start/stop/signal
│   │   │   ├── agent/simulate/       ← trade event simulator endpoint
│   │   │   └── brain/route.ts        ← Brain query + force-compile
│   │   └── page.tsx                  ← main UI
│   │
│   └── lib/
│       ├── float/                    ← the orchestrator core
│       │   ├── Orchestrator.ts       ← main loop, applies strategy changes
│       │   ├── PolicyEngine.ts       ← scoring + park/withdraw decisions
│       │   ├── Evaluator.ts          ← Actor (explains) + Critic (reviews)
│       │   ├── MarketFeed.ts         ← Arc RPC reads (gas, blocks, deposits)
│       │   ├── TradeSimulator.ts     ← randomized event injector for testing
│       │   └── types.ts              ← StrategyConfig, DecisionLog, etc.
│       │
│       ├── brain/                    ← Second Brain layer
│       │   ├── BrainWriter.ts        ← raw event log sink + PII sanitization
│       │   ├── BrainCompiler.ts      ← hourly LLM compile → narrative ledger
│       │   ├── BrainIndex.ts         ← keyword index + atomic writes
│       │   └── AuditWatcher.ts       ← fs.watch on audit-recommendations.md
│       │
│       └── agent/
│           └── CircleAgentAdapter.ts ← Circle CLI + Arc RPC hybrid adapter
│
└── public/                            ← UI assets (logo, mascot frames)
```

---

## How it runs

When `getOrCreateOrchestrator()` is called for the first time (on any API hit), it:

1. **Hydrates from disk** — reads `float-brain/ledger/audit-recommendations.md` and applies every `- [x] Approved` checkbox to the in-memory `StrategyConfig`.
2. **Registers 3 demo agents** — `trader-a` (aggressive), `trader-b` (balanced), `trader-c` (conservative), all sharing one wallet for the demo.
3. **Starts the AuditWatcher** — `fs.watch` on `audit-recommendations.md` with 500ms debounce, so new approvals apply live in <2s.
4. **Begins the loop** — 15s tick interval (configurable).

Each tick:

```
refreshBalances()           ← one Arc RPC call per unique wallet (deduplicated)
   ↓
for each agent:
   ↓
processAgent()              ← if EXECUTING/COOLDOWN, skip
   ↓
PolicyEngine.score()        ← parkabilityScore in [0,1]
   ↓
decide: PARK / WITHDRAW / HOLD
   ↓
acquire wallet mutex        ← prevents concurrent CLI/RPC submit collisions
   ↓
executePark / executeWithdraw
   ↓
log decision                ← in-memory ring + raw event log
   ↓
release mutex
```

Every N decisions (default 10), the **Critic** (`Evaluator.reviewDecisions`) runs:
- Reads the agent's compiled ledger from `float-brain/ledger/agent-histories/<agent>.md`
- Reads the strategy version history from `float-brain/index.json`
- Reviews the most recent decisions with outcomes
- Returns ONE parameter change in JSON with a confidence score

The Critic's suggestion is written into `audit-recommendations.md` as an unchecked checkbox. A human (or the dashboard's "approve" button) changes `- [ ]` to `- [x]`. The `AuditWatcher` detects the change, parses the suggested change, and calls `orchestrator.applyStrategyChange()`. The new value is live on the next tick.

This is the **double-loop**: the Critic reads its *own* past suggestions and outcomes before recommending, so it can't re-propose a change that already proved ineffective.

---

## HTTP API

### `GET /api/agent/loop`

Returns full orchestrator state:
```json
{
  "running": true,
  "state": {
    "loopCount": 247,
    "strategyVersion": 9,
    "agents": [
      {
        "agentId": "trader-b",
        "status": "PARKED",
        "liquidBalance": 18.50,
        "parkedBalance": 18.50,
        "decisionAccuracy": 0.67,
        "recentDecisions": [ /* last 10 */ ]
      }
    ],
    "criticReviews": [ /* last 5 */ ],
    "latencyStats": { "p50": 3847, "p95": 5120, "samples": 23 }
  },
  "tradeSimulator": { /* TradeSimulator stats */ }
}
```

### `POST /api/agent/loop`

Body: `{ "action": "start" | "stop" | "signal", … }`

- `start` — begins ticking at `intervalMs` (default 60s)
- `stop` — halts the loop (Brain compile and AuditWatcher keep running)
- `signal` — manually push an agent into a state (`{ agentId, agentStatus: 'IDLE' | 'EXECUTING' | … }`)

### `GET /api/brain?q=<query>`

Keyword-indexed lookup against `float-brain/index.json`. Returns up to 5 file excerpts (first 400 chars each).

### `GET /api/brain`

Index summary: keyword count, agent stats (decisions, parks, withdraws, total yield), recent strategy versions.

### `POST /api/brain { "action": "compile" }`

Force-compiles the raw event log into narrative ledgers immediately (bypasses the hourly gate). Returns `{ status, compiled, skipped }`.

---

## Environment

The dashboard mostly runs against an already-authenticated Circle CLI session. Optional env vars:

| Variable           | Purpose                                                       |
|--------------------|---------------------------------------------------------------|
| `CIRCLE_API_KEY`   | Optional — enables the HTTP submission path (alongside CLI)   |
| `GROQ_API_KEY`     | Required for Brain compile + Actor + Critic (uses Groq inference) |
| `ARC_RPC_URL`      | Override the default `https://rpc.testnet.arc.network`        |

Put them in `.env.local` (gitignored).

---

## Latency

After the Arc-RPC migration (May 2026), the dashboard's adapter does:
- **Reads** (balance, tx receipt) → direct Arc JSON-RPC, ~100–300ms
- **Writes** (park, withdraw) → Circle CLI submit + RPC receipt polling, ~3–5s

End-to-end recall latency p50 typically lands in the 3–5s range on Arc Testnet. The dashboard exposes `latencyStats.p50` / `p95` in the loop API.

---

## Brain layout

Compiled output lives in `../float-brain/` (sibling of this directory):

```
float-brain/
├── index.json                   ← keyword index, agent stats, strategy versions
├── raw/<agent>/<date>.jsonl     ← raw event log (pre-compile)
├── ledger/
│   ├── system-status.md         ← per-batch compile summary
│   ├── audit-recommendations.md ← Critic suggestions, human approvals
│   └── agent-histories/
│       ├── trader-a.md
│       ├── trader-b.md
│       └── trader-c.md
└── concepts/                    ← seeded knowledge articles
```

The audit file is the **human-owned** surface. The watcher reacts to checkbox changes in 500ms; the orchestrator applies them on the next tick.

---

## Common gotchas

### `globalThis._orchestrator` survives hot reload
Next.js dev server HMR re-evaluates modules, but the singleton stored on `globalThis` persists with the *old* class prototype. **New methods you add won't show up on existing instances** — you need to fully restart the server (`Ctrl+C`, then `npm run dev`) to see them.

### Strategy presets vs. live config
The presets in `lib/float/types.ts` are the *starting* configs at agent registration. Once an approved audit change is applied, the running config diverges from the preset. To see the live config, call `getState()` (now includes `strategyConfig` per agent).

### File-watcher fires for our own writes
When `markApplied()` writes the "Applied at" timestamp into the audit file, the watcher fires again. We dedupe via `lastKnownApproved: Set<string>` — once a `(agentId, version)` pair has been processed, subsequent fires are no-ops.

### Brain compile is async
`POST /api/brain {action:'compile'}` blocks until the compile finishes (can take 10-30s with the LLM call). The orchestrator's auto-compile is fire-and-forget — failures are logged and swallowed.

---

## Running the demo

1. Start the dev server (`npm run dev`).
2. Open `http://localhost:3000`. The orchestrator auto-starts on first request.
3. Watch the loop in `GET /api/agent/loop` (poll every few seconds).
4. Edit `float-brain/ledger/audit-recommendations.md` — change a `- [ ]` to `- [x] Approved`. Watch the next loop tick use the new value.
5. Force-compile the Brain: `curl -X POST http://localhost:3000/api/brain -d '{"action":"compile"}' -H 'Content-Type: application/json'`.

---

## License

MIT — see the repo root.
