import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import create from '../server/vercel-handlers/finance/countSessionsCreate.js';
import save from '../server/vercel-handlers/finance/countSessionsSaveFirstCount.js';
import start from '../server/vercel-handlers/finance/countSessionsStartSecondCount.js';
import join from '../server/vercel-handlers/finance/countSessionsJoinSecondCount.js';
import seal from '../server/vercel-handlers/finance/countSessionsSubmitSecondCount.js';
import correct from '../server/vercel-handlers/finance/countSessionsCorrect.js';
import apply from '../server/vercel-handlers/finance/countCapturesApplyToCount.js';

if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '') || !process.env.FIREBASE_PROJECT_ID?.startsWith('demo-')) throw new Error('Isolated demo emulator required');
class Res { statusCode = 200; body: any; setHeader() { return this; } status(n: number) { this.statusCode = n; return this; } json(data: any) { this.body = data; return this; } }
async function run() {
  resetFirebaseAdminForTests(); const admin = getFirebaseAdmin(); const db = admin.firestore;
  const suffix = randomBytes(8).toString('hex'); const org = `org_cash_${suffix}`; const entity = `entity_${suffix}`;
  const uidA = `a_${suffix}`; const uidB = `b_${suffix}`; let actor = uidA;
  const root = db.collection('organizations').doc(org);
  await root.set({ status: 'active', name: 'Synthetic cash organization' });
  await root.collection('financeEntities').doc(entity).set({ active: true, name: 'Synthetic church' });
  for (const uid of [uidA, uidB]) await db.collection('users').doc(uid).set({ systemRole: 'ceo', displayName: 'Synthetic counter' });
  const originalVerify = admin.auth.verifyIdToken;
  admin.auth.verifyIdToken = async () => ({ uid: actor }) as any;
  const token = () => 'synthetic_' + randomBytes(16).toString('hex');
  const call = async (handler: any, body: any) => {
    const res = new Res(); await handler({ method: 'POST', headers: { authorization: 'Bearer synthetic', 'x-organization-id': org }, query: {},
      body: { financeEntityId: entity, requestId: token(), idempotencyKey: token(), ...body } } as any, res as any); return res;
  };
  const cash = [{ type: 'tithe', method: 'total', totalCents: 10000 }, { type: 'offering', method: 'total', totalCents: 2000 }];
  const pix = [{ type: 'pix', method: 'total', totalCents: 5000 }];
  try {
    const made = await call(create, { collectionScope: 'cash_only', serviceLabel: 'Synthetic service', serviceDate: '2026-10-18' });
    assert.equal(made.statusCode, 200, JSON.stringify(made.body));
    const id = made.body.sessionId; const ref = root.collection('financeEntities').doc(entity).collection('countSessions').doc(id);
    assert.equal((await ref.get()).data()!.collectionScope, 'cash_only');
    const rejected = await call(save, { countSessionId: id, expectedVersion: 1, entries: pix });
    assert.equal(rejected.statusCode, 400); assert.equal(rejected.body.error, 'COUNT_CASH_ONLY_DIGITAL_SEPARATE');
    assert.equal((await ref.get()).data()!.version, 1, 'Rejected digital material is atomic');
    assert.equal((await call(save, { countSessionId: id, expectedVersion: 1, entries: cash })).statusCode, 200);
    const invite = await call(start, { countSessionId: id, expectedVersion: 2 });
    assert.equal(invite.statusCode, 200, JSON.stringify(invite.body));
    actor = uidB; const joined = await call(join, { joinCode: invite.body.joinCode });
    assert.equal(joined.statusCode, 200, JSON.stringify(joined.body));
    const version = joined.body.version;
    assert.equal((await call(seal, { countSessionId: id, expectedVersion: version, entries: pix })).body.error, 'COUNT_CASH_ONLY_DIGITAL_SEPARATE');
    const sealed = await call(seal, { countSessionId: id, expectedVersion: version, entries: cash });
    assert.equal(sealed.statusCode, 200, JSON.stringify(sealed.body));
    const saved = (await ref.get()).data()!;
    assert.equal(saved.status, 'matched'); assert.equal(saved.workflowState, 'counted');
    assert.equal(saved.countA.totalCents, 12000); assert.equal(saved.countB.totalCents, 12000);
    assert.ok(!saved.countB.entries.some((e: any) => e.type === 'pix'), 'Cash seals without digital receipt');
    actor = uidA;
    assert.equal((await call(correct, { countSessionId: id, expectedVersion: saved.version, target: 'countA', entries: pix,
      reason: 'Synthetic attempt to mix digital receipt into physical evidence' })).body.error, 'COUNT_CASH_ONLY_DIGITAL_SEPARATE');
    assert.equal((await ref.get()).data()!.version, saved.version);
    // Reviewed free-form photo keeps raw evidence while omitting its reviewed zero placeholder.
    for (const pixCents of [0, 5000]) {
      const photoSession = await call(create, { collectionScope: 'cash_only', serviceLabel: 'Synthetic photo', serviceDate: '2026-10-18' });
      const photoId = photoSession.body.sessionId;
      const captureId = 'cpc_' + randomBytes(12).toString('hex');
      const captureRef = root.collection('financeEntities').doc(entity).collection('countCaptures').doc(captureId);
      const fields = ['tithe', 'offering', 'other_income', 'pix'].map(key => ({ key, decision: 'corrected', valueCents: key === 'tithe' ? 10000 : key === 'pix' ? pixCents : 0 }));
      await captureRef.set({ id: captureId, organizationId: org, financeEntityId: entity, countSessionId: photoId,
        provenance: 'free_form_note', formId: null, checksum: null, templateVersion: null, stage: 'count_a',
        status: 'reviewed', version: 3, createdByUid: actor, review: { fields } });
      const applied = await call(apply, { captureId, expectedCaptureVersion: 3 });
      assert.equal(applied.statusCode, pixCents ? 400 : 200, JSON.stringify(applied.body));
      if (pixCents) assert.equal(applied.body.error, 'COUNT_CASH_ONLY_DIGITAL_SEPARATE');
      const photo = (await root.collection('financeEntities').doc(entity).collection('countSessions').doc(photoId).get()).data()!;
      assert.equal(photo.version, pixCents ? 1 : 2);
      if (!pixCents) assert.equal(photo.countA.entries.length, 3);
      assert.deepEqual((await captureRef.get()).data()!.review.fields, fields, 'Original reviewed evidence is preserved');
    }
    const legacy = await call(create, { serviceLabel: 'Legacy compatible', serviceDate: '2026-10-18' });
    assert.equal(legacy.statusCode, 200);
    assert.equal((await call(save, { countSessionId: legacy.body.sessionId, expectedVersion: 1, entries: pix })).statusCode, 200, 'Older client contract remains valid');
    assert.equal((await call(create, { collectionScope: 'forged', serviceLabel: 'Invalid', serviceDate: '2026-10-18' })).statusCode, 400);
    assert.equal((await root.collection('financeTransactions').get()).size, 0, 'Counting cannot automatically create posted income');
    console.log('✅ Real Firestore: cash-only creation, rejected Pix with unchanged version, independent invitation/count/seal, protected corrections and legacy compatibility');
  } finally { admin.auth.verifyIdToken = originalVerify; await db.terminate(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
