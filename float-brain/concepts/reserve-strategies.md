# Reserve Strategies

FLOAT supports three reserve-sizing modes that control how much USDC stays liquid vs. parked.

## 1. Static Reserve
```
reserve = fixed_usdc_amount
```
Simple floor. Ignores total balance. Best for predictable, fixed-cost agents.

## 2. Ratio Reserve
```
reserve = total_balance × ratio
```
Scales with balance. Used in dashboard StrategyConfig as `minHotReserveRatio`.
- Aggressive: 40% hot reserve
- Balanced: 35% hot reserve
- Conservative: 55% hot reserve

## 3. Adaptive VaR (Value-at-Risk)
```
reserve = avgPaymentSize + 1.5 × σ(interPaymentInterval)
```
Bootstraps at 50% of balance until 10 payment samples are collected.
Implemented in `FloatClient.calculateTargetReserve()` in the SDK.

**Key insight**: k=1.5 corresponds to ~93% coverage of a normal distribution. Tuning k lower increases capital efficiency but raises the probability of a recall being needed mid-trade.

## Critic History
| Version | Mode | k | Outcome |
|---------|------|---|---------|
| v1 | Ratio (35%) | — | 4 missed trades on burst activity |
| v2 | Adaptive | 1.5 | 0 missed trades; 60% idle capital |
| v3 | Adaptive | 1.0 | 0 missed trades; 30% idle capital |
