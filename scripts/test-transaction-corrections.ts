import assert from 'node:assert/strict';
import { assertTransactionEditable, normalizeTransactionCorrectionReason, transactionNeedsCorrectionReason, transactionCorrectionSnapshot } from '../shared/finance/transactionCorrection.js';
const draft = { status: 'draft', amountCents: 10000, currency: 'BRL', financeEntityId: 'synthetic_entity' };
assert.equal(transactionNeedsCorrectionReason(draft), false);
for (const marker of ['returnedToDraftAt', 'returnedToDraftBy', 'invalidatedAt', 'invalidatedBy']) {
  assert.equal(transactionNeedsCorrectionReason({ ...draft, [marker]: 'synthetic' }), true);
}
assert.equal(transactionNeedsCorrectionReason({ ...draft, approvalStatus: 'invalidated' }), true);
for (const reason of [undefined, '', 'curto', 'x'.repeat(501), {}, 123]) {
  assert.throws(() => normalizeTransactionCorrectionReason(reason, true), (error: any) => error.code === 'FINANCE_CORRECTION_REASON_REQUIRED');
}
assert.equal(normalizeTransactionCorrectionReason(undefined, false), null);
assert.equal(normalizeTransactionCorrectionReason('  Corrigido após conferir o papel  ', true), 'Corrigido após conferir o papel');
assert.doesNotThrow(() => assertTransactionEditable(draft));
for (const status of ['posted', 'reversed', 'ready_for_review', 'approved_for_posting']) {
  assert.throws(() => assertTransactionEditable({ ...draft, status }));
}
for (const marker of ['journalEntryId', 'postingId', 'postedAt', 'postedBy', 'reversalOf', 'reversedAt', 'reversedBy', 'reconciliationId', 'reconciledAt']) {
  assert.throws(() => assertTransactionEditable({ ...draft, [marker]: 'synthetic' }));
}
assert.throws(() => assertTransactionEditable({ ...draft, reconciliationStatus: 'reconciled' }));
const snapshot = transactionCorrectionSnapshot({ ...draft, actorUid: 'private', accountId: 'private', description: 'x'.repeat(4000), accountSnapshot: { name: 'Synthetic bank' } }, []);
assert.equal(snapshot.description!.length, 2000);
assert.equal(snapshot.account, 'Synthetic bank');
assert.ok(!JSON.stringify(snapshot).includes('private'));
assert.equal(snapshot.amountCents, 10000);
console.log('✅ Transaction correction domain: mandatory reasons, immutable financial states, bounded presentation and exact original amounts');
