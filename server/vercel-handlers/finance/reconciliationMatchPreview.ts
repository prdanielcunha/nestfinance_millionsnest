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
import { resolveFinanceRequestContext } from './accessHelpers.js';
import {
  extractNativePdfText,
  PDF_TEXT_MAX_INPUT_BYTES,
} from './universalEvidencePdfTextExtractor.js';
import { getUniversalEvidenceStorageAdapter } from './universalEvidenceStorage.js';

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
  if (typeof value?.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (value instanceof Date) return value.toISOString();
  return null;
}

function boundedDescription(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/gu, ' ').trim();
  return normalized ? normalized.slice(0, 240) : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId =
    typeof req.headers['x-vercel-id'] === 'string'
      ? req.headers['x-vercel-id']
      : `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', requestId });
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
      return res.status(400).json({ error: 'INVALID_PARAMETERS', requestId });
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
      return res.status(404).json({ error: 'RECONCILIATION_ACCOUNT_NOT_FOUND', requestId });
    }

    const account = accountSnapshot.data() || {};
    context.repository.assertEntityIsolation(account);
    if (!isEligibleBankAccount(account)) {
      return res.status(409).json({ error: 'RECONCILIATION_ACCOUNT_NOT_READY', requestId });
    }

    const evidence = evidenceSnapshot.data() || {};
    if (
      !evidenceSnapshot.exists ||
      evidence.organizationId !== organizationId ||
      evidence.financeEntityId !== financeEntityId
    ) {
      return res.status(404).json({ error: 'EVIDENCE_NOT_FOUND', requestId });
    }

    if (
      evidence.processingState !== 'accepted' ||
      evidence.duplicate === true ||
      evidence.classification?.source !== 'human' ||
      evidence.classification?.documentType !== 'bank_statement' ||
      evidence.review?.status !== 'reviewed'
    ) {
      return res.status(409).json({ error: 'RECONCILIATION_STATEMENT_NOT_READY', requestId });
    }

    const verifiedMimeType = evidence.verifiedMimeType;
    if (verifiedMimeType !== 'application/pdf') {
      return res.status(415).json({ error: 'RECONCILIATION_STATEMENT_PDF_REQUIRED', requestId });
    }

    const byteSize = Number(evidence.byteSize);
    const original = evidence.original && typeof evidence.original === 'object'
      ? evidence.original
      : null;
    const path = typeof original?.path === 'string' ? original.path : '';
    const verifiedByteSize = Number(original?.verifiedByteSize);
    const verifiedSha256 = original?.verifiedSha256;

    if (
      !Number.isInteger(Number(evidence.version)) ||
      Number(evidence.version) < 2 ||
      !isUniversalEvidenceSize(byteSize) ||
      !path ||
      original?.immutable !== true ||
      original?.verifiedMimeType !== verifiedMimeType ||
      verifiedByteSize !== byteSize ||
      !isSha256(verifiedSha256)
    ) {
      return res.status(422).json({ error: 'EVIDENCE_CORRUPT', requestId });
    }

    if (byteSize > PDF_TEXT_MAX_INPUT_BYTES) {
      return res.status(413).json({ error: 'EVIDENCE_TEXT_EXTRACTION_TOO_LARGE', requestId });
    }

    const [stored, transactionsSnapshot] = await Promise.all([
      getUniversalEvidenceStorageAdapter().readPreview(path),
      context.repository
        .getTransactionsQuery()
        .limit(RECONCILIATION_MATCH_MAX_TRANSACTIONS + 1)
        .get(),
    ]);

    if (transactionsSnapshot.size > RECONCILIATION_MATCH_MAX_TRANSACTIONS) {
      return res.status(409).json({
        error: 'RECONCILIATION_MATCH_SCOPE_TOO_LARGE',
        limit: RECONCILIATION_MATCH_MAX_TRANSACTIONS,
        requestId,
      });
    }

    if (stored.size !== byteSize || stored.sha256 !== verifiedSha256) {
      return res.status(422).json({ error: 'EVIDENCE_CORRUPT', requestId });
    }
    if (stored.contentType !== verifiedMimeType) {
      return res.status(415).json({ error: 'EVIDENCE_UNSUPPORTED', requestId });
    }

    const detectedMime = detectUniversalEvidenceMime(stored.bytes.subarray(0, 65536));
    if (detectedMime !== 'application/pdf') {
      return res.status(422).json({ error: 'EVIDENCE_CORRUPT', requestId });
    }

    const extraction = await extractNativePdfText(stored.bytes);
    if (extraction.state === 'unavailable') {
      return res.status(200).json({
        state: 'unavailable',
        reason: extraction.reason,
        source: {
          evidenceId,
          evidenceVersion: Number(evidence.version),
          accountId,
          association: 'request_context_only',
          sourceBacked: true,
        },
        authority: {
          deterministic: true,
          aiUsed: false,
          ocrUsed: false,
          financialMutation: false,
          reconciliationMutation: false,
          autoMatched: false,
          requiresHumanConfirmation: true,
        },
        requestId,
      });
    }

    const preparation = prepareStatementLines(extraction.text);
    const transactions: ReconciliationMatchableTransaction[] = [];

    for (const doc of transactionsSnapshot.docs) {
      const data = doc.data() || {};
      context.repository.assertEntityIsolation(data);

      if (!supportedStatus(data.status)) continue;
      if (!Number.isSafeInteger(Number(data.amountCents)) || Number(data.amountCents) <= 0) continue;

      const occurredAt = toIso(data.occurredAt);
      if (!occurredAt) continue;

      const reconciliationStatus =
        data.reconciliationStatus === 'reconciled'
          ? 'reconciled'
          : data.reconciliationStatus === 'unreconciled'
            ? 'unreconciled'
            : 'unknown';

      transactions.push({
        transactionId: doc.id,
        transactionKind:
          typeof data.transactionKind === 'string'
            ? data.transactionKind
            : typeof data.direction === 'string'
              ? data.direction
              : 'unknown',
        status: data.status,
        reconciliationStatus,
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
        accountName:
          typeof account.name === 'string' && account.name.trim() ? account.name.trim() : null,
      });
    }

    const preview = buildReconciliationMatchPreview(
      preparation.lines,
      transactions,
      accountId,
    );

    return res.status(200).json({
      state: 'preview',
      source: {
        evidenceId,
        evidenceVersion: Number(evidence.version),
        accountId,
        accountName:
          typeof account.name === 'string' && account.name.trim() ? account.name.trim() : '',
        institutionName:
          typeof account.institutionName === 'string' ? account.institutionName : null,
        accountLast4:
          typeof account.accountLast4 === 'string' ? account.accountLast4 : null,
        association: 'request_context_only',
        sourceBacked: true,
      },
      transactionScope: {
        scanned: transactionsSnapshot.size,
        usable: transactions.length,
        limit: RECONCILIATION_MATCH_MAX_TRANSACTIONS,
      },
      preparation: {
        candidateLines: preparation.candidateLines,
        preparedLines: preparation.preparedLines,
        needsConfirmationLines: preparation.needsConfirmationLines,
        limited: preparation.limited,
      },
      preview,
      authority: {
        deterministic: true,
        aiUsed: false,
        ocrUsed: false,
        financialMutation: false,
        reconciliationMutation: false,
        autoMatched: false,
        requiresHumanConfirmation: true,
      },
      requestId,
    });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (error?.status) {
      return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED', requestId });
    }
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') {
      return res.status(403).json({ error: 'FORBIDDEN', requestId });
    }
    if (message === 'FINANCE_ENTITY_MISMATCH') {
      return res.status(403).json({ error: 'FORBIDDEN_FINANCE_ACCESS', requestId });
    }
    if (message === 'FINANCE_ENTITY_NOT_FOUND' || message === 'EVIDENCE_NOT_FOUND') {
      return res.status(404).json({ error: message, requestId });
    }
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') {
      return res.status(409).json({ error: message, requestId });
    }

    console.error('Reconciliation match preview error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', requestId });
  }
}
