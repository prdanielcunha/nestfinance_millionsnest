import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  detectUniversalEvidenceMime,
  isUniversalEvidenceSize,
  isSha256,
} from '../../../shared/finance/universalEvidence.js';
import { normalizeAccountType } from '../../../shared/finance/smartLogic.js';
import { prepareStatementLines } from '../../../shared/finance/reconciliationStatementLines.js';
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

    const account = accountSnapshot.data() || {};
    if (!accountSnapshot.exists) {
      return res.status(404).json({ error: 'RECONCILIATION_ACCOUNT_NOT_FOUND', requestId });
    }
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

    const stored = await getUniversalEvidenceStorageAdapter().readPreview(path);
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
        source: {
          evidenceId,
          evidenceVersion: Number(evidence.version),
          accountId,
          accountName: typeof account.name === 'string' ? account.name : '',
          institutionName:
            typeof account.institutionName === 'string' ? account.institutionName : null,
          accountLast4:
            typeof account.accountLast4 === 'string' ? account.accountLast4 : null,
          association: 'request_context_only',
          sourceBacked: true,
        },
        extraction,
        authority: {
          deterministic: true,
          aiUsed: false,
          ocrUsed: false,
          financialMutation: false,
          reconciliationMutation: false,
          financialRecognition: false,
          requiresHumanConfirmation: true,
        },
        requestId,
      });
    }

    const preparation = prepareStatementLines(extraction.text);

    return res.status(200).json({
      state: 'prepared',
      source: {
        evidenceId,
        evidenceVersion: Number(evidence.version),
        accountId,
        accountName: typeof account.name === 'string' ? account.name : '',
        institutionName:
          typeof account.institutionName === 'string' ? account.institutionName : null,
        accountLast4:
          typeof account.accountLast4 === 'string' ? account.accountLast4 : null,
        association: 'request_context_only',
        sourceBacked: true,
      },
      extraction: {
        parser: extraction.parser,
        totalPages: extraction.totalPages,
        extractedPages: extraction.extractedPages,
        characters: extraction.characters,
        truncated: extraction.truncated,
      },
      preparation,
      authority: {
        deterministic: true,
        aiUsed: false,
        ocrUsed: false,
        financialMutation: false,
        reconciliationMutation: false,
        financialRecognition: false,
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

    console.error('Reconciliation statement prepare error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', requestId });
  }
}
