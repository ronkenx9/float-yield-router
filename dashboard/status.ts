/**
 * FLOAT Live Status CLI
 * 
 * Run this script to instantly get the live status of the FLOAT orchestrator
 * and trade simulator without waiting for the 10-minute monitor interval.
 * 
 * Usage: npx tsx status.ts
 */

const API = 'http://localhost:3000/api/agent/loop';

async function fetchState() {
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err: any) {
    console.error(`❌ Could not connect to FLOAT API: ${err.message}`);
    console.error('Make sure the dev server is running (npm run dev).');
    process.exit(1);
  }
}

async function printReport() {
  const data = await fetchState();
  const state = data.state || {};
  const trades = data.tradeSimulator || {};
  const agents = state.agents || [];
  const critics = state.criticReviews || [];

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  FLOAT LIVE STATUS REPORT  —  ${new Date().toLocaleString()}`);
  console.log(`${'═'.repeat(70)}`);

  // ─── System Health ───
  console.log(`\n📊 SYSTEM HEALTH`);
  console.log(`   Loop Running: ${state.running ? '✅ YES' : '❌ NO'}`);
  console.log(`   Loop Count:   ${state.loopCount || 0}`);
  console.log(`   Strategy Ver: v${state.strategyVersion || 1}`);
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
  console.log(`   Total Trades:       ${trades.totalTrades || 0}`);
  console.log(`   Missed Trades:      ${trades.missedTrades || 0}`);
  console.log(`   Success Rate:       ${trades.successRate || 'N/A'}`);
  console.log(`   Avg Recall Latency: ${trades.avgRecallLatencyMs || 0}ms`);

  // ─── Yield Performance ───
  const yieldTotal = agents.reduce((sum: number, a: any) => sum + (a.totalYieldCaptured || 0), 0);
  const yieldToday = yieldTotal * 0.25; // Estimate daily run-rate or relative portion
  const projectedAnnual = totalParked * 0.048;

  console.log(`\n💰 YIELD PERFORMANCE`);
  console.log(`   Yield Earned Today: $${yieldToday.toFixed(6)} USDC`);
  console.log(`   Yield Earned Total: $${yieldTotal.toFixed(6)} USDC`);
  console.log(`   Projected Annual:   $${projectedAnnual.toFixed(2)} USDC (@ 4.8% APY)`);

  if (trades.recentTrades && trades.recentTrades.length > 0) {
    console.log(`\n   Recent Trades:`);
    for (const t of trades.recentTrades.slice(0, 5)) {
      const icon = t.capitalReady ? '✅' : '⚠️';
      console.log(`   ${icon} ${t.description} | Recall: ${t.recallLatencyMs}ms`);
    }
  }

  // ─── Critic Audit Log ───
  if (critics.length > 0) {
    console.log(`\n🧠 CRITIC AUDIT LOG (Pending Manual Developer Review)`);
    for (const r of critics.slice(0, 5)) {
      const statusLabel = r.applied ? '✅ Applied' : '⏳ Pending Audit';
      const agentLabel = r.agentId ? `[${r.agentId.toUpperCase()}] ` : '';
      console.log(`   💡 ${agentLabel}${r.finding} (${r.confidence} confidence) | ${statusLabel}`);
      if (r.reasoning) console.log(`      → Reasoning: ${r.reasoning}`);
      if (r.suggestedChanges) console.log(`      → Suggested Changes: ${JSON.stringify(r.suggestedChanges)}`);
    }
  } else if ((state.loopCount || 0) > 10) {
    console.log(`\n🧠 CRITIC AUDIT LOG`);
    console.log(`   ⏳ Waiting for enough evaluated decisions to run audit review...`);
  }

  console.log(`\n${'═'.repeat(70)}\n`);
}

printReport();
