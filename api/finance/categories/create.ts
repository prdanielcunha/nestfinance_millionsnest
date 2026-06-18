import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../_lib/ecosystemSessionResolver.js';
import { FieldValue } from 'firebase-admin/firestore';
import { createHash, randomBytes } from 'crypto';

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

    const normalizedName = trimmedName
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (normalizedName.length < 1) {
      return res.status(400).json({ error: 'INVALID_NAME' });
    }

    const categoryId = 'cat_' + createHash('sha256').update(`${kind}:${normalizedName}`).digest('hex').substring(0, 16);

    const categoryRef = firestore.collection('organizations').doc(organizationId).collection('financeCategories').doc(categoryId);
    const auditRef = firestore.collection('organizations').doc(organizationId).collection('financeAuditLogs').doc();

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

    const requestId = randomBytes(16).toString('hex');
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

    const batch = firestore.batch();
    batch.create(categoryRef, categoryData);
    batch.set(auditRef, auditData);

    try {
      await batch.commit();
      return res.status(201).json({ id: categoryId, success: true });
    } catch (batchError: any) {
      if (batchError.code === 6 || batchError.message.includes('ALREADY_EXISTS')) {
        return res.status(409).json({ error: 'CATEGORY_ALREADY_EXISTS' });
      }
      throw batchError;
    }

  } catch (error: any) {
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/id-token-revoked' || error.code === 'auth/argument-error') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    console.error('Create category error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
