import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { publishCanonicalFinancePendingEvent } from '../server/vercel-handlers/finance/connectPendingEventPublisher.js';
const now = Date.parse('2026-10-15T22:00:00Z');
const secret = 'synthetic-nestfinance-specific-hmac-signing-secret';
const snapshot = { organizationId: 'org-a', financeEntityId: 'entity-a', evidenceId: 'evd_' + 'a'.repeat(32),
  version: 3, reviewStatus: 'pending', occurredAt: new Date(now - 1000) };
let submissions: Array<{ raw: string; signature: string; timestamp: string }> = [];
function options(mods: Record<string, unknown> = {}) {
  return { enabled: true, organizationId: snapshot.organizationId, financeEntityId: snapshot.financeEntityId,
    evidenceId: snapshot.evidenceId, version: snapshot.version, signingSecret: secret,
    operatorTargetsJson: JSON.stringify({ 'org-a': { conversationId: 'known-thread', recipientUid: 'approved-operator' } }),
    loadOfficialPendingReview: async () => snapshot, now: () => now,
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(url), 'https://connect.millionsnest.com/api/core/automations/events/nestfinance');
      assert.equal(init?.redirect, 'error'); assert.equal(init?.method, 'POST');
      const headers = init?.headers as Record<string, string>, raw = String(init?.body);
      const signature = createHmac('sha256', secret).update('nestfinance\n' +
        headers['x-connect-timestamp'] + '\n' + raw).digest('hex');
      assert.equal(headers['x-connect-signature'], signature);
      const body = JSON.parse(raw);
      assert.deepEqual(Object.keys(body).sort(), [
        'schemaVersion','sourceApp','eventId','organizationId',
        'conversationId','occurredAt','trigger','recipientUid',
      ].sort());
      assert.equal(body.trigger, 'document.pending');
      assert.equal(body.recipientUid, 'approved-operator');
      assert.equal(body.conversationId, 'known-thread');
      assert(!JSON.stringify(body).includes('documentType'));
      assert(!JSON.stringify(body).includes('originalSha256'));
      assert(!JSON.stringify(body).includes('amount'));
      assert(!JSON.stringify(body).includes('cpf'));
      submissions.push({ raw, signature, timestamp: headers['x-connect-timestamp'] });
      return new Response(JSON.stringify({ accepted: true, duplicate: submissions.length > 1 }), { status: 202 });
    }) as typeof fetch, ...mods };
}
let read = 0;
assert.equal(await publishCanonicalFinancePendingEvent(options({
  enabled: false, loadOfficialPendingReview: async () => { read++; return snapshot; },
})), 'disabled');
assert.equal(read, 0);
for(const mods of [
  { signingSecret: '' }, { operatorTargetsJson: undefined }, { operatorTargetsJson: '{}' },
  { operatorTargetsJson: '{"org-a":{"conversationId":"../bad","recipientUid":"approved"}}' },
  { operatorTargetsJson: '{"org-a":{"conversationId":"known-thread","recipientUid":"approved","phone":"private"}}' },
]) {
  assert.equal(await publishCanonicalFinancePendingEvent(options(mods)), 'not_configured');
}
for(const mods of [
  { organizationId: 'org-b' }, { reviewStatus: 'reviewed' },
  { version: 4 }, { occurredAt: new Date(now - 8 * 86400000) },
]) {
  assert.equal(await publishCanonicalFinancePendingEvent(options({
    loadOfficialPendingReview: async () => ({ ...snapshot, ...mods }),
  })), 'not_pending');
}
assert.equal(await publishCanonicalFinancePendingEvent(options()), 'accepted');
assert.equal(await publishCanonicalFinancePendingEvent(options()), 'duplicate');
assert.equal(submissions.length, 2);
assert.deepEqual(submissions[0], submissions[1], 'stable exact body, HMAC and idempotency across replay');
let tries = 0;
await assert.rejects(publishCanonicalFinancePendingEvent(options({
  fetchImpl: (async () => { tries++; throw new Error('unknown transport'); }) as typeof fetch,
})), /FINANCE_CONNECT_TRANSPORT_UNCERTAIN/);
assert.equal(tries, 1, 'no retries after uncertain transport');
await assert.rejects(publishCanonicalFinancePendingEvent(options({
  organizationId: 'org-a/cross-tenant',
})), /FINANCE_CONNECT_SOURCE_INVALID/);
console.log('NestFinance official pending event: OFF, signed source, canonical tenant/version, minimal PII, idempotent payload and no retries passed');
