import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';
import { requireFinanceTransactionAccess } from './accessHelpers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { financeEntityId, filters, cursor, pageSize = 50 } = req.body;

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
    
    // Will throw if forbidden or not found/active
    const context = await requireFinanceTransactionAccess({
      db: admin.firestore,
      uid,
      organizationId,
      financeEntityId,
      sessionList,
      capability: 'finance.view'
    });

    let query = context.repository.getTransactionsQuery();
    
    if (filters) {
      if (filters.direction) {
        query = query.where('direction', '==', filters.direction);
      }
      if (filters.status) {
        query = query.where('status', '==', filters.status);
      }
      if (filters.occurredFrom) {
        query = query.where('occurredAt', '>=', filters.occurredFrom);
      }
      if (filters.occurredTo) {
        query = query.where('occurredAt', '<=', filters.occurredTo);
      }
      if (filters.accountId) {
        query = query.where('accountId', '==', filters.accountId);
      }
    }

    // Default sorting based on occurrence descending
    query = query.orderBy('occurredAt', 'desc').orderBy('__name__', 'desc');

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
      query = query.startAfter(cursorDoc);
    }

    const snapshot = await query.get();
    
    const requestId = req.headers['x-vercel-id'] || `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    let ignoredRecordsCount = 0;

    const items = [];
    for (const doc of snapshot.docs) {
      try {
        const data = doc.data();
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

        items.push({
          id: doc.id,
          direction: data.direction,
          status: data.status,
          amountCents: data.amountCents,
          occurredAt,
          createdAt,
          updatedAt,
          accountId: data.accountId,
          paymentMethod: data.paymentMethod,
          description: data.description,
          version: data.version || 1
        });
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

    return res.status(200).json({
      items,
      nextCursor,
      hasMore: !!nextCursor
    });

  } catch (error: any) {
    console.error('List Transactions Error:', error);
    if (error.message === 'FORBIDDEN_FINANCE_ACCESS') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (error.message === 'FINANCE_ENTITY_NOT_FOUND' || error.message === 'FINANCE_ENTITY_NOT_ACTIVE') {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
