/**
 * BrainWriter — Raw event ingestion for the FLOAT Second Brain.
 *
 * Writes sanitized events to float-brain/raw/ on every orchestrator tick,
 * transaction receipt, or Critic review. The LLM Compiler later synthesizes
 * these raw events into human-readable ledger articles.
 *
 * Ownership: LLM-owned (humans read only).
 */

import fs from 'fs';
import path from 'path';

// ─── PII Sanitization ────────────────────────────────────────────
const PII_PATTERNS: Array<[RegExp, string]> = [
  // API keys (Circle format: TEST_API_KEY:hex:hex)
  [/TEST_API_KEY:[a-zA-Z0-9:_-]{20,}/g, '[REDACTED_API_KEY]'],
  // Entity secrets (64-char hex)
  [/\b[a-fA-F0-9]{64}\b/g, '[REDACTED_SECRET]'],
  // Private keys (0x + 64 hex)
  [/0x[a-fA-F0-9]{64}\b/g, '[REDACTED_PRIVKEY]'],
  // Email addresses
  [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]'],
  // OTP codes (4-8 digit standalone numbers, common OTP range)
  [/\bOTP[:\s]+\d{4,8}\b/gi, '[REDACTED_OTP]'],
  // Bearer tokens
  [/Bearer\s+[a-zA-Z0-9._-]{20,}/g, 'Bearer [REDACTED]'],
];

export function sanitize(raw: string): string {
  let out = raw;
  for (const [pattern, replacement] of PII_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

// ─── Brain directory (project root / float-brain) ────────────────
const BRAIN_ROOT = path.resolve(process.cwd(), '..', 'float-brain');
const RAW_LOGS   = path.join(BRAIN_ROOT, 'raw', 'system-logs');
const RAW_TXS    = path.join(BRAIN_ROOT, 'raw', 'transactions');

// Track event count for compiler trigger threshold
let _pendingEventCount = 0;
const COMPILE_THRESHOLD = 20;

// ─── Event Types ─────────────────────────────────────────────────
export type RawEventType = 'decision' | 'transaction' | 'critic_review' | 'trade_event' | 'heartbeat';

export interface RawEvent {
  type: RawEventType;
  agentId?: string;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Write a raw event to disk, sanitized of PII.
 * Returns true if the compiler threshold is reached (20 new events).
 */
export function writeRawEvent(event: RawEvent): boolean {
  try {
    const dir = event.type === 'transaction' ? RAW_TXS : RAW_LOGS;
    fs.mkdirSync(dir, { recursive: true });

    const ts = new Date(event.timestamp).getTime();
    const slug = `${ts}-${event.type}${event.agentId ? '-' + event.agentId : ''}`;
    const file = path.join(dir, `${slug}.json`);

    const sanitized = sanitize(JSON.stringify({ ...event, _compiled: false }, null, 2));
    fs.writeFileSync(file, sanitized, 'utf8');

    _pendingEventCount++;
    if (_pendingEventCount >= COMPILE_THRESHOLD) {
      _pendingEventCount = 0;
      return true; // signal: time to compile
    }
    return false;
  } catch (err: any) {
    // BrainWriter is fire-and-forget — never crash the main loop
    console.warn('[BRAIN] writeRawEvent failed (non-fatal):', err.message);
    return false;
  }
}

/**
 * Write a no-op heartbeat. Multiple identical ticks are collapsed:
 * if the last log file is a heartbeat from the same hour, skip writing.
 */
export function writeHeartbeat(loopCount: number): void {
  try {
    fs.mkdirSync(RAW_LOGS, { recursive: true });
    const hourKey = new Date().toISOString().slice(0, 13); // e.g. "2026-05-19T14"
    const file = path.join(RAW_LOGS, `heartbeat-${hourKey}.json`);
    // Overwrite (upsert) — one file per hour, not one per tick
    fs.writeFileSync(file, sanitize(JSON.stringify({
      type: 'heartbeat',
      hour: hourKey,
      lastLoopCount: loopCount,
      updatedAt: new Date().toISOString(),
    }, null, 2)), 'utf8');
  } catch {
    // non-fatal
  }
}

/**
 * List all uncompiled raw event files (excluding heartbeats and already-compiled).
 */
export function listUncompiledEvents(): string[] {
  const files: string[] = [];
  for (const dir of [RAW_LOGS, RAW_TXS]) {
    try {
      const entries = fs.readdirSync(dir)
        .filter(f => f.endsWith('.json') && !f.startsWith('heartbeat-'))
        .map(f => path.join(dir, f));
      for (const file of entries) {
        try {
          const content = JSON.parse(fs.readFileSync(file, 'utf8'));
          if (!content._compiled) files.push(file);
        } catch {
          files.push(file); // include on parse error, compiler will handle
        }
      }
    } catch {
      // dir may not exist yet
    }
  }
  return files.sort();
}

/**
 * Mark a list of event files as compiled.
 */
export function markCompiled(filePaths: string[]): void {
  for (const file of filePaths) {
    try {
      const content = JSON.parse(fs.readFileSync(file, 'utf8'));
      content._compiled = true;
      fs.writeFileSync(file, JSON.stringify(content, null, 2), 'utf8');
    } catch {
      // best-effort
    }
  }
}
