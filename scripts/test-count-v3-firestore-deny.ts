import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const rules=readFileSync('firestore.rules','utf8');
const gateway=readFileSync('api/finance-gateway.ts','utf8');
for (const part of ['countVerificationSessions','countVerificationInvites']) {
  const selector=`match /financeEntities/{entityId}/${part}/{document=**} {`;
  const i=rules.indexOf(selector);
  assert.ok(i>=0, part+' needs an explicit server-only Firestore rule');
  const next=rules.indexOf('}',i);
  const body=rules.slice(i,next);
  assert.ok(body.includes('allow read, create, update, delete: if false;'),
    part+' must not expose financial figures, counter identities, secrets, or edits to browser clients');
  assert.equal((rules.match(new RegExp('match /financeEntities/\\{entityId\\}/'+part+'/\\{document=\\*\\*\\}', 'g'))||[]).length,1,
    'Only one explicit rule should govern '+part);
}
for (const op of ['count-verifications-create','count-verifications-join','count-verifications-submit','count-verifications-detail',
  'count-verifications-list','count-verifications-refresh-invite','count-verifications-reopen',
  'count-verifications-treasury-preview','count-verifications-accept-treasury-review']) {
  assert.ok(gateway.includes(`case '${op}':`), op+' must still use authenticated gateway');
}
console.log('✅ Count V3 blind evidence and invitation storage cannot be fetched/modified directly through Firestore SDK');
