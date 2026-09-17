/**
 * Chat-shell core types.
 *
 * Transport-agnostic: Photon Spectrum (iMessage) is the first transport, but
 * the shell only speaks InboundMessage / OutboundReply. Money is decimal
 * strings here (display layer); atomic bigint math lives in the services.
 */

export interface InboundMessage {
  /** Dedupe key: webhookId + platform message id (at-least-once delivery). */
  dedupeKey: string;
  spaceId: string;
  platform: string;
  senderId: string;
  text: string;
  timestampSeconds: number;
}

export interface OutboundReply {
  spaceId: string;
  /** Chunked by the sender to fit platform limits (iMessage ~1500 chars). */
  chunks: string[];
}

export interface SkillContext {
  spaceId: string;
  platform: string;
  senderId: string;
  text: string;
  history: Array<{ role: 'user' | 'assistant'; text: string }>;
}

export interface SkillResult {
  /** Reply text for the user (already risk-labeled by the skill). */
  reply: string;
  /** A proposal awaiting explicit APPROVE <id>, if the skill raised one. */
  pendingApproval?: PendingApproval;
}

export interface PendingApproval {
  id: string;
  skill: string;
  /** Human-readable summary shown in chat (amounts, pool, costs, expiry). */
  summary: string;
  createdAtSeconds: number;
}

export interface Skill {
  readonly name: string;
  readonly description: string;
  /** Pure match: does this skill own the inbound text? */
  matches(text: string): boolean;
  handle(ctx: SkillContext): Promise<SkillResult> | SkillResult;
}

export interface BrainAction {
  skill: string;
  args: string;
}

export interface BrainResult {
  text: string;
  action: BrainAction | null;
}

/** The LLM brain: drafts replies, never executes. Actions are validated. */
export interface Brain {
  draftReply(ctx: SkillContext, skills: Skill[]): Promise<BrainResult>;
}

/** Outbound transport: deliver chunks into a space. */
export interface Transport {
  send(spaceId: string, chunks: string[]): Promise<void>;
}

export interface ShellConfig {
  /** Sender IDs allowed financial actions/data. Unknown senders are refused. */
  ownerIds: string[];
  /** Max stored history turns per space (bounded memory). */
  maxHistoryTurns: number;
  /** Max dedupe keys remembered (bounded memory). */
  maxDedupeKeys: number;
  now: () => number;
}

/** Split long replies for platform limits without breaking words. */
export function chunkText(text: string, limit = 1500): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  const words = text.split(' ');
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > limit && cur.length > 0) {
      chunks.push(cur);
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur.length > 0) chunks.push(cur);
  if (chunks.length === 0) chunks.push(text.slice(0, limit));
  return chunks;
}
