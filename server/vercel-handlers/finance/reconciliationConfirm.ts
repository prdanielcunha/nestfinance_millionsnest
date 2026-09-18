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
  buildReconciliationId,
  buildStatementLineFingerprint,
} from './reconciliationConfirmationIds.js';
import { sanitizeFirestoreObject } from './sanitizeFirestoreObject.js';
import { stageFinanceFact } from './factStream.js';

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

    const statementLineFingerprint = buildStatementLineFingerprint({
      organizationId,
      financeEntityId,
      evidenceId,
      evidenceVersion,
      line,
    });
    const reconciliationId = buildReconciliationId({
      organizationId,
      financeEntityId,
      evidenceId,
      evidenceVersion,
      statementLineFingerprint,
    });

    const txRef = context.repository.getTransactionsRef().doc(transactionId);
    const reconciliationRef = context.repository.getReconciliationsRef().doc(reconciliationId);
    const keyHash = buildIdempotencyKeyHash(
      organizationId,
      financeEntityId,
      uid,
      'reconciliation_confirm',
      idempotencyKey,
    );
    const payloadHash = hashPayload({
      evidenceId,
      accountId,
      transactionId,
      lineNumber: Number(lineNumber),
      statementLineFingerprint,
    });
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

        const record: ReconciliationConfirmationRecord = {
          reconciliationId,
          organizationId,
          financeEntityId,
          accountId,
          transactionId,
          transactionVersion: currentVersion,
          evidenceId,
          evidenceVersion,
          statementLineFingerprint,
          statementLineNumber: line.lineNumber,
          statementDate: line.selectedDate,
          statementAmountCents: line.selectedAmountCents,
          statementDirection: line.selectedDirection,
          statementDescription: line.descriptionCandidate,
          matchEvidence: candidate.evidence,
          status: 'confirmed',
          confirmedByUid: uid,
          confirmedAt,
          requestId,
          balanceChanged: false,
          journalChanged: false,
          schemaVersion: RECONCILIATION_CONFIRMATION_SCHEMA_VERSION,
        };

        t.create(reconciliationRef, sanitizeFirestoreObject(record));
        t.update(txRef, sanitizeFirestoreObject({
          reconciliationStatus: 'reconciled',
          reconciliationId,
          reconciliationEvidenceId: evidenceId,
          reconciliationLineFingerprint: statementLineFingerprint,
          reconciledAt: confirmedAt,
          reconciledByUid: uid,
          updatedAt: confirmedAt,
          updatedBy: uid,
          version: newVersion,
        }));

        const auditId = generateAuditId();
        const auditRef = context.repository.getAuditRef().doc(auditId);
        t.set(auditRef, sanitizeFirestoreObject({
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
            statementLineNumber: line.lineNumber,
            statementLineFingerprint,
            amountCents: line.selectedAmountCents,
            direction: line.selectedDirection,
            balanceChanged: false,
            journalChanged: false,
          },
          createdAt: confirmedAt,
        }));

        const sourceRefs = [
          { kind: 'record' as const, ref: reconciliationRef.path, version: 1 },
          { kind: 'record' as const, ref: txRef.path, version: newVersion },
          { kind: 'evidence' as const, ref: evidenceRef.path, version: evidenceVersion },
          { kind: 'audit' as const, ref: auditRef.path },
        ];

        stageFinanceFact(t, db, {
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
            statementLineNumber: line.lineNumber,
            amountCents: line.selectedAmountCents,
            direction: line.selectedDirection,
            reconciliationStatus: 'reconciled',
            transactionVersion: newVersion,
            balanceChanged: false,
            journalChanged: false,
          },
          sourceRefs,
        });

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
            statementLineNumber: line.lineNumber,
            requestId,
            createdAt: confirmedAt,
          }),
        );

        return {
          reconciliationId,
          transactionId,
          transactionVersion: newVersion,
          reconciliationStatus: 'reconciled',
          lineNumber: line.lineNumber,
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
