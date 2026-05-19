/**
 * FLOAT Capital Engine — Types & Interfaces
 * 
 * Core type definitions for the idle capital yield router.
 * FLOAT keeps agent capital productive between actions.
 */

// ─── Agent States ───────────────────────────────────────────────
export type AgentStatus = 
  | 'ACTIVE'      // Trading actively — keep funds liquid
  | 'IDLE'        // No recent activity — safe to park
  | 'WATCHING'    // Monitoring signals — park small amount only
  | 'PRE_TRADE'   // About to trade — recall funds immediately
  | 'EXECUTING'   // Trade in progress — do NOT move funds
  | 'COOLDOWN'    // Post-trade cooldown — park moderate amount
  | 'PAUSED'      // User paused — park per config
  | 'EMERGENCY';  // Emergency — withdraw everything

// ─── Strategy Configs ───────────────────────────────────────────
export interface StrategyConfig {
  mode: 'aggressive' | 'balanced' | 'conservative';
  minHotReserveRatio: number;    // Always keep this % liquid
  maxParkRatio: number;          // Never park more than this %
  minIdleTimeSeconds: number;    // Must be idle this long before parking
  recallOnVolatilitySpike: boolean;
  maxActionsPerHour: number;
  cooldownAfterParkSeconds: number;
  cooldownAfterWithdrawSeconds: number;
  minRouteAmount: number;        // Don't bother parking less than this (USDC)
  parkThreshold: number;         // Parkability score must exceed this
  withdrawThreshold: number;     // Withdraw if score drops below this
}

export const STRATEGY_PRESETS: Record<string, StrategyConfig> = {
  aggressive: {
    mode: 'aggressive',
    minHotReserveRatio: 0.40,      // Critic v4: hold slightly more liquid reserve
    maxParkRatio: 0.75,
    minIdleTimeSeconds: 120,
    recallOnVolatilitySpike: true, // Critic v4: re-enable volatility management
    maxActionsPerHour: 15,         // Critic v5: increased to 15 to capture more yield and recall dynamically
    cooldownAfterParkSeconds: 120,
    cooldownAfterWithdrawSeconds: 120,
    minRouteAmount: 0.5,
    parkThreshold: 0.4,
    withdrawThreshold: 0.2,        // Widen hysteresis gap to prevent feedback loop oscillation
  },
  balanced: {
    mode: 'balanced',
    minHotReserveRatio: 0.35,
    maxParkRatio: 0.55,
    minIdleTimeSeconds: 300,
    recallOnVolatilitySpike: true,
    maxActionsPerHour: 6,
    cooldownAfterParkSeconds: 180,
    cooldownAfterWithdrawSeconds: 120,
    minRouteAmount: 1.0,
    parkThreshold: 0.6,
    withdrawThreshold: 0.4,
  },
  conservative: {
    mode: 'conservative',
    minHotReserveRatio: 0.55,
    maxParkRatio: 0.30,
    minIdleTimeSeconds: 600,
    recallOnVolatilitySpike: true,
    maxActionsPerHour: 3,
    cooldownAfterParkSeconds: 300,
    cooldownAfterWithdrawSeconds: 180,
    minRouteAmount: 2.0,
    parkThreshold: 0.75,
    withdrawThreshold: 0.5,
  },
};

// ─── Capital Buckets ────────────────────────────────────────────
export interface CapitalStatus {
  totalBalance: number;         // Total USDC (liquid + parked)
  liquidBalance: number;        // Available USDC in wallet
  parkedBalance: number;        // USDC parked in USYC vault
  hotReserve: number;           // Required hot reserve (always liquid)
  warmReserve: number;          // Warm reserve (quick recall)
  idleCapital: number;          // Safe to park
  parkableAmount: number;       // How much can be parked right now
}

// ─── Agent Signal (from trading agent SDK) ──────────────────────
export interface AgentSignal {
  agentId: string;
  status: AgentStatus;
  currentBalance?: number;
  minReserveNeeded?: number;
  expectedNextActionWindow?: string; // e.g. "5-10m"
  urgency?: 'low' | 'medium' | 'high' | 'immediate';
  strategyMode?: string;
}

// ─── Market Snapshot ────────────────────────────────────────────
export interface MarketSnapshot {
  timestamp: string;
  gasPrice: number;              // Gwei
  blockNumber: number;
  recentBlockInterval: number;   // Average seconds between recent blocks
  vaultTotalDeposits: number;    // Total USDC in FloatVault
  vaultAgentDeposits: number;    // This agent's deposits in vault
  networkActivityScore: number;  // 0-1 based on recent tx volume
  timeOfDay: number;             // Hour (0-23)
  dayOfWeek: number;             // 0=Sun, 6=Sat
}

// ─── Parkability Score ──────────────────────────────────────────
export interface ParkabilityAssessment {
  score: number;                // 0.0 to 1.0
  action: 'PARK' | 'WITHDRAW' | 'HOLD';
  amount: number;               // USDC to move
  reason: string;
  breakdown: {
    idleTimeScore: number;
    marketCalmScore: number;
    reserveHealthScore: number;
    agentStateScore: number;
    yieldValueScore: number;
    churnPenalty: number;
    recentErrorPenalty: number;
  };
}

// ─── Decision Log ───────────────────────────────────────────────
export interface DecisionLog {
  id: string;
  timestamp: string;
  agentId: string;
  agentState: AgentStatus;
  walletBalance: number;
  liquidBefore: number;
  parkedBefore: number;
  action: 'PARK' | 'WITHDRAW' | 'HOLD' | 'EMERGENCY_WITHDRAW';
  amount: number;
  liquidAfter: number;
  parkedAfter: number;
  parkabilityScore: number;
  reason: string;
  txHash?: string;
  txStatus?: 'PENDING' | 'COMPLETE' | 'FAILED';
  outcome?: DecisionOutcome;
}

export interface DecisionOutcome {
  evaluatedAt: string;
  yieldEarned: number;
  tradeMissed: boolean;
  recallNeeded: boolean;
  recallLatencyMs?: number;
  wasGoodDecision: boolean;
  score: number; // -1 to +1
}

// ─── Agent Config ───────────────────────────────────────────────
export interface FloatAgentConfig {
  agentId: string;
  walletId: string;
  strategy: StrategyConfig;
  label: string;
}
