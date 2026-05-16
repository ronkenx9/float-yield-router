import { NextResponse } from 'next/server';
import { floatAgent } from '@/lib/agent/Agent';

export async function GET() {
  const state = floatAgent.getState();
  return NextResponse.json(state);
}
