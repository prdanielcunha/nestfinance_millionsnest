import assert from 'node:assert/strict';
import { validateNestFinanceHandoffClaims } from '../src/lib/handoffContract.js';

const valid = {
  mn_app_id: 'nestfinance',
  mn_organization_id: 'org_123',
  mn_handoff_version: 1,
  mn_access_source: 'global_system_role',
  mn_session_version: 7,
};

assert.deepEqual(
  validateNestFinanceHandoffClaims(valid, 'org_123'),
  {
    organizationId: 'org_123',
    accessSource: 'global_system_role',
    sessionVersion: 7,
  },
);

assert.deepEqual(
  validateNestFinanceHandoffClaims({
    ...valid,
    mn_access_source: undefined,
  }),
  {
    organizationId: 'org_123',
    accessSource: null,
    sessionVersion: 7,
  },
);

for (const [name, claims, expectedOrg] of [
  ['wrong app', { ...valid, mn_app_id: 'musicscale' }, 'org_123'],
  ['wrong version', { ...valid, mn_handoff_version: 2 }, 'org_123'],
  ['missing session version', { ...valid, mn_session_version: undefined }, 'org_123'],
  ['invalid session version', { ...valid, mn_session_version: 0 }, 'org_123'],
  ['missing organization', { ...valid, mn_organization_id: '' }, null],
  ['organization mismatch', valid, 'org_other'],
  ['unsafe organization path', { ...valid, mn_organization_id: '../org_123' }, null],
] as const) {
  assert.throws(
    () => validateNestFinanceHandoffClaims(claims as Record<string, unknown>, expectedOrg),
    /HANDOFF_CLAIM_BINDING_INVALID/,
    name,
  );
}

console.log('✅ NestFinance handoff app/version/organization/session claim binding is strict.');
