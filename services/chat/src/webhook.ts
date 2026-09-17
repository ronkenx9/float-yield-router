/**
 * Photon Spectrum webhook verifier + delivery parser.
 *
 * Wire format (docs: photon.codes/docs/webhooks):
 *   POST <webhook-url>
 *   X-Spectrum-Event: messages
 *   X-Spectrum-Signature: v0=<hmac-sha256-hex-of-raw-body>
 *   X-Spectrum-Timestamp: <unix seconds>
 *   X-Spectrum-Webhook-Id: <id>
 *   {"event":"messages","space":{...},"message":{...}}
 *
 * Rules enforced here: signature must verify (fail closed), timestamp within
 * skew, event must be "messages" with text content. At-least-once delivery
 * means callers dedupe on webhookId + message.id.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { InboundMessage } from './types.ts';

export interface WebhookHeaders {
  event: string | null;
  signature: string | null;
  timestamp: string | null;
  webhookId: string | null;
}

export interface VerifyResult {
  ok: boolean;
  reason: string | null;
}

/** Max delivery age in seconds (replay protection). */
export const MAX_DELIVERY_SKEW_SECONDS = 300;

/**
 * Verify `v0=<hex>` HMAC-SHA256 over the RAW body with the per-webhook
 * signing secret. The secret is passed in (env/secret manager), never stored.
 */
export function verifySignature(rawBody: string, signature: string | null, secret: string): VerifyResult {
  if (!signature || !signature.startsWith('v0=')) {
    return { ok: false, reason: 'missing or malformed signature' };
  }
  if (!secret) return { ok: false, reason: 'no signing secret configured' };
  const expected = 'v0=' + createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'signature mismatch' };
  }
  return { ok: true, reason: null };
}

export function checkTimestamp(ts: string | null, nowSeconds: number): VerifyResult {
  if (!ts) return { ok: false, reason: 'missing timestamp' };
  const t = Number(ts);
  if (!Number.isInteger(t)) return { ok: false, reason: 'bad timestamp' };
  if (Math.abs(nowSeconds - t) > MAX_DELIVERY_SKEW_SECONDS) {
    return { ok: false, reason: 'delivery outside skew window (replay?)' };
  }
  return { ok: true, reason: null };
}

interface SpectrumDelivery {
  event?: unknown;
  space?: { id?: unknown };
  message?: {
    id?: unknown;
    platform?: unknown;
    sender?: { id?: unknown };
    timestamp?: unknown;
    content?: { type?: unknown; text?: unknown };
  };
}

/**
 * Parse a verified delivery into an InboundMessage. Returns null with a
 * reason for anything the shell cannot act on (non-text, unknown shape) —
 * callers acknowledge (2xx) but send no reply, so Photon stops retrying.
 */
export function parseDelivery(
  body: unknown,
  headers: WebhookHeaders,
  nowSeconds: number,
): { message: InboundMessage | null; skipReason: string | null } {
  if (headers.event !== 'messages') {
    return { message: null, skipReason: `ignoring event ${headers.event ?? 'none'}` };
  }
  const d = body as SpectrumDelivery;
  const spaceId = typeof d?.space?.id === 'string' ? d.space.id : null;
  const msgId = typeof d?.message?.id === 'string' ? d.message.id : null;
  const platform = typeof d?.message?.platform === 'string' ? d.message.platform : 'unknown';
  const senderId = typeof d?.message?.sender?.id === 'string' ? d.message.sender.id : null;
  const ctype = d?.message?.content?.type;
  const text = d?.message?.content?.text;
  if (!spaceId || !msgId || !senderId) {
    return { message: null, skipReason: 'delivery missing space/message/sender id' };
  }
  if (ctype !== 'text' || typeof text !== 'string' || text.trim().length === 0) {
    return { message: null, skipReason: `non-text content (${String(ctype)}) — no reply` };
  }
  const tsRaw = d?.message?.timestamp;
  const timestampSeconds =
    typeof tsRaw === 'number' && Number.isInteger(tsRaw) && tsRaw > 0 ? tsRaw : nowSeconds;
  return {
    message: {
      dedupeKey: `${headers.webhookId ?? 'noid'}:${msgId}`,
      spaceId,
      platform,
      senderId,
      text: text.trim().slice(0, 4000),
      timestampSeconds,
    },
    skipReason: null,
  };
}
