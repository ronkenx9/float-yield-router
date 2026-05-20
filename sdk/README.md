# @floatrouter/sdk

[![npm](https://img.shields.io/npm/v/@floatrouter/sdk.svg?style=flat-square&color=cyan)](https://www.npmjs.com/package/@floatrouter/sdk)
[![License: MIT](https://img.shields.io/badge/license-MIT-white?style=flat-square)](../LICENSE)

**Wrap any Circle Agent Wallet with yield-bearing idle USDC. One call. Ten minutes.**

```ts
import { wrapAgent } from '@floatrouter/sdk';

const flo = wrapAgent(myAgent, { strategy: 'balanced', vault: 'USYC' });
const safePay = flo.wrapPayment(executePayment);
//  ↑ FLOAT auto-recalls from USYC if your wallet is short, then pays.
```

That's it. The rest of this README is the long version.

---

## Install

```bash
npm install @floatrouter/sdk
# or
pnpm add @floatrouter/sdk
# or
yarn add @floatrouter/sdk
```

> ⚠ **`@floatrouter/sdk` is ESM-only.** A fresh `npm init -y` defaults to CommonJS, which will fail to import this package with `TS1479` / `ERR_REQUIRE_ESM`. Fix one of two ways:
>
> 1. **Set `"type": "module"`** in your `package.json` (and use `.js` files with ES `import` syntax), or
> 2. **Use the `.mjs` extension** on the file that imports from the SDK.
>
> If you're using TypeScript, also set `"module": "NodeNext"` and `"moduleResolution": "NodeNext"` in `tsconfig.json`.

Peer requirements:
- **Node.js 18+** (uses native `fetch`)
- **Circle Wallet CLI**, logged in. Install: see [Circle's CLI docs](https://developers.circle.com/w3s/docs/programmable-wallets-cli). Verify with `circle whoami`, then run `circle wallet login --testnet` once before using the SDK.
- (Optional) `CIRCLE_API_KEY` env var if you want the HTTP submission path
- (One-time) `circle terms accept` — the SDK will never accept Circle's Terms on your behalf, by design

---

## Quickstart — five lines

```ts
import { wrapAgent } from '@floatrouter/sdk';

const myAgent = {
  walletId: 'a1b2c3d4-e5f6-…',   // your Circle Agent Wallet ID
  address:  '0xYourAgentAddress',
  chain:    'ARC-TESTNET',
};

const flo = wrapAgent(myAgent, { strategy: 'balanced', vault: 'USYC' });
```

The returned object exposes four things:

| Method                       | What it does                                                                 |
|------------------------------|------------------------------------------------------------------------------|
| `flo.park(amount)`           | Manually park `amount` USDC into the USYC vault                             |
| `flo.withdraw(amount)`       | Manually recall `amount` USDC back to your wallet                            |
| `flo.wrapPayment(fn)`        | Wrap a payment fn so it auto-recalls from the vault if your wallet is short |
| `flo.gatewayRecall(params)`  | Cross-chain recall via Circle Gateway (burn-attest-mint, ~500ms cross-chain)|

Plus `flo.client` and `flo.adapter` if you need the underlying primitives directly.

---

## API reference

### `wrapAgent(agent, options)`

```ts
function wrapAgent(
  agent: { walletId: string; address?: string; chain: string },
  options?: {
    strategy?: 'aggressive' | 'balanced' | 'conservative';
    vault?: 'USYC';
  }
): FloatedAgent;
```

#### `agent`

| Field      | Required | Notes                                                                |
|-----------|----------|----------------------------------------------------------------------|
| `walletId` | yes      | Circle Agent Wallet UUID                                             |
| `address`  | optional | `0x…` address. If omitted, the SDK resolves it via the Circle CLI.  |
| `chain`    | yes      | One of: `'ARC-TESTNET'`, `'ETHEREUM'`, `'BASE'`, `'AVALANCHE'`, `'ARBITRUM'`, `'OPTIMISM'` |

The chain is mapped internally to the correct USDC contract address.

#### `options.strategy`

Determines your **liquid reserve ratio** — the share of total balance the SDK tries to keep on-wallet (vs. parked).

| Preset         | Liquid reserve | Use case                                                 |
|---------------|----------------|----------------------------------------------------------|
| `aggressive`   | **40%**        | High-frequency trading agents that act often             |
| `balanced`     | **35%** (default) | Most trading/portfolio agents                         |
| `conservative` | **55%**        | Treasury / settlement agents that act rarely but in bulk |

#### `options.vault`

Currently only `'USYC'` is supported. Future vaults will land here.

---

### `flo.wrapPayment(executor)`

The most useful method. Wraps **any payment function you already have** so it auto-recalls from the vault if your liquid balance is short.

`executor` is a function *you write* that performs the actual payment using whatever method you prefer — Circle CLI, ethers.js, viem, fetch to a custom endpoint, anything. FLOAT doesn't dictate how you move USDC; it just guarantees the wallet has the balance before your code runs.

```ts
import { wrapAgent } from '@floatrouter/sdk';

const flo = wrapAgent(myAgent, { strategy: 'balanced', vault: 'USYC' });

// 1. Define your existing payment logic. The shape is up to you —
//    whatever args you need, returning whatever your downstream wants.
async function payVendor(amount: number, recipient: string) {
  // ↓ Your real payment code goes here. Examples:
  //     - call your existing Circle CLI / ethers helper
  //     - hit a backend endpoint that handles the on-chain submit
  //     - use flo.adapter directly: await flo.adapter.transfer(recipient, amount)
  console.log(`paying ${amount} USDC to ${recipient}`);
}

// 2. Wrap it. The wrapped fn has the same signature as the original.
const safePay = flo.wrapPayment(payVendor);

// 3. Call it like normal. FLOAT will recall from USYC first if needed.
await safePay(50, '0xRecipient');
//  ↑ if wallet has < $50 liquid, FLOAT recalls the deficit from the
//    vault, waits for confirmation, then runs `payVendor`.
```

Recall is a **single onchain instruction** on Arc — typically <5 seconds end-to-end. If the vault has insufficient deposits to cover the deficit, the wrapped fn throws *before* attempting the payment, so you never get a half-completed state.

---

### `flo.park(amount)` / `flo.withdraw(amount)`

Manual control if you want to bypass the auto-routing logic.

```ts
await flo.park(100);        // park $100 USDC into the vault
// …time passes, yield accrues…
await flo.withdraw(50);     // recall $50 back to wallet
```

Both confirm onchain before returning.

---

### `flo.gatewayRecall(params)` — cross-chain via Circle Gateway

When your agent on Chain A needs USDC, but you've parked into a vault on Chain B, Circle Gateway lets you recall cross-chain in ~500ms (via off-chain attestation + same-block mint on the destination).

```ts
await flo.gatewayRecall({
  amount:             100,
  sourceChain:        'BASE',
  sourceVaultAddress: '0xYourBaseVault',
  sourceUsdcAddress:  '0x036CbD53842c5426634e7929541eC2318f3dCF7e',  // USDC on Base
  sourceCLI:          baseAgentAdapter,  // a separate CircleCliAdapter for the source chain
});
//  ↑ Burns USDC on Base, gets attestation from Gateway API,
//    mints fresh USDC on your `agent.chain`. Settled in ~1 block.
```

This is the 6-step burn-attest-mint flow:
1. Build burn intent
2. Sign EIP-712 typed data via Circle CLI on source chain
3. POST signed intent to `https://gateway-api-testnet.circle.com/v1/transfer`
4. Receive attestation + operator signature
5. Submit `gatewayMint(bytes, bytes)` on destination chain
6. Wait for confirmation

---

## Strategy details

The strategy preset chooses your **liquid reserve ratio** — but the SDK has more knobs internally, surfaced via the `FloatClient` primitive if you need them:

```ts
import { FloatClient } from '@floatrouter/sdk';

const client = new FloatClient({
  vaultAddress:    '0xfAe6a9D5b0835ca7e9B090eCe0f57C14899BeDA6',
  usdcAddress:     '0x3600000000000000000000000000000000000000',
  agentWalletId:   myAgent.walletId,
  circleCLI:       new CircleCliAdapter({ walletId: myAgent.walletId, chain: 'ARC-TESTNET' }),
  liquidReserve:   0.40,
  // … more options
});
```

Inside the dashboard ([`dashboard/src/lib/float/PolicyEngine.ts`](https://github.com/ronkenx9/float-yield-router/blob/main/dashboard/src/lib/float/PolicyEngine.ts)), there's a full scoring engine with these inputs:

| Input                       | Effect                                                          |
|-----------------------------|-----------------------------------------------------------------|
| Agent state                 | EXECUTING / COOLDOWN agents never get parked                    |
| Market volatility           | High vol pushes the parkability score *down*                    |
| Idle time                   | Longer idle pushes score *up*                                    |
| Last action time            | Cooldown windows after park / withdraw                          |
| Recent error count          | Errors in the last hour penalize score                          |
| `parkThreshold` (per strategy) | Score must exceed this to PARK                              |
| `withdrawThreshold`          | Score must drop below this to WITHDRAW                         |

If you're using the dashboard's full orchestrator (rather than just the SDK), the RLAIF Critic can tune these per-agent in real time.

---

## Examples

See [`examples/wrapAgentDemo.ts`](https://github.com/ronkenx9/float-yield-router/blob/main/sdk/examples/wrapAgentDemo.ts) for the canonical 10-line integration.

For end-to-end onchain tests (you'll need a logged-in Circle CLI session + an Arc Testnet wallet):
- [`test-e2e-arc.ts`](https://github.com/ronkenx9/float-yield-router/blob/main/sdk/test-e2e-arc.ts) — full park + withdraw + payment cycle against Arc Testnet
- [`test-e2e-vault.ts`](https://github.com/ronkenx9/float-yield-router/blob/main/sdk/test-e2e-vault.ts) — vault-only cycle (no payment), proves approve → park → recall

To run them locally, clone the repo first:

```bash
git clone https://github.com/ronkenx9/float-yield-router.git
cd float-yield-router/sdk
npm install && npm run build
node test-e2e-arc.js
```

---

## Troubleshooting

### `[FLOAT] Circle CLI Terms gate hit`
The Circle CLI requires interactive Terms acceptance. Run `circle terms accept` once.
**The SDK will never accept Terms on your behalf** — that's an intentional safety boundary.

### `[FLOAT] Circle CLI session expired`
Re-run `circle wallet login --testnet`.

### `ESTIMATION_ERROR` on withdraw
Your in-memory `parkedBalance` cache is stale (another agent on the same wallet may have already withdrawn). The dashboard's adapter does a pre-flight RPC read to avoid this; if you're using the raw SDK, do the same:

```ts
import { rpcCall } from '@floatrouter/sdk';
// eth_call vault.deposits(agent) before each withdraw
```

### Transactions stuck in PENDING
Arc Testnet is fast — most TXs confirm in <5s. If you hit PENDING > 25s, the SDK auto-calls `circle transaction accelerate`. If that fails, check the Circle CLI is logged in and your wallet has gas.

### `429` rate-limit errors
You're calling the Circle CLI too frequently. The dashboard's adapter has a per-wallet rate limiter; if you're calling the SDK directly from multiple agents sharing one wallet, serialize them or add a `await sleep(600)` between calls.

---

## Versioning

Pre-1.0. APIs may change between minor versions.

---

## License

MIT — see [LICENSE](https://github.com/ronkenx9/float-yield-router/blob/main/LICENSE) at the repo root.
