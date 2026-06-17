import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../_lib/firebaseAdmin';
import { createHash } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Security Headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Verify Method
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  // Verify Content-Type
  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.includes('application/json')) {
    return res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE' });
  }

  // Feature Flag
  if (process.env.NESTFINANCE_HANDOFF_REDEEM_ENABLED !== 'true') {
    return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
  }

  // Admin Init
  let auth;
  let firestore;
  try {
    const admin = getFirebaseAdmin();
    auth = admin.auth;
    firestore = admin.firestore;
  } catch (err: any) {
    if (err.message === 'MISSING_FIREBASE_CREDENTIALS') {
      return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
    }
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }

  // Payload Shape and Properties Validation
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'HANDOFF_INVALID_OR_EXPIRED' });
  }

  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'code') {
    return res.status(400).json({ error: 'HANDOFF_INVALID_OR_EXPIRED' });
  }

  // Payload Type and Format Validation
  const code = body.code;
  if (typeof code !== 'string' || code.length !== 43 || !/^[A-Za-z0-9_-]+$/.test(code)) {
    return res.status(400).json({ error: 'HANDOFF_INVALID_OR_EXPIRED' });
  }

  const startTime = Date.now();

  try {
    const codeHash = createHash('sha256').update(code).digest('hex');
    const docRef = firestore.collection('ecosystemHandoffs').doc(codeHash);

    let uid = '';
    let organizationId = '';
    let accessSource = '';

    // Atomic Consumption
    await firestore.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);

      if (!doc.exists) {
        throw new Error('NOT_FOUND');
      }

      const data = doc.data();

      // Validate integrity of handoff issuance
      if (
        data?.appId !== 'nestfinance' ||
        data?.version !== 1 ||
        data?.status !== 'issued' ||
        data?.consumedAt !== null ||
        !data?.uid ||
        !data?.organizationId ||
        !data?.accessSource
      ) {
        throw new Error('INVALID_DATA');
      }

      // Check Expiration
      const expiresAt = data.expiresAt?.toDate();
      if (!expiresAt || expiresAt.getTime() <= Date.now()) {
        throw new Error('EXPIRED');
      }

      // Atomically update state
      transaction.update(docRef, {
        status: 'consumed',
        consumedAt: FieldValue.serverTimestamp(),
        consumedBy: 'nestfinance-redeem-v1'
      });

      uid = data.uid;
      organizationId = data.organizationId;
      accessSource = data.accessSource;
    });

    // Issuing Firebase Custom Token without revealing raw payload
    const customToken = await auth.createCustomToken(uid, {
      mn_app_id: 'nestfinance',
      mn_organization_id: organizationId,
      mn_handoff_version: 1,
      mn_access_source: accessSource
    });

    const duration = Date.now() - startTime;
    console.log(`[HANDOFF_REDEEM] Event: success, Duration: ${duration}ms`);

    return res.status(200).json({ customToken });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    if (['NOT_FOUND', 'INVALID_DATA', 'EXPIRED'].includes(error.message)) {
      console.log(`[HANDOFF_REDEEM] Event: rejected, Reason: ${error.message}, Duration: ${duration}ms`);
      return res.status(400).json({ error: 'HANDOFF_INVALID_OR_EXPIRED' });
    }

    const internalErrorCode = error.code || 'UNKNOWN_INTERNAL_ERROR';
    console.error(`[HANDOFF_REDEEM_ERROR] Event: failure, Code: ${internalErrorCode}, Duration: ${duration}ms`);
    
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
