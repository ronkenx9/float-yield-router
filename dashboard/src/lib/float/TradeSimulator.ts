/**
 * FLOAT Trade Simulator
 * 
 * Simulates realistic trading agent behavior:
 * - Traders randomly want to execute trades at unpredictable intervals
 * - When a trader needs capital, it signals FLOAT: IDLE → PRE_TRADE
 * - FLOAT must recall parked capital before the trade window closes
 * - After the trade, the agent goes COOLDOWN → IDLE
 * 
 * This trains FLOAT's recall system under real conditions.
 * The key metric: did FLOAT return capital before the trade deadline?
 */

import type { FloatOrchestrator } from './Orchestrator';

export interface TradeEvent {
  timestamp: string;
  traderId: string;
  tradeType: 'send_to_peer' | 'swap' | 'rebalance';
  amount: number;
  counterparty?: string;
  capitalReady: boolean;
  recallLatencyMs: number;
  missed: boolean;
  description: string;
}

interface TraderProfile {
  agentId: string;
  label: string;
  // How often this trader wants to trade (in seconds, random between min and max)
  tradeFrequencyMin: number;
  tradeFrequencyMax: number;
  // How much capital the trade needs (ratio of total balance)
  tradeAmountRatio: number;
  // How long the trader waits for capital before considering it "missed" (ms)
  tradeDeadlineMs: number;
}

const TRADER_PROFILES: TraderProfile[] = [
  {
    agentId: 'trader-a',
    label: 'Trader A',
    tradeFrequencyMin: 120,   // Trades every 2-5 minutes (aggressive)
    tradeFrequencyMax: 300,
    tradeAmountRatio: 0.4,    // Needs 40% of balance per trade
    tradeDeadlineMs: 20000,   // 20 second deadline
  },
  {
    agentId: 'trader-b',
    label: 'Trader B',
    tradeFrequencyMin: 180,   // Trades every 3-8 minutes (balanced)
    tradeFrequencyMax: 480,
    tradeAmountRatio: 0.3,    // Needs 30% of balance per trade
    tradeDeadlineMs: 25000,   // 25 second deadline
  },
  {
    agentId: 'trader-c',
    label: 'Trader C',
    tradeFrequencyMin: 300,   // Trades every 5-12 minutes (conservative)
    tradeFrequencyMax: 720,
    tradeAmountRatio: 0.25,   // Needs 25% of balance per trade
    tradeDeadlineMs: 35000,   // 35 second deadline
  },
];

// Trade types between agents
const TRADE_SCENARIOS = [
  { type: 'send_to_peer' as const, desc: (from: string, to: string, amt: number) => `${from} sending $${amt.toFixed(2)} USDC to ${to}` },
  { type: 'swap' as const, desc: (from: string, _to: string, amt: number) => `${from} swapping $${amt.toFixed(2)} USDC for ETH` },
  { type: 'rebalance' as const, desc: (from: string, _to: string, amt: number) => `${from} rebalancing portfolio — needs $${amt.toFixed(2)} liquid` },
];

export class TradeSimulator {
  private running = false;
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private tradeHistory: TradeEvent[] = [];
  private orchestrator: FloatOrchestrator;
  private totalTrades = 0;
  private missedTrades = 0;
  private totalRecallLatency = 0;

  constructor(orchestrator: FloatOrchestrator) {
    this.orchestrator = orchestrator;
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log(`[TRADE SIM] ═══ Trade simulator started ═══`);
    
    // Schedule first trade for each trader
    for (const profile of TRADER_PROFILES) {
      this.scheduleNextTrade(profile);
    }
  }

  stop() {
    this.running = false;
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    console.log('[TRADE SIM] ═══ Trade simulator stopped ═══');
  }

  isRunning() { return this.running; }

  private scheduleNextTrade(profile: TraderProfile) {
    if (!this.running) return;

    const delaySec = profile.tradeFrequencyMin + 
      Math.random() * (profile.tradeFrequencyMax - profile.tradeFrequencyMin);
    
    console.log(`[TRADE SIM] ${profile.label}: Next trade in ${delaySec.toFixed(0)}s`);

    const timer = setTimeout(() => this.executeTrade(profile), delaySec * 1000);
    this.timers.set(profile.agentId, timer);
  }

  private async executeTrade(profile: TraderProfile) {
    if (!this.running) return;

    // Pick a random counterparty (one of the other traders)
    const peers = TRADER_PROFILES.filter(p => p.agentId !== profile.agentId);
    const counterparty = peers[Math.floor(Math.random() * peers.length)];
    
    // Pick a random trade type
    const scenario = TRADE_SCENARIOS[Math.floor(Math.random() * TRADE_SCENARIOS.length)];
    
    // Calculate trade amount using live on-chain balances
    const state = await this.orchestrator.getStateWithBalances();
    const agentState = state.agents.find(a => a.agentId === profile.agentId);
    const totalBalance = (agentState?.liquidBalance || 0) + (agentState?.parkedBalance || 0);
    const tradeAmount = totalBalance * profile.tradeAmountRatio;

    const description = scenario.desc(profile.label, counterparty.label, tradeAmount);
    console.log(`\n[TRADE SIM] ⚡ TRADE EVENT: ${description}`);

    // ─── Phase 1: Signal PRE_TRADE ───
    const preTradeTime = Date.now();
    this.orchestrator.signal(profile.agentId, 'PRE_TRADE');
    console.log(`[TRADE SIM] ${profile.label} → PRE_TRADE (needs $${tradeAmount.toFixed(2)} liquid)`);

    // Wait for FLOAT to recall capital (up to the deadline)
    let capitalReady = false;
    let recallLatencyMs = 0;
    
    // Check first before sleeping to capture instant ready states (sub-second latency for liquid accounts)
    const initialState = await this.orchestrator.getStateWithBalances();
    const initialAgent = initialState.agents.find(a => a.agentId === profile.agentId);
    
    if (initialAgent && (initialAgent.parkedBalance === 0 || initialAgent.liquidBalance >= tradeAmount)) {
      capitalReady = true;
      recallLatencyMs = Date.now() - preTradeTime;
      console.log(`[TRADE SIM] ${profile.label}: ✅ Capital ready instantly in ${recallLatencyMs}ms`);
    } else {
      const checkInterval = 200; // Check every 200ms for sub-second precision
      const maxChecks = Math.ceil(profile.tradeDeadlineMs / checkInterval);

      for (let i = 0; i < maxChecks; i++) {
        await new Promise(r => setTimeout(r, checkInterval));
        
        // Check if enough liquid capital is available (fetch live balances on-chain)
        const currentState = await this.orchestrator.getStateWithBalances();
        const currentAgent = currentState.agents.find(a => a.agentId === profile.agentId);
        
        // Capital is ready if parked balance is 0 OR if the liquid balance alone is already enough to cover the trade
        if (currentAgent && (currentAgent.parkedBalance === 0 || currentAgent.liquidBalance >= tradeAmount)) {
          capitalReady = true;
          recallLatencyMs = Date.now() - preTradeTime;
          console.log(`[TRADE SIM] ${profile.label}: ✅ Capital ready/recalled in ${recallLatencyMs}ms`);
          break;
        }
      }
    }

    if (!capitalReady) {
      recallLatencyMs = Date.now() - preTradeTime;
      console.log(`[TRADE SIM] ${profile.label}: ⚠️ Capital NOT fully recalled after ${recallLatencyMs}ms`);
    }

    // ─── Phase 2: Execute trade ───
    this.orchestrator.signal(profile.agentId, 'EXECUTING');
    console.log(`[TRADE SIM] ${profile.label} → EXECUTING`);
    
    // Simulate trade execution time (1-3 seconds)
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));

    // ─── Phase 3: Cooldown ───
    this.orchestrator.signal(profile.agentId, 'COOLDOWN');
    console.log(`[TRADE SIM] ${profile.label} → COOLDOWN`);
    
    // Cooldown for 30-60 seconds
    const cooldownTime = 30000 + Math.random() * 30000;
    await new Promise(r => setTimeout(r, cooldownTime));

    // ─── Phase 4: Back to IDLE ───
    this.orchestrator.signal(profile.agentId, 'IDLE');
    console.log(`[TRADE SIM] ${profile.label} → IDLE (ready for FLOAT to park again)`);

    // ─── Record ───
    const missed = !capitalReady;
    this.totalTrades++;
    if (missed) this.missedTrades++;
    this.totalRecallLatency += recallLatencyMs;

    const event: TradeEvent = {
      timestamp: new Date().toISOString(),
      traderId: profile.agentId,
      tradeType: scenario.type,
      amount: tradeAmount,
      counterparty: counterparty.agentId,
      capitalReady,
      recallLatencyMs,
      missed,
      description,
    };
    this.tradeHistory = [event, ...this.tradeHistory].slice(0, 50);

    // Schedule next trade
    this.scheduleNextTrade(profile);
  }

  public triggerRandomTrade() {
    if (!this.running) return;
    const randomProfile = TRADER_PROFILES[Math.floor(Math.random() * TRADER_PROFILES.length)];
    
    // Clear scheduled timer to prevent concurrent trades on the same agent
    const timer = this.timers.get(randomProfile.agentId);
    if (timer) {
      clearTimeout(timer);
    }
    
    // Execute trade asynchronously
    this.executeTrade(randomProfile).catch(err => {
      console.error(`[TRADE SIM] Failed to execute triggered trade:`, err);
    });
  }

  getStats() {
    return {
      running: this.running,
      totalTrades: this.totalTrades,
      missedTrades: this.missedTrades,
      successRate: this.totalTrades > 0 
        ? ((this.totalTrades - this.missedTrades) / this.totalTrades * 100).toFixed(1) + '%'
        : 'N/A',
      avgRecallLatencyMs: this.totalTrades > 0 
        ? Math.round(this.totalRecallLatency / this.totalTrades) 
        : 0,
      recentTrades: this.tradeHistory.slice(0, 10),
    };
  }
}
