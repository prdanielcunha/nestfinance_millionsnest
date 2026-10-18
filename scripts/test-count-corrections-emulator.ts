import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import correct from '../server/vercel-handlers/finance/countSessionsCorrect.js';
import detail from '../server/vercel-handlers/finance/countSessionsDetail.js';
import { compareCountEntries, normalizeCountEntries } from '../shared/finance/count.js';

if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '') ||
  !process.env.FIREBASE_PROJECT_ID?.startsWith('demo-')) throw new Error('Isolated demo Firestore emulator required');
class Res {
  statusCode = 200; body: any; headers: Record<string, string> = {};
  setHeader(k: string, v: string) { this.headers[k] = v; return this; }
  status(code: number) { this.statusCode = code; return this; }
  json(data: any) { this.body = data; return this; }
}
async function run() {
  resetFirebaseAdminForTests();
  const admin = getFirebaseAdmin(); const db = admin.firestore;
  const suffix = randomBytes(6).toString('hex');
  const org = `org_correction_${suffix}`; const entity = `entity_${suffix}`; const foreign = `foreign_${suffix}`;
  const uidA = `synthetic_a_${suffix}`; const uidB = `synthetic_b_${suffix}`;
  const uidEditor = `synthetic_editor_${suffix}`;
  const uidLaterEditor = `synthetic_later_editor_${suffix}`;
  const uidUnprivileged = `synthetic_no_grant_${suffix}`;
  const orgRef = db.collection('organizations').doc(org);
  await orgRef.set({ name: 'Synthetic correction organization', status: 'active' });
  for (const uid of [uidA, uidB, uidEditor, uidLaterEditor]) await db.collection('users').doc(uid).set({ systemRole: 'ceo', displayName: 'Synthetic reviewer' });
  await db.collection('users').doc(uidUnprivileged).set({ status: 'active' });
  for (const id of [entity, foreign]) await orgRef.collection('financeEntities').doc(id).set({ active: true, name: 'Synthetic entity' });
  const id = 'cnt_' + randomBytes(12).toString('hex');
  const ref = orgRef.collection('financeEntities').doc(entity).collection('countSessions').doc(id);
  const entries = normalizeCountEntries([{ type: 'tithe', method: 'total', totalCents: 25000 }]);
  const original = { id, organizationId: org, financeEntityId: entity, serviceLabel: 'Synthetic service', serviceDate: '2026-10-17',
    status: 'matched', workflowState: 'counted', version: 1, policySnapshot: {},
    countA: { entries, totalCents: 25000, countedByUid: uidA, countedByLabel: 'Synthetic A', sourceCaptureId: 'synthetic_original_evidence' },
    countB: { entries, totalCents: 25000, countedByUid: uidB, countedByLabel: 'Synthetic B' },
    comparison: compareCountEntries(entries, entries) };
  await ref.set(original);
  let actor = uidEditor; const originalVerify = admin.auth.verifyIdToken;
  admin.auth.verifyIdToken = async () => ({ uid: actor, name: 'Server verified actor' }) as any;
  const call = async (handler: any, body: any) => {
    const res = new Res(); await handler({ method: 'POST', headers: { authorization: 'Bearer synthetic', 'x-organization-id': org }, body, query: {} } as any, res as any); return res;
  };
  const token = (prefix: string) => prefix + '_' + randomBytes(12).toString('hex');
  const body = { financeEntityId: entity, countSessionId: id, expectedVersion: 1, target: 'countA',
    entries: [{ type: 'tithe', method: 'total', totalCents: 30000 }], reason: 'Correção sintética após verificar o comprovante',
    actorUid: 'forged_client_actor', changedAt: '1990-01-01', requestId: token('req'), idempotencyKey: token('idem') };
  try {
    assert.equal((await call(correct, { ...body, reason: '' })).statusCode, 400);
    const zero = await call(correct, { ...body, entries: [{ type: 'tithe', method: 'total', totalCents: 0 }], idempotencyKey: token('idem') });
    assert.equal(zero.body.error, 'COUNT_CORRECTION_ZERO_CONFIRMATION_REQUIRED');
    actor = uidUnprivileged; assert.equal((await call(correct, body)).statusCode, 403); actor = uidEditor;
    const [first, retry] = await Promise.all([call(correct, body), call(correct, { ...body, requestId: token('req') })]);
    assert.equal(first.statusCode, 200, JSON.stringify(first.body)); assert.deepEqual(first.body.correctionId, retry.body.correctionId);
    const saved = (await ref.get()).data()!;
    assert.equal(saved.version, 2); assert.equal(saved.status, 'divergent'); assert.equal(saved.corrections.length, 1);
    assert.deepEqual(saved.countB, original.countB); assert.equal(saved.corrections[0].before.totalCents, 25000);
    assert.equal(saved.corrections[0].after.totalCents, 30000); assert.equal(saved.corrections[0].actorUid, uidEditor);
    assert.equal(saved.countA.countedByUid, uidA, 'Physical counter identity is not reassigned to the editor');
    assert.equal(saved.countA.enteredByUid, uidEditor); assert.equal(saved.countA.sourceCaptureId, original.countA.sourceCaptureId);
    assert.ok(saved.corrections[0].changedAt.toMillis() > Date.now() - 60_000);
    const audit = (await orgRef.collection('financeAuditLogs').doc(first.body.correctionId).get()).data();
    assert.ok(audit, 'Canonical audit must exist'); assert.equal(audit.actor, uidEditor);
    assert.equal(audit.metadata.before.totalCents, 25000); assert.equal(audit.metadata.after.totalCents, 30000);
    assert.equal(audit.metadata.reason, body.reason);
    assert.equal((await call(correct, { ...body, reason: 'Different meaningful reason' })).statusCode, 409);
    assert.equal((await call(correct, { ...body, idempotencyKey: token('idem') })).statusCode, 409);
    assert.equal((await call(correct, { ...body, financeEntityId: foreign, idempotencyKey: token('idem') })).statusCode, 404);
    assert.equal((await call(correct, { ...body, expectedVersion: 2, target: 'countB', idempotencyKey: token('idem') })).body.error, 'COUNT_CORRECTION_INDEPENDENT_COUNTER_REQUIRED', 'One editor cannot correct both counts');
    // Rotate the current editor on A. The first editor must still never edit B.
    actor = uidLaterEditor;
    const rotated = await call(correct, { ...body, expectedVersion: 2,
      entries: [{ type: 'tithe', method: 'total', totalCents: 31000 }], idempotencyKey: token('idem') });
    assert.equal(rotated.statusCode, 200, JSON.stringify(rotated.body));
    actor = uidEditor;
    const crossing = await call(correct, { ...body, expectedVersion: 3, target: 'countB',
      entries: [{ type: 'tithe', method: 'total', totalCents: 31000 }], idempotencyKey: token('idem') });
    assert.equal(crossing.body.error, 'COUNT_CORRECTION_INDEPENDENT_COUNTER_REQUIRED');
    const eligibility = await call(detail, { financeEntityId: entity, countSessionId: id });
    assert.equal(eligibility.body.session.correctionEligibility.countB, false);
    actor = uidB;
    assert.equal((await call(correct, { ...body, expectedVersion: 3, idempotencyKey: token('idem') })).body.error, 'COUNT_CORRECTION_INDEPENDENT_COUNTER_REQUIRED');
    // Reusing a client correlation must not collide with an earlier immutable fact.
    const second = await call(correct, { ...body, expectedVersion: 3, target: 'countB', entries: [{ type: 'tithe', method: 'total', totalCents: 31000 }], idempotencyKey: token('idem') });
    assert.equal(second.statusCode, 200, JSON.stringify(second.body)); assert.equal(second.body.status, 'matched');
    const visible = await call(detail, { financeEntityId: entity, countSessionId: id });
    assert.equal(visible.body.session.corrections.length, 3); assert.equal(typeof visible.body.session.corrections[0].changedAt, 'string');
    assert.equal(visible.headers['Cache-Control'], 'private, no-store');
    await ref.update({ status: 'recounting' });
    const blind = await call(detail, { financeEntityId: entity, countSessionId: id });
    assert.deepEqual(blind.body.session.corrections, []); assert.equal(blind.body.session.countA, null);
    assert.equal((await call(correct, { ...body, expectedVersion: 4, idempotencyKey: token('idem') })).body.error, 'COUNT_CORRECTION_INVALID_STATE');
    await ref.update({ status: 'matched', countProposal: { transactionIds: ['synthetic_linked_transaction'] } });
    assert.equal((await call(correct, { ...body, expectedVersion: 4, idempotencyKey: token('idem') })).body.error, 'COUNT_CORRECTION_LINKED_ADJUSTMENT_REQUIRED');
    assert.equal((await ref.get()).data()!.corrections.length, 3, 'Rejected corrections leave all evidence unchanged');
    assert.equal((await orgRef.collection('financeTransactions').get()).size, 0);
    assert.equal((await orgRef.collection('financeJournalEntries').get()).size, 0);
    assert.equal((await orgRef.collection('financeAggregates').get()).size, 0);
    console.log('✅ Real Firestore: atomic corrections, concurrent replay, structured before/after, verified actor/time, mandatory reason, scope, RBAC, blind history and linked-finalization guard');
  } finally { admin.auth.verifyIdToken = originalVerify; await db.terminate(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
