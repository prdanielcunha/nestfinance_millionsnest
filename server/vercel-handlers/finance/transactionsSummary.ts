import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AggregateField } from 'firebase-admin/firestore';
import { hasEffectiveCapability, resolveFinanceRequestContext } from './accessHelpers.js';
import { loadCertifiedTodayBalance } from './certifiedTodayBalance.js';
import { assertBookScope,bookId } from '../../../shared/finance/ledger/certifiedPosting.js';
import { getTransactionListQueryBounds } from '../../../shared/finance/ledger/listQueryKeys.js';
import { getAccountNature } from '../../../shared/finance/smartLogic.js';
import {
  buildTodayOperationalBalance,
  type TodayOperationalSnapshot,
} from '../../../shared/finance/todayOperationalSummary.js';

type SupportedSummaryStatus = 'draft' | 'ready_for_review' | 'approved_for_posting';

function statusBounds(financeEntityId: string, status: SupportedSummaryStatus) {
  const prefix = `${financeEntityId}|${status}|`;
  return { lower: prefix, upper: `${prefix}\uf8ff` };
}

function statusQuery(repository: any, financeEntityId: string, status: SupportedSummaryStatus) {
  const bounds = statusBounds(financeEntityId, status);
  return repository
    .getTransactionsQuery()
    .where('listQueryKeys.status', '>=', bounds.lower)
    .where('listQueryKeys.status', '<', bounds.upper);
}

async function countQuery(query: any): Promise<number> {
  const aggregate = await query.count().get();
  const count = aggregate.data()?.count;
  return typeof count === 'number' ? count : 0;
}

function boundedQuery(
  repository: any,
  financeEntityId: string,
  transactionKind: string,
  status?: string,
  occurredFrom?: string,
  occurredTo?: string,
) {
  const bounds = getTransactionListQueryBounds(
    financeEntityId,
    transactionKind,
    status,
    occurredFrom,
    occurredTo,
  );
  return repository
    .getTransactionsQuery()
    .where(bounds.field, '>=', bounds.startAt)
    .where(bounds.field, '<', bounds.endBefore);
}

async function sumAmount(query: any): Promise<number> {
  const snapshot = await query.aggregate({
    amountCentsSum: AggregateField.sum('amountCents'),
  }).get();
  const value = Number(snapshot.data()?.amountCentsSum || 0);
  return Number.isSafeInteger(value) ? value : 0;
}

function validIso(value: unknown) {
  if (typeof value !== 'string' || value.length > 40) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function validDateOnly(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(value + 'T12:00:00.000Z');
  return Number.isNaN(parsed.getTime()) ? null : value;
}

function plusDays(dateOnly: string, days: number) {
  const date = new Date(dateOnly + 'T12:00:00.000Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { financeEntityId } = req.body || {};
    if (!financeEntityId || typeof financeEntityId !== 'string') {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const now = new Date();
    const fallbackDate = now.toISOString().slice(0, 10);
    const localDate = validDateOnly(req.body?.localDate) || fallbackDate;
    const fallbackDayStart = localDate + 'T00:00:00.000Z';
    const fallbackDayEndDate = new Date(fallbackDayStart);
    fallbackDayEndDate.setUTCDate(fallbackDayEndDate.getUTCDate() + 1);
    const dayStartIso = validIso(req.body?.dayStartIso) || fallbackDayStart;
    const dayEndIso = validIso(req.body?.dayEndIso) || fallbackDayEndDate.toISOString();
    if (Date.parse(dayStartIso) >= Date.parse(dayEndIso)) {
      return res.status(400).json({ error: 'INVALID_LOCAL_DAY' });
    }

    const { db, organizationId, context, sessionList } = await resolveFinanceRequestContext(req, 'finance.view');
    const canViewBalance = hasEffectiveCapability(sessionList, 'finance.balance.view');
    const certifiedBalance = canViewBalance ? await loadCertifiedTodayBalance(db,organizationId,financeEntityId) : null;
    const useLegacyBalance = canViewBalance && certifiedBalance === null;

    const draftQuery = statusQuery(context.repository, financeEntityId, 'draft');
    const readyQuery = statusQuery(context.repository, financeEntityId, 'ready_for_review');
    const approvedQuery = statusQuery(context.repository, financeEntityId, 'approved_for_posting');

    const entityRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId);

    const todayIncomeAll = boundedQuery(context.repository, financeEntityId, 'income', undefined, dayStartIso, dayEndIso);
    const todayIncomeReversed = boundedQuery(context.repository, financeEntityId, 'income', 'reversed', dayStartIso, dayEndIso);
    const todayExpenseAll = boundedQuery(context.repository, financeEntityId, 'expense', undefined, dayStartIso, dayEndIso);
    const todayExpenseReversed = boundedQuery(context.repository, financeEntityId, 'expense', 'reversed', dayStartIso, dayEndIso);

    const postedIncome = boundedQuery(context.repository, financeEntityId, 'income', 'posted');
    const postedExpense = boundedQuery(context.repository, financeEntityId, 'expense', 'posted');
    const postedLiabilitySettlement = boundedQuery(context.repository, financeEntityId, 'liability_settlement', 'posted');
    const postedAdjustments = boundedQuery(context.repository, financeEntityId, 'adjustment', 'posted');

    const dueThroughDate = plusDays(localDate, 7);
    // Registered obligations are NOT the same as OCR-suggested invoice dates.
    // Keep counts independent; the same invoice may exist in both collections.
    const registeredDueQuery = entityRef.collection('financePayables')
      .where('dueDate', '>=', localDate)
      .where('dueDate', '<=', dueThroughDate)
      .limit(101);

    const dueQuery = entityRef
      .collection('universalEvidence')
      .where('transactionAnalysis.analysis.dueDate.value', '>=', localDate)
      .where('transactionAnalysis.analysis.dueDate.value', '<=', dueThroughDate)
      .limit(101);

    const [
      draftSnapshot,
      readyForReview,
      approvedForPosting,
      todayIncomeTotal,
      todayIncomeReversedTotal,
      todayExpenseTotal,
      todayExpenseReversedTotal,
      postedIncomeCents,
      postedExpenseCents,
      postedLiabilitySettlementCents,
      postedAdjustmentCount,
      accountSnapshot,
      dueSnapshot,
      registeredDueSnapshot,
      payableCashDay,
    ] = await Promise.all([
      draftQuery.select('returnedToDraftAt', 'returnedToDraftReason', 'returnedToDraftComment').get(),
      countQuery(readyQuery),
      countQuery(approvedQuery),
      sumAmount(todayIncomeAll),
      sumAmount(todayIncomeReversed),
      sumAmount(todayExpenseAll),
      sumAmount(todayExpenseReversed),
      useLegacyBalance ? sumAmount(postedIncome) : 0,
      useLegacyBalance ? sumAmount(postedExpense) : 0,
      useLegacyBalance ? sumAmount(postedLiabilitySettlement) : 0,
      useLegacyBalance ? countQuery(postedAdjustments) : 0,
      useLegacyBalance ? context.repository.getAccountsQuery().limit(1001).get() : null,
      dueQuery.get(),
      registeredDueQuery.get(),
      db.collection('organizations').doc(organizationId).collection('financeAggregates').doc('payable_cash_day_'+bookId(financeEntityId,localDate)).get(),
    ]);

    if (accountSnapshot && accountSnapshot.size > 1000) {
      return res.status(409).json({ error: 'CATALOG_LIMIT_EXCEEDED' });
    }

    const returnedCorrections = draftSnapshot.docs.reduce((total: number, snapshot: any) => {
      const data = snapshot.data() || {};
      const wasReturned = Boolean(
        data.returnedToDraftAt ||
        data.returnedToDraftReason ||
        data.returnedToDraftComment,
      );
      return total + (wasReturned ? 1 : 0);
    }, 0);

    const draftTotal = draftSnapshot.size;
    const simpleDrafts = Math.max(0, draftTotal - returnedCorrections);
    const totalOpen = draftTotal + readyForReview + approvedForPosting;

    const activeAssetAccounts = (accountSnapshot?.docs ?? []).flatMap((doc: any) => {
      const data = doc.data() || {};
      context.repository.assertEntityIsolation(data);
      if (data.active === false) return [];
      const nature = data.nature || getAccountNature(data.type);
      return nature === 'asset' ? [{ openingBalanceCents: data.openingBalanceCents }] : [];
    });

    const dueSoonTruncated = dueSnapshot.size > 100;
    const dueSoonCount = dueSnapshot.docs.slice(0, 100).reduce((total: number, doc: any) => {
      const data = doc.data() || {};
      if (
        data.organizationId !== organizationId ||
        data.financeEntityId !== financeEntityId ||
        data.processingState !== 'accepted' ||
        data.duplicate === true
      ) return total;
      const analysis = data.transactionAnalysis?.analysis;
      const dueDate = analysis?.dueDate?.value;
      const settlement = analysis?.settlementState?.value;
      return typeof dueDate === 'string' && settlement === 'unpaid' ? total + 1 : total;
    }, 0);

    const registeredPayablesDueSoonTruncated = registeredDueSnapshot.size > 100;
    const registeredPayablesDueSoonCount = registeredDueSnapshot.docs.slice(0, 100)
      .reduce((total:number,doc:any)=>{
        const bill=doc.data()||{};
        if(bill.organizationId!==organizationId||bill.financeEntityId!==financeEntityId)
          throw Object.assign(new Error('PAYABLE_SCOPE_MISMATCH'),{status:409});
        const open=['awaiting_review','open','partially_paid'].includes(bill.status);
        if(!open)return total;
        // A corrupted settlement cannot be silently treated as a valid bill.
        if(!Number.isSafeInteger(bill.remainingCents)||bill.remainingCents<=0)
          throw Object.assign(new Error('PAYABLE_AMOUNT_INTEGRITY'),{status:409});
        return total+1;
      },0);

    const payableDay=payableCashDay.data();if(payableDay)assertBookScope(payableDay,organizationId,financeEntityId);
    const payablePaymentOutCents=payableDay?.paymentOutCents??0,payableCorrectionInCents=payableDay?.correctionInCents??0;
    if(!Number.isSafeInteger(payablePaymentOutCents)||payablePaymentOutCents<0||!Number.isSafeInteger(payableCorrectionInCents)||payableCorrectionInCents<0)throw Error('PAYABLE_CASH_DAY_INTEGRITY');
    const operational: TodayOperationalSnapshot = {
      localDate,
      incomeCents: Math.max(0, todayIncomeTotal - todayIncomeReversedTotal),
      expenseCents: Math.max(0, todayExpenseTotal - todayExpenseReversedTotal + payablePaymentOutCents - payableCorrectionInCents),
      payablePaymentOutCents,payableCorrectionInCents,
      dueSoonCount,
      dueSoonTruncated,
      registeredPayablesDueSoonCount,
      registeredPayablesDueSoonTruncated,
      balance: canViewBalance ? certifiedBalance ?? buildTodayOperationalBalance({
        activeAssetAccounts,
        postedIncomeCents,
        postedExpenseCents,
        postedLiabilitySettlementCents,
        postedAdjustmentCount,
      }) : { state: 'restricted', amountCents: null, reason: 'permission_required' },
      source: {
        deterministic: true,
        aiUsedForTotals: false,
        dueDatesMayComeFromReviewedOrProposedDocumentAnalysis: true,
        balanceUsesPostedTransactionsOnly: true,
      },
    };

    return res.status(200).json({
      summary: {
        returnedCorrections,
        simpleDrafts,
        readyForReview,
        approvedForPosting,
        totalOpen,
      },
      operational,
      requestId: req.body?.requestId || 'unknown',
    });
  } catch (error: any) {
    console.error('Transactions Summary Error:', error);

    if (error?.status === 409) return res.status(409).json({error:'PAYABLE_READ_INTEGRITY_ERROR'});
    if (error.status === 401 || error.status === 403) {
      return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    }
    if (error.message === 'FORBIDDEN_FINANCE_ACCESS') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (
      error.code === 'auth/id-token-revoked' ||
      error.code === 'auth/id-token-expired' ||
      error.code === 'auth/invalid-id-token'
    ) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
