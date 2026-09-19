import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCountCaptureApplyPlan } from '../shared/finance/countCaptureApply.js';
import { COUNT_CAPTURE_DENOMINATION_CELL_KEYS, parseCountCaptureDenominationCellKey } from '../shared/finance/countCaptureDenominations.js';

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed += 1;
  console.log('✅ ' + message);
};

const reviewedFields = [
  { key: 'tithe', decision: 'corrected', valueCents: 30000, candidateValueCents: null, candidateState: 'unresolved' },
  { key: 'offering', decision: 'corrected', valueCents: 40000, candidateValueCents: null, candidateState: 'unresolved' },
  { key: 'other_income', decision: 'corrected', valueCents: 5000, candidateValueCents: null, candidateState: 'unresolved' },
  { key: 'pix', decision: 'corrected', valueCents: 12000, candidateValueCents: null, candidateState: 'unresolved' },
];

const totalsOnly = buildCountCaptureApplyPlan({ reviewedFields });
verify(totalsOnly.entries.length === 4, 'four reviewed paper totals produce four canonical Count entries');
verify(totalsOnly.entries.find((entry) => entry.type === 'tithe')?.totalCents === 30000, 'tithe total is preserved');
verify(totalsOnly.entries.find((entry) => entry.type === 'offering')?.totalCents === 40000, 'offering total is preserved');
verify(totalsOnly.entries.find((entry) => entry.type === 'other')?.totalCents === 5000, 'other_income maps to canonical other entry');
verify(totalsOnly.entries.find((entry) => entry.type === 'pix')?.totalCents === 12000, 'Pix total is preserved');
verify(totalsOnly.entries.find((entry) => entry.type === 'tithe')?.method === 'total', 'simple paper flow does not require denomination detail');
verify(totalsOnly.sources.tithe === 'reviewed_total', 'source lineage records reviewed total');

assert.throws(
  () => buildCountCaptureApplyPlan({
    reviewedFields: reviewedFields.map((field) => field.key === 'offering'
      ? { ...field, decision: 'unreadable', valueCents: null }
      : field),
  }),
  /COUNT_CAPTURE_REVIEW_INCOMPLETE/,
);
passed += 1;
console.log('✅ unreadable required field fails closed');

const reviewedDenominations = COUNT_CAPTURE_DENOMINATION_CELL_KEYS.map((cellKey) => {
  const identity = parseCountCaptureDenominationCellKey(cellKey)!;
  let quantity = 0;
  if (identity.entryType === 'tithe' && identity.denominationCents === 10000) quantity = 3;
  if (identity.entryType === 'offering' && identity.denominationCents === 10000) quantity = 4;
  if (identity.entryType === 'other' && identity.denominationCents === 5000) quantity = 1;
  return {
    cellKey,
    decision: quantity === 0 ? 'blank' : 'corrected',
    quantity: quantity === 0 ? null : quantity,
    candidateQuantity: null,
    candidateState: 'unresolved',
    entryType: identity.entryType,
    denominationCents: identity.denominationCents,
  };
});

const detailed = buildCountCaptureApplyPlan({ reviewedFields, reviewedDenominations });
verify(detailed.entries.find((entry) => entry.type === 'tithe')?.method === 'denominations', 'matching reviewed denomination detail is preserved');
verify(detailed.sources.offering === 'reviewed_denominations', 'denomination source lineage is explicit');

assert.throws(
  () => buildCountCaptureApplyPlan({
    reviewedFields: reviewedFields.map((field) => field.key === 'tithe' ? { ...field, valueCents: 29999 } : field),
    reviewedDenominations,
  }),
  /COUNT_CAPTURE_DENOMINATION_TOTAL_MISMATCH/,
);
passed += 1;
console.log('✅ denomination detail must exactly match reviewed top-level total');

const handler = readFileSync('server/vercel-handlers/finance/countCapturesApplyToCount.ts', 'utf8');
const home = readFileSync('src/pages/finance/CountPage.tsx', 'utf8');
const review = readFileSync('src/pages/finance/count/CountCaptureReviewPage.tsx', 'utf8');
const extraction = readFileSync('src/pages/finance/count/CountCaptureExtractionPanel.tsx', 'utf8');
const paper = readFileSync('src/pages/finance/count/CountPaperFormPage.tsx', 'utf8');
const service = readFileSync('src/services/countCaptureService.ts', 'utf8');
const gateway = readFileSync('api/finance-gateway.ts', 'utf8');

verify(handler.includes("resolveFinanceRequestContext(req, 'finance.create_drafts')"), 'paper application requires finance.create_drafts');
verify(handler.includes('count.first_count_imported_from_reviewed_sheet'), 'first paper count receives explicit audit action');
verify(handler.includes('count.second_count_imported_from_reviewed_sheet'), 'second paper count receives explicit audit action');
verify(handler.includes("source: 'count_capture'"), 'canonical Count preserves capture lineage');
verify(handler.includes('COUNT_CAPTURE_APPLY_FIRST_COUNT_ALREADY_EXISTS'), 'paper flow refuses to overwrite an existing first count');
verify(handler.includes('COUNT_CAPTURE_APPLY_SECOND_COUNT_ALREADY_EXISTS'), 'paper flow refuses to overwrite an existing second count');
verify(handler.includes('compareCountEntries'), 'paper Count B uses canonical double-count comparison');
verify(handler.includes('COUNT_DIVERGENCE_REVIEW_REQUIRED'), 'paper divergence uses the existing attention signal');
for (const forbidden of ['financeTransactions', 'financeJournalEntries', 'financeJournalLines', 'financeAggregates', 'posting-plan', 'approve-for-posting']) {
  verify(!handler.includes(forbidden), 'paper apply handler never references ' + forbidden);
}

verify(home.includes('Contar no celular') && home.includes('Use paper') && home.includes('Usar papel'), 'simple entry mode is localized and explicit');
verify(home.includes('Já tenho uma folha preenchida'), 'Count home offers direct completed-sheet capture');
verify(home.includes("creationMode === 'paper'"), 'paper-first creation is a first-class path');
verify(paper.includes('Fotografar folha preenchida'), 'print screen connects directly back to photo capture');
verify(extraction.includes('void run()'), 'safe assisted top-level reading can start automatically');
verify(extraction.includes('Opcional: abra o detalhamento'), '33-cell denomination review is optional in simple mode');
verify(review.includes('Usar estes valores na contagem'), 'reviewed paper values have one explicit apply action');
verify(review.includes('Isso não cria lançamento, não posta movimentação e não altera saldo'), 'apply CTA explains its authority boundary');
verify(!review.includes('applyToCount(organizationId') || review.includes('onClick={() => void applyToCount()}'), 'application remains an explicit human action');
verify(service.includes('operation=count-captures-apply-to-count'), 'client calls certified paper apply operation');
verify(gateway.includes("case 'count-captures-apply-to-count'"), 'gateway exposes paper apply operation');

console.log('\nCount Paper-First Simple Mode totals: ' + passed + ' Passed');
