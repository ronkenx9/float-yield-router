/**
 * BrainIndex — Atomic flat-file search index for the FLOAT Second Brain.
 *
 * Writes index.json atomically (temp-file → rename) to prevent concurrent
 * readers (Ping) from loading half-written JSON.
 *
 * Schema:
 * {
 *   "updatedAt": "ISO string",
 *   "keywords": { "term": ["path/to/file.md", ...] },
 *   "agents": { "trader-a": { lastEntry: "ISO", totalDecisions: N, ... } },
 *   "strategyVersions": [{ version: N, timestamp: "ISO", changes: {}, finding: "" }]
 * }
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const BRAIN_ROOT = path.resolve(process.cwd(), '..', 'float-brain');
const INDEX_FILE = path.join(BRAIN_ROOT, 'index.json');

export interface BrainIndexData {
  updatedAt: string;
  keywords: Record<string, string[]>;
  agents: Record<string, {
    lastEntry: string;
    totalDecisions: number;
    totalParks: number;
    totalWithdraws: number;
    totalYield: number;
    lastStrategy: string;
  }>;
  strategyVersions: Array<{
    version: number;
    timestamp: string;
    agentId: string;
    finding: string;
    changes: Record<string, unknown>;
    appliedAt?: string;
  }>;
}

const DEFAULT_INDEX: BrainIndexData = {
  updatedAt: new Date().toISOString(),
  keywords: {
    'reserve': ['concepts/reserve-strategies.md'],
    'mpc': ['concepts/mpc-security.md'],
    'rate-limit': ['concepts/failure-modes/rate-limits.md'],
    'estimation-error': ['concepts/failure-modes/estimation-error.md'],
    'park': ['concepts/reserve-strategies.md'],
    'withdraw': ['concepts/failure-modes/estimation-error.md'],
    'critic': ['ledger/audit-recommendations.md'],
  },
  agents: {},
  strategyVersions: [],
};

export function readIndex(): BrainIndexData {
  try {
    fs.mkdirSync(BRAIN_ROOT, { recursive: true });
    if (!fs.existsSync(INDEX_FILE)) return { ...DEFAULT_INDEX };
    return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  } catch {
    return { ...DEFAULT_INDEX };
  }
}

/**
 * Atomically write index.json: write to a temp file, then rename.
 * On POSIX this is guaranteed atomic. On Windows it's best-effort.
 */
export function writeIndex(data: BrainIndexData): void {
  try {
    fs.mkdirSync(BRAIN_ROOT, { recursive: true });
    const tmp = path.join(os.tmpdir(), `float-brain-index-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
    fs.renameSync(tmp, INDEX_FILE);
  } catch (err: any) {
    console.warn('[BRAIN INDEX] Write failed (non-fatal):', err.message);
  }
}

export function addKeyword(term: string, filePath: string): void {
  const idx = readIndex();
  if (!idx.keywords[term]) idx.keywords[term] = [];
  if (!idx.keywords[term].includes(filePath)) {
    idx.keywords[term].push(filePath);
    writeIndex(idx);
  }
}

export function updateAgentEntry(
  agentId: string,
  stats: Partial<BrainIndexData['agents'][string]>,
): void {
  const idx = readIndex();
  idx.agents[agentId] = { ...idx.agents[agentId], ...stats };
  writeIndex(idx);
}

export function recordStrategyVersion(entry: BrainIndexData['strategyVersions'][number]): void {
  const idx = readIndex();
  // deduplicate by version + agentId
  const exists = idx.strategyVersions.some(v => v.version === entry.version && v.agentId === entry.agentId);
  if (!exists) {
    idx.strategyVersions = [entry, ...idx.strategyVersions].slice(0, 50);
    writeIndex(idx);
  }
}

/**
 * Ping-style lookup: given a query string, return the top matching file paths.
 */
export function lookupKeywords(query: string): string[] {
  const idx = readIndex();
  const terms = query.toLowerCase().split(/\s+/);
  const hits = new Map<string, number>();

  for (const term of terms) {
    for (const [keyword, paths] of Object.entries(idx.keywords)) {
      if (keyword.includes(term) || term.includes(keyword)) {
        for (const p of paths) {
          hits.set(p, (hits.get(p) ?? 0) + 1);
        }
      }
    }
  }

  return [...hits.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p);
}
