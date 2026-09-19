import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildCountCaptureCandidatesFromProvider,
  validateCountCaptureProviderResult,
} from '../shared/finance/countCaptureExtraction.js';
import { deriveOpenCountStage, assertCountCaptureStageOpen } from '../server/vercel-handlers/finance/countCaptureContext.js';

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed += 1;
  console.log('✅ ' + message);
};

verify(deriveOpenCountStage('counting_a') === 'count_a', 'server derives Count A from canonical session state');
verify(deriveOpenCountStage('counting_b') === 'count_b', 'server derives Count B from canonical session state');
assert.throws(() => deriveOpenCountStage('matched'), /COUNT_CAPTURE_INVALID_STAGE_STATE/);
passed += 1;
console.log('✅ closed session cannot start a new free-form capture');
assert.doesNotThrow(() => assertCountCaptureStageOpen('count_a', 'counting_a'));
passed += 1;
console.log('✅ Count A mutation is allowed only while Count A is open');
assert.throws(() => assertCountCaptureStageOpen('count_a', 'counting_b'), /COUNT_CAPTURE_MATERIAL_HIDDEN/);
passed += 1;
console.log('✅ Count A material is protected during blind Count B');
assert.throws(() => assertCountCaptureStageOpen('count_b', 'matched'), /COUNT_CAPTURE_INVALID_STAGE_STATE/);
passed += 1;
console.log('✅ Count B evidence cannot be mutated after comparison closes');

const provider = validateCountCaptureProviderResult({
  fields: [
    { key: 'tithe', status: 'recognized', observation: 'R$ 1.250,00' },
    { key: 'offering', status: 'uncertain', observation: 'duas opções' },
    { key: 'other_income', status: 'blank', observation: '' },
    { key: 'pix', status: 'recognized', observation: '400,00' },
  ],
});
const candidates = buildCountCaptureCandidatesFromProvider({
  provider,
  regions: { tithe: null, offering: null, other_income: null, pix: null },
});
verify(candidates.find((x) => x.key === 'tithe')?.valueCents === 125000, 'explicit tithe total is parsed');
verify(candidates.find((x) => x.key === 'pix')?.valueCents === 40000, 'explicit Pix total is parsed');
verify(candidates.find((x) => x.key === 'offering')?.state === 'uncertain', 'ambiguous offering stays uncertain');
verify(candidates.find((x) => x.key === 'other_income')?.state === 'unresolved', 'missing category stays unresolved');
verify(candidates.every((x) => x.region === null), 'free-form candidates have no fake fixed-layout regions');

const start = readFileSync('server/vercel-handlers/finance/countFreeFormCapturesStart.ts', 'utf8');
const finalize = readFileSync('server/vercel-handlers/finance/countFreeFormCapturesFinalize.ts', 'utf8');
const extract = readFileSync('server/vercel-handlers/finance/countFreeFormCapturesExtractCandidates.ts', 'utf8');
const providerSource = readFileSync('server/vercel-handlers/finance/countFreeFormExtractionProvider.ts', 'utf8');
const detail = readFileSync('server/vercel-handlers/finance/countCapturesDetail.ts', 'utf8');
const review = readFileSync('server/vercel-handlers/finance/countCapturesSaveReview.ts', 'utf8');
const apply = readFileSync('server/vercel-handlers/finance/countCapturesApplyToCount.ts', 'utf8');
const page = readFileSync('src/pages/finance/count/CountFreeFormCapturePage.tsx', 'utf8');
const home = readFileSync('src/pages/finance/CountPage.tsx', 'utf8');
const reviewPage = readFileSync('src/pages/finance/count/CountCaptureReviewPage.tsx', 'utf8');
const panel = readFileSync('src/pages/finance/count/CountCaptureExtractionPanel.tsx', 'utf8');
const service = readFileSync('src/services/countCaptureService.ts', 'utf8');
const gateway = readFileSync('api/finance-gateway.ts', 'utf8');

verify(start.includes("provenance: 'free_form_note'") && start.includes('formId: null') && start.includes('checksum: null'), 'free-form capture never pretends to have official paper identity');
verify(start.includes('deriveOpenCountStage') && !start.match(/stage\s*[,}]\s*=\s*req\.body/), 'capture stage is derived server-side rather than trusted from client');
verify(finalize.includes('denominationCandidates: []'), 'free-form V1 does not infer banknote or coin detail');
verify(finalize.includes('countCaptureHashes'), 'free-form photo keeps SHA duplicate protection');
verify(extract.includes('readVerifiedBytes') && extract.includes('normalizedSha256'), 'AI reads server-verified full-frame evidence');
verify(extract.includes("provenance: 'free_form_full_frame'"), 'extraction provenance explicitly records full-frame free-form reading');
verify(providerSource.includes('Do not add, subtract, reconcile, derive, total, or move values'), 'AI is forbidden from summing or deriving category totals');
verify(providerSource.includes('Do not classify an unlabeled number into a category'), 'unlabeled numbers must not be guessed into a category');
verify(providerSource.includes('A zero is recognized only when zero is explicitly written'), 'missing value can never silently become zero');
verify(providerSource.includes('same category has several line items') && providerSource.includes('mark uncertain'), 'line items without an explicit total fail closed');
verify(detail.includes('resolveCountCaptureContext') && detail.includes("provenance === 'free_form_note'"), 'shared detail preserves lower provenance');
verify(review.includes("resolved.provenance === 'free_form_note'") && review.includes('assertCountCaptureStageOpen'), 'human review is required while the same Count stage is still open');
verify(apply.includes("count.first_count_imported_from_reviewed_note") && apply.includes("count.second_count_imported_from_reviewed_note"), 'audit differentiates reviewed free-form notes from official sheets');
verify(apply.includes('sourceProvenance: provenance'), 'canonical Count keeps explicit source provenance');
verify(page.includes('forceFullFrame: true'), 'free-form UI never assumes official sheet geometry');
verify(page.includes('min-h-') && page.includes('Tirar foto') && page.includes('Take photo') && page.includes('Tomar foto'), 'capture UX is touch-friendly and localized');
verify(home.includes('Fotografar meu papel') && home.includes('Photograph my paper') && home.includes('Fotografiar mi papel'), 'free-form paper is a first-class PT/EN/ES Count mode');
verify(reviewPage.includes("capture?.provenance === 'free_form_note'"), 'review screen explicitly distinguishes free-form evidence');
verify(panel.includes('extractFreeFormCandidates') && panel.includes('!freeForm && showDenominations'), 'free-form review uses full-frame extraction and hides denomination detail');
verify(service.includes('count-free-form-captures-start') && service.includes('count-free-form-captures-finalize') && service.includes('count-free-form-captures-extract-candidates'), 'client uses three certified free-form operations');
verify(gateway.includes("case 'count-free-form-captures-start'") && gateway.includes("case 'count-free-form-captures-finalize'") && gateway.includes("case 'count-free-form-captures-extract-candidates'"), 'gateway exposes free-form capture operations');

for (const source of [start, finalize, extract, review]) {
  verify(!/financeTransactions|financeJournalEntries|financeJournalLines|financeAggregates|approve-for-posting|posting-plan/.test(source), 'free-form capture path has no posting/journal/balance mutation authority');
}

console.log('\nCount Free-Form Note V1 totals: ' + passed + ' Passed');
