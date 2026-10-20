import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import { postingExecutionFixture as fixture } from './fixtures/postingExecutionFixture.js';
import { seedPostingExecution } from './fixtures/seedPostingExecution.js';
import { executeLedgerPosting } from '../server/vercel-handlers/finance/ledgerExecutionStore.js';
import { executeLedgerReversal } from '../server/vercel-handlers/finance/ledgerReversalStore.js';
import { previewLedgerInitialization, initializeLedger } from '../server/vercel-handlers/finance/ledgerInitialization.js';
import approve from '../server/vercel-handlers/finance/transactionsApproveForPosting.js';

if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '') ||
  !process.env.FIREBASE_PROJECT_ID?.startsWith('demo-')) throw new Error('Isolated loopback demo emulator required');
resetFirebaseAdminForTests(); const admin = getFirebaseAdmin(); const db = admin.firestore;
const previousFlag = process.env.NESTFINANCE_LEDGER_POSTING_ENABLED;
const unique = () => 'synthetic_' + randomBytes(10).toString('hex');
const commandFor = (input: ReturnType<typeof fixture>) => ({ db, organizationId: input.transaction.organizationId,
  financeEntityId: input.transaction.financeEntityId, actorUid: 'synthetic_poster', command: { transactionId: input.transaction.id,
    expectedVersion: input.expectedVersion, idempotencyKey: unique(), requestId: unique() } });
class Res { statusCode = 200; body: any; setHeader() { return this; } status(value: number) { this.statusCode = value; return this; } json(value: any) { this.body = value; return this; } }

try {
  process.env.NESTFINANCE_LEDGER_POSTING_ENABLED = 'true';
  for (const [kind, accountId] of [['income', 'cash'], ['expense', 'cash'], ['expense', 'liability'], ['transfer', 'cash'], ['liability_settlement', 'cash']] as const) {
    const input = fixture(kind, unique(), { accountId, fundId: ['income', 'expense'].includes(kind) ? 'mission' : undefined });
    const { org, txRef } = await seedPostingExecution(db, input); const posted = await executeLedgerPosting(commandFor(input));
    const originalRef = org.collection('financeJournalEntries').doc(posted.journalEntryId); const original = (await originalRef.get()).data();
    const reverse = { ...commandFor(input), actorLabel: 'Synthetic reviewer', command: { ...commandFor(input).command, expectedVersion: posted.version, reason: 'Synthetic correction after checking original evidence' } };
    await assert.rejects(executeLedgerReversal({ ...reverse, command: { ...reverse.command, reason: 'short' } }), /REASON_REQUIRED/);
    const [first, retry] = await Promise.all([executeLedgerReversal(reverse), executeLedgerReversal({ ...reverse, command: { ...reverse.command, requestId: unique() } })]);
    assert.deepEqual(first, retry); assert.equal(first.status, 'reversed'); assert.equal(first.version, posted.version + 1);
    assert.deepEqual((await originalRef.get()).data(), original, 'Original journal is immutable');
    const inverse = (await org.collection('financeJournalEntries').doc(first.reversalJournalEntryId).get()).data()!;
    assert.equal(inverse.reversalOfEntryId, posted.journalEntryId); assert.equal(inverse.effectiveDay, original!.effectiveDay);
    for (let i = 0; i < inverse.lines.length; i++) { assert.equal(inverse.lines[i].debitCents, original!.lines[i].creditCents); assert.equal(inverse.lines[i].creditCents, original!.lines[i].debitCents); }
    assert.equal((await org.collection('financeJournalEntries').get()).size, 2);
    for (const doc of (await org.collection('financeAggregates').get()).docs) assert.equal(doc.data().postedMovementCents, 0);
    const saved = (await txRef.get()).data()!; assert.equal(saved.status, 'reversed'); assert.equal(saved.reversalReason, reverse.command.reason);
    assert.equal(saved.reversedBy, reverse.actorUid); assert.ok(saved.reversedAt.toMillis() > Date.now() - 120000);
    const audits = (await org.collection('financeAuditLogs').where('action', '==', 'transaction.reversed').get()).docs;
    assert.equal(audits.length, 1); assert.equal(audits[0].data().metadata.before.status, 'posted'); assert.equal(audits[0].data().metadata.after.status, 'reversed');
    await assert.rejects(executeLedgerReversal({ ...reverse, command: { ...reverse.command, idempotencyKey: unique() } }));
    console.log('✅ Atomic audited posting/reversal: ' + kind + '/' + accountId);
  }
  for (const scenario of ['closed', 'reconciled', 'stale', 'journal_corrupt', 'projection_corrupt', 'foreign'] as const) {
    const input = fixture('income', unique()); const { org, txRef } = await seedPostingExecution(db, input);
    const posted = await executeLedgerPosting(commandFor(input));
    const periodRef = org.collection('financeLedgerPeriods').doc(`${input.transaction.financeEntityId}:2026-10`);
    if (scenario === 'closed') await periodRef.update({ state: 'closed' });
    if (scenario === 'reconciled') await txRef.update({ reconciliationStatus: 'reconciled' });
    if (scenario === 'journal_corrupt') await org.collection('financeJournalEntries').doc(posted.journalEntryId).update({ effectiveDay: '2026-10-11' });
    if (scenario === 'projection_corrupt') await (await org.collection('financeAggregates').get()).docs[0].ref.update({ postedMovementCents: 'invalid' });
    const before = (await org.collection('financeAggregates').get()).docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const request = { ...commandFor(input), financeEntityId: scenario === 'foreign' ? 'synthetic_foreign_entity' : input.transaction.financeEntityId,
      actorLabel: 'Synthetic reviewer', command: { ...commandFor(input).command, expectedVersion: scenario === 'stale' ? posted.version - 1 : posted.version, reason: 'Synthetic correction after evidence review' } };
    await assert.rejects(executeLedgerReversal(request));
    assert.equal((await org.collection('financeJournalEntries').get()).size, 1); assert.equal((await txRef.get()).data()!.status, 'posted');
    assert.deepEqual((await org.collection('financeAggregates').get()).docs.map(doc => ({ id: doc.id, ...doc.data() })), before);
    assert.equal((await org.collection('financeAuditLogs').get()).size, 1); assert.equal((await org.collection('financeIdempotency').get()).size, 1);
  }
  const initInput = fixture('income', unique()); const { org, txRef } = await seedPostingExecution(db, initInput, false);
  const scope = { db, organizationId: initInput.transaction.organizationId, financeEntityId: initInput.transaction.financeEntityId };
  const preview = await previewLedgerInitialization(scope); assert.ok(preview.plan); assert.equal(preview.configuration, null);
  await org.collection('financeAccounts').doc('cash').update({ name: 'Synthetic renamed cash' });
  const init = { ...scope, actorUid: 'synthetic_initializer', command: { effectiveStartDate: '2026-01-01', expectedFingerprint: preview.plan!.fingerprint,
    reason: 'Synthetic initialization after reviewing the source catalog', idempotencyKey: unique(), requestId: unique() } };
  await assert.rejects(initializeLedger(init), /VERSION_CONFLICT/);
  const current = await previewLedgerInitialization(scope); init.command.expectedFingerprint = current.plan!.fingerprint;
  const [initialized, replay] = await Promise.all([initializeLedger(init), initializeLedger({ ...init, command: { ...init.command, requestId: unique() } })]);
  assert.deepEqual(initialized, replay); assert.equal(initialized.revision, 1);
  assert.equal((await org.collection('financeLedgerAccounts').get()).size, 5); assert.equal((await org.collection('financeJournalEntries').get()).size, 0);
  for (const account of (await org.collection('financeAccounts').get()).docs) { assert.equal(account.data().openingBalanceCents, undefined); assert.equal(account.data().ledgerConfigurationRevision, 1); }
  await assert.rejects(executeLedgerPosting(commandFor(initInput)), /REFERENCES_CHANGED/);
  // Existing approved previews require a fresh explicit approval against the persisted chart.
  await txRef.update({ status: 'ready_for_review', version: 3 });
  const uid = 'synthetic_approver_' + unique(); await db.collection('users').doc(uid).set({ systemRole: 'ceo' });
  const originalVerify = admin.auth.verifyIdToken; admin.auth.verifyIdToken = async () => ({ uid, name: 'Synthetic approver' }) as any;
  try {
    const res = new Res(); await approve({ method: 'POST', headers: { authorization: 'Bearer synthetic', 'x-organization-id': scope.organizationId },
      body: { financeEntityId: scope.financeEntityId, transactionId: initInput.transaction.id, expectedVersion: 3, approvalIdempotencyKey: unique(), requestId: unique() }, query: {} } as any, res as any);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  } finally { admin.auth.verifyIdToken = originalVerify; }
  const posted = await executeLedgerPosting(commandFor(initInput)); assert.equal(posted.status, 'posted');
  const migration = fixture('income', unique()); const seeded = await seedPostingExecution(db, migration, false);
  await seeded.txRef.update({ status: 'posted' });
  await assert.rejects(previewLedgerInitialization({ db, organizationId: migration.transaction.organizationId, financeEntityId: migration.transaction.financeEntityId }), /HISTORY_MIGRATION_REQUIRED/);
  console.log('✅ Initialization/reapproval/posting, stale catalog, preserved openings, idempotent retries and rejection of unverified posted history');
} finally {
  if (previousFlag === undefined) delete process.env.NESTFINANCE_LEDGER_POSTING_ENABLED; else process.env.NESTFINANCE_LEDGER_POSTING_ENABLED = previousFlag;
  await db.terminate();
}
