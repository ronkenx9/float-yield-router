<div align="center">

# FLOAT

**Yield middleware for AI agents on Arc.**

*While your agents wait, your USDC earns. Park into USYC, recall in seconds.*

[![Built for Agora Agents 2026](https://img.shields.io/badge/built%20for-Agora%20Agents%202026-cyan?style=flat-square)](https://thecanteenapp.com)
[![Settlement: Arc](https://img.shields.io/badge/settles%20on-Arc-blue?style=flat-square)](https://docs.arc.network)
[![Yield: USYC](https://img.shields.io/badge/yield-USYC-emerald?style=flat-square)](https://developers.circle.com)
[![Wallets: Circle Agent Wallets](https://img.shields.io/badge/wallets-Circle%20Agent-blueviolet?style=flat-square)](https://developers.circle.com)

</div>

---

## The pitch in one paragraph

Every AI agent that touches a market has **idle moments** — between trades, between rebalances, between settlements. Today, that idle USDC earns 0%. FLOAT routes it into USYC (Circle's tokenized money market fund, ~5.15% APY) the moment your agent stops, and recalls it in under five seconds the moment it acts again. One SDK call wraps any Circle Agent Wallet. No new contracts to learn, no custody handoff, no manual sweeps.

```ts
import { wrapAgent } from '@float/sdk';

const floatedAgent = wrapAgent(myAgent, { strategy: 'balanced', vault: 'USYC' });
const safePayment  = floatedAgent.wrapPayment(executePayment);
//  ↑ FLOAT auto-recalls from USYC if liquid balance is short, then pays.
```

---

## Why this matters

| Without FLOAT                                            | With FLOAT                                                |
|---------------------------------------------------------|-----------------------------------------------------------|
| Idle USDC earns 0% APY                                  | Earns target **5.15% APY** in USYC                        |
| Agents over-park (hold too much liquid) to avoid recall risk | Recall in **<5s** end-to-end — over-parking unnecessary |
| Per-agent custom yield logic, error-prone               | One `wrapAgent()` call, ~10-minute integration            |
| No audit trail of routing decisions                     | Full reasoning trace in the **FLOAT Second Brain**        |
| Static thresholds drift as conditions change            | **RLAIF Critic** proposes parameter tweaks; humans approve |

---

## Stack

| Layer            | Component                                             |
|-----------------|-------------------------------------------------------|
| **Yield**       | [USYC](https://developers.circle.com) — Circle's tokenized money market fund |
| **Settlement**  | [Arc Testnet](https://docs.arc.network) — sub-second deterministic finality, ~$0.01 fees |
| **Wallets**     | [Circle Agent Wallets](https://developers.circle.com) — user-controlled keys, CLI-managed sessions |
| **Cross-chain** | [Circle Gateway](https://developers.circle.com) — ~500ms cross-chain USDC for multi-venue recall |
| **Reasoning**   | RLAIF Critic — Llama 3.1-8b reviewer with double-loop memory |
| **Compile**     | Second Brain — Llama 3.3-70b hourly summarizer over raw event logs |

---

## Quickstart

### Wrap your agent (10 minutes)

```bash
npm install @float/sdk
```

```ts
import { wrapAgent } from '@float/sdk';

const myAgent = {
  walletId: 'a1b2c3d4-…',       // your Circle Agent Wallet ID
  address:  '0xYourAddress',
  chain:    'ARC-TESTNET',
};

const flo = wrapAgent(myAgent, {
  strategy: 'balanced',           // aggressive | balanced | conservative
  vault:    'USYC',
});

// Wrap any payment to make it yield-aware
const pay = flo.wrapPayment(async (amount, to) => {
  await myAgent.transfer(to, amount);
});

await pay(50.00, '0xRecipient');  // FLOAT auto-recalls from USYC if short
```

### Cross-chain recall via Gateway

```ts
await flo.gatewayRecall({
  amount:             100,
  sourceChain:        'BASE',
  sourceVaultAddress: '0x…',
  sourceUsdcAddress:  '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  sourceCLI:          baseAgentAdapter,
});
//  ↑ 6-step burn-attest-mint via Circle Gateway, ~500ms cross-chain settle.
```

Full SDK reference: [`sdk/README.md`](./sdk/README.md).

---

## Architecture

```
                       ┌──────────────────────────────────┐
                       │  Your Trading Agent              │
                       │  (perp, arb, portfolio, payment) │
                       └────────────────┬─────────────────┘
                                        │ wrapAgent()
                                        ▼
              ┌──────────────────────────────────────────────────┐
              │              FLOAT SDK (sdk/)                    │
              │  • PolicyEngine — score park/withdraw decisions  │
              │  • FloatClient — orchestrates park/withdraw/pay  │
              │  • wrapPayment / gatewayRecall                   │
              └─────┬─────────────────────────────────────┬──────┘
                    │                                     │
                    ▼                                     ▼
   ┌───────────────────────────────┐       ┌──────────────────────────────┐
   │  Circle Agent Wallet (CLI)    │       │  Arc Testnet RPC             │
   │  • signs transactions         │       │  • eth_call (balanceOf)      │
   │  • CIRCLE_API_KEY for HTTP    │       │  • eth_getTransactionReceipt │
   │  • Gateway HTTP submission    │       │  • <5s recall confirmations  │
   └────────────────┬──────────────┘       └──────────────┬───────────────┘
                    │                                     │
                    └─────────────────┬───────────────────┘
                                      ▼
                       ┌───────────────────────────────┐
                       │  FloatVault.sol (contracts/)  │
                       │  • park(uint256)              │
                       │  • withdraw(uint256)          │
                       │  • mints/redeems USYC         │
                       └───────────────────────────────┘

   ┌────────────────────────────────────────────────────────────────┐
   │                  Observation & Reasoning Plane                 │
   │                                                                │
   │   dashboard/       ←─ Orchestrator UI, runs the agent loop     │
   │   float-brain/     ←─ Compiled ledger, audit recommendations   │
   │   landing/         ←─ Marketing site                           │
   │                                                                │
   │   Loop tick → PolicyEngine → execute → log → Critic reviews    │
   │   Critic suggests → audit-recommendations.md → human approves  │
   │   File-watcher → applyStrategyChange() → live in <2s           │
   └────────────────────────────────────────────────────────────────┘
```

---

## Repository layout

```
float-yield-router/
├── README.md                  ← you are here
│
├── sdk/                       ← TypeScript SDK
│   ├── src/
│   │   ├── wrapAgent.ts       ← one-line public entry
│   │   ├── FloatClient.ts     ← park/withdraw/wrapPayment/gatewayRecall
│   │   └── CircleCliAdapter.ts← Circle Agent Wallet CLI wrapper
│   ├── examples/
│   │   └── wrapAgentDemo.ts   ← the 5-line integration story
│   └── test-e2e-*.ts          ← on-chain Arc Testnet tests
│
├── dashboard/                 ← Next.js orchestrator dashboard
│   └── src/lib/
│       ├── float/             ← Orchestrator, PolicyEngine, Evaluator
│       ├── brain/             ← BrainCompiler, BrainIndex, AuditWatcher
│       └── agent/             ← CircleAgentAdapter (the dashboard's adapter)
│
├── landing/                   ← Vite marketing site (the visible front)
│   ├── src/App.tsx            ← hero + features + meet-flo + …
│   └── public/                ← banner, hero video, mascot images
│
├── contracts/                 ← Hardhat + Foundry, FloatVault.sol
│   └── contracts/
│       └── FloatVault.sol
│
├── float-brain/               ← Compiled knowledge artifacts (human-readable)
│   ├── ledger/
│   │   ├── audit-recommendations.md  ← Critic suggestions, human approvals
│   │   ├── system-status.md          ← per-batch compile summary
│   │   └── agent-histories/          ← per-agent narrative ledgers
│   └── concepts/              ← seeded knowledge articles
│
└── ai-engine/                 ← support service (TS)
```

---

## Local development

This is a multi-package monorepo, but the packages don't depend on each other at build time — you can run any one alone.

### Run the dashboard (orchestrator + Brain + audit flow)

```bash
cd dashboard
npm install
npm run dev
# → http://localhost:3000
```

You'll need:
- A logged-in Circle Agent Wallet CLI session (`circle wallet login --testnet`)
- (Optional) `CIRCLE_API_KEY` env var for the HTTP submission path

The dashboard auto-starts an orchestrator that runs three test agents (`trader-a`/`b`/`c`) against the deployed Arc Testnet vault.

### Run the landing site

```bash
cd landing
npm install
npm run dev
# → http://localhost:5173
```

### Run the SDK tests

```bash
cd sdk
npm install
npm run build
node test-e2e-arc.js     # full park+withdraw+payment cycle on Arc Testnet
node test-e2e-vault.js   # vault-only cycle
```

### Deploy / inspect the contract

```bash
cd contracts
forge build
forge test
# Deployed Arc Testnet address: 0xfAe6a9D5b0835ca7e9B090eCe0f57C14899BeDA6
```

---

## How the autonomous loop actually works

1. **Tick** (every 15s) — orchestrator pulls live market snapshot from Arc RPC.
2. **Score** — `PolicyEngine` produces a parkability score per agent, factoring in agent state, market volatility, idle time, recent error count, and strategy preset.
3. **Decide** — score crosses `parkThreshold` → PARK; crosses below `withdrawThreshold` → WITHDRAW; otherwise HOLD.
4. **Execute** — through `CircleAgentAdapter`. Pre-flight RPC check reads onchain `deposits[agent]` before any withdraw, preventing `ESTIMATION_ERROR` from stale per-agent caches.
5. **Log** — every decision goes to in-memory ring + raw event log under `float-brain/`.
6. **Compile** (hourly + on-demand) — Llama 3.3-70b turns recent events into per-agent narrative ledgers.
7. **Review** (every N decisions) — Llama 3.1-8b Critic reads its own past suggestions, accuracy, and good/bad decisions, then proposes one parameter change in JSON.
8. **Approve** — Critic's suggestion is written into `float-brain/ledger/audit-recommendations.md` as a checkbox. A developer changes `- [ ]` to `- [x] Approved`.
9. **Apply** — `AuditWatcher` (fs.watch with 500ms debounce) detects the change, parses the JSON delta, and calls `orchestrator.applyStrategyChange()` → strategy is live in under 2s.

The double-loop is the whole point: the Critic reads its **own** compiled history before suggesting, so it can't re-propose a change that already proved ineffective.

---

## Hackathon context

Built for the [Agora Agents Hackathon](https://thecanteenapp.com) — Canteen × Circle × Arc — May 2026.

**Judging dimensions and where FLOAT lives:**

| Dimension (weight)             | FLOAT's claim                                                                                          |
|--------------------------------|--------------------------------------------------------------------------------------------------------|
| **Agentic sophistication 30%** | Actor-Critic loop, RLAIF reviewer, double-loop memory, human-in-the-loop strategy adaptation           |
| **Traction 30%**               | `wrapAgent()` SDK lets other Canteen teams float their agents in 10 minutes — picks-and-shovels play   |
| **Circle tool usage 20%**      | Circle Agent Wallets (CLI + HTTP API) · USYC · Circle Gateway · Arc settlement — four of the major tools |
| **Innovation 20%**             | Second Brain + AuditWatcher: LLM-compiled ledger that the Critic *itself* reads before suggesting      |

---

## Status

| Component              | State                                                |
|------------------------|------------------------------------------------------|
| FloatVault contract    | Deployed on Arc Testnet · `0xfAe6a9D5b0835ca7e9B090eCe0f57C14899BeDA6` |
| `wrapAgent()` SDK      | Shipped · 6 supported chains                          |
| Circle Gateway recall  | Shipped · 6-step burn-attest-mint                     |
| Orchestrator loop      | Running locally · 3 traders @ 15s interval            |
| Second Brain compile   | Hourly + on-demand via `POST /api/brain {action:'compile'}` |
| Audit approval flow    | File-watcher live · `<2s` to apply                    |
| Landing site           | `localhost:5173` · 9 sections                         |
| Demo video             | In production                                         |

---

## Credits

Built with [Photon](#) (queue/cancellation/recovery), [Arc](https://docs.arc.network), and [Circle](https://developers.circle.com).
Submitted to the Agora Agents Hackathon · Canteen × Circle × Arc · 2026.

Pull-quote: *"All things that are exchanged must be somehow comparable."* — Aristotle, *Nicomachean Ethics* V

---

## License

MIT.
