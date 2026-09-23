import assert from 'node:assert/strict';
import { resolveHandoffBinding } from '../server/vercel-handlers/finance/accessHelpers.js';

assert.deepEqual(
  resolveHandoffBinding({ uid: 'direct-google-user' }),
  { bound: false, organizationId: null, sessionVersion: null },
  'direct Google sessions must remain supported without mn_* claims',
);

assert.deepEqual(
  resolveHandoffBinding({
    mn_app_id: 'nestfinance',
    mn_handoff_version: 1,
    mn_organization_id: 'org_a',
    mn_session_version: 7,
  }),
  { bound: true, organizationId: 'org_a', sessionVersion: 7 },
  'handoff sessions must carry complete signed binding',
);

for (const claims of [
  {
    mn_app_id: 'nestfinance',
    mn_handoff_version: 1,
    mn_organization_id: 'org_a',
  },
  {
    mn_app_id: 'nestfinance',
    mn_handoff_version: 1,
    mn_organization_id: 'org_a',
    mn_session_version: 0,
  },
  {
    mn_app_id: 'musicscale',
    mn_handoff_version: 1,
    mn_organization_id: 'org_a',
    mn_session_version: 7,
  },
  {
    mn_session_version: 7,
  },
]) {
  assert.throws(
    () => resolveHandoffBinding(claims as Record<string, unknown>),
    (error: any) => error?.status === 401 && error?.error === 'UNAUTHORIZED',
  );
}

console.log('✅ Finance API handoff binding rejects partial, stale-shape and cross-app claims while preserving direct Google sessions.');
