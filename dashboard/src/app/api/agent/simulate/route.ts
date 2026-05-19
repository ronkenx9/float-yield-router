import { NextResponse } from 'next/server';
import { getOrCreateSimulator } from '../loop/route';
import { fetchAgentStatePayload } from '../route';

export async function POST() {
  try {
    const simulator = getOrCreateSimulator();
    if (!simulator.isRunning()) {
      console.log('[API /simulate] Simulator not running. Auto-starting it now.');
      simulator.start();
    }
    simulator.triggerRandomTrade();
    
    // Fetch and return the updated state payload
    const state = await fetchAgentStatePayload();
    return NextResponse.json(state);
  } catch (error: any) {
    console.error('[API /simulate] Unhandled error:', error?.message || error);
    // Fallback to fetch current state
    const state = await fetchAgentStatePayload();
    return NextResponse.json(
      { ...state, error: error?.message || 'Transaction failed' },
      { status: 200 }
    );
  }
}
