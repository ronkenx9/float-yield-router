/**
 * FLOAT System Monitor
 * 
 * Polls the orchestrator + trade simulator every 10 minutes,
 * writes a status report, and prints observations + proposed improvements.
 */

const API = 'http://localhost:3000/api/agent/loop';
const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

interface Snapshot {
  time: string;
  loopCount: number;
  agents: any[];
  trades: any;
  criticReviews: any[];
}

const history: Snapshot[] = [];

async function fetchState(): Promise<any> {
  const res = await fetch(API);
  return res.json();
}

function report(data: any, reportNum: number) {
  const state = data.state || {};
  const trades = data.tradeSimulator || {};
  const agents = state.agents || [];
  const critics = state.criticReviews || [];

  const snap: Snapshot = {
    time: new Date().toLocaleTimeString(),
    loopCount: state.loopCount || 0,
    agents,
    trades,
    criticReviews: critics,
  };
  history.push(snap);

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  FLOAT STATUS REPORT #${reportNum}  —  ${new Date().toLocaleString()}`);
  console.log(`${'═'.repeat(70)}`);

  // ─── System Health ───
  console.log(`\n📊 SYSTEM HEALTH`);
  console.log(`   Loop Running: ${state.running ? '✅ YES' : '❌ NO'}`);
  console.log(`   Loop Count:   ${state.loopCount}`);
  console.log(`   Strategy Ver: v${state.strategyVersion}`);
  console.log(`   Trade Sim:    ${trades.running ? '✅ Running' : '❌ Stopped'}`);

  // ─── Agent Status ───
  console.log(`\n👥 AGENT STATUS`);
  console.log(`   ${'Agent'.padEnd(12)} ${'Status'.padEnd(12)} ${'Liquid'.padEnd(10)} ${'Parked'.padEnd(10)} ${'Accuracy'.padEnd(10)} Decisions`);
  console.log(`   ${'─'.repeat(64)}`);
  
  let totalLiquid = 0, totalParked = 0;
  for (const a of agents) {
    const accuracy = a.totalEvaluated > 0 ? `${(a.decisionAccuracy * 100).toFixed(0)}%` : 'N/A';
    console.log(`   ${a.label.padEnd(12)} ${a.status.padEnd(12)} $${(a.liquidBalance || 0).toFixed(2).padEnd(8)} $${a.parkedBalance.toFixed(2).padEnd(8)} ${accuracy.padEnd(10)} ${a.totalDecisions}`);
    totalLiquid += a.liquidBalance || 0;
    totalParked += a.parkedBalance || 0;
  }
  console.log(`   ${'─'.repeat(64)}`);
  console.log(`   ${'TOTAL'.padEnd(12)} ${''.padEnd(12)} $${totalLiquid.toFixed(2).padEnd(8)} $${totalParked.toFixed(2).padEnd(8)}`);

  // ─── Trade Simulator ───
  console.log(`\n⚡ TRADE SIMULATOR`);
  console.log(`   Total Trades:       ${trades.totalTrades}`);
  console.log(`   Missed Trades:      ${trades.missedTrades}`);
  console.log(`   Success Rate:       ${trades.successRate}`);
  console.log(`   Avg Recall Latency: ${trades.avgRecallLatencyMs}ms`);

  if (trades.recentTrades?.length > 0) {
    console.log(`\n   Recent Trades:`);
    for (const t of trades.recentTrades.slice(0, 5)) {
      const icon = t.capitalReady ? '✅' : '⚠️';
      console.log(`   ${icon} ${t.description} | Recall: ${t.recallLatencyMs}ms`);
    }
  }

  // ─── Critic Reviews ───
  if (critics.length > 0) {
    console.log(`\n🧠 CRITIC REVIEWS`);
    for (const r of critics.slice(0, 3)) {
      console.log(`   💡 ${r.finding} (${r.confidence} confidence)`);
      if (r.reasoning) console.log(`      → ${r.reasoning}`);
    }
  }

  // ─── Observations ───
  console.log(`\n📝 OBSERVATIONS`);
  const obs: string[] = [];

  // Capital utilization
  const utilization = totalParked / (totalLiquid + totalParked) * 100;
  if (utilization > 50) {
    obs.push(`✅ High capital utilization (${utilization.toFixed(0)}% parked). FLOAT is actively routing idle capital.`);
  } else if (utilization > 0) {
    obs.push(`🟡 Moderate capital utilization (${utilization.toFixed(0)}% parked). Some capital earning yield.`);
  } else {
    obs.push(`⚠️ Zero capital parked. All agents are in active/cooldown states or thresholds not met.`);
  }

  // Recall performance
  if (trades.totalTrades > 0) {
    const missRate = trades.missedTrades / trades.totalTrades;
    if (missRate === 0) {
      obs.push(`✅ Perfect recall rate — zero missed trades across ${trades.totalTrades} trades.`);
    } else if (missRate < 0.2) {
      obs.push(`🟡 ${trades.missedTrades}/${trades.totalTrades} trades had delayed capital recall. Avg latency: ${trades.avgRecallLatencyMs}ms.`);
    } else {
      obs.push(`⚠️ High miss rate: ${trades.missedTrades}/${trades.totalTrades} trades missed. Recall latency: ${trades.avgRecallLatencyMs}ms. Consider increasing hot reserves.`);
    }
  }

  // Agent-specific observations
  for (const a of agents) {
    if (a.status === 'IDLE' && a.parkedBalance === 0 && (a.liquidBalance || 0) > 1) {
      obs.push(`🟡 ${a.label} has $${(a.liquidBalance || 0).toFixed(2)} idle USDC but nothing parked. Score may be below threshold.`);
    }
    if (a.parkedBalance > 0 && a.status !== 'IDLE') {
      obs.push(`⚠️ ${a.label} has $${a.parkedBalance.toFixed(2)} parked but is in ${a.status} state. FLOAT should recall.`);
    }
  }

  // Compare with previous report
  if (history.length >= 2) {
    const prev = history[history.length - 2];
    const prevTrades = prev.trades?.totalTrades || 0;
    const newTrades = trades.totalTrades - prevTrades;
    obs.push(`📈 ${newTrades} new trade events since last report.`);
    
    const prevLoops = prev.loopCount || 0;
    const newLoops = state.loopCount - prevLoops;
    obs.push(`🔄 ${newLoops} FLOAT decision loops completed since last report.`);
  }

  for (const o of obs) {
    console.log(`   ${o}`);
  }

  // ─── Proposed Improvements ───
  console.log(`\n🔧 PROPOSED IMPROVEMENTS`);
  const improvements: string[] = [];

  if (trades.avgRecallLatencyMs > 15000 && trades.totalTrades > 0) {
    improvements.push(`REDUCE RECALL LATENCY: Avg ${trades.avgRecallLatencyMs}ms exceeds 15s target. Consider increasing minHotReserveRatio to keep more capital liquid and reduce on-chain recall dependency.`);
  }

  if (trades.missedTrades > 0 && trades.totalTrades >= 3) {
    const missRate = trades.missedTrades / trades.totalTrades;
    if (missRate > 0.3) {
      improvements.push(`INCREASE HOT RESERVES: ${(missRate*100).toFixed(0)}% miss rate. Aggressive strategy's minHotReserveRatio (currently 0.20) should increase to 0.35-0.40.`);
    }
    improvements.push(`ADJUST TRADE DEADLINES: On-chain tx confirmation takes ~8-16s on Arc Testnet. Trade deadlines under 15s will always risk misses. Consider 20s minimum for all strategies.`);
  }

  const idleAgents = agents.filter((a: any) => a.status === 'IDLE' && a.parkedBalance === 0 && (a.liquidBalance || 0) > 2);
  if (idleAgents.length > 0) {
    improvements.push(`LOWER PARK THRESHOLDS: ${idleAgents.map((a: any) => a.label).join(', ')} have idle capital but score is below threshold. Consider reducing parkThreshold or minIdleTimeSeconds.`);
  }

  if (state.loopCount > 20 && critics.length === 0) {
    improvements.push(`ENABLE CRITIC DATA: After 20+ loops, critic reviews should be producing parameter recommendations. Check that decisions have outcomes scored.`);
  }

  if (improvements.length === 0) {
    improvements.push(`System operating within expected parameters. No changes recommended at this time.`);
  }

  for (const imp of improvements) {
    console.log(`   → ${imp}`);
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  Next report in 10 minutes.`);
  console.log(`${'═'.repeat(70)}\n`);
}

async function main() {
  console.log('[MONITOR] FLOAT System Monitor started. Reports every 10 minutes.\n');
  
  let reportNum = 1;
  
  // First report immediately
  try {
    const data = await fetchState();
    report(data, reportNum++);
  } catch (err: any) {
    console.error('[MONITOR] Failed to fetch state:', err.message);
  }

  // Then every 10 minutes
  setInterval(async () => {
    try {
      const data = await fetchState();
      report(data, reportNum++);
    } catch (err: any) {
      console.error('[MONITOR] Failed to fetch state:', err.message);
    }
  }, INTERVAL_MS);
}

main();
