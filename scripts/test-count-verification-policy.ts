import assert from 'node:assert/strict';
import {
  evaluateCountVerifications,
  normalizeCountVerificationPolicy,
  type CountVerificationEvidence,
} from '../shared/finance/countVerificationPolicy.js';

const money = [
  { type: 'tithe' as const, method: 'total' as const, totalCents: 30000 },
  { type: 'offering' as const, method: 'total' as const, totalCents: 17000 },
];

const member = (index: number): CountVerificationEvidence => ({
  verificationId: `verification_${index}`,
  mode: 'independent',
  operatorUid: `verified_user_${index}`,
  independentCounterUid: `verified_user_${index}`,
  entries: money,
});

const defaultPolicy = normalizeCountVerificationPolicy({});
assert.equal(defaultPolicy.minimumIndependentConfirmations, 2);
assert.equal(defaultPolicy.allowAssisted, false);
assert.equal(defaultPolicy.maximumParticipants, 20);

assert.deepEqual(evaluateCountVerifications([], defaultPolicy), {
  status: 'pending',
  independentConfirmed: 0,
  assistedRecorded: 0,
  requiredIndependentConfirmations: 2,
  totalCents: null,
  differencesFound: false,
});
assert.equal(evaluateCountVerifications([member(1)], defaultPolicy).status, 'pending');
assert.equal(evaluateCountVerifications([member(1), member(2)], defaultPolicy).status, 'matched');
assert.equal(evaluateCountVerifications([member(1), member(2)], defaultPolicy).totalCents, 47000);

for (const size of [1, 2, 5, 20]) {
  const policy = normalizeCountVerificationPolicy({ minimumIndependentConfirmations: size, maximumParticipants: size });
  const confirmations = Array.from({ length: size }, (_, i) => member(i));
  const evaluated = evaluateCountVerifications(confirmations, policy);
  assert.equal(evaluated.independentConfirmed, size);
  assert.equal(evaluated.status, size === 1 ? 'requires_treasury_review' : 'matched');
  if (size > 1) assert.equal(evaluateCountVerifications(confirmations.slice(0, -1), policy).status, 'pending');
}

const divergence = { ...member(2), entries: [
  { type: 'tithe' as const, method: 'total' as const, totalCents: 17000 },
  { type: 'offering' as const, method: 'total' as const, totalCents: 30000 },
] };
const unequal = evaluateCountVerifications([member(1), divergence], defaultPolicy);
assert.equal(unequal.status, 'divergent', 'Equal grand totals with swapped purposes must diverge');
assert.equal(unequal.differencesFound, true);

const assisted = {
  verificationId: 'assisted_1',
  mode: 'assisted' as const,
  operatorUid: 'authenticated_assistant',
  physicalCounterLabel: 'Pessoa que contou em papel',
  entries: money,
};
assert.throws(() => evaluateCountVerifications([assisted], defaultPolicy), /COUNT_ASSISTED_NOT_ALLOWED/);
const assistedPolicy = normalizeCountVerificationPolicy({ allowAssisted: true });
const mixed = evaluateCountVerifications([member(1), assisted], assistedPolicy);
assert.equal(mixed.status, 'pending', 'A physical assisted count is not an independent digital confirmation');
assert.equal(mixed.assistedRecorded, 1);
assert.equal(evaluateCountVerifications([member(1), member(2), assisted], assistedPolicy).status, 'matched');

assert.throws(() => evaluateCountVerifications([member(1), member(1)], defaultPolicy), /COUNT_DUPLICATE_VERIFICATION/);
assert.throws(() => evaluateCountVerifications([member(1), { ...member(2), operatorUid: 'verified_user_1', independentCounterUid: 'verified_user_1' }], defaultPolicy), /COUNT_INDEPENDENT_COUNTER_ALREADY_RECORDED/);
assert.throws(() => evaluateCountVerifications([{ ...member(1), independentCounterUid: 'reported_other_person' }], defaultPolicy), /COUNT_INDEPENDENCE_NOT_AUTHENTICATED/);
assert.throws(() => evaluateCountVerifications([member(1), member(2), member(3)], normalizeCountVerificationPolicy({ maximumParticipants: 2 })), /COUNT_TEAM_CAPACITY_EXCEEDED/);
for (const quorum of [0, 21, 1.5, NaN, '2']) {
  assert.throws(() => normalizeCountVerificationPolicy({ minimumIndependentConfirmations: quorum }), /COUNT_INVALID_CONFIRMATION_QUORUM/);
}
assert.throws(() => normalizeCountVerificationPolicy({ minimumIndependentConfirmations: 5, maximumParticipants: 2 }), /COUNT_INVALID_TEAM_CAPACITY/);
assert.throws(() => normalizeCountVerificationPolicy({ allowAssisted: 'yes' }), /COUNT_INVALID_ASSISTED_POLICY/);

console.log('✅ Count verification quorum, 1/2/5/20 people, independence, assisted mode and divergence passed');
