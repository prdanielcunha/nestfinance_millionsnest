import * as fs from 'fs';
import * as path from 'path';
import { TRANSACTION_REVIEW_EVIDENCE_COPY } from '../src/pages/finance/transactions/transactionReviewEvidenceCopy';
import {
  compareDocumentAnalysisToTransaction,
  normalizeReviewEvidenceIds,
  normalizeReviewEvidenceDate,
} from '../src/pages/finance/transactions/transactionReviewEvidenceModel';

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

const panel = fs.readFileSync(
  path.resolve('src/pages/finance/transactions/TransactionReviewEvidencePanel.tsx'),
  'utf8',
);
const detail = fs.readFileSync(
  path.resolve('src/pages/finance/transactions/TransactionReviewDetailPage.tsx'),
  'utf8',
);

console.log('Running Transaction Review Evidence Context checks...');

verify(
  'evidence ids are canonical, unique and bounded',
  normalizeReviewEvidenceIds([
    'evd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'invalid',
    'evd_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'evd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  ]).join(',') ===
    'evd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,evd_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
);
verify(
  'non-array evidence state fails closed',
  normalizeReviewEvidenceIds('evd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa').length === 0,
);
verify(
  'review evidence date normalizes ISO timestamps',
  normalizeReviewEvidenceDate('2026-09-21T13:00:00.000Z') === '2026-09-21',
);
verify(
  'invalid review evidence date fails closed',
  normalizeReviewEvidenceDate('not-a-date') === null,
);

const analysis = {
  totalAmountCents: { state: 'recognized', value: 74291 },
  occurredAt: { state: 'recognized', value: '2026-09-21' },
  transactionKind: { state: 'recognized', value: 'expense' },
  paymentMethod: { state: 'recognized', value: 'pix' },
  categoryId: { state: 'recognized', value: 'cat_material' },
} as any;

const matching = compareDocumentAnalysisToTransaction(
  analysis,
  {
    amountCents: 74291,
    occurredAt: '2026-09-21T09:30:00.000Z',
    transactionKind: 'expense',
    paymentMethod: 'pix',
  },
  [{ categoryId: 'cat_material' }],
);
verify(
  'recognized document fields can match the transaction deterministically',
  Object.values(matching).every((status) => status === 'match'),
);

const divergent = compareDocumentAnalysisToTransaction(
  analysis,
  {
    amountCents: 70000,
    occurredAt: '2026-09-20T09:30:00.000Z',
    transactionKind: 'income',
    paymentMethod: 'cash',
  },
  [{ categoryId: 'cat_other' }],
);
verify(
  'recognized document fields surface deterministic differences',
  Object.values(divergent).every((status) => status === 'different'),
);

const uncertain = compareDocumentAnalysisToTransaction(
  {
    ...analysis,
    totalAmountCents: { state: 'uncertain', value: null },
    occurredAt: { state: 'absent', value: null },
    transactionKind: { state: 'uncertain', value: null },
    paymentMethod: { state: 'recognized', value: 'unknown' },
    categoryId: { state: 'absent', value: null },
  } as any,
  {},
  [],
);
verify(
  'uncertain or absent analysis never becomes a false difference',
  Object.values(uncertain).every((status) => status === 'uncertain'),
);

verify(
  'review detail mounts the evidence context panel',
  detail.includes('TransactionReviewEvidencePanel') &&
    detail.includes('evidenceIds={transaction.evidenceIds}'),
);
verify(
  'evidence context reads only protected evidence detail metadata automatically',
  panel.includes('universalEvidenceInboxService.detail('),
);
verify(
  'original binary remains explicit opt-in',
  panel.includes('universalEvidenceInboxService.preview(') &&
    panel.includes('onClick={() => void openPreview()}') &&
    !/useEffect\([\s\S]{0,500}openPreview\(/.test(panel),
);
verify(
  'review evidence context never runs a new AI analysis',
  !panel.includes('analyzeTransaction('),
);
verify(
  'review evidence context never classifies or resolves evidence',
  !panel.includes('.classify(') && !panel.includes('.review('),
);
verify(
  'review evidence context never mutates transactions',
  !/createDraft|createAndSubmit|updateDraft|submitForReview|returnToDraft|approveForPosting/.test(panel),
);
verify(
  'AI-assisted evidence differences do not enter approval blocking',
  detail.includes('const approvalDisabled = reviewBlocked || actionState !== null;') &&
    !detail.includes('approvalDisabled = reviewBlocked || evidence'),
);
verify(
  'preview object URLs are revoked on close and cleanup',
  panel.includes('URL.revokeObjectURL') && panel.includes('previewUrlRef.current'),
);
verify(
  'multiple evidence records can be selected without changing transaction state',
  panel.includes('setSelectedEvidenceId(item.evidenceId)') &&
    panel.includes('evidenceItems.length > 1'),
);
verify(
  'review can open the canonical full evidence detail when needed',
  panel.includes('APP_ROUTES.inboxEvidenceDetail'),
);
verify(
  'raw backend error messages are never rendered',
  !panel.includes('{error.message}') && !panel.includes('{err.message}'),
);

for (const language of ['PT', 'EN', 'ES'] as const) {
  const copy = TRANSACTION_REVIEW_EVIDENCE_COPY[language];
  verify(
    `${language} has document-vs-transaction review copy`,
    Boolean(
      copy.title &&
        copy.subtitle &&
        copy.documentColumn &&
        copy.transactionColumn &&
        copy.statusMatch &&
        copy.statusDifferent &&
        copy.statusUncertain,
    ),
  );
  verify(
    `${language} explains assisted analysis authority`,
    Boolean(copy.analysisNote && copy.analysisMissing),
  );
}

console.log(
  `\nTransaction Review Evidence Context totals: ${passed} Passed, ${failed} Failed`,
);
process.exit(failed > 0 ? 1 : 0);
