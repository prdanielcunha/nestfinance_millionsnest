import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';
import { FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { isValidCategoryId } from '../../../api/_lib/financeIdentity.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.includes('application/json')) {
    return res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE' });
  }

  if (process.env.NESTFINANCE_CATEGORIES_WRITE_ENABLED !== 'true') {
    return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  let admin;
  try {
    admin = getFirebaseAdmin();
  } catch (err: any) {
    if (err.message === 'MISSING_FIREBASE_CREDENTIALS') {
      return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
    }
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }

  const { auth, firestore } = admin;

  try {
    const decodedToken = await auth.verifyIdToken(idToken, true);

    const uid = decodedToken.uid;
    const organizationId = decodedToken.mn_organization_id;

    if (!organizationId || typeof organizationId !== 'string') {
      return res.status(403).json({ error: 'FORBIDDEN_MISSING_ORG' });
    }

    const sessionList = await resolveEcosystemSession(uid, organizationId);

    if (!sessionList.granted || sessionList.isGlobalAccess !== true) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'INVALID_PAYLOAD' });
    }

    const bodyString = JSON.stringify(req.body);
    if (bodyString.length > 8192) {
      return res.status(413).json({ error: 'PAYLOAD_TOO_LARGE' });
    }

    const { categoryId, financeEntityId } = req.body;

    if (!financeEntityId || typeof financeEntityId !== 'string') {
      return res.status(400).json({ error: 'FINANCE_ENTITY_REQUIRED' });
    }

    if (typeof categoryId !== 'string') {
      return res.status(400).json({ error: 'INVALID_CATEGORY_ID' });
    }

    if (!isValidCategoryId(categoryId)) {
      return res.status(400).json({ error: 'INVALID_CATEGORY_ID' });
    }

    const orgRef = firestore.collection('organizations').doc(organizationId);

    const entityDoc = await orgRef.collection('financeEntities').doc(financeEntityId).get();
    if (!entityDoc.exists) {
        return res.status(404).json({ error: 'FINANCE_ENTITY_NOT_FOUND' });
    }

    const categoryRef = orgRef.collection('financeCategories').doc(categoryId);
    const auditRef = orgRef.collection('financeAuditLogs').doc();

    const result = await firestore.runTransaction(async (transaction: any) => {
      const doc = await transaction.get(categoryRef);
      if (!doc.exists) {
        return { status: 404, body: { error: 'CATEGORY_NOT_FOUND' } };
      }

      const data = doc.data();

      // Check minimum valid structure
      if (!data || typeof data.kind !== 'string' || typeof data.name !== 'string') {
        return { status: 500, body: { error: 'INTERNAL_SERVER_ERROR' } };
      }

      if (data.financeEntityId !== financeEntityId) {
        return { status: 403, body: { error: 'FINANCE_ENTITY_MISMATCH' } };
      }

      if (data.active === true) {
        return { 
          status: 200, 
          body: { 
            category: {
              id: doc.id,
              name: data.name,
              kind: data.kind,
              accountingCode: data.accountingCode,
              active: true
            },
            changed: false 
          }
        };
      }

      transaction.update(categoryRef, {
        active: true,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: uid
      });

      const requestId = randomBytes(16).toString('hex');
      transaction.set(auditRef, {
        organizationId,
        actorUid: uid,
        action: 'finance.category.reactivated',
        entityType: 'financeCategory',
        entityId: categoryId,
        requestId,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        status: 200,
        body: {
          category: {
            id: doc.id,
            name: data.name,
            kind: data.kind,
            accountingCode: data.accountingCode,
            active: true
          },
          changed: true
        }
      };
    });

    return res.status(result.status).json(result.body);

  } catch (error: any) {
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/id-token-revoked' || error.code === 'auth/argument-error') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    console.error('Reactivate category error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}

