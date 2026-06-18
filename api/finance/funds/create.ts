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

    let normalizedName: string;
    try {
      normalizedName = normalizeFinanceName(trimmedName);
    } catch {
      return res.status(400).json({ error: 'INVALID_NAME' });
    }

    const logicalKey = buildUniqueKeyLogicName('fund', normalizedName);
    const uniqueKeyId = generateUniqueKeyId(logicalKey);

    const orgRef = firestore.collection('organizations').doc(organizationId);
    const fundsCol = orgRef.collection('financeFunds');
    
    const fundId = generateStableId('fund');
    const fundRef = fundsCol.doc(fundId);
    const uniqueKeyRef = orgRef.collection('financeUniqueKeys').doc(uniqueKeyId);
    const auditRef = orgRef.collection('financeAuditLogs').doc();
    const requestId = randomBytes(16).toString('hex');

    try {
      await firestore.runTransaction(async (t) => {
        const uniqueDoc = await t.get(uniqueKeyRef);
        if (uniqueDoc.exists) {
          throw new Error('FUND_ALREADY_EXISTS');
        }

        const legacySnap = await t.get(fundsCol.where('normalizedName', '==', normalizedName).limit(1));
        if (!legacySnap.empty) {
          throw new Error('FUND_ALREADY_EXISTS');
        }

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

        const uniqueKeyData = {
          organizationId,
          entityType: 'financeFund',
          entityId: fundId,
          scope: 'fund',
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
          action: 'finance.fund.created',
          entityType: 'financeFund',
          entityId: fundId,
          requestId,
          schemaVersion: 1,
          createdAt: FieldValue.serverTimestamp(),
        };

        t.create(fundRef, fundData);
        t.create(uniqueKeyRef, uniqueKeyData);
        t.create(auditRef, auditData);
      });

      return res.status(201).json({ id: fundId, success: true });
    } catch (txError: any) {
      if (txError.message === 'FUND_ALREADY_EXISTS') {
        return res.status(409).json({ error: 'FUND_ALREADY_EXISTS' });
      }
      throw txError;
    }

  } catch (error: any) {
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/id-token-revoked' || error.code === 'auth/argument-error') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    console.error('Create fund error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}

