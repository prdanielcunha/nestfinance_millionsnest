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

type FieldOverride = { status: 'recognized' | 'uncertain' | 'absent'; observation: string };

const base: Record<string, FieldOverride> = {
  document_type: { status: 'recognized', observation: 'fiscal_receipt' },
  transaction_kind: { status: 'recognized', observation: 'expense' },
  counterparty_name: { status: 'recognized', observation: 'FORNECEDOR EXEMPLO LTDA' },
  issuer_tax_id: { status: 'recognized', observation: '11.444.777/0001-61' },
  recipient_tax_id: { status: 'recognized', observation: '04.252.011/0001-10' },
  payer_tax_id: { status: 'absent', observation: '' },
  payee_tax_id: { status: 'absent', observation: '' },
  document_number: { status: 'recognized', observation: 'NFC-e 12345' },
  total_amount: { status: 'recognized', observation: 'R$ 250,00' },
  currency: { status: 'recognized', observation: 'BRL' },
  occurred_at: { status: 'recognized', observation: '19/09/2026' },
  due_date: { status: 'absent', observation: '' },
  settlement_state: { status: 'recognized', observation: 'paid' },
  payment_method: { status: 'recognized', observation: 'credit_card' },
  description: { status: 'recognized', observation: 'Compra de materiais' },
  category_id: { status: 'recognized', observation: 'cat_materials' },
  document_multiplicity: { status: 'recognized', observation: 'single' },
};

function fields(overrides: Partial<Record<string, FieldOverride>> = {}): DocumentTransactionProviderResult {
  return {
    fields: Object.entries({ ...base, ...overrides }).map(([key, value]) => ({
      key: key as any,
      status: value.status,
      observation: value.observation,
    })),
  };
}

const categories = [
  { id: 'cat_materials', name: 'Materiais', kind: 'expense' as const },
  { id: 'cat_utilities', name: 'Água e energia', kind: 'expense' as const },
  { id: 'cat_income', name: 'Dízimos e ofertas', kind: 'income' as const },
  { id: 'cat_services', name: 'Receitas de serviços', kind: 'income' as const },
];

const retail = buildDocumentTransactionAnalysis({
  provider: fields(),
  entityTaxId: '04.252.011/0001-10',
  categories,
});
verify(retail.schemaVersion === 2, 'document analysis uses generic schema v2');
verify(retail.documentType.value === 'fiscal_receipt', 'fiscal receipt type is preserved');
verify(retail.transactionKind.value === 'expense', 'retail purchase proposes expense');
verify(retail.counterpartyName.value === 'FORNECEDOR EXEMPLO LTDA', 'generic counterparty is preserved');
verify(retail.totalAmountCents.value === 25000, 'document total is normalized to integer cents');
verify(retail.currency.value === 'BRL', 'currency is explicit instead of assumed');
verify(retail.settlementState.value === 'paid', 'paid/completed state is explicit');
verify(retail.documentNumber.value === 'NFC-e 12345', 'document identifier is preserved');
verify(retail.categoryId.value === 'cat_materials', 'active same-direction expense category may be suggested');
verify(retail.entityTaxIdCheck === 'match' && retail.entityTaxIdRole === 'recipient', 'expense receipt matches church through recipient role');
verify(retail.analysisStatus === 'ready_for_confirmation', 'paid BRL single expense can reach human confirmation');
verify(retail.authority.createsTransaction === false && retail.authority.postsTransaction === false && retail.authority.changesBalance === false, 'analysis has no accounting authority');

const utilityBill = buildDocumentTransactionAnalysis({
  provider: fields({
    document_type: { status: 'recognized', observation: 'utility_bill' },
    counterparty_name: { status: 'recognized', observation: 'COMPANHIA DE ENERGIA' },
    total_amount: { status: 'recognized', observation: 'R$ 438,17' },
    due_date: { status: 'recognized', observation: '30/09/2026' },
    settlement_state: { status: 'recognized', observation: 'unpaid' },
    payment_method: { status: 'absent', observation: '' },
    description: { status: 'recognized', observation: 'Energia elétrica' },
    category_id: { status: 'recognized', observation: 'cat_utilities' },
  }),
  entityTaxId: '04.252.011/0001-10',
  categories,
});
verify(utilityBill.analysisStatus === 'not_settled', 'unpaid utility bill cannot masquerade as cash outflow');
verify(utilityBill.dueDate.value === '2026-09-30', 'due date is kept separate from transaction date');

const pixIncome = buildDocumentTransactionAnalysis({
  provider: fields({
    document_type: { status: 'recognized', observation: 'pix_receipt' },
    transaction_kind: { status: 'recognized', observation: 'income' },
    counterparty_name: { status: 'recognized', observation: 'DOADOR EXEMPLO' },
    issuer_tax_id: { status: 'absent', observation: '' },
    recipient_tax_id: { status: 'absent', observation: '' },
    payer_tax_id: { status: 'recognized', observation: '11.444.777/0001-61' },
    payee_tax_id: { status: 'recognized', observation: '04.252.011/0001-10' },
    document_number: { status: 'recognized', observation: 'E2E-ABC123' },
    total_amount: { status: 'recognized', observation: 'R$ 900,00' },
    payment_method: { status: 'recognized', observation: 'pix' },
    description: { status: 'recognized', observation: 'Entrada recebida via Pix' },
    category_id: { status: 'recognized', observation: 'cat_income' },
  }),
  entityTaxId: '04.252.011/0001-10',
  categories,
});
verify(pixIncome.transactionKind.value === 'income', 'Pix receipt can propose income');
verify(pixIncome.entityTaxIdCheck === 'match' && pixIncome.entityTaxIdRole === 'payee', 'income can match church as payment beneficiary');
verify(pixIncome.categoryId.value === 'cat_income', 'income category is allowed for income evidence');
verify(pixIncome.analysisStatus === 'ready_for_confirmation', 'completed Pix income can reach human confirmation');

const serviceInvoiceIncome = buildDocumentTransactionAnalysis({
  provider: fields({
    document_type: { status: 'recognized', observation: 'service_invoice' },
    transaction_kind: { status: 'recognized', observation: 'income' },
    counterparty_name: { status: 'recognized', observation: 'CLIENTE EXEMPLO LTDA' },
    issuer_tax_id: { status: 'recognized', observation: '04.252.011/0001-10' },
    recipient_tax_id: { status: 'recognized', observation: '11.444.777/0001-61' },
    payer_tax_id: { status: 'absent', observation: '' },
    payee_tax_id: { status: 'absent', observation: '' },
    total_amount: { status: 'recognized', observation: 'R$ 1.200,00' },
    settlement_state: { status: 'recognized', observation: 'paid' },
    payment_method: { status: 'recognized', observation: 'bank_transfer' },
    description: { status: 'recognized', observation: 'Serviço prestado' },
    category_id: { status: 'recognized', observation: 'cat_services' },
  }),
  entityTaxId: '04.252.011/0001-10',
  categories,
});
verify(serviceInvoiceIncome.entityTaxIdCheck === 'match' && serviceInvoiceIncome.entityTaxIdRole === 'issuer', 'income service invoice can match church as issuer');

const noChurchTaxId = buildDocumentTransactionAnalysis({
  provider: fields({
    recipient_tax_id: { status: 'absent', observation: '' },
    payer_tax_id: { status: 'absent', observation: '' },
  }),
  entityTaxId: '04.252.011/0001-10',
  categories,
});
verify(noChurchTaxId.entityTaxIdCheck === 'absent', 'supplier CNPJ alone is not falsely treated as church mismatch');

const mismatch = buildDocumentTransactionAnalysis({
  provider: fields({
    recipient_tax_id: { status: 'recognized', observation: '33.000.167/0001-01' },
    payer_tax_id: { status: 'absent', observation: '' },
  }),
  entityTaxId: '04.252.011/0001-10',
  categories,
});
verify(mismatch.entityTaxIdCheck === 'mismatch' && mismatch.analysisStatus === 'entity_mismatch', 'different CNPJ in church-side expense role blocks current entity');

const multiple = buildDocumentTransactionAnalysis({
  provider: fields({ document_multiplicity: { status: 'recognized', observation: 'multiple' } }),
  entityTaxId: '04.252.011/0001-10',
  categories,
});
verify(multiple.analysisStatus === 'multiple_documents', 'multiple independent documents in one file are not collapsed');

const usd = buildDocumentTransactionAnalysis({
  provider: fields({
    currency: { status: 'recognized', observation: 'USD' },
    total_amount: { status: 'recognized', observation: 'US$ 125.50' },
  }),
  entityTaxId: '04.252.011/0001-10',
  categories,
});
verify(usd.totalAmountCents.value === 12550 && usd.analysisStatus === 'unsupported_currency', 'foreign currency is read but blocked from BRL draft flow');

const transfer = buildDocumentTransactionAnalysis({
  provider: fields({
    document_type: { status: 'recognized', observation: 'bank_transfer_receipt' },
    transaction_kind: { status: 'recognized', observation: 'transfer' },
    recipient_tax_id: { status: 'absent', observation: '' },
    payer_tax_id: { status: 'recognized', observation: '04.252.011/0001-10' },
    payee_tax_id: { status: 'recognized', observation: '11.444.777/0001-61' },
    category_id: { status: 'absent', observation: '' },
  }),
  entityTaxId: '04.252.011/0001-10',
  categories,
});
verify(transfer.entityTaxIdCheck === 'match' && transfer.entityTaxIdRole === 'payer', 'transfer proof can identify church as payer');
verify(transfer.analysisStatus === 'unsupported_transaction_kind', 'transfer is routed away from simple income/expense drafting');

const wrongCategory = buildDocumentTransactionAnalysis({
  provider: fields({ category_id: { status: 'recognized', observation: 'cat_income' } }),
  entityTaxId: '04.252.011/0001-10',
  categories,
});
verify(wrongCategory.categoryId.value === null && wrongCategory.categoryId.state === 'uncertain', 'income category cannot be suggested for expense');

verify(parseDocumentMoneyObservation('R$ 1.234,56') === 123456, 'Brazilian money format is deterministic');
verify(parseDocumentMoneyObservation('BRL 250.00') === 25000, 'BRL decimal format is deterministic');
verify(parseDocumentMoneyObservation('US$ 125.50') === 12550, 'foreign-currency amount is parsed without converting currency');
verify(parseDocumentMoneyObservation('subtotal') === null, 'non-money observation fails closed');

assert.throws(
  () => validateDocumentTransactionProviderResult({ fields: fields().fields.slice(0, 16) }),
  /DOCUMENT_ANALYSIS_INVALID_PROVIDER_OUTPUT/,
);
passed += 1;
console.log('✅ provider must return the exact bounded generic field inventory');

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
const copy = readFileSync('src/pages/finance/inbox/documentAnalysisCopy.ts', 'utf8');

verify(handler.includes("resolveFinanceRequestContext(req, 'finance.create_drafts')"), 'analysis requires draft-creation capability');
verify(handler.includes('original?.verifiedSha256') && handler.includes('readPreview(path)'), 'server revalidates immutable original before AI');
verify(handler.includes('entityTaxId') && handler.includes('buildDocumentTransactionAnalysis'), 'entity CNPJ comparison happens in deterministic server model');
for (const forbidden of ['financeTransactions', 'financeJournalEntries', 'financeJournalLines', 'financeAggregates', 'transactionsCreateDraft']) {
  verify(!handler.includes(forbidden), 'analysis handler never writes through ' + forbidden);
}
verify(handler.includes('financialRecognition: false') && handler.includes('transactionCreated: false') && handler.includes('balanceMutation: false'), 'analysis audit records non-authoritative boundary');
verify(provider.includes('utility_bill') && provider.includes('pix_receipt') && provider.includes('service_invoice') && provider.includes('statement'), 'provider covers heterogeneous document families');
verify(provider.includes('unfamiliar documents') && provider.includes('other, unknown'), 'provider has an explicit open-world fallback for new document types');
verify(provider.includes('payer_tax_id') && provider.includes('payee_tax_id') && provider.includes('issuer_tax_id') && provider.includes('recipient_tax_id'), 'provider preserves issuer/recipient/payer/payee roles');
verify(provider.includes('never infer payment') && provider.includes('settlement_state'), 'provider separates document existence from actual payment');
verify(provider.includes('never assume BRL'), 'provider does not silently coerce unknown currency to BRL');
verify(detailCard.includes("transactionsService.createDraft("), 'human confirmation uses draft creation only');
verify(!detailCard.includes('createAndSubmit(') && !detailCard.includes('approveForPosting('), 'document confirmation cannot submit or approve automatically');
verify(detailCard.includes('evidenceIds: [evidence.evidenceId]'), 'original canonical evidence is attached to the draft');
verify(detailCard.includes("analysis.analysisStatus === 'not_settled'"), 'unpaid document is blocked from simple draft flow');
verify(detailCard.includes("analysis.analysisStatus === 'unsupported_currency'"), 'non-BRL document is blocked from BRL draft flow');
verify(detailCard.includes("analysis.analysisStatus === 'unsupported_transaction_kind'"), 'transfer/non-transaction document is routed away safely');
verify(detailPage.includes('<DocumentTransactionAnalysisCard'), 'Inbox detail surfaces smart analysis');
verify(batch.includes('const MAX_BATCH = 20') && batch.includes('for (const item of current)'), 'multi-upload remains bounded and sequential');
verify(batch.includes("status: 'analysis_unavailable'"), 'analysis failure preserves accepted document instead of failing batch');
verify(service.includes('universal-evidence-analyze-transaction'), 'client calls certified evidence analysis operation');
verify(gateway.includes("case 'universal-evidence-analyze-transaction'"), 'gateway exposes evidence analysis');
verify(createDraft.includes('assertTransactionEvidenceReferences'), 'draft creation validates evidence entity scope');
verify(copy.includes('Leitura inteligente do documento') && copy.includes('Smart document reading') && copy.includes('Lectura inteligente del documento'), 'analysis UX is PT/EN/ES');
verify(copy.includes('O CNPJ desta igreja foi identificado no documento') && copy.includes('This church tax ID was identified in the document') && copy.includes('El CNPJ de esta iglesia fue identificado en el documento'), 'generic church-identity state is localized');
verify(copy.includes('Este documento não comprova que houve pagamento') && copy.includes('This document does not prove payment happened'), 'unpaid-document safety is explained to humans');

console.log('\nDocument Transaction Intelligence V2 totals: ' + passed + ' Passed');
