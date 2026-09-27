import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { getFirebaseAdmin } from '../api/_lib/firebaseAdmin.js';
import removeBatch from '../server/vercel-handlers/finance/transactionsRemoveBatch.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore Emulator required');
const db = getFirebaseAdmin().firestore;
const auth = getFirebaseAdmin().auth;
const uid = 'usr_removal_fixture';
const orgId = 'org_removal_fixture';
const entityId = 'ent_removal_fixture';
const otherEntityId = 'ent_other_fixture';
const org = db.collection('organizations').doc(orgId);
const tx = (id: string) => org.collection('financeTransactions').doc(id);
const id = (n: number) => `tx_${String(n).padStart(40, '0')}`;
const key = () => `idem_${randomBytes(12).toString('hex')}`;

await org.set({ name: 'Synthetic test organization' });
await db.collection('users').doc(uid).set({ displayName: 'Synthetic CEO', systemRole: 'ceo' });
await org.collection('financeEntities').doc(entityId).set({ name: 'Synthetic entity', active: true });
await org.collection('financeEntities').doc(otherEntityId).set({ name: 'Other synthetic entity', active: true });
const originalVerify = auth.verifyIdToken;
auth.verifyIdToken = async () => ({ uid, email: 'fixture@example.invalid' }) as any;

async function call(items: { transactionId: string; expectedVersion: number }[], idempotencyKey = key()) {
  const response = { statusCode: 200, body: {} as any, setHeader() { return this; }, status(code: number) { this.statusCode = code; return this; }, json(body: any) { this.body = body; return this; } };
  await removeBatch({ method: 'POST', headers: { authorization: 'Bearer synthetic', 'x-organization-id': orgId }, body: { financeEntityId: entityId, items, idempotencyKey, requestId: key() } } as any, response as any);
  return response;
}

const original = { financeEntityId: entityId, status: 'approved_for_posting', sourceContext: 'manual', reconciliationStatus: 'unreconciled', version: 2, amountCents: 10000, allocationIds: [] };
try {
  await tx(id(1)).set(original);
  await tx(id(2)).set({ ...original, status: 'ready_for_review' });
  await tx(id(1)).collection('approvals').doc('latest').set({ approvedVersion: 1 });
  const first = await call([{ transactionId: id(1), expectedVersion: 2 }, { transactionId: id(2), expectedVersion: 2 }]);
  assert.equal(first.statusCode, 200, JSON.stringify(first.body));
  assert.equal(first.body.deleted, 2);
  assert.equal((await tx(id(1)).get()).exists, false);
  assert.equal((await tx(id(1)).collection('approvals').doc('latest').get()).exists, false);
  assert.equal((await tx(id(2)).get()).exists, false);
  const audit = await org.collection('financeAuditLogs').where('action', '==', 'transaction.permanently_removed').get();
  assert.equal(audit.size, 2);

  await tx(id(3)).set(original);
  await tx(id(4)).set({ ...original, status: 'posted' });
  const unsafe = await call([{ transactionId: id(3), expectedVersion: 2 }, { transactionId: id(4), expectedVersion: 2 }]);
  assert.equal(unsafe.statusCode, 409);
  assert.equal((await tx(id(3)).get()).exists, true, 'batch must be atomic');

  const cross = await tx(id(5)).set({ ...original, financeEntityId: otherEntityId });
  const rejected = await call([{ transactionId: id(5), expectedVersion: 2 }]);
  assert.equal(rejected.statusCode, 403);
  assert.equal((await tx(id(5)).get()).exists, true);
  console.log('✅ Emulator verified atomic removal, approval cleanup, audit, posted protection and entity isolation.');
} finally {
  auth.verifyIdToken = originalVerify;
}
