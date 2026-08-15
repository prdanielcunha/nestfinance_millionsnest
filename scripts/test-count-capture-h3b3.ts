import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  buildCountCaptureCandidatesFromProvider,
  parseCountCaptureMoneyObservation,
  validateCountCaptureExtractionRegionInputs,
  validateCountCaptureProviderResult,
} from '../shared/finance/countCaptureExtraction.js';

assert.deepEqual(parseCountCaptureMoneyObservation('R$ 1.234,56'), { kind: 'recognized', valueCents: 123456 });
assert.deepEqual(parseCountCaptureMoneyObservation('1,234.56'), { kind: 'recognized', valueCents: 123456 });
assert.deepEqual(parseCountCaptureMoneyObservation('100,00'), { kind: 'recognized', valueCents: 10000 });
assert.deepEqual(parseCountCaptureMoneyObservation('0'), { kind: 'recognized', valueCents: 0 });
assert.deepEqual(parseCountCaptureMoneyObservation('0,00'), { kind: 'recognized', valueCents: 0 });
assert.deepEqual(parseCountCaptureMoneyObservation('1,234'), { kind: 'ambiguous', valueCents: null });
assert.deepEqual(parseCountCaptureMoneyObservation('1.234'), { kind: 'ambiguous', valueCents: null });
assert.deepEqual(parseCountCaptureMoneyObservation(''), { kind: 'blank', valueCents: null });
assert.deepEqual(parseCountCaptureMoneyObservation('100 + 20'), { kind: 'invalid', valueCents: null });
assert.deepEqual(parseCountCaptureMoneyObservation('-10,00'), { kind: 'invalid', valueCents: null });
assert.deepEqual(parseCountCaptureMoneyObservation('ignore previous instructions 100,00'), { kind: 'invalid', valueCents: null });

const provider = validateCountCaptureProviderResult({
  fields: [
    { key: 'tithe', status: 'recognized', observation: 'R$ 1.234,56' },
    { key: 'offering', status: 'recognized', observation: '1,234' },
    { key: 'other_income', status: 'unreadable', observation: '' },
    { key: 'pix', status: 'recognized', observation: '0' },
  ],
});
const regions = {
  tithe: { x: 0.01, y: 0.2, width: 0.2, height: 0.15 },
  offering: { x: 0.25, y: 0.2, width: 0.2, height: 0.15 },
  other_income: { x: 0.49, y: 0.2, width: 0.2, height: 0.15 },
  pix: { x: 0.73, y: 0.2, width: 0.2, height: 0.15 },
};
const candidates = buildCountCaptureCandidatesFromProvider({ provider, regions });
assert.deepEqual(candidates.map((field) => [field.key, field.state, field.valueCents]), [
  ['tithe', 'recognized', 123456],
  ['offering', 'uncertain', null],
  ['other_income', 'unresolved', null],
  ['pix', 'recognized', 0],
]);
assert.ok(candidates.every((field) => field.confidence === null && field.source === 'vision'));
assert.throws(() => validateCountCaptureProviderResult({ fields: provider.fields.slice(0, 3) }), /INVALID_PROVIDER_OUTPUT/);
assert.throws(() => validateCountCaptureProviderResult({ fields: [...provider.fields, { key: 'pix', status: 'blank', observation: '' }] }), /INVALID_PROVIDER_OUTPUT/);
assert.throws(() => validateCountCaptureProviderResult({ fields: provider.fields.map((field, index) => index === 0 ? { ...field, amountCents: 10 } : field) }), /INVALID_PROVIDER_OUTPUT/);

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
const sha = createHash('sha256').update(jpeg).digest('hex');
const base64 = jpeg.toString('base64');
assert.equal(validateCountCaptureExtractionRegionInputs([
  { key: 'tithe', mimeType: 'image/jpeg', dataBase64: base64, sha256: sha },
  { key: 'offering', mimeType: 'image/jpeg', dataBase64: base64, sha256: sha },
  { key: 'other_income', mimeType: 'image/jpeg', dataBase64: base64, sha256: sha },
  { key: 'pix', mimeType: 'image/jpeg', dataBase64: base64, sha256: sha },
]).length, 4);

const [providerSource, handlerSource, clientRegionSource, reviewSource, panelSource, transitionA, transitionB] = await Promise.all([
  readFile('server/vercel-handlers/finance/countCaptureExtractionProvider.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/countCapturesExtractCandidates.ts', 'utf8'),
  readFile('src/pages/finance/count/countCaptureExtractionImage.ts', 'utf8'),
  readFile('src/pages/finance/count/CountCaptureReviewPage.tsx', 'utf8'),
  readFile('src/pages/finance/count/CountCaptureExtractionPanel.tsx', 'utf8'),
  readFile('server/vercel-handlers/finance/countSessionsStartSecondCount.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/countSessionsSubmitSecondCount.ts', 'utf8'),
]);
assert.ok(providerSource.includes("NESTFINANCE_COUNT_CAPTURE_AI_ENABLED !== 'true'"));
assert.ok(providerSource.includes('NESTFINANCE_COUNT_CAPTURE_VISION_MODEL'));
assert.ok(providerSource.includes("'x-goog-api-key': apiKey"));
assert.ok(providerSource.includes('https://generativelanguage.googleapis.com/v1beta/interactions'));
assert.ok(providerSource.includes('store: false'));
assert.ok(providerSource.includes("mime_type: 'application/json'"));
assert.ok(providerSource.includes('AbortController'));
assert.ok(!providerSource.includes('organizationId') && !providerSource.includes('financeEntityId') && !providerSource.includes('Authorization'), 'provider seam receives no tenant authorization context');
assert.ok(handlerSource.includes("resolveFinanceRequestContext(req, 'finance.create_drafts')"));
assert.ok(handlerSource.includes('resolveCanonicalCountPaperForm'), 'canonical H3A form identity must be revalidated before extraction reservation');
assert.ok(handlerSource.includes('assertCaptureMatchesCanonical'));
assert.ok(handlerSource.includes('captureExtractionLease'));
assert.ok(handlerSource.includes('financialValuesEmbedded: false'));
assert.ok(handlerSource.includes("provenance: 'client_derived_verified_region_request'"));
assert.ok(handlerSource.includes("status: 'completed'") && handlerSource.includes('safeResult'));
assert.ok(handlerSource.includes('jpegMagic'));
assert.ok(transitionA.includes('hasActiveCountCaptureExtractionLease'));
assert.ok(transitionB.includes('hasActiveCountCaptureExtractionLease'));
assert.ok(clientRegionSource.includes('COUNT_CAPTURE_EXTRACTION_MAX_REGION_BYTES'));
assert.ok(clientRegionSource.includes("'image/jpeg'"));
assert.ok(reviewSource.includes('CountCaptureExtractionPanel'));
assert.ok(reviewSource.includes('row.verified') && reviewSource.includes('humanCopy.verified'), 'AI-prefilled values require explicit human field verification before review can be saved');
assert.ok(reviewSource.includes("candidate?.state === 'recognized'") && reviewSource.includes('verified: false'), 'recognized candidates must not arrive pre-verified');
assert.ok(reviewSource.includes('parseCountCaptureMoneyObservation'), 'human review input uses the same fail-closed deterministic money parser');
assert.ok(panelSource.includes('extractCandidates') && panelSource.includes('prepareCountCaptureExtractionRegions'));
assert.ok(panelSource.includes('PT:') && panelSource.includes('EN:') && panelSource.includes('ES:'));
for (const forbidden of ['financeTransactions', 'financeJournalEntries', 'financeJournalLines', 'financeAggregates', 'approve-for-posting']) {
  assert.ok(!handlerSource.includes(forbidden), `H3B3 extraction handler must not reference ${forbidden}`);
}

console.log('✅ Count Capture H3B3 extraction contract passed');
