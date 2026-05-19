/**
 * BrainCompiler — Micro-batch LLM synthesizer for the FLOAT Second Brain.
 *
 * Reads uncompiled raw events from float-brain/raw/, synthesizes them into
 * narrative ledger articles using Groq (Llama 3.3 70B), and commits the
 * result to git. Runs on every 20 raw events OR every 60 minutes.
 *
 * Output structure:
 *   ledger/system-status.md        — live metrics dashboard
 *   ledger/agent-histories/{id}.md — per-agent narrative
 *   ledger/audit-recommendations.md — critic suggestions with approval checkboxes
 *   index.json                     — keyword backlink map (atomic write)
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { generateText } from 'ai';
import { groq } from '@ai-sdk/groq';
import {
  listUncompiledEvents, markCompiled, sanitize, writeHeartbeat,
} from './BrainWriter';
import { readIndex, writeIndex, updateAgentEntry, recordStrategyVersion } from './BrainIndex';

const execAsync = promisify(exec);

const BRAIN_ROOT    = path.resolve(process.cwd(), '..', 'float-brain');
const LEDGER        = path.join(BRAIN_ROOT, 'ledger');
const AGENT_HIST    = path.join(LEDGER, 'agent-histories');
const STATUS_FILE   = path.join(LEDGER, 'system-status.md');
const AUDIT_FILE    = path.join(LEDGER, 'audit-recommendations.md');

let _lastCompileAt = 0;
const COMPILE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour max cadence

// ─── Compiler Entry Point ─────────────────────────────────────────
export async function runCompile(force = false): Promise<{ compiled: number; skipped: boolean }> {
  const now = Date.now();
  if (!force && now - _lastCompileAt < COMPILE_INTERVAL_MS) {
    return { compiled: 0, skipped: true };
  }

  const files = listUncompiledEvents();
  if (files.length === 0) {
    writeHeartbeat(0);
    return { compiled: 0, skipped: false };
  }

  console.log(`[BRAIN COMPILER] Compiling ${files.length} raw events...`);
  _lastCompileAt = now;

  // Read raw events
  const events: any[] = [];
  for (const file of files.slice(0, 50)) { // cap at 50 per batch
    try {
      events.push(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch { /* skip corrupt files */ }
  }

  // Group by agent
  const byAgent = new Map<string, any[]>();
  const criticEvents: any[] = [];
  const tradeEvents: any[] = [];

  for (const ev of events) {
    if (ev.type === 'critic_review') {
      criticEvents.push(ev);
    } else if (ev.type === 'trade_event') {
      tradeEvents.push(ev);
    } else if (ev.agentId) {
      if (!byAgent.has(ev.agentId)) byAgent.set(ev.agentId, []);
      byAgent.get(ev.agentId)!.push(ev);
    }
  }

  // Compile per-agent ledger entries
  for (const [agentId, agentEvents] of byAgent) {
    await compileAgentHistory(agentId, agentEvents);
  }

  // Compile system status
  await compileSystemStatus(events, tradeEvents);

  // Compile audit recommendations from critic events
  if (criticEvents.length > 0) {
    await compileAuditRecommendations(criticEvents);
  }

  // Mark all compiled
  markCompiled(files.slice(0, 50));

  // Git commit
  await gitCommit(files.length);

  console.log(`[BRAIN COMPILER] Done. ${files.length} events compiled.`);
  return { compiled: files.length, skipped: false };
}

// ─── Per-Agent History Compiler ───────────────────────────────────
async function compileAgentHistory(agentId: string, events: any[]): Promise<void> {
  fs.mkdirSync(AGENT_HIST, { recursive: true });
  const file = path.join(AGENT_HIST, `${agentId}.md`);

  // Read existing ledger (for context)
  let existing = '';
  try { existing = fs.readFileSync(file, 'utf8'); } catch { /* new agent */ }

  // Extract decision stats
  const decisions = events.filter(e => e.type === 'decision');
  const parks = decisions.filter(e => e.data?.action === 'PARK' && e.data?.txStatus === 'COMPLETE');
  const withdraws = decisions.filter(e => e.data?.action === 'WITHDRAW' && e.data?.txStatus === 'COMPLETE');
  const failures = decisions.filter(e => e.data?.txStatus === 'FAILED');

  const totalParked = parks.reduce((sum, e) => sum + (e.data?.amount ?? 0), 0);
  const totalWithdrawn = withdraws.reduce((sum, e) => sum + (e.data?.amount ?? 0), 0);

  // Update index
  updateAgentEntry(agentId, {
    lastEntry: new Date().toISOString(),
    totalDecisions: (events.length),
    totalParks: parks.length,
    totalWithdraws: withdraws.length,
    totalYield: parks.reduce((sum, e) => sum + (e.data?.yieldEarned ?? 0), 0),
  });

  if (events.length === 0) return;

  // LLM narrative synthesis
  const prompt = `You are the FLOAT Second Brain compiler. Write a concise narrative ledger entry for agent "${agentId}".

## Context (existing ledger, last 500 chars):
${existing.slice(-500)}

## New Events (${events.length} total, showing up to 10):
${JSON.stringify(events.slice(-10).map(e => ({
  type: e.type,
  action: e.data?.action,
  amount: e.data?.amount,
  txStatus: e.data?.txStatus,
  score: e.data?.score,
  reason: e.data?.reason?.slice(0, 80),
  timestamp: e.timestamp,
})), null, 2)}

## Stats for this batch:
- Parks: ${parks.length} (total $${totalParked.toFixed(2)} USDC)
- Withdraws: ${withdraws.length} (total $${totalWithdrawn.toFixed(2)} USDC)
- Failures: ${failures.length}

Write a 2-4 sentence chronological update for the agent history ledger. Be specific with numbers.
Include: what actions were taken, why (from the reason field), and any notable outcomes.
Format as markdown. Start with "## ${new Date().toISOString().slice(0, 10)} Update".`;

  try {
    const { text } = await generateText({
      model: groq('llama-3.3-70b-versatile'),
      prompt,
      maxOutputTokens: 300,
    });

    const newEntry = `\n${sanitize(text.trim())}\n`;
    const header = existing
      ? existing
      : `# ${agentId} — Agent History Ledger\n\n> Auto-compiled by FLOAT Second Brain. Human-readable narrative of all agent decisions.\n`;

    fs.writeFileSync(file, header + newEntry, 'utf8');
  } catch (err: any) {
    // Fallback: write raw stats without LLM
    const fallback = `\n## ${new Date().toISOString().slice(0, 10)} Update\n` +
      `Parks: ${parks.length} ($${totalParked.toFixed(2)}), ` +
      `Withdraws: ${withdraws.length} ($${totalWithdrawn.toFixed(2)}), ` +
      `Failures: ${failures.length}.\n`;
    fs.writeFileSync(file, (existing || `# ${agentId} — Agent History\n`) + fallback, 'utf8');
    console.warn(`[BRAIN COMPILER] LLM unavailable for ${agentId}, wrote stats fallback: ${err.message}`);
  }
}

// ─── System Status Compiler ───────────────────────────────────────
async function compileSystemStatus(allEvents: any[], tradeEvents: any[]): Promise<void> {
  fs.mkdirSync(LEDGER, { recursive: true });

  const decisions = allEvents.filter(e => e.type === 'decision');
  const totalParked = decisions
    .filter(e => e.data?.action === 'PARK' && e.data?.txStatus === 'COMPLETE')
    .reduce((sum, e) => sum + (e.data?.amount ?? 0), 0);
  const failures = decisions.filter(e => e.data?.txStatus === 'FAILED').length;
  const trades = tradeEvents.length;
  const missedTrades = tradeEvents.filter(e => e.data?.missed).length;

  const status = `# FLOAT System Status

> Last compiled: ${new Date().toISOString()}

## This Batch Summary
| Metric | Value |
|--------|-------|
| Total decisions | ${decisions.length} |
| Successful parks | ${decisions.filter(e => e.data?.action === 'PARK' && e.data?.txStatus === 'COMPLETE').length} |
| Successful withdraws | ${decisions.filter(e => e.data?.action === 'WITHDRAW' && e.data?.txStatus === 'COMPLETE').length} |
| Total parked (USDC) | $${totalParked.toFixed(2)} |
| Failed txs | ${failures} |
| Trade events | ${trades} |
| Missed trades | ${missedTrades} |
| Trade success rate | ${trades > 0 ? (((trades - missedTrades) / trades) * 100).toFixed(1) + '%' : 'N/A'} |

## Index
- [[agent-histories/trader-a]] — Trader A (Aggressive)
- [[agent-histories/trader-b]] — Trader B (Balanced)
- [[agent-histories/trader-c]] — Trader C (Conservative)
- [[audit-recommendations]] — Pending Critic suggestions
`;

  fs.writeFileSync(STATUS_FILE, status, 'utf8');
}

// ─── Audit Recommendations Compiler ──────────────────────────────
async function compileAuditRecommendations(criticEvents: any[]): Promise<void> {
  fs.mkdirSync(LEDGER, { recursive: true });

  // Read existing file to preserve human-approved checkboxes
  let existing = '';
  try { existing = fs.readFileSync(AUDIT_FILE, 'utf8'); } catch { /* new */ }

  const header = `# Audit Recommendations

> **Human-owned section.** Change \`- [ ]\` to \`- [x] Approved\` to apply a suggestion.
> The file-watcher will detect the change and update the live strategy within 2 seconds.

`;

  // Build new recommendations section from critic events
  const newRecs = criticEvents.map(ev => {
    const { agentId, timestamp, data } = ev;
    const { finding, suggestedChanges, confidence, reasoning, version } = data ?? {};
    const changesStr = JSON.stringify(suggestedChanges ?? {});

    return `## v${version ?? '?'} — ${agentId} (${new Date(timestamp).toISOString().slice(0, 16)})

**Finding**: ${finding ?? 'N/A'}
**Confidence**: ${confidence ?? 'unknown'}
**Reasoning**: ${reasoning ?? 'N/A'}
**Suggested Changes**: \`${changesStr}\`

- [ ] **Approve** → applies \`${changesStr}\` to ${agentId}
- [ ] **Reject** → marks as declined

`;
  }).join('');

  // Preserve resolved blocks (approved or rejected) in the Historical section.
  // Extract blocks from the active section of the existing file that have been resolved.
  const activeSection = existing.includes('## Historical Recommendations')
    ? existing.split('## Historical Recommendations')[0]
    : existing;

  const resolvedBlocks: string[] = [];
  const blockRe = /##\s+v\d+\s+—\s+[\w-]+[^\n]*\n[\s\S]*?(?=\n##\s+v|\n---|\n# |\s*$)/g;
  let bm: RegExpExecArray | null;
  while ((bm = blockRe.exec(activeSection)) !== null) {
    const blk = bm[0].trim();
    const isResolved = blk.includes('- [x] Approved') || blk.includes('- [x] approved') ||
                       blk.includes('[x] **Reject') || blk.includes('[x] Reject');
    if (isResolved && blk.length > 20) resolvedBlocks.push(blk);
  }

  // Existing Historical section content (below the separator)
  const existingHistorical = existing.includes('## Historical Recommendations')
    ? existing.split('## Historical Recommendations')[1].trim()
    : '';

  const separator = '\n---\n\n## Historical Recommendations\n\n';
  const historicalParts = [...resolvedBlocks, existingHistorical].filter(s => s && s.trim().length > 10);
  const content = header + newRecs + separator + historicalParts.join('\n\n');

  fs.writeFileSync(AUDIT_FILE, sanitize(content), 'utf8');
}

// ─── Git Commit ────────────────────────────────────────────────────
async function gitCommit(eventCount: number): Promise<void> {
  const repoRoot = path.resolve(process.cwd(), '..');
  try {
    await execAsync(`cd "${repoRoot}" && git add float-brain/ && git diff --cached --quiet || git commit -m "chore(brain): compile checkpoint — ${eventCount} events"`, { timeout: 15_000 });
    console.log('[BRAIN COMPILER] Git commit done.');
  } catch (err: any) {
    // Non-fatal — git may not be configured on all environments
    console.warn('[BRAIN COMPILER] Git commit skipped:', err.message?.slice(0, 80));
  }
}

// ─── Read ledger for Critic context ──────────────────────────────
export function readAgentLedger(agentId: string): string {
  try {
    const file = path.join(AGENT_HIST, `${agentId}.md`);
    const content = fs.readFileSync(file, 'utf8');
    // Return last 1500 chars — enough context without blowing LLM budget
    return content.slice(-1500);
  } catch {
    return '';
  }
}

export function readStrategyVersionHistory(): string {
  const idx = readIndex();
  if (idx.strategyVersions.length === 0) return 'No strategy version history yet.';
  return idx.strategyVersions
    .slice(0, 10)
    .map(v => `v${v.version} [${v.agentId}] ${v.timestamp.slice(0, 10)}: ${v.finding} → ${JSON.stringify(v.changes)}${v.appliedAt ? ' ✅ applied' : ''}`)
    .join('\n');
}
