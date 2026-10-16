import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertCountV3Enabled,
  assertV3CanRead,
  countV3InviteHash,
  normalizeCountV3JoinCode,
  serializeV3Session,
  v3IsParticipant,
} from '../server/vercel-handlers/finance/countVerificationV3Common.js';
import {
  assertCountTeamDraftBoundary,
  assertCountTeamReadBoundary,
} from '../server/vercel-handlers/finance/countTeamOperationPolicy.js';

const originalFlag = process.env.NESTFINANCE_COUNT_V3_ENABLED;
try {
  delete process.env.NESTFINANCE_COUNT_V3_ENABLED;
  assert.throws(() => assertCountV3Enabled(), (error: unknown) =>
    (error as { status: number }).status === 404);
  process.env.NESTFINANCE_COUNT_V3_ENABLED = 'true';
  assert.doesNotThrow(() => assertCountV3Enabled());
  process.env.NESTFINANCE_COUNT_V3_ENABLED = 'TRUE';
  assert.throws(() => assertCountV3Enabled(), (error: unknown) =>
    (error as { status: number }).status === 404);
} finally {
  if (originalFlag === undefined) delete process.env.NESTFINANCE_COUNT_V3_ENABLED;
  else process.env.NESTFINANCE_COUNT_V3_ENABLED = originalFlag;
}

assert.equal(normalizeCountV3JoinCode('23456-789AB'), '23456789AB');
assert.equal(countV3InviteHash('23456789AB'), countV3InviteHash('23456789AB'));
assert.notEqual(countV3InviteHash('23456789AB'), '23456789AB');
assert.throws(() => normalizeCountV3JoinCode('hello world'), /COUNT_INVALID_JOIN_CODE/);

const participantSession = {
  id: 'cnt_0123456789abcdef01234567',
  organizationId: 'org_1',
  financeEntityId: 'church_1',
  serviceLabel: 'Culto',
  serviceDate: '2026-10-16',
  status: 'pending',
  version: 3,
  policySnapshot: { minimumIndependentConfirmations: 2, maximumParticipants: 20 },
  participants: ['first', 'second'],
  confirmations: [
    { verificationId: 'verification_12345678', mode: 'independent', operatorUid: 'first',
      entries: [{ type: 'offering', method: 'total', totalCents: 25000 }] },
  ],
};
assert.equal(v3IsParticipant(participantSession, 'first'), true);
assert.equal(v3IsParticipant(participantSession, 'unrelated'), false);
assert.throws(() => assertV3CanRead(participantSession, 'unrelated', true),
  (error: unknown) => (error as {status:number}).status === 403);
assert.doesNotThrow(() => assertV3CanRead(participantSession, 'unrelated', false));
const peerView = serializeV3Session(participantSession, 'second', false);
assert.equal(peerView.materialHidden, true);
assert.deepEqual(peerView.ownConfirmations, [], 'Blind second counter cannot see first money');
assert.equal(peerView.confirmedTotalCents, null);
const firstView = serializeV3Session(participantSession, 'first', false);
assert.equal(firstView.ownConfirmations.length, 1);
assert.equal(serializeV3Session({ ...participantSession, createdByUid: 'first' }, 'first', false).canManageInvite, true);
assert.equal(serializeV3Session({ ...participantSession, createdByUid: 'first' }, 'second', false).canManageInvite, false);
assert.equal(serializeV3Session({ ...participantSession, createdByUid: 'first', status: 'matched' }, 'first', false).canManageInvite, false);
assert.equal(serializeV3Session(participantSession, 'second', true).ownConfirmations.length, 1);

const onlyCount = { granted: true, organizationRole: 'member',
  permissions: ['finance.count.execute', 'finance.view', 'finance.create_drafts'] };
const viewOnly = { ...onlyCount, permissions: ['finance.count.view', 'finance.view', 'finance.create_drafts'] };
for (const name of ['create', 'join', 'submit']) {
  assert.doesNotThrow(() => assertCountTeamDraftBoundary(onlyCount, 'count-verifications-' + name));
  assert.throws(() => assertCountTeamDraftBoundary(viewOnly, 'count-verifications-' + name),
    (error: unknown) => (error as {status:number}).status === 403);
}
for (const name of ['detail', 'list']) {
  assert.doesNotThrow(() => assertCountTeamReadBoundary(onlyCount, 'count-verifications-' + name));
  assert.doesNotThrow(() => assertCountTeamReadBoundary(viewOnly, 'count-verifications-' + name));
}
assert.throws(() => assertCountTeamReadBoundary(onlyCount, 'accounts-list'));

// A participant does not require the shared finance.view/create_drafts grants
// to access Count v3. They are not treasury permissions and never authorize posting.
const countExecuteOnly = { granted: true, organizationRole: 'member',
  permissions: ['finance.count.execute'] };
const countViewOnly = { granted: true, organizationRole: 'member',
  permissions: ['finance.count.view'] };
const deniedTeamAdmin = { granted: true, organizationRole: 'admin',
  permissions: ['organization.manage_team'] };
const { hasFinanceCapability } = await import('../server/vercel-handlers/finance/accessHelpers.js');
for (const item of [countExecuteOnly, countViewOnly]) {
  assert.equal(hasFinanceCapability(item, 'finance.count.view'), true);
  assert.equal(hasFinanceCapability(item, 'finance.view'), false);
  assert.equal(hasFinanceCapability(item, 'finance.create_drafts'), false);
  assert.equal(hasFinanceCapability(item, 'finance.approve_for_posting'), false);
}
assert.equal(hasFinanceCapability(countExecuteOnly, 'finance.count.execute'), true);
assert.equal(hasFinanceCapability(countViewOnly, 'finance.count.execute'), false);
assert.equal(hasFinanceCapability(deniedTeamAdmin, 'finance.count.execute'), false);
assert.doesNotThrow(() => assertCountTeamDraftBoundary(countExecuteOnly, 'count-verifications-submit'));
assert.doesNotThrow(() => assertCountTeamReadBoundary(countViewOnly, 'count-verifications-detail'));


const gateway = readFileSync('api/finance-gateway.ts', 'utf8');
for (const [operation, filename] of [
  ['create', 'countVerificationsCreate.ts'], ['join', 'countVerificationsJoin.ts'],
  ['submit', 'countVerificationsSubmit.ts'], ['refresh-invite', 'countVerificationsRefreshInvite.ts'], ['detail', 'countVerificationsDetail.ts'],
  ['list', 'countVerificationsList.ts'],
]) {
  const content = readFileSync('server/vercel-handlers/finance/' + filename, 'utf8');
  assert.ok(gateway.includes(`case 'count-verifications-${operation}':`));
  assert.ok(content.includes('assertCountV3Enabled()'), filename + ' must fail closed by default');
  assert.ok(content.includes('resolveFinanceRequestContext('), filename + ' must use canonical auth');
  const canonicalGrant = ['create','join','submit','refresh-invite'].includes(operation) ? 'finance.count.execute' : 'finance.count.view';
  assert.ok(content.includes(`resolveFinanceRequestContext(req, '${canonicalGrant}')`),
    filename + ' must require Count-specific access, not general finance drafts');
  assert.ok(content.includes("Cache-Control', 'private, no-store"), filename + ' must disable response cache');
}
const create = readFileSync('server/vercel-handlers/finance/countVerificationsCreate.ts', 'utf8');
const join = readFileSync('server/vercel-handlers/finance/countVerificationsJoin.ts', 'utf8');
const inviteRefresh = readFileSync('server/vercel-handlers/finance/countVerificationsRefreshInvite.ts', 'utf8');
assert.ok(inviteRefresh.includes('session.createdByUid !== uid'), 'Invite replacement must be creator-only');
assert.ok(inviteRefresh.includes('transaction.delete('), 'Prior invite must be revoked transactionally');
assert.ok(inviteRefresh.includes("resolveFinanceRequestContext(req, 'finance.count.execute')"), 'Only Count execution can refresh invitations');
const submit = readFileSync('server/vercel-handlers/finance/countVerificationsSubmit.ts', 'utf8');
assert.ok(create.includes('countV3PolicyFromEntity(context.financeEntity)'), 'Quorum must derive from persisted entity policy');
assert.ok(join.includes('participants.includes(uid)') && join.includes('transaction.update(sessionRef'),
  'Invitations must admit authenticated users transactionally');
assert.ok(submit.includes('evaluateCountVerifications(next, policySnapshot)'));
assert.ok(submit.includes('session.status !== \'pending\''));
assert.ok(!submit.includes('getTransactionsRef()') && !submit.includes('getAccountsRef()'));
assert.ok(!create.includes('getTransactionsRef()') && !join.includes('getTransactionsRef()'));
console.log('✅ Count V3 feature gate, invite integrity, blind reads, RBAC and no ledger side effects');
