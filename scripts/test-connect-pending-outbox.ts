import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { financeConnectReceiptExtension, recoverFinanceConnectReceipt } from '../server/vercel-handlers/finance/connectPendingReceiptOutbox.js';

const now = Date.parse('2026-10-16T17:00:00.000Z');
const evidenceId = 'evd_' + 'a'.repeat(32);
const secret = 'synthetic-nestfinance-receipt-signing-key-very-long';
const targets = JSON.stringify({ 'org-a': { conversationId: 'known-thread', recipientUid: 'approved-operator' } });
const key = '1'.repeat(64);
const initial = financeConnectReceiptExtension({ enabled: true, organizationId: 'org-a', financeEntityId: 'fin-a', evidenceId, version: 3 }).connectOutbox!;
function makeDb() {
  const receipt: any = { status: 'completed', result: { evidenceId, version: 3 },
    connectOutbox: structuredClone(initial) };
  const source: any = { organizationId: 'org-a', financeEntityId: 'fin-a', evidenceId,
    version: 3, review: { status: 'pending' },
    updatedAt: { toDate: () => new Date(now - 1000) } };
  const doc = (kind: 'receipt'|'evidence') => ({
    async get() { return { exists: true, data: () => kind === 'receipt' ? receipt : source }; },
  });
  const idempotencyRef: any = { doc(receiptId: string) {
    assert.equal(receiptId, key); return doc('receipt');
  } };
  const db: any = {
    async runTransaction(fn: (tx: any) => Promise<unknown>) {
      return fn({
        async get(ref: any) { return ref.get(); },
        update(_ref: any, patch: Record<string, unknown>) {
          for (const [path, value] of Object.entries(patch)) {
            assert(path.startsWith('connectOutbox.'));
            receipt.connectOutbox[path.slice('connectOutbox.'.length)] = value;
          }
        },
      });
    },
    collection(name: string) {
      assert.equal(name, 'organizations');
      return { doc(org: string) {
        assert.equal(org, 'org-a');
        return { collection(key: string) {
          assert.equal(key, 'financeEntities');
          return { doc(entity: string) {
            assert.equal(entity, 'fin-a');
            return { collection(key: string) {
              assert.equal(key, 'universalEvidence');
              return { doc(id: string) {
                assert.equal(id, evidenceId);
                return doc('evidence');
              } };
            } };
          } };
        } };
      } };
    },
  };
  return { db, idempotencyRef, receipt, source };
}
function args(state: ReturnType<typeof makeDb>, extra: Record<string, unknown> = {}) {
  return {
    db: state.db, idempotencyRef: state.idempotencyRef, receiptKey: key,
    organizationId: 'org-a', financeEntityId: 'fin-a', enabled: true,
    signingSecret: secret, operatorTargetsJson: targets, now: () => now, ...extra,
  };
}

assert.deepEqual(financeConnectReceiptExtension({ enabled: false, organizationId: 'org-a', financeEntityId: 'fin-a', evidenceId, version: 3 }), {});
assert.deepEqual(initial, { schemaVersion: 1, organizationId: 'org-a', financeEntityId: 'fin-a', evidenceId, version: 3, state: 'pending', attempts: 0 });
assert.throws(() => financeConnectReceiptExtension({ enabled: true, organizationId: '../other', financeEntityId: 'fin-a', evidenceId, version: 3 }));
const blocked = makeDb();
assert.equal(await recoverFinanceConnectReceipt(args(blocked, { financeEntityId: 'fin-b' })), 'deferred');
assert.equal(blocked.receipt.connectOutbox.attempts, 0, 'entity mismatch must not lease');
assert.equal(await recoverFinanceConnectReceipt(args(blocked, { organizationId: 'org-b' })), 'deferred');

const completed = makeDb(); let sends = 0;
const fetchImpl: typeof fetch = async (url, init) => {
  sends++;
  assert.equal(String(url), 'https://connect.millionsnest.com/api/core/automations/events/nestfinance');
  assert.equal(init?.redirect, 'error');
  const raw = String(init?.body), headers = init!.headers as Record<string,string>;
  assert.equal(headers['x-connect-signature'], createHmac('sha256', secret)
    .update('nestfinance\n' + headers['x-connect-timestamp'] + '\n' + raw).digest('hex'));
  const payload = JSON.parse(raw);
  assert.deepEqual(Object.keys(payload).sort(), [
    'schemaVersion','sourceApp','eventId','organizationId','conversationId','occurredAt','trigger','recipientUid',
  ].sort());
  assert.equal(payload.sourceApp, 'nestfinance');
  assert.equal(payload.organizationId, 'org-a');
  assert.equal(payload.recipientUid, 'approved-operator');
  assert(!JSON.stringify(payload).includes('amount'));
  assert(!JSON.stringify(payload).includes('documentType'));
  assert(!JSON.stringify(payload).includes('cpf'));
  return new Response(JSON.stringify({ accepted: true, duplicate: false }), { status: 202 });
};
assert.equal(await recoverFinanceConnectReceipt(args(completed, { fetchImpl })), 'complete'); // actual state returned by storage
assert.equal(completed.receipt.connectOutbox.state, 'complete');
assert.equal(completed.receipt.connectOutbox.attempts, 1);
assert.equal(sends, 1);
assert.equal(await recoverFinanceConnectReceipt(args(completed, { fetchImpl })), 'deferred');
assert.equal(sends, 1, 'no duplicate send after committed ack');

const failed = makeDb();
let attempts = 0, clock = now;
const uncertainFetch: typeof fetch = async () => {
  attempts++;
  if (attempts === 1) throw new Error('network down after unknown delivery');
  return new Response(JSON.stringify({ accepted: true, duplicate: true }), { status: 202 });
};
const retryArgs = args(failed, { fetchImpl: uncertainFetch, now: () => clock });
assert.equal(await recoverFinanceConnectReceipt(retryArgs), 'pending');
assert.equal(failed.receipt.connectOutbox.attempts, 1);
assert.equal(await recoverFinanceConnectReceipt(retryArgs), 'deferred');
assert.equal(attempts, 1, 'backoff respected');
clock += 70000;
assert.equal(await recoverFinanceConnectReceipt(retryArgs), 'complete');
assert.equal(attempts, 2, 'stable idempotency may safely replay ambiguous 202');

const resolved = makeDb();
resolved.source.review.status = 'reviewed';
assert.equal(await recoverFinanceConnectReceipt(args(resolved, { fetchImpl })), 'needs_review');
assert.equal(resolved.receipt.connectOutbox.state, 'needs_review');
assert.equal(sends, 1, 'reviewed evidence never produces a second operator event');
console.log('NestFinance Connect receipt outbox: atomic marker, scoped transaction leases, HMAC, fail-closed replay, review, no PII passed.');
