import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  ChatShell,
  FakeBrain,
  approvalSkill,
  checkTimestamp,
  chunkText,
  extractAction,
  fallbackReply,
  helpSkill,
  parseDelivery,
  pauseSkill,
  statusSkill,
  verifySignature,
} from '../src/index.ts';
import type { Brain, InboundMessage, Transport } from '../src/index.ts';

const SECRET = 'test-webhook-secret-64-chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const OWNER = 'owner-sender-id';
const NOW = 1_700_000_000;

function sig(body: string): string {
  return 'v0=' + createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');
}

function inbound(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    dedupeKey: `wh:msg-${Math.random().toString(36).slice(2)}`,
    spaceId: 'space-1',
    platform: 'imessage',
    senderId: OWNER,
    text: 'help',
    timestampSeconds: NOW,
    ...overrides,
  };
}

function shellWith(transport: Transport, brain: Brain = new FakeBrain()) {
  return new ChatShell(
    { ownerIds: [OWNER], maxHistoryTurns: 10, maxDedupeKeys: 100, now: () => NOW },
    transport,
    brain,
    [
      helpSkill(),
      statusSkill({ statusText: () => 'Net +$7.30 after costs (ledger, block 9999).' }),
      pauseSkill({ pause: () => 'Paused. No new proposals; positions unchanged.' }),
    ],
    null,
  );
}

function collector(): Transport & { sent: string[][] } {
  const t = {
    sent: [] as string[][],
    async send(_space: string, chunks: string[]) {
      t.sent.push(chunks);
    },
  };
  return t;
}

// ---- webhook verifier ----

test('valid signature verifies; tampered body fails closed', () => {
  const body = '{"event":"messages"}';
  assert.ok(verifySignature(body, sig(body), SECRET).ok);
  assert.ok(!verifySignature(body + 'x', sig(body), SECRET).ok);
  assert.ok(!verifySignature(body, null, SECRET).ok);
  assert.ok(!verifySignature(body, sig(body), '').ok);
});

test('timestamp skew rejects replays', () => {
  assert.ok(checkTimestamp(String(NOW), NOW).ok);
  assert.ok(!checkTimestamp(String(NOW - 99999), NOW).ok);
  assert.ok(!checkTimestamp('nope', NOW).ok);
});

test('delivery parser maps text, skips non-text and unknown events', () => {
  const headers = { event: 'messages', signature: 'x', timestamp: 'y', webhookId: 'wh' };
  const good = parseDelivery(
    { space: { id: 's1' }, message: { id: 'm1', platform: 'imessage', sender: { id: 'u1' }, content: { type: 'text', text: 'hi' } } },
    headers,
    NOW,
  );
  assert.ok(good.message && good.message.text === 'hi' && good.message.dedupeKey === 'wh:m1');
  const pic = parseDelivery(
    { space: { id: 's1' }, message: { id: 'm2', platform: 'imessage', sender: { id: 'u1' }, content: { type: 'image', text: '' } } },
    headers,
    NOW,
  );
  assert.equal(pic.message, null);
  const other = parseDelivery({ event: 'x' }, { ...headers, event: 'typing' }, NOW);
  assert.equal(other.message, null);
});

// ---- shell ----

test('unknown senders refused with zero data', async () => {
  const t = collector();
  const sh = shellWith(t);
  const r = await sh.handleInbound(inbound({ senderId: 'stranger', text: 'status' }));
  assert.ok(r.chunks.join(' ').includes('private'));
  assert.ok(!r.chunks.join(' ').includes('+'));
});

test('duplicate deliveries ack silently (at-least-once)', async () => {
  const t = collector();
  const sh = shellWith(t);
  const m = inbound({ dedupeKey: 'wh:dup1', text: 'help' });
  const first = await sh.handleInbound(m);
  assert.ok(first.chunks.length > 0);
  const second = await sh.handleInbound(m);
  assert.equal(second.chunks.length, 0);
});

test('help, status, pause skills answer deterministically', async () => {
  const t = collector();
  const sh = shellWith(t);
  assert.ok((await sh.handleInbound(inbound({ text: 'help', dedupeKey: 'a1' }))).chunks.join(' ').includes('APPROVE'));
  assert.ok((await sh.handleInbound(inbound({ text: 'status', dedupeKey: 'a2' }))).chunks.join(' ').includes('Net'));
  assert.ok((await sh.handleInbound(inbound({ text: 'pause', dedupeKey: 'a3' }))).chunks.join(' ').includes('Paused'));
});

test('unmatched text falls to brain; dead brain falls back honestly', async () => {
  const t = collector();
  const sh = shellWith(t, new FakeBrain('Brain says hi.'));
  const r = await sh.handleInbound(inbound({ text: 'what is an LP?', dedupeKey: 'b1' }));
  assert.ok(r.chunks.join(' ').includes('Brain says hi'));

  const dead: Brain = { draftReply: async () => { throw new Error('BRAIN_NOT_CONFIGURED'); } };
  const sh2 = shellWith(t, dead);
  const r2 = await sh2.handleInbound(inbound({ text: 'anything', dedupeKey: 'b2' }));
  assert.ok(r2.chunks.join(' ').includes('HELP'));
  assert.ok(fallbackReply().reply.includes('HELP'));
});

test('propose → approve executes via approver and delivers receipt', async () => {
  const t = collector();
  const sh = new ChatShell(
    { ownerIds: [OWNER], maxHistoryTurns: 10, maxDedupeKeys: 100, now: () => NOW },
    t,
    new FakeBrain(),
    [helpSkill(), approvalSkill({ list: (s) => sh.pendingFor(s), resolve: (s, id, a) => sh.resolveApproval(s, id, a) })],
    { execute: async (_s, p) => `Receipt 0xabc for proposal ${p.id}.` },
  );
  const line = sh.propose('space-1', 'swap', 'Buy $50 of TKN (max slippage 1%).');
  assert.ok(line.includes('Proposal 1'));
  const r = await sh.handleInbound(inbound({ text: 'APPROVE 1', dedupeKey: 'c1' }));
  assert.ok(r.chunks.join(' ').includes('executing now'));
  await new Promise((res) => setTimeout(res, 20));
  assert.ok(t.sent.join(' ').includes('0xabc'));
});

test('reject executes nothing; unknown id resolves to nothing', async () => {
  const t = collector();
  let executed = 0;
  const sh = new ChatShell(
    { ownerIds: [OWNER], maxHistoryTurns: 10, maxDedupeKeys: 100, now: () => NOW },
    t,
    new FakeBrain(),
    [helpSkill()],
    { execute: async () => { executed += 1; return 'done'; } },
  );
  sh.propose('space-1', 'swap', 'Buy $50 of TKN.');
  const r = await sh.handleInbound(inbound({ text: 'REJECT 1', dedupeKey: 'd1' }));
  assert.ok(r.chunks.join(' ').includes('rejected'));
  assert.equal(executed, 0);
  const r2 = await sh.handleInbound(inbound({ text: 'APPROVE 99', dedupeKey: 'd2' }));
  assert.ok(r2.chunks.join(' ').includes('HELP')); // no approval skill: falls to brain fallback
  assert.equal(executed, 0);
});

test('brain-suggested unknown skills are dropped, text still delivered', async () => {
  const t = collector();
  const tricky: Brain = {
    draftReply: async () => ({ text: 'Sure, launching now. {"skill": "rug", "args": ""}', action: null }),
  };
  const sh = shellWith(t, tricky);
  const r = await sh.handleInbound(inbound({ text: 'launch a coin', dedupeKey: 'e1' }));
  assert.ok(r.chunks.length > 0);
  assert.equal(extractAction('do {"skill": "rug", "args": ""} it', [helpSkill()]), null);
});

test('long replies chunk without loss', () => {
  const parts = chunkText('word '.repeat(1000), 500);
  assert.ok(parts.length > 1);
  assert.equal(parts.join(' ').replace(/\s+/g, ' ').trim(), 'word '.repeat(1000).trim());
});
