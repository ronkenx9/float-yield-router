# FLOAT Second Brain — Concepts Index

> Auto-updated by the LLM Compiler on each compile checkpoint.
> Human-readable table of contents for all concept articles.

## Core Concepts
- [[reserve-strategies]] — Static vs. Ratio vs. Adaptive VaR reserve sizing math
- [[mpc-security]] — Trust model and custody division (Circle MPC wallets)

## Failure Modes
- [[failure-modes/churn]] — Over-frequent park/withdraw cycles and mitigation
- [[failure-modes/rate-limits]] — HTTP 429 from CLI and per-wallet serialization fix
- [[failure-modes/estimation-error]] — vault.withdraw ESTIMATION_ERROR and pre-flight check

## Backlinks
| Concept | Referenced By |
|---------|--------------|
| reserve-strategies | Orchestrator.ts, PolicyEngine.ts |
| mpc-security | CircleAgentAdapter.ts |
| failure-modes/rate-limits | CircleAgentAdapter.ts (acquireCliSlot) |
| failure-modes/estimation-error | Orchestrator.ts (executeWithdraw pre-flight) |
