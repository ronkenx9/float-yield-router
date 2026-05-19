import { NextResponse } from 'next/server';
import { getOrCreateOrchestrator } from '../../../../lib/float/Orchestrator';
import { TradeSimulator } from '../../../../lib/float/TradeSimulator';

// Singleton for the trade simulator
const globalForSim = globalThis as unknown as { tradeSimulator: TradeSimulator | undefined };

export function getOrCreateSimulator(): TradeSimulator {
  if (globalForSim.tradeSimulator && typeof globalForSim.tradeSimulator.triggerRandomTrade === 'function') {
    return globalForSim.tradeSimulator;
  }
  const orchestrator = getOrCreateOrchestrator();
  const sim = new TradeSimulator(orchestrator);
  globalForSim.tradeSimulator = sim;
  if (orchestrator.isRunning()) {
    console.log('[API] Orchestrator is running. Auto-starting new TradeSimulator instance.');
    sim.start();
  }
  return sim;
}

// POST /api/agent/loop — start or stop the autonomous loop + trade simulator
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = body.action as string;
  const orchestrator = getOrCreateOrchestrator();
  const simulator = getOrCreateSimulator();

  if (action === 'start') {
    const interval = body.intervalMs || 60000;
    orchestrator.start(interval);
    simulator.start();
    return NextResponse.json({ status: 'started', intervalMs: interval, tradeSimulator: 'started' });
  }

  if (action === 'stop') {
    orchestrator.stop();
    simulator.stop();
    return NextResponse.json({ status: 'stopped' });
  }

  if (action === 'signal') {
    const { agentId, agentStatus } = body;
    if (agentId && agentStatus) {
      orchestrator.signal(agentId, agentStatus);
      return NextResponse.json({ status: 'signaled', agentId, agentStatus });
    }
    return NextResponse.json({ error: 'Missing agentId or agentStatus' }, { status: 400 });
  }

  return NextResponse.json({ error: 'Unknown action. Use: start, stop, signal' }, { status: 400 });
}

export async function GET() {
  const orchestrator = getOrCreateOrchestrator();
  const simulator = getOrCreateSimulator();
  return NextResponse.json({
    running: orchestrator.isRunning(),
    state: await orchestrator.getStateWithBalances(),
    tradeSimulator: simulator.getStats(),
  });
}
