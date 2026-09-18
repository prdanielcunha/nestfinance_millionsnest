import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildReconciliationProgress } from '../shared/finance/reconciliationProgressBuilder.js';
import type { PreparedStatementLine } from '../shared/finance/reconciliationStatementLines.js';
import type { ReconciliationMatchPreviewResult } from '../shared/finance/reconciliationMatchPreview.js';

function line(
  lineNumber: number,
  overrides: Partial<PreparedStatementLine> = {},
): PreparedStatementLine {
  return {
    lineNumber,
    raw: '02/09/2026 ITEM ' + lineNumber + ' 100,00 C',
    lineLimited: false,
    dateCandidates: [
      {
        raw: '02/09/2026',
        normalized: '2026-09-02',
        start: 0,
        end: 10,
        evidence: 'validated',
      },
    ],
    amountCandidates: [
      {
        raw: '100,00 C',
        normalized: 'BRL:10000',
        amountCents: 10000,
        start: 20,
        end: 28,
        currency: null,
        direction: 'inflow',
        directionEvidence: 'credit_marker',
      },
    ],
    selectedDate: '2026-09-02',
    selectedAmountCents: 10000,
    selectedDirection: 'inflow',
    descriptionCandidate: 'ITEM ' + lineNumber,
    parseState: 'prepared',
    semanticState: 'unconfirmed',
    requiresConfirmation: true,
    source: 'native_text',
    derivedBy: 'deterministic_rule',
    aiUsed: false,
    ocrUsed: false,
    userConfirmed: false,
    ...overrides,
  };
}

const preview: ReconciliationMatchPreviewResult = {
  deterministic: true,
  matchedPreparedLines: 4,
  skippedUnconfirmedLines: 1,
  singleCandidateLines: 1,
  multipleCandidateLines: 1,
  noCandidateLines: 2,
  requiresHumanConfirmation: true,
  autoSelected: false,
  lines: [
    {
      lineNumber: 1,
      sourceDate: '2026-09-02',
      sourceAmountCents: 10000,
      sourceDirection: 'inflow',
      sourceDescription: 'ITEM 1',
      state: 'no_candidate',
      totalCandidates: 0,
      candidateLimitReached: false,
      candidates: [],
      requiresHumanConfirmation: true,
    },
    {
      lineNumber: 2,
      sourceDate: '2026-09-02',
      sourceAmountCents: 10000,
      sourceDirection: 'inflow',
      sourceDescription: 'ITEM 2',
      state: 'single_candidate',
      totalCandidates: 1,
      candidateLimitReached: false,
      candidates: [],
      requiresHumanConfirmation: true,
    },
    {
      lineNumber: 3,
      sourceDate: '2026-09-02',
      sourceAmountCents: 10000,
      sourceDirection: 'inflow',
      sourceDescription: 'ITEM 3',
      state: 'multiple_candidates',
      totalCandidates: 2,
      candidateLimitReached: false,
      candidates: [],
      requiresHumanConfirmation: true,
    },
    {
      lineNumber: 4,
      sourceDate: '2026-09-02',
      sourceAmountCents: 10000,
      sourceDirection: 'inflow',
      sourceDescription: 'ITEM 4',
      state: 'no_candidate',
      totalCandidates: 0,
      candidateLimitReached: false,
      candidates: [],
      requiresHumanConfirmation: true,
    },
  ],
};

const result = buildReconciliationProgress({
  financeEntityId: 'ent_progress',
  evidenceId: 'evd_' + 'a'.repeat(32),
  accountId: 'acc_progress',
  preparedLines: [
    line(1),
    line(2),
    line(3),
    line(4),
    line(5, {
      parseState: 'needs_direction_confirmation',
      selectedDirection: 'unknown',
    }),
    line(6),
  ],
  preview,
  confirmations: [
    {
      lineNumber: 1,
      status: 'active',
      transactionId: 'tx_' + '1'.repeat(16),
      reconciliationId: 'rec_' + '1'.repeat(64),
    },
    {
      lineNumber: 2,
      status: 'released',
      transactionId: null,
      reconciliationId: null,
    },
  ],
});

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log('✅ ' + message);
};

verify(
  result.lines[0]?.state === 'confirmed' &&
    result.lines[0]?.activeTransactionId === 'tx_' + '1'.repeat(16),
  'verified active reconciliation overrides no-candidate preview and remains confirmed',
);
verify(
  result.lines[1]?.state === 'needs_recheck' &&
    result.lines[1]?.activeTransactionId === null,
  'released line lock overrides a new possible match and requires recheck',
);
verify(
  result.lines[2]?.state === 'multiple_possibilities' &&
    result.lines[2]?.candidateCount === 2,
  'multiple deterministic candidates remain multiple possibilities',
);
verify(
  result.lines[3]?.state === 'no_match',
  'prepared item without a current candidate is explicitly no-match',
);
verify(
  result.lines[4]?.state === 'needs_review',
  'ambiguous source item remains human-review work',
);
verify(
  result.lines[5]?.state === 'no_match',
  'prepared item missing from preview fails conservatively to no-match',
);
verify(
  result.summary.recognizedItems === 6 &&
    result.summary.confirmedItems === 1 &&
    result.summary.remainingItems === 5 &&
    result.summary.needsRecheckItems === 1 &&
    result.summary.needsReviewItems === 1 &&
    result.summary.multiplePossibilityItems === 1 &&
    result.summary.noMatchItems === 2,
  'summary is a transparent count of recognized items and current states',
);
verify(
  result.scope === 'recognized_native_text_items_only' &&
    result.canDeclareStatementFullyReconciled === false &&
    result.financialMutation === false &&
    result.reconciliationMutation === false &&
    result.aiUsed === false &&
    result.ocrUsed === false,
  'progress contract never upgrades recognized-item coverage into full statement reconciliation authority',
);

const source = await readFile('shared/finance/reconciliationProgressBuilder.ts', 'utf8');
for (const forbidden of [
  'generateContent',
  '@google/genai',
  'OpenAI',
  'firebase-admin',
  'firestore',
  'fetch(',
  'Math.random',
  '100%',
]) {
  verify(!source.includes(forbidden), 'progress builder has no dependency/claim on ' + forbidden);
}

console.log('\nReconciliation Progress Builder totals: ' + passed + ' Passed');
