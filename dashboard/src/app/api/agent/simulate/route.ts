import { NextResponse } from 'next/server';
import { floatAgent } from '@/lib/agent/Agent';

export async function POST() {
  await floatAgent.runSimulationEvent();
  const state = floatAgent.getState();
  return NextResponse.json(state);
}
