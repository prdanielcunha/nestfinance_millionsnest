import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCountEntries } from '../shared/finance/count.js';
import { normalizeCorrectionReason, prepareCountCorrection } from '../shared/finance/countCorrection.js';
const entries = normalizeCountEntries([{ type: 'tithe', method: 'total', totalCents: 10000 }]);
const session = { status: 'matched', version: 4, workflowState: 'counted', countA: { entries, countedByUid: 'synthetic_a' }, countB: { entries, countedByUid: 'synthetic_b' } };
const command = { expectedVersion: 4, target: 'countA' as const, actorUid: 'synthetic_a', entries: [{ type: 'tithe', method: 'total', totalCents: 11000 }] };
assert.equal(normalizeCorrectionReason('  Motivo sintético da correção  '), 'Motivo sintético da correção');
for (const reason of [undefined, '', 'breve', 'x'.repeat(501)]) assert.throws(() => normalizeCorrectionReason(reason), /COUNT_CORRECTION_REASON_REQUIRED/);
const result = prepareCountCorrection(session, command);
assert.equal(result.totalCents, 11000); assert.equal(result.status, 'divergent');
assert.equal(session.countA.entries[0].totalCents, 10000, 'Pure preparation cannot change original evidence');
for (const [patch, code] of [
  [{ status: 'recounting' }, 'COUNT_CORRECTION_INVALID_STATE'],
  [{ version: 5 }, 'COUNT_VERSION_CONFLICT'],
  [{ countProposal: { transactionIds: ['synthetic_tx'] } }, 'COUNT_CORRECTION_LINKED_ADJUSTMENT_REQUIRED'],
  [{ workflowState: 'closed' }, 'COUNT_CORRECTION_LINKED_ADJUSTMENT_REQUIRED'],
  [{ workflowState: 'reconciled' }, 'COUNT_CORRECTION_LINKED_ADJUSTMENT_REQUIRED'],
  [{ corrections: Array(50).fill({}) }, 'COUNT_CORRECTION_LIMIT_REACHED'],
  [{ countB: null }, 'COUNT_CORRECTION_REQUIRES_BOTH_COUNTS'],
] as const) assert.throws(() => prepareCountCorrection({ ...session, ...patch }, command), new RegExp(code));
assert.throws(() => prepareCountCorrection(session, { ...command, actorUid: 'synthetic_b' }), /INDEPENDENT_COUNTER_REQUIRED/);
assert.throws(() => prepareCountCorrection({ ...session, countB: { ...session.countB, enteredByUid: 'synthetic_editor' } },
  { ...command, actorUid: 'synthetic_editor' }), /INDEPENDENT_COUNTER_REQUIRED/, 'A third-party editor cannot correct both counts to fabricate a match');
assert.throws(() => prepareCountCorrection(session, { ...command, entries }), /NO_CHANGE/);
assert.throws(() => prepareCountCorrection(session, { ...command, entries: [] }), /EMPTY_CORRECTION/);
const zeroEntries = [{ type: 'tithe', method: 'total', totalCents: 0 }];
assert.throws(() => prepareCountCorrection(session, { ...command, entries: zeroEntries }), /ZERO_CONFIRMATION_REQUIRED/);
assert.equal(prepareCountCorrection(session, { ...command, entries: zeroEntries, confirmedZeroEntryTypes: ['tithe'] }).totalCents, 0);
assert.throws(() => prepareCountCorrection(session, { ...command, confirmedZeroEntryTypes: ['invalid'] }), /INVALID_ZERO_CONFIRMATIONS/);
assert.throws(() => prepareCountCorrection(session, { ...command, entries: [{ type: 'tithe', method: 'total', totalCents: -1 }] }), /COUNT_INVALID_TOTAL/);
const handler = readFileSync('server/vercel-handlers/finance/countSessionsCorrect.ts', 'utf8');
assert.ok(handler.includes("resolveFinanceRequestContext(req, 'finance.manage')"));
assert.ok(handler.includes("}, 'create')"), 'Audit evidence is append-only, not an upsert');
assert.ok(handler.includes('before: session[target], after'));
assert.ok(handler.includes('actorUid: uid, actorLabel, changedAt'));
assert.ok(!handler.includes('getTransactionsRef()') && !handler.includes('getAggregatesRef()'));
const serializer = readFileSync('server/vercel-handlers/finance/countSessionsDetail.ts', 'utf8');
assert.ok(serializer.includes('corrections: materialHidden ? []'));
console.log('✅ Audited Count corrections: mandatory reason, original preservation, independent verification, finalized-source boundary and blind history');

// Replacing an editor must not erase participation in an independent side.
for (const target of ['countA', 'countB'] as const) {
  const otherTarget = target === 'countA' ? 'countB' : 'countA';
  const priorEditor = 'synthetic_prior_editor';
  const history = [
    { target: otherTarget, actorUid: priorEditor, before: session[otherTarget], after: { enteredByUid: priorEditor } },
    { target: otherTarget, actorUid: 'synthetic_later_editor', before: { enteredByUid: priorEditor }, after: { enteredByUid: 'synthetic_later_editor' } },
  ];
  const rotated = { ...session, [otherTarget]: { ...session[otherTarget], enteredByUid: 'synthetic_later_editor' }, corrections: history };
  assert.throws(() => prepareCountCorrection(rotated, { ...command, target, actorUid: priorEditor }), /INDEPENDENT_COUNTER_REQUIRED/);
  // Original physical operators also remain participants when later material omits them.
  assert.throws(() => prepareCountCorrection({ ...rotated, corrections: [{ target: otherTarget,
    before: { countedByUid: priorEditor }, after: {} }] }, { ...command, target, actorUid: priorEditor }), /INDEPENDENT_COUNTER_REQUIRED/);
  assert.equal(prepareCountCorrection(rotated, { ...command, target, actorUid: 'synthetic_independent_editor' }).status, 'divergent');
}
