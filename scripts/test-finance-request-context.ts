import assert from 'assert';
import { FakeFirestore } from './fakeFirestore.js';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import { resolveFinanceRequestContext } from '../server/vercel-handlers/finance/accessHelpers.js';

process.env.NODE_ENV = 'test';

async function run() {
  console.log('Running Finance Request Context security tests...');

  const db: any = new FakeFirestore();
  (globalThis as any)[Symbol.for('TEST_FIRESTORE')] = db;
  resetFirebaseAdminForTests();
  const admin = getFirebaseAdmin();

  const orgId = 'org_finance_context';
  const entityId = 'entity_finance_context';
  const uid = 'user_finance_context';

  await db.collection('organizations').doc(orgId).set({ name: 'Finance Context Org' });
  await db.collection('users').doc(uid).set({ displayName: 'Finance Context User', systemRole: 'ceo' });
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityId).set({ active: true });

  const originalVerify = admin.auth.verifyIdToken;
  let observedCheckRevoked: boolean | undefined;
  admin.auth.verifyIdToken = async (_token: string, checkRevoked?: boolean) => {
    observedCheckRevoked = checkRevoked;
    return { uid, mn_organization_id: orgId } as any;
  };

  let passed = 0;
  let failed = 0;

  try {
    try {
      const req: any = {
        headers: {
          authorization: 'Bearer finance-context-token',
          'x-organization-id': orgId
        },
        body: { financeEntityId: entityId },
        query: {}
      };
      const result = await resolveFinanceRequestContext(req, 'finance.view');
      assert.strictEqual(result.organizationId, orgId);
      assert.strictEqual(result.financeEntityId, entityId);
      assert.strictEqual(observedCheckRevoked, true);
      console.log('✅ shared finance context exige checkRevoked=true');
      passed++;
    } catch (error: any) {
      console.error('❌ revoked-token verification: ' + error.message);
      failed++;
    }

    try {
      const req: any = {
        headers: {
          authorization: 'Bearer finance-context-token',
          'x-organization-id': 'org_attempted_retarget'
        },
        body: { financeEntityId: entityId },
        query: {}
      };
      await resolveFinanceRequestContext(req, 'finance.view');
      console.error('❌ token organization binding: mismatch was accepted');
      failed++;
    } catch (error: any) {
      assert.strictEqual(error.status, 403);
      assert.strictEqual(error.error, 'FORBIDDEN_ORGANIZATION_MISMATCH');
      console.log('✅ token ligado a uma organização não pode ser redirecionado por header');
      passed++;
    }
  } finally {
    admin.auth.verifyIdToken = originalVerify;
  }

  console.log(`\nFinance Context Totals: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
