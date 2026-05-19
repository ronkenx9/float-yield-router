/**
 * FLOAT Orchestrator
 * 
 * Runs the continuous autonomous loop:
 *   1. Fetch real market data
 *   2. For each subagent: calculate parkability → execute if needed
 *   3. Log every decision
 *   4. Every N decisions: critic reviews and suggests improvements
 * 
 * "FLOAT keeps agent capital productive between actions."
 */

import { CircleWallet } from '../agent/CircleWallet';
import { getMarketSnapshot, rpcCall } from './MarketFeed';
import { calculateCapitalStatus, calculateParkabilityScore } from './PolicyEngine';
import { explainDecision, reviewDecisions, evaluateDecision, type CriticReview } from './Evaluator';
import type { FloatAgentConfig, AgentStatus, DecisionLog, StrategyConfig, CapitalStatus, MarketSnapshot } from './types';
import { STRATEGY_PRESETS } from './types';

const FLOAT_VAULT = "0xfAe6a9D5b0835ca7e9B090eCe0f57C14899BeDA6";

// ─── Subagent State ─────────────────────────────────────────────
interface SubagentState {
  config: FloatAgentConfig;
  wallet: CircleWallet;
  status: AgentStatus;
  idleSince: number;          // timestamp when agent became idle
  parkedBalance: number;
  liquidBalance: number;      // cached liquid USDC balance
  lastActionTime: number;
  decisions: DecisionLog[];
  totalYieldCaptured: number;
  missedTrades: number;
  goodDecisions: number;
  totalEvaluated: number;
  lastAdaptedDecisionCount: number;
}

// ─── Orchestrator ───────────────────────────────────────────────
export class FloatOrchestrator {
  private agents: Map<string, SubagentState> = new Map();
  private running = false;
  private loopInterval: ReturnType<typeof setInterval> | null = null;
  private loopCount = 0;
  private strategyVersion = 1;
  private criticReviews: CriticReview[] = [];

  constructor(
    private apiKey: string,
    private entitySecret: string,
  ) {}

  registerAgent(config: FloatAgentConfig) {
    const wallet = new CircleWallet(config.walletId, this.apiKey, this.entitySecret);
    this.agents.set(config.agentId, {
      config,
      wallet,
      status: 'IDLE',
      idleSince: Date.now(),
      parkedBalance: 0,
      liquidBalance: 0,
      lastActionTime: 0,
      decisions: [],
      totalYieldCaptured: 0,
      missedTrades: 0,
      goodDecisions: 0,
      totalEvaluated: 0,
      lastAdaptedDecisionCount: 0,
    });
    console.log(`[FLOAT] Registered agent: ${config.agentId} (${config.strategy.mode})`);
  }

  // Parallel batch balance refresh (USDC liquid + Vault parked)
  async refreshBalances() {
    const promises = Array.from(this.agents.values()).map(async (agent) => {
      try {
        const address = await agent.wallet.getAddress();
        
        // Execute block queries in parallel
        const [liquid, paddedResult] = await Promise.all([
          agent.wallet.getUSDCBalance(),
          (async () => {
            if (!address) return '0x0';
            const paddedAddr = address.slice(2).padStart(64, '0');
            // deposits(address) selector = 0xfc7e286d
            return rpcCall('eth_call', [{ to: FLOAT_VAULT, data: `0xfc7e286d${paddedAddr}` }, 'latest']);
          })()
        ]);
        
        agent.liquidBalance = liquid;
        agent.parkedBalance = parseInt(paddedResult || '0x0', 16) / 1e6; // 6 decimals
      } catch (err) {
        console.error(`[FLOAT] Failed to refresh balances for ${agent.config.label}:`, err);
      }
    });
    await Promise.all(promises);
  }

  // ─── Signal from trading agent ──────────────────────────────
  signal(agentId: string, status: AgentStatus) {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    
    const prevStatus = agent.status;
    agent.status = status;
    
    if (status === 'IDLE' && prevStatus !== 'IDLE') {
      agent.idleSince = Date.now();
    }
    
    console.log(`[FLOAT] Agent ${agentId}: ${prevStatus} → ${status}`);
  }

  // ─── Start Continuous Loop ──────────────────────────────────
  async start(intervalMs = 60000) {
    if (this.running) return;
    this.running = true;
    console.log(`[FLOAT] ═══ Orchestrator started. Interval: ${intervalMs / 1000}s ═══`);
    
    // Fetch initial balances
    await this.refreshBalances().catch(err => console.error('[FLOAT] Balance fetch failed:', err));

    // Run immediately, then on interval
    this.tick();
    this.loopInterval = setInterval(() => this.tick(), intervalMs);
  }

  stop() {
    this.running = false;
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }
    console.log('[FLOAT] ═══ Orchestrator stopped. ═══');
  }

  isRunning() { return this.running; }

  // ─── Main Loop Tick ─────────────────────────────────────────
  private async tick() {
    this.loopCount++;
    console.log(`\n[FLOAT] ─── Loop #${this.loopCount} ─── ${new Date().toLocaleTimeString()}`);

    // 1. Refresh balances for all agents in parallel
    await this.refreshBalances().catch(err => console.error('[FLOAT] Balance refresh failed:', err));

    // 2. Fetch a single market snapshot for global conditions (saves 6 RPC queries per agent)
    const market = await getMarketSnapshot();

    // 3. Process each agent
    for (const [agentId, agent] of this.agents) {
      try {
        await this.processAgent(agent, market);
      } catch (err: any) {
        console.error(`[FLOAT] Error processing ${agentId}:`, err.message);
      }
    }

    // Critic review every 10 loops
    if (this.loopCount % 10 === 0) {
      await this.runCriticReview();
    }
  }

  private async processAgent(agent: SubagentState, market: MarketSnapshot) {
    const { config, wallet, status } = agent;
    const idleSeconds = (Date.now() - agent.idleSince) / 1000;

    // Use cached liquid and parked balances from parallel refresh
    const liquidBalance = agent.liquidBalance;

    // Calculate capital status using cached values
    const capital = calculateCapitalStatus(liquidBalance, agent.parkedBalance, config.strategy);

    // 4. Calculate parkability score (DETERMINISTIC — no LLM)
    const assessment = calculateParkabilityScore(
      status, idleSeconds, market, capital, config.strategy, agent.decisions,
    );

    console.log(`[FLOAT] ${config.label}: state=${status} idle=${(idleSeconds/60).toFixed(1)}m score=${assessment.score.toFixed(2)} → ${assessment.action} $${assessment.amount.toFixed(2)}`);

    // 5. Check cooldown
    const timeSinceLastAction = Date.now() - agent.lastActionTime;
    const cooldown = assessment.action === 'PARK'
      ? config.strategy.cooldownAfterParkSeconds * 1000
      : config.strategy.cooldownAfterWithdrawSeconds * 1000;
    
    if (assessment.action !== 'HOLD' && timeSinceLastAction < cooldown && assessment.action !== 'WITHDRAW') {
      console.log(`[FLOAT] ${config.label}: Cooldown active (${((cooldown - timeSinceLastAction)/1000).toFixed(0)}s remaining). Holding.`);
      this.logDecision(agent, 'HOLD', 0, liquidBalance, agent.parkedBalance, assessment.score, 
        `Cooldown: ${((cooldown - timeSinceLastAction)/1000).toFixed(0)}s remaining.`, market);
      return;
    }

    // 6. Execute
    if (assessment.action === 'PARK' && assessment.amount >= config.strategy.minRouteAmount) {
      await this.executePark(agent, assessment.amount, liquidBalance, market, assessment.score);
    } else if (assessment.action === 'WITHDRAW' && agent.parkedBalance > 0) {
      await this.executeWithdraw(agent, assessment.amount, liquidBalance, market, assessment.score);
    } else {
      this.logDecision(agent, 'HOLD', 0, liquidBalance, agent.parkedBalance, assessment.score, 
        assessment.reason, market);
    }
  }

  // ─── Execute Park ───────────────────────────────────────────
  private async executePark(agent: SubagentState, amount: number, liquidBefore: number, market: MarketSnapshot, score: number) {
    const rawAmount = Math.floor(amount * 1e6).toString();
    const { config, wallet } = agent;

    console.log(`[FLOAT] ${config.label}: PARKING $${amount.toFixed(2)} USDC...`);

    try {
      // Approve → Park → Wait
      const approveTxId = await wallet.approveUSDC(rawAmount);
      const approveResult = await wallet.waitForTransaction(approveTxId, 60, 300);
      if (approveResult.state !== 'COMPLETE') throw new Error(`Approve failed: ${approveResult.errorDetails}`);

      const parkTxId = await wallet.executeTransaction(FLOAT_VAULT, "park(uint256)", [rawAmount]);
      const parkResult = await wallet.waitForTransaction(parkTxId, 60, 300);
      if (parkResult.state !== 'COMPLETE') throw new Error(`Park failed: ${parkResult.errorDetails}`);

      agent.parkedBalance += amount;
      agent.lastActionTime = Date.now();

      const liquidAfter = await wallet.getUSDCBalance();
      agent.liquidBalance = liquidAfter;
      
      this.logDecision(agent, 'PARK', amount, liquidBefore, agent.parkedBalance, score,
        `Parked $${amount.toFixed(2)} into USYC vault.`, market, parkResult.txHash, 'COMPLETE');
      
      console.log(`[FLOAT] ${config.label}: ✅ Park confirmed. Liquid: $${liquidAfter.toFixed(2)}, Parked: $${agent.parkedBalance.toFixed(2)}`);
    } catch (err: any) {
      console.error(`[FLOAT] ${config.label}: ❌ Park failed:`, err.message);
      this.logDecision(agent, 'PARK', amount, liquidBefore, agent.parkedBalance, score,
        `Park failed: ${err.message}`, market, undefined, 'FAILED');
    }
  }

  // ─── Execute Withdraw ───────────────────────────────────────
  private async executeWithdraw(agent: SubagentState, amount: number, liquidBefore: number, market: MarketSnapshot, score: number) {
    const withdrawAmount = Math.min(amount, agent.parkedBalance);
    const rawAmount = Math.floor(withdrawAmount * 1e6).toString();
    const { config, wallet } = agent;

    console.log(`[FLOAT] ${config.label}: WITHDRAWING $${withdrawAmount.toFixed(2)} USDC...`);

    try {
      const txId = await wallet.executeTransaction(FLOAT_VAULT, "withdraw(uint256)", [rawAmount]);
      const result = await wallet.waitForTransaction(txId, 60, 300);
      if (result.state !== 'COMPLETE') throw new Error(`Withdraw failed: ${result.errorDetails}`);

      agent.parkedBalance = Math.max(0, agent.parkedBalance - withdrawAmount);
      agent.lastActionTime = Date.now();

      const liquidAfter = await wallet.getUSDCBalance();
      agent.liquidBalance = liquidAfter;
      
      this.logDecision(agent, 'WITHDRAW', withdrawAmount, liquidBefore, agent.parkedBalance, score,
        `Recalled $${withdrawAmount.toFixed(2)} from vault.`, market, result.txHash, 'COMPLETE');
      
      console.log(`[FLOAT] ${config.label}: ✅ Withdraw confirmed. Liquid: $${liquidAfter.toFixed(2)}, Parked: $${agent.parkedBalance.toFixed(2)}`);
    } catch (err: any) {
      console.error(`[FLOAT] ${config.label}: ❌ Withdraw failed:`, err.message);
      this.logDecision(agent, 'WITHDRAW', withdrawAmount, liquidBefore, agent.parkedBalance, score,
        `Withdraw failed: ${err.message}`, market, undefined, 'FAILED');
    }
  }

  // ─── Log Decision ───────────────────────────────────────────
  private logDecision(
    agent: SubagentState,
    action: DecisionLog['action'],
    amount: number,
    liquidBefore: number,
    parkedAfter: number,
    score: number,
    reason: string,
    market: MarketSnapshot,
    txHash?: string,
    txStatus?: DecisionLog['txStatus'],
  ) {
    const decision: DecisionLog = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      agentId: agent.config.agentId,
      agentState: agent.status,
      walletBalance: liquidBefore + agent.parkedBalance,
      liquidBefore,
      parkedBefore: agent.parkedBalance - (action === 'PARK' ? amount : action === 'WITHDRAW' ? -amount : 0),
      action,
      amount,
      liquidAfter: action === 'PARK' ? liquidBefore - amount : action === 'WITHDRAW' ? liquidBefore + amount : liquidBefore,
      parkedAfter,
      parkabilityScore: score,
      reason,
      txHash,
      txStatus,
    };

    agent.decisions = [decision, ...agent.decisions].slice(0, 100);
  }

  // ─── Critic Review ─────────────────────────────────────────
  private async runCriticReview() {
    console.log(`\n[FLOAT CRITIC] ═══ Running review (loop #${this.loopCount}) ═══`);
    
    for (const [agentId, agent] of this.agents) {
      // Evaluate recent unscored decisions
      const unscored = agent.decisions.filter(d => !d.outcome && d.action !== 'HOLD');
      for (const d of unscored.slice(0, 5)) {
        const recallNeeded = d.agentState === 'PRE_TRADE' || d.agentState === 'EMERGENCY';
        d.outcome = evaluateDecision(d, agent.parkedBalance, false, recallNeeded);
        agent.totalEvaluated++;
        if (d.outcome.wasGoodDecision) agent.goodDecisions++;
        agent.totalYieldCaptured += d.outcome.yieldEarned;
      }

      // Ask critic for recommendations with a 10-decision cooldown to prevent strategy oscillation
      const decisionsCount = agent.decisions.length;
      const decisionsSinceLastAdapt = decisionsCount - (agent.lastAdaptedDecisionCount || 0);

      if (decisionsSinceLastAdapt >= 10) {
        const review = await reviewDecisions(agent.decisions, agent.config.strategy);
        if (review && review.suggestedChanges) {
          console.log(`[FLOAT CRITIC] ${agentId}: "${review.finding}" (${review.confidence} confidence)`);
          
          // Apply the suggested changes to the agent's strategy config
          agent.config.strategy = {
            ...agent.config.strategy,
            ...review.suggestedChanges
          };
          console.log(`[FLOAT CRITIC] ${agentId}: Applied strategy changes:`, JSON.stringify(review.suggestedChanges));
          
          agent.lastAdaptedDecisionCount = decisionsCount;
          this.criticReviews = [review, ...this.criticReviews].slice(0, 20);
          this.strategyVersion++;
        }
      } else {
        console.log(`[FLOAT CRITIC] ${agentId}: Skipping review. Collected ${decisionsSinceLastAdapt}/10 new decisions since last adaptation.`);
      }
    }
  }

  // ─── Public State for API/Dashboard ─────────────────────────
  getState() {
    const agents = Array.from(this.agents.entries()).map(([id, agent]) => ({
      agentId: id,
      walletId: agent.config.walletId,
      label: agent.config.label,
      strategy: agent.config.strategy.mode,
      status: agent.status,
      liquidBalance: agent.liquidBalance || 0,
      parkedBalance: agent.parkedBalance,
      totalYieldCaptured: agent.totalYieldCaptured,
      missedTrades: agent.missedTrades,
      decisionAccuracy: agent.totalEvaluated > 0 
        ? agent.goodDecisions / agent.totalEvaluated 
        : 0,
      totalDecisions: agent.decisions.length,
      recentDecisions: agent.decisions.slice(0, 10),
    }));

    return {
      running: this.running,
      loopCount: this.loopCount,
      strategyVersion: this.strategyVersion,
      agents,
      criticReviews: this.criticReviews.slice(0, 5),
    };
  }

  // Get real-time state with live balances (now reads cached memory values for 0ms latency)
  async getStateWithBalances() {
    return this.getState();
  }
}

// ─── Singleton ──────────────────────────────────────────────────
const globalForFloat = globalThis as unknown as { floatOrchestrator: FloatOrchestrator | undefined };

export function getOrCreateOrchestrator(): FloatOrchestrator {
  if (globalForFloat.floatOrchestrator) return globalForFloat.floatOrchestrator;

  const apiKey = process.env.CIRCLE_API_KEY ?? '';
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET ?? '';

  const orchestrator = new FloatOrchestrator(apiKey, entitySecret);

  // Register 3 trading agents whose idle capital FLOAT manages
  orchestrator.registerAgent({
    agentId: 'trader-a',
    walletId: '8c1f5e79-5b46-5391-a527-0a6b7ff48ba0',
    strategy: STRATEGY_PRESETS.aggressive,
    label: 'Trader A',
  });

  orchestrator.registerAgent({
    agentId: 'trader-b',
    walletId: '94c20218-7750-5f4b-bf86-3f0e6e38f850',
    strategy: STRATEGY_PRESETS.balanced,
    label: 'Trader B',
  });

  orchestrator.registerAgent({
    agentId: 'trader-c',
    walletId: '2c6189c5-d31e-5c06-9f2a-45fe9c82ad6c',
    strategy: STRATEGY_PRESETS.conservative,
    label: 'Trader C',
  });

  globalForFloat.floatOrchestrator = orchestrator;
  return orchestrator;
}
