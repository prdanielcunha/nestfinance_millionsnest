import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const today = read('src/pages/finance/TodayActionCenter.tsx');
const overview = read('src/pages/finance/TodayLedgerOverview.tsx');
const start = read('src/pages/finance/count/CountStartJourney.tsx');
const count = read('src/pages/finance/count/CountSessionPage.tsx');

// T04: the visual hierarchy is live, not a detached mock or a fake balance.
assert.ok(today.includes('<TodayLedgerOverview'));
assert.ok(today.includes('operational={operational}'));
assert.ok(today.includes('nextTitle={priorityPresentation.title}'));
assert.ok(today.includes('onNext={() => navigate(priorityPresentation.route)}'));
assert.ok(today.includes('onRegister={() => navigate(APP_ROUTES.universalCapture)}'));
assert.ok(today.includes('canRegister={canCreate}'));
assert.ok(today.includes('transactionsToReview={effectiveSummary.readyForReview}'));
assert.ok(today.includes('documentsToReview={effectiveInboxSummary.pendingReview}'));
assert.ok(today.includes('countInProgress={activeCount ? { serviceLabel: activeCount.serviceLabel } : null}'));
assert.ok(today.includes('<details className='));
assert.ok(today.includes('defaultOpen={experienceMode ==='));
// Existing advanced and accountant surfaces must not disappear.
assert.ok(today.includes('<RoleWorkspacePanel'));
assert.ok(today.includes('<SinceLastVisitCard'));
assert.ok(today.includes('summaryItems.map'));
assert.ok(today.includes('recent.map('));
assert.ok(overview.includes("operational?.balance.state === 'available'"));
assert.ok(overview.includes('operational.balance.amountCents / 100'));
assert.ok(overview.includes('balanceUnknown'));
assert.ok(overview.includes('operational?.dueSoonCount ?? null'));
assert.ok(overview.includes('operational?.dueSoonTruncated'));
assert.ok(overview.includes('canRegister ? <button'));
assert.ok(!overview.includes('1800') && !overview.includes('47000'),
  'Visual samples must not appear as real monetary amounts');

// T05: camera/paper is primary, direct entry is secondary, alternatives remain.
const methodStep = start.slice(start.indexOf("{step === 'method' ? ("));
assert.ok(methodStep.indexOf("start('free_form')") < methodStep.indexOf("start('digital')"),
  'Paper photo must appear before typing on the method selection screen');
assert.ok(methodStep.includes('<details className='));
assert.ok(methodStep.includes("start('paper')"));
assert.ok(methodStep.includes("start('voice')"));
assert.ok(methodStep.includes('disabled={creating}'));
assert.ok(start.includes('SpeakInstructionButton'));
assert.ok(start.includes('FlowHelp'));
assert.ok(start.includes("step === 'context'"));
assert.ok(start.includes('ACTIVE_STATUSES'));
assert.ok(start.includes('localDateInputValue()'));
assert.ok(start.includes("setStep('details')"));

// T06/T07: simple total is the default but bill counting remains available.
assert.ok(count.includes("useState<CountEntryMethod>('total')"));
assert.ok(count.includes("existing?.method || 'total'"));
assert.ok(count.includes('setZeroExplicit(true)'));
assert.ok(count.includes('workingTotal === 0 && !zeroExplicit'));
assert.ok(count.includes('setZeroRequired(true)'));
assert.ok(count.includes('autosaveCopy.noMoney'));
assert.ok(count.includes('autosaveCopy.zeroRequired'));
assert.ok(!count.includes('workingTotal === 0 ? 0 : 0'), 'Zero must be deliberate');
assert.ok(count.includes("['denominations', copy.denominationMode]"));
assert.ok(count.includes('calculateDenominationTotalCents'));
assert.ok(count.includes("countDraftPersistence.save"));
assert.ok(count.includes('sm:col-span-1'));
for (const source of [today, overview, start, count]) {
  assert.ok(!source.includes('status: \'posted\''), 'UX must not perform posting');
}
for (const language of ['PT:', 'EN:', 'ES:']) {
  assert.ok(overview.includes(language));
}
console.log('✅ Specification 15/10 T04-T07 experience gate passed');
