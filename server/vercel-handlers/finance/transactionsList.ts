import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';
import { requireFinanceTransactionAccess } from './accessHelpers.js';
import { getTransactionListQueryBounds } from '../../../shared/finance/ledger/listQueryKeys.js';
import { normalizeFirestoreInfrastructureError } from '../../shared/firestore/indexRemediation.js';
import { evaluateReviewReadiness } from '../../../shared/finance/ledger/evaluateReviewReadiness.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = req.headers['x-vercel-id'] || `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const startTime = Date.now();
  let isGlobalAdmin = false;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { financeEntityId, filters, cursor, pageSize = 25 } = req.body;

    if (!financeEntityId || typeof financeEntityId !== 'string') {
      return res.status(400).json({ error: 'INVALID_PARAMETERS', details: 'financeEntityId is required' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    const token = authHeader.split('Bearer ')[1];
    const admin = getFirebaseAdmin();
    const decodedToken = await admin.auth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const organizationId = req.headers['x-organization-id'] as string;

    if (!organizationId) {
      return res.status(400).json({ error: 'MISSING_ORGANIZATION_ID' });
    }

    const sessionList = await resolveEcosystemSession(uid, organizationId);
    if (!sessionList.granted) {
       console.log('Session denial reason:', sessionList);
    }
    isGlobalAdmin = sessionList.isGlobalAccess || false;
    
    let direction = undefined;
    let status = undefined;
    let occurredFrom = undefined;
    let occurredTo = undefined;
    let readinessFilter: 'all' | 'with_issues' | 'ready_to_approve' = 'all';

    if (filters) {
      const filterKind = filters.transactionKind || filters.direction;
      if (filterKind && filterKind !== 'all') {
        if (filterKind === 'with_issues') {
          readinessFilter = 'with_issues';
        } else if (filterKind === 'ready_to_approve') {
          readinessFilter = 'ready_to_approve';
        } else {
          direction = filterKind;
        }
      }
      if (filters.status && filters.status !== 'all') status = filters.status;
      if (filters.occurredFrom) occurredFrom = filters.occurredFrom;
      if (filters.occurredTo) occurredTo = filters.occurredTo;
    }

    const requiredCapability = status === 'ready_for_review' ? 'finance.review' : 'finance.view';

    // Will throw if forbidden or not found/active
    const context = await requireFinanceTransactionAccess({
      db: admin.firestore,
      uid,
      organizationId,
      financeEntityId,
      sessionList,
      capability: requiredCapability
    });

    const bounds = getTransactionListQueryBounds(
      financeEntityId, direction, status, occurredFrom, occurredTo
    );

    const queryOrder = filters?.order === 'oldest' ? 'desc' : 'asc';

    let query = context.repository.getTransactionsQuery()
      .where(bounds.field, '>=', bounds.startAt)
      .where(bounds.field, '<', bounds.endBefore)
      .orderBy(bounds.field, queryOrder);

    const limit = Math.min(Math.max(pageSize, 1), 100);
    query = query.limit(limit);

    if (cursor) {
      const cursorDoc = await context.repository.getTransactionsRef().doc(cursor).get();
      if (!cursorDoc.exists) {
        return res.status(400).json({ error: 'INVALID_CURSOR' });
      }
      const cursorData = cursorDoc.data()!;
      // Prevent fetching cursor from another entity
      if (cursorData.financeEntityId !== financeEntityId) {
        return res.status(400).json({ error: 'INVALID_CURSOR' });
      }
      
      const cursorKey = cursorData.listQueryKeys ? cursorData.listQueryKeys[bounds.field.split('.')[1]] : null;
      if (cursorKey) {
        query = query.startAfter(cursorKey);
      } else {
        // Fallback for document snapshot cursor (it might still fail if not using the exact selected cursor field, but cursorKey is best)
        query = query.startAfter(cursorDoc);
      }
    }

    const queryStartTime = Date.now();
    const snapshot = await query.get();
    const queryDurationMs = Date.now() - queryStartTime;
    
    let ignoredRecordsCount = 0;

    // Load accounts of the entity once to run evaluateReviewReadiness
    const accountsSnapshot = await context.repository.getAccountsQuery().get();
    const accounts = accountsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Load allocations for all fetched transactions in a single batch
    const transactionIds = snapshot.docs.map(d => d.id);
    let allAllocations: any[] = [];
    if (transactionIds.length > 0) {
      const allocationsSnapshot = await context.repository.getAllocationsRef()
        .where('transactionId', 'in', transactionIds)
        .get();
      allAllocations = allocationsSnapshot.docs.map(d => d.data());
    }

    const rawItems = [];
    for (const doc of snapshot.docs) {
      try {
        const data = doc.data();

        if (data.financeEntityId !== financeEntityId) {
          console.error(`[Integrity Violation] Cross-entity leakage prevented. Document ${doc.id} does not belong to financeEntityId ${financeEntityId} (req: ${requestId})`);
          ignoredRecordsCount++;
          continue;
        }

        let occurredAt = null;
        if (data.occurredAt) {
          if (typeof data.occurredAt.toDate === 'function') {
            try {
              occurredAt = data.occurredAt.toDate().toISOString();
            } catch (e) {
               console.error(`Invalid timestamp occurredAt for document ${doc.id} (req: ${requestId})`);
               ignoredRecordsCount++;
               continue;
            }
          } else if (typeof data.occurredAt === 'string') {
            occurredAt = data.occurredAt;
          } else {
             console.error(`Invalid timestamp occurredAt for document ${doc.id} (req: ${requestId})`);
             ignoredRecordsCount++;
             continue;
          }
        } else {
           console.error(`Missing occurredAt for document ${doc.id} (req: ${requestId})`);
           ignoredRecordsCount++;
           continue;
        }

        let createdAt = null;
        if (data.createdAt) {
          if (typeof data.createdAt.toDate === 'function') {
            try {
              createdAt = data.createdAt.toDate().toISOString();
            } catch(e) {
               console.error(`Invalid timestamp createdAt for document ${doc.id} (req: ${requestId})`);
               ignoredRecordsCount++;
               continue;
            }
          } else {
            createdAt = data.createdAt;
          }
        }

        let updatedAt = null;
        if (data.updatedAt) {
          if (typeof data.updatedAt.toDate === 'function') {
            try {
              updatedAt = data.updatedAt.toDate().toISOString();
            } catch(e) {
               console.error(`Invalid timestamp updatedAt for document ${doc.id} (req: ${requestId})`);
               ignoredRecordsCount++;
               continue;
            }
          } else {
            updatedAt = data.updatedAt;
          }
        }

        const txAllocations = allAllocations.filter(a => a.transactionId === doc.id);
        const categoryName = txAllocations[0]?.categorySnapshot?.name || '';

        const readiness = evaluateReviewReadiness({
          ...data,
          id: doc.id,
          allocationIds: data.allocationIds || txAllocations.map(a => a.id)
        } as any, accounts);

        const compactDto = {
          id: doc.id,
          transactionId: doc.id,
          transactionKind: data.transactionKind || data.direction,
          direction: data.direction || data.transactionKind,
          status: data.status,
          amountCents: data.amountCents,
          occurredAt,
          createdAt,
          updatedAt,
          accountId: data.accountId,
          paymentMethod: data.paymentMethod,
          description: data.description,
          summary: data.description || '',
          version: data.version || 1,
          accountName: data.accountSnapshot?.name || '',
          categoryName,
          submittedByDisplayName: data.submittedByDisplayName || data.createdBy || 'Sistema',
          blockerCount: readiness.blockers.length,
          warningCount: readiness.warnings.length,
          isReady: readiness.ready
        };

        // Filter by readiness status on server-side
        if (readinessFilter === 'ready_to_approve' && !readiness.ready) {
          continue;
        }
        if (readinessFilter === 'with_issues' && readiness.ready) {
          continue;
        }

        rawItems.push(compactDto);
      } catch (err: any) {
        console.error(`Error processing transaction document ${doc.id} (req: ${requestId}):`, err.name);
        ignoredRecordsCount++;
      }
    }

    if (ignoredRecordsCount > 0) {
      console.log(`[Metrics] Ignored ${ignoredRecordsCount} invalid records during transactionsList (req: ${requestId})`);
    }

    let nextCursor = undefined;
    if (snapshot.docs.length === limit) {
      nextCursor = snapshot.docs[snapshot.docs.length - 1].id;
    }

    console.log(`[Metrics] transactionsList (req: ${requestId}) - queryDuration: ${queryDurationMs}ms, returned: ${rawItems.length}, pageSize: ${limit}, hasMore: ${!!nextCursor}`);

    return res.status(200).json({
      items: rawItems,
      nextCursor,
      hasMore: !!nextCursor
    });

  } catch (error: any) {
    if (error.message === 'FORBIDDEN_FINANCE_ACCESS' || error.message === 'Session not granted') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (error.message === 'FINANCE_ENTITY_NOT_FOUND' || error.message === 'FINANCE_ENTITY_NOT_ACTIVE') {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    
    // Normalize infrastructure errors (e.g. missing indexes)
    // Always use a fallback requestId
    const bodyRequestId = req.body?.requestId;
    const normalizedId = typeof bodyRequestId !== 'undefined' && typeof bodyRequestId === 'string' ? bodyRequestId : `req_${Date.now()}`;

    const isServiceUnavailable = error.message?.includes('Firestore') || 
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
        details: {
          code: 'DATABASE_ERROR',
          retryable: true
        }
      });
    }

    const normalizedError = normalizeFirestoreInfrastructureError(error, {
      requestId: normalizedId,
      operation: 'transactionsList',
      isGlobalAdmin
    });

    console.error('List Transactions Error:', error);
    
    if (normalizedError) {
       console.log(`[Metrics] transactionsList index error handled (req: ${normalizedId}) - URL exposed: ${!!normalizedError.indexCreateUrl}`);
       const { indexCreateUrl } = normalizedError;
       return res.status(503).json({
         ok: false,
         errorCode: 'FINANCE_REVIEW_INDEX_REQUIRED',
         requestId: normalizedId,
         stage: 'firestore_query',
         remediation: indexCreateUrl ? {
            type: 'CREATE_FIRESTORE_INDEX',
            url: indexCreateUrl
         } : undefined
       });
    }

    if (error?.message?.includes('permission')) {
      return res.status(403).json({
        ok: false,
        errorCode: 'FINANCE_REVIEW_FORBIDDEN',
        requestId: normalizedId,
        stage: 'access_control'
      });
    }

    return res.status(500).json({ 
      ok: false,
      errorCode: 'FINANCE_REVIEW_INTERNAL_ERROR',
      requestId: normalizedId,
      stage: 'firestore_query'
    });
  }
}
