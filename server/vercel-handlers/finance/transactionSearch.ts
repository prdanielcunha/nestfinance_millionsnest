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

const INDEX_CANDIDATE_LIMIT = 500;
const FALLBACK_SCAN_LIMIT = 1000;
const RESULT_LIMIT_MAX = 100;

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

function normalizeOptionalDate(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 40) return undefined;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString();
}

function compactTransaction(doc: any) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    transactionId: doc.id,
    transactionKind: data.transactionKind || data.direction,
    direction: data.direction || data.transactionKind,
    status: data.status,
    amountCents: data.amountCents,
    occurredAt: toIso(data.occurredAt),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    accountId: data.accountId || null,
    paymentMethod: data.paymentMethod || null,
    description: data.description || '',
    summary: data.description || '',
    version: data.version || 1,
    accountName: data.accountSnapshot?.name || '',
    categoryName: '',
    submittedByDisplayName: data.submittedByDisplayName || data.createdBy || 'Sistema',
    returnedToDraftAt: toIso(data.returnedToDraftAt),
    returnedToDraftReason: data.returnedToDraftReason || null,
    returnedToDraftComment: data.returnedToDraftComment || null,
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
    if (!normalizedQuery) {
      return res.status(400).json({ error: 'INVALID_SEARCH_QUERY' });
    }

    const direction =
      typeof filters.direction === 'string' && filters.direction
        ? filters.direction
        : 'all';
    const status =
      typeof filters.status === 'string' && filters.status
        ? filters.status
        : 'all';
    const order = filters.order === 'oldest' ? 'oldest' : 'newest';
    const occurredFrom = normalizeOptionalDate(filters.occurredFrom);
    const occurredTo = normalizeOptionalDate(filters.occurredTo);

    if (
      !(TRANSACTION_WORKSPACE_DIRECTIONS as readonly string[]).includes(direction) ||
      !(TRANSACTION_WORKSPACE_STATUSES as readonly string[]).includes(status)
    ) {
      return res.status(400).json({ error: 'INVALID_SEARCH_FILTERS' });
    }
    if (occurredFrom === undefined || occurredTo === undefined) {
      return res.status(400).json({ error: 'INVALID_SEARCH_DATE_FILTER' });
    }
    if (
      occurredFrom &&
      occurredTo &&
      Date.parse(occurredFrom) > Date.parse(occurredTo)
    ) {
      return res.status(400).json({ error: 'INVALID_SEARCH_DATE_RANGE' });
    }

    const limit = Math.min(
      Math.max(Number.isInteger(requestedLimit) ? requestedLimit : 50, 1),
      RESULT_LIMIT_MAX,
    );

    const { db, organizationId, financeEntityId, context } =
      await resolveFinanceRequestContext(req, 'finance.view');

    const coverageId = buildTransactionSearchCoverageId(
      organizationId,
      financeEntityId,
    );
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

    if (indexCertified) {
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
      const indexDocs = indexSnapshot.docs.slice(0, INDEX_CANDIDATE_LIMIT);
      const sourceRefs = indexDocs.map((doc) =>
        context.repository.getTransactionsRef().doc(doc.id),
      );
      sourceDocs = sourceRefs.length > 0 ? await db.getAll(...sourceRefs) : [];
    } else {
      const fallbackSnapshot = await context.repository
        .getTransactionsQuery()
        .limit(FALLBACK_SCAN_LIMIT + 1)
        .get();
      sourceTruncated = fallbackSnapshot.size > FALLBACK_SCAN_LIMIT;
      sourceDocs = fallbackSnapshot.docs.slice(0, FALLBACK_SCAN_LIMIT);
    }

    const fromMs = occurredFrom ? Date.parse(occurredFrom) : null;
    const toMs = occurredTo ? Date.parse(occurredTo) : null;

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

        const txDirection = data.transactionKind || data.direction;
        if (direction !== 'all' && txDirection !== direction) return false;
        if (status !== 'all' && data.status !== status) return false;

        const occurredAt = toIso(data.occurredAt);
        if (!occurredAt) return false;
        const occurredMs = Date.parse(occurredAt);
        if (fromMs !== null && occurredMs < fromMs) return false;
        if (toMs !== null && occurredMs > toMs) return false;

        return transactionMatchesSearchQuery(
          { ...data, id: doc.id, transactionId: doc.id },
          normalizedQuery.normalized,
        );
      })
      .sort((left, right) => {
        const leftMs = Date.parse(toIso(left.data()?.occurredAt) || '') || 0;
        const rightMs = Date.parse(toIso(right.data()?.occurredAt) || '') || 0;
        const delta = leftMs - rightMs;
        return order === 'oldest' ? delta : -delta;
      });

    const resultTruncated = sourceTruncated || matched.length > limit;
    const items = matched.slice(0, limit).map(compactTransaction);

    return res.status(200).json({
      items,
      query: normalizedQuery.normalized,
      searchMode,
      indexCertified,
      sourceTruncated,
      resultTruncated,
      limit,
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
