import assert from 'node:assert/strict';
import { getFirebaseAdmin } from '../api/_lib/firebaseAdmin.js';
import { hasEffectiveCapability, resolveFinanceRequestContext } from '../server/vercel-handlers/finance/accessHelpers.js';
import { canManageFinanceBootstrap } from '../server/vercel-handlers/finance/bootstrapAvailabilityHelper.js';
import { hasEffectiveCapability as uiCapability, canExecuteCount } from '../src/lib/permissions.js';
import bootstrapApply from '../server/vercel-handlers/finance/entitiesBootstrapApply.js';
import { getFinanceEntryProfile } from '../src/lib/financeEntryProfile.js';
import { INDIVIDUAL_FINANCE_ACCESS as marker } from '../shared/finance/individualAccess.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_PROJECT_ID?.startsWith('demo-')) throw Error('ISOLATED_EMULATOR_REQUIRED');
const admin = getFirebaseAdmin(), db = admin.firestore;
const org = 'individual-access-fixture', uid = 'operator', entity = 'church-a';
await db.doc(`organizations/${org}`).set({ status: 'active', enabledApps: ['nestfinance'], entitlements: { nestfinance: { active: true } } });
await db.doc(`organizations/${org}/financeEntities/${entity}`).set({ active: true, organizationId: org });
await db.doc(`users/${uid}`).set({ status: 'active', systemRole: 'user', ecosystemSessionVersion: 1 });
const verify = admin.auth.verifyIdToken;
admin.auth.verifyIdToken = async (_token, revoked) => {
  assert.equal(revoked, true);
  return { uid, mn_app_id: 'nestfinance', mn_handoff_version: 1, mn_organization_id: org, mn_session_version: 1 } as any;
};
async function setGrants(grants: string[], role = 'admin') {
  await db.doc(`organizations/${org}/members/${uid}`).set({ status: 'active', role,
    appAccess: { nestFinance: { enabled: true, roles: ['owner', 'treasurer'], permissions: grants, scopes: { financeEntityIds: [entity] } } } });
}
async function context(operation: string | undefined, capability: Parameters<typeof resolveFinanceRequestContext>[1], targetEntity = entity) {
  return resolveFinanceRequestContext({ headers: { authorization: 'Bearer fixture', 'x-organization-id': org },
    body: { financeEntityId: targetEntity }, query: {}, __nestFinanceResolvedGatewayOperation: operation } as any, capability);
}
const denied = async (operation: string | undefined, capability: Parameters<typeof resolveFinanceRequestContext>[1]) =>
  assert.rejects(() => context(operation, capability));
async function assertBootstrapDenied() {
  let status = 200;
  await bootstrapApply({ method: 'POST', headers: { authorization: 'Bearer fixture', 'x-organization-id': org },
    body: { financeEntityId: entity, templateId: 'fixture', selection: {}, previewDigest: 'fixture', idempotencyKey: 'fixture' }, query: {} } as any,
    { setHeader() {}, status(code: number) { status = code; return this; }, json() { return this; } } as any);
  assert.equal(status, 403, 'Actual bootstrap mutation must reject limited individual grants');
  assert.equal((await db.collection(`organizations/${org}/financeAccounts`).get()).size, 0);
  assert.equal((await db.collection(`organizations/${org}/financeCategories`).get()).size, 0);
}
try {
  const count = [marker, 'finance.view', 'finance.count.execute', 'finance.count.view'];
  await setGrants(count);
  for (const role of ['member', 'admin', 'owner']) {
    const session: any = { granted: true, organizationRole: role, permissions: count, capabilities: count, roles: ['treasurer'] };
    for (const cap of ['finance.manage', 'finance.create_drafts', 'finance.balance.view', 'finance.review', 'organization.manage_entities']) {
      assert.equal(hasEffectiveCapability(session, cap), false); assert.equal(uiCapability(session, cap), false);
    }
    assert.equal(getFinanceEntryProfile(session).countOnly, true);
    assert.equal(canExecuteCount(session), true);
  }
  await context('count-sessions-create', 'finance.create_drafts');
  await context('count-sessions-detail', 'finance.view');
  await denied('transactions-create-draft', 'finance.create_drafts');
  await denied(undefined, 'finance.create_drafts');
  await denied('count-sessions-create-proposed-drafts', 'finance.create_drafts');
  await denied('transactions-summary', 'finance.view');
  await denied('transactions-review', 'finance.review');
  assert.equal((await canManageFinanceBootstrap(uid, org, entity)).canApply, false);
  const countBalance = [...count, 'finance.treasury.view', 'finance.balance.view'];
  await setGrants(countBalance);
  await context('transactions-summary', 'finance.view');
  await context('count-sessions-create', 'finance.create_drafts');
  await denied('transactions-create-draft', 'finance.create_drafts');
  assert.equal((await canManageFinanceBootstrap(uid, org, entity)).canApply, false);
  assert.equal((await canManageFinanceBootstrap(uid, org, entity, 'finance.treasury.view')).canApply, true);
  await assertBootstrapDenied();
  assert.equal((await canManageFinanceBootstrap(uid, org, 'another-church')).canApply, false);
  await setGrants([marker, 'finance.view', 'finance.treasury.view', 'finance.create_drafts', 'finance.submit_for_review']);
  await context('transactions-create-draft', 'finance.create_drafts');
  await denied('count-sessions-create', 'finance.create_drafts');
  await denied('transactions-review', 'finance.review');
  assert.equal(canExecuteCount({ capabilities: [marker, 'finance.create_drafts'], organizationRole: 'admin' } as any), false);
  await assertBootstrapDenied();
  for (const grant of ['finance.balance.view', 'finance.review', 'finance.approve_for_posting']) {
    await setGrants([marker, 'finance.view', 'finance.treasury.view', grant]);
    await assertBootstrapDenied();
  }
  assert.equal(hasEffectiveCapability({ permissions: [marker, 'finance.create_drafts'], organizationRole: 'owner' }, 'finance.balance.view'), false);
  await setGrants([marker]);
  await denied('transactions-summary', 'finance.view');
  assert.equal((await canManageFinanceBootstrap(uid, org, entity)).canApply, false, 'Marker alone cannot unlock legacy catalogs');
  await setGrants([marker, 'finance.manage']);
  await context('transactions-summary', 'finance.view');
  await context('count-sessions-create', 'finance.create_drafts');
  assert.equal(hasEffectiveCapability({ permissions: [marker, 'finance.manage'] }, 'finance.balance.view'), true);
  await db.doc(`users/${uid}`).update({ ecosystemSessionVersion: 2 });
  await assert.rejects(() => context('transactions-summary', 'finance.view'), (error: any) => error.status === 401);
  // Existing memberships keep the deployed compatibility behavior.
  assert.equal(hasEffectiveCapability({ organizationRole: 'owner', permissions: [] }, 'finance.manage'), true);
  assert.equal(hasEffectiveCapability({ isGlobalAccess: true, permissions: [marker] }, 'finance.balance.view'), true);
  console.log('PASS: individual member grants, role non-escalation, Count/treasury separation, balance combination, scope and stale-session denial on Firestore emulator');
} finally { admin.auth.verifyIdToken = verify; }
