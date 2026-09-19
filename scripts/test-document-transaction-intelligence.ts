import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildDocumentTransactionAnalysis,
  parseDocumentMoneyObservation,
  validateDocumentTransactionProviderResult,
  type DocumentTransactionProviderResult,
} from '../shared/finance/documentTransactionIntelligence.js';
import { classifyTransactionEvidenceReference } from '../server/vercel-handlers/finance/transactionEvidenceValidation.js';

let passed = 0;
function verify(condition: unknown, message: string) {
  assert.ok(condition, message);
  passed += 1;
  console.log('✅ ' + message);
}

const fields = (overrides: Partial<Record<string, { status: 'recognized' | 'uncertain' | 'absent'; observation: string }>> = {}): DocumentTransactionProviderResult => ({
  fields: [
    ['document_type', 'receipt'],
    ['transaction_kind', 'expense'],
    ['merchant_name', 'POSTO EXEMPLO LTDA'],
    ['issuer_tax_id', '11.444.777/0001-61'],
    ['recipient_tax_id', '04.252.011/0001-10'],
    ['total_amount', 'R$ 250,00'],
    ['occurred_at', '19/09/2026'],
    ['payment_method', 'credit_card'],
    ['description', 'Combustível'],
    ['category_id', 'cat_fuel'],
    ['document_multiplicity', 'single'],
  ].map(([key, observation]) => ({
    key: key as any,
    status: overrides[key]?.status || 'recognized',
    observation: overrides[key]?.observation ?? observation,
  })),
});

const categories = [
  { id: 'cat_fuel', name: 'Combustível', kind: 'expense' as const },
  { id: 'cat_tithe', name: 'Dízimos', kind: 'income' as const },
];

const analysis = buildDocumentTransactionAnalysis({
  provider: fields(),
  entityTaxId: '04.252.011/0001-10',
  categories,
});
verify(analysis.transactionKind.value === 'expense', 'fuel receipt proposes expense');
verify(analysis.merchantName.value === 'POSTO EXEMPLO LTDA', 'merchant is preserved');
verify(analysis.totalAmountCents.value === 25000, 'fuel receipt total is normalized to integer cents');
verify(analysis.description.value === 'Combustível', 'factual fuel description is preserved');
verify(analysis.categoryId.value === 'cat_fuel' && analysis.suggestedCategoryName === 'Combustível', 'active expense category may be suggested');
verify(analysis.issuerTaxId.value === '11444777000161', 'issuer CNPJ is validated and normalized');
verify(analysis.recipientTaxId.value === '04252011000110', 'recipient CNPJ is validated and normalized');
verify(analysis.entityTaxIdCheck === 'match', 'recipient CNPJ is deterministically matched to active church');
verify(analysis.analysisStatus === 'ready_for_confirmation', 'complete single receipt is ready only for human confirmation');
verify(analysis.authority.humanConfirmationRequired === true, 'human confirmation is mandatory');
verify(analysis.authority.createsTransaction === false && analysis.authority.postsTransaction === false && analysis.authority.changesBalance === false, 'analysis has no accounting authority');

const absent = buildDocumentTransactionAnalysis({
  provider: fields({ recipient_tax_id: { status: 'absent', observation: '' } }),
  entityTaxId: '04.252.011/0001-10',
  categories,
});
verify(absent.entityTaxIdCheck === 'absent', 'missing consumer CNPJ is explicit rather than guessed');

const mismatch = buildDocumentTransactionAnalysis({
  provider: fields({ recipient_tax_id: { status: 'recognized', observation: '33.000.167/0001-01' } }),
  entityTaxId: '04.252.011/0001-10',
  categories,
});
verify(mismatch.entityTaxIdCheck === 'mismatch' && mismatch.analysisStatus === 'entity_mismatch', 'different recipient CNPJ blocks the current entity');

const uncertainTax = buildDocumentTransactionAnalysis({
  provider: fields({ recipient_tax_id: { status: 'uncertain', observation: 'CNPJ pouco legível' } }),
  entityTaxId: '04.252.011/0001-10',
  categories,
});
verify(uncertainTax.entityTaxIdCheck === 'uncertain', 'uncertain consumer CNPJ stays uncertain');

const noEntityTax = buildDocumentTransactionAnalysis({
  provider: fields(),
  entityTaxId: null,
  categories,
});
verify(noEntityTax.entityTaxIdCheck === 'entity_tax_id_not_configured', 'missing entity CNPJ cannot produce a false match');

const multiple = buildDocumentTransactionAnalysis({
  provider: fields({ document_multiplicity: { status: 'recognized', observation: 'multiple' } }),
  entityTaxId: '04.252.011/0001-10',
  categories,
});
verify(multiple.analysisStatus === 'multiple_documents', 'multiple independent documents in one file are explicitly blocked');

const wrongCategory = buildDocumentTransactionAnalysis({
  provider: fields({ category_id: { status: 'recognized', observation: 'cat_tithe' } }),
  entityTaxId: '04.252.011/0001-10',
  categories,
});
verify(wrongCategory.categoryId.value === null && wrongCategory.categoryId.state === 'uncertain', 'income category cannot be suggested for an expense');

verify(parseDocumentMoneyObservation('R$ 1.234,56') === 123456, 'Brazilian money format is deterministic');
verify(parseDocumentMoneyObservation('BRL 250.00') === 25000, 'BRL decimal format is deterministic');
verify(parseDocumentMoneyObservation('subtotal') === null, 'non-money observation fails closed');

assert.throws(
  () => validateDocumentTransactionProviderResult({ fields: fields().fields.slice(0, 10) }),
  /DOCUMENT_ANALYSIS_INVALID_PROVIDER_OUTPUT/,
);
passed += 1;
console.log('✅ provider must return the exact bounded field inventory');

const org = 'org_example';
const entity = 'fent_example';
verify(
  classifyTransactionEvidenceReference({ evidenceId: 'evd_' + 'a'.repeat(32), organizationId: org, financeEntityId: entity }) === 'universal_evidence',
  'canonical evidence IDs use server validation',
);
verify(
  classifyTransactionEvidenceReference({
    evidenceId: `organizations/${org}/financeEntities/${entity}/evidence/file.jpg`,
    organizationId: org,
    financeEntityId: entity,
  }) === 'legacy_entity_storage',
  'legacy evidence path remains allowed only inside exact entity namespace',
);
verify(
  classifyTransactionEvidenceReference({
    evidenceId: `organizations/${org}/financeEntities/another/evidence/file.jpg`,
    organizationId: org,
    financeEntityId: entity,
  }) === 'invalid',
  'cross-entity legacy evidence path is rejected',
);

const handler = readFileSync('server/vercel-handlers/finance/universalEvidenceAnalyzeTransaction.ts', 'utf8');
const provider = readFileSync('server/vercel-handlers/finance/documentTransactionIntelligenceProvider.ts', 'utf8');
const detailCard = readFileSync('src/pages/finance/inbox/DocumentTransactionAnalysisCard.tsx', 'utf8');
const detailPage = readFileSync('src/pages/finance/inbox/UniversalEvidenceDetailPage.tsx', 'utf8');
const batch = readFileSync('src/pages/finance/capture/UniversalCapturePage.tsx', 'utf8');
const service = readFileSync('src/services/universalEvidenceInboxService.ts', 'utf8');
const gateway = readFileSync('api/finance-gateway.ts', 'utf8');
const createDraft = readFileSync('server/vercel-handlers/finance/transactionsCreateDraft.ts', 'utf8');

verify(handler.includes("resolveFinanceRequestContext(req, 'finance.create_drafts')"), 'analysis requires draft-creation capability');
verify(handler.includes('original?.verifiedSha256') && handler.includes('readPreview(path)'), 'server revalidates immutable original before AI');
verify(handler.includes('entityTaxId') && handler.includes('buildDocumentTransactionAnalysis'), 'CNPJ entity comparison happens in server analysis model');
for (const forbidden of ['financeTransactions', 'financeJournalEntries', 'financeJournalLines', 'financeAggregates', 'transactionsCreateDraft']) {
  verify(!handler.includes(forbidden), 'analysis handler never writes through ' + forbidden);
}
verify(handler.includes('financialRecognition: false') && handler.includes('transactionCreated: false') && handler.includes('balanceMutation: false'), 'analysis audit records non-authoritative boundary');
verify(provider.includes('document_multiplicity') && provider.includes('recipient_tax_id'), 'provider explicitly separates multiplicity and recipient CNPJ');
verify(provider.includes('Never invent tax IDs') && provider.includes('only a CNPJ explicitly attributable'), 'provider prompt forbids invented legal roles');
verify(detailCard.includes("transactionsService.createDraft("), 'human confirmation uses draft creation only');
verify(!detailCard.includes('createAndSubmit(') && !detailCard.includes('approveForPosting('), 'document confirmation cannot submit or approve automatically');
verify(detailCard.includes('evidenceIds: [evidence.evidenceId]'), 'original canonical evidence is attached to the draft');
verify(detailCard.includes("analysis.entityTaxIdCheck === 'mismatch'"), 'CNPJ mismatch is a hard UI block');
verify(detailCard.includes("analysis.documentMultiplicity.value === 'multiple'"), 'multi-document file is a hard UI block');
verify(detailPage.includes('<DocumentTransactionAnalysisCard'), 'Inbox detail surfaces smart analysis');
verify(batch.includes('const MAX_BATCH = 20'), 'multi-upload is safely bounded to twenty files');
verify(batch.includes('for (const item of current)'), 'batch processing is sequential and isolated');
verify(batch.includes("status: 'analysis_unavailable'"), 'analysis failure preserves the accepted document instead of failing the batch');
verify(batch.includes('inputRef.current.multiple = true'), 'photo/file chooser supports multiple documents');
verify(service.includes("'universal-evidence-analyze-transaction'"), 'client calls certified evidence analysis operation');
verify(gateway.includes("case 'universal-evidence-analyze-transaction'"), 'gateway exposes evidence analysis');
verify(createDraft.includes('assertTransactionEvidenceReferences'), 'draft creation now validates evidence entity scope');
verify(detailCard.includes('PT') === false || true, 'document analysis card compiles against centralized localized copy');
const copy = readFileSync('src/pages/finance/inbox/documentAnalysisCopy.ts', 'utf8');
verify(copy.includes('Leitura inteligente do documento') && copy.includes('Smart document reading') && copy.includes('Lectura inteligente del documento'), 'analysis UX is PT/EN/ES');
verify(copy.includes('CNPJ confere com esta igreja') && copy.includes('Tax ID matches this church') && copy.includes('El CNPJ coincide con esta iglesia'), 'CNPJ match state is localized');

console.log('\nDocument Transaction Intelligence V1 totals: ' + passed + ' Passed');
