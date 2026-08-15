import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { COUNT_CASH_ENTRY_TYPES, COUNT_DENOMINATIONS_CENTS } from '../shared/finance/count.js';
import {
  COUNT_CAPTURE_DENOMINATION_CELL_KEYS,
  buildCountCaptureDenominationCandidatesFromProvider,
  buildUnresolvedCountCaptureDenominationCandidates,
  calculateReviewedDenominationSubtotals,
  getCountCaptureDenominationRegion,
  parseCountCaptureQuantityObservation,
  parseCountCaptureDenominationCellKey,
  validateCountCaptureDenominationProviderResult,
  validateCountCaptureDenominationRegionInputs,
  validateCountCaptureDenominationReview,
  type CountCaptureReviewedDenomination,
} from '../shared/finance/countCaptureDenominations.js';

assert.equal(COUNT_CAPTURE_DENOMINATION_CELL_KEYS.length, COUNT_CASH_ENTRY_TYPES.length * COUNT_DENOMINATIONS_CENTS.length);
assert.equal(COUNT_CAPTURE_DENOMINATION_CELL_KEYS.length, 33);
assert.equal(new Set(COUNT_CAPTURE_DENOMINATION_CELL_KEYS).size, 33);
for (const cellKey of COUNT_CAPTURE_DENOMINATION_CELL_KEYS) {
  const identity = parseCountCaptureDenominationCellKey(cellKey);
  assert.ok(identity);
  const region = getCountCaptureDenominationRegion(1, identity!.entryType, identity!.denominationCents);
  assert.ok(region && region.x >= 0 && region.y >= 0 && region.width > 0 && region.height > 0 && region.x + region.width <= 1 && region.y + region.height <= 1);
}
assert.equal(getCountCaptureDenominationRegion(2, 'tithe', 10000), null);

assert.deepEqual(parseCountCaptureQuantityObservation('0'), { kind: 'recognized', quantity: 0 });
assert.deepEqual(parseCountCaptureQuantityObservation('12'), { kind: 'recognized', quantity: 12 });
assert.deepEqual(parseCountCaptureQuantityObservation(''), { kind: 'blank', quantity: null });
assert.deepEqual(parseCountCaptureQuantityObservation('1x'), { kind: 'ambiguous', quantity: null });
assert.deepEqual(parseCountCaptureQuantityObservation('-1'), { kind: 'ambiguous', quantity: null });
assert.deepEqual(parseCountCaptureQuantityObservation('1000001'), { kind: 'invalid', quantity: null });

const provider = validateCountCaptureDenominationProviderResult({ fields: COUNT_CAPTURE_DENOMINATION_CELL_KEYS.map((cellKey, index) => ({
  cellKey,
  status: index === 0 || index === 1 ? 'recognized' : index === 11 ? 'recognized' : index === 22 ? 'unreadable' : 'blank',
  observation: index === 0 ? '2' : index === 1 ? '0' : index === 11 ? '1x' : '',
})) });
const unresolved = buildUnresolvedCountCaptureDenominationCandidates(1);
const regions = Object.fromEntries(unresolved.map((candidate) => [candidate.cellKey, candidate.region]));
const candidates = buildCountCaptureDenominationCandidatesFromProvider({ provider, regions });
assert.deepEqual(candidates.slice(0, 2).map((candidate) => [candidate.state, candidate.quantity]), [['recognized', 2], ['recognized', 0]]);
assert.equal(candidates[11].state, 'uncertain');
assert.equal(candidates[11].quantity, null);
assert.equal(candidates[22].state, 'unresolved');
assert.equal(candidates[22].quantity, null);
assert.ok(candidates.every((candidate) => candidate.confidence === null));

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
const jpegSha = createHash('sha256').update(jpeg).digest('hex');
const regionInputs = COUNT_CAPTURE_DENOMINATION_CELL_KEYS.map((cellKey) => ({ cellKey, mimeType: 'image/jpeg', dataBase64: jpeg.toString('base64'), sha256: jpegSha }));
assert.equal(validateCountCaptureDenominationRegionInputs(regionInputs).length, 33);

const reviewInput = COUNT_CAPTURE_DENOMINATION_CELL_KEYS.map((cellKey) => {
  if (cellKey === 'tithe:10000') return { cellKey, decision: 'corrected', quantity: 3 };
  if (cellKey === 'tithe:5000') return { cellKey, decision: 'confirmed', quantity: 0 };
  if (cellKey === 'offering:10000') return { cellKey, decision: 'corrected', quantity: 4 };
  if (cellKey === 'other:10000') return { cellKey, decision: 'unreadable', quantity: null };
  return { cellKey, decision: 'blank', quantity: null };
});
assert.equal(validateCountCaptureDenominationReview(reviewInput).length, 33);
const reviewed: CountCaptureReviewedDenomination[] = validateCountCaptureDenominationReview(reviewInput).map((row) => {
  const identity = parseCountCaptureDenominationCellKey(row.cellKey)!;
  const candidate = candidates.find((item) => item.cellKey === row.cellKey)!;
  return { ...row, ...identity, candidateQuantity: candidate.quantity, candidateState: candidate.state };
});
const subtotals = calculateReviewedDenominationSubtotals(reviewed);
assert.equal(subtotals.tithe, 30000);
assert.equal(subtotals.offering, 40000);
assert.equal(subtotals.other, null);
assert.throws(() => validateCountCaptureDenominationReview(reviewInput.map((row) => row.cellKey === 'tithe:5000' ? { ...row, decision: 'blank', quantity: 0 } : row)), /INVALID_REVIEW/);

const [providerSource, extractSource, reviewSource, clientSource, panelSource, finalizeSource, detailSource] = await Promise.all([
  readFile('server/vercel-handlers/finance/countCaptureDenominationExtractionProvider.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/countCapturesExtractDenominations.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/countCapturesSaveDenominationReview.ts', 'utf8'),
  readFile('src/pages/finance/count/countCaptureDenominationExtractionImage.ts', 'utf8'),
  readFile('src/pages/finance/count/CountCaptureDenominationReviewPanel.tsx', 'utf8'),
  readFile('server/vercel-handlers/finance/countCapturesFinalize.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/countCapturesDetail.ts', 'utf8'),
]);
assert.ok(providerSource.includes("NESTFINANCE_COUNT_CAPTURE_AI_ENABLED !== 'true'"));
assert.ok(providerSource.includes('Do not multiply by denomination') && providerSource.includes('store: false'));
assert.ok(!providerSource.includes('organizationId') && !providerSource.includes('financeEntityId') && !providerSource.includes('Authorization'));
assert.ok(extractSource.includes("resolveFinanceRequestContext(req, 'finance.create_drafts')"));
assert.ok(extractSource.includes('resolveCanonicalCountPaperForm') && extractSource.includes('captureExtractionLease'));
assert.ok(extractSource.includes('financialValuesEmbedded: false'));
assert.ok(reviewSource.includes('calculateReviewedDenominationSubtotals') && reviewSource.includes('candidateQuantity'));
assert.ok(clientSource.includes('COUNT_CAPTURE_DENOMINATION_MAX_TOTAL_BYTES') && clientSource.includes("'image/jpeg'"));
assert.ok(panelSource.includes('PT:') && panelSource.includes('EN:') && panelSource.includes('ES:'));
assert.ok(panelSource.includes('verified') && panelSource.includes('saveDenominationReview'));
assert.ok(finalizeSource.includes('buildUnresolvedCountCaptureDenominationCandidates'));
assert.ok(detailSource.includes('denominationCandidates: materialHidden ? null') && detailSource.includes('denominationReview: materialHidden ? null'));
for (const forbidden of ['financeTransactions', 'financeJournalEntries', 'financeJournalLines', 'financeAggregates', 'approve-for-posting']) {
  assert.ok(!extractSource.includes(forbidden), `H3B4 extraction must not reference ${forbidden}`);
  assert.ok(!reviewSource.includes(forbidden), `H3B4 review must not reference ${forbidden}`);
}
console.log('✅ Count Capture H3B4 denomination contract passed');
