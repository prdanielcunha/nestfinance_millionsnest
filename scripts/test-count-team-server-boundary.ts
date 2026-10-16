import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertCountTeamDraftBoundary, assertCountTeamReadBoundary, isAllowedCountTeamDraftOperation, isAllowedCountTeamReadOperation, isExplicitCountOnlySession } from '../server/vercel-handlers/finance/countTeamOperationPolicy.js';

const count = { granted: true, organizationRole: 'member', roles: ['count_team'], permissions: ['finance.view', 'finance.create_drafts'] };
const volunteer = { ...count, roles: ['voluntário'] };
const noncount = { ...count, roles: ['tesoureiro'] };
const dualRole = { ...count, roles: ['conferente', 'financeiro'] };
const elevated = { ...count, permissions: [...count.permissions, 'finance.review'] };
const global = { ...count, isGlobalAccess: true };
const owner = { ...count, organizationRole: 'owner' };
const noSession = { ...count, granted: false };

assert.equal(isExplicitCountOnlySession(count), true);
assert.equal(isExplicitCountOnlySession(volunteer), true);
for (const session of [noncount, dualRole, elevated, global, owner, noSession]) {
  assert.equal(isExplicitCountOnlySession(session), false, 'Actual treasury/admin authority must retain access');
}
for (const operation of [
  'count-sessions-create', 'count-sessions-save-first-count',
  'count-sessions-start-second-count', 'count-sessions-submit-second-count',
  'count-sessions-start-recount', 'count-sessions-submit-recount',
  'count-sessions-detail', 'count-captures-start', 'count-captures-apply-to-count',
  'count-free-form-captures-finalize', 'count-paper-forms-detail',
  'voice-transcription-create', 'journey-metrics-record',
]) {
  assert.equal(isAllowedCountTeamDraftOperation(operation), true, operation);
  assert.doesNotThrow(() => assertCountTeamDraftBoundary(count, operation));
}
for (const operation of [
  undefined, null, {}, 'transactions-create-draft',
  'transactions-create-and-submit', 'transactions-remove-batch',
  'universal-evidence-start', 'universal-evidence-finalize',
  'count-sessions-create-proposed-drafts', 'accountant-package-export',
]) {
  assert.equal(isAllowedCountTeamDraftOperation(operation), false, String(operation));
  assert.throws(() => assertCountTeamDraftBoundary(count, operation),
    (error: unknown) => (error as { status: number; error: string }).status === 403 &&
      (error as { status: number; error: string }).error === 'FORBIDDEN_TREASURY_ROLE_REQUIRED');
}
assert.doesNotThrow(() => assertCountTeamDraftBoundary(dualRole, 'transactions-create-draft'));
assert.doesNotThrow(() => assertCountTeamDraftBoundary(owner, 'transactions-create-draft'));

const readableCountResources = [
  'count-sessions-list',
  'count-sessions-detail',
  'count-paper-forms-detail',
  'count-captures-detail',
];
for (const operation of readableCountResources) {
  assert.equal(isAllowedCountTeamReadOperation(operation), true, operation);
  assert.doesNotThrow(() => assertCountTeamReadBoundary(count, operation));
  assert.doesNotThrow(() => assertCountTeamReadBoundary(volunteer, operation));
}
for (const operation of [
  undefined, null, {}, '', 'count-sessions-proposal-preview',
  'count-sessions-create-proposed-drafts', 'accounts-list',
  'transactions-list', 'transactions-detail', 'transactions-summary',
  'transaction-search', 'universal-evidence-list',
  'finance-hub-read-model', 'period-close-readiness',
  'reports-intelligence', 'audit-list', 'accountant-package-export',
]) {
  assert.equal(isAllowedCountTeamReadOperation(operation), false, String(operation));
  assert.throws(() => assertCountTeamReadBoundary(count, operation),
    (error: unknown) => (error as { status: number; error: string }).status === 403 &&
      (error as { status: number; error: string }).error === 'FORBIDDEN_TREASURY_ROLE_REQUIRED');
}
for (const session of [noncount, dualRole, elevated, global, owner, noSession]) {
  assert.doesNotThrow(() => assertCountTeamReadBoundary(session, 'transactions-list'),
    'Genuine finance authority must retain access; canonical capability checks still apply');
}

const gateway = readFileSync('api/finance-gateway.ts', 'utf8');
const resolver = readFileSync('server/vercel-handlers/finance/accessHelpers.ts', 'utf8');
assert.ok(gateway.includes('__nestFinanceResolvedGatewayOperation') && gateway.indexOf('__nestFinanceResolvedGatewayOperation') < gateway.indexOf('delete req.query.operation'), 'operation must be marked by gateway before deleting user query');
assert.ok(resolver.includes("if (requiredCapability === 'finance.create_drafts')") && resolver.includes('assertCountTeamDraftBoundary(sessionList'), 'guard must run on server after verified session');
assert.ok(resolver.indexOf('const sessionList = await resolveEcosystemSession') < resolver.indexOf('assertCountTeamDraftBoundary(sessionList'), 'never trust body/client roles');
assert.ok(resolver.includes("requiredCapability === 'finance.view'") && resolver.includes('assertCountTeamReadBoundary(sessionList, gatewayOperation)'), 'server read path must apply Count role restriction');
assert.ok(resolver.indexOf('const sessionList = await resolveEcosystemSession') < resolver.indexOf('assertCountTeamReadBoundary(sessionList'), 'read gate must run after verified canonical session');

console.log('✅ Count-only treasury read and mutation restrictions plus legacy compatibility passed');
