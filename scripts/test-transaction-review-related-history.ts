import * as fs from 'fs';
import * as path from 'path';
import type { AuditTimelineItem } from '../shared/finance/auditReadModel';
import { TRANSACTION_REVIEW_HISTORY_COPY } from '../src/pages/finance/transactions/transactionReviewHistoryCopy';
import {
  normalizeReviewHistoryResourceIds,
  selectRelatedReviewHistory,
} from '../src/pages/finance/transactions/transactionReviewHistoryModel';

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
  path.resolve('src/pages/finance/transactions/TransactionReviewHistoryPanel.tsx'),
  'utf8',
);
const detail = fs.readFileSync(
  path.resolve('src/pages/finance/transactions/TransactionReviewDetailPage.tsx'),
  'utf8',
);

console.log('Running Transaction Review Related History checks...');

const resources = normalizeReviewHistoryResourceIds(
  'tx_aaaaaaaaaaaaaaaa',
  [
    'evd_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'invalid',
    'evd_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'evd_cccccccccccccccccccccccccccccccc',
  ],
);
verify(
  'history resources keep canonical transaction and evidence ids only',
  resources.join(',') ===
    'tx_aaaaaaaaaaaaaaaa,evd_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,evd_cccccccccccccccccccccccccccccccc',
);
verify(
  'invalid transaction id is ignored without weakening evidence scope',
  normalizeReviewHistoryResourceIds(
    'transaction-anything',
    ['evd_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'],
  ).join(',') === 'evd_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
);

const makeItem = (
  eventId: string,
  resourceId: string | null,
): AuditTimelineItem => ({
  eventId,
  occurredAt: '2026-09-21T18:00:00.000Z',
  actorKind: 'user',
  actorDisplayName: 'Reviewer',
  resource: resourceId?.startsWith('evd_') ? 'universal_evidence' : 'transaction',
  resourceId,
  action: 'transaction.updated',
  requestId: null,
  metadata: {},
});

const auditItems = [
  makeItem('evt-1', 'tx_aaaaaaaaaaaaaaaa'),
  makeItem('evt-2', 'tx_otherotherother1'),
  makeItem('evt-3', 'evd_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
];

const selected = selectRelatedReviewHistory(auditItems, resources, true);
verify(
  'history selection includes only exact related canonical ids',
  selected.items.map((item) => item.eventId).join(',') === 'evt-1,evt-3',
);
verify(
  'history selection preserves source truncation truth',
  selected.truncatedAtSource === true,
);
verify(
  'history selection fails closed without related resource ids',
  selectRelatedReviewHistory(auditItems, [], false).items.length === 0,
);

const many = Array.from({ length: 14 }, (_, index) =>
  makeItem(`evt-many-${index}`, 'tx_aaaaaaaaaaaaaaaa'),
);
verify(
  'review history stays bounded to ten recent related events',
  selectRelatedReviewHistory(many, ['tx_aaaaaaaaaaaaaaaa']).items.length === 10,
);

verify(
  'review detail mounts canonical related history',
  detail.includes('TransactionReviewHistoryPanel') &&
    detail.includes('transactionId={transaction.id}') &&
    detail.includes('evidenceIds={transaction.evidenceIds}'),
);
verify(
  'history reads canonical audit service',
  panel.includes('auditService.list('),
);
verify(
  'history remains explicitly on-demand',
  panel.includes("state === 'idle'") &&
    panel.includes('onClick={() => void loadHistory()}') &&
    !/useEffect\([\s\S]{0,500}loadHistory\(/.test(panel),
);
verify(
  'history never mutates transactions or audit events',
  !/createDraft|createAndSubmit|updateDraft|submitForReview|returnToDraft|approveForPosting|auditMutation|deleteAudit|writeAudit/.test(panel),
);
verify(
  'history does not expose request ids',
  !panel.includes('requestId'),
);
verify(
  'history does not render raw backend error messages',
  !panel.includes('{error.message}') &&
    !panel.includes('{err.message}') &&
    !panel.includes('setState(error.message)'),
);
verify(
  'truncated canonical source is communicated instead of claiming completeness',
  panel.includes('truncatedAtSource') && panel.includes('copy.recentOnly'),
);
verify(
  'full canonical audit remains reachable',
  panel.includes('APP_ROUTES.audit'),
);
verify(
  'audit history does not enter approval authority',
  detail.includes('const approvalDisabled = reviewBlocked || actionState !== null || !online;') &&
    !detail.includes('approvalDisabled = reviewBlocked || history') &&
    !detail.includes('approvalDisabled = reviewBlocked || audit'),
);

for (const language of ['PT', 'EN', 'ES'] as const) {
  const copy = TRANSACTION_REVIEW_HISTORY_COPY[language];
  verify(
    `${language} has recent-history copy`,
    Boolean(
      copy.title &&
        copy.subtitle &&
        copy.load &&
        copy.openAudit &&
        copy.emptyTitle &&
        copy.recentOnly,
    ),
  );
  verify(
    `${language} has safe transaction and evidence action labels`,
    Boolean(
      copy.actions['transaction.created'] &&
        copy.actions['transaction.approved_for_posting'] &&
        copy.actions['evidence.classified'] &&
        copy.actions['evidence.reviewed'],
    ),
  );
}

console.log(
  `\nTransaction Review Related History totals: ${passed} Passed, ${failed} Failed`,
);
process.exit(failed > 0 ? 1 : 0);
