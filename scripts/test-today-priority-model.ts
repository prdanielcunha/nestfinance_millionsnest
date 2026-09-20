import assert from 'assert';
import { chooseTodayPriority } from '../src/pages/finance/todayPriorityModel.js';

const emptySummary = {
  returnedCorrections: 0,
  simpleDrafts: 0,
  readyForReview: 0,
  approvedForPosting: 0,
  totalOpen: 0,
};

const signal = (
  signalType:
    | 'TRANSACTION_CORRECTION_REQUIRED'
    | 'TRANSACTION_REVIEW_REQUIRED'
    | 'INBOX_IDENTIFICATION_REQUIRED'
    | 'INBOX_REVIEW_REQUIRED'
    | 'COUNT_DIVERGENCE_REVIEW_REQUIRED',
  entityId: string,
  signalId = `signal_${signalType.toLowerCase()}`,
) => ({
  signalId,
  signalType,
  entityType: signalType.startsWith('INBOX_')
    ? 'universal_evidence'
    : signalType.startsWith('COUNT_')
      ? 'count_session'
      : 'finance_transaction',
  entityId,
  attentionLevel: signalType === 'COUNT_DIVERGENCE_REVIEW_REQUIRED' ? 'warning' as const : 'action_required' as const,
  requiredCapability: signalType === 'TRANSACTION_REVIEW_REQUIRED' || signalType === 'INBOX_REVIEW_REQUIRED'
    ? 'finance.review'
    : 'finance.create_drafts',
  actionCode: signalType === 'TRANSACTION_CORRECTION_REQUIRED'
    ? 'OPEN_TRANSACTION_CORRECTION' as const
    : signalType === 'TRANSACTION_REVIEW_REQUIRED'
      ? 'OPEN_TRANSACTION_REVIEW' as const
      : signalType === 'INBOX_IDENTIFICATION_REQUIRED'
        ? 'IDENTIFY_INBOX_DOCUMENT' as const
        : signalType === 'INBOX_REVIEW_REQUIRED'
          ? 'REVIEW_INBOX_DOCUMENT' as const
          : 'REVIEW_COUNT_DIVERGENCE' as const,
  openedAt: null,
  updatedAt: null,
  explainable: true as const,
  currentStateVerified: true as const,
});

function run() {
  const divergence = chooseTodayPriority(
    { ...emptySummary, returnedCorrections: 3, totalOpen: 3 },
    [
      { id: 'cnt_divergent', status: 'divergent' },
      { id: 'cnt_matched', status: 'matched' },
    ],
  );
  assert.deepStrictEqual(divergence, {
    kind: 'count_divergence',
    count: 1,
    countSessionId: 'cnt_divergent',
  });

  const correction = chooseTodayPriority(
    { ...emptySummary, returnedCorrections: 2, readyForReview: 4, totalOpen: 6 },
    [{ id: 'cnt_second', status: 'counting_b' }],
  );
  assert.deepStrictEqual(correction, { kind: 'correction', count: 2 });

  const blindCheck = chooseTodayPriority(
    { ...emptySummary, readyForReview: 4, totalOpen: 4 },
    [
      { id: 'cnt_recount', status: 'recounting' },
      { id: 'cnt_second', status: 'counting_b' },
    ],
  );
  assert.deepStrictEqual(blindCheck, {
    kind: 'count_check',
    count: 2,
    countSessionId: 'cnt_recount',
  });


  const inboxReview = chooseTodayPriority(
    emptySummary,
    [{ id: 'cnt_done', status: 'matched' }],
    { needsClassification: 4, pendingReview: 2, canClassify: true, canReview: true },
  );
  assert.deepStrictEqual(inboxReview, { kind: 'inbox_review', count: 2 });

  const inboxIdentification = chooseTodayPriority(
    emptySummary,
    [{ id: 'cnt_done', status: 'matched' }],
    { needsClassification: 3, pendingReview: 2, canClassify: true, canReview: false },
  );
  assert.deepStrictEqual(inboxIdentification, { kind: 'inbox_identification', count: 3 });

  const permissionScoped = chooseTodayPriority(
    { ...emptySummary, readyForReview: 1, totalOpen: 1 },
    [{ id: 'cnt_done', status: 'matched' }],
    { needsClassification: 3, pendingReview: 2, canClassify: false, canReview: false },
  );
  assert.deepStrictEqual(permissionScoped, { kind: 'review', count: 1 });

  const countStillWins = chooseTodayPriority(
    emptySummary,
    [{ id: 'cnt_active', status: 'counting_b' }],
    { needsClassification: 5, pendingReview: 5, canClassify: true, canReview: true },
  );
  assert.deepStrictEqual(countStillWins, {
    kind: 'count_check',
    count: 1,
    countSessionId: 'cnt_active',
  });

  const review = chooseTodayPriority(
    { ...emptySummary, readyForReview: 2, totalOpen: 2 },
    [{ id: 'cnt_done', status: 'matched' }],
  );
  assert.deepStrictEqual(review, { kind: 'review', count: 2 });

  const signalBackedCorrection = chooseTodayPriority(
    { ...emptySummary, returnedCorrections: 2, totalOpen: 2 },
    [],
    undefined,
    { items: [signal('TRANSACTION_CORRECTION_REQUIRED', 'tx_correction')] },
  );
  assert.deepStrictEqual(signalBackedCorrection, {
    kind: 'correction',
    count: 2,
    signalId: 'signal_transaction_correction_required',
    signalEntityId: 'tx_correction',
    sourceBacked: true,
  });

  const matchedCountSignal = chooseTodayPriority(
    emptySummary,
    [
      { id: 'cnt_other', status: 'matched' },
      { id: 'cnt_divergent', status: 'divergent' },
    ],
    undefined,
    {
      items: [
        signal('COUNT_DIVERGENCE_REVIEW_REQUIRED', 'cnt_wrong', 'signal_wrong'),
        signal('COUNT_DIVERGENCE_REVIEW_REQUIRED', 'cnt_divergent', 'signal_matching'),
      ],
    },
  );
  assert.deepStrictEqual(matchedCountSignal, {
    kind: 'count_divergence',
    count: 1,
    countSessionId: 'cnt_divergent',
    signalId: 'signal_matching',
    signalEntityId: 'cnt_divergent',
    sourceBacked: true,
  });

  const staleSignalCannotInventWork = chooseTodayPriority(
    { ...emptySummary, readyForReview: 1, totalOpen: 1 },
    [{ id: 'cnt_done', status: 'matched' }],
    undefined,
    {
      items: [
        signal('TRANSACTION_CORRECTION_REQUIRED', 'tx_stale', 'signal_stale'),
        signal('TRANSACTION_REVIEW_REQUIRED', 'tx_review', 'signal_review'),
      ],
    },
  );
  assert.deepStrictEqual(staleSignalCannotInventWork, {
    kind: 'review',
    count: 1,
    signalId: 'signal_review',
    signalEntityId: 'tx_review',
    sourceBacked: true,
  });

  const signalAloneNeverCreatesPriority = chooseTodayPriority(
    emptySummary,
    [{ id: 'cnt_done', status: 'matched' }],
    { needsClassification: 0, pendingReview: 0, canClassify: true, canReview: true },
    { items: [signal('TRANSACTION_CORRECTION_REQUIRED', 'tx_signal_only')] },
  );
  assert.deepStrictEqual(signalAloneNeverCreatesPriority, { kind: 'clear', count: 0 });


  const operatorIgnoresReviewQueue = chooseTodayPriority(
    { ...emptySummary, readyForReview: 5, simpleDrafts: 2, totalOpen: 7 },
    [],
    undefined,
    undefined,
    { canCreate: true, canReview: false, canApprove: false, canCount: true },
  );
  assert.deepStrictEqual(operatorIgnoresReviewQueue, { kind: 'draft', count: 2 });

  const reviewerIgnoresDraftsAndCorrections = chooseTodayPriority(
    {
      ...emptySummary,
      returnedCorrections: 3,
      simpleDrafts: 4,
      readyForReview: 2,
      totalOpen: 9,
    },
    [],
    undefined,
    undefined,
    { canCreate: false, canReview: true, canApprove: false, canCount: false },
  );
  assert.deepStrictEqual(reviewerIgnoresDraftsAndCorrections, { kind: 'review', count: 2 });

  const viewerGetsNoActionableTransactionPriority = chooseTodayPriority(
    {
      ...emptySummary,
      returnedCorrections: 2,
      simpleDrafts: 2,
      readyForReview: 2,
      approvedForPosting: 2,
      totalOpen: 8,
    },
    [],
    undefined,
    undefined,
    { canCreate: false, canReview: false, canApprove: false, canCount: false },
  );
  assert.deepStrictEqual(viewerGetsNoActionableTransactionPriority, { kind: 'clear', count: 0 });


  const reviewerCannotReceiveCountMutationPriority = chooseTodayPriority(
    { ...emptySummary, readyForReview: 1, totalOpen: 1 },
    [
      { id: 'cnt_divergent', status: 'divergent' },
      { id: 'cnt_check', status: 'counting_b' },
    ],
    undefined,
    undefined,
    { canCreate: false, canReview: true, canApprove: false, canCount: false },
  );
  assert.deepStrictEqual(reviewerCannotReceiveCountMutationPriority, { kind: 'review', count: 1 });

  const clear = chooseTodayPriority(emptySummary, [
    { id: 'cnt_done', status: 'matched' },
    { id: 'cnt_first', status: 'counting_a' },
  ]);
  assert.deepStrictEqual(clear, { kind: 'clear', count: 0 });

  console.log('✅ Today priority model keeps authoritative state primary and uses verified signals only as explainable enrichment');
}

run();
