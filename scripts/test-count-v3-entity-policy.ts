import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCountVerificationPolicy, evaluateCountVerifications } from '../shared/finance/countVerificationPolicy.js';

const schema = normalizeCountVerificationPolicy({ minimumIndependentConfirmations: 5, maximumParticipants: 20, allowAssisted: true });
assert.equal(schema.minimumIndependentConfirmations, 5);
assert.equal(schema.maximumParticipants, 20);
assert.equal(schema.allowAssisted, true);
assert.equal(schema.singleCounterRequiresTreasuryReview, true);
assert.deepEqual(normalizeCountVerificationPolicy({}), {
  policyVersion: 3, minimumIndependentConfirmations: 2,
  maximumParticipants: 20, allowAssisted: false,
  singleCounterRequiresTreasuryReview: true,
});
assert.equal(evaluateCountVerifications([], schema).requiredIndependentConfirmations, 5);
assert.throws(() => normalizeCountVerificationPolicy({ minimumIndependentConfirmations: 6, maximumParticipants: 5 }),
  /COUNT_INVALID_TEAM_CAPACITY/);

const get = readFileSync('server/vercel-handlers/finance/countVerificationPolicyGet.ts', 'utf8');
const update = readFileSync('server/vercel-handlers/finance/countVerificationPolicyUpdate.ts', 'utf8');
const create = readFileSync('server/vercel-handlers/finance/countVerificationsCreate.ts', 'utf8');
const gateway = readFileSync('api/finance-gateway.ts', 'utf8');
const settings = readFileSync('src/pages/finance/settings/FinanceSettingsPage.tsx', 'utf8');
const page = readFileSync('src/pages/finance/settings/CountVerificationPolicyPage.tsx', 'utf8');
const routes = readFileSync('src/app/router/index.tsx', 'utf8');
const service = readFileSync('src/services/countV3Service.ts', 'utf8');
for (const source of [get,update]) {
  assert.ok(source.includes('assertCountV3Enabled()'), 'Policy endpoint must be feature-gated');
  assert.ok(source.includes("resolveFinanceRequestContext(req, 'finance.manage')"),
    'Only finance managers may configure the count policy');
  assert.ok(source.includes("Cache-Control', 'private, no-store"),
    'Policy settings are private');
}
assert.ok(update.includes('expectedRevision') && update.includes('transaction.get(entityRef)') &&
  update.includes('countVerificationPolicyRevision: nextRevision'), 'Optimistic entity revision is atomic');
assert.ok(update.includes('COUNT_POLICY_REVISION_CONFLICT'), 'Concurrent admin writes must fail closed');
assert.ok(update.includes('stageCanonicalAuditRecord') && update.includes('stageFinanceFact'),
  'Every policy change must be auditable');
assert.ok(!update.includes('countSessions') && !update.includes('countVerificationSessions'),
  'Policy changes must not rewrite an in-progress or legacy count');
assert.ok(!update.includes('getTransactionsRef()') && !update.includes('getAccountsRef()'),
  'Policy changes must not touch treasury money');
assert.ok(create.includes('countV3PolicyFromEntity(context.financeEntity)'),
  'New count session snapshots the current versioned policy');
for(const operation of ['policy-get','policy-update']) {
  assert.ok(gateway.includes(`case 'count-verifications-${operation}':`));
  assert.ok(service.includes(`'count-verifications-${operation}'`));
}
assert.ok(routes.includes('APP_ROUTES.financeSettingsCountPolicy') && routes.includes("['finance.manage']"),
  'Settings screen route requires finance management');
assert.ok(settings.includes('COUNT_V3_UI_ENABLED') && settings.includes('countPolicyBody'),
  'Feature-gated settings are discoverable with explanation');
for (const str of ['Como sua igreja confere a contagem', 'How your church verifies counts', 'Cómo su iglesia verifica los conteos']) {
  assert.ok(page.includes(str), 'Settings description must be localized: '+str);
}
assert.ok(page.includes('COUNT_V3_UI_ENABLED') && page.includes('singleCounterRequiresTreasuryReview: true'),
  'View supports safe single-counter configuration while feature remains opt-in');
console.log('✅ Count v3 per-entity policy is versioned, audited, role-gated and future-session-only');
