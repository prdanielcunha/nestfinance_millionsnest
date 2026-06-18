import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../_lib/ecosystemSessionResolver.js';
import { FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { 
  normalizeFinanceName, 
  generateStableId, 
  buildUniqueKeyLogicName, 
  generateUniqueKeyId 
} from '../../_lib/financeIdentity.js';

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

    if (!sessionList.granted) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    if (sessionList.isGlobalAccess !== true) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'INVALID_PAYLOAD' });
    }

    const bodyString = JSON.stringify(req.body);
    if (bodyString.length > 8192) {
      return res.status(413).json({ error: 'PAYLOAD_TOO_LARGE' });
    }

    const { name, kind, accountingCode, ...extras } = req.body;

    if (Object.keys(extras).length > 0) {
      return res.status(400).json({ error: 'INVALID_PAYLOAD_EXTRA_PROPERTIES' });
    }

    if (typeof name !== 'string') {
      return res.status(400).json({ error: 'INVALID_NAME' });
    }

    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      return res.status(400).json({ error: 'INVALID_NAME' });
    }

    if (kind !== 'income' && kind !== 'expense') {
      return res.status(400).json({ error: 'INVALID_KIND' });
    }

    let upperAccountingCode: string | undefined = undefined;
    if (accountingCode !== undefined) {
      if (typeof accountingCode !== 'string') {
        return res.status(400).json({ error: 'INVALID_ACCOUNTING_CODE' });
      }
      const trimmedCode = accountingCode.trim();
      if (trimmedCode.length < 1 || trimmedCode.length > 32) {
        return res.status(400).json({ error: 'INVALID_ACCOUNTING_CODE' });
      }
      const accountingCodeRegex = /^[A-Za-z0-9._/-]{1,32}$/;
      if (!accountingCodeRegex.test(trimmedCode)) {
        return res.status(400).json({ error: 'INVALID_ACCOUNTING_CODE' });
      }
      upperAccountingCode = trimmedCode.toUpperCase();
    }

    let normalizedName: string;
    try {
      normalizedName = normalizeFinanceName(trimmedName);
    } catch {
      return res.status(400).json({ error: 'INVALID_NAME' });
    }

    const logicalKey = buildUniqueKeyLogicName('category', normalizedName, kind);
    const uniqueKeyId = generateUniqueKeyId(logicalKey);

    const orgRef = firestore.collection('organizations').doc(organizationId);
    const categoriesCol = orgRef.collection('financeCategories');
    
    const categoryId = generateStableId('cat');
    const categoryRef = categoriesCol.doc(categoryId);
    const uniqueKeyRef = orgRef.collection('financeUniqueKeys').doc(uniqueKeyId);
    const auditRef = orgRef.collection('financeAuditLogs').doc();
    const requestId = randomBytes(16).toString('hex');

    try {
      await firestore.runTransaction(async (t) => {
        const uniqueDoc = await t.get(uniqueKeyRef);
        if (uniqueDoc.exists) {
          throw new Error('CATEGORY_ALREADY_EXISTS');
        }

        const legacySnap = await t.get(categoriesCol.where('normalizedName', '==', normalizedName));
        const hasLegacy = legacySnap.docs.some(doc => doc.data().kind === kind);
        if (hasLegacy) {
          throw new Error('CATEGORY_ALREADY_EXISTS');
        }

        const categoryData: any = {
          organizationId,
          name: trimmedName,
          normalizedName,
          kind,
          parentId: null,
          active: true,
          version: 1,
          schemaVersion: 1,
          createdAt: FieldValue.serverTimestamp(),
          createdBy: uid,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: uid,
        };

        if (upperAccountingCode !== undefined) {
          categoryData.accountingCode = upperAccountingCode;
        }

        const uniqueKeyData = {
          organizationId,
          entityType: 'financeCategory',
          entityId: categoryId,
          scope: kind,
          normalizedName,
          status: 'reserved',
          schemaVersion: 1,
          createdAt: FieldValue.serverTimestamp(),
          createdBy: uid,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: uid,
        };

        const auditData = {
          organizationId,
          actorUid: uid,
          action: 'finance.category.created',
          entityType: 'financeCategory',
          entityId: categoryId,
          requestId,
          schemaVersion: 1,
          createdAt: FieldValue.serverTimestamp(),
        };

        t.create(categoryRef, categoryData);
        t.create(uniqueKeyRef, uniqueKeyData);
        t.create(auditRef, auditData);
      });

      return res.status(201).json({ id: categoryId, success: true });
    } catch (txError: any) {
      if (txError.message === 'CATEGORY_ALREADY_EXISTS') {
        return res.status(409).json({ error: 'CATEGORY_ALREADY_EXISTS' });
      }
      throw txError;
    }

  } catch (error: any) {
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/id-token-revoked' || error.code === 'auth/argument-error') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    console.error('Create category error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}

