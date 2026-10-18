import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertCountCollectionScope, countEntryTypesForSession } from '../shared/finance/countCollectionScope.js';
import { prepareCountCorrection } from '../shared/finance/countCorrection.js';
import { normalizeCountEntries } from '../shared/finance/count.js';
import { buildReceivedIncome } from '../shared/finance/receivedIncome.js';
import { buildCountCaptureApplyPlan } from '../shared/finance/countCaptureApply.js';

const cash = normalizeCountEntries([{ type: 'tithe', method: 'total', totalCents: 10000 }]);
const pix = normalizeCountEntries([{ type: 'pix', method: 'total', totalCents: 5000 }]);
assert.deepEqual(countEntryTypesForSession({ collectionScope: 'cash_only' }), ['tithe', 'offering', 'other']);
assert.ok(countEntryTypesForSession({}).includes('pix'));
assertCountCollectionScope({}, pix);
assertCountCollectionScope({ collectionScope: 'legacy_mixed' }, pix);
assertCountCollectionScope({ collectionScope: 'cash_only' }, cash);
const reviewedFields = ['tithe', 'offering', 'other_income', 'pix'].map(key => ({ key, decision: 'corrected', valueCents: key === 'tithe' ? 10000 : 0 }));
assert.equal(buildCountCaptureApplyPlan({ collectionScope: 'cash_only', reviewedFields }).entries.length, 3);
assert.equal(buildCountCaptureApplyPlan({ reviewedFields }).entries.length, 4);
assert.throws(() => buildCountCaptureApplyPlan({ collectionScope: 'cash_only', reviewedFields: reviewedFields.map(field => field.key === 'pix' ? { ...field, valueCents: 1 } : field) }), /COUNT_CASH_ONLY_DIGITAL_SEPARATE/);
assert.throws(() => assertCountCollectionScope({ collectionScope: 'cash_only' }, [{ type: 'pix' }]), /COUNT_CASH_ONLY_DIGITAL_SEPARATE/);
const session = { collectionScope: 'cash_only', status: 'matched', version: 4, workflowState: 'counted',
  countA: { entries: cash, countedByUid: 'a' }, countB: { entries: cash, countedByUid: 'b' } };
assert.throws(() => prepareCountCorrection(session, { expectedVersion: 4, target: 'countA', actorUid: 'editor', entries: pix }), /COUNT_CASH_ONLY_DIGITAL_SEPARATE/);
const before = JSON.stringify(session);
const transactions = [
  { id: 'cash', transactionKind: 'income', status: 'posted', amountCents: 10000, currency: 'BRL', paymentMethod: 'cash', occurredAt: '2026-10-17T12:00:00Z', countSource: { countSessionId: 'cash-session', countEntryType: 'tithe', countReceiptMethod: 'cash' } },
  { id: 'late-pix', transactionKind: 'income', status: 'posted', amountCents: 5000, currency: 'BRL', paymentMethod: 'pix', occurredAt: '2026-10-17T12:00:00Z', recordedAt: '2026-10-20T12:00:00Z' },
  { id: 'later-card', transactionKind: 'income', status: 'posted', amountCents: 7000, currency: 'BRL', paymentMethod: 'credit_card', occurredAt: '2026-10-19T12:00:00Z' },
];
const report = buildReceivedIncome({ startDate: '2026-10-17', endDate: '2026-10-17', timezone: 'America/Sao_Paulo', transactions });
assert.equal(report.confirmedCents, 15000, 'Actual receipt day includes late entry once and excludes a later card settlement');
assert.equal(report.confirmedByMethod.pix, 5000);
assert.equal(JSON.stringify(session), before, 'A late digital receipt cannot reopen or change cash evidence');
for (const file of ['countSessionsSaveFirstCount', 'countSessionsSubmitSecondCount', 'countSessionsSubmitRecount', 'countSessionsStartSecondCount', 'countCapturesApplyToCount', 'countProposalHelpers']) {
  assert.ok(readFileSync(`server/vercel-handlers/finance/${file}.ts`, 'utf8').includes('assertCountCollectionScope('), `${file} must enforce stored scope on the server`);
}
console.log('✅ Cash-only scope, historical Pix compatibility, correction boundary and actual receipt date across independent digital entries');

const voice = readFileSync('src/pages/finance/count/CountVoiceQuickPage.tsx', 'utf8');
assert.ok(voice.includes('const entries: CountEntryDraft[] = entryTypes.map('));
assert.ok(voice.includes('entryTypes.map((field)'));
assert.ok(voice.includes('entryTypes.reduce('));
assert.ok(voice.includes("':digital-recovery'"));
assert.ok(voice.includes('saving || digitalDraft) return'));
