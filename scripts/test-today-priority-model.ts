import assert from 'assert';
import { chooseTodayPriority } from '../src/pages/finance/todayPriorityModel.js';

const emptySummary = {
  returnedCorrections: 0,
  simpleDrafts: 0,
  readyForReview: 0,
  approvedForPosting: 0,
  totalOpen: 0,
};

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

  const clear = chooseTodayPriority(emptySummary, [
    { id: 'cnt_done', status: 'matched' },
    { id: 'cnt_first', status: 'counting_a' },
  ]);
  assert.deepStrictEqual(clear, { kind: 'clear', count: 0 });

  console.log('✅ Today priority model keeps Count and Inbox attention simple, permission-scoped and deterministic');
}

run();
