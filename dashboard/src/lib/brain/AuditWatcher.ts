/**
 * AuditWatcher — Watches ledger/audit-recommendations.md for human approvals.
 *
 * When a developer or Ping changes `- [ ]` to `- [x] Approved`, the watcher
 * parses the change, extracts the JSON parameter delta, and calls the provided
 * callback so the Orchestrator can apply it to the live strategy immediately.
 *
 * Also provides `hydrateFromAuditFile()` for startup restoration of previously
 * approved parameters.
 */

import fs from 'fs';
import path from 'path';
import { sanitize } from './BrainWriter';

const BRAIN_ROOT = path.resolve(process.cwd(), '..', 'float-brain');
const AUDIT_FILE = path.join(BRAIN_ROOT, 'ledger', 'audit-recommendations.md');

export interface ApprovedChange {
  agentId: string;
  strategyVersion: number;
  changes: Record<string, unknown>;
  approvedAt: string;
}

export type ApprovalCallback = (change: ApprovedChange) => void;

let _watcher: fs.FSWatcher | null = null;
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Parse audit-recommendations.md for approved checkboxes.
 * Returns all entries where `- [x] Approved` is present.
 */
export function parseApprovedChanges(): ApprovedChange[] {
  try {
    if (!fs.existsSync(AUDIT_FILE)) return [];
    const content = fs.readFileSync(AUDIT_FILE, 'utf8');
    const approved: ApprovedChange[] = [];

    // Match blocks like:
    // ## v5 — trader-a (2026-05-19T14:23)
    // ...
    // **Suggested Changes**: `{"maxActionsPerHour":8}`
    // - [x] Approved
    // Note: previously used `\z` (Perl/Ruby) which JS treats as literal `z` —
    // that caused the LAST block in the file to be silently skipped because
    // the lookahead could never match end-of-input. `$` in default mode
    // matches end-of-string, which is what we actually want.
    const blockRegex = /##\s+v(\d+)\s+—\s+([\w-]+)\s+\(([^)]+)\)([\s\S]*?)(?=\n## |\n---|$)/g;
    let match: RegExpExecArray | null;

    while ((match = blockRegex.exec(content)) !== null) {
      const [, versionStr, agentId, timestamp, body] = match;

      // Only process if approved checkbox is checked
      if (!body.includes('- [x] Approved') && !body.includes('- [x] approved')) continue;

      // Extract suggested changes JSON
      const changesMatch = body.match(/\*\*Suggested Changes\*\*:\s*`([^`]+)`/);
      if (!changesMatch) continue;

      try {
        const changes = JSON.parse(changesMatch[1]);
        approved.push({
          agentId,
          strategyVersion: parseInt(versionStr),
          changes,
          approvedAt: timestamp,
        });
      } catch {
        // malformed JSON in suggestion — skip
      }
    }

    return approved;
  } catch {
    return [];
  }
}

/**
 * Hydrate approved parameters from the audit file on startup.
 * Call this in getOrCreateOrchestrator() before starting the loop.
 */
export function hydrateFromAuditFile(): ApprovedChange[] {
  const changes = parseApprovedChanges();
  if (changes.length > 0) {
    console.log(`[AUDIT WATCHER] Hydrating ${changes.length} approved strategy changes from audit file.`);
  }
  return changes;
}

/**
 * Start watching audit-recommendations.md for changes.
 * Debounces 500ms to handle editor save events (multiple rapid writes).
 * Calls onApproval for each newly-checked approval.
 */
export function startWatching(onApproval: ApprovalCallback): void {
  if (_watcher) return; // already watching

  // Ensure file exists
  fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
  if (!fs.existsSync(AUDIT_FILE)) {
    fs.writeFileSync(AUDIT_FILE,
      '# Audit Recommendations\n\n> No recommendations yet. Run the orchestrator loop to generate Critic reviews.\n',
      'utf8'
    );
  }

  let lastKnownApproved = new Set<string>(
    parseApprovedChanges().map(c => `${c.agentId}-v${c.strategyVersion}`)
  );

  _watcher = fs.watch(AUDIT_FILE, () => {
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
      const current = parseApprovedChanges();
      for (const change of current) {
        const key = `${change.agentId}-v${change.strategyVersion}`;
        if (!lastKnownApproved.has(key)) {
          lastKnownApproved.add(key);
          console.log(`[AUDIT WATCHER] ✅ New approval detected: ${change.agentId} v${change.strategyVersion} → ${JSON.stringify(change.changes)}`);
          onApproval(change);
        }
      }
    }, 500);
  });

  console.log(`[AUDIT WATCHER] Watching ${AUDIT_FILE}`);
}

export function stopWatching(): void {
  if (_watcher) {
    _watcher.close();
    _watcher = null;
  }
  if (_debounceTimer) {
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
  }
}

/**
 * Mark a recommendation as applied in the audit file.
 * Appends `appliedAt: <timestamp>` line after the Approved checkbox.
 */
export function markApplied(agentId: string, version: number): void {
  try {
    if (!fs.existsSync(AUDIT_FILE)) return;
    let content = fs.readFileSync(AUDIT_FILE, 'utf8');

    // Find the block and append appliedAt marker
    const blockHeader = `## v${version} — ${agentId}`;
    const idx = content.indexOf(blockHeader);
    if (idx === -1) return;

    const appliedMarker = `\n> ✅ **Applied at**: ${new Date().toISOString()}\n`;
    // Insert after the first "- [x] Approved" line in this block
    const blockStart = idx;
    const blockEnd = content.indexOf('\n## ', idx + 1);
    const block = blockEnd > -1 ? content.slice(blockStart, blockEnd) : content.slice(blockStart);

    if (block.includes('Applied at') || block.includes('appliedAt')) return; // already marked

    const approvedIdx = content.indexOf('- [x] Approved', blockStart);
    if (approvedIdx > -1 && (blockEnd === -1 || approvedIdx < blockEnd)) {
      const lineEnd = content.indexOf('\n', approvedIdx);
      content = content.slice(0, lineEnd + 1) + appliedMarker + content.slice(lineEnd + 1);
      fs.writeFileSync(AUDIT_FILE, sanitize(content), 'utf8');
    }
  } catch (err: any) {
    console.warn('[AUDIT WATCHER] markApplied failed (non-fatal):', err.message);
  }
}
