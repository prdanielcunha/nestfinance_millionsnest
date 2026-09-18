import type { VercelRequest, VercelResponse } from '@vercel/node';
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
  buildReconciliationProgress,
  type ReconciliationProgressConfirmation,
} from '../../../shared/finance/reconciliationProgressBuilder.js';
import {
  buildLegacyReconciliationId,
  buildStatementLineFingerprint,
} from './reconciliationConfirmationIds.js';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import {
  extractNativePdfText,
  PDF_TEXT_MAX_INPUT_BYTES,
} from './universalEvidencePdfTextExtractor.js';
import { getUniversalEvidenceStorageAdapter } from './universalEvidenceStorage.js';

const MAX_RECONCILIATION_TRACE_RECORDS = 1000;

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { financeEntityId, evidenceId, accountId } = req.body || {};
    if (
      typeof financeEntityId !== 'string' ||
      !financeEntityId.trim() ||
      !validEvidenceId(evidenceId) ||
      typeof accountId !== 'string' ||
      !accountId.trim() ||
      accountId.length > 160
    ) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const { db, organizationId, context } =
      await resolveFinanceRequestContext(req, 'finance.view');

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

    const byteSize = Number(evidence.byteSize);
    const original = evidence.original && typeof evidence.original === 'object'
      ? evidence.original
      : null;
    const path = typeof original?.path === 'string' ? original.path : '';
    const verifiedSha256 = original?.verifiedSha256;
    if (
      !Number.isInteger(Number(evidence.version)) ||
      Number(evidence.version) < 2 ||
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

    const [stored, transactionSnapshot, lockSnapshot, reconciliationSnapshot] =
      await Promise.all([
        getUniversalEvidenceStorageAdapter().readPreview(path),
        context.repository
          .getTransactionsQuery()
          .limit(RECONCILIATION_MATCH_MAX_TRANSACTIONS + 1)
          .get(),
        context.repository
          .getReconciliationLineLocksRef()
          .where('financeEntityId', '==', financeEntityId)
          .limit(MAX_RECONCILIATION_TRACE_RECORDS + 1)
          .get(),
        context.repository
          .getReconciliationsQuery()
          .limit(MAX_RECONCILIATION_TRACE_RECORDS + 1)
          .get(),
      ]);

    if (transactionSnapshot.size > RECONCILIATION_MATCH_MAX_TRANSACTIONS) {
      return res.status(409).json({
        error: 'RECONCILIATION_MATCH_SCOPE_TOO_LARGE',
        limit: RECONCILIATION_MATCH_MAX_TRANSACTIONS,
      });
    }
    if (
      lockSnapshot.size > MAX_RECONCILIATION_TRACE_RECORDS ||
      reconciliationSnapshot.size > MAX_RECONCILIATION_TRACE_RECORDS
    ) {
      return res.status(409).json({
        error: 'RECONCILIATION_PROGRESS_SCOPE_TOO_LARGE',
        limit: MAX_RECONCILIATION_TRACE_RECORDS,
      });
    }

    if (
      stored.size !== byteSize ||
      stored.sha256 !== verifiedSha256 ||
      stored.contentType !== 'application/pdf' ||
      detectUniversalEvidenceMime(stored.bytes.subarray(0, 65536)) !== 'application/pdf'
    ) {
      return res.status(422).json({ error: 'EVIDENCE_CORRUPT' });
    }

    const extraction = await extractNativePdfText(stored.bytes);
    if (extraction.state !== 'extracted') {
      return res.status(409).json({ error: 'RECONCILIATION_SOURCE_UNAVAILABLE' });
    }

    const preparation = prepareStatementLines(extraction.text);
    const rawTransactionById = new Map<string, Record<string, any>>();
    const transactions: ReconciliationMatchableTransaction[] = [];
    const accountName =
      typeof account.name === 'string' && account.name.trim() ? account.name.trim() : null;

    for (const doc of transactionSnapshot.docs) {
      const data = doc.data() || {};
      context.repository.assertEntityIsolation(data);
      rawTransactionById.set(doc.id, data);

      if (!supportedStatus(data.status)) continue;
      if (!Number.isSafeInteger(Number(data.amountCents)) || Number(data.amountCents) <= 0) continue;
      const occurredAt = toIso(data.occurredAt);
      if (!occurredAt) continue;

      transactions.push({
        transactionId: doc.id,
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
      });
    }

    const preview = buildReconciliationMatchPreview(
      preparation.lines,
      transactions,
      accountId,
    );

    const reconciliationById = new Map(
      reconciliationSnapshot.docs.map((doc) => [doc.id, doc.data() || {}]),
    );
    const lockByFingerprint = new Map<string, Record<string, any>>();
    for (const doc of lockSnapshot.docs) {
      const data = doc.data() || {};
      if (
        data.organizationId === organizationId &&
        data.financeEntityId === financeEntityId &&
        data.evidenceId === evidenceId &&
        typeof data.statementLineFingerprint === 'string'
      ) {
        lockByFingerprint.set(data.statementLineFingerprint, {
          id: doc.id,
          ...data,
        });
      }
    }

    const confirmations: ReconciliationProgressConfirmation[] = [];
    for (const line of preparation.lines) {
      const fingerprint = buildStatementLineFingerprint({
        organizationId,
        financeEntityId,
        evidenceId,
        line,
      });
      const lock = lockByFingerprint.get(fingerprint);

      if (lock?.status === 'released') {
        confirmations.push({
          lineNumber: line.lineNumber,
          status: 'released',
          transactionId: null,
          reconciliationId: null,
        });
        continue;
      }

      if (lock?.status === 'active') {
        const reconciliationId =
          typeof lock.activeReconciliationId === 'string'
            ? lock.activeReconciliationId
            : '';
        const transactionId =
          typeof lock.activeTransactionId === 'string'
            ? lock.activeTransactionId
            : '';
        const reconciliation = reconciliationById.get(reconciliationId) || {};
        const transaction = rawTransactionById.get(transactionId) || {};

        const verifiedActive =
          Boolean(reconciliationId) &&
          Boolean(transactionId) &&
          reconciliation.status === 'confirmed' &&
          reconciliation.organizationId === organizationId &&
          reconciliation.financeEntityId === financeEntityId &&
          reconciliation.evidenceId === evidenceId &&
          reconciliation.accountId === accountId &&
          reconciliation.statementLineFingerprint === fingerprint &&
          transaction.reconciliationStatus === 'reconciled' &&
          transaction.reconciliationId === reconciliationId &&
          transaction.reconciliationLineLockId === lock.id;

        confirmations.push({
          lineNumber: line.lineNumber,
          status: verifiedActive ? 'active' : 'released',
          transactionId: verifiedActive ? transactionId : null,
          reconciliationId: verifiedActive ? reconciliationId : null,
        });
        continue;
      }

      const legacyReconciliationId = buildLegacyReconciliationId({
        organizationId,
        financeEntityId,
        evidenceId,
        statementLineFingerprint: fingerprint,
      });
      const legacy = reconciliationById.get(legacyReconciliationId) || {};
      const legacyTransactionId =
        typeof legacy.transactionId === 'string' ? legacy.transactionId : '';
      const legacyTransaction = rawTransactionById.get(legacyTransactionId) || {};

      const verifiedLegacy =
        legacy.status === 'confirmed' &&
        legacy.organizationId === organizationId &&
        legacy.financeEntityId === financeEntityId &&
        legacy.evidenceId === evidenceId &&
        legacy.accountId === accountId &&
        legacy.statementLineFingerprint === fingerprint &&
        legacyTransaction.reconciliationStatus === 'reconciled' &&
        legacyTransaction.reconciliationId === legacyReconciliationId;

      if (verifiedLegacy) {
        confirmations.push({
          lineNumber: line.lineNumber,
          status: 'active',
          transactionId: legacyTransactionId,
          reconciliationId: legacyReconciliationId,
        });
      }
    }

    return res.status(200).json(
      buildReconciliationProgress({
        financeEntityId,
        evidenceId,
        accountId,
        preparedLines: preparation.lines,
        preview,
        confirmations,
      }),
    );
  } catch (error: any) {
    const message = String(error?.message || '');
    if (error?.status) {
      return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    }
    if (
      message === 'FORBIDDEN_FINANCE_ACCESS' ||
      message === 'FINANCE_ENTITY_MISMATCH' ||
      message === 'Session not granted'
    ) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (message === 'FINANCE_ENTITY_NOT_FOUND') return res.status(404).json({ error: message });
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') return res.status(409).json({ error: message });

    console.error('Reconciliation progress error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
