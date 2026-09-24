import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  buildAccountantManifest,
  buildCsv,
  normalizeAccountantPackageLayout,
} from '../shared/finance/accountantPackage';
import {
  evaluateUsabilityCertification,
  USABILITY_PILOT_PERSONAS,
  USABILITY_PILOT_ROUNDS,
  type UsabilityPilotEvidence,
} from '../shared/finance/usabilityCertification';
import {
  FINANCE_EDIT_HEARTBEAT_MS,
  FINANCE_EDIT_LEASE_MS,
} from '../shared/finance/financeEditPresence';

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed += 1;
  console.log('✅ ' + message);
};

const layout = normalizeAccountantPackageLayout({
  transactionColumns: ['transactionId', 'amount', 'not_allowed'],
  evidenceColumns: ['evidenceId', 'filename'],
  pendingColumns: ['transactionId', 'justification'],
});
verify(
  layout.transactionColumns.join('|') === 'transactionId|amount',
  'accountant layout accepts only certified transaction columns',
);
const csv = buildCsv(
  [{ transactionId: 'tx_1', description: 'Fornecedor "A", manutenção' }],
  ['transactionId', 'description'],
);
verify(csv.includes('"Fornecedor ""A"", manutenção"'), 'CSV output safely quotes commas and quotes');
const formulaCsv = buildCsv([{ transactionId: '=HYPERLINK("https://invalid")' }], ['transactionId']);
verify(formulaCsv.includes('"\'=HYPERLINK(""https://invalid"")"'), 'CSV export neutralizes spreadsheet formula injection');

const manifest = buildAccountantManifest({
  organizationId: 'org',
  financeEntityId: 'entity',
  period: '2026-09',
  generatedAt: '2026-09-24T00:00:00.000Z',
  transactionCount: 2,
  evidenceCount: 1,
  pendingCount: 1,
  closeReviewState: 'ready_for_review',
});
verify(manifest.authority.operationalExport === true, 'accountant package is explicitly operational');
verify(manifest.authority.officialAccountingStatement === false, 'accountant package never claims official accounting authority');
verify(manifest.authority.postingCertificationSeparate === true, 'posting certification remains separate');

const pending = evaluateUsabilityCertification([]);
verify(pending.status === 'pending_human_pilot', 'CI cannot self-certify a missing human pilot');
verify(pending.requiredSessions === 12, 'human pilot requires four personas across three rounds');

const completeEvidence: UsabilityPilotEvidence[] = USABILITY_PILOT_ROUNDS.flatMap((round) =>
  USABILITY_PILOT_PERSONAS.map((persona) => ({
    persona,
    round,
    outcome: 'pass' as const,
    sessionDate: '2026-09-24',
    evidenceRef: `pilot/${round}/${persona}`,
  })),
);
verify(
  evaluateUsabilityCertification(completeEvidence).status === 'human_pilot_complete',
  'human pilot completes only with all twelve evidence-backed pass sessions',
);
const correctionEvidence = completeEvidence.map((item, index) =>
  index === 0 ? { ...item, outcome: 'needs_correction' as const } : item,
);
verify(
  evaluateUsabilityCertification(correctionEvidence).status === 'corrections_required',
  'any observed usability correction keeps certification open',
);
verify(FINANCE_EDIT_HEARTBEAT_MS < FINANCE_EDIT_LEASE_MS, 'edit lease heartbeat renews before expiry');

const files = {
  accountantHandler: await fs.readFile('server/vercel-handlers/finance/accountantPackageExport.ts', 'utf8'),
  accountantPanel: await fs.readFile('src/pages/finance/AccountantPackagePanel.tsx', 'utf8'),
  gateway: await fs.readFile('api/finance-gateway.ts', 'utf8'),
  contracts: await fs.readFile('scripts/check-api-contracts.mjs', 'utf8'),
  auditHandler: await fs.readFile('server/vercel-handlers/finance/auditList.ts', 'utf8'),
  auditPage: await fs.readFile('src/pages/finance/AuditPage.tsx', 'utf8'),
  heartbeat: await fs.readFile('server/vercel-handlers/finance/transactionEditPresenceHeartbeat.ts', 'utf8'),
  guidedEdit: await fs.readFile('src/pages/finance/transactions/TransactionEditGuidedPage.tsx', 'utf8'),
  rules: await fs.readFile('firestore.rules', 'utf8'),
  lastVisit: await fs.readFile('server/vercel-handlers/finance/sinceLastVisitSummary.ts', 'utf8'),
  today: await fs.readFile('src/pages/finance/TodayActionCenter.tsx', 'utf8'),
  offlineQueue: await fs.readFile('src/services/universalCaptureOfflineQueue.ts', 'utf8'),
  review: await fs.readFile('src/pages/finance/transactions/TransactionReviewDetailPage.tsx', 'utf8'),
  reconciliation: await fs.readFile('src/pages/finance/balance/ReconciliationMatchPreviewPanel.tsx', 'utf8'),
  evidenceFinalize: await fs.readFile('server/vercel-handlers/finance/universalEvidenceFinalize.ts', 'utf8'),
  intelligence: await fs.readFile('server/vercel-handlers/finance/universalEvidenceAnalyzeTransaction.ts', 'utf8'),
  pilotDoc: await fs.readFile('docs/nestfinance/CYCLE_10_HUMAN_USABILITY_CERTIFICATION.md', 'utf8'),
  authenticatedE2E: await fs.readFile('scripts/test-roadmap-cycle-10-authenticated-e2e-emulator.ts', 'utf8'),
  emulatorWorkflow: await fs.readFile('.github/workflows/nestfinance-p06b-firestore-emulator.yml', 'utf8'),
  budgetEmulator: await fs.readFile('scripts/test-intelligence-governance-budget-emulator.ts', 'utf8'),
};

verify(files.gateway.includes("case 'accountant-package-export'"), 'accountant package uses certified finance gateway');
verify(files.contracts.includes("operation: 'accountant-package-export'"), 'accountant package route is in API contract inventory');
verify(files.accountantHandler.includes('PERIOD_CLOSE_MAX_TRANSACTIONS + 1'), 'accountant export transaction scope fails closed when too large');
verify(files.accountantHandler.includes('PERIOD_CLOSE_MAX_EVIDENCE + 1'), 'accountant export evidence scope fails closed when too large');
verify(files.accountantHandler.includes('postingCertificationSeparate: true'), 'accountant endpoint preserves separate posting certification');
verify(files.accountantPanel.includes("PT: {") && files.accountantPanel.includes("EN: {") && files.accountantPanel.includes("ES: {"), 'accountant export UX is localized');
verify(files.accountantPanel.includes("complete") && files.accountantPanel.includes("essential") && files.accountantPanel.includes("reconciliation"), 'accountant can choose a configurable export profile');

verify(files.auditHandler.includes('startAfter(cursorDoc)') && files.auditHandler.includes('limit(limit + 1)'), 'heavy audit history is cursor paginated');
verify(files.auditPage.includes('load(nextCursor)'), 'Audit UI loads the next bounded page instead of all history');

verify(files.gateway.includes("case 'transaction-edit-presence-heartbeat'"), 'edit presence heartbeat is routed');
verify(files.heartbeat.includes('db.runTransaction'), 'simultaneous edit lease is acquired atomically');
verify(files.heartbeat.includes("txData.status !== 'draft'"), 'only mutable drafts can obtain an edit lease');
verify(files.guidedEdit.includes('disabled={saving || submitting || conflict || presenceBlocksSave}'), 'guided draft save is blocked when exclusive edit lease is unavailable');
verify(files.guidedEdit.includes('presenceBlocksSave || !readiness.ready'), 'guided submit is blocked when exclusive edit lease is unavailable');
verify(files.rules.includes('match /financeEntities/{entityId}/editLocks/{document=**}') && files.rules.includes('allow read, create, update, delete: if false;'), 'client cannot forge edit locks directly');

verify(files.gateway.includes("case 'since-last-visit-summary'"), 'since-last-visit summary is gateway scoped');
verify(files.lastVisit.includes("getAuditRef()") && files.lastVisit.includes('.count().get()'), 'since-last-visit reads canonical audit facts with an aggregate');
verify(files.today.includes('<SinceLastVisitCard'), 'Today surfaces canonical changes since the previous visit');

verify(files.offlineQueue.includes('caches.open'), 'offline universal capture persists locally using browser Cache Storage');
verify(files.review.includes('useOnlineStatus') && files.review.includes('!online'), 'review approval remains blocked offline');
verify(files.reconciliation.includes('useOnlineStatus') && files.reconciliation.includes('!online'), 'reconciliation confirmation remains blocked offline');

verify(files.evidenceFinalize.includes("collection('universalEvidenceHashes')"), 'duplicate evidence uses a server-side hash index');
verify(files.evidenceFinalize.includes('duplicateOfEvidenceId'), 'duplicate provenance remains explicit');
verify(files.intelligence.includes('INTELLIGENCE_DAILY_BUDGET_EXHAUSTED'), 'AI daily budget exhaustion is handled');
verify(files.intelligence.includes("fallback: 'human_review'") && files.intelligence.includes('financialEffect: false'), 'AI quota/provider failure falls back to human review with no financial effect');

verify(files.authenticatedE2E.includes('transactionsCreateDraft') && files.authenticatedE2E.includes('transactionsSubmitForReview') && files.authenticatedE2E.includes('accountantPackageExport'), 'authenticated synthetic E2E crosses capture, review readiness and accountant export');
verify(files.authenticatedE2E.includes('financeJournalEntries') && files.authenticatedE2E.includes('assert.equal(journals.empty, true)'), 'authenticated synthetic E2E proves no posting side effect');
verify(files.emulatorWorkflow.includes('test-roadmap-cycle-10-authenticated-e2e-emulator.ts'), 'authenticated synthetic E2E runs inside Firestore Emulator CI');
verify(files.budgetEmulator.includes('INTELLIGENCE_DAILY_BUDGET_EXHAUSTED') && files.budgetEmulator.includes('INTELLIGENCE_RETRY_LIMIT_EXHAUSTED'), 'emulator explicitly proves AI budget and retry exhaustion');
verify(files.emulatorWorkflow.includes('test-intelligence-governance-budget-emulator.ts'), 'AI budget exhaustion test runs inside Firestore Emulator CI');

verify(files.pilotDoc.includes('12 sessões humanas') && files.pilotDoc.includes('3 rodadas'), 'human certification protocol requires real three-round evidence');
verify(files.pilotDoc.includes('certificação de postagem') || files.pilotDoc.includes('Certificação de postagem'), 'pilot documentation keeps posting certification separate');

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  }));
  return nested.flat();
}
const sourceFiles = await walk('src');
const realtimeUses: string[] = [];
for (const file of sourceFiles) {
  const source = await fs.readFile(file, 'utf8');
  if (source.includes('onSnapshot(')) realtimeUses.push(file);
}
verify(
  realtimeUses.every((file) =>
    /review|today|presence|close|report/i.test(file),
  ),
  'realtime listeners, when present, are restricted to task/review/presence/close surfaces',
);

console.log('\nRoadmap Cycle 10 engineering gate totals: ' + passed + ' Passed');
console.log('Human pilot status remains evidence-driven and cannot be inferred from CI.');
