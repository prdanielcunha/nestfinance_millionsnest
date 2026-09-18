import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Timestamp } from 'firebase-admin/firestore';
import {
  buildPeriodCloseReadiness,
  PERIOD_CLOSE_MAX_COUNT_SESSIONS,
  PERIOD_CLOSE_MAX_EVIDENCE,
  PERIOD_CLOSE_MAX_TRANSACTIONS,
} from '../../../shared/finance/periodCloseReadiness.js';
import { getTransactionListQueryBounds } from '../../../shared/finance/ledger/listQueryKeys.js';
import { normalizeAccountType } from '../../../shared/finance/smartLogic.js';
import { resolveFinanceRequestContext } from './accessHelpers.js';

function parsePeriod(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, month] = value.split('-').map(Number);
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || month < 1 || month > 12) return null;
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return {
    key: value,
    start,
    end,
    startDate: start.toISOString().slice(0, 10),
    endDateExclusive: end.toISOString().slice(0, 10),
  };
}

function toIso(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === 'function') {
    try { return value.toDate().toISOString(); } catch { return null; }
  }
  return null;
}

function eligibleBankAccount(data: any) {
  const type = normalizeAccountType(data?.type);
  return data?.active !== false &&
    data?.configurationStatus === 'complete' &&
    data?.nature === 'asset' &&
    (type === 'bank_checking' || type === 'bank_savings' || type === 'payment_account');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const financeEntityId = req.body?.financeEntityId;
    const period = parsePeriod(req.body?.period);
    if (typeof financeEntityId !== 'string' || !financeEntityId.trim() || !period) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const { db, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.view');
    const txBounds = getTransactionListQueryBounds(
      financeEntityId,
      undefined,
      undefined,
      period.start.toISOString(),
      period.end.toISOString(),
    );

    const entityRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId);

    const [txSnapshot, countSnapshot, evidenceSnapshot, accountsSnapshot] = await Promise.all([
      context.repository
        .getTransactionsQuery()
        .where(txBounds.field, '>=', txBounds.startAt)
        .where(txBounds.field, '<', txBounds.endBefore)
        .orderBy(txBounds.field, 'asc')
        .limit(PERIOD_CLOSE_MAX_TRANSACTIONS + 1)
        .get(),
      entityRef
        .collection('countSessions')
        .where('serviceDate', '>=', period.startDate)
        .where('serviceDate', '<', period.endDateExclusive)
        .limit(PERIOD_CLOSE_MAX_COUNT_SESSIONS + 1)
        .get(),
      entityRef
        .collection('universalEvidence')
        .where('createdAt', '>=', Timestamp.fromDate(period.start))
        .where('createdAt', '<', Timestamp.fromDate(period.end))
        .limit(PERIOD_CLOSE_MAX_EVIDENCE + 1)
        .get(),
      context.repository.getAccountsQuery().limit(1000).get(),
    ]);

    if (txSnapshot.size > PERIOD_CLOSE_MAX_TRANSACTIONS) {
      return res.status(422).json({ error: 'PERIOD_CLOSE_TRANSACTION_SCOPE_TOO_LARGE' });
    }
    if (countSnapshot.size > PERIOD_CLOSE_MAX_COUNT_SESSIONS) {
      return res.status(422).json({ error: 'PERIOD_CLOSE_COUNT_SCOPE_TOO_LARGE' });
    }
    if (evidenceSnapshot.size > PERIOD_CLOSE_MAX_EVIDENCE) {
      return res.status(422).json({ error: 'PERIOD_CLOSE_EVIDENCE_SCOPE_TOO_LARGE' });
    }

    const transactions = txSnapshot.docs.flatMap((doc: any) => {
      const data = doc.data() || {};
      context.repository.assertEntityIsolation(data);
      const occurredAt = toIso(data.occurredAt);
      if (!occurredAt) return [];
      const occurred = new Date(occurredAt);
      if (occurred < period.start || occurred >= period.end) return [];
      return [{
        transactionKind: String(data.transactionKind || data.direction || ''),
        status: String(data.status || ''),
        amountCents: Number(data.amountCents || 0),
        reconciliationStatus: data.reconciliationStatus || null,
        accountId: data.accountId || null,
        sourceAccountId: data.sourceAccountId || null,
        destinationAccountId: data.destinationAccountId || null,
      }];
    });

    const countSessions = countSnapshot.docs.map((doc: any) => {
      const data = doc.data() || {};
      if (data.financeEntityId && data.financeEntityId !== financeEntityId) {
        throw new Error('FINANCE_ENTITY_MISMATCH');
      }
      return { status: String(data.status || '') };
    });

    const evidence = evidenceSnapshot.docs.map((doc: any) => {
      const data = doc.data() || {};
      if (data.organizationId !== organizationId || data.financeEntityId !== financeEntityId) {
        throw new Error('FINANCE_ENTITY_MISMATCH');
      }
      return {
        processingState: String(data.processingState || ''),
        duplicate: data.duplicate === true,
        humanClassified: data.classification?.source === 'human',
        reviewStatus: typeof data.review?.status === 'string' ? data.review.status : null,
      };
    });

    const configuredBankAccountIds = accountsSnapshot.docs.flatMap((doc: any) => {
      const data = doc.data() || {};
      context.repository.assertEntityIsolation(data);
      return eligibleBankAccount(data) ? [doc.id] : [];
    });

    return res.status(200).json(buildPeriodCloseReadiness({
      financeEntityId,
      periodKey: period.key,
      startDate: period.startDate,
      endDateExclusive: period.endDateExclusive,
      configuredBankAccountIds,
      transactions,
      countSessions,
      evidence,
    }));
  } catch (error: any) {
    const message = String(error?.message || '');
    if (error?.status) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (message === 'FINANCE_ENTITY_NOT_FOUND') return res.status(404).json({ error: message });
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') return res.status(409).json({ error: message });
    if (message === 'FINANCE_ENTITY_MISMATCH') return res.status(409).json({ error: message });
    if (error?.code === 'auth/id-token-expired' || error?.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    console.error('Period Close Readiness Error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
