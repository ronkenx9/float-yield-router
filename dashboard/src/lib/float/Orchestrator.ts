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
 *
 * Wallet layer: Circle Agent Wallets via CLI (CircleAgentAdapter).
 * No API keys or entity secrets — auth is handled by the local `circle` CLI session.
 */

import { CircleAgentAdapter } from '../agent/CircleAgentAdapter';
import { getMarketSnapshot, rpcCall } from './MarketFeed';
import { calculateCapitalStatus, calculateParkabilityScore } from './PolicyEngine';
import { explainDecision, reviewDecisions, evaluateDecision, USYC_APY, VAULT_PROVIDER, fetchLiveUsycApy, type CriticReview } from './Evaluator';
import type { FloatAgentConfig, AgentStatus, DecisionLog, StrategyConfig, CapitalStatus, MarketSnapshot } from './types';
import { STRATEGY_PRESETS } from './types';
import { writeRawEvent, writeHeartbeat } from '../brain/BrainWriter';
import { runCompile, readAgentLedger } from '../brain/BrainCompiler';
import { recordStrategyVersion } from '../brain/BrainIndex';
import { startWatching, hydrateFromAuditFile, markApplied, type ApprovedChange } from '../brain/AuditWatcher';

const FLOAT_VAULT = '0xfAe6a9D5b0835ca7e9B090eCe0f57C14899BeDA6';
const ARC_USDC   = '0x3600000000000000000000000000000000000000';
const USDC_DECIMALS = 6;

// ─── Subagent State ─────────────────────────────────────────────
interface SubagentState {
  config: FloatAgentConfig;
  adapter: CircleAgentAdapter;
  status: AgentStatus;
  idleSince: number;
  parkedBalance: number;
  liquidBalance: number;
  lastBalanceRefreshAt: number;
  balanceFresh: boolean;
  consecutiveRefreshFailures: number;
  lastActionTime: number;
  decisions: DecisionLog[];
  totalYieldCaptured: number;
  missedTrades: number;
  goodDecisions: number;
  totalEvaluated: number;
  lastAdaptedDecisionCount: number;
}

const MAX_BALANCE_AGE_MS = 60_000;

/**
 * Set of wallet addresses currently mid-transaction.
 * When a wallet is in this set, other agents sharing it skip execution
 * that tick to prevent concurrent CLI calls / nonce collisions.
 */
const _executingWallets = new Set<string>();

/** Convert human-readable USDC to raw 6-decimal units (string for CLI args). */
function toRawUsdc(amount: number): string {
  return String(Math.round(amount * Math.pow(10, USDC_DECIMALS)));
}

// ─── Orchestrator ───────────────────────────────────────────────
export class FloatOrchestrator {
  private agents: Map<string, SubagentState> = new Map();
  private running = false;
  private loopInterval: ReturnType<typeof setInterval> | null = null;
  private loopCount = 0;
  private strategyVersion = 1;
  private criticReviews: CriticReview[] = [];

  constructor() {}

  registerAgent(config: FloatAgentConfig) {
    const adapter = new CircleAgentAdapter({
      walletAddress: config.walletId,   // walletId field holds the 0x address for agent wallets
      chain: 'ARC-TESTNET',
      confirmationTimeoutMs: 60_000,        // tightened: most txs settle in <5s on Arc
      accelerateThresholdMs: 15_000,        // accelerate sooner since polls are cheap now
      maxAccelerateAttempts: 2,
      confirmationPollMs: 500,              // direct eth_getTransactionReceipt → cheap to poll fast
    });

    this.agents.set(config.agentId, {
      config,
      adapter,
      status: 'IDLE',
      idleSince: Date.now(),
      parkedBalance: 0,
      liquidBalance: 0,
      lastBalanceRefreshAt: 0,
      balanceFresh: false,
      consecutiveRefreshFailures: 0,
      lastActionTime: 0,
      decisions: [],
      totalYieldCaptured: 0,
      missedTrades: 0,
      goodDecisions: 0,
      totalEvaluated: 0,
      lastAdaptedDecisionCount: 0,
    });
    console.log(`[FLOAT] Registered agent: ${config.agentId} (${config.strategy.mode}) @ ${config.walletId}`);
  }

  // ─── Deduplicated balance refresh ───────────────────────────
  // When multiple agents share the same wallet address we call the CLI once
  // and distribute the result, preventing concurrent 429s.
  async refreshBalances() {
    // Group agents by wallet address
    const byAddress = new Map<string, SubagentState[]>();
    for (const agent of this.agents.values()) {
      const addr = agent.adapter.walletAddress;
      if (!byAddress.has(addr)) byAddress.set(addr, []);
      byAddress.get(addr)!.push(agent);
    }

    // Fetch once per unique address, then stamp all agents sharing it
    const perAddressPromises = Array.from(byAddress.entries()).map(async ([address, agents]) => {
      try {
        const paddedAddr = address.slice(2).padStart(64, '0');
        // Single CLI call for liquid balance + single RPC call for vault balance
        const [liquid, paddedResult] = await Promise.all([
          agents[0].adapter.getUSDCBalance(),        // one CLI call
          rpcCall('eth_call', [                       // one RPC call
            { to: FLOAT_VAULT, data: `0xfc7e286d${paddedAddr}` },
            'latest',
          ]),
        ]);

        const parked = parseInt(paddedResult || '0x0', 16) / 1e6;
        const now = Date.now();

        for (const agent of agents) {
          agent.liquidBalance = liquid;
          agent.parkedBalance = parked;           // ground truth from chain
          agent.lastBalanceRefreshAt = now;
          agent.balanceFresh = true;
          agent.consecutiveRefreshFailures = 0;
        }
      } catch (err: any) {
        for (const agent of agents) {
          agent.consecutiveRefreshFailures++;
          agent.balanceFresh = false;
        }
        console.error(
          `[FLOAT] Balance refresh failed for ${address} ` +
          `(${agents[0].consecutiveRefreshFailures} consecutive failures): ${err?.message || err}`
        );
      }
    });

    await Promise.all(perAddressPromises);
  }

  // ─── Status signal from trading agent ───────────────────────
  signal(agentId: string, status: AgentStatus) {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    const prev = agent.status;
    agent.status = status;
    if (status === 'IDLE' && prev !== 'IDLE') agent.idleSince = Date.now();
    console.log(`[FLOAT] Agent ${agentId}: ${prev} → ${status}`);
  }

  // ─── Start Continuous Loop ───────────────────────────────────
  async start(intervalMs = 60_000) {
    if (this.running) return;
    this.running = true;
    console.log(`[FLOAT] ═══ Orchestrator started. Interval: ${intervalMs / 1000}s ═══`);
    await this.refreshBalances().catch(err => console.error('[FLOAT] Initial balance fetch failed:', err));
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

  // ─── Main Loop Tick ──────────────────────────────────────────
  private async tick() {
    this.loopCount++;
    console.log(`\n[FLOAT] ─── Loop #${this.loopCount} ─── ${new Date().toLocaleTimeString()}`);

    // Dynamically resolve live USYC APY in background
    fetchLiveUsycApy().catch(err => console.error('[FLOAT] Live APY fetch failed:', err));

    await this.refreshBalances().catch(err => console.error('[FLOAT] Balance refresh failed:', err));

    const market = await getMarketSnapshot();

    for (const [agentId, agent] of this.agents) {
      try {
        await this.processAgent(agent, market);
      } catch (err: any) {
        console.error(`[FLOAT] Error processing ${agentId}: ${err.message}`);
      }
    }

    if (this.loopCount % 10 === 0) {
      await this.runCriticReview();
    }
  }

  // ─── Per-Agent Decision + Execution ─────────────────────────
  private async processAgent(agent: SubagentState, market: MarketSnapshot) {
    const { config, adapter, status } = agent;
    const idleSeconds = (Date.now() - agent.idleSince) / 1000;

    // Guard: stale balance → force HOLD, never act on poisoned data
    const balanceAge = Date.now() - agent.lastBalanceRefreshAt;
    if (!agent.balanceFresh || agent.lastBalanceRefreshAt === 0 || balanceAge > MAX_BALANCE_AGE_MS) {
      console.warn(
        `[FLOAT] ${config.label}: Balance stale ` +
        `(age=${(balanceAge / 1000).toFixed(1)}s, failures=${agent.consecutiveRefreshFailures}). Forcing HOLD.`
      );
      this.logDecision(agent, 'HOLD', 0, agent.liquidBalance, agent.parkedBalance, 0,
        `Stale balance (${agent.consecutiveRefreshFailures} refresh failures).`, market);
      return;
    }

    const liquidBalance = agent.liquidBalance;
    const capital = calculateCapitalStatus(liquidBalance, agent.parkedBalance, config.strategy);

    const assessment = calculateParkabilityScore(
      status, idleSeconds, market, capital, config.strategy, agent.decisions,
    );

    console.log(
      `[FLOAT] ${config.label}: state=${status} idle=${(idleSeconds / 60).toFixed(1)}m ` +
      `score=${assessment.score.toFixed(2)} → ${assessment.action} $${assessment.amount.toFixed(2)}`
    );

    // Cooldown check
    const timeSinceLastAction = Date.now() - agent.lastActionTime;
    const cooldownMs = assessment.action === 'PARK'
      ? config.strategy.cooldownAfterParkSeconds * 1000
      : config.strategy.cooldownAfterWithdrawSeconds * 1000;

    if (assessment.action !== 'HOLD' && timeSinceLastAction < cooldownMs && assessment.action !== 'WITHDRAW') {
      const remaining = ((cooldownMs - timeSinceLastAction) / 1000).toFixed(0);
      console.log(`[FLOAT] ${config.label}: Cooldown active (${remaining}s remaining). Holding.`);
      this.logDecision(agent, 'HOLD', 0, liquidBalance, agent.parkedBalance, assessment.score,
        `Cooldown: ${remaining}s remaining.`, market);
      return;
    }

    // Wallet execution guard: skip if another agent is already transacting on this wallet.
    // This prevents concurrent CLI calls / nonce collisions on shared wallets.
    const walletAddr = agent.adapter.walletAddress;
    if (assessment.action !== 'HOLD' && _executingWallets.has(walletAddr)) {
      console.log(`[FLOAT] ${config.label}: Wallet busy (another agent executing). Skipping this tick.`);
      this.logDecision(agent, 'HOLD', 0, liquidBalance, agent.parkedBalance, assessment.score,
        `Wallet ${walletAddr.slice(0, 8)}… busy — another agent executing. Deferred.`, market);
      return;
    }

    if (assessment.action === 'PARK' && assessment.amount >= config.strategy.minRouteAmount) {
      _executingWallets.add(walletAddr);
      try {
        await this.executePark(agent, assessment.amount, liquidBalance, market, assessment.score);
      } finally {
        _executingWallets.delete(walletAddr);
      }
    } else if (assessment.action === 'WITHDRAW' && agent.parkedBalance > 0) {
      _executingWallets.add(walletAddr);
      try {
        await this.executeWithdraw(agent, assessment.amount, liquidBalance, market, assessment.score);
      } finally {
        _executingWallets.delete(walletAddr);
      }
    } else {
      this.logDecision(agent, 'HOLD', 0, liquidBalance, agent.parkedBalance, assessment.score,
        assessment.reason, market);
    }
  }

  // ─── Execute Park ────────────────────────────────────────────
  private async executePark(
    agent: SubagentState,
    amount: number,
    liquidBefore: number,
    market: MarketSnapshot,
    score: number,
  ) {
    const { config, adapter } = agent;
    const rawAmount = toRawUsdc(amount);
    const startedAt = Date.now();

    console.log(`[FLOAT] ${config.label}: PARKING $${amount.toFixed(2)} USDC (raw ${rawAmount})...`);

    try {
      // Step 1: approve vault to spend rawAmount USDC
      await adapter.executeContract({
        contractAddress: ARC_USDC,
        signature: 'approve(address,uint256)',
        args: [FLOAT_VAULT, rawAmount],
        waitForConfirmation: true,
      });

      // Step 2: vault.park(rawAmount) — pulls via transferFrom, credits deposits[agent]
      const parkResult = await adapter.executeContract({
        contractAddress: FLOAT_VAULT,
        signature: 'park(uint256)',
        args: [rawAmount],
        waitForConfirmation: true,
      });

      agent.parkedBalance += amount;
      agent.lastActionTime = Date.now();

      const liquidAfter = await adapter.getUSDCBalance();
      agent.liquidBalance = liquidAfter;

      const latencyMs = Date.now() - startedAt;
      this.logDecision(agent, 'PARK', amount, liquidBefore, agent.parkedBalance, score,
        `Parked $${amount.toFixed(2)} into USYC vault in ${(latencyMs/1000).toFixed(1)}s. TX: ${parkResult.txHash}`,
        market, parkResult.txHash, 'COMPLETE', latencyMs);

      console.log(
        `[FLOAT] ${config.label}: ✅ Park confirmed in ${latencyMs}ms. ` +
        `Liquid: $${liquidAfter.toFixed(2)}, Parked: $${agent.parkedBalance.toFixed(2)}`
      );
    } catch (err: any) {
      console.error(`[FLOAT] ${config.label}: ❌ Park failed: ${err.message}`);
      this.logDecision(agent, 'PARK', amount, liquidBefore, agent.parkedBalance, score,
        `Park failed: ${err.message}`, market, undefined, 'FAILED', Date.now() - startedAt);
    }
  }

  // ─── Execute Withdraw ────────────────────────────────────────
  private async executeWithdraw(
    agent: SubagentState,
    amount: number,
    liquidBefore: number,
    market: MarketSnapshot,
    score: number,
  ) {
    const { config, adapter } = agent;

    // Pre-flight: read actual vault deposit from chain before submitting.
    // Another agent sharing this wallet may have already withdrawn; the cached
    // parkedBalance could be stale even though refreshBalances ran this tick.
    let actualParked: number;
    try {
      const paddedAddr = adapter.walletAddress.slice(2).padStart(64, '0');
      const raw = await rpcCall('eth_call', [
        { to: FLOAT_VAULT, data: `0xfc7e286d${paddedAddr}` },
        'latest',
      ]);
      actualParked = parseInt(raw || '0x0', 16) / 1e6;
    } catch {
      actualParked = agent.parkedBalance; // fallback to cache on RPC error
    }

    // Sync cache and abort if nothing to withdraw
    agent.parkedBalance = actualParked;
    if (actualParked < 0.000001) {
      console.log(`[FLOAT] ${config.label}: Pre-flight abort — vault shows $0 parked (cache was stale). Skipping withdraw.`);
      this.logDecision(agent, 'HOLD', 0, liquidBefore, 0, score,
        `Withdraw skipped: vault deposit is $0.00 (another agent already recalled). Cache synced.`, market);
      return;
    }

    const withdrawAmount = Math.min(amount, actualParked);
    const rawAmount = toRawUsdc(withdrawAmount);
    const startedAt = Date.now();

    console.log(`[FLOAT] ${config.label}: WITHDRAWING $${withdrawAmount.toFixed(2)} USDC (raw ${rawAmount})...`);

    try {
      // vault.withdraw(rawAmount) — vault sends USDC to msg.sender (agent wallet)
      const result = await adapter.executeContract({
        contractAddress: FLOAT_VAULT,
        signature: 'withdraw(uint256)',
        args: [rawAmount],
        waitForConfirmation: true,
      });

      agent.parkedBalance = Math.max(0, agent.parkedBalance - withdrawAmount);
      agent.lastActionTime = Date.now();

      const liquidAfter = await adapter.getUSDCBalance();
      agent.liquidBalance = liquidAfter;

      const latencyMs = Date.now() - startedAt;
      this.logDecision(agent, 'WITHDRAW', withdrawAmount, liquidBefore, agent.parkedBalance, score,
        `Recalled $${withdrawAmount.toFixed(2)} from USYC vault in ${(latencyMs/1000).toFixed(1)}s. TX: ${result.txHash}`,
        market, result.txHash, 'COMPLETE', latencyMs);

      console.log(
        `[FLOAT] ${config.label}: ✅ Withdraw confirmed in ${latencyMs}ms. ` +
        `Liquid: $${liquidAfter.toFixed(2)}, Parked: $${agent.parkedBalance.toFixed(2)}`
      );
    } catch (err: any) {
      console.error(`[FLOAT] ${config.label}: ❌ Withdraw failed: ${err.message}`);
      this.logDecision(agent, 'WITHDRAW', withdrawAmount, liquidBefore, agent.parkedBalance, score,
        `Withdraw failed: ${err.message}`, market, undefined, 'FAILED', Date.now() - startedAt);
    }
  }

  // ─── Log Decision ────────────────────────────────────────────
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
    recallLatencyMs?: number,
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
      recallLatencyMs,
    };
    agent.decisions = [decision, ...agent.decisions].slice(0, 100);

    // Write to Second Brain raw log (fire-and-forget, never throws)
    if (action !== 'HOLD') {
      const shouldCompile = writeRawEvent({
        type: 'decision',
        agentId: agent.config.agentId,
        timestamp: decision.timestamp,
        data: { action, amount, txStatus, txHash, score, reason: reason.slice(0, 100) },
      });
      if (shouldCompile) {
        runCompile().catch(() => {}); // async, non-blocking
      }
    }
  }

  // ─── Critic Review ────────────────────────────────────────────
  private async runCriticReview() {
    console.log(`\n[FLOAT CRITIC] ═══ Running review (loop #${this.loopCount}) ═══`);

    for (const [agentId, agent] of this.agents) {
      // Score unscored non-HOLD decisions
      const unscored = agent.decisions.filter(d => !d.outcome && d.action !== 'HOLD');
      for (const d of unscored.slice(0, 5)) {
        const recallNeeded = d.agentState === 'PRE_TRADE' || d.agentState === 'EMERGENCY';
        d.outcome = evaluateDecision(d, agent.parkedBalance, false, recallNeeded);
        agent.totalEvaluated++;
        if (d.outcome.wasGoodDecision) agent.goodDecisions++;
        agent.totalYieldCaptured += d.outcome.yieldEarned;
      }

      // Ask Critic for recommendations (10-decision cooldown)
      const decisionsCount = agent.decisions.length;
      const decisionsSinceLastAdapt = decisionsCount - (agent.lastAdaptedDecisionCount || 0);

      if (decisionsSinceLastAdapt >= 10) {
        // Double-loop: pass agentId so the Critic reads Second Brain ledger history
        const review = await reviewDecisions(agent.decisions, agent.config.strategy, agentId);
        if (review?.suggestedChanges) {
          const version = this.strategyVersion + 1;
          console.log(`[FLOAT CRITIC] ${agentId}: "${review.finding}" (${review.confidence} confidence)`);
          console.log(`[FLOAT CRITIC AUDIT] ${agentId}: Suggested changes:`, JSON.stringify(review.suggestedChanges));

          const auditReview = {
            ...review,
            agentId,
            timestamp: new Date().toISOString(),
            applied: false,
            version,
          };

          agent.lastAdaptedDecisionCount = decisionsCount;
          this.criticReviews = [auditReview as any, ...this.criticReviews].slice(0, 20);
          this.strategyVersion = version;

          // Record in Second Brain index + write raw event for compiler
          recordStrategyVersion({
            version,
            timestamp: auditReview.timestamp,
            agentId,
            finding: review.finding,
            changes: review.suggestedChanges as Record<string, unknown>,
          });
          writeRawEvent({
            type: 'critic_review',
            agentId,
            timestamp: auditReview.timestamp,
            data: {
              version,
              finding: review.finding,
              suggestedChanges: review.suggestedChanges,
              confidence: review.confidence,
              reasoning: review.reasoning,
            },
          });
        }
      } else {
        console.log(
          `[FLOAT CRITIC] ${agentId}: Skipping — ${decisionsSinceLastAdapt}/10 new decisions since last review.`
        );
      }
    }
  }

  // ─── Public State for Dashboard API ──────────────────────────
  /**
   * Aggregate recall/park latency from all completed transactions across all agents.
   * Returns p50 and p95 in milliseconds for the dashboard headline tile.
   */
  private computeLatencyStats(): { p50: number | null; p95: number | null; samples: number } {
    const all: number[] = [];
    for (const agent of this.agents.values()) {
      for (const d of agent.decisions) {
        if (d.txStatus === 'COMPLETE' && typeof d.recallLatencyMs === 'number') {
          all.push(d.recallLatencyMs);
        }
      }
    }
    if (all.length === 0) return { p50: null, p95: null, samples: 0 };
    all.sort((a, b) => a - b);
    const pick = (q: number) => all[Math.min(all.length - 1, Math.floor(all.length * q))];
    return { p50: pick(0.5), p95: pick(0.95), samples: all.length };
  }

  getState() {
    const agents = Array.from(this.agents.entries()).map(([id, agent]) => ({
      agentId: id,
      walletId: agent.config.walletId,
      label: agent.config.label,
      strategy: agent.config.strategy.mode,
      strategyConfig: {
        maxActionsPerHour:           agent.config.strategy.maxActionsPerHour,
        minIdleTimeSeconds:          agent.config.strategy.minIdleTimeSeconds,
        cooldownAfterParkSeconds:    agent.config.strategy.cooldownAfterParkSeconds,
        cooldownAfterWithdrawSeconds: agent.config.strategy.cooldownAfterWithdrawSeconds,
        parkThreshold:               agent.config.strategy.parkThreshold,
        withdrawThreshold:           agent.config.strategy.withdrawThreshold,
      },
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
      latencyStats: this.computeLatencyStats(),
      vault: {
        provider:        VAULT_PROVIDER,             // "USYC"
        description:     "Circle's tokenized money market fund",
        targetApy:       USYC_APY,                   // 0.0515
        targetApyLabel:  `${(USYC_APY * 100).toFixed(2)}%`,
        chain:           'ARC-TESTNET',
        contractAddress: '0xfAe6a9D5b0835ca7e9B090eCe0f57C14899BeDA6',
      },
    };
  }

  async getStateWithBalances() {
    return this.getState();
  }

  /**
   * Apply an approved strategy change from the audit file.
   * Called by the AuditWatcher callback and on startup hydration.
   */
  applyStrategyChange(change: ApprovedChange): void {
    const agent = this.agents.get(change.agentId);
    if (!agent) {
      console.warn(`[FLOAT] applyStrategyChange: unknown agentId ${change.agentId}`);
      return;
    }

    const before = { ...agent.config.strategy };
    for (const [key, value] of Object.entries(change.changes)) {
      if (key in agent.config.strategy) {
        (agent.config.strategy as any)[key] = value;
      }
    }

    if (change.strategyVersion > this.strategyVersion) {
      this.strategyVersion = change.strategyVersion;
    }

    console.log(
      `[FLOAT] ✅ Strategy change applied to ${change.agentId} (v${change.strategyVersion}): ` +
      `${JSON.stringify(change.changes)} | was: ${JSON.stringify(
        Object.fromEntries(Object.keys(change.changes).map(k => [k, (before as any)[k]]))
      )}`
    );

    markApplied(change.agentId, change.strategyVersion);
  }
}

// ─── Singleton ──────────────────────────────────────────────────
const globalForFloat = globalThis as unknown as { floatOrchestrator: FloatOrchestrator | undefined };

export function getOrCreateOrchestrator(): FloatOrchestrator {
  if (globalForFloat.floatOrchestrator) return globalForFloat.floatOrchestrator;

  const AGENT_WALLET = '0xd19228b9433577605d485dc94b3e02840aed0c65';

  const orchestrator = new FloatOrchestrator();

  // Three traders, one shared Circle Agent Wallet, three distinct strategies.
  // In production each trader would have its own separate agent wallet.
  orchestrator.registerAgent({
    agentId: 'trader-a',
    walletId: AGENT_WALLET,
    strategy: STRATEGY_PRESETS.aggressive,
    label: 'Trader A',
  });

  orchestrator.registerAgent({
    agentId: 'trader-b',
    walletId: AGENT_WALLET,
    strategy: STRATEGY_PRESETS.balanced,
    label: 'Trader B',
  });

  orchestrator.registerAgent({
    agentId: 'trader-c',
    walletId: AGENT_WALLET,
    strategy: STRATEGY_PRESETS.conservative,
    label: 'Trader C',
  });

  globalForFloat.floatOrchestrator = orchestrator;

  // ── Startup hydration: restore previously approved strategy changes ──
  const approved = hydrateFromAuditFile();
  for (const change of approved) {
    orchestrator.applyStrategyChange(change);
  }

  // ── Start audit file watcher: apply new approvals in real-time ──
  startWatching((change: ApprovedChange) => {
    orchestrator.applyStrategyChange(change);
  });

  return orchestrator;
}
