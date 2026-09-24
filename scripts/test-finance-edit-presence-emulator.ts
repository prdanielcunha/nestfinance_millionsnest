import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  getFirebaseAdmin,
  resetFirebaseAdminForTests,
} from '../api/_lib/firebaseAdmin.js';
import transactionEditPresenceHeartbeat from '../server/vercel-handlers/finance/transactionEditPresenceHeartbeat.js';
import transactionEditPresenceRelease from '../server/vercel-handlers/finance/transactionEditPresenceRelease.js';

process.env.NODE_ENV = 'test';

class MockRes {
  statusCode = 200;
  body: any = null;
  status(code: number) { this.statusCode = code; return this; }
  json(body: any) { this.body = body; return this; }
}

async function call(
  handler: any,
  token: string,
  organizationId: string,
  body: Record<string, unknown>,
) {
  const req: any = {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      'x-organization-id': organizationId,
    },
    query: {},
    body,
  };
  const res = new MockRes();
  await handler(req, res as any);
  return res;
}

async function run() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST is required');
  }

  resetFirebaseAdminForTests();
  const admin = getFirebaseAdmin();
  const db = admin.firestore;
  const suffix = crypto.randomBytes(4).toString('hex');
  const organizationId = 'org_presence_' + suffix;
  const financeEntityId = 'entity_presence_' + suffix;
  const transactionId = 'tx_presence_' + suffix;
  const uidA = 'presence_a_' + suffix;
  const uidB = 'presence_b_' + suffix;

  await db.collection('organizations').doc(organizationId).set({ name: 'Presence Test' });
  await db.collection('users').doc(uidA).set({ displayName: 'Editor A', systemRole: 'ceo' });
  await db.collection('users').doc(uidB).set({ displayName: 'Editor B', systemRole: 'ceo' });
  await db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId).set({
    name: 'Presence Entity',
    active: true,
  });
  await db.collection('organizations').doc(organizationId).collection('financeTransactions').doc(transactionId).set({
    id: transactionId,
    organizationId,
    financeEntityId,
    status: 'draft',
    version: 7,
    transactionKind: 'expense',
    direction: 'expense',
    amountCents: 10000,
    occurredAt: '2026-09-24T12:00:00.000Z',
  });

  const originalVerify = admin.auth.verifyIdToken;
  admin.auth.verifyIdToken = async (token: string) => ({
    uid: token === 'token-b' ? uidB : uidA,
    name: token === 'token-b' ? 'Editor B' : 'Editor A',
  }) as any;

  try {
    const base = { financeEntityId, transactionId };

    const first = await call(
      transactionEditPresenceHeartbeat,
      'token-a',
      organizationId,
      { ...base, sessionId: 'edit_aaaaaaaaaaaaaaaa' },
    );
    assert.equal(first.statusCode, 200, JSON.stringify(first.body));
    assert.equal(first.body.editable, true);

    const second = await call(
      transactionEditPresenceHeartbeat,
      'token-b',
      organizationId,
      { ...base, sessionId: 'edit_bbbbbbbbbbbbbbbb' },
    );
    assert.equal(second.statusCode, 200, JSON.stringify(second.body));
    assert.equal(second.body.editable, false);
    assert.equal(second.body.ownerLabel, 'Editor A');

    const transactionBeforeRelease = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeTransactions')
      .doc(transactionId)
      .get();
    assert.equal(transactionBeforeRelease.data()?.version, 7);

    const release = await call(
      transactionEditPresenceRelease,
      'token-a',
      organizationId,
      { ...base, sessionId: 'edit_aaaaaaaaaaaaaaaa' },
    );
    assert.equal(release.statusCode, 200, JSON.stringify(release.body));
    assert.equal(release.body.released, true);

    const secondAfterRelease = await call(
      transactionEditPresenceHeartbeat,
      'token-b',
      organizationId,
      { ...base, sessionId: 'edit_bbbbbbbbbbbbbbbb' },
    );
    assert.equal(secondAfterRelease.statusCode, 200, JSON.stringify(secondAfterRelease.body));
    assert.equal(secondAfterRelease.body.editable, true);

    const transactionAfter = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeTransactions')
      .doc(transactionId)
      .get();
    assert.equal(transactionAfter.data()?.version, 7);

    console.log('✅ Authenticated edit-presence lease prevents simultaneous overwrite without financial mutation');
  } finally {
    admin.auth.verifyIdToken = originalVerify;
  }
}

run().catch((error) => {
  console.error('❌ Edit presence emulator test failed', error);
  process.exit(1);
});
