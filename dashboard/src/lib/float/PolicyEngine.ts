/**
 * FLOAT Policy Engine
 * 
 * Deterministic parkability scoring. The LLM does NOT make decisions here.
 * This is rule-based, configurable, and auditable.
 */

import type {
  AgentStatus, StrategyConfig, CapitalStatus,
  MarketSnapshot, ParkabilityAssessment, DecisionLog,
} from './types';

// ─── Agent State → Action Permissions ───────────────────────────
const STATE_PERMISSIONS: Record<AgentStatus, { canPark: boolean; mustRecall: boolean; noTouch: boolean }> = {
  ACTIVE:     { canPark: false, mustRecall: false, noTouch: false },
  IDLE:       { canPark: true,  mustRecall: false, noTouch: false },
  WATCHING:   { canPark: true,  mustRecall: false, noTouch: false }, // small amount only
  PRE_TRADE:  { canPark: false, mustRecall: true,  noTouch: false },
  EXECUTING:  { canPark: false, mustRecall: false, noTouch: true },
  COOLDOWN:   { canPark: true,  mustRecall: false, noTouch: false },
  PAUSED:     { canPark: true,  mustRecall: false, noTouch: false },
  EMERGENCY:  { canPark: false, mustRecall: true,  noTouch: false },
};

// ─── Calculate Capital Buckets ──────────────────────────────────
export function calculateCapitalStatus(
  liquidBalance: number,
  parkedBalance: number,
  config: StrategyConfig,
): CapitalStatus {
  const totalBalance = liquidBalance + parkedBalance;
  const hotReserve = totalBalance * config.minHotReserveRatio;
  const warmReserve = totalBalance * 0.15; // 15% warm reserve
  const idleCapital = Math.max(0, totalBalance - hotReserve - warmReserve);
  const maxParkable = totalBalance * config.maxParkRatio;
  const parkableAmount = Math.max(0, Math.min(idleCapital, maxParkable) - parkedBalance);

  return {
    totalBalance,
    liquidBalance,
    parkedBalance,
    hotReserve,
    warmReserve,
    idleCapital,
    parkableAmount: Math.max(0, parkableAmount),
  };
}

// ─── Calculate Parkability Score ────────────────────────────────
export function calculateParkabilityScore(
  agentState: AgentStatus,
  idleSeconds: number,
  market: MarketSnapshot,
  capital: CapitalStatus,
  config: StrategyConfig,
  recentActions: DecisionLog[],
): ParkabilityAssessment {
  const perms = STATE_PERMISSIONS[agentState];

  // Hard stops
  if (perms.noTouch) {
    return { score: 0, action: 'HOLD', amount: 0, reason: 'Agent is EXECUTING. Do not interfere.', breakdown: zeroBreakdown() };
  }
  if (perms.mustRecall && capital.parkedBalance > 0) {
    return { score: 0, action: 'WITHDRAW', amount: capital.parkedBalance, reason: `Agent is ${agentState}. Recalling all parked capital.`, breakdown: zeroBreakdown() };
  }
  if (!perms.canPark) {
    return { score: 0, action: 'HOLD', amount: 0, reason: `Agent is ${agentState}. Not safe to park.`, breakdown: zeroBreakdown() };
  }

  // ── Score Components (each 0.0 to 1.0) ──

  // 1. Idle time: longer idle = higher score
  const idleTimeScore = Math.min(1, idleSeconds / config.minIdleTimeSeconds);

  // 2. Market calm: low network activity = safer to park
  const marketCalmScore = 1 - market.networkActivityScore;

  // 3. Reserve health: liquid balance well above hot reserve = safer
  const reserveRatio = capital.liquidBalance / Math.max(capital.hotReserve, 0.01);
  const reserveHealthScore = Math.min(1, Math.max(0, (reserveRatio - 1) / 2));

  // 4. Agent state: IDLE scores highest, WATCHING/COOLDOWN lower
  const stateScores: Partial<Record<AgentStatus, number>> = {
    IDLE: 1.0, PAUSED: 0.9, COOLDOWN: 0.6, WATCHING: 0.4,
  };
  const agentStateScore = stateScores[agentState] ?? 0;

  // 5. Yield value: more parkable = more valuable to park
  const yieldValueScore = Math.min(1, capital.parkableAmount / Math.max(capital.totalBalance * 0.3, 0.01));

  // 6. Churn penalty: too many recent park actions
  const recentActionsInHour = recentActions.filter(d => {
    const age = Date.now() - new Date(d.timestamp).getTime();
    return age < 3600000 && d.action === 'PARK';
  }).length;
  const churnPenalty = Math.min(0.5, recentActionsInHour / config.maxActionsPerHour * 0.5);

  // 7. Recent error penalty
  const recentErrors = recentActions.filter(d => {
    const age = Date.now() - new Date(d.timestamp).getTime();
    return age < 3600000 && d.txStatus === 'FAILED';
  }).length;
  const recentErrorPenalty = Math.min(0.3, recentErrors * 0.1);

  // 8. Volatility spike penalty (Critic v2)
  // Only penalize if recallOnVolatilitySpike is enabled for this strategy
  const volatilityPenalty = config.recallOnVolatilitySpike && market.networkActivityScore > 0.7
    ? (market.networkActivityScore - 0.7) * 0.5 // up to 0.15 penalty at max activity
    : 0;

  // ── Weighted Score ──
  const rawScore = (
    idleTimeScore * 0.25 +
    marketCalmScore * 0.15 +
    reserveHealthScore * 0.20 +
    agentStateScore * 0.20 +
    yieldValueScore * 0.10 +
    0.10 // base score
  ) - churnPenalty - recentErrorPenalty - volatilityPenalty;

  const score = Math.max(0, Math.min(1, rawScore));

  const breakdown = {
    idleTimeScore, marketCalmScore, reserveHealthScore,
    agentStateScore, yieldValueScore, churnPenalty, recentErrorPenalty,
  };

  // ── Decision ──
  if (score >= config.parkThreshold && capital.parkableAmount >= config.minRouteAmount) {
    // Park: route idle capital to USYC
    const parkAmount = Math.min(
      capital.parkableAmount,
      capital.totalBalance * config.maxParkRatio - capital.parkedBalance,
    );
    if (parkAmount >= config.minRouteAmount) {
      return {
        score, action: 'PARK',
        amount: Math.round(parkAmount * 1e6) / 1e6, // 6 decimal precision
        reason: buildReason('PARK', agentState, idleSeconds, score, capital),
        breakdown,
      };
    }
  }

  if (score < config.withdrawThreshold && capital.parkedBalance > 0) {
    // Withdraw: conditions are unfavorable
    return {
      score, action: 'WITHDRAW',
      amount: capital.parkedBalance,
      reason: buildReason('WITHDRAW', agentState, idleSeconds, score, capital),
      breakdown,
    };
  }

  return {
    score, action: 'HOLD', amount: 0,
    reason: buildReason('HOLD', agentState, idleSeconds, score, capital),
    breakdown,
  };
}

function buildReason(action: string, state: AgentStatus, idleSec: number, score: number, cap: CapitalStatus): string {
  const idleMin = (idleSec / 60).toFixed(1);
  switch (action) {
    case 'PARK':
      return `Agent ${state} for ${idleMin}m. Score ${score.toFixed(2)}. Reserve healthy at $${cap.liquidBalance.toFixed(2)}. Parking $${cap.parkableAmount.toFixed(2)} idle capital.`;
    case 'WITHDRAW':
      return `Score dropped to ${score.toFixed(2)}. Recalling $${cap.parkedBalance.toFixed(2)} to maintain readiness.`;
    default:
      return `Agent ${state}. Score ${score.toFixed(2)}. No action needed. Liquid: $${cap.liquidBalance.toFixed(2)}, Parked: $${cap.parkedBalance.toFixed(2)}.`;
  }
}

function zeroBreakdown() {
  return { idleTimeScore: 0, marketCalmScore: 0, reserveHealthScore: 0, agentStateScore: 0, yieldValueScore: 0, churnPenalty: 0, recentErrorPenalty: 0 };
}
