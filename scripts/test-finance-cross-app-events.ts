import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  NESTFINANCE_BLUEPRINT_CROSS_APP_EVENTS,
  NESTFINANCE_CROSS_APP_EVENT_IMPLEMENTATION,
} from '../shared/intelligence/financeCrossAppEvents.js';
import { NESTFINANCE_FACT_EVENT_TYPES } from '../shared/intelligence/canonicalFact.js';

const expected = [
  'COUNT_OPENED',
  'COUNT_COMPLETED',
  'RECONCILIATION_STARTED',
  'RECONCILIATION_EXCEPTION_FOUND',
  'RECONCILIATION_COMPLETED',
  'INBOX_ITEM_CREATED',
  'INBOX_ITEM_RESOLVED',
  'REPORT_READY',
  'ENTRY_POSTED',
  'REVERSAL_POSTED',
  'AUDIT_EVENT_RECORDED',
] as const;

assert.deepStrictEqual(
  NESTFINANCE_BLUEPRINT_CROSS_APP_EVENTS,
  expected,
  'cross-app vocabulary must remain exactly aligned with the NestFinance blueprint',
);

for (const eventType of expected) {
  assert.ok(
    NESTFINANCE_CROSS_APP_EVENT_IMPLEMENTATION[eventType],
    `${eventType} must have an explicit implementation state`,
  );
}

for (const eventType of [
  'COUNT_OPENED',
  'COUNT_COMPLETED',
  'RECONCILIATION_STARTED',
  'RECONCILIATION_EXCEPTION_FOUND',
  'INBOX_ITEM_CREATED',
  'INBOX_ITEM_RESOLVED',
  'REPORT_READY',
] as const) {
  assert.equal(
    NESTFINANCE_CROSS_APP_EVENT_IMPLEMENTATION[eventType].state,
    'emitted',
    `${eventType} must be backed by a real source mutation`,
  );
}

assert.equal(
  NESTFINANCE_CROSS_APP_EVENT_IMPLEMENTATION.ENTRY_POSTED.state,
  'blocked_by_posting',
);
assert.equal(
  NESTFINANCE_CROSS_APP_EVENT_IMPLEMENTATION.REVERSAL_POSTED.state,
  'blocked_by_posting',
);
assert.ok(NESTFINANCE_FACT_EVENT_TYPES.includes('REPORT_READY'));
assert.ok(NESTFINANCE_FACT_EVENT_TYPES.includes('RECONCILIATION_STARTED'));
assert.ok(NESTFINANCE_FACT_EVENT_TYPES.includes('RECONCILIATION_EXCEPTION_FOUND'));

const evidence = readFileSync(
  'server/vercel-handlers/finance/universalEvidenceFinalize.ts',
  'utf8',
);
const review = readFileSync(
  'server/vercel-handlers/finance/periodCloseReviewConfirm.ts',
  'utf8',
);
const financeHandlers = readFileSync(
  'scripts/test-transaction-fact-coverage.ts',
  'utf8',
);

const nonDuplicateStart = evidence.indexOf('if (!duplicate) {');
const inboxFact = evidence.indexOf("eventType: 'INBOX_ITEM_CREATED'", nonDuplicateStart);
const signalOpen = evidence.indexOf('stageFinanceSignalOpen', nonDuplicateStart);
assert.ok(nonDuplicateStart >= 0 && inboxFact > nonDuplicateStart);
assert.ok(signalOpen > inboxFact);
assert.ok(
  evidence.slice(inboxFact, signalOpen).includes('causationId: factId'),
  'Inbox creation must remain causally linked to the original document attachment fact',
);
assert.ok(
  !evidence.slice(inboxFact, signalOpen).includes('verifiedMimeType') &&
    !evidence.slice(inboxFact, signalOpen).includes('byteSize') &&
    !evidence.slice(inboxFact, signalOpen).includes('originalSha256'),
  'cross-app Inbox event must not copy document internals',
);

assert.ok(review.includes("eventType: 'REPORT_READY'"));
assert.ok(review.includes("readinessState: 'ready_for_review'"));
assert.ok(review.includes('blockerCount: 0'));
assert.ok(review.includes('officialReport: false'));
assert.ok(review.includes('periodClosed: false'));
assert.ok(review.includes("{ kind: 'record', ref: reviewRef.path, version: 1 }"));
assert.ok(review.includes("{ kind: 'audit', ref: auditRef.path }"));

for (const forbidden of [
  'capturedIncomeCents',
  'capturedExpenseCents',
  'postedIncomeCents',
  'postedExpenseCents',
  'reviewedByDisplayName',
]) {
  const factStart = review.indexOf("eventType: 'REPORT_READY'");
  const factEnd = review.indexOf('\n      });', factStart);
  assert.ok(
    !review.slice(factStart, factEnd).includes(forbidden),
    `REPORT_READY payload must not expose ${forbidden}`,
  );
}

assert.ok(
  financeHandlers.includes("does not claim posting before a real posting mutation exists"),
  'posting guard remains certified',
);

for (const reserved of [
  'RECONCILIATION_COMPLETED',
  'AUDIT_EVENT_RECORDED',
] as const) {
  assert.equal(
    NESTFINANCE_CROSS_APP_EVENT_IMPLEMENTATION[reserved].state,
    'reserved',
    `${reserved} must not be advertised as emitted before its lifecycle boundary is certified`,
  );
}

console.log('✅ Cross-app finance event contract is exact, source-backed and does not overclaim posting/reconciliation state');
