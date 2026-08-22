import * as fs from 'fs';
import * as path from 'path';
import {
  buildTransactionCreateMaterialFingerprint,
  formatTransactionCurrency,
  normalizeTransactionCreateDirection,
} from '../src/pages/finance/transactions/transactionCreateModel';
import { TRANSACTION_CREATE_COPY } from '../src/pages/finance/transactions/transactionCreateCopy';

let passed = 0;
let failed = 0;

function verify(name: string, condition: boolean) {
  if (condition) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.error(`❌ ${name}`);
    failed++;
  }
}

const page = fs.readFileSync(
  path.resolve('src/pages/finance/transactions/TransactionCreatePage.tsx'),
  'utf8',
);
const evidenceUpload = fs.readFileSync(
  path.resolve('src/components/finance/TransactionEvidenceUpload.tsx'),
  'utf8',
);
const accountRepair = fs.readFileSync(
  path.resolve('src/components/finance/AccountRepairCard.tsx'),
  'utf8',
);

console.log('Running Transaction Create 2.0 guided-flow checks...');

verify('invalid direction falls back to expense', normalizeTransactionCreateDirection('admin') === 'expense');
verify('missing direction falls back to expense', normalizeTransactionCreateDirection(null) === 'expense');
verify('supported transfer direction is preserved', normalizeTransactionCreateDirection('transfer') === 'transfer');
verify('PT BRL formatter uses Brazilian decimal presentation', /1\.234,56/.test(formatTransactionCurrency(123456, 'PT')));
verify('EN BRL formatter uses English decimal presentation', /1,234\.56/.test(formatTransactionCurrency(123456, 'EN')));
verify('ES BRL formatter uses Spanish decimal presentation', /1234,56|1\.234,56/.test(formatTransactionCurrency(123456, 'ES').replace(/\s/g, '')));

const basePayload = {
  direction: 'expense',
  amountCents: 9500,
  occurredAt: '2026-08-14T12:00:00.000Z',
  accountId: 'account-a',
  paymentMethod: 'pix',
  description: 'Energia',
  counterparty: 'Fornecedor',
  evidenceIds: ['e2', 'e1'],
  allocations: [{ categoryId: 'cat', fundId: 'fund', costCenterId: 'cc', amountCents: 9500 }],
};
const fingerprintA = buildTransactionCreateMaterialFingerprint(basePayload);
const fingerprintRetry = buildTransactionCreateMaterialFingerprint({ ...basePayload, evidenceIds: ['e1', 'e2'] });
const fingerprintChanged = buildTransactionCreateMaterialFingerprint({ ...basePayload, counterparty: 'Outro fornecedor' });
verify('same material payload reuses fingerprint independent of evidence order', fingerprintA === fingerprintRetry);
verify('material field change changes fingerprint', fingerprintA !== fingerprintChanged);

verify('page normalizes direction query explicitly', page.includes('normalizeTransactionCreateDirection'));
verify('page keeps finance.create_drafts capability gate', page.includes("'finance.create_drafts'"));
verify('page keeps finance.submit_for_review capability gate', page.includes("'finance.submit_for_review'"));
verify('page preserves entity epoch stale-response protection', page.includes('epochRef.current !== currentEpochOnSave'));
verify('page preserves idempotency key reuse state', page.includes('lastMaterialPayloadRef') && page.includes('idempotencyKeyRef'));
verify('page uses full material fingerprint', page.includes('buildTransactionCreateMaterialFingerprint'));
verify('page has progressive classification disclosure', page.includes('showClassification') && page.includes('setShowClassification'));
verify('page has progressive details disclosure', page.includes('showDetails') && page.includes('setShowDetails'));
verify('page can reveal blocking fields without rendering backend finding messages', page.includes('revealMissingFields') && !page.includes('{f.message}') && !page.includes('{finding.message}'));
verify('page uses locale-aware BRL presentation', page.includes('formatTransactionCurrency') && page.includes('formatTransactionInputAmount'));
verify('page does not call posting endpoints', !/post(?:ing)?[-_/ ]?real|journal[-_/ ]?(?:post|write)|financeJournalEntries|financeAggregates/.test(page));
verify('page does not write financial data to localStorage', !page.includes('localStorage'));
verify('evidence upload binds to active language', evidenceUpload.includes('useLanguage') && evidenceUpload.includes('UI_COPY[language]'));
verify('evidence upload uses accessible localized camera/remove actions', evidenceUpload.includes('aria-label={copy.camera}') && evidenceUpload.includes('aria-label={copy.remove}'));
verify('account repair binds to active language', accountRepair.includes('useLanguage') && accountRepair.includes('UI_COPY[language]'));
verify('account repair dialog has accessible semantics', accountRepair.includes('role="dialog"') && accountRepair.includes('aria-modal="true"') && accountRepair.includes('aria-labelledby={dialogTitleId}'));
verify('account repair does not render backend error payloads', !accountRepair.includes('errData.message') && !accountRepair.includes('errData.error'));

for (const language of ['PT', 'EN', 'ES'] as const) {
  const copy = TRANSACTION_CREATE_COPY[language];
  verify(`${language} copy has guided-flow headings`, Boolean(copy.whatHappened && copy.howQuestion.expense && copy.classificationTitle && copy.showDetails));
  verify(`${language} copy has safe recovery messages`, Boolean(copy.errorServiceUnavailable && copy.errorUncertain && copy.supportCode));
}

console.log(`\nTransaction Create 2.0 totals: ${passed} Passed, ${failed} Failed`);
process.exit(failed > 0 ? 1 : 0);
