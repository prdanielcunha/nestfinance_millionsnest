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

  if (process.env.NESTFINANCE_FUNDS_WRITE_ENABLED !== 'true') {
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

    const { name, restricted, colorToken, ...extras } = req.body;

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

    if (typeof restricted !== 'boolean') {
      return res.status(400).json({ error: 'INVALID_RESTRICTED' });
    }

    const validColors = ['slate', 'blue', 'emerald', 'amber', 'violet', 'rose'];
    if (colorToken !== undefined) {
      if (typeof colorToken !== 'string' || !validColors.includes(colorToken)) {
        return res.status(400).json({ error: 'INVALID_COLOR' });
      }
    }

    const normalizedName = trimmedName
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (normalizedName.length < 1) {
      return res.status(400).json({ error: 'INVALID_NAME' });
    }

    const fundId = 'fund_' + createHash('sha256').update(normalizedName).digest('hex').substring(0, 16);

    const fundRef = firestore.collection('organizations').doc(organizationId).collection('financeFunds').doc(fundId);
    const auditRef = firestore.collection('organizations').doc(organizationId).collection('financeAuditLogs').doc();

    const fundData: any = {
      organizationId,
      name: trimmedName,
      normalizedName,
      restricted,
      colorToken: colorToken || 'slate',
      balancePolicy: 'non_negative',
      active: true,
      version: 1,
      schemaVersion: 1,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
    };

    const requestId = randomBytes(16).toString('hex');
    const auditData = {
      organizationId,
      actorUid: uid,
      action: 'finance.fund.created',
      entityType: 'financeFund',
      entityId: fundId,
      requestId,
      schemaVersion: 1,
      createdAt: FieldValue.serverTimestamp(),
    };

    const batch = firestore.batch();
    batch.create(fundRef, fundData);
    batch.set(auditRef, auditData);

    try {
      await batch.commit();
      return res.status(201).json({ id: fundId, success: true });
    } catch (batchError: any) {
      if (batchError.code === 6 || batchError.message.includes('ALREADY_EXISTS')) {
        return res.status(409).json({ error: 'FUND_ALREADY_EXISTS' });
      }
      throw batchError;
    }

  } catch (error: any) {
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/id-token-revoked' || error.code === 'auth/argument-error') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    console.error('Create fund error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
