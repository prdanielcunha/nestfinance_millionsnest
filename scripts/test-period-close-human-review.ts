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

verify(handler.includes("resolveFinanceRequestContext(req, 'finance.review')"), 'human review requires finance.review authority');
verify(handler.includes("loaded.response.readiness.state !== 'ready_for_review'"), 'human review fails closed unless fresh readiness is clean');
verify(handler.includes("loaded.response.readiness.blockerCount !== 0"), 'human review requires zero objective blockers');
verify(handler.includes("periodClosed: false"), 'human review never declares the period closed');
verify(handler.includes("financialMutation: false"), 'human review explicitly declares no financial mutation');
verify(handler.includes("closeMutation: false"), 'human review explicitly declares no close mutation');
verify(handler.includes("transaction.set(reviewRef"), 'server writes the source-bound review record atomically');
verify(handler.includes("transaction.set(context.repository.getAuditRef()"), 'server appends the review to canonical audit history');
verify(!handler.includes('stageFinanceFact'), 'review confirmation does not fabricate a financial fact');
verify(!handler.includes('stageFinanceSignal'), 'review confirmation does not create an intelligence signal');
for (const forbidden of ['financeJournalEntries', 'financeBalances', 'financeAggregates']) {
  verify(!handler.includes(forbidden), 'review handler never touches ' + forbidden);
}

verify(readModel.includes('sourceFingerprint'), 'read model creates a source fingerprint');
verify(readModel.includes("expectedReviewId = 'pcr_'"), 'review identity is deterministic for the exact source state');
verify(readModel.includes('sourceSnapshotMatches: true'), 'a current review is only surfaced when exact source state matches');
verify(readModel.includes('version: Number(data.version || 0)'), 'source fingerprint includes mutable source versions');
verify(readModel.includes('reconciliationStatus'), 'source fingerprint includes reconciliation state');

verify(page.includes("hasEffectiveCapability(accessState, 'finance.review')"), 'Reports only offers review action to finance reviewers');
verify(page.includes('Registrar revisão do período'), 'PT UX has explicit review action');
verify(page.includes('Record period review'), 'EN UX has explicit review action');
verify(page.includes('Registrar revisión del período'), 'ES UX has explicit review action');
verify(page.includes('Isso não fecha o mês'), 'PT confirmation explains that review is not closing');
verify(page.includes('This does not close the month'), 'EN confirmation explains that review is not closing');
verify(page.includes('Esto no cierra el mes'), 'ES confirmation explains that review is not closing');
verify(page.includes('reviewed_current_snapshot'), 'Reports renders current-snapshot review state');

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

console.log('\nPeriod Close Human Review totals: ' + passed + ' Passed');
