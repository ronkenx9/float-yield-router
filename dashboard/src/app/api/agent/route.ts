import { NextResponse } from 'next/server';
import { getOrCreateOrchestrator } from '../../../lib/float/Orchestrator';

export async function fetchAgentStatePayload() {
  const orchestrator = getOrCreateOrchestrator();
  const state = await orchestrator.getStateWithBalances();
  
  // Calculate aggregate metrics
  let idleManaged = 0;
  let yieldCaptured = 0;
  let isParked = false;
  
  const allDecisions: any[] = [];
  
  if (state && state.agents) {
    for (const agent of state.agents) {
      idleManaged += agent.parkedBalance || 0;
      yieldCaptured += agent.totalYieldCaptured || 0;
      if (agent.parkedBalance > 0) {
        isParked = true;
      }
      
      // Collect decisions
      if (agent.recentDecisions) {
        for (const decision of agent.recentDecisions) {
          const type = decision.action === 'PARK' ? 'route' 
                     : decision.action === 'WITHDRAW' ? 'recall' 
                     : 'detect';
                     
          const actionText = decision.action === 'PARK' ? 'Parking Idle Capital'
                           : decision.action === 'WITHDRAW' ? 'Recalling Capital'
                           : 'Evaluating State';

          const statusText = decision.txStatus === 'COMPLETE' ? 'completed'
                           : decision.txStatus === 'FAILED' ? 'failed'
                           : decision.txStatus === 'PENDING' ? 'pending'
                           : 'completed'; // For HOLDs, we count as completed immediately
                           
          allDecisions.push({
            id: decision.id,
            type,
            action: `${agent.label}: ${actionText}`,
            desc: decision.reason,
            amount: decision.amount > 0 ? `$${decision.amount.toFixed(2)}` : '---',
            time: new Date(decision.timestamp).toLocaleTimeString(),
            status: statusText,
            txHash: decision.txHash,
            timestamp: new Date(decision.timestamp).getTime()
          });
        }
      }
    }
  }
  
  // Sort activities by timestamp descending
  allDecisions.sort((a, b) => b.timestamp - a.timestamp);
  
  return {
    ...state,
    idleManaged,
    yieldCaptured,
    isParked,
    activities: allDecisions.slice(0, 15) // Top 15 recent events
  };
}

export async function GET() {
  const payload = await fetchAgentStatePayload();
  return NextResponse.json(payload);
}
