import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertCountTeamCapabilityBoundary, assertCountTeamDraftBoundary, assertCountTeamReadBoundary, isAllowedCountTeamDraftOperation, isAllowedCountTeamReadOperation, isExplicitCountOnlySession } from '../server/vercel-handlers/finance/countTeamOperationPolicy.js';
import { hasEffectiveCapability } from '../server/vercel-handlers/finance/accessHelpers.js';

const count = { granted: true, organizationRole: 'member', roles: ['count_team'], permissions: ['finance.view', 'finance.create_drafts'] };
const volunteer = { ...count, roles: ['voluntário'] };
const noncount = { ...count, roles: ['tesoureiro'] };
const dualRole = { ...count, roles: ['conferente', 'financeiro'] };
const elevated = { ...count, permissions: [...count.permissions, 'finance.review'] };
const scopedCatalogManager = { ...count, permissions: [...count.permissions, 'finance.accounts.manage'] };
const global = { ...count, isGlobalAccess: true };
const owner = { ...count, organizationRole: 'owner' };
const noSession = { ...count, granted: false };

assert.equal(isExplicitCountOnlySession(count), true);
assert.equal(isExplicitCountOnlySession(volunteer), true);
for (const session of [noncount, dualRole, elevated, scopedCatalogManager, global, owner, noSession]) {
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

// A church title does not convey financial capabilities. Explicit responsibility
// is sourced from the verified Hub membership; the legacy generic grants are
// supported until dedicated count endpoints replace them.
const churchTreasurerCountOnly = {
  ...count, roles: ['tesoureiro'],
  permissions: [...count.permissions, 'finance.count.execute'],
};
const teamAdministratorCountOnly = {
  ...count, organizationRole: 'admin', roles: ['administrador de equipe'],
  permissions: [...count.permissions, 'finance.count.execute', 'organization.manage_team'],
};
const churchSecretaryFinance = {
  ...count, roles: ['secretária'],
  permissions: [...count.permissions, 'finance.review'],
};
const mixedResponsibilities = {
  ...churchTreasurerCountOnly,
  permissions: [...churchTreasurerCountOnly.permissions, 'finance.review'],
};

for (const person of [churchTreasurerCountOnly, teamAdministratorCountOnly]) {
  assert.equal(isExplicitCountOnlySession(person), true);
  assert.equal(hasEffectiveCapability(person, 'finance.review'), false);
  assert.equal(hasEffectiveCapability(person, 'finance.accounts.manage'), false);
  assert.equal(hasEffectiveCapability(person, 'organization.manage_entities'), false);
  assert.throws(() => assertCountTeamCapabilityBoundary(person, 'finance.review'),
    (error: unknown) => (error as {status: number}).status === 403);
  assert.throws(() => assertCountTeamCapabilityBoundary(person, 'finance.manage'),
    (error: unknown) => (error as {status: number}).status === 403);
  assert.doesNotThrow(() => assertCountTeamCapabilityBoundary(person, 'finance.view'));
  assert.doesNotThrow(() => assertCountTeamCapabilityBoundary(person, 'finance.create_drafts'));
  assert.throws(() => assertCountTeamReadBoundary(person, 'transactions-summary'),
    (error: unknown) => (error as {status: number}).status === 403);
  assert.throws(() => assertCountTeamDraftBoundary(person, 'transactions-create-draft'),
    (error: unknown) => (error as {status: number}).status === 403);
}
assert.equal(isExplicitCountOnlySession(churchSecretaryFinance), false);
assert.equal(isExplicitCountOnlySession(mixedResponsibilities), false);
const unknownGrant = {
  ...churchTreasurerCountOnly,
  permissions: [...churchTreasurerCountOnly.permissions, 'finance.balance.view'],
};
assert.equal(isExplicitCountOnlySession(unknownGrant), false, 'Extra grant disables Count-only marker until the fine-grained contract is certified');
assert.equal(isExplicitCountOnlySession({
  ...churchTreasurerCountOnly,
  permissions: ['finance.count.view'],
}), true, 'View-only Count responsibility is still independent of job title');

assert.equal(hasEffectiveCapability(mixedResponsibilities, 'finance.review'), true);

// Role classification has no fixed team size: the same signed-invariant policy
// applies to 1, 2, 5 or 20 workers, with no records or identities shared.
for (const size of [1, 2, 5, 20]) {
  const actors = Array.from({length: size}, (_, i) => ({
    ...churchTreasurerCountOnly, actorId: `synthetic_${i}`,
  }));
  assert.equal(actors.length, size);
  for (const actor of actors) assert.equal(isExplicitCountOnlySession(actor), true);
}

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
for (const session of [noncount, dualRole, elevated, scopedCatalogManager, global, owner, noSession]) {
  assert.doesNotThrow(() => assertCountTeamReadBoundary(session, 'transactions-list'),
    'Genuine finance authority must retain access; canonical capability checks still apply');
}

const gateway = readFileSync('api/finance-gateway.ts', 'utf8');
const resolver = readFileSync('server/vercel-handlers/finance/accessHelpers.ts', 'utf8');
const bootstrap = readFileSync('server/vercel-handlers/finance/bootstrapAvailabilityHelper.ts', 'utf8');
assert.ok(bootstrap.includes('isExplicitCountOnlySession(session)') && bootstrap.includes('COUNT_TEAM_TREASURY_ACCESS_FORBIDDEN'), 'legacy catalog/bootstrap helper must deny Count-only before returning treasury catalog rows');
for (const readFile of ['accountsList.ts', 'fundsList.ts', 'categoriesList.ts']) {
  const source = readFileSync('server/vercel-handlers/finance/' + readFile, 'utf8');
  assert.ok(source.includes('requireFinanceEntityAccess('), readFile + ' must keep checked entity authorization through the guarded helper');
}

assert.ok(gateway.includes('__nestFinanceResolvedGatewayOperation') && gateway.indexOf('__nestFinanceResolvedGatewayOperation') < gateway.indexOf('delete req.query.operation'), 'operation must be marked by gateway before deleting user query');
assert.ok(resolver.includes('assertCountTeamCapabilityBoundary(sessionList, requiredCapability)'), 'verified Count-only responsibility must guard every capability');
assert.ok(resolver.includes("if (requiredCapability === 'finance.create_drafts')") && resolver.includes('assertCountTeamDraftBoundary(sessionList'), 'guard must run on server after verified session');
assert.ok(resolver.indexOf('const sessionList = await resolveEcosystemSession') < resolver.indexOf('assertCountTeamDraftBoundary(sessionList'), 'never trust body/client roles');
assert.ok(resolver.includes("requiredCapability === 'finance.view'") && resolver.includes('assertCountTeamReadBoundary(sessionList, gatewayOperation)'), 'server read path must apply Count role restriction');
assert.ok(resolver.indexOf('const sessionList = await resolveEcosystemSession') < resolver.indexOf('assertCountTeamReadBoundary(sessionList'), 'read gate must run after verified canonical session');

console.log('✅ Count-only titles, canonical responsibility, elevated capability denial and legacy access passed');
