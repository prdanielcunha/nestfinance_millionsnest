import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [today, model] = await Promise.all([
  readFile('src/pages/finance/TodayActionCenter.tsx', 'utf8'),
  readFile('src/pages/finance/todayPriorityModel.ts', 'utf8'),
]);

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log(`✅ ${message}`);
};

const loadSignalsStart = today.indexOf('const loadSignals = useCallback');
const loadSignalsEnd = today.indexOf('const loadRecent = useCallback', loadSignalsStart);
const loadSignalsBlock = today.slice(loadSignalsStart, loadSignalsEnd);

verify(loadSignalsStart >= 0, 'Today loads Needs Attention signals');
verify(
  loadSignalsBlock.includes('needsAttentionService.summary') &&
    loadSignalsBlock.includes('setSignalSummary(null)'),
  'signal loading is additive and fails closed to no enrichment',
);
verify(
  !loadSignalsBlock.includes('setSummaryFailed') &&
    !loadSignalsBlock.includes('setCountFailed') &&
    !loadSignalsBlock.includes('setInboxFailed'),
  'signal failure cannot mark authoritative priority readers as failed',
);
verify(
  today.includes('const prioritiesFailed = summaryFailed || countFailed || inboxFailed;'),
  'primary Today error state excludes optional signal projection failure',
);
verify(
  today.includes('signalSummary ? { items: signalSummary.items } : undefined'),
  'Today passes signals only as optional priority enrichment',
);
verify(
  today.includes('needsAttentionService.detail') &&
    today.includes('result.signal.currentStateVerified === true'),
  'source explanation is fetched on demand and requires current-state verification',
);
verify(
  today.includes("APP_ROUTES.transactionEdit.replace(':transactionId', priority.signalEntityId)") &&
    today.includes("APP_ROUTES.transactionReviewDetail.replace(':transactionId', priority.signalEntityId)") &&
    today.includes("APP_ROUTES.inboxEvidenceDetail.replace(':evidenceId', priority.signalEntityId)"),
  'verified signal targets can deep-link to the specific authoritative item',
);
verify(
  model.includes('item.currentStateVerified === true'),
  'priority enrichment rejects any signal not current-state verified',
);
verify(
  model.includes('Signals may enrich an already-proven priority') &&
    model.includes('must never create'),
  'priority model documents authoritative-state-first semantics',
);
verify(
  !model.includes('actionableOpenTotal') && !model.includes('byType['),
  'priority ordering never derives work counts from the partial signal projection',
);

console.log(`\nToday hybrid signal integration totals: ${passed} Passed`);
