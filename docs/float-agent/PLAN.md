# FLOAT — Personal liquidity agent

Product and implementation plan · 15 September 2026

## 1. Decision and scope

Pivot FLOAT from idle-treasury routing to a retail liquidity-provider product for Arc. Flo is the agent; FLOAT is the product. Keep the name, mascot and cinematic marketing design. Existing code is a reference, not a requirement. This document supersedes the treasury-autopilot recommendation in `../arc-mainnet-float-strategy-2026-09.md` for the new product direction.

**Positioning:** Earn trading fees. Skip the LP work. Add USDC, choose your risk, and let Flo manage the liquidity position on Arc.

**Product promise:** Translate a user's preferences into explicit limits, help evaluate compatible pools, propose cost-aware position changes, execute only with the required authority, and explain the actual result.

**Not a promise:** fixed returns, principal protection, always-profitable rebalancing, guaranteed exits, or an AI that predicts winning tokens.

**Two-phase vision (recorded 16 September 2026):** Phase 1 is the LP agent above — narrow, approval-first, shippable. Phase 2 generalizes Flo into one Arc bot (swaps, broader DeFi) with LP as the first skill. Phase 2 reuses the same policy contract: more action types and venue adapters, all gated by the existing allowlists, caps, and fail-closed checks. `SWAP` and any new action require a policy extension plus fresh user approval; selecting a risk mode never silently grants autonomy. The safety rails matter more in Phase 2, not less.

This task delivers the plan and marketing copy only. LP contracts, the agent service, billing, account permissions and mainnet execution remain future implementation. Do not rebrand the existing treasury dashboard as a working LP manager.

## 2. Customer and demand hypothesis

Primary: crypto-native users who understand tokens and wallets but find LP discovery, range maintenance and honest P&L tedious. Interview both existing LPs and traders considering their first position. Avoid marketing volatile LPs as a savings account for beginners.

Core job: “Help me decide where and how to provide liquidity, within rules I understand, without checking every pool constantly.”

Reasons to return: a position needs attention, a proposed change requires approval, exposure changes, fees become worth collecting, or a performance statement is ready. Retention should come from useful management, not a stream of unnecessary actions.

### Competitive evidence and limits

| Evidence | Meaning for FLOAT | What it does not prove |
|---|---|---|
| Revert documents LP analytics and automation [R1] | This is an established product category | Arc demand or FLOAT's profitability |
| ArcTools markets terminal, aggregation, wallet intelligence and sniper features [R2] | Generic retail trading tools are not an empty category | Verified usage or safe execution |
| Barker publishes an Arc-oriented ALM engine [R3] | Direct technical competition already exists | A dominant retail LP interface |
| TrustSwap markets its Arc creator-tool suite [R4] | Basic locks and vesting are not an obvious gap | Mainnet deployment of every advertised feature |

Working hypothesis: retail LP discovery, accountable automation and after-cost reporting are a more defensible opening than another launchpad. This is not a claim that Arc LP tooling is unoccupied. Repeat the competitor check before build commitment and before launch.

### Validation before expensive execution work

Proposed decision thresholds, not research findings:

1. Interview 12 target users; at least 5 show an existing LP workflow and its pain points.
2. Recruit 5 design partners willing to use read-only tracking weekly; record account size bands voluntarily, never private keys.
3. Identify at least 3 compatible pools on one verified venue with public LP access, usable history and sustained organic activity. Measure at least 14 days; do not extrapolate opening-hour fees into a yearly return.
4. Test a subscription price with explicit willingness-to-pay questions; distinguish an interested follower from someone willing to pay.
5. Stop or narrow scope if no usable pools exist, fee activity collapses, users primarily want token speculation, or an incumbent already meets the need at lower cost.

## 3. User journey and MVP screens

1. **Discover:** read-only pool list; no wallet required. Show venue, assets, liquidity, observed volume and fees, sample window, data freshness, risk flags and eligibility reason.
2. **Connect:** verify chain and wallet ownership. Explain account authority before requesting signatures. Separate login, token allowance and automation authorization.
3. **Set a goal:** natural-language input or preset. Ask clarifying questions when amounts, token eligibility or limits are ambiguous. Never infer permission for extra capital.
4. **Review policy:** show enforceable rules, exclusions and costs in ordinary language. Explicitly approve a versioned policy.
5. **Review a proposal:** display position, range, token amounts, required swaps, price assumptions, minimum received, gas estimate, expiry and worst-case modeled scenarios. Label simulations, not forecasts.
6. **Approve and execute:** user signs each action in the first release. Show submitted, confirmed, failed or reconciliation-needed state using actual receipts.
7. **Manage:** positions, net results, fee components, alerts and action history. Pause future activity; explain that pause does not unwind existing exposure.
8. **Exit:** withdraw position tokens independently; optionally quote a swap to USDC. If swap fails, show withdrawn token inventory rather than “exit complete in USDC.”

MVP screens: onboarding/policy, pool discovery, position detail, proposal inbox, activity/performance, settings/billing. A chat box is an input and explanation surface, not the source of financial truth.

## 4. Modes and policy contract

Use **Calm**, **Balanced**, **Aggressive**, and **Custom**. Calm means relatively restrictive—not safe. Disable any preset for which suitable pools are unavailable. Never fill the allocation merely to make a mode look active.

| Field | Calm | Balanced | Aggressive |
|---|---|---|---|
| Assets | Narrow approved list | Broader approved list | Explicit opt-in to volatile assets |
| Range | Wider starting range | Intermediate, cost-aware | Tighter ranges permitted |
| Concentration | Lower caps | Moderate caps | Higher caps only after confirmation |
| New pools | Excluded initially | Approval required | Approval required in MVP |
| Activity | Lower frequency | Cost-aware adjustment | More frequent allowed, never required |

These are design directions; numerical defaults require replay evidence and user testing. All MVP modes require transaction approval. Do not silently grant autonomy by selecting Aggressive.

Required policy fields:

```text
policyId, version, userId, chainId, effectiveAt, expiresAt
mode, accountAddress, capitalBudgetUsdcAtomic
allowedTokens[], allowedPools[], allowedContracts[], allowedSelectors[]
maxPositionBps, maxTokenExposureBps, minUsdcReserveAtomic
maxSlippageBps, maxPriceImpactBps, maxGasPerActionAtomic
dailyExecutionBudgetAtomic, maxActionsPerDay, cooldownSeconds
maxQuoteAgeSeconds, maxDataAgeSeconds, approvalMode
allowNewPoolEntry, allowRangeChange, allowFeeCollection, allowExitSwap
pauseState, userApprovalDigest
```

Store integers/decimal strings, not JavaScript floating-point currency. Aggregate exposure includes inventory already held in LPs, wallet tokens and pending actions. Validate policy consistency: reserves plus proposed allocations must fit the budget, and pool-level caps must not bypass token-level concentration. Policy changes invalidate outstanding proposals. Changes increasing authority require new user approval.

Drawdown alerts may suggest an exit, but do not guarantee execution or loss caps. A strict spending/slippage limit may prevent an emergency exit; tell users explicitly and request revised approval rather than bypassing it.

## 5. Agent and execution architecture

```text
User goal → typed policy draft → user approval → versioned policy
                                             ↓
Verified pool data → deterministic strategy → proposal + simulation
                                             ↓
                                 policy check + user signature
                                             ↓
                                  executor → receipt → ledger
                                             ↓
                                  evidence-backed explanation
```

### Separation of responsibilities

- **Language model:** interpret preferences, ask questions, explain structured evidence. Output validated schemas; no signing keys, arbitrary contract calldata or self-authorized policy changes.
- **Market indexer:** ingest pool events/state, block cursors and timestamps; deduplicate and reconcile. Cache results but mark stale data unavailable for execution.
- **Strategy engine:** deterministic eligibility/range/cost calculations. HOLD is a first-class outcome. Use a pessimistic fee estimate and cost buffer; avoid claiming expected fees are guaranteed.
- **Risk/policy engine:** reject unauthorized assets, selectors, recipients, budget overruns, stale quotes and changed policies. Recheck immediately before signing/submission.
- **Venue adapter:** typed quote, simulate, mint/add, decrease/withdraw, collect and position-read interfaces. One verified adapter first. Treat v3, v4 and Aerodrome as different implementations, not interchangeable names.
- **Executor:** idempotency key, account-level serialization, durable job state, transaction hash and receipt handling. Never blindly resubmit after a timeout.
- **Ledger:** source-of-truth cash flows, positions, inventory and fee records. Explanations read the ledger, not the reverse.
- **Notifications:** proposal, policy breach, execution failure, data outage and meaningful summary. No secret material or sensitive full balances in default public previews.

### Account model

MVP: user signs each transaction through their existing wallet. Avoid a pooled custody vault. Later: evaluate a user-owned smart account with audited, narrowly scoped session permissions. Prove revocation, expiry, recipient restrictions, spending limits and owner exit independent of FLOAT before enabling automation.

An application-controlled MPC wallet is not automatically user-controlled simply because FLOAT does not export its private key. Document who can authorize transfers, recovery and upgrades. Do not claim “non-custodial” until the chosen implementation justifies it.

### Execution state machine

`DRAFT → SIMULATED → AWAITING_APPROVAL → APPROVED → SUBMITTING → SUBMITTED → CONFIRMED → RECONCILED`

Other states: `REJECTED`, `EXPIRED`, `CANCELLED`, `FAILED`, `RECONCILIATION_REQUIRED`.

Persist intent before submission. Bind approval to policy version, chain, account, calldata digest, value, spender, expiry and quoted bounds. New quotes outside approved bounds require new approval. Cancellation after broadcast is not guaranteed. Reconcile pending transactions by hash/nonce and account state before any retry. Duplicate notifications must not cause duplicate transactions.

## 6. Arc and venue readiness

Current official documentation and installed Arc guidance still identify testnet configuration [R5–R7]. Earlier launch reporting is not a deployment configuration. Mainnet integration is a later verification gate; never copy a third-party RPC or assumed chain ID into execution code.

For each environment record: official chain ID, RPC sources, explorer, verified contract addresses, bytecode, ABI/version, deployment source, supported wallet operations and integration-test date. Refuse execution on mismatches or missing bytecode.

Arc exposes native USDC and the USDC ERC-20 view of the same funds. Do not add both balances. Use 6-decimal ERC-20 units for application amounts and 18-decimal native units only at gas/value boundaries; test conversions and reserve handling [R7]. Review EVM differences and event-emitter behavior before writing the indexer [R6].

Start with a standard concentrated-liquidity venue only after verification. Uniswap v3 is the first adapter candidate [R8], not a promised Arc deployment. Defer arbitrary v4 hooks, fee-on-transfer/rebasing tokens, leverage, incentives harvesting and cross-chain management. A launchpad's locked creator LP fees do not belong to new FLOAT LPs. Verify public position creation and actual fee ownership for every supported pool.

ACTFUN (observed launch UI, September 2026) is a pool SOURCE candidate, not a venue shortcut: bonding-curve trades are not LP positions; creator-locked graduation LP (70/30 creator/platform split) is excluded; only graduated PUBLIC pools (V3 0.30% full-range or V4 native-USDC, USDC-only pair live at observation) may enter eligibility screening, subject to the same 14-day history, bytecode verification, and readiness gates. V3 and V4 remain different implementations. See `packages/venues/src/actfun.ts` for the classification rules. No mainnet addresses are hardcoded from this observation.

## 7. Accounting and evaluation

At a timestamp, mark LP inventory, uncollected fees and idle cash using stated price sources and freshness. Avoid adding fees twice when already included in balances. Unknown prices produce “valuation unavailable,” never zero or fabricated gains.

Economic net P&L over a window = ending portfolio value + external withdrawals − external deposits − starting value. If gas, swap fees or subscription charges are already reflected in ending value, do not subtract them again. Show a component breakdown and separately identify charges paid outside the tracked account. Internal swaps, collect operations and rebalances are not deposits or withdrawals.

Report: collected/uncollected trading fees, inventory price change, divergence against a matched hold benchmark, gas, swap/impact costs, service fees, net result and cash-flow-aware returns. Define the hold benchmark with the same asset entry mix and dated external cash flows. Also show USDC cash as a distinct comparison; do not confuse the two.

Test on fixtures with a rising market, falling market, sideways prices, out-of-range periods, additions, partial exits, failed transactions, depegs and missing prices. Reconstruct a sampled position independently from chain events/state. Do not make an LLM compute canonical balances.

Evaluate deterministic management against unmanaged LP and simple periodic-rebalance baselines using walk-forward windows, realistic spreads/gas and no future information. Backtests are hypothetical; real out-of-sample tracking is required. Publish negative results and action costs. A strategy that underperforms may remain a useful convenience tool, but must not be sold as proven alpha.

## 8. Pricing and billing

Proposed structure:

- **Explore / free:** discovery and basic read-only tracking.
- **Managed / subscription:** policy monitoring, proposals, detailed reporting and later qualified automation.
- **Advanced / later:** more accounts or policies, custom alerts and export; only after demand.

Research price points of $9, $19 and $29/month as experiments, not published tiers. At $19, a $500 account pays 3.8% of its initial capital per month before execution costs; likely unsuitable. Segment by demonstrated value and disclose costs, not a universal minimum return needed to justify the product.

Prefer a flat subscription over a per-rebalance fee. Optional usage limits should cover scarce compute or monitored accounts, not reward unnecessary trading. No performance fee in MVP. Keep network/swap costs separate and capped by the user.

Billing states: trial, active, past_due, cancelled, expired. Webhooks require signature verification and idempotency. Subscription expiry stops new discretionary automated activity; it must never block owner withdrawal, permission revocation or access to basic records. Notify ahead of expiry and explain unmanaged exposure. Do not require a paid subscription to leave.

Unit economics: revenue minus payment costs, RPC/indexing, model usage, notifications, hosting and support. Track cost per active managed account, not just token spend. Use cached structured summaries; do not call an LLM on every block. No payment collection is implemented in this copy pass.

## 9. Security and operational readiness

Threats include prompt injection in token metadata, poisoned price data, approval phishing, compromised session credentials, malicious pools/hooks, upgradeable tokens, unlimited allowances, duplicate jobs, nonce races, indexer outages and incorrect fee accounting.

Controls: treat all fetched text as data; allowlisted typed actions; no shell execution from model output; exact/limited allowances; approved recipients; dependency pinning; secret redaction; encrypted server credentials; authenticated policy APIs; CSRF/session protection; independent audit of any authority-bearing contracts/modules.

Fail closed for new risk on stale data, simulation divergence, policy mismatch or insufficient reserve. Preserve direct user exits and read-only account access. A service pause cannot freeze the blockchain or undo a confirmed transfer.

Runbooks: RPC outage, stuck transaction, price disagreement, pool exploit, signing-key compromise, budget breach and reconciliation failure. Each specifies detection, pause scope, user notice, evidence preservation, recovery checks and resume authority. Any policy bypass pauses the affected strategy immediately.

Before offering managed execution or charging subscriptions, obtain jurisdiction-specific legal review of custody/control, automated investment services, marketing, fees, privacy and required customer restrictions. This plan is not a legal determination.

## 10. Build sequence and acceptance gates

Time ranges are planning estimates for a small team, not a launch commitment. Security review and external integrations can extend them.

| Milestone | Deliverable | Exit evidence |
|---|---|---|
| M0: validation, 1–2 weeks | Interviews, competitor refresh, compatible-pool inventory | Recorded demand and venue go/no-go decision |
| M1: read-only, 1–2 weeks | One indexer/adapter, discovery, position accounting | Independent cash-flow fixtures and sampled reconciliation pass |
| M2: policy/proposals, 1–2 weeks | Goal parser, schema validation, deterministic planner, approval inbox | Adversarial prompt tests, rejected policy violations, proposal snapshots |
| M3: signed execution, 2–3 weeks | User-approved entry, manage, collect and exit | Testnet/fork round trip, failed-leg recovery, duplicate/restart tests |
| M4: limited live pilot, external-gated | Verified environment, reviewed authority, small explicit caps | Security review, user consent, incident drill and successful withdrawal proof |
| M5: subscriptions, 1–2 weeks | Entitlements, invoices, cancellation, cost dashboard | Duplicate webhook tests, expiry with free exit, pricing validation |
| M6: bounded automation, separate release | Revocable constrained authority and keeper | Policy fuzzing, key-compromise containment and independent owner exit |

Do not compress this into a day-one mainnet launch because the chain is launching. Ship a truthful preview/read-only product first if that is the only ready milestone.

### Suggested engineering work packages

1. `packages/policy`: schemas, validator, permission compiler, policy-version tests.
2. `packages/venues`: adapter interface and one verified implementation; bigint math.
3. `services/indexer`: block cursors, pool snapshots, event reconciliation and stale flags.
4. `services/agent`: typed goal parsing, deterministic planner, explanation generation.
5. `services/executor`: durable jobs, locking, authorization, receipts and recovery.
6. `packages/accounting`: cash flows, valuations, benchmarks and reproducible fixtures.
7. Product frontend: discovery, policy review, proposals, positions and history.
8. Billing/operations: entitlements, audit logs, alerts and runbooks.

These paths are proposed, not existing modules. Prefer a small modular service initially; do not introduce separate deployments solely because the plan lists components.

Implementation status (16 September 2026): `packages/policy` (policy contract, validator, permission compiler), `packages/venues` (generic adapter interface, Uniswap V3 LP implementation, ACTFUN pool-source classification), `packages/accounting` (cash-flow ledger, valuations, hold-benchmark P&L), `services/indexer` (cursors, snapshots, reconciliation, stale flags), `services/agent` (goal parser, deterministic planner, explanations), `services/executor` (durable jobs, policy-gated submit, receipts, recovery), and `services/e2e` (offline goal→receipt→ledger→explanation proof with a fake submitter) exist as offline, deterministic, dependency-free modules with behavioral tests (103 tests green across 7 suites). `services/chat` (17 September 2026) adds the iMessage-first chat shell: Photon Spectrum webhook verifier, owner allowlist, dedupe, APPROVE-gated execution, and an env-keyed OpenAI brain adapter — offline-tested with fakes (11 tests). Live iMessage + OpenAI need env keys (see `services/chat/SETUP.md`). They prove quoting, screening, planning, permission shapes, and wiring — not production LP readiness, mainnet deployment, or audited authority.

## 11. Existing repository migration

- Keep `landing/` as the marketing app. Preserve assets, typography and section composition; this task updates its words and CTA destinations.
- Keep legacy `dashboard/`, `sdk/`, `contracts/` and `ai-engine/` intact until each receives a scoped migration task. Prior inspection identified simulated yield and treasury-specific accounting; none proves production LP readiness.
- Reuse only tested general concepts such as serialized execution and audit history. Replace USYC parking assumptions, reserve formulas and simulated balances for the LP product.
- Do not reuse FloatVault as an LP vault without a new design/security review. No existing contract address is a new-product deployment.
- Add an environment capability manifest; frontend capabilities must reflect the verified backend rather than marketing promises.
- Keep historical research for provenance, but label the new plan as the product direction. Never rewrite historical evidence to imply the pivot already existed.

## 12. Landing-page copy specification

Voice: calm, direct and financially literate. Flo can have personality, but never jokes away a loss. Say what an action does, what it costs and what remains uncertain.

| Existing section | New job | Copy direction |
|---|---|---|
| Hero / large float | Identify the consumer product | “Your liquidity. Your limits.” / personal liquidity agent |
| Built-with trio | Explain the relationship | Your goals / Flo / Arc; no partner endorsement implied |
| Six feature cards | Make the planned workflow tangible | Limits, pool review, cost-aware moves, net P&L, explanations, approvals |
| Meet Flo | Introduce preferences | Calm / Balanced / Aggressive; all can lose money |
| Cinematic resting scene | Express reduced monitoring burden | “Set your limits, find your rhythm.” |
| Numbers strip | Replace unsupported financial proof | You / Flo / Net |
| FAQ | Address risk and readiness | Authority, losses, pricing, current availability |
| Start | Honest conversion | Follow development; copy an example goal |
| Footer and metadata | Reinforce positioning | Personal liquidity agent / product preview |

No fabricated APY, latency, TVL, transaction hash, audited status or customer count. Label all illustrative traces. Do not say “Start earning” when no LP manager exists. No invented waitlist: current CTAs link to working page anchors or the existing project X/GitHub destinations. Before launch, choose and build the actual signup flow with consent and data retention.

Pricing belongs in the FAQ until validated. Social metadata now uses the existing text-free Flo mascot; the old banner containing the treasury-era slogan remains on disk but is no longer the metadata image. A new campaign image is not required merely to change the product copy. Verify unfurls against the deployed domain after publication; this local pass does not deploy the site.

## 13. Launch, metrics and decisions

Distribution: recruit existing LPs through educational pool breakdowns, partner with compatible venues, publish an honest weekly after-cost position review, and let design partners export useful performance summaries without exposing addresses by default. Avoid paid hype that implies profitable outcomes.

Activation: user reviews a policy and returns to a tracked position within seven days. Management activation additionally requires a successfully reconciled approved action—not just wallet connection.

Track weekly retained LPs, proposal acceptance/rejection reasons, policy violations (target zero), unexplained balance mismatches (target zero), time with stale data, actions per account, total execution costs, benchmark results, paid conversion, churn and cost per managed account. TVL and social followers are supporting metrics, not proof of usefulness.

Open decisions before implementation: first verified venue; initial asset list and numerical mode limits; wallet/control model for automation; service jurisdictions; pricing; managed pilot caps; independent reviewer; production onboarding destination. Defaults above allow read-only and approval-first work without pretending these consequential choices are settled.

## 14. Resources and how to use them

Primary sources checked 15 September 2026, except R6: linked from the official index, but its full page could not be retrieved in this pass. Read it before implementation. A documentation page or repository is evidence of described capabilities, not certification of deployment, safety, adoption or profitability. Reverify mutable facts at each integration milestone.

- **[R1] Revert:** https://docs.revert.finance/revert — benchmark LP analytics and management UX; study accounting definitions rather than copying headline returns.
- **[R2] ArcTools:** https://www.arctools.fun/ — competitive surface for terminals and retail intelligence; self-published claims.
- **[R3] Barker:** https://github.com/barkermoney/barker-alm-engine — direct ALM competitor/reference; inspect code, license and deployment evidence before any reuse.
- **[R4] TrustSwap Arc:** https://trustswap.com/arc — creator-tool competition; not proof all features are live.
- **[R5] Arc documentation index:** https://docs.arc.io/llms.txt — starting point and current official environment guidance.
- **[R6] Arc EVM differences:** https://docs.arc.io/arc/references/evm-differences.md — required reading before event indexing, gas and native-value handling.
- **[R7] Arc network configuration:** https://docs.arc.io/arc/references/connect-to-arc.md and https://docs.arc.io/arc/references/contract-addresses.md — authoritative configuration checks before any transaction.
- **[R8] Uniswap v3 overview:** https://developers.uniswap.org/docs/protocols/v3/overview — concentrated-liquidity mechanics and adapter research; verify Arc deployment separately.
- **[R9] Revert auto-range:** https://docs.revert.finance/revert/auto-range — study range management trade-offs and safeguards; not a guaranteed profitable policy.
- **[R10] Circle developer index:** https://developers.circle.com/llms.txt — wallet/control-model evaluation before integration; read the specific wallet product documentation, not generic custody claims.

### Definition of ready for real funds

Verified network and contracts; reconciled accounting; explicit user authority; tested exits and revocation; no policy bypass in adversarial tests; reviewed execution contracts; reliable monitoring and incident response; approved legal/marketing position; transparent fees; and an explicitly authorized limited pilot. A green frontend build satisfies none of these on its own.
