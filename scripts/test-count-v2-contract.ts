import assert from 'node:assert/strict';
import {
  validateCountV2Snapshot,
  compareCountV2Snapshots,
  legacyCountToV2,
} from '../shared/finance/countV2Contract.js';

const make = (operatorId: string, lines: unknown[], verificationMode = 'independent', controlTotalCents: number | null = 47_000) => ({
  schemaVersion: 2,
  financeEntityId: 'example_church',
  sessionId: 'synthetic_session',
  version: 1,
  verificationMode,
  operatorId,
  countedBy: 'Pessoa que contou no papel',
  controlTotalCents,
  lines,
});
const line = (lineId: string, purpose: string, paymentMethod: string, amountCents: unknown) => ({
  lineId, purpose, paymentMethod, amountCents, classificationSource: 'explicit',
});

// C01: the handwritten total controls the sum and is not a third income line.
const first = make('operator_a', [
  line('first', 'tithe', 'cash', 35_000),
  line('second', 'offering', 'cash', 12_000),
]);
const review = validateCountV2Snapshot(first);
assert.equal(review.totalCents, 47_000);
assert.equal(review.controlTotalMatches, true);
assert.equal(review.snapshot.lines.length, 2);
assert.equal(review.canSendForReview, true);

// C04: explicit 0 is not an empty or unknown value.
const zero = make('operator_a', [line('zero', 'tithe', 'cash', 0)], 'independent', 0);
assert.equal(validateCountV2Snapshot(zero).totalCents, 0);
assert.throws(() => validateCountV2Snapshot(make('operator_a', [line('invalid', 'tithe', 'cash', null)])), /CONTRIBUTION_INVALID_AMOUNT/);

// C05: matching grand totals with different categories are still divergent.
const swapped = make('operator_b', [
  line('first', 'tithe', 'cash', 12_000),
  line('second', 'offering', 'cash', 35_000),
]);
const mismatch = compareCountV2Snapshots(first, swapped);
assert.equal(mismatch.firstTotalCents, 47_000);
assert.equal(mismatch.secondTotalCents, 47_000);
assert.equal(mismatch.matched, false);
assert.equal(mismatch.differences.length, 2);
assert.equal(compareCountV2Snapshots(first, make('operator_b', first.lines)).matched, true);

// C06: same operator is forbidden for independent counts.
assert.throws(() => compareCountV2Snapshots(first, make('operator_a', first.lines)), /DISTINCT_COUNTER_REQUIRED/);

// C07: assisted can be recorded but not falsely passed as independent.
const assisted = make('operator_a', first.lines, 'assisted');
assert.equal(validateCountV2Snapshot(assisted).snapshot.verificationMode, 'assisted');
assert.throws(() => compareCountV2Snapshots(first, assisted), /NOT_INDEPENDENT/);

const pixWithoutPurpose = make('operator_a', [{
  lineId: 'legacy_pix', purpose: 'unclassified', paymentMethod: 'pix',
  amountCents: 20_000, classificationSource: 'legacy_unclassified',
}], 'independent', 20_000);
assert.deepEqual(validateCountV2Snapshot(pixWithoutPurpose).blockers, ['UNKNOWN_PURPOSE']);
assert.equal(validateCountV2Snapshot(pixWithoutPurpose).canSendForReview, false);
const wrongWrittenTotal = { ...first, controlTotalCents: 48_000 };
assert.deepEqual(validateCountV2Snapshot(wrongWrittenTotal).blockers, ['CONTROL_TOTAL_MISMATCH']);
assert.throws(() => validateCountV2Snapshot({ ...first, lines: [...first.lines, first.lines[0]] }), /DUPLICATE_LINE/);
assert.throws(() => validateCountV2Snapshot({ ...first, financeEntityId: '' }), /FINANCE_ENTITY_ID/);
assert.throws(() => compareCountV2Snapshots(first, { ...first, operatorId: 'operator_b', financeEntityId: 'other_church' }), /CONTEXT_MISMATCH/);

const legacy = legacyCountToV2({
  financeEntityId: 'example_church',
  sessionId: 'synthetic_session',
  operatorId: 'operator_a',
  version: 1,
  entries: [
    { type: 'tithe', channel: 'cash', method: 'total', totalCents: 35_000, denominations: {} },
    { type: 'offering', channel: 'cash', method: 'total', totalCents: 12_000, denominations: {} },
    { type: 'pix', channel: 'pix', method: 'total', totalCents: 20_000, denominations: {} },
  ],
});
assert.equal(legacy.totalCents, 67_000);
assert.equal(legacy.purposeUnclassifiedCents, 20_000);
assert.equal(legacy.snapshot.controlTotalCents, null);
assert.ok(legacy.blockers.includes('UNKNOWN_PURPOSE'));
assert.ok(!legacy.snapshot.lines.some((item) => item.evidenceId || item.accountId || item.sourceRegion),
  'Legacy data must not invent missing references');

console.log('✅ Count v2 contract: C01 C04 C05 C06 C07, Pix legacy and control totals passed');
