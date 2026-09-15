# Arc mainnet and FLOAT strategy — 15 September 2026

## Executive decision

**FLOAT is not mainnet-ready in its current form, but it can become a promising Arc product if it is repositioned.** The original pitch—wrap idle USDC, place it into USYC, and recall it before a payment—matches Arc unusually well. The current implementation, however, is a testnet demonstration: `FloatVault` only holds USDC, does not subscribe to USYC, and can create unfunded accounting liabilities through `distributeSimulatedYield`. Its SDK also reimplements a testnet-only Gateway flow that Circle now provides through App Kit and Unified Balance Kit.

The strongest version of FLOAT is therefore **not another vault, bridge, or generic yield aggregator**. It is:

> **The policy-aware liquidity controller for autonomous agents and always-on treasuries on Arc: keep every obligation payable, put only provably idle capital to work, and recall it before it is needed.**

This is a conditional **go**. Build only if FLOAT owns the decision and safety layer while delegating commodity execution to Circle App Kit, Unified Balance Kit, Earn Kit, and audited third-party protocols. Do not deploy the existing contract with real funds.

## Evidence labels

- **Verified fact** — stated in current official documentation, an official announcement, current source code, or a dated market-data source.
- **Announced plan** — publicly committed or described by the relevant team, but not yet independently proven live on public Arc mainnet.
- **Inference** — analysis based on the available facts; it is not a claim by Circle or a listed project.

Research cutoff: **15 September 2026, Africa/Lagos**. Arc public mainnet is scheduled for the following day, so “day-one” support below remains announced until it can be verified against public mainnet contracts and live applications.

## Arc status and launch path

### What is verified now

- **Verified fact:** Arc is in private mainnet and is scheduled to open its public mainnet on **16 September 2026**. Circle says more than 100 ecosystem and institutional builders have been integrating with private mainnet. The launch post also says the public release will include an application framework, AI-assisted development tools, tokenized-asset tooling, and ecosystem interfaces. [Arc launch announcement](https://www.arc.io/blog/arc-mainnet-goes-live-on-september-16-2026)
- **Verified fact:** At launch, Arc uses a permissioned validator cohort. Eleven named founding validators are BlackRock, DTCC, Galaxy, Global Payments, ICE, Mastercard, MoneyGram, SBI, Standard Chartered, Sumitomo Corporation, and Visa. [Validator and integration announcement](https://www.arc.io/pressroom/circle-announces-founding-validator-cohort-and-major-integrations-for-arc-ahead-of-september-16-mainnet-launch)
- **Verified fact:** Arc is EVM-compatible, uses USDC as gas, and targets deterministic sub-second finality. Its public materials describe native integration with USDC, CCTP, Gateway, wallets, on/offramps, and Circle developer services. [Arc overview](https://www.arc.io/) and [Arc network docs](https://docs.arc.io/arc-chain)
- **Verified fact:** The current public contract-address page is explicitly testnet-only and says mainnet addresses are not yet available. That means production deployments must wait for, verify, and pin the public mainnet registry rather than copy testnet constants. [Arc contract addresses](https://docs.arc.io/arc/references/contract-addresses)
- **Verified fact:** Arc’s own recent testnet snapshot reports about 19.4 million weekly transactions, 77,619 weekly new accounts, and an average weekly transaction cost of $0.045. Testnet load is evidence of technical activity, not proof of organic mainnet demand. [Arc website](https://www.arc.io/)

### Important launch caveat

Arc’s deployment docs and older product-support tables still contain pre-launch or testnet-only states. For example, current Circle Wallets, Contracts, CCTP, and Gateway pages list Arc Testnet but do not yet show Arc in their mainnet tables. **Inference:** the launch may ship faster than every documentation surface is updated. FLOAT must use a runtime capability registry and fail closed when a supposedly supported mainnet capability or address cannot be verified. [Circle Wallets chains](https://developers.circle.com/wallets/supported-blockchains), [Gateway chains](https://developers.circle.com/gateway/references/supported-blockchains), [CCTP chains](https://developers.circle.com/cctp/concepts/supported-chains-and-domains), and [Circle Contracts chains](https://developers.circle.com/contracts/supported-blockchains)

## Confirmed or publicly announced Arc ecosystem

The categories below intentionally separate “expected live” from “engaged with Arc.” A logo on an ecosystem page is not the same as a deployed, liquid, production application.

### Expected for day one or the mainnet release

- **DeFi and capital deployment — announced plan:** Aave, Aerodrome, FalconX, Galaxy, GSR, Keyrock, Morpho, Nonco, Uniswap, and XFX are named as services expected to be live for borrowing, trading, market making, or capital deployment. Uniswap has a separate confirmation that it will deploy for the September mainnet release. [Arc launch integrations](https://www.arc.io/pressroom/circle-announces-founding-validator-cohort-and-major-integrations-for-arc-ahead-of-september-16-mainnet-launch) and [Uniswap on Arc](https://www.arc.io/blog/how-uniswap-brings-deep-liquidity-for-apps-on-arc)
- **Payments — announced plan:** Rain, Thunes, and Wirex are named for card settlement, regulated consumer access, and cross-border payment flows. [Arc launch integrations](https://www.arc.io/pressroom/circle-announces-founding-validator-cohort-and-major-integrations-for-arc-ahead-of-september-16-mainnet-launch)
- **Wallet, custody, exchange, and data access — announced plan:** Binance Wallet, Chainlink, Fireblocks, Kraken, Ledger, MetaMask, Uniswap Labs, and Upbit are named as expected day-one apps or services. Chainlink Data Feeds, Data Streams, CCIP, and Proof of Reserve are currently verified on testnet. [Arc launch integrations](https://www.arc.io/pressroom/circle-announces-founding-validator-cohort-and-major-integrations-for-arc-ahead-of-september-16-mainnet-launch) and [Chainlink on Arc](https://www.arc.io/blog/how-chainlink-unlocks-new-design-capabilities-on-arc)
- **Tokenized assets — announced plan:** BlackRock is expected to deploy BUIDL on Arc. Circle and DTCC target an integration with DTC-custodied tokenized assets in the second half of **2027**, not launch day. [Arc institutional integrations](https://www.arc.io/pressroom/circle-announces-founding-validator-cohort-and-major-integrations-for-arc-ahead-of-september-16-mainnet-launch)
- **Circle’s application layer — announced plan/current testnet:** App Kit already exposes send, bridge, swap, and Unified Balance interfaces. Its support table shows an Arc mainnet adapter but still lists Arc only in the testnet capability table at the research cutoff. Earn Kit APIs are published for early integration, while its package documentation says production readiness and vault availability remain forthcoming. [App Kit](https://docs.arc.io/app-kit), [supported networks](https://docs.arc.io/app-kit/references/supported-blockchains), and [App Kit package](https://www.npmjs.com/package/%40circle-fin/app-kit)

### Engaged, building, or in pre-launch spotlight—not necessarily live on day one

- **Verified ecosystem participation:** Arc’s official directory includes infrastructure and institutions such as Across, Alchemy, Axelar, BitGo, Blockdaemon, Blockscout, BNY, Bridge, Centrifuge, Chainalysis, Chronicle, Coinbase, Copper, Crossmint, Curve, Dinari, dLocal, Dynamic, Elliptic, Goldsky, LayerZero, Maple, Pimlico, Privy, QuickNode, Rainbow, Ramp Network, and many others. The directory itself does not consistently expose deployment status. [Official Arc ecosystem directory](https://www.arc.io/ecosystem)
- **Consumer money app — announced plan:** Pulsar is building Arc-native balances, payments, card activity, FX, savings, and agentic payment flows around USDC and EURC. [Pulsar spotlight](https://community.arc.io/public/blogs/arc-x-pulsar-consumer-stablecoin-money-movement-on-arc-2026-07-09)
- **Agent infrastructure — verified testnet direction:** Vyper is combining ERC-8004 identity, x402 payments, escrow, subscriptions, splits, and spending limits. RSoft Agentic Bank overlaps with identity, reputation-based risk, USDC treasury management, and atomic settlement. [Vyper on Arc](https://www.arc.io/blog/building-agentic-economic-workflows-with-vyper-on-arc) and [RSoft spotlight](https://community.arc.io/public/clubs/agentic-economy-dofua/videos/event-replay-building-an-agentic-economy-on-arc-with-rsoft-agentic-bank-2026-04-02)
- **Grant pipeline — verified cohort, mainnet status unknown:** Circle’s 2026 grant recipients include Agridex, Blockradar, BuFi, Cashmere Labs, Flezpay, Hurupay, Myaza, Payrit, SFx Money, TruMarket, ViFi Labs, and others. Circle says the next grant phase prioritizes meaningful Arc production deployments. [Circle grant cohort](https://www.circle.com/blog/announcing-the-first-circle-grant-recipients-in-2026) and [grant criteria](https://community.arc.io/public/blogs/circle-developer-grants-program-relaunches-2026-05-14)

## Competitive benchmark

Metrics are a dated snapshot, not durable rankings. DeFiLlama’s current table defines chain TVL as the sum of tracked protocol deposits. Values below were observed on 15 September 2026. [Chain rankings](https://enterprise.defillama.com/chains) and [metric definitions](https://enterprise.defillama.com/data-definitions)

| Network | What it already has | Current evidence | What Arc cannot claim yet |
|---|---|---|---|
| **Ethereum + L2s** | The deepest liquidity, longest security history, mature DeFi, stablecoins/RWAs, multiple clients, open staking, governance, multisigs, insurance, audits, and composability | About $50.6B DeFi TVL and $147.4B stablecoin supply in the cited snapshots; Ethereum’s institutional site says it hosts more than 75% of tokenized RWAs | Comparable capital depth, battle-tested contracts, open validator participation, long-tail assets, mature risk markets, and years of adversarial production history |
| **Solana** | High-volume spot/perps, consumer apps, payments, mobile distribution, DePIN, compressed assets, token extensions, attestations, and now agent payment channels | About $6.0B DeFi TVL, $16.0B stablecoins, $1.79B daily DEX volume, and 2.26M daily active addresses in the current snapshot; official payment tooling reports a $0.0013 median fee | A comparable retail/consumer funnel, native high-throughput order-book culture, mobile surface, mature DePIN, and demonstrated application demand beyond test traffic |
| **BNB Chain** | Binance distribution, large retail base, mature DEX/lending ecosystem, opBNB scaling, Greenfield storage/data economy, and broad low-cost tooling | About $5.6B DeFi TVL and $13.3B stablecoin supply in current snapshots; opBNB and Greenfield are live ecosystem extensions | A giant exchange-led user funnel, integrated decentralized storage, gaming/retail breadth, and years of liquidity incentives |
| **Base** | Coinbase onboarding and distribution, Ethereum liquidity/security inheritance, Mini Apps/social distribution, mature smart-wallet UX, grants and builder rewards | About $5.7B DeFi TVL and 1,103 tracked protocols in the current chain table | Equivalent consumer distribution, a dense native app graph, and proven low-friction acquisition from a major retail exchange |
| **Tron** | Extremely deep USDT settlement and emerging-market payment/remittance habits | About $94.5B stablecoins, 3.48M active addresses, and 10.37M daily transactions in the current snapshot | Established low-cost stablecoin transfer habits, USDT reach, and last-mile distribution across high-usage corridors |
| **Hyperliquid** | A focused, vertically integrated trading product with deep perpetual markets and strong product-market fit | About $4.25B daily perps volume and $14.2B open interest in the current snapshot | A flagship crypto-native product with visibly organic volume and a clear reason for traders to migrate |
| **Plasma** | The closest stablecoin-specialist comparison: deep seeded liquidity, free USDT transfers on selected routes, 100+ launch partners, and a consumer account/card product | Plasma announced $2B day-one stablecoin liquidity; its current site reports $250B+ annual transfer volume and offers Plasma One for send/spend/earn | Pre-positioned public liquidity, zero-fee transfers, a live consumer distribution product, and a year of mainnet operating history |

Supporting sources: [Ethereum RWAs and stablecoins](https://institutions.ethereum.org/rwa), [Solana payments](https://solana.com/solutions/institutional-payments), [Solana payment channels](https://solana.com/news/payment-channels-1-million-payments-per-second), [opBNB](https://opbnb.bnbchain.org/en), [BNB Greenfield](https://docs.bnbchain.org/bnb-greenfield/), [Base builder/distribution surface](https://docs.base.org/wallet-app/build-with-minikit), [Tron snapshot](https://enterprise.defillama.com/chain/tron), [perps snapshot](https://enterprise.defillama.com/perps/chains), and [Plasma mainnet launch](https://www.plasma.org/company/blog/plasma-mainnet-beta-and-xpl).

## What Arc still lacks

These are not claims that no team is building them. They are gaps for which public, production evidence is not yet comparable to established networks.

1. **Proven public-mainnet liquidity and organic users.** Testnet transaction counts can be automated and valueless. Arc needs public TVL, stablecoin supply, DEX depth/slippage, active funded users, retained applications, and fee/revenue history.
2. **A flagship native application.** Aave, Uniswap, Morpho, and major wallets provide credibility, but they are portable protocols. Arc still needs a product users choose *because* it is on Arc.
3. **Permissionless network security and mature governance.** Institutional PoA is a deliberate feature for launch, but it is a different trust model from open validator/staker participation. The transition path must become observable.
4. **Long-tail market structure.** Deep perps, options, insurance, liquidations, intent solvers, risk curators, stablecoin varieties, native assets, and robust secondary markets are not yet publicly proven.
5. **Consumer and emerging-market distribution.** Arc has strong institutions and payments partners, but no public evidence yet of Base-like social distribution, Binance-like exchange reach, Solana-like consumer/mobile culture, or Tron-like remittance habits *on Arc itself*.
6. **Battle-tested incident response.** Audits, bug bounties, public node code, and known operators help, but only live failures demonstrate recovery, governance latency, oracle handling, and bridge/issuer failure behavior.
7. **A clear open-finance identity alongside institutional positioning.** Permissionless contract deployment and compliance-ready features can coexist, but builders need clarity on censorship, asset freezes, privacy availability, governance, and which services require KYC.
8. **Production proof for the full Circle stack.** At the cutoff, public docs remain mixed between testnet and mainnet for Wallets, Gateway, CCTP, Contracts, App Kit, and Earn Kit.

### Where Arc is genuinely differentiated

Arc should not be treated as a weaker clone of general-purpose chains. It has a credible wedge in stablecoin-denominated gas, deterministic finality, Circle-native liquidity and interoperability, configurable privacy, institutional validators, USYC, StableFX, and explicit agent standards. Arc also documents ERC-8004 identity/reputation and ERC-8183 job escrow flows. [Agentic economy docs](https://docs.arc.io/build/agentic-economy), [ERC-8004 quickstart](https://docs.arc.io/arc/tutorials/register-your-first-ai-agent), and [ERC-8183 flow](https://www.arc.io/blog/running-an-agentic-economic-flow-on-arc-with-erc-8183)

## FLOAT audit

### What remains valuable

- The non-custodial intent is correct: the wallet signs and FLOAT should only propose or execute within delegated policy.
- The state machine (`IDLE → WATCHING → PRE_TRADE → EXECUTING → COOLDOWN`) is a useful foundation for spend-readiness.
- Fail-closed behavior on stale balances, wallet-level execution locks, cooldowns, maximum park ratios, and human-reviewed critic suggestions are better foundations than an unconstrained “AI yield agent.”
- The core question—how much can be placed at work without breaking future obligations—is not solved by a bridge or vault SDK.

### Current blockers

1. **The vault produces no yield.** `contracts/contracts/FloatVault.sol` transfers USDC into itself. It never calls the USYC Teller or another yield protocol. The comments explicitly label the real interaction as future work.
2. **The accounting can become insolvent.** `distributeSimulatedYield` increases a user’s deposit balance without transferring matching USDC. A withdrawal can therefore fail or let earlier users consume liquidity owed to later users.
3. **It is not an ERC-4626 vault and has no share-price model.** Deposits are recorded 1:1 in USDC units, so NAV-appreciating USYC, fees, rounding, gains, and losses are not handled.
4. **The public positioning overstates implementation.** The README says the vault mints/redeems USYC and advertises production-grade templates, while the deployed contract is a custody demo.
5. **The Gateway implementation is testnet-bound and redundant.** It hardcodes testnet contracts, a testnet API, domain mappings, and manually constructs burn intents. Current App Kit/Unified Balance Kit already owns this orchestration and its edge cases. [Unified Balance architecture](https://www.arc.io/blog/unified-balance-kit-rethinking-payment-and-treasury-app-architectures)
6. **The “under 500ms” cross-chain claim is unsafe.** Gateway’s own table shows source-chain confirmation can take roughly 13–19 minutes on Ethereum-derived chains before funds become spendable; Arc Testnet itself is fast. End-to-end latency must include vault redemption, source finality, attestation, destination mint, retries, and liquidity limits. [Gateway timing](https://developers.circle.com/gateway/references/supported-blockchains)
7. **Money uses JavaScript `number`.** Converting `amount * 1_000_000` with rounding is not acceptable for production accounting. Inputs, balances, quotes, fees, and limits must be decimal strings or integers/`bigint` end to end.
8. **The reserve model mixes incompatible units.** `avgSize` is dollars while `stdDevInterval` is hours; adding them does not produce a meaningful reserve. It also ignores scheduled obligations, tail spend, venue exit capacity, transaction failure probability, and cross-chain settlement time.
9. **USYC is not a retail default.** USYC requires allowlisting, is limited to eligible non-U.S. institutions, and has a stated $100,000 minimum. Transfers can be halted through its entitlement system. Near-instant redemption is subject to available Teller liquidity. [USYC overview](https://developers.circle.com/tokenized/usyc/overview), [USYC controls](https://help.circle.com/support/en/usyc-subscription-redemption-and-functionality-explained?id=kb_article_view&sysparm_article=KB0010561), and [Arc USYC requirements](https://docs.arc.io/arc/references/contract-addresses)
10. **No production security case.** The repo does not contain implementation-specific invariant tests for solvency/share accounting, audited adapters, emergency pause/recovery, upgrade governance, slippage/min-out protection, idempotent workflow recovery, or a mainnet deployment evidence trail.

## Recommended product thesis

### Product: FLOAT Liquidity Autopilot

FLOAT should be a **non-custodial policy engine and observability layer** that sits above official execution kits and approved yield venues.

Its contract with a customer is measurable:

- “Keep at least the next *N* hours of forecast obligations immediately spendable.”
- “Place only the surplus into eligible venues.”
- “Prove that every active job, allowance, cross-chain transfer, and withdrawal is covered.”
- “If data, liquidity, entitlement, or execution health degrades, stop allocating and recall safely.”

### Why this has a chance

- **Arc fit:** stablecoin gas and deterministic finality make dollar-denominated liquidity service levels easier to reason about.
- **Agent fit:** ERC-8004 identity and ERC-8183 jobs provide observable counterparties, job obligations, and outcomes that can inform reserve policy.
- **Ecosystem gap:** Circle’s kits execute actions; they do not decide whether an agent can safely afford to lock capital, how much runway it needs, or which risk limits apply across a portfolio.
- **Credible moat:** integrations and UI are copyable; a high-quality obligation model, failure dataset, simulation harness, policy templates, and verified recall performance can compound.

### Product boundaries

- **Circle App Kit / Unified Balance:** bridge, send, swap, balances, fee estimates, delegations, pending/in-motion state.
- **Earn Kit / venue adapters:** discover, quote, deposit, withdraw, and track supported vaults when production-ready.
- **FLOAT:** obligation forecasting, liquidity buckets, eligibility policy, venue scoring, transaction plans, simulation, circuit breakers, execution evidence, and operator alerts.
- **Wallet/custodian:** keys, signing policy, recovery, and transaction authorization.

### Two customer modes

1. **Agent operating balance:** small and medium wallets use permissionless lending/vault adapters where allowed. The goal is spend readiness, not maximum APY.
2. **Institutional treasury:** eligible non-U.S. institutions can include USYC after entitlement and liquidity preflight. Policy reporting, view-only audit access, and explicit redemption-capacity monitoring are mandatory.

Do not silently send an ineligible user into USYC. Venue eligibility must be part of the policy object and quote response.

## Mainnet upgrade plan

### P0 — required before any real funds

- Remove or clearly archive the demo `FloatVault`; do not migrate balances or reuse its accounting as a production vault.
- Replace handwritten Gateway orchestration with current App Kit/Unified Balance Kit and model `confirmed`, `pending`, `committed`, and `withdrawable` balances separately.
- Build a signed chain/capability registry: chain ID, RPC, explorer, Circle service support, contract addresses, bytecode hashes, token decimals, and last verification time. Fail closed on mismatch.
- Represent all monetary values as decimal strings and raw integer amounts; ban JavaScript floating-point arithmetic from execution paths.
- Replace the invalid reserve formula with an obligations model: scheduled payments + active ERC-8183 job commitments + a quantile of unscheduled spend + gas/fee buffer + venue-exit buffer.
- Add entitlement checks for USYC before quote and execution; expose $100,000 minimum, jurisdictional eligibility, fees, current Teller liquidity, pause state, and actual net yield.
- Create a venue adapter interface with explicit `maxDeposit`, `maxWithdraw`, `previewDeposit`, `previewWithdraw`, quote expiry, slippage/min-out, liquidity, and risk metadata. Start with one audited permissionless USDC venue and add USYC only with a verified eligible design partner.
- Add idempotency keys and a durable workflow journal for approve/deposit/withdraw/bridge/spend. Recovery must resume or compensate after a crash without double execution.
- Add per-wallet limits, venue concentration caps, minimum net-yield threshold, maximum recall latency, daily loss/fee caps, emergency pause, allowance revocation, and read-only shadow mode.
- Add unit, integration, fork, fuzz, and invariant tests. At minimum prove assets ≥ liabilities for any pooled component, no unauthorized withdrawal, bounded rounding loss, replay resistance, and safe behavior under stale oracle/RPC/Gateway/Teller conditions.
- Correct every public claim and benchmark full end-to-end recall latency at p50/p95/p99. Never describe testnet or simulated yield as production.

### P1 — the differentiating beta

- Integrate ERC-8004 identity so policy and performance history attach to an agent, while keeping external reputation as a signal rather than a self-issued guarantee.
- Watch ERC-8183 jobs and reserve funds for funded/accepted work before allocating surplus.
- Ship three transparent policy templates: `always-liquid`, `scheduled-treasury`, and `agent-runway`. Every decision should emit a deterministic explanation and reproducible input snapshot.
- Add scenario simulation: payment spikes, withdrawal delays, USYC halt, lending utilization shock, RPC outage, cross-chain delay, and stablecoin issuer freeze.
- Provide an SDK and webhook/API layer that any Arc wallet or app can adopt; Circle Wallets should be the first adapter, not the only wallet architecture.
- Pilot with 3–5 Arc teams that have recurring USDC obligations. Measure capital utilization, net yield after fees, payment success, recall latency, and operator interventions.

### P2 — defensibility and distribution

- Add multiple risk-curated venues only after independent review; do not optimize nominal APY across unaudited pools.
- Publish a live “liquidity readiness” dashboard and anonymized benchmark dataset.
- Add policy-as-code, Safe/Fireblocks/custodian approval paths, configurable privacy support, and audit exports for institutional users.
- Offer embedded revenue: a transparent platform fee on realized incremental yield or enterprise subscription. Avoid a transaction tax on emergency recalls.
- Pursue a Circle Developer Grant with evidence from a shadow pilot, not a concept deck. Grant criteria explicitly reward existing shipping ability, credible traction, production milestones, and ecosystem impact.

## 90-day roadmap

| Window | Deliverable | Proof gate |
|---|---|---|
| **Days 0–7** | Mainnet capability/address verifier, corrected claims, App Kit migration spike, money-type refactor, shadow-only policy service | Public mainnet chain/address/code checks; no signing authority; replayable decision traces |
| **Days 8–30** | One permissionless USDC venue adapter, durable workflow engine, obligation-aware reserve model, failure simulator | Fork/invariant tests; 7-day shadow run; zero missed simulated obligations; net-yield calculation includes all fees |
| **Days 31–60** | Closed beta with 3–5 Arc apps; ERC-8004 and ERC-8183 signals; optional USYC design partner | Real low-limit transactions; measured p50/p95/p99; explicit eligibility evidence; incident runbook exercised |
| **Days 61–90** | Audited beta, SDK docs, readiness dashboard, grant/partner packet | External review closed; limits enforced onchain/offchain; at least two retained pilots and one repeatable integration path |

## Security and operational risks

- **Venue risk:** smart-contract exploits, utilization spikes, withdrawal queues, oracle errors, governance attacks, and insolvency can erase far more than the earned yield.
- **Issuer/entitlement risk:** USDC and USYC are permissioned assets with freeze or halt paths; USYC also has investor eligibility constraints.
- **Cross-chain risk:** a unified visible balance is not the same as immediately spendable funds. Finality and in-motion state must be explicit.
- **Automation risk:** an incorrect forecast can miss the exact payment the product promises to protect. Hard limits and deterministic policies must dominate the LLM.
- **Key/delegation risk:** “non-custodial” does not mean harmless. A broad delegate or allowance can still move funds. Scope, expiry, revocation, and spend limits are required.
- **Economic risk:** on small balances, transaction and operational costs can exceed yield. At 4% APY, $100 earns roughly $0.011/day; one $0.045 transaction consumes about four days of gross yield. The router needs a break-even threshold and batching.
- **Launch risk:** deploying on day one maximizes attention but minimizes certainty. The safe launch is a read-only/shadow product on 16 September, followed by capped real-money pilots only after addresses, services, and venues are verified.

## Kill criteria

Stop or materially change the product if any of the following remains true after the beta window:

1. Official Earn Kit absorbs obligation-aware reserve management and policy controls, leaving FLOAT as a thin wrapper.
2. Fewer than two pilot teams run recurring real USDC obligations through FLOAT after 60 days.
3. Net yield after gas, venue fees, Float fees, and idle buffers is below 1% annualized for the target customer profile.
4. P99 recall cannot meet the customer’s payment service level under realistic source-finality and venue-liquidity conditions.
5. No legally eligible USYC design partner exists and permissionless venues do not offer enough risk-adjusted yield to justify automation.
6. The system requires custody, unrestricted wallet authority, or misleading yield guarantees to appear useful.

## Bottom line

**Do not launch the old FLOAT contract on Arc mainnet. Launch a verified, shadow-mode FLOAT Liquidity Autopilot.** Its initial demo should show an Arc agent with active ERC-8183 obligations, a unified multichain USDC balance, and one approved yield venue. FLOAT reserves the next obligations, calculates the true break-even point, allocates only the surplus, then proves a recall without missing payment.

That demo expresses something Arc’s primitives make unusually strong and that Aave, Uniswap, Gateway, and Earn Kit do not independently provide: **capital productivity with an explicit promise of operational readiness.**

## Sources

Primary sources were preferred throughout. Core references:

- [Arc public mainnet date and launch scope](https://www.arc.io/blog/arc-mainnet-goes-live-on-september-16-2026)
- [Founding validators, expected day-one apps, BUIDL, and DTCC timing](https://www.arc.io/pressroom/circle-announces-founding-validator-cohort-and-major-integrations-for-arc-ahead-of-september-16-mainnet-launch)
- [Official Arc ecosystem directory](https://www.arc.io/ecosystem)
- [Arc network architecture and feature set](https://docs.arc.io/arc-chain)
- [Arc testnet contracts and USYC requirements](https://docs.arc.io/arc/references/contract-addresses)
- [Circle App Kit](https://docs.arc.io/app-kit)
- [Unified Balance architecture boundaries](https://www.arc.io/blog/unified-balance-kit-rethinking-payment-and-treasury-app-architectures)
- [Circle Gateway supported chains and confirmation timing](https://developers.circle.com/gateway/references/supported-blockchains)
- [USYC product, restrictions, and mechanics](https://developers.circle.com/tokenized/usyc/overview)
- [Arc agent identity and job-settlement standards](https://docs.arc.io/build/agentic-economy)
- [Current cross-chain ecosystem metrics](https://enterprise.defillama.com/chains)
- [Current stablecoin supply by chain](https://enterprise.defillama.com/stablecoins/chains)
- [Current perpetual-market volume by chain](https://enterprise.defillama.com/perps/chains)

