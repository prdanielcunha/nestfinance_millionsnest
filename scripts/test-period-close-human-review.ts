import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSafeAuditMetadata } from '../shared/finance/auditReadModel.js';

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log('✅ ' + message);
};

const handler = readFileSync('server/vercel-handlers/finance/periodCloseReviewConfirm.ts', 'utf8');
const readModel = readFileSync('server/vercel-handlers/finance/periodCloseReadModel.ts', 'utf8');
const page = readFileSync('src/pages/finance/ReportsPage.tsx', 'utf8');
const service = readFileSync('src/services/periodCloseService.ts', 'utf8');
const gateway = readFileSync('api/finance-gateway.ts', 'utf8');
const rules = readFileSync('firestore.rules', 'utf8');
const auditModel = readFileSync('shared/finance/auditReadModel.ts', 'utf8');
const indexes = readFileSync('firestore.indexes.json', 'utf8');

verify(handler.includes("resolveFinanceRequestContext(req, 'finance.review')"), 'human review requires finance.review authority');
verify(handler.includes("loaded.response.readiness.state !== 'ready_for_review'"), 'human review fails closed unless fresh readiness is clean');
verify(handler.includes("loaded.response.readiness.blockerCount !== 0"), 'human review requires zero objective blockers');
verify(handler.includes("periodClosed: false"), 'human review never declares the period closed');
verify(handler.includes("financialMutation: false"), 'human review explicitly declares no financial mutation');
verify(handler.includes("closeMutation: false"), 'human review explicitly declares no close mutation');
verify(handler.includes("transaction.set(reviewRef"), 'server writes the source-bound review record atomically');
verify(
  handler.includes('const auditRef = context.repository') &&
    handler.includes('.getAuditRef()') &&
    handler.includes('transaction.set(auditRef'),
  'server appends the review to canonical audit history',
);
verify(handler.includes('stageFinanceFact'), 'clean human review emits a canonical operational fact');
verify(handler.includes("eventType: 'REPORT_READY'"), 'clean human review emits REPORT_READY for ecosystem consumers');
verify(handler.includes("officialReport: false"), 'REPORT_READY never claims an official accounting report');
verify(handler.includes("periodClosed: false"), 'REPORT_READY never claims the period is closed');
verify(handler.includes("{ kind: 'record', ref: reviewRef.path, version: 1 }"), 'REPORT_READY is source-backed by the immutable review');
verify(handler.includes("{ kind: 'audit', ref: auditRef.path }"), 'REPORT_READY is source-backed by canonical audit evidence');
verify(!handler.includes('stageFinanceSignal'), 'review confirmation does not create an intelligence signal');
for (const forbidden of ['financeJournalEntries', 'financeBalances', 'financeAggregates']) {
  verify(!handler.includes(forbidden), 'review handler never touches ' + forbidden);
}

verify(readModel.includes('sourceFingerprint'), 'read model creates a source fingerprint');
verify(readModel.includes("expectedReviewId = 'pcr_'"), 'review identity is deterministic for the exact source state');
verify(readModel.includes('sourceSnapshotMatches: true'), 'a current review is only surfaced when exact source state matches');
verify(readModel.includes('version: Number(data.version || 0)'), 'source fingerprint includes mutable source versions');
verify(readModel.includes('reconciliationStatus'), 'source fingerprint includes reconciliation state');
verify(readModel.includes("'review_outdated'"), 'read model explicitly surfaces stale human reviews');
verify(readModel.includes('detectChangedAreas'), 'read model explains drift by operational area');
verify(readModel.includes("orderBy('reviewedAt', 'desc')"), 'read model uses latest prior review as stale-review reference');

verify(page.includes("hasEffectiveCapability(accessState, 'finance.review')"), 'Reports only offers review action to finance reviewers');
verify(page.includes('Registrar revisão do período'), 'PT UX has explicit review action');
verify(page.includes('Record period review'), 'EN UX has explicit review action');
verify(page.includes('Registrar revisión del período'), 'ES UX has explicit review action');
verify(page.includes('Isso não fecha o mês'), 'PT confirmation explains that review is not closing');
verify(page.includes('This does not close the month'), 'EN confirmation explains that review is not closing');
verify(page.includes('Esto no cierra el mes'), 'ES confirmation explains that review is not closing');
verify(page.includes('reviewed_current_snapshot'), 'Reports renders current-snapshot review state');
verify(page.includes('review_outdated'), 'Reports renders stale-review state explicitly');
verify(page.includes('A revisão anterior não representa mais o estado atual'), 'PT UX explains stale review without erasing history');
verify(page.includes('The previous review no longer represents the current state'), 'EN UX explains stale review without erasing history');
verify(page.includes('La revisión anterior ya no representa el estado actual'), 'ES UX explains stale review without erasing history');

verify(service.includes('operation=period-close-review-confirm'), 'client calls the certified review operation');
verify(gateway.includes("case 'period-close-review-confirm'"), 'gateway exposes review confirmation');
verify(rules.includes("match /financePeriodCloseReviews/{id=**}"), 'Firestore Rules define period review collection explicitly');
verify(rules.includes("'financePeriodCloseReviews'"), 'period reviews are covered by server-only finance collection guard');

const safe = buildSafeAuditMetadata({
  metadata: {
    periodKey: '2026-09',
    status: 'reviewed_current_snapshot',
    sourceFingerprint: 'must-not-leak',
  },
});
verify(safe.periodKey === '2026-09', 'audit read model exposes safe period context');
verify(JSON.stringify(safe).includes('must-not-leak') === false, 'audit read model never exposes source fingerprint');
verify(auditModel.includes('periodKey?: string'), 'audit metadata contract includes safe period key');
verify(indexes.includes('"collectionGroup": "financePeriodCloseReviews"'), 'review history query has an explicit Firestore index');
verify(indexes.includes('"fieldPath": "reviewedAt"'), 'review history index supports newest-review lookup');

console.log('\nPeriod Close Human Review totals: ' + passed + ' Passed');
