import assert from 'node:assert/strict';
import {
  legacyCountToContributionAllocations,
  normalizeContributionAllocations,
  summarizeContributions,
  verifyContributionTotal,
  type ContributionAllocation,
} from '../shared/finance/contributionBreakdown.js';

const amount = (purpose: ContributionAllocation['purpose'],
  receiptMethod: ContributionAllocation['receiptMethod'], amountCents: number,
  classificationSource: ContributionAllocation['classificationSource'] = 'explicit',
): ContributionAllocation => ({ purpose, receiptMethod, amountCents, classificationSource });

// Synthetic test: split purpose independently of payment method.
const mixed = [
  amount('tithe', 'cash', 10_000),
  amount('offering', 'cash', 5_000),
  amount('tithe', 'pix', 8_000),
  amount('offering', 'pix', 2_000),
  amount('other', 'card', 2_500),
  amount('tithe', 'bank_transfer', 1_000),
];
const summary = verifyContributionTotal(mixed, 28_500);
assert.equal(summary.totalCents, 28_500);
assert.equal(summary.byPurpose.tithe, 19_000);
assert.equal(summary.byPurpose.offering, 7_000);
assert.equal(summary.byPurpose.other, 2_500);
assert.equal(summary.byReceiptMethod.cash, 15_000);
assert.equal(summary.byReceiptMethod.pix, 10_000);
assert.equal(summary.byReceiptMethod.card, 2_500);
assert.equal(summary.byReceiptMethod.bank_transfer, 1_000);
assert.equal(summary.requiresPurposeReview, false);

const legacy = [
  { type: 'tithe' as const, channel: 'cash' as const, method: 'total' as const, totalCents: 10_000, denominations: {} },
  { type: 'offering' as const, channel: 'cash' as const, method: 'total' as const, totalCents: 5_000, denominations: {} },
  { type: 'pix' as const, channel: 'pix' as const, method: 'total' as const, totalCents: 10_000, denominations: {} },
];
const converted = legacyCountToContributionAllocations(legacy);
const legacySummary = verifyContributionTotal(converted, 25_000);
assert.equal(legacySummary.byPurpose.tithe, 10_000);
assert.equal(legacySummary.byPurpose.offering, 5_000);
assert.equal(legacySummary.byPurpose.unclassified, 10_000,
  'Legacy Pix cannot be silently classified as tithe or offering');
assert.equal(legacySummary.byReceiptMethod.pix, 10_000);
assert.equal(legacySummary.unclassifiedCents, 10_000);
assert.equal(legacySummary.requiresPurposeReview, true);
assert.equal(converted[2].classificationSource, 'legacy_unclassified');
assert.deepEqual(legacy[2], { type: 'pix', channel: 'pix', method: 'total', totalCents: 10_000, denominations: {} },
  'Conversion must never mutate the old record');

assert.deepEqual(summarizeContributions([]).totalCents, 0);
assert.throws(() => verifyContributionTotal(mixed, 28_499), /CONTRIBUTION_EXPECTED_TOTAL_MISMATCH/);
assert.throws(() => normalizeContributionAllocations([amount('tithe', 'cash', -1)]),
  /CONTRIBUTION_INVALID_AMOUNT/);
assert.throws(() => normalizeContributionAllocations([amount('tithe', 'cash', 1.5)]),
  /CONTRIBUTION_INVALID_AMOUNT/);
assert.throws(() => normalizeContributionAllocations([{...amount('tithe', 'cash', 100), classificationSource: 'legacy_unclassified'}]),
  /CONTRIBUTION_LEGACY_PURPOSE_NOT_VERIFIED/);
assert.throws(() => normalizeContributionAllocations([{...amount('tithe', 'cash', 100), receiptMethod: 'unknown'}]),
  /CONTRIBUTION_INVALID_DIMENSIONS/);
assert.throws(() => legacyCountToContributionAllocations([
  {...legacy[2], channel: 'cash' as const},
]), /CONTRIBUTION_LEGACY_DIMENSIONS_INCONSISTENT/);
assert.throws(() => summarizeContributions([
  amount('tithe', 'cash', 10_000_000_000),
  amount('offering', 'pix', 10_000_000_000),
  amount('other', 'cash', 1),
]), /CONTRIBUTION_TOTAL_OUT_OF_RANGE/);
assert.throws(() => normalizeContributionAllocations(Array.from({ length: 101 }, () => amount('tithe','cash',1))),
  /CONTRIBUTION_INVALID_ALLOCATION_LIST/);

console.log('✅ Contribution purpose × receipt method and safe legacy Pix verification passed');
