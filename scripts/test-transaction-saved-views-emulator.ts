import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import listViews from '../server/vercel-handlers/finance/transactionWorkspaceViewsList.js';
import saveView from '../server/vercel-handlers/finance/transactionWorkspaceViewsSave.js';
import deleteView from '../server/vercel-handlers/finance/transactionWorkspaceViewsDelete.js';

class MockRes {
  statusCode = 200;
  body: any = null;
  status(code: number) { this.statusCode = code; return this; }
  json(body: any) { this.body = body; return this; }
  setHeader() { return this; }
}

process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || 'nestfinance-saved-views-emulator';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Transaction saved views test requires Firestore Emulator');
}

resetFirebaseAdminForTests();
const admin = getFirebaseAdmin();
const db = admin.firestore;
const suffix = randomBytes(4).toString('hex');
const orgId = 'org_saved_views_' + suffix;
const entityA = 'ent_saved_a_' + suffix;
const entityB = 'ent_saved_b_' + suffix;
const uidA = 'usr_saved_a_' + suffix;
const uidB = 'usr_saved_b_' + suffix;

await db.collection('organizations').doc(orgId).set({ name: 'Saved Views Org', status: 'active' });
for (const uid of [uidA, uidB]) {
  await db.collection('users').doc(uid).set({ systemRole: 'ceo' });
}
for (const entityId of [entityA, entityB]) {
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityId).set({
    name: entityId,
    active: true,
  });
}

let currentUid = uidA;
const originalVerify = admin.auth.verifyIdToken;
admin.auth.verifyIdToken = async () => ({ uid: currentUid, mn_organization_id: orgId }) as any;

const call = async (handler: any, body: any) => {
  const req = {
    method: 'POST',
    headers: {
      authorization: 'Bearer saved-views-test',
      'x-organization-id': orgId,
    },
    body,
    query: {},
  };
  const res = new MockRes();
  await handler(req as any, res as any);
  return res;
};

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log('✅ ' + message);
};

try {
  const invalid = await call(saveView, {
    financeEntityId: entityA,
    name: 'Invalid',
    filters: { direction: 'bogus', status: 'draft' },
  });
  verify(invalid.statusCode === 400, 'invalid filters are rejected before persistence');

  const first = await call(saveView, {
    financeEntityId: entityA,
    name: '  Pendências   da semana ',
    filters: { direction: 'expense', status: 'ready_for_review' },
  });
  verify(
    first.statusCode === 201 &&
      /^fview_[a-f0-9]{24}$/.test(first.body.viewId) &&
      first.body.name === 'Pendências da semana',
    'first saved view is normalized and created for current user/entity',
  );

  const second = await call(saveView, {
    financeEntityId: entityA,
    name: 'Entradas lançadas',
    filters: { direction: 'income', status: 'posted' },
  });
  verify(second.statusCode === 201, 'second saved view can be created');

  const listedA = await call(listViews, { financeEntityId: entityA });
  verify(
    listedA.statusCode === 200 &&
      listedA.body.items.length === 2 &&
      listedA.body.items.every((item: any) =>
        item.ownerUid === uidA &&
        item.financeEntityId === entityA &&
        item.organizationId === orgId
      ),
    'list is isolated to current user and finance entity',
  );

  const updated = await call(saveView, {
    financeEntityId: entityA,
    viewId: first.body.viewId,
    name: 'Pendências prioritárias',
    filters: { direction: 'expense', status: 'draft' },
  });
  verify(
    updated.statusCode === 200 &&
      updated.body.viewId === first.body.viewId &&
      updated.body.name === 'Pendências prioritárias',
    'existing view updates in place without changing identity',
  );

  const entityBList = await call(listViews, { financeEntityId: entityB });
  verify(
    entityBList.statusCode === 200 && entityBList.body.items.length === 0,
    'same user does not leak views across finance entities',
  );

  currentUid = uidB;
  const otherUserList = await call(listViews, { financeEntityId: entityA });
  verify(
    otherUserList.statusCode === 200 && otherUserList.body.items.length === 0,
    'another authorized user cannot see the first user saved views',
  );

  const otherDelete = await call(deleteView, {
    financeEntityId: entityA,
    viewId: first.body.viewId,
  });
  verify(
    otherDelete.statusCode === 200 && otherDelete.body.deleted === false,
    'another user cannot delete a view owned by the first user',
  );

  currentUid = uidA;
  for (let index = 2; index < 12; index += 1) {
    const created = await call(saveView, {
      financeEntityId: entityA,
      name: 'View ' + index,
      filters: {
        direction: index % 2 === 0 ? 'income' : 'expense',
        status: index % 3 === 0 ? 'posted' : 'draft',
      },
    });
    verify(created.statusCode === 201, 'view slot ' + (index + 1) + ' is accepted within limit');
  }

  const overLimit = await call(saveView, {
    financeEntityId: entityA,
    name: 'Too many',
    filters: { direction: 'all', status: 'all' },
  });
  verify(
    overLimit.statusCode === 409 &&
      overLimit.body.error === 'WORKSPACE_VIEW_LIMIT_REACHED',
    'thirteenth view is rejected by server-side transactional limit',
  );

  const deleted = await call(deleteView, {
    financeEntityId: entityA,
    viewId: first.body.viewId,
  });
  verify(
    deleted.statusCode === 200 && deleted.body.deleted === true,
    'owner can delete own saved view through server API',
  );

  const afterDelete = await call(listViews, { financeEntityId: entityA });
  verify(afterDelete.body.items.length === 11, 'delete frees a saved view slot');

  const auditSnapshot = await db
    .collection('organizations')
    .doc(orgId)
    .collection('financeAuditLogs')
    .get();
  verify(
    auditSnapshot.empty,
    'workspace preferences do not pollute canonical financial audit history',
  );

  console.log('\nTransaction Saved Views Emulator totals: ' + passed + ' Passed');
} finally {
  admin.auth.verifyIdToken = originalVerify;
}
