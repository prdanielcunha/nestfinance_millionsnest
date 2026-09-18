import type { VercelRequest, VercelResponse } from '@vercel/node';
import { normalizeAccountType } from '../../../shared/finance/smartLogic.js';
import {
  RECONCILIATION_READINESS_VERSION,
  type ReconciliationBankAccount,
  type ReconciliationReadiness,
  type ReconciliationReadinessState,
  type ReconciliationStatementSource,
  type ReconciliationStatementSourceState,
} from '../../../shared/finance/reconciliation.js';
import { resolveFinanceRequestContext } from './accessHelpers.js';

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

function isBankAccountType(type: string) {
  return type === 'bank_checking' || type === 'bank_savings' || type === 'payment_account';
}

function readinessState(input: {
  eligibleBankAccounts: number;
  classifiedBankStatements: number;
  pendingStatementReview: number;
  readyPdfStatements: number;
  reviewedUnsupportedStatements: number;
}): ReconciliationReadinessState {
  if (input.eligibleBankAccounts === 0) return 'no_bank_account';
  if (input.readyPdfStatements > 0) return 'source_ready';
  if (input.pendingStatementReview > 0) return 'needs_statement_review';
  if (input.reviewedUnsupportedStatements > 0) return 'reviewed_source_not_supported';
  return 'needs_statement';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { db, organizationId, financeEntityId, context } =
      await resolveFinanceRequestContext(req, 'finance.view');

    const evidenceRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId)
      .collection('universalEvidence');

    const [accountSnapshot, statementSnapshot] = await Promise.all([
      context.repository.getAccountsQuery().limit(1001).get(),
      evidenceRef
        .where('classification.documentType', '==', 'bank_statement')
        .limit(201)
        .get(),
    ]);

    if (accountSnapshot.size > 1000 || statementSnapshot.size > 200) {
      return res.status(409).json({ error: 'RECONCILIATION_READINESS_LIMIT_EXCEEDED' });
    }

    const accounts: ReconciliationBankAccount[] = accountSnapshot.docs
      .map((doc: any) => {
        const data = doc.data() || {};
        context.repository.assertEntityIsolation(data);
        const normalizedType = normalizeAccountType(data.type);
        const active = data.active !== false;
        const configured = data.configurationStatus === 'complete';
        return {
          accountId: doc.id,
          name: typeof data.name === 'string' ? data.name : '',
          type: normalizedType,
          nature: typeof data.nature === 'string' ? data.nature : null,
          institutionName:
            typeof data.institutionName === 'string' && data.institutionName.trim()
              ? data.institutionName.trim()
              : null,
          accountLast4:
            typeof data.accountLast4 === 'string' && data.accountLast4.trim()
              ? data.accountLast4.trim()
              : null,
          currency:
            typeof data.currency === 'string' && data.currency.trim()
              ? data.currency
              : 'BRL',
          configurationStatus:
            typeof data.configurationStatus === 'string'
              ? data.configurationStatus
              : null,
          active,
          eligible:
            active &&
            configured &&
            data.nature === 'asset' &&
            isBankAccountType(normalizedType),
        };
      })
      .sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.name.localeCompare(b.name));

    const statements: ReconciliationStatementSource[] = statementSnapshot.docs
      .flatMap((doc: any) => {
        const data = doc.data() || {};
        if (
          data.organizationId !== organizationId ||
          data.financeEntityId !== financeEntityId ||
          data.processingState !== 'accepted' ||
          data.duplicate === true ||
          data.classification?.source !== 'human' ||
          data.classification?.documentType !== 'bank_statement'
        ) {
          return [];
        }

        const reviewed = data.review?.status === 'reviewed';
        const verifiedMimeType =
          typeof data.verifiedMimeType === 'string' ? data.verifiedMimeType : null;
        const state: ReconciliationStatementSourceState =
          !reviewed
            ? 'pending_review'
            : verifiedMimeType === 'application/pdf'
              ? 'ready_for_native_text_check'
              : 'reviewed_non_pdf';

        return [{
          evidenceId: doc.id,
          originalFilename:
            typeof data.originalFilename === 'string' ? data.originalFilename : '',
          verifiedMimeType,
          byteSize: Number.isSafeInteger(Number(data.byteSize))
            ? Number(data.byteSize)
            : 0,
          createdAt: toIso(data.createdAt),
          reviewedAt: toIso(data.review?.reviewedAt),
          version: Number.isInteger(Number(data.version)) ? Number(data.version) : 1,
          state,
          sourceBacked: true as const,
        }];
      })
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    const summary = {
      eligibleBankAccounts: accounts.filter((item) => item.eligible).length,
      classifiedBankStatements: statements.length,
      pendingStatementReview: statements.filter((item) => item.state === 'pending_review').length,
      readyPdfStatements: statements.filter((item) => item.state === 'ready_for_native_text_check').length,
      reviewedUnsupportedStatements: statements.filter((item) => item.state === 'reviewed_non_pdf').length,
    };

    const result: ReconciliationReadiness = {
      version: RECONCILIATION_READINESS_VERSION,
      financeEntityId,
      state: readinessState(summary),
      financialMutation: false,
      aiUsed: false,
      postingRequired: false,
      accounts,
      statements,
      summary,
    };

    return res.status(200).json(result);
  } catch (error: any) {
    const message = String(error?.message || '');
    if (error?.status) {
      return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    }
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (message === 'FINANCE_ENTITY_NOT_FOUND') return res.status(404).json({ error: message });
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') return res.status(409).json({ error: message });

    console.error('Reconciliation readiness error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
