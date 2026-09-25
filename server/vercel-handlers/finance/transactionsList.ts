import { FieldPath } from 'firebase-admin/firestore';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { getTransactionListQueryBounds } from '../../../shared/finance/ledger/listQueryKeys.js';
import { normalizeFirestoreInfrastructureError } from '../../shared/firestore/indexRemediation.js';
import { evaluateReviewReadiness } from '../../../shared/finance/ledger/evaluateReviewReadiness.js';

const RAW_BATCH_SIZE = 100;
const MAX_SCANNED_DOCS = 5000;
const ALLOCATION_CHUNK_SIZE = 30;

type DateBase = 'occurred' | 'competence' | 'recorded';
type EvidenceFilter = 'all' | 'with_evidence' | 'without_evidence';
type QualityFilter = 'all' | 'missing_description' | 'missing_category' | 'unreconciled';
type OriginFilter = 'all' | 'manual' | 'count' | 'evidence' | 'imported' | 'unknown';

function normalizeDateFilter(value: unknown, dateBase: DateBase): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 40) {
    throw new Error('INVALID_TRANSACTION_DATE_FILTER');
  }

  if (dateBase === 'competence') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/u);
    if (!match) throw new Error('INVALID_TRANSACTION_DATE_FILTER');
    const time = Date.parse(match[1] + 'T00:00:00.000Z');
    if (!Number.isFinite(time)) throw new Error('INVALID_TRANSACTION_DATE_FILTER');
    return match[1];
  }

  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error('INVALID_TRANSACTION_DATE_FILTER');
  return new Date(time).toISOString();
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '' || value === 'all') return undefined;
  if (typeof value !== 'string') throw new Error('INVALID_TRANSACTION_FILTER');
  const normalized = value.trim();
  if (!normalized || normalized.length > 160) throw new Error('INVALID_TRANSACTION_FILTER');
  return normalized;
}

function normalizeOptionalAmount(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('INVALID_TRANSACTION_AMOUNT_FILTER');
  return amount;
}

function toOptionalIso(value: any): string | null {
  if (!value) return null;
  if (typeof value?.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (typeof value === 'string') {
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString() : value;
  }
  return null;
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function inferOrigin(data: any): Exclude<OriginFilter, 'all'> {
  if (data?.countSource?.countSessionId) return 'count';
  const source = String(data?.sourceContext || '').trim().toLowerCase();
  if (/import|migration|migrat|csv|ofx|statement/u.test(source)) return 'imported';
  if (Array.isArray(data?.evidenceIds) && data.evidenceIds.length > 0) return 'evidence';
  if (/manual|transaction_create|guided|form/u.test(source)) return 'manual';
  return 'unknown';
}

function dateFieldFor(dateBase: DateBase) {
  if (dateBase === 'competence') return 'competenceDate';
  if (dateBase === 'recorded') return 'recordedAt';
  return 'occurredAt';
}

function dateValueFor(data: any, dateBase: DateBase) {
  if (dateBase === 'competence') {
    const value = typeof data?.competenceDate === 'string' ? data.competenceDate.slice(0, 10) : '';
    return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : null;
  }
  return toOptionalIso(dateBase === 'recorded' ? data?.recordedAt : data?.occurredAt);
}

async function loadAllocations(context: any, transactionIds: string[], financeEntityId: string) {
  const byTransaction = new Map<string, any[]>();
  for (const ids of chunk(transactionIds, ALLOCATION_CHUNK_SIZE)) {
    if (ids.length === 0) continue;
    const snapshot = await context.repository
      .getAllocationsQuery()
      .where('transactionId', 'in', ids)
      .get();
    for (const doc of snapshot.docs) {
      const allocation = { id: doc.id, ...doc.data() } as any;
      if (allocation.financeEntityId !== financeEntityId) continue;
      const transactionId = String(allocation.transactionId || '');
      if (!ids.includes(transactionId)) continue;
      const current = byTransaction.get(transactionId) || [];
      current.push(allocation);
      byTransaction.set(transactionId, current);
    }
  }
  return byTransaction;
}

function matchesStructuredFilters(
  data: any,
  allocations: any[],
  filters: {
    direction?: string;
    status?: string;
    accountId?: string;
    categoryId?: string;
    fundId?: string;
    costCenterId?: string;
    paymentMethod?: string;
    sourceContext?: string;
    evidence: EvidenceFilter;
    quality: QualityFilter;
    origin: OriginFilter;
    amountMinCents?: number;
    amountMaxCents?: number;
  },
) {
  const direction = data.transactionKind || data.direction;
  if (filters.direction && direction !== filters.direction) return false;
  if (filters.status && data.status !== filters.status) return false;

  if (filters.accountId) {
    const accountIds = [
      data.accountId,
      data.sourceAccountId,
      data.destinationAccountId,
      data.liabilityAccountId,
    ].filter(Boolean);
    if (!accountIds.includes(filters.accountId)) return false;
  }

  if (filters.categoryId && !allocations.some((allocation) => allocation.categoryId === filters.categoryId)) {
    return false;
  }
  if (filters.fundId && !allocations.some((allocation) => allocation.fundId === filters.fundId)) {
    return false;
  }
  if (
    filters.costCenterId &&
    !allocations.some((allocation) => allocation.costCenterId === filters.costCenterId)
  ) {
    return false;
  }
  if (filters.paymentMethod && data.paymentMethod !== filters.paymentMethod) return false;
  if (filters.sourceContext && data.sourceContext !== filters.sourceContext) return false;

  const evidenceCount = Array.isArray(data.evidenceIds) ? data.evidenceIds.length : 0;
  if (filters.evidence === 'with_evidence' && evidenceCount === 0) return false;
  if (filters.evidence === 'without_evidence' && evidenceCount > 0) return false;

  const amountCents = Number(data.amountCents);
  if (
    filters.amountMinCents !== undefined &&
    (!Number.isSafeInteger(amountCents) || Math.abs(amountCents) < filters.amountMinCents)
  ) {
    return false;
  }
  if (
    filters.amountMaxCents !== undefined &&
    (!Number.isSafeInteger(amountCents) || Math.abs(amountCents) > filters.amountMaxCents)
  ) {
    return false;
  }

  const origin = inferOrigin(data);
  if (filters.origin !== 'all' && origin !== filters.origin) return false;

  if (filters.quality === 'missing_description' && String(data.description || '').trim()) return false;
  if (
    filters.quality === 'missing_category' &&
    !(['income', 'expense'].includes(direction) && allocations.length === 0)
  ) {
    return false;
  }
  if (filters.quality === 'unreconciled' && data.reconciliationStatus === 'reconciled') return false;

  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId =
    req.headers['x-vercel-id'] ||
    `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const startTime = Date.now();
  let isGlobalAdmin = false;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { financeEntityId, filters = {}, cursor, pageSize = 25 } = req.body || {};

    if (!financeEntityId || typeof financeEntityId !== 'string') {
      return res.status(400).json({ error: 'INVALID_PARAMETERS', details: 'financeEntityId is required' });
    }

    const dateBase: DateBase =
      filters.dateBase === 'competence' || filters.dateBase === 'recorded'
        ? filters.dateBase
        : 'occurred';
    const evidence: EvidenceFilter =
      filters.evidence === 'with_evidence' || filters.evidence === 'without_evidence'
        ? filters.evidence
        : 'all';
    const quality: QualityFilter =
      ['missing_description', 'missing_category', 'unreconciled'].includes(filters.quality)
        ? filters.quality
        : 'all';
    const origin: OriginFilter =
      ['manual', 'count', 'evidence', 'imported', 'unknown'].includes(filters.origin)
        ? filters.origin
        : 'all';

    let direction: string | undefined;
    let status: string | undefined;
    let readinessFilter: 'all' | 'with_issues' | 'ready_to_approve' = 'all';

    const filterKind = filters.transactionKind || filters.direction;
    if (filterKind && filterKind !== 'all') {
      if (filterKind === 'with_issues') readinessFilter = 'with_issues';
      else if (filterKind === 'ready_to_approve') readinessFilter = 'ready_to_approve';
      else direction = normalizeOptionalString(filterKind);
    }
    status = normalizeOptionalString(filters.status);

    const dateFrom = normalizeDateFilter(filters.occurredFrom, dateBase);
    const dateTo = normalizeDateFilter(filters.occurredTo, dateBase);
    if (dateFrom && dateTo && dateFrom > dateTo) {
      return res.status(400).json({ error: 'INVALID_TRANSACTION_DATE_RANGE' });
    }

    if (filters.order && !['newest', 'oldest'].includes(filters.order)) {
      return res.status(400).json({ error: 'INVALID_TRANSACTION_ORDER' });
    }

    const accountId = normalizeOptionalString(filters.accountId);
    const categoryId = normalizeOptionalString(filters.categoryId);
    const fundId = normalizeOptionalString(filters.fundId);
    const costCenterId = normalizeOptionalString(filters.costCenterId);
    const paymentMethod = normalizeOptionalString(filters.paymentMethod);
    const sourceContext = normalizeOptionalString(filters.sourceContext);
    const amountMinCents = normalizeOptionalAmount(filters.amountMinCents);
    const amountMaxCents = normalizeOptionalAmount(filters.amountMaxCents);
    if (
      amountMinCents !== undefined &&
      amountMaxCents !== undefined &&
      amountMinCents > amountMaxCents
    ) {
      return res.status(400).json({ error: 'INVALID_TRANSACTION_AMOUNT_RANGE' });
    }

    const requiredCapability = status === 'ready_for_review' ? 'finance.review' : 'finance.view';
    const { sessionList, context } = await resolveFinanceRequestContext(req, requiredCapability);
    isGlobalAdmin = sessionList.isGlobalAccess || false;

    const limit = Math.min(Math.max(Number(pageSize) || 25, 1), 100);
    const newestFirst = filters.order !== 'oldest';
    const baseField = dateFieldFor(dateBase);

    let cursorDoc: any = null;
    if (cursor) {
      cursorDoc = await context.repository.getTransactionsRef().doc(cursor).get();
      if (!cursorDoc.exists || cursorDoc.data()?.financeEntityId !== financeEntityId) {
        return res.status(400).json({ error: 'INVALID_CURSOR' });
      }
    }

    const accountsSnapshot = await context.repository.getAccountsQuery().get();
    const accounts = accountsSnapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

    const rawItems: any[] = [];
    let ignoredRecordsCount = 0;
    let scannedCount = 0;
    let lastScannedDoc: any = null;
    let exhausted = false;
    let scanCursorDoc = cursorDoc;
    const queryStartTime = Date.now();

    while (rawItems.length < limit + 1 && scannedCount < MAX_SCANNED_DOCS && !exhausted) {
      let query: any;

      if (dateBase === 'occurred') {
        const bounds = getTransactionListQueryBounds(
          financeEntityId,
          direction,
          status,
          dateFrom,
          dateTo,
        );
        const queryOrder = newestFirst ? 'asc' : 'desc';
        query = context.repository
          .getTransactionsQuery()
          .where(bounds.field, '>=', bounds.startAt)
          .where(bounds.field, '<', bounds.endBefore)
          .orderBy(bounds.field, queryOrder);

        if (scanCursorDoc) {
          const cursorData = scanCursorDoc.data() || {};
          const keyName = bounds.field.split('.')[1];
          const cursorKey = cursorData.listQueryKeys?.[keyName];
          if (!cursorKey) return res.status(400).json({ error: 'INVALID_CURSOR' });
          query = query.startAfter(cursorKey);
        }
      } else {
        const order = newestFirst ? 'desc' : 'asc';
        query = context.repository
          .getTransactionsQuery()
          .orderBy(baseField, order)
          .orderBy(FieldPath.documentId(), order);

        if (dateFrom) query = query.where(baseField, '>=', dateFrom);
        if (dateTo) query = query.where(baseField, '<=', dateTo);

        if (scanCursorDoc) {
          const cursorData = scanCursorDoc.data() || {};
          const cursorValue =
            dateBase === 'competence'
              ? String(cursorData.competenceDate || '').slice(0, 10)
              : cursorData.recordedAt;
          if (!cursorValue) return res.status(400).json({ error: 'INVALID_CURSOR' });
          query = query.startAfter(cursorValue, scanCursorDoc.id);
        }
      }

      const remaining = MAX_SCANNED_DOCS - scannedCount;
      const batchLimit = Math.min(RAW_BATCH_SIZE, remaining);
      const snapshot = await query.limit(batchLimit).get();

      if (snapshot.empty) {
        exhausted = true;
        break;
      }

      scannedCount += snapshot.size;
      lastScannedDoc = snapshot.docs[snapshot.docs.length - 1];
      scanCursorDoc = lastScannedDoc;
      exhausted = snapshot.size < batchLimit;

      const allocationsByTransaction = await loadAllocations(
        context,
        snapshot.docs.map((doc: any) => doc.id),
        financeEntityId,
      );

      for (const doc of snapshot.docs) {
        try {
          const data = doc.data();
          if (data.financeEntityId !== financeEntityId) {
            ignoredRecordsCount += 1;
            continue;
          }

          const selectedDate = dateValueFor(data, dateBase);
          if (!selectedDate) {
            if (dateBase !== 'occurred') continue;
            ignoredRecordsCount += 1;
            continue;
          }
          if (dateFrom && selectedDate < dateFrom) continue;
          if (dateTo && selectedDate > dateTo) continue;

          const txAllocations = allocationsByTransaction.get(doc.id) || [];
          if (
            !matchesStructuredFilters(data, txAllocations, {
              direction,
              status,
              accountId,
              categoryId,
              fundId,
              costCenterId,
              paymentMethod,
              sourceContext,
              evidence,
              quality,
              origin,
              amountMinCents,
              amountMaxCents,
            })
          ) {
            continue;
          }

          const readiness = evaluateReviewReadiness(
            {
              ...data,
              id: doc.id,
              allocationIds: data.allocationIds || txAllocations.map((allocation: any) => allocation.id),
            } as any,
            accounts,
          );
          if (readinessFilter === 'ready_to_approve' && !readiness.ready) continue;
          if (readinessFilter === 'with_issues' && readiness.ready) continue;

          const allocations = txAllocations
            .slice()
            .sort((left: any, right: any) => Number(left.sequence || 0) - Number(right.sequence || 0))
            .map((allocation: any) => ({
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
          const categoryNames = [...new Set(
            allocations.map((allocation: any) => allocation.categoryName).filter(Boolean),
          )];
          const fundNames = [...new Set(
            allocations.map((allocation: any) => allocation.fundName).filter(Boolean),
          )];
          const inferredOrigin = inferOrigin(data);

          rawItems.push({
            id: doc.id,
            transactionId: doc.id,
            transactionKind: data.transactionKind || data.direction,
            direction: data.direction || data.transactionKind,
            status: data.status,
            amountCents: data.amountCents,
            occurredAt: toOptionalIso(data.occurredAt),
            competenceDate: typeof data.competenceDate === 'string' ? data.competenceDate : null,
            recordedAt: toOptionalIso(data.recordedAt),
            selectedDate,
            dateBase,
            createdAt: toOptionalIso(data.createdAt),
            updatedAt: toOptionalIso(data.updatedAt),
            accountId: data.accountId || null,
            sourceAccountId: data.sourceAccountId || null,
            destinationAccountId: data.destinationAccountId || null,
            paymentMethod: data.paymentMethod || null,
            description: data.description || '',
            summary: data.description || '',
            version: data.version || 1,
            accountName:
              data.accountSnapshot?.name ||
              data.sourceAccountSnapshot?.name ||
              '',
            categoryName: categoryNames[0] || '',
            categoryNames,
            fundNames,
            allocations,
            submittedByDisplayName: data.submittedByDisplayName || null,
            createdBy: data.createdBy || null,
            sourceContext: data.sourceContext || null,
            origin: inferredOrigin,
            evidenceCount: Array.isArray(data.evidenceIds) ? data.evidenceIds.length : 0,
            hasEvidence: Array.isArray(data.evidenceIds) && data.evidenceIds.length > 0,
            countSource: data.countSource
              ? {
                  countSessionId: data.countSource.countSessionId || null,
                  serviceLabel: data.countSource.serviceLabel || null,
                  serviceDate: data.countSource.serviceDate || null,
                }
              : null,
            reconciliationStatus: data.reconciliationStatus || 'unreconciled',
            blockerCount: readiness.blockers.length,
            warningCount: readiness.warnings.length,
            isReady: readiness.ready,
            returnedToDraftAt: toOptionalIso(data.returnedToDraftAt),
            returnedToDraftReason: data.returnedToDraftReason || null,
            returnedToDraftComment: data.returnedToDraftComment || null,
          });

          if (rawItems.length >= limit + 1) break;
        } catch (error: any) {
          console.error(
            `Error processing transaction document ${doc.id} (req: ${requestId}):`,
            error?.name || 'Error',
          );
          ignoredRecordsCount += 1;
        }
      }
    }

    const hasExtraMatch = rawItems.length > limit;
    const items = rawItems.slice(0, limit);
    const sourceTruncated = scannedCount >= MAX_SCANNED_DOCS && !exhausted;
    let nextCursor: string | undefined;

    if (hasExtraMatch && items.length > 0) {
      nextCursor = items[items.length - 1].id;
    } else if (sourceTruncated && lastScannedDoc) {
      nextCursor = lastScannedDoc.id;
    }

    const queryDurationMs = Date.now() - queryStartTime;
    if (ignoredRecordsCount > 0) {
      console.log(
        `[Metrics] Ignored ${ignoredRecordsCount} invalid records during transactionsList (req: ${requestId})`,
      );
    }
    console.log(
      `[Metrics] transactionsList (req: ${requestId}) - queryDuration: ${queryDurationMs}ms, returned: ${items.length}, scanned: ${scannedCount}, sourceTruncated: ${sourceTruncated}, totalDuration: ${Date.now() - startTime}ms`,
    );

    return res.status(200).json({
      items,
      nextCursor,
      hasMore: Boolean(nextCursor),
      sourceTruncated,
      scannedCount,
      dateBase,
      financialMutation: false,
      auditMutation: false,
    });
  } catch (error: any) {
    if (error.message === 'INVALID_TRANSACTION_DATE_FILTER') {
      return res.status(400).json({ error: 'INVALID_TRANSACTION_DATE_FILTER' });
    }
    if (error.message === 'INVALID_TRANSACTION_FILTER') {
      return res.status(400).json({ error: 'INVALID_TRANSACTION_FILTER' });
    }
    if (error.message === 'INVALID_TRANSACTION_AMOUNT_FILTER') {
      return res.status(400).json({ error: 'INVALID_TRANSACTION_AMOUNT_FILTER' });
    }
    if (error.message === 'FORBIDDEN_FINANCE_ACCESS' || error.message === 'Session not granted') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (error.message === 'FINANCE_ENTITY_NOT_FOUND' || error.message === 'FINANCE_ENTITY_NOT_ACTIVE') {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    const bodyRequestId = req.body?.requestId;
    const normalizedId =
      typeof bodyRequestId === 'string' && bodyRequestId
        ? bodyRequestId
        : `req_${Date.now()}`;

    const isServiceUnavailable =
      error.message?.includes('Firestore') ||
      error.message?.includes('timeout') ||
      error.message?.includes('unavailable') ||
      error.message?.includes('Timeout') ||
      error.code === 'unavailable' ||
      error.code === 14;

    if (isServiceUnavailable) {
      return res.status(503).json({
        ok: false,
        errorCode: 'FINANCE_REVIEW_INTERNAL_ERROR',
        requestId: normalizedId,
        stage: 'firestore_query',
        details: { code: 'DATABASE_ERROR', retryable: true },
      });
    }

    const normalizedError = normalizeFirestoreInfrastructureError(error, {
      requestId: normalizedId,
      operation: 'transactionsList',
      isGlobalAdmin,
    });

    console.error('List Transactions Error:', error);

    if (normalizedError) {
      const { indexCreateUrl } = normalizedError;
      return res.status(409).json({
        ok: false,
        errorCode: 'FINANCE_REVIEW_INDEX_REQUIRED',
        requestId: normalizedId,
        stage: 'firestore_query',
        remediation: indexCreateUrl
          ? { type: 'CREATE_FIRESTORE_INDEX', url: indexCreateUrl }
          : undefined,
      });
    }

    if (error?.message?.includes('permission')) {
      return res.status(403).json({
        ok: false,
        errorCode: 'FINANCE_REVIEW_FORBIDDEN',
        requestId: normalizedId,
        stage: 'access_control',
      });
    }

    return res.status(500).json({
      ok: false,
      errorCode: 'FINANCE_REVIEW_INTERNAL_ERROR',
      requestId: normalizedId,
      stage: 'firestore_query',
    });
  }
}
