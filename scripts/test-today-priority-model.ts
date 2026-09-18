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

  console.log('✅ Today priority model keeps Count attention simple, deterministic and source-driven');
}

run();
