<div align="center">

# FLOAT

**Yield middleware for idle USDC on Arc.**

*Whether your dollars sit in a contract or a wallet, FLOAT routes them into USYC the moment they stop moving — and recalls them in under five seconds the moment they need to act.*

[![npm](https://img.shields.io/npm/v/@floatrouter/sdk.svg?style=flat-square&color=cyan&label=%40floatrouter%2Fsdk)](https://www.npmjs.com/package/@floatrouter/sdk)
[![License: MIT](https://img.shields.io/badge/license-MIT-white?style=flat-square)](./LICENSE)
[![Built for Agora Agents 2026](https://img.shields.io/badge/built%20for-Agora%20Agents%202026-cyan?style=flat-square)](https://thecanteenapp.com)
[![Settlement: Arc](https://img.shields.io/badge/settles%20on-Arc-blue?style=flat-square)](https://docs.arc.network)
[![Yield: USYC](https://img.shields.io/badge/yield-USYC-emerald?style=flat-square)](https://developers.circle.com)
[![Wallets: Circle Agent Wallets](https://img.shields.io/badge/wallets-Circle%20Agent-blueviolet?style=flat-square)](https://developers.circle.com)

</div>

---

## The thesis

Stablecoins moved fast. Stablecoin **idle time** didn't.

Every Arc app — every escrow, every prediction market, every treasury, every payment agent — has the same fingerprint:
**USDC arrives, sits, then leaves.** Between those events, that capital is dead. Multiply it across a network and the dead-weight loss is enormous.

FLOAT is the layer in between. It is the smallest possible piece of glue between *USDC at rest* and *USDC in motion*: a vault that mints USYC (Hashnote's tokenized U.S. Treasury fund, NAV ≈ 5.15% APY) when funds park, and redeems back to USDC on a sub-second window when they're recalled.

The whole product surface is two integration paths:

- **6 lines of Solidity** if your USDC lives in a contract.
- **One `npm` call** if it lives in a Circle Agent Wallet.

Everything else in this monorepo — the orchestrator, the second brain, the audit loop, the landing site, the templates — exists to make those six lines safe, observable, and adaptive.

---

## Two integration paths

### Path A — Contracts (escrow, market, treasury, auction, payroll)

```solidity
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IFloatVault.sol";

contract YourContract {
    using SafeERC20 for IERC20;

    IERC20      public constant USDC        = IERC20(0x3600000000000000000000000000000000000000);
    IFloatVault public constant FLOAT_VAULT = IFloatVault(0xfAe6a9D5b0835ca7e9B090eCe0f57C14899BeDA6);

    // ──── park on deposit ────
    USDC.forceApprove(address(FLOAT_VAULT), amount);
    FLOAT_VAULT.park(amount);

    // ──── recall before payout ────
    uint256 parked = FLOAT_VAULT.deposits(address(this));
    if (parked > 0) FLOAT_VAULT.withdraw(parked);
    USDC.safeTransfer(recipient, USDC.balanceOf(address(this)));
}
```

Three lines to park. Three lines to recall. The starter kit ships a runnable `HelloFloat.sol` you can deploy in one command:
👉 [`float-arc-starter-kit`](https://github.com/ronkenx9/float-arc-starter-kit)

### Path B — Agents (Circle Agent Wallets, trading bots, payment routers)

```ts
import { wrapAgent } from '@floatrouter/sdk';

const flo  = wrapAgent(myAgent, { strategy: 'balanced', vault: 'USYC' });
const pay  = flo.wrapPayment(executePayment);

await pay(50, '0xRecipient');
// ↑ FLOAT auto-recalls from USYC if the wallet is short, then runs your payment.
```

One wrapping call. The SDK keeps a per-strategy liquidity reserve and parks the rest. Three presets ship:

| Strategy        | Liquid reserve | Best for                                       |
|-----------------|----------------|------------------------------------------------|
| `aggressive`    | 40 %           | High-frequency, latency-critical agents        |
| `balanced`      | 35 %           | Most trading / portfolio / payment bots         |
| `conservative`  | 55 %           | Treasury, settlement, or low-burst flows       |

Cross-chain recall via Circle Gateway is one extra call:

```ts
await flo.gatewayRecall({
  amount: 100,
  sourceChain: 'BASE',
  sourceVaultAddress: '0x…',
  sourceUsdcAddress:  '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  sourceCLI:          baseAgentAdapter,
});
// 6-step burn-attest-mint, ~500 ms cross-chain settle.
```

---

## The FLOAT ecosystem

| Repo                                                                                                      | Audience                       | Role                                                                                |
|-----------------------------------------------------------------------------------------------------------|--------------------------------|-------------------------------------------------------------------------------------|
| **[`float-yield-router`](https://github.com/ronkenx9/float-yield-router)** *(you are here)*               | Core / operators               | Vault contract, SDK source, dashboard, second brain, landing site                   |
| **[`floatrouter-sdk`](https://github.com/ronkenx9/floatrouter-sdk)**                                      | Off-chain agent builders       | The published `@floatrouter/sdk` npm package and its docs                           |
| **[`float-arc-starter-kit`](https://github.com/ronkenx9/float-arc-starter-kit)**                          | Any Arc builder                | Pedagogical onramp: the minimal `HelloFloat` contract + `INTEGRATION_PATTERNS.md`    |
| **[`float-arc-prediction-market-template`](https://github.com/ronkenx9/float-arc-prediction-market-template)** | Prediction-market teams        | Production-grade parimutuel market with the 4-layer risk model baked in              |
| **[`float-arc-escrow-template`](https://github.com/ronkenx9/float-arc-escrow-template)**                  | Escrow / settlement teams      | 2-party escrow with optional arbiter, timeout refund, shortfall-safe payout         |

The starter kit teaches the integration. The templates show it at production safety. The SDK covers the agent side. The router is the canonical home for the engine itself.

---

## Where FLOAT fits — six concrete patterns

| Pattern                | What sits idle                          | Wins from FLOAT                                          |
|------------------------|-----------------------------------------|----------------------------------------------------------|
| **Escrow**             | Funds locked between deposit & release   | Days–weeks of yield instead of zero                      |
| **Prediction market**  | Pool from open → resolution             | Sometimes weeks of yield; can subsidise gas or rake      |
| **DAO treasury**       | Reserves between proposals              | Continuous yield without parking off-chain               |
| **Auction**            | Bids locked through auction window      | Settlement-window yield, returned with refunds           |
| **Payroll vault**      | Funded payroll waiting for cycle         | Per-cycle interest on the full envelope                  |
| **Off-chain agent**    | Idle USDC in a Circle Agent Wallet       | Yield between trades / payments / rebalances             |

The full guide — interfaces, snippets, gotchas — lives in [`INTEGRATION_PATTERNS.md`](./INTEGRATION_PATTERNS.md) (also mirrored in each template repo).

---

## Stack

| Layer            | Component                                                                                                |
|-----------------|---------------------------------------------------------------------------------------------------------|
| **Yield**       | [USYC](https://developers.circle.com) — Hashnote's tokenized U.S. Treasury fund, NAV-based, daily appreciation |
| **Settlement**  | [Arc Testnet](https://docs.arc.network) — sub-second deterministic finality, ~$0.01 fees                |
| **Wallets**     | [Circle Agent Wallets](https://developers.circle.com) — user-controlled keys, CLI- or HTTP-managed       |
| **Cross-chain** | [Circle Gateway](https://developers.circle.com) — ~500 ms cross-chain USDC for multi-venue recall        |
| **Reasoning**   | RLAIF Critic — Llama 3.1-8b reviewer with double-loop memory                                            |
| **Compile**     | Second Brain — Llama 3.3-70b hourly summarizer over raw event logs                                       |

---

## Architecture

```
            ┌────────────────────────────┐     ┌───────────────────────────────┐
            │   ON-CHAIN INTEGRATION     │     │   OFF-CHAIN INTEGRATION       │
            │  (escrow, market, …)       │     │  (Circle Agent Wallets)       │
            │  6-line Solidity           │     │  wrapAgent()                  │
            └─────────────┬──────────────┘     └──────────────┬────────────────┘
                          │                                   │
                          ▼                                   ▼
          ┌─────────────────────────────────────────────────────────────────┐
          │                       FloatVault.sol                            │
          │                                                                 │
          │   park(amount)    ── mint USYC, credit deposits[caller]         │
          │   withdraw(amount) ─ redeem USYC, pay USDC to caller (<5s)      │
          │   deposits(addr)  ── single source of truth                     │
          │                                                                 │
          │   Deployed: 0xfAe6a9D5b0835ca7e9B090eCe0f57C14899BeDA6 · Arc    │
          └─────────────────────────────┬───────────────────────────────────┘
                                        │
                                        ▼
                          ┌──────────────────────────┐
                          │   USYC (NAV-appreciating) │
                          └──────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────────────┐
  │              Observation, reasoning and adaptation plane                 │
  │                                                                          │
  │   dashboard/      orchestrator UI; runs the autonomous agent loop        │
  │   float-brain/    compiled human-readable ledger + audit decisions       │
  │   landing/        public-facing marketing site                           │
  │                                                                          │
  │   tick → PolicyEngine.score → execute → log                              │
  │   compile (Llama 3.3-70b)  →  Critic (Llama 3.1-8b)                       │
  │   Critic writes a checkbox in audit-recommendations.md                   │
  │   human ticks the box →  fs.watch  →  applyStrategyChange() in <2s       │
  └──────────────────────────────────────────────────────────────────────────┘
```

---

## The five rules every integration follows

These are the safety invariants the templates already enforce. Internalise them once; they apply to escrow, markets, treasuries, and everything in between.

1. **Reserve buffer.** Never park 100 %. Keep ≈ 5 % liquid (the templates use `RESERVE_BPS = 500`).
2. **Recall before distribute.** Always `FLOAT_VAULT.withdraw()` *before* the user-facing `safeTransfer`.
3. **Shortfall handling.** Wrap `withdraw()` in `try / catch`; degrade gracefully rather than locking funds forever.
4. **Single source of truth.** Use `FLOAT_VAULT.deposits(address(this))`, never a contract-local cache.
5. **Reentrancy.** Add `nonReentrant` to anything that touches USDC + an external contract in the same flow.

The prediction-market template extends these into a 4-layer model (reserve, recall-first-pay-second, pro-rata shortfall refund, single-sided auto-cancel). The escrow template extends them with arbiter-collusion blocking (`arbiter != depositor && arbiter != beneficiary`) and a `viaArbiter` event flag for indexer transparency.

`HelloFloat.sol` in the starter kit deliberately *omits* these layers so the integration is visible in its purest form — **don't ship it as-is**. Fork a template instead.

---

## Repository layout

```
float-yield-router/
├── README.md                    ← you are here
│
├── sdk/                         ← the @floatrouter/sdk source
│   ├── src/
│   │   ├── wrapAgent.ts         ← one-line public entry
│   │   ├── FloatClient.ts       ← park / withdraw / wrapPayment / gatewayRecall
│   │   └── CircleCliAdapter.ts  ← Circle Agent Wallet CLI wrapper
│   ├── examples/
│   │   └── wrapAgentDemo.ts     ← the 5-line integration story
│   └── test-e2e-*.ts            ← on-chain Arc Testnet tests
│
├── contracts/                   ← Hardhat + Foundry
│   └── contracts/FloatVault.sol
│
├── dashboard/                   ← Next.js orchestrator + brain UI
│   └── src/lib/
│       ├── float/               ← Orchestrator, PolicyEngine, Evaluator
│       ├── brain/               ← BrainCompiler, BrainIndex, AuditWatcher
│       └── agent/               ← CircleAgentAdapter
│
├── float-brain/                 ← Compiled, human-readable ledger
│   ├── ledger/
│   │   ├── audit-recommendations.md   ← Critic suggestions + human approvals
│   │   ├── system-status.md           ← per-batch compile summary
│   │   └── agent-histories/           ← per-agent narrative ledgers
│   └── concepts/                ← seeded knowledge articles
│
├── landing/                     ← Vite marketing site
│   ├── src/App.tsx              ← hero + features + meet-flo + ecosystem + …
│   └── public/                  ← banner, hero video, mascot images
│
└── ai-engine/                   ← support service (TS)
```

---

## How the autonomous loop actually works

This is the part most yield wrappers skip. FLOAT runs a closed Actor–Critic loop that watches its own decisions and adapts strategy parameters with a human in the loop.

1. **Tick** (every 15 s) — orchestrator pulls a live market snapshot from Arc RPC.
2. **Score** — `PolicyEngine` produces a parkability score per agent (state, volatility, idle time, recent errors, strategy preset).
3. **Decide** — score crosses `parkThreshold` → PARK; below `withdrawThreshold` → WITHDRAW; otherwise HOLD.
4. **Execute** — via `CircleAgentAdapter`. A pre-flight `eth_call` on `deposits[agent]` is the ground truth — no per-agent local cache, which is what prevents `ESTIMATION_ERROR` under shared wallets.
5. **Log** — every decision goes to an in-memory ring + the raw event log under `float-brain/`.
6. **Compile** (hourly + on-demand) — Llama 3.3-70b summarises recent events into per-agent narrative ledgers.
7. **Review** (every *N* decisions) — Llama 3.1-8b Critic reads its own past suggestions + outcomes and proposes one parameter change as JSON.
8. **Approve** — the suggestion appears as a checkbox in `float-brain/ledger/audit-recommendations.md`. A developer changes `- [ ]` to `- [x] Approved`.
9. **Apply** — `AuditWatcher` (`fs.watch`, 500 ms debounce) parses the delta and calls `orchestrator.applyStrategyChange()` — live in under 2 s.

The double-loop is the point: the Critic reads its **own** compiled history before suggesting, so it cannot re-propose a change that already proved ineffective.

---

## Quickstart

### Wrap an agent (10 minutes)

```bash
npm install @floatrouter/sdk
```

> ⚠ The SDK is ESM-only. Set `"type": "module"` in your `package.json` (or use a `.mjs` file) before importing.

```ts
import { wrapAgent } from '@floatrouter/sdk';

const flo = wrapAgent(
  { walletId: 'a1b2…', address: '0xYou', chain: 'ARC-TESTNET' },
  { strategy: 'balanced', vault: 'USYC' },
);

const pay = flo.wrapPayment(async (amount, to) => {
  // your existing payment logic — ethers, viem, Circle CLI, anything
});

await pay(50, '0xRecipient');
```

Full SDK reference: [`sdk/README.md`](./sdk/README.md).

### Run the dashboard (orchestrator + brain + audit flow)

```bash
cd dashboard
npm install
npm run dev          # → http://localhost:3000
```

Requirements: a logged-in Circle Agent Wallet CLI session (`circle wallet login --testnet`). Optional: `CIRCLE_API_KEY` for the HTTP submission path. The dashboard auto-starts an orchestrator running three test agents (`trader-a` / `b` / `c`) against the deployed Arc Testnet vault.

### Run the landing site

```bash
cd landing
npm install
npm run dev          # → http://localhost:5173
```

### Run the SDK end-to-end tests

```bash
cd sdk
npm install && npm run build
node test-e2e-arc.js     # full park + withdraw + payment cycle
node test-e2e-vault.js   # vault-only cycle
```

### Inspect / extend the contract

```bash
cd contracts
forge build && forge test
# Deployed Arc Testnet address: 0xfAe6a9D5b0835ca7e9B090eCe0f57C14899BeDA6
```

---

## Arc Testnet addresses

| Contract     | Address                                                  |
|--------------|----------------------------------------------------------|
| USDC         | `0x3600000000000000000000000000000000000000`             |
| FloatVault   | `0xfAe6a9D5b0835ca7e9B090eCe0f57C14899BeDA6`             |

Chain ID `5042002` · RPC `https://rpc.testnet.arc.network` · Explorer `https://explorer.testnet.arc.network` · USDC faucet `https://faucet.circle.com`.

---

## Risk model — what happens if USYC loses value?

USYC is NAV-based and Treasury-backed; the failure mode is small NAV decline, not a depeg. Even so, every template is built to survive shortfall:

- Recall is wrapped in `try / catch`. A vault revert never locks the principal.
- If the recovered amount is less than the parked principal, the contract enters `SHORTFALL` and refunds **pro-rata** rather than first-come-first-served.
- Markets with a single-sided pool auto-`CANCEL` on resolve, returning every stake intact.
- `skim()` (where present) is blocked during `SHORTFALL` and uses `principal - totalClaimed` as the protected amount — donations can be skimmed safely, depositor funds cannot.

In short: idle dollars *should* earn yield; depositor funds should never be at the mercy of yield infrastructure. That's the line the templates draw.

---

## Hackathon context

Built for the [Agora Agents Hackathon](https://thecanteenapp.com) — Canteen × Circle × Arc, May 2026.

| Dimension (weight)             | FLOAT's claim                                                                                          |
|--------------------------------|--------------------------------------------------------------------------------------------------------|
| **Agentic sophistication 30%** | Actor-Critic loop · RLAIF reviewer · double-loop memory · human-in-the-loop strategy adaptation         |
| **Traction 30%**               | Two production-grade templates + a starter kit; SDK and contract paths both live on Arc Testnet         |
| **Circle tool usage 20%**      | Agent Wallets (CLI + HTTP) · USYC · Gateway · Arc settlement — four of the major tools                  |
| **Innovation 20%**             | Second Brain + AuditWatcher: an LLM-compiled ledger the Critic itself reads before suggesting changes   |

---

## Status

| Component                       | State                                                                  |
|--------------------------------|------------------------------------------------------------------------|
| FloatVault contract             | Deployed on Arc Testnet                                                |
| `@floatrouter/sdk`              | Published to npm · 6 supported chains                                  |
| Circle Gateway recall           | Shipped · 6-step burn-attest-mint                                      |
| Orchestrator loop               | Running locally · 3 traders @ 15 s interval                            |
| Second Brain compile            | Hourly + on-demand via `POST /api/brain {action:'compile'}`            |
| Audit approval flow             | File-watcher live · < 2 s to apply                                     |
| Starter kit                     | Public · [`float-arc-starter-kit`](https://github.com/ronkenx9/float-arc-starter-kit) |
| Prediction-market template      | Public · [`float-arc-prediction-market-template`](https://github.com/ronkenx9/float-arc-prediction-market-template) |
| Escrow template                 | Public · [`float-arc-escrow-template`](https://github.com/ronkenx9/float-arc-escrow-template) |
| Landing site                    | `localhost:5173` · 9 sections                                          |
| Demo video                      | In production                                                          |

---

## Where FLOAT sits in the Arc ecosystem

Circle ships two reference codebases for Arc:

| Repo                                                              | Layer                          |
|-------------------------------------------------------------------|--------------------------------|
| [`circlefin/arc-commerce`](https://github.com/circlefin/arc-commerce)         | Checkout + commerce flows      |
| [`circlefin/arc-p2p-payments`](https://github.com/circlefin/arc-p2p-payments) | P2P USDC transfers             |

FLOAT covers the **layer in between** — what USDC does when it is *not* being spent. The idle moments between actions.

---

## Credits

Built with [Photon](#) (queue / cancellation / recovery), [Arc](https://docs.arc.network), and [Circle](https://developers.circle.com).
Submitted to the Agora Agents Hackathon · Canteen × Circle × Arc · 2026.

> *"All things that are exchanged must be somehow comparable."*
> — Aristotle, *Nicomachean Ethics* V

---

## License

MIT. Fork freely.
