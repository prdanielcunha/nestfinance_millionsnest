import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import {
  detectUniversalEvidenceMime,
  isUniversalEvidenceSize,
  isSha256,
} from '../../../shared/finance/universalEvidence.js';
import { normalizeAccountType } from '../../../shared/finance/smartLogic.js';
import { prepareStatementLines } from '../../../shared/finance/reconciliationStatementLines.js';
import {
  buildReconciliationMatchPreview,
  RECONCILIATION_MATCH_MAX_TRANSACTIONS,
  type ReconciliationMatchTransactionStatus,
  type ReconciliationMatchableTransaction,
} from '../../../shared/finance/reconciliationMatchPreview.js';
import {
  RECONCILIATION_CONFIRMATION_SCHEMA_VERSION,
  type ReconciliationConfirmResponse,
  type ReconciliationConfirmationRecord,
} from '../../../shared/finance/reconciliationConfirmation.js';
import {
  isValidIdempotencyKey,
  isValidRequestId,
  isValidTransactionId,
  generateAuditId,
} from '../../../shared/finance/ledger/ids.js';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import {
  buildIdempotencyKeyHash,
  executeWithIdempotency,
  hashPayload,
} from './idempotencyHelper.js';
import {
  extractNativePdfText,
  PDF_TEXT_MAX_INPUT_BYTES,
} from './universalEvidencePdfTextExtractor.js';
import { getUniversalEvidenceStorageAdapter } from './universalEvidenceStorage.js';
import {
  buildLegacyReconciliationId,
  buildReconciliationAttemptId,
  buildReconciliationLineLockId,
  buildReconciliationSessionId,
  buildStatementLineFingerprint,
} from './reconciliationConfirmationIds.js';
import {
  RECONCILIATION_LINE_LOCK_SCHEMA_VERSION,
  type ReconciliationLineLockRecord,
} from '../../../shared/finance/reconciliationLineLock.js';
import { sanitizeFirestoreObject } from './sanitizeFirestoreObject.js';
import { stageFinanceFact } from './factStream.js';
import { stageCanonicalAuditRecord } from './auditFactProjection.js';
import {
  RECONCILIATION_SESSION_SCHEMA_VERSION,
  type ReconciliationSessionRecord,
} from '../../../shared/finance/reconciliationSession.js';

const validEvidenceId = (value: unknown): value is string =>
  typeof value === 'string' && /^evd_[a-f0-9]{32}$/.test(value);

function isEligibleBankAccount(data: Record<string, any>) {
  const type = normalizeAccountType(data.type);
  return (
    data.active !== false &&
    data.configurationStatus === 'complete' &&
    data.nature === 'asset' &&
    (type === 'bank_checking' || type === 'bank_savings' || type === 'payment_account')
  );
}

function supportedStatus(value: unknown): value is ReconciliationMatchTransactionStatus {
  return (
    value === 'draft' ||
    value === 'ready_for_review' ||
    value === 'approved_for_posting' ||
    value === 'posted'
  );
}

function toIso(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

function boundedDescription(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/gu, ' ').trim();
  return normalized ? normalized.slice(0, 240) : null;
}

function matchableTransaction(
  id: string,
  data: Record<string, any>,
  accountName: string | null,
): ReconciliationMatchableTransaction | null {
  if (!supportedStatus(data.status)) return null;
  if (!Number.isSafeInteger(Number(data.amountCents)) || Number(data.amountCents) <= 0) return null;
  const occurredAt = toIso(data.occurredAt);
  if (!occurredAt) return null;

  return {
    transactionId: id,
    transactionKind:
      typeof data.transactionKind === 'string'
        ? data.transactionKind
        : typeof data.direction === 'string'
          ? data.direction
          : 'unknown',
    status: data.status,
    reconciliationStatus:
      data.reconciliationStatus === 'reconciled'
        ? 'reconciled'
        : data.reconciliationStatus === 'unreconciled'
          ? 'unreconciled'
          : 'unknown',
    amountCents: Number(data.amountCents),
    occurredAt,
    cashFlowDirection:
      typeof data.cashFlowDirection === 'string' ? data.cashFlowDirection : null,
    accountId: typeof data.accountId === 'string' ? data.accountId : null,
    sourceAccountId:
      typeof data.sourceAccountId === 'string' ? data.sourceAccountId : null,
    destinationAccountId:
      typeof data.destinationAccountId === 'string' ? data.destinationAccountId : null,
    description: boundedDescription(data.description),
    accountName,
  };
}

async function actorDisplayName(db: any, uid: string) {
  try {
    const snapshot = await db.collection('user_profiles').doc(uid).get();
    const data = snapshot.data() || {};
    return data.name || data.displayName || 'Usuário da equipe';
  } catch {
    return 'Usuário da equipe';
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const {
      financeEntityId,
      evidenceId,
      accountId,
      transactionId,
      lineNumber,
      idempotencyKey,
      requestId,
    } = req.body || {};

    if (
      typeof financeEntityId !== 'string' ||
      !financeEntityId.trim() ||
      !validEvidenceId(evidenceId) ||
      typeof accountId !== 'string' ||
      !accountId.trim() ||
      accountId.length > 160 ||
      !isValidTransactionId(transactionId) ||
      !Number.isInteger(Number(lineNumber)) ||
      Number(lineNumber) < 1 ||
      Number(lineNumber) > 2000 ||
      !isValidIdempotencyKey(idempotencyKey) ||
      !isValidRequestId(requestId)
    ) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const { db, uid, organizationId, context } =
      await resolveFinanceRequestContext(req, 'finance.review');

    const accountRef = context.repository.getAccountsRef().doc(accountId);
    const evidenceRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId)
      .collection('universalEvidence')
      .doc(evidenceId);

    const [accountSnapshot, evidenceSnapshot] = await Promise.all([
      accountRef.get(),
      evidenceRef.get(),
    ]);

    if (!accountSnapshot.exists) {
      return res.status(404).json({ error: 'RECONCILIATION_ACCOUNT_NOT_FOUND' });
    }

    const account = accountSnapshot.data() || {};
    context.repository.assertEntityIsolation(account);
    if (!isEligibleBankAccount(account)) {
      return res.status(409).json({ error: 'RECONCILIATION_ACCOUNT_NOT_READY' });
    }

    const evidence = evidenceSnapshot.data() || {};
    if (
      !evidenceSnapshot.exists ||
      evidence.organizationId !== organizationId ||
      evidence.financeEntityId !== financeEntityId
    ) {
      return res.status(404).json({ error: 'EVIDENCE_NOT_FOUND' });
    }

    if (
      evidence.processingState !== 'accepted' ||
      evidence.duplicate === true ||
      evidence.classification?.source !== 'human' ||
      evidence.classification?.documentType !== 'bank_statement' ||
      evidence.review?.status !== 'reviewed'
    ) {
      return res.status(409).json({ error: 'RECONCILIATION_STATEMENT_NOT_READY' });
    }

    if (evidence.verifiedMimeType !== 'application/pdf') {
      return res.status(415).json({ error: 'RECONCILIATION_STATEMENT_PDF_REQUIRED' });
    }

    const evidenceVersion = Number(evidence.version);
    const byteSize = Number(evidence.byteSize);
    const original = evidence.original && typeof evidence.original === 'object'
      ? evidence.original
      : null;
    const path = typeof original?.path === 'string' ? original.path : '';
    const verifiedSha256 = original?.verifiedSha256;

    if (
      !Number.isInteger(evidenceVersion) ||
      evidenceVersion < 2 ||
      !isUniversalEvidenceSize(byteSize) ||
      !path ||
      original?.immutable !== true ||
      original?.verifiedMimeType !== 'application/pdf' ||
      Number(original?.verifiedByteSize) !== byteSize ||
      !isSha256(verifiedSha256)
    ) {
      return res.status(422).json({ error: 'EVIDENCE_CORRUPT' });
    }

    if (byteSize > PDF_TEXT_MAX_INPUT_BYTES) {
      return res.status(413).json({ error: 'EVIDENCE_TEXT_EXTRACTION_TOO_LARGE' });
    }

    const stored = await getUniversalEvidenceStorageAdapter().readPreview(path);
    if (
      stored.size !== byteSize ||
      stored.sha256 !== verifiedSha256 ||
      stored.contentType !== 'application/pdf'
    ) {
      return res.status(422).json({ error: 'EVIDENCE_CORRUPT' });
    }

    if (detectUniversalEvidenceMime(stored.bytes.subarray(0, 65536)) !== 'application/pdf') {
      return res.status(422).json({ error: 'EVIDENCE_CORRUPT' });
    }

    const extraction = await extractNativePdfText(stored.bytes);
    if (extraction.state !== 'extracted') {
      return res.status(409).json({ error: 'RECONCILIATION_SOURCE_UNAVAILABLE' });
    }

    const preparation = prepareStatementLines(extraction.text);
    const line = preparation.lines.find((item) => item.lineNumber === Number(lineNumber));
    if (
      !line ||
      line.parseState !== 'prepared' ||
      !line.selectedDate ||
      line.selectedAmountCents === null ||
      line.selectedDirection === 'unknown'
    ) {
      return res.status(409).json({ error: 'RECONCILIATION_LINE_NOT_CONFIRMABLE' });
    }

    const statementLineNumber = line.lineNumber;
    const statementDate = line.selectedDate as string;
    const statementAmountCents = line.selectedAmountCents as number;
    const statementDirection = line.selectedDirection as 'inflow' | 'outflow';
    const statementDescription = line.descriptionCandidate;

    const statementLineFingerprint = buildStatementLineFingerprint({
      organizationId,
      financeEntityId,
      evidenceId,
      line,
    });
    const legacyReconciliationId = buildLegacyReconciliationId({
      organizationId,
      financeEntityId,
      evidenceId,
      statementLineFingerprint,
    });
    const lineLockId = buildReconciliationLineLockId({
      organizationId,
      financeEntityId,
      evidenceId,
      statementLineFingerprint,
    });

    const keyHash = buildIdempotencyKeyHash(
      organizationId,
      financeEntityId,
      uid,
      'reconciliation_confirm',
      idempotencyKey,
    );
    const reconciliationId = buildReconciliationAttemptId({
      organizationId,
      financeEntityId,
      evidenceId,
      statementLineFingerprint,
      transactionId,
      idempotencyKeyHash: keyHash,
    });

    const payloadHash = hashPayload({
      evidenceId,
      accountId,
      transactionId,
      lineNumber: Number(lineNumber),
      statementLineFingerprint,
    });

    // Retry-safe fast path. A completed request must be replayable even though
    // the first execution already changed reconciliationStatus to reconciled.
    const idempotencySnapshot = await context.repository.getIdempotencyRef().doc(keyHash).get();
    if (idempotencySnapshot.exists) {
      const idempotencyData = idempotencySnapshot.data() || {};
      if (idempotencyData.payloadHash !== payloadHash) {
        return res.status(409).json({ error: 'FINANCE_IDEMPOTENCY_CONFLICT' });
      }
      if (idempotencyData.status === 'completed' && idempotencyData.result) {
        return res.status(200).json(idempotencyData.result);
      }
      return res.status(409).json({ error: 'FINANCE_IDEMPOTENCY_CONFLICT' });
    }

    const allTransactionsSnapshot = await context.repository
      .getTransactionsQuery()
      .limit(RECONCILIATION_MATCH_MAX_TRANSACTIONS + 1)
      .get();

    if (allTransactionsSnapshot.size > RECONCILIATION_MATCH_MAX_TRANSACTIONS) {
      return res.status(409).json({
        error: 'RECONCILIATION_MATCH_SCOPE_TOO_LARGE',
        limit: RECONCILIATION_MATCH_MAX_TRANSACTIONS,
      });
    }

    const accountName =
      typeof account.name === 'string' && account.name.trim() ? account.name.trim() : null;
    const allTransactions: ReconciliationMatchableTransaction[] = [];
    for (const doc of allTransactionsSnapshot.docs) {
      const data = doc.data() || {};
      context.repository.assertEntityIsolation(data);
      const normalized = matchableTransaction(doc.id, data, accountName);
      if (normalized) allTransactions.push(normalized);
    }

    const canonicalPreview = buildReconciliationMatchPreview(
      [line],
      allTransactions,
      accountId,
    );
    const canonicalLine = canonicalPreview.lines[0];
    if (!canonicalLine || canonicalLine.candidateLimitReached) {
      return res.status(409).json({
        error: canonicalLine?.candidateLimitReached
          ? 'RECONCILIATION_TOO_MANY_CANDIDATES'
          : 'RECONCILIATION_MATCH_NO_LONGER_VALID',
      });
    }

    const canonicalCandidate = canonicalLine.candidates.find(
      (candidate) => candidate.transactionId === transactionId,
    );
    if (!canonicalCandidate || canonicalCandidate.reconciliationEligible !== true) {
      return res.status(409).json({ error: 'RECONCILIATION_MATCH_NO_LONGER_VALID' });
    }

    const txRef = context.repository.getTransactionsRef().doc(transactionId);
    const reconciliationRef = context.repository.getReconciliationsRef().doc(reconciliationId);
    const legacyReconciliationRef = context.repository.getReconciliationsRef().doc(legacyReconciliationId);
    const lineLockRef = context.repository.getReconciliationLineLocksRef().doc(lineLockId);
    const reconciliationSessionId = buildReconciliationSessionId({
      organizationId,
      financeEntityId,
      evidenceId,
      accountId,
    });
    const reconciliationSessionRef = context.repository
      .getReconciliationSessionsRef()
      .doc(reconciliationSessionId);
    const displayName = await actorDisplayName(db, uid);

    const result = await executeWithIdempotency<ReconciliationConfirmResponse>(
      db,
      context.repository.getIdempotencyRef(),
      keyHash,
      payloadHash,
      async (t) => {
        const currentAccount = await t.get(accountRef);
        const currentEvidence = await t.get(evidenceRef);
        const currentTransaction = await t.get(txRef);
        const existingReconciliation = await t.get(reconciliationRef);
        const lineLockSnapshot = await t.get(lineLockRef);
        const reconciliationSessionSnapshot = await t.get(reconciliationSessionRef);
        const legacyReconciliationSnapshot =
          legacyReconciliationId === reconciliationId
            ? existingReconciliation
            : await t.get(legacyReconciliationRef);

        if (!currentAccount.exists) {
          throw { code: 'RECONCILIATION_ACCOUNT_NOT_FOUND' };
        }
        const accountData = currentAccount.data() || {};
        context.repository.assertEntityIsolation(accountData);
        if (!isEligibleBankAccount(accountData)) {
          throw { code: 'RECONCILIATION_ACCOUNT_NOT_READY' };
        }

        if (!currentEvidence.exists) {
          throw { code: 'EVIDENCE_NOT_FOUND' };
        }
        const evidenceData = currentEvidence.data() || {};
        if (
          evidenceData.organizationId !== organizationId ||
          evidenceData.financeEntityId !== financeEntityId ||
          Number(evidenceData.version) !== evidenceVersion ||
          evidenceData.processingState !== 'accepted' ||
          evidenceData.duplicate === true ||
          evidenceData.classification?.source !== 'human' ||
          evidenceData.classification?.documentType !== 'bank_statement' ||
          evidenceData.review?.status !== 'reviewed'
        ) {
          throw { code: 'RECONCILIATION_SOURCE_CHANGED' };
        }

        if (!currentTransaction.exists) {
          throw { code: 'RECONCILIATION_TRANSACTION_NOT_FOUND' };
        }
        const txData = currentTransaction.data() || {};
        context.repository.assertEntityIsolation(txData);

        if (txData.status !== 'posted') {
          throw { code: 'RECONCILIATION_TRANSACTION_NOT_POSTED' };
        }
        if (txData.reconciliationStatus !== 'unreconciled') {
          throw { code: 'RECONCILIATION_TRANSACTION_NOT_AVAILABLE' };
        }

        if (existingReconciliation.exists) {
          throw { code: 'RECONCILIATION_LINE_ALREADY_CONFIRMED' };
        }

        const lineLockData = lineLockSnapshot.data() || {};
        if (lineLockSnapshot.exists && lineLockData.status === 'active') {
          throw { code: 'RECONCILIATION_LINE_ALREADY_CONFIRMED' };
        }
        if (
          lineLockSnapshot.exists &&
          lineLockData.status !== 'active' &&
          lineLockData.status !== 'released'
        ) {
          throw { code: 'RECONCILIATION_LINE_LOCK_INVALID' };
        }

        // Compatibility with P9d records that predate the active-lock model.
        // A released lock created by P9e is the explicit proof that the legacy
        // confirmation was reversed and the immutable line may be corrected.
        if (!lineLockSnapshot.exists && legacyReconciliationSnapshot.exists) {
          throw { code: 'RECONCILIATION_LINE_ALREADY_CONFIRMED' };
        }

        const normalizedTransaction = matchableTransaction(
          transactionId,
          txData,
          typeof accountData.name === 'string' ? accountData.name : null,
        );
        if (!normalizedTransaction) {
          throw { code: 'RECONCILIATION_TRANSACTION_NOT_MATCHABLE' };
        }

        const preview = buildReconciliationMatchPreview(
          [line],
          [normalizedTransaction],
          accountId,
        );
        const candidate = preview.lines[0]?.candidates[0];
        if (
          preview.lines.length !== 1 ||
          preview.lines[0]?.state !== 'single_candidate' ||
          preview.lines[0]?.totalCandidates !== 1 ||
          !candidate ||
          candidate.transactionId !== transactionId ||
          candidate.reconciliationEligible !== true
        ) {
          throw { code: 'RECONCILIATION_MATCH_NO_LONGER_VALID' };
        }

        const currentVersion = Number(txData.version);
        if (!Number.isInteger(currentVersion) || currentVersion < 0) {
          throw { code: 'FINANCE_VERSION_CONFLICT' };
        }
        const newVersion = currentVersion + 1;
        const confirmedAt = FieldValue.serverTimestamp();
        const sessionData = reconciliationSessionSnapshot.data() || {};
        if (
          reconciliationSessionSnapshot.exists &&
          (
            sessionData.organizationId !== organizationId ||
            sessionData.financeEntityId !== financeEntityId ||
            sessionData.evidenceId !== evidenceId ||
            sessionData.accountId !== accountId ||
            sessionData.status !== 'in_progress'
          )
        ) {
          throw { code: 'RECONCILIATION_SESSION_MISMATCH' };
        }

        const activeConfirmationCount = reconciliationSessionSnapshot.exists
          ? Math.max(0, Number(sessionData.activeConfirmationCount) || 0) + 1
          : 1;
        const totalConfirmationCount = reconciliationSessionSnapshot.exists
          ? Math.max(0, Number(sessionData.totalConfirmationCount) || 0) + 1
          : 1;
        const exceptionCount = reconciliationSessionSnapshot.exists
          ? Math.max(0, Number(sessionData.exceptionCount) || 0)
          : 0;

        const sessionRecord: ReconciliationSessionRecord = {
          reconciliationSessionId,
          organizationId,
          financeEntityId,
          evidenceId,
          accountId,
          status: 'in_progress',
          startedByUid: reconciliationSessionSnapshot.exists
            ? (typeof sessionData.startedByUid === 'string' ? sessionData.startedByUid : null)
            : uid,
          startedAt: reconciliationSessionSnapshot.exists
            ? sessionData.startedAt
            : confirmedAt,
          lastActivityAt: confirmedAt,
          activeConfirmationCount,
          totalConfirmationCount,
          exceptionCount,
          lastExceptionAt: reconciliationSessionSnapshot.exists
            ? (sessionData.lastExceptionAt || null)
            : null,
          lastExceptionReasonCode: reconciliationSessionSnapshot.exists
            ? (typeof sessionData.lastExceptionReasonCode === 'string'
                ? sessionData.lastExceptionReasonCode
                : null)
            : null,
          sourceScope: 'recognized_native_text_items_only',
          canDeclareStatementFullyReconciled: false,
          schemaVersion: RECONCILIATION_SESSION_SCHEMA_VERSION,
        };

        const record: ReconciliationConfirmationRecord = {
          reconciliationId,
          lineLockId,
          organizationId,
          financeEntityId,
          accountId,
          transactionId,
          transactionVersion: currentVersion,
          evidenceId,
          evidenceVersion,
          statementLineFingerprint,
          statementLineNumber: statementLineNumber,
          statementDate: statementDate,
          statementAmountCents: statementAmountCents,
          statementDirection: statementDirection,
          statementDescription: statementDescription,
          matchEvidence: candidate.evidence,
          status: 'confirmed',
          confirmedByUid: uid,
          confirmedAt,
          requestId,
          balanceChanged: false,
          journalChanged: false,
          schemaVersion: RECONCILIATION_CONFIRMATION_SCHEMA_VERSION,
        };

        const lineLock: ReconciliationLineLockRecord = {
          lineLockId,
          organizationId,
          financeEntityId,
          evidenceId,
          statementLineFingerprint,
          status: 'active',
          activeReconciliationId: reconciliationId,
          activeTransactionId: transactionId,
          activatedByUid: uid,
          activatedAt: confirmedAt,
          releasedByUid: null,
          releasedAt: null,
          releaseReversalId: null,
          schemaVersion: RECONCILIATION_LINE_LOCK_SCHEMA_VERSION,
        };

        t.create(reconciliationRef, sanitizeFirestoreObject(record));
        t.set(lineLockRef, sanitizeFirestoreObject(lineLock));
        t.set(reconciliationSessionRef, sanitizeFirestoreObject(sessionRecord));
        t.update(txRef, sanitizeFirestoreObject({
          reconciliationStatus: 'reconciled',
          reconciliationId,
          reconciliationEvidenceId: evidenceId,
          reconciliationLineFingerprint: statementLineFingerprint,
          reconciliationLineLockId: lineLockId,
          reconciledAt: confirmedAt,
          reconciledByUid: uid,
          updatedAt: confirmedAt,
          updatedBy: uid,
          version: newVersion,
        }));

        const auditId = generateAuditId();
        const auditRef = context.repository.getAuditRef().doc(auditId);
        stageCanonicalAuditRecord(t, db, auditRef, sanitizeFirestoreObject({
          eventId: auditId,
          organizationId,
          financeEntityId,
          actor: uid,
          resource: 'reconciliation',
          action: 'transaction.reconciled',
          requestId,
          transactionId,
          reconciliationId,
          metadata: {
            evidenceId,
            evidenceVersion,
            statementLineNumber: statementLineNumber,
            statementLineFingerprint,
            amountCents: statementAmountCents,
            direction: statementDirection,
            balanceChanged: false,
            journalChanged: false,
          },
          createdAt: confirmedAt,
        }));

        const sourceRefs = [
          { kind: 'record' as const, ref: reconciliationRef.path, version: RECONCILIATION_CONFIRMATION_SCHEMA_VERSION },
          { kind: 'record' as const, ref: lineLockRef.path, version: RECONCILIATION_LINE_LOCK_SCHEMA_VERSION },
          { kind: 'record' as const, ref: txRef.path, version: newVersion },
          { kind: 'evidence' as const, ref: evidenceRef.path, version: evidenceVersion },
          { kind: 'audit' as const, ref: auditRef.path },
        ];

        const matchedFactId = stageFinanceFact(t, db, {
          organizationId,
          eventType: 'RECONCILIATION_MATCHED',
          entityType: 'finance_reconciliation',
          entityId: reconciliationId,
          actorUserId: uid,
          correlationId: requestId,
          payload: {
            financeEntityId,
            transactionId,
            evidenceId,
            accountId,
            statementLineNumber: statementLineNumber,
            amountCents: statementAmountCents,
            direction: statementDirection,
            reconciliationStatus: 'reconciled',
            transactionVersion: newVersion,
            balanceChanged: false,
            journalChanged: false,
          },
          sourceRefs,
        });

        if (!reconciliationSessionSnapshot.exists) {
          stageFinanceFact(t, db, {
            organizationId,
            eventType: 'RECONCILIATION_STARTED',
            entityType: 'finance_reconciliation_session',
            entityId: reconciliationSessionId,
            actorUserId: uid,
            correlationId: requestId,
            causationId: matchedFactId,
            payload: {
              financeEntityId,
              evidenceId,
              accountId,
              status: 'in_progress',
              sourceScope: 'recognized_native_text_items_only',
              canDeclareStatementFullyReconciled: false,
            },
            sourceRefs: [
              { kind: 'record', ref: reconciliationSessionRef.path, version: RECONCILIATION_SESSION_SCHEMA_VERSION },
              { kind: 'record', ref: reconciliationRef.path, version: RECONCILIATION_CONFIRMATION_SCHEMA_VERSION },
              { kind: 'evidence', ref: evidenceRef.path, version: evidenceVersion },
              { kind: 'audit', ref: auditRef.path },
            ],
          });
        }

        const eventId = `evt_${reconciliationId.slice(4, 36)}`;
        t.set(
          db
            .collection('organizations')
            .doc(organizationId)
            .collection('financeEntities')
            .doc(financeEntityId)
            .collection('events')
            .doc(eventId),
          sanitizeFirestoreObject({
            eventId,
            organizationId,
            financeEntityId,
            transactionId,
            reconciliationId,
            eventType: 'reconciled',
            actorUid: uid,
            actorDisplayNameSnapshot: displayName,
            versionBefore: currentVersion,
            versionAfter: newVersion,
            evidenceId,
            statementLineNumber: statementLineNumber,
            requestId,
            createdAt: confirmedAt,
          }),
        );

        return {
          reconciliationId,
          transactionId,
          transactionVersion: newVersion,
          reconciliationStatus: 'reconciled',
          lineNumber: statementLineNumber,
          balanceChanged: false,
          journalChanged: false,
          auditRecorded: true,
          factRecorded: true,
        };
      },
    );

    return res.status(200).json(result);
  } catch (error: any) {
    const code = String(error?.code || error?.message || '');
    if (code.startsWith('RECONCILIATION_')) {
      const notFound = code.includes('NOT_FOUND');
      return res.status(notFound ? 404 : 409).json({ error: code });
    }
    if (code === 'EVIDENCE_NOT_FOUND') {
      return res.status(404).json({ error: code });
    }
    if (code === 'FINANCE_VERSION_CONFLICT') {
      return res.status(409).json({ error: code });
    }
    if (code.includes('FINANCE_IDEMPOTENCY_CONFLICT')) {
      return res.status(409).json({ error: 'FINANCE_IDEMPOTENCY_CONFLICT' });
    }
    if (
      code === 'FORBIDDEN_FINANCE_ACCESS' ||
      code === 'FINANCE_ENTITY_MISMATCH' ||
      code === 'Session not granted'
    ) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (error?.status) {
      return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    }

    console.error('Reconciliation confirm error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
