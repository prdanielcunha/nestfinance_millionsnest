import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import {
  TRANSACTION_WORKSPACE_DIRECTIONS,
  TRANSACTION_WORKSPACE_STATUSES,
} from '../../../shared/finance/transactionWorkspaceView.js';
import {
  normalizeTransactionSearchQuery,
  transactionMatchesSearchQuery,
} from '../../../shared/finance/transactionSearch.js';
import {
  buildTransactionSearchCoverageId,
  getTransactionSearchIndexRef,
} from './transactionSearchIndex.js';
import { evaluateReviewReadiness } from '../../../shared/finance/ledger/evaluateReviewReadiness.js';

const INDEX_CANDIDATE_LIMIT = 500;
const FALLBACK_SCAN_LIMIT = 1000;
const RESULT_LIMIT_MAX = 100;
const ALLOCATION_CHUNK_SIZE = 30;

type DateBase = 'occurred' | 'competence' | 'recorded';

function toIso(value: any): string | null {
  if (!value) return null;
  if (typeof value?.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  return null;
}

function normalizeOptionalDate(value: unknown, dateBase: DateBase) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 40) return undefined;
  if (dateBase === 'competence') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/u);
    return match ? match[1] : undefined;
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString();
}

function normalizeOptionalString(value: unknown) {
  if (value === undefined || value === null || value === '' || value === 'all') return null;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= 160 ? normalized : undefined;
}

function dateValue(data: any, dateBase: DateBase) {
  if (dateBase === 'competence') {
    const value = typeof data.competenceDate === 'string' ? data.competenceDate.slice(0, 10) : '';
    return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : null;
  }
  return toIso(dateBase === 'recorded' ? data.recordedAt : data.occurredAt);
}

function inferOrigin(data: any) {
  if (data?.countSource?.countSessionId) return 'count';
  const source = String(data?.sourceContext || '').trim().toLowerCase();
  if (/import|migration|migrat|csv|ofx|statement/u.test(source)) return 'imported';
  if (Array.isArray(data?.evidenceIds) && data.evidenceIds.length > 0) return 'evidence';
  if (/manual|transaction_create|guided|form/u.test(source)) return 'manual';
  return 'unknown';
}

function chunks<T>(values: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

async function loadAllocations(context: any, ids: string[], financeEntityId: string) {
  const byTransaction = new Map<string, any[]>();
  for (const idChunk of chunks(ids, ALLOCATION_CHUNK_SIZE)) {
    if (idChunk.length === 0) continue;
    const snapshot = await context.repository
      .getAllocationsQuery()
      .where('transactionId', 'in', idChunk)
      .get();
    for (const doc of snapshot.docs) {
      const allocation = { id: doc.id, ...doc.data() } as any;
      if (allocation.financeEntityId !== financeEntityId) continue;
      const transactionId = String(allocation.transactionId || '');
      const current = byTransaction.get(transactionId) || [];
      current.push(allocation);
      byTransaction.set(transactionId, current);
    }
  }
  return byTransaction;
}

function compactTransaction(
  doc: any,
  allocations: any[],
  dateBase: DateBase,
  readiness?: { blockers: unknown[]; warnings: unknown[]; ready: boolean } | null,
) {
  const data = doc.data() || {};
  const normalizedAllocations = allocations
    .slice()
    .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0))
    .map((allocation) => ({
      id: allocation.id || null,
      categoryId: allocation.categoryId || null,
      categoryName: allocation.categorySnapshot?.name || null,
      fundId: allocation.fundId || null,
      fundName: allocation.fundSnapshot?.name || null,
      costCenterId: allocation.costCenterId || null,
      amountCents: Number(allocation.amountCents || 0),
      memo: allocation.memo || null,
      sequence: Number(allocation.sequence || 0),
    }));
  const categoryNames = [...new Set(normalizedAllocations.map((item) => item.categoryName).filter(Boolean))];
  const fundNames = [...new Set(normalizedAllocations.map((item) => item.fundName).filter(Boolean))];

  return {
    id: doc.id,
    transactionId: doc.id,
    transactionKind: data.transactionKind || data.direction,
    direction: data.direction || data.transactionKind,
    status: data.status,
    amountCents: data.amountCents,
    occurredAt: toIso(data.occurredAt),
    competenceDate: typeof data.competenceDate === 'string' ? data.competenceDate : null,
    recordedAt: toIso(data.recordedAt),
    selectedDate: dateValue(data, dateBase),
    dateBase,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    accountId: data.accountId || null,
    sourceAccountId: data.sourceAccountId || null,
    destinationAccountId: data.destinationAccountId || null,
    paymentMethod: data.paymentMethod || null,
    description: data.description || '',
    summary: data.description || '',
    version: data.version || 1,
    accountName: data.accountSnapshot?.name || data.sourceAccountSnapshot?.name || '',
    categoryName: categoryNames[0] || '',
    categoryNames,
    fundNames,
    allocations: normalizedAllocations,
    submittedByDisplayName: data.submittedByDisplayName || null,
    createdBy: data.createdBy || null,
    sourceContext: data.sourceContext || null,
    origin: inferOrigin(data),
    evidenceCount: Array.isArray(data.evidenceIds) ? data.evidenceIds.length : 0,
    hasEvidence: Array.isArray(data.evidenceIds) && data.evidenceIds.length > 0,
    reconciliationStatus: data.reconciliationStatus || 'unreconciled',
    returnedToDraftAt: toIso(data.returnedToDraftAt),
    returnedToDraftReason: data.returnedToDraftReason || null,
    returnedToDraftComment: data.returnedToDraftComment || null,
    ...(readiness
      ? {
          blockerCount: readiness.blockers.length,
          warningCount: readiness.warnings.length,
          isReady: readiness.ready,
        }
      : {}),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { query, filters = {}, limit: requestedLimit = 50 } = req.body || {};
    const normalizedQuery = normalizeTransactionSearchQuery(query);

    const direction =
      typeof filters.direction === 'string' && filters.direction
        ? filters.direction
        : 'all';
    const status =
      typeof filters.status === 'string' && filters.status
        ? filters.status
        : 'all';
    const order = filters.order === 'oldest' ? 'oldest' : 'newest';
    const dateBase: DateBase =
      filters.dateBase === 'competence' || filters.dateBase === 'recorded'
        ? filters.dateBase
        : 'occurred';
    const dateFrom = normalizeOptionalDate(filters.occurredFrom, dateBase);
    const dateTo = normalizeOptionalDate(filters.occurredTo, dateBase);
    const categoryId = normalizeOptionalString(filters.categoryId);
    const accountId = normalizeOptionalString(filters.accountId);
    const fundId = normalizeOptionalString(filters.fundId);
    const costCenterId = normalizeOptionalString(filters.costCenterId);
    const paymentMethod = normalizeOptionalString(filters.paymentMethod);
    const sourceContext = normalizeOptionalString(filters.sourceContext);
    const evidence =
      filters.evidence === 'with_evidence' || filters.evidence === 'without_evidence'
        ? filters.evidence
        : 'all';
    const quality =
      ['missing_description', 'missing_category', 'unreconciled'].includes(filters.quality)
        ? filters.quality
        : 'all';
    const origin =
      ['manual', 'count', 'evidence', 'imported', 'unknown'].includes(filters.origin)
        ? filters.origin
        : 'all';

    const amountMinCents =
      filters.amountMinCents === undefined || filters.amountMinCents === null || filters.amountMinCents === ''
        ? null
        : Number(filters.amountMinCents);
    const amountMaxCents =
      filters.amountMaxCents === undefined || filters.amountMaxCents === null || filters.amountMaxCents === ''
        ? null
        : Number(filters.amountMaxCents);

    const hasStructuredFilter =
      direction !== 'all' ||
      status !== 'all' ||
      Boolean(dateFrom) ||
      Boolean(dateTo) ||
      categoryId !== null ||
      accountId !== null ||
      fundId !== null ||
      costCenterId !== null ||
      paymentMethod !== null ||
      sourceContext !== null ||
      evidence !== 'all' ||
      quality !== 'all' ||
      origin !== 'all' ||
      amountMinCents !== null ||
      amountMaxCents !== null;

    if (!normalizedQuery && !hasStructuredFilter) {
      return res.status(400).json({ error: 'INVALID_SEARCH_QUERY' });
    }

    if (
      !(TRANSACTION_WORKSPACE_DIRECTIONS as readonly string[]).includes(direction) ||
      !(TRANSACTION_WORKSPACE_STATUSES as readonly string[]).includes(status) ||
      categoryId === undefined ||
      accountId === undefined ||
      fundId === undefined ||
      costCenterId === undefined ||
      paymentMethod === undefined ||
      sourceContext === undefined
    ) {
      return res.status(400).json({ error: 'INVALID_SEARCH_FILTERS' });
    }
    if (dateFrom === undefined || dateTo === undefined) {
      return res.status(400).json({ error: 'INVALID_SEARCH_DATE_FILTER' });
    }
    if (
      (amountMinCents !== null && (!Number.isSafeInteger(amountMinCents) || amountMinCents < 0)) ||
      (amountMaxCents !== null && (!Number.isSafeInteger(amountMaxCents) || amountMaxCents < 0)) ||
      (amountMinCents !== null && amountMaxCents !== null && amountMinCents > amountMaxCents)
    ) {
      return res.status(400).json({ error: 'INVALID_SEARCH_AMOUNT_FILTER' });
    }
    if (dateFrom && dateTo && dateFrom > dateTo) {
      return res.status(400).json({ error: 'INVALID_SEARCH_DATE_RANGE' });
    }

    const limit = Math.min(
      Math.max(Number.isInteger(requestedLimit) ? requestedLimit : 50, 1),
      RESULT_LIMIT_MAX,
    );

    const requiredCapability =
      status === 'ready_for_review' ? 'finance.review' : 'finance.view';
    const { db, organizationId, financeEntityId, context } =
      await resolveFinanceRequestContext(req, requiredCapability);

    const coverageId = buildTransactionSearchCoverageId(organizationId, financeEntityId);
    const coverageSnapshot = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeSearchCoverage')
      .doc(coverageId)
      .get();
    const coverage = coverageSnapshot.data() || {};
    const indexCertified =
      coverageSnapshot.exists &&
      coverage.status === 'certified' &&
      coverage.financeEntityId === financeEntityId &&
      coverage.organizationId === organizationId;

    let sourceDocs: any[] = [];
    let sourceTruncated = false;
    let searchMode: 'index' | 'canonical_fallback' = 'canonical_fallback';

    if (indexCertified && normalizedQuery) {
      searchMode = 'index';
      const indexSnapshot = await getTransactionSearchIndexRef(
        db,
        organizationId,
        financeEntityId,
      )
        .where('searchKeys', 'array-contains', normalizedQuery.lookupKey)
        .limit(INDEX_CANDIDATE_LIMIT + 1)
        .get();

      sourceTruncated = indexSnapshot.size > INDEX_CANDIDATE_LIMIT;
      const sourceRefs = indexSnapshot.docs
        .slice(0, INDEX_CANDIDATE_LIMIT)
        .map((doc) => context.repository.getTransactionsRef().doc(doc.id));
      sourceDocs = sourceRefs.length > 0 ? await db.getAll(...sourceRefs) : [];
    } else {
      const fallbackSnapshot = await context.repository
        .getTransactionsQuery()
        .limit(FALLBACK_SCAN_LIMIT + 1)
        .get();
      sourceTruncated = fallbackSnapshot.size > FALLBACK_SCAN_LIMIT;
      sourceDocs = fallbackSnapshot.docs.slice(0, FALLBACK_SCAN_LIMIT);
    }

    const allocationsByTransaction = await loadAllocations(
      context,
      sourceDocs.filter((doc) => doc.exists).map((doc) => doc.id),
      financeEntityId,
    );

    const matched = sourceDocs
      .filter((doc) => doc.exists)
      .filter((doc) => {
        const data = doc.data() || {};
        if (
          data.organizationId !== organizationId ||
          data.financeEntityId !== financeEntityId
        ) {
          return false;
        }

        const allocations = allocationsByTransaction.get(doc.id) || [];
        const txDirection = data.transactionKind || data.direction;
        if (direction !== 'all' && txDirection !== direction) return false;
        if (status !== 'all' && data.status !== status) return false;

        const selectedDate = dateValue(data, dateBase);
        if (!selectedDate) return false;
        if (dateFrom && selectedDate < dateFrom) return false;
        if (dateTo && selectedDate > dateTo) return false;

        const amountCents = Math.abs(Number(data.amountCents));
        if (
          amountMinCents !== null &&
          (!Number.isSafeInteger(amountCents) || amountCents < amountMinCents)
        ) return false;
        if (
          amountMaxCents !== null &&
          (!Number.isSafeInteger(amountCents) || amountCents > amountMaxCents)
        ) return false;

        if (categoryId && !allocations.some((item) => item.categoryId === categoryId)) return false;
        if (fundId && !allocations.some((item) => item.fundId === fundId)) return false;
        if (costCenterId && !allocations.some((item) => item.costCenterId === costCenterId)) return false;

        if (accountId) {
          const accountIds = [
            data.accountId,
            data.sourceAccountId,
            data.destinationAccountId,
            data.liabilityAccountId,
          ].filter(Boolean);
          if (!accountIds.includes(accountId)) return false;
        }
        if (paymentMethod && data.paymentMethod !== paymentMethod) return false;
        if (sourceContext && data.sourceContext !== sourceContext) return false;

        const evidenceCount = Array.isArray(data.evidenceIds) ? data.evidenceIds.length : 0;
        if (evidence === 'with_evidence' && evidenceCount === 0) return false;
        if (evidence === 'without_evidence' && evidenceCount > 0) return false;

        const inferredOrigin = inferOrigin(data);
        if (origin !== 'all' && inferredOrigin !== origin) return false;

        if (quality === 'missing_description' && String(data.description || '').trim()) return false;
        if (
          quality === 'missing_category' &&
          !(['income', 'expense'].includes(txDirection) && allocations.length === 0)
        ) return false;
        if (quality === 'unreconciled' && data.reconciliationStatus === 'reconciled') return false;

        if (!normalizedQuery) return true;

        const categoryNames = allocations
          .map((item) => item.categorySnapshot?.name)
          .filter(Boolean);
        const fundNames = allocations
          .map((item) => item.fundSnapshot?.name)
          .filter(Boolean);
        return transactionMatchesSearchQuery(
          {
            ...data,
            id: doc.id,
            transactionId: doc.id,
            categoryNames,
            fundNames,
            costCenterIds: allocations.map((item) => item.costCenterId).filter(Boolean),
          },
          normalizedQuery.normalized,
        );
      })
      .sort((left, right) => {
        const leftDate = dateValue(left.data() || {}, dateBase) || '';
        const rightDate = dateValue(right.data() || {}, dateBase) || '';
        const delta = leftDate.localeCompare(rightDate);
        return order === 'oldest' ? delta : -delta;
      });

    const resultTruncated = sourceTruncated || matched.length > limit;
    const selectedDocs = matched.slice(0, limit);
    const readinessById = new Map<
      string,
      { blockers: unknown[]; warnings: unknown[]; ready: boolean }
    >();

    if (status === 'ready_for_review' && selectedDocs.length > 0) {
      const accountsSnapshot = await context.repository.getAccountsQuery().get();
      const accounts = accountsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      for (const doc of selectedDocs) {
        const data = doc.data() || {};
        const allocations = allocationsByTransaction.get(doc.id) || [];
        const allocationIds =
          Array.isArray(data.allocationIds) && data.allocationIds.length > 0
            ? data.allocationIds
            : allocations.map((allocation) => allocation.id);

        readinessById.set(
          doc.id,
          evaluateReviewReadiness(
            { ...data, id: doc.id, allocationIds } as any,
            accounts,
          ),
        );
      }
    }

    const items = selectedDocs.map((doc) =>
      compactTransaction(
        doc,
        allocationsByTransaction.get(doc.id) || [],
        dateBase,
        readinessById.get(doc.id),
      ),
    );

    return res.status(200).json({
      items,
      query: normalizedQuery?.normalized || '',
      searchMode,
      indexCertified,
      sourceTruncated,
      resultTruncated,
      limit,
      dateBase,
      financialMutation: false,
      auditMutation: false,
    });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (error?.status) {
      return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    }
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (message === 'FINANCE_ENTITY_NOT_FOUND') {
      return res.status(404).json({ error: message });
    }
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') {
      return res.status(409).json({ error: message });
    }
    console.error('Transaction search error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
