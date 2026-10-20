import { createHash } from 'node:crypto';
import { FieldValue, type Firestore, type DocumentReference, type DocumentData } from 'firebase-admin/firestore';
import { assertJournalBalanced, type JournalEntry } from '../../../shared/finance/ledger/journal.js';
import { isValidIdempotencyKey, isValidRequestId, isValidTransactionId } from '../../../shared/finance/ledger/ids.js';
import { receiptDay } from '../../../shared/finance/receivedIncome.js';
import { buildTransactionListQueryKeys } from '../../../shared/finance/ledger/listQueryKeys.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { assertExecutableJournalEvidence, journalEvidenceHash } from './ledgerJournalEvidence.js';
import { stageCanonicalAuditCreate } from './auditFactProjection.js';
import { stageFinanceFact } from './factStream.js';
import { sanitizeFirestoreObject } from './sanitizeFirestoreObject.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const fail = (code: string): never => { throw Object.assign(new Error(code), { code }); };
const add = (a: number, b: number) => {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || !Number.isSafeInteger(a + b)) fail('FINANCE_AMOUNT_OVERFLOW');
  return a + b;
};

/** A correction reverses the posting in its original open accounting period.
 * A refund on another day is a separate payment, with its own received date. */
export async function executeLedgerReversal(input: {
  db: Firestore; organizationId: string; financeEntityId: string; actorUid: string; actorLabel: string;
  command: { transactionId: string; expectedVersion: number; reason: string; idempotencyKey: string; requestId: string };
}) {
  if (process.env.NESTFINANCE_LEDGER_POSTING_ENABLED !== 'true') fail('FINANCE_LEDGER_POSTING_NOT_ENABLED');
  const { db, organizationId, financeEntityId, actorUid, command } = input;
  if (![organizationId, financeEntityId].every(value => /^[a-zA-Z0-9_.:-]{1,160}$/.test(value)) ||
    !actorUid || actorUid.length > 128 || !isValidTransactionId(command.transactionId) ||
    !Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 1 ||
    !isValidIdempotencyKey(command.idempotencyKey) || !isValidRequestId(command.requestId)) fail('FINANCE_INVALID_REVERSAL_COMMAND');
  const reason = typeof command.reason === 'string' ? command.reason.trim() : '';
  if (reason.length < 10 || reason.length > 500) fail('FINANCE_CORRECTION_REASON_REQUIRED');
  const org = db.collection('organizations').doc(organizationId);
  const txRef = org.collection('financeTransactions').doc(command.transactionId);
  const reverseId = 'je_' + digest(`${organizationId}:${financeEntityId}:${command.transactionId}:reversed`);
  const reverseRef = org.collection('financeJournalEntries').doc(reverseId);
  const keyHash = buildIdempotencyKeyHash(organizationId, financeEntityId, actorUid, 'ledger_reverse', command.idempotencyKey);
  const scoped = (data: any) => { if (data?.organizationId !== organizationId || data?.financeEntityId !== financeEntityId) fail('FINANCE_CROSS_ENTITY_REFERENCE'); };
  return executeWithIdempotency(db, org.collection('financeIdempotency'), keyHash,
    hashPayload({ transactionId: command.transactionId, expectedVersion: command.expectedVersion, reason }), async t => {
      const [txDoc, configuration, entityDoc, alreadyReversed, settingsDoc] = await t.getAll(txRef,
        org.collection('financeLedgerExecution').doc(financeEntityId), org.collection('financeEntities').doc(financeEntityId), reverseRef,
        org.collection('financeSettings').doc('config'));
      if (!txDoc.exists || !entityDoc.exists) fail('FINANCE_REVERSAL_SOURCE_NOT_FOUND');
      const tx = { ...txDoc.data(), id: txDoc.id } as any; scoped(tx);
      if (entityDoc.data()?.active === false) fail('FINANCE_ENTITY_NOT_ACTIVE');
      const config = configuration.data(); scoped(config);
      if (config?.state !== 'ready' || config.schemaVersion !== 1) fail('FINANCE_LEDGER_INITIALIZATION_REQUIRED');
      if (tx.version !== command.expectedVersion) fail('FINANCE_VERSION_CONFLICT');
      if (tx.status !== 'posted' || typeof tx.journalEntryId !== 'string' || alreadyReversed.exists) fail('FINANCE_REVERSAL_REQUIRES_POSTED');
      if (tx.reconciliationStatus === 'reconciled' || tx.reconciliationId) fail('FINANCE_RECONCILIATION_REVERSAL_REQUIRED');
      const journalRef = org.collection('financeJournalEntries').doc(tx.journalEntryId);
      const journalDoc = await t.get(journalRef);
      if (!journalDoc.exists) fail('FINANCE_JOURNAL_INTEGRITY');
      const original = journalDoc.data()!;
      assertExecutableJournalEvidence(original, organizationId, financeEntityId, tx.id);
      if (original.id !== journalDoc.id || original.reversalOfEntryId || original.status !== 'valid' ||
        original.approvalSourceHash !== tx.approvalSourceHash) fail('FINANCE_JOURNAL_INTEGRITY');
      const settings = settingsDoc.data();
      if (settings?.organizationId && settings.organizationId !== organizationId) fail('FINANCE_CROSS_ENTITY_REFERENCE');
      const effectiveDay = receiptDay(tx.occurredAt, settings?.timezone || 'America/Sao_Paulo');
      if (!effectiveDay || original.effectiveDay !== effectiveDay || original.period !== effectiveDay.slice(0, 7)) fail('FINANCE_JOURNAL_INTEGRITY');
      const periodRef = org.collection('financeLedgerPeriods').doc(`${financeEntityId}:${original.period}`);
      const periodDoc = await t.get(periodRef); const period = periodDoc.data(); scoped(period);
      if (period?.state !== 'open') fail('FINANCE_PERIOD_CLOSED');
      if (!Number.isSafeInteger(period.version) || period.version < 1 || !Number.isSafeInteger(period.postedEntryCount) || period.postedEntryCount < 1) fail('FINANCE_PERIOD_INTEGRITY');
      const accountDeltas = original.accountDeltas.map((value: any) => ({ accountId: value.accountId, deltaCents: -value.deltaCents }));
      const fundDeltas = original.fundDeltas.map((value: any) => ({ fundId: value.fundId, deltaCents: -value.deltaCents }));
      const effects = [...accountDeltas.map((value: any) => ({ kind: 'account', resourceId: value.accountId, deltaCents: value.deltaCents })),
        ...fundDeltas.map((value: any) => ({ kind: 'fund', resourceId: value.fundId, deltaCents: value.deltaCents }))];
      const projections = effects.flatMap(value => ['all', original.period].map(periodKey => ({ ...value, periodKey,
        ref: org.collection('financeAggregates').doc('ledger_' + digest(`${financeEntityId}:${value.kind}:${value.resourceId}:${periodKey}`)) })));
      const projectionDocs = await t.getAll(...projections.map(value => value.ref));
      const updates = projectionDocs.map((doc, index) => {
        const data = doc.data() as DocumentData | undefined; const projection = projections[index]; scoped(data);
        if (data?.resourceId !== projection.resourceId || data.kind !== projection.kind || data.periodKey !== projection.periodKey ||
          data.currency !== 'BRL' || data.basis !== 'posted_movements_since_initialization' || !Number.isSafeInteger(data.version) || data.version < 1 ||
          !Number.isSafeInteger(data.postingCount) || data.postingCount < 1) fail('FINANCE_PROJECTION_INTEGRITY');
        return { ...projection, postedMovementCents: add(data.postedMovementCents, projection.deltaCents), version: add(data.version, 1), postingCount: add(data.postingCount, 1) };
      });
      let countLock: { ref: DocumentReference; data: DocumentData } | null = null;
      if (tx.countSource) {
        const source = tx.countSource;
        const hash = hashPayload([financeEntityId, source.countSessionId, source.countEntryType, source.countReceiptMethod || tx.paymentMethod]);
        const ref = org.collection('financeUniqueKeys').doc(`ledger_count_${hash}`); const doc = await t.get(ref); const data = doc.data(); scoped(data);
        if (data?.transactionId !== tx.id || data.journalEntryId !== original.id || data.state === 'reversed') fail('FINANCE_COUNT_SOURCE_INVALID');
        countLock = { ref, data };
      }
      const now = new Date().toISOString();
      const entry: JournalEntry = { id: reverseId, organizationId, financeEntityId, sourceTransactionId: tx.id,
        description: reason, status: 'valid', postedAt: now, postedBy: actorUid, reversalOfEntryId: original.id,
        lines: original.lines.map((line: any, index: number) => ({ ...line,
          id: 'jl_' + digest(`${reverseId}:${index + 1}`), journalEntryId: reverseId,
          debitCents: line.creditCents, creditCents: line.debitCents })) };
      assertJournalBalanced(entry);
      const material = sanitizeFirestoreObject({ ...entry, effectiveDay, period: original.period,
        accountDeltas, fundDeltas, sourceVersion: tx.version, executionSchemaVersion: 1,
        originalExecutionProofHash: original.executionProofHash, reason });
      t.create(reverseRef, { ...material, executionProofHash: journalEvidenceHash(material), recordedAt: FieldValue.serverTimestamp() });
      for (const update of updates) t.update(update.ref, { postedMovementCents: update.postedMovementCents,
        version: update.version, postingCount: update.postingCount, lastJournalEntryId: reverseId, updatedAt: FieldValue.serverTimestamp() });
      t.update(periodRef, { version: add(period.version, 1), reversalEntryCount: add(period.reversalEntryCount ?? 0, 1), lastJournalEntryId: reverseId, updatedAt: FieldValue.serverTimestamp() });
      const version = add(tx.version, 1);
      t.update(txRef, { status: 'reversed', version, reversedBy: actorUid, reversedAt: FieldValue.serverTimestamp(),
        reversalJournalEntryId: reverseId, reversalReason: reason, reversalEffectiveDay: effectiveDay,
        updatedBy: actorUid, updatedAt: FieldValue.serverTimestamp(),
        listQueryKeys: buildTransactionListQueryKeys(financeEntityId, tx.id, tx.transactionKind, 'reversed', tx.occurredAt) });
      if (countLock) t.update(countLock.ref, { state: 'reversed', reversalJournalEntryId: reverseId, reversedBy: actorUid, reversedAt: FieldValue.serverTimestamp() });
      const auditId = 'audit_' + digest(reverseId); const auditRef = org.collection('financeAuditLogs').doc(auditId);
      stageCanonicalAuditCreate(t, db, auditRef, { eventId: auditId, organizationId, financeEntityId, actor: actorUid,
        resource: 'transaction', resourceId: tx.id, action: 'transaction.reversed', requestId: command.requestId,
        idempotencyKey: command.idempotencyKey, createdAt: FieldValue.serverTimestamp(), metadata: {
          reason, actorLabel: input.actorLabel, versionBefore: tx.version, versionAfter: version,
          before: tx, after: { ...tx, status: 'reversed', version, reversalJournalEntryId: reverseId, reversalReason: reason },
          originalJournalEntryId: original.id, reversalJournalEntryId: reverseId, periodKey: original.period,
        } });
      stageFinanceFact(t, db, { organizationId, eventType: 'TRANSACTION_REVERSED', entityType: 'finance_transaction', entityId: tx.id,
        actorUserId: actorUid, correlationId: keyHash, payload: { financeEntityId, status: 'reversed', version, period: original.period },
        sourceRefs: [{ kind: 'record', ref: txRef.path, version }, { kind: 'record', ref: reverseRef.path }, { kind: 'audit', ref: auditRef.path }] });
      return { transactionId: tx.id, version, status: 'reversed', reversalJournalEntryId: reverseId, originalJournalEntryId: original.id };
    });
}
