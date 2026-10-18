import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import update from '../server/vercel-handlers/finance/transactionsUpdateDraft.js';
import detail from '../server/vercel-handlers/finance/transactionsDetail.js';
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '') ||
  !process.env.FIREBASE_PROJECT_ID?.startsWith('demo-')) throw new Error('Isolated demo emulator required');
class Res { statusCode = 200; body: any; headers: Record<string,string> = {};
  setHeader(k: string, v: string) { this.headers[k] = v; return this; }
  status(code: number) { this.statusCode = code; return this; }
  json(value: any) { this.body = value; return this; }
}
async function run() {
  resetFirebaseAdminForTests(); const admin = getFirebaseAdmin(); const db = admin.firestore;
  const nonce = randomBytes(6).toString('hex');
  const org = `synthetic_org_${nonce}`; const entity = `synthetic_entity_${nonce}`; const foreign = `synthetic_foreign_${nonce}`;
  const uid = `synthetic_manager_${nonce}`; const denied = `synthetic_denied_${nonce}`;
  const ref = db.collection('organizations').doc(org);
  await ref.set({ name: 'Synthetic test organization', status: 'active' });
  await db.collection('users').doc(uid).set({ systemRole: 'ceo' });
  await db.collection('users').doc(denied).set({ status: 'active' });
  for (const id of [entity, foreign]) await ref.collection('financeEntities').doc(id).set({ active: true, name: 'Synthetic church' });
  const accountId = `synthetic_account_${nonce}`;
  await ref.collection('financeAccounts').doc(accountId).set({ financeEntityId: entity, name: 'Synthetic bank', type: 'asset:bank', nature: 'asset', active: true });
  const txId = 'tx_' + randomBytes(16).toString('hex');
  const tx = ref.collection('financeTransactions').doc(txId);
  const original = { id: txId, organizationId: org, financeEntityId: entity, status: 'draft', transactionKind: 'income', direction: 'income', cashFlowDirection: 'inflow',
    description: 'Synthetic original description',
    amountCents: 10000, currency: 'BRL', occurredAt: '2026-10-18T12:00:00Z', recordedAt: '2026-10-18T12:00:00Z',
    accountId, accountSnapshot: { id: accountId, name: 'Synthetic bank', type: 'bank', nature: 'asset' },
    paymentMethod: 'pix', sourceContext: 'manual', evidenceIds: [], evidenceJustification: 'Synthetic manual evidence explanation',
    reconciliationStatus: 'unreconciled', returnedToDraftAt: Timestamp.now(), returnedToDraftBy: uid, version: 2, schemaVersion: 1,
    createdBy: uid, updatedBy: uid, allocationIds: [] };
  await tx.set(original);
  let actor = uid; let revoked = false; let tokenOrg: string | null = null;
  const verify = admin.auth.verifyIdToken;
  admin.auth.verifyIdToken = async (_token, checkRevoked) => {
    assert.equal(checkRevoked, true);
    if (revoked) throw Object.assign(new Error('synthetic revoked token'), { code: 'auth/id-token-revoked' });
    return { uid: actor, name: 'Verified synthetic editor', ...(tokenOrg ? { mn_app_id: 'nestfinance', mn_handoff_version: 1, mn_organization_id: tokenOrg, mn_session_version: 1 } : {}) } as any;
  };
  const key = () => 'synthetic_' + randomBytes(12).toString('hex');
  const call = async (handler: any, body: any) => { const res = new Res(); await handler({ method: 'POST', headers: { authorization: 'Bearer synthetic', 'x-organization-id': org }, body, query: {} } as any, res as any); return res; };
  const command = { financeEntityId: entity, transactionId: txId, expectedVersion: 2, idempotencyKey: key(), requestId: key(),
    payload: { amountCents: 12000, description: '', correctionReason: 'Corrigido após conferir a evidência sintética' } };
  try {
    const missing = await call(update, { ...command, payload: { amountCents: 12000 } });
    assert.equal(missing.body.error, 'FINANCE_CORRECTION_REASON_REQUIRED');
    actor = denied; assert.equal((await call(update, command)).statusCode, 403); actor = uid;
    revoked = true; assert.equal((await call(update, command)).statusCode, 401); revoked = false;
    tokenOrg = 'synthetic_wrong_org'; assert.equal((await call(update, command)).statusCode, 403); tokenOrg = null;
    assert.equal((await call(update, { ...command, financeEntityId: foreign })).statusCode, 403);
    assert.equal((await tx.collection('corrections').get()).size, 0);
    const [saved, replay] = await Promise.all([call(update, command), call(update, { ...command, requestId: key() })]);
    assert.equal(saved.statusCode, 200, JSON.stringify(saved.body)); assert.equal(replay.statusCode, 200, JSON.stringify(replay.body));
    assert.deepEqual(saved.body, replay.body); assert.equal(saved.body.version, 3);
    const history = await tx.collection('corrections').get(); assert.equal(history.size, 1);
    const change = history.docs[0].data(); assert.equal(change.before.amountCents, 10000); assert.equal(change.after.amountCents, 12000);
    assert.equal(change.actorUid, uid); assert.equal(change.actorLabel, 'Verified synthetic editor');
    assert.equal(change.before.description, original.description); assert.equal(change.after.description, null);
    assert.equal((await tx.get()).data()!.description, undefined, 'Cleared field really removed from persisted record');
    assert.equal(change.reason, command.payload.correctionReason); assert.ok(change.changedAt.toMillis() > Date.now() - 60000);
    const audit = (await ref.collection('financeAuditLogs').doc(change.id).get()).data()!;
    assert.equal(audit.metadata.before.transaction.amountCents, 10000); assert.equal(audit.metadata.after.transaction.amountCents, 12000);
    assert.equal(audit.resourceId, txId); assert.equal((await tx.get()).data()!.version, 3);
    const visible = await call(detail, { financeEntityId: entity, transactionId: txId });
    assert.equal(visible.statusCode, 200, JSON.stringify(visible.body));
    assert.equal(visible.body.corrections.length, 1); assert.equal(visible.body.corrections[0].before.amountCents, 10000);
    assert.equal(visible.body.transaction.correctionReasonRequired, true);
    assert.ok(!('actorUid' in visible.body.corrections[0]));
    assert.equal((await call(update, { ...command, transactionId: 'tx_' + randomBytes(16).toString('hex') })).statusCode, 409, 'Idempotency bound to transaction identity');
    assert.equal((await call(update, { ...command, expectedVersion: 3 })).statusCode, 409, 'Idempotency bound to expected version');
    assert.equal((await call(update, { ...command, idempotencyKey: key() })).statusCode, 409, 'Stale editor cannot overwrite');
    const contenders = await Promise.all([13000, 14000].map(amountCents => call(update, { ...command, expectedVersion: 3,
      idempotencyKey: key(), requestId: key(), payload: { ...command.payload, amountCents } })));
    assert.deepEqual(contenders.map(res => res.statusCode).sort(), [200, 409]);
    assert.equal((await tx.collection('corrections').get()).size, 2);
    for (const patch of [{ journalEntryId: 'synthetic_journal' }, { reconciliationStatus: 'reconciled' }]) {
      await tx.set({ ...original, ...patch });
      const rejected = await call(update, { ...command, idempotencyKey: key() });
      assert.equal(rejected.statusCode, 400, JSON.stringify(rejected.body));
      assert.equal((await tx.collection('corrections').get()).size, 2, 'Protected source has no partial history write');
    }
    // Clearing allocation dimensions must also change persisted state, not only the audit.
    const allocationTxId = 'tx_' + randomBytes(16).toString('hex');
    const allocationTx = ref.collection('financeTransactions').doc(allocationTxId);
    const allocationId = 'alloc_' + randomBytes(16).toString('hex');
    const categoryId = `synthetic_category_${nonce}`; const fundId = `synthetic_fund_${nonce}`;
    await ref.collection('financeCategories').doc(categoryId).set({ financeEntityId: entity, active: true, name: 'Synthetic tithe', kind: 'income' });
    await ref.collection('financeFunds').doc(fundId).set({ financeEntityId: entity, active: true, name: 'Synthetic fund' });
    await allocationTx.set({ ...original, id: allocationTxId, allocationIds: [allocationId] });
    const allocationRef = ref.collection('financeAllocations').doc(allocationId);
    await allocationRef.set({ id: allocationId, organizationId: org, financeEntityId: entity, transactionId: allocationTxId,
      categoryId, categorySnapshot: { id: categoryId, name: 'Synthetic tithe', type: 'income' },
      fundId, fundSnapshot: { id: fundId, name: 'Synthetic fund' }, costCenterId: 'synthetic_cost_center',
      amountCents: 10000, sequence: 0, createdBy: uid, createdAt: '2026-10-18T12:00:00Z', schemaVersion: 1 });
    const dimensions = await call(update, { ...command, transactionId: allocationTxId, idempotencyKey: key(),
      payload: { correctionReason: command.payload.correctionReason, allocations: [{ id: allocationId, categoryId, amountCents: 10000 }] } });
    assert.equal(dimensions.statusCode, 200, JSON.stringify(dimensions.body));
    const clearedAllocation = (await allocationRef.get()).data()!;
    assert.equal(clearedAllocation.fundId, undefined); assert.equal(clearedAllocation.fundSnapshot, undefined);
    assert.equal(clearedAllocation.costCenterId, undefined);
    const dimensionHistory = (await allocationTx.collection('corrections').get()).docs[0].data();
    assert.equal(dimensionHistory.before.allocations[0].fund, 'Synthetic fund');
    assert.equal(dimensionHistory.after.allocations[0].fund, null);
    await tx.set(original);
    const foreignAllocation = await call(update, { ...command, idempotencyKey: key(),
      payload: { correctionReason: command.payload.correctionReason, allocations: [{ id: allocationId, categoryId, amountCents: 10000 }] } });
    assert.equal(foreignAllocation.body.error, 'FINANCE_ALLOCATION_MISMATCH');
    assert.equal((await allocationRef.get()).data()!.transactionId, allocationTxId);
    const facts = await db.collection('intelligenceFacts').where('organizationId', '==', org).get();
    for (const fact of facts.docs) assert.ok(!JSON.stringify(fact.data()).includes(command.payload.correctionReason), 'Private reason does not enter cross-app projection');
    assert.equal((await ref.collection('financeJournalEntries').get()).size, 0);
    assert.equal((await ref.collection('financeAggregates').get()).size, 0);
    console.log('✅ Firestore transaction corrections: atomic original/final, verified actor/time, required reason, read history, replay, concurrency, revoked/bound auth, RBAC/scope and no ledger writes');
  } finally { admin.auth.verifyIdToken = verify; await db.terminate(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
