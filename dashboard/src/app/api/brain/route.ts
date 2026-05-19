/**
 * /api/brain — Second Brain query and compile endpoints.
 *
 * GET  /api/brain?q=<query>   — Ping-style index lookup + file reads
 * POST /api/brain { action: "compile" } — trigger LLM micro-batch compile
 * GET  /api/brain/status      — index summary
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { runCompile } from '../../../lib/brain/BrainCompiler';
import { readIndex, lookupKeywords } from '../../../lib/brain/BrainIndex';

const BRAIN_ROOT = path.resolve(process.cwd(), '..', 'float-brain');

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (query) {
    // Ping-style lookup: search index then read matching files
    const paths = lookupKeywords(query);
    const results: Array<{ path: string; excerpt: string }> = [];

    for (const relPath of paths.slice(0, 5)) {
      const absPath = path.join(BRAIN_ROOT, relPath);
      try {
        const content = fs.readFileSync(absPath, 'utf8');
        // Return first 400 chars as excerpt
        results.push({ path: relPath, excerpt: content.slice(0, 400) });
      } catch {
        results.push({ path: relPath, excerpt: '[file not found]' });
      }
    }

    return NextResponse.json({
      query,
      results,
      lookupLatencyNote: 'Single index.json read + targeted file reads. No vector search.',
    });
  }

  // Status: return index summary
  const idx = readIndex();
  return NextResponse.json({
    updatedAt: idx.updatedAt,
    keywordCount: Object.keys(idx.keywords).length,
    agentCount: Object.keys(idx.agents).length,
    strategyVersions: idx.strategyVersions.length,
    agents: idx.agents,
    recentStrategyVersions: idx.strategyVersions.slice(0, 5),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  if (body.action === 'compile') {
    try {
      const result = await runCompile(true); // force=true bypasses hourly gate
      return NextResponse.json({ status: 'ok', ...result });
    } catch (err: any) {
      return NextResponse.json({ status: 'error', error: err.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Unknown action. Use: compile' }, { status: 400 });
}
