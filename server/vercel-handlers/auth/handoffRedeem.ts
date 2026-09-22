import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { createHash } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import {
  buildRedeemAuditEvent,
  enforceRedeemRateLimit,
  resolveRedeemNetworkFingerprint,
  validateRedeemOrigin,
} from './handoffSecurity.js';

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
      console.error(`[HANDOFF_REDEEM_INIT] MISSING_FIREBASE_CREDENTIALS`);
      return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
    }
    console.error(`[HANDOFF_REDEEM_INIT] Firebase Admin initialization failed:`, err);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }

  const networkFingerprint = resolveRedeemNetworkFingerprint(req.headers as Record<string, unknown>);

  res.setHeader('Vary', 'Origin');
  const originDecision = validateRedeemOrigin(req.headers.origin);
  if (!originDecision.allowed) {
    const auditRef = firestore.collection('ecosystemHandoffAudit').doc();
    await auditRef.set(buildRedeemAuditEvent({
      eventId: auditRef.id,
      eventType: 'handoff.origin_rejected',
      networkFingerprint,
      reason: 'ORIGIN_NOT_ALLOWED',
    })).catch(() => undefined);

    return res.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' });
  }
  if (originDecision.origin) {
    res.setHeader('Access-Control-Allow-Origin', originDecision.origin);
  }

  let rateLimit;
  try {
    rateLimit = await enforceRedeemRateLimit({
      db: firestore,
      networkFingerprint,
      nowMs: Date.now(),
    });
  } catch (error: any) {
    console.error('[HANDOFF_REDEEM_RATE_LIMIT] Protection unavailable:', error?.code || error?.message || 'UNKNOWN');
    return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
  }

  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
    const auditRef = firestore.collection('ecosystemHandoffAudit').doc();
    await auditRef.set(buildRedeemAuditEvent({
      eventId: auditRef.id,
      eventType: 'handoff.rate_limited',
      networkFingerprint,
      reason: 'RATE_LIMITED',
    })).catch(() => undefined);

    return res.status(429).json({
      error: 'RATE_LIMITED',
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
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
    let sessionVersion = 0;
    let auditUid = '';
    let auditOrganizationId = '';
    let auditSessionVersion = 0;
    const successAuditRef = firestore.collection('ecosystemHandoffAudit').doc();

    // Atomic Consumption + durable audit
    await firestore.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);

      if (!doc.exists) {
        throw new Error('NOT_FOUND');
      }

      const data = doc.data();

      auditUid = typeof data?.uid === 'string' ? data.uid : '';
      auditOrganizationId = typeof data?.organizationId === 'string' ? data.organizationId : '';
      auditSessionVersion =
        typeof data?.sessionVersion === 'number' && Number.isSafeInteger(data.sessionVersion)
          ? data.sessionVersion
          : 0;

      // Validate integrity of handoff issuance
      if (
        data?.appId !== 'nestfinance' ||
        data?.version !== 1 ||
        data?.status !== 'issued' ||
        data?.consumedAt !== null ||
        !data?.uid ||
        !data?.organizationId ||
        !data?.accessSource ||
        typeof data?.sessionVersion !== 'number' ||
        !Number.isSafeInteger(data.sessionVersion) ||
        data.sessionVersion < 1
      ) {
        throw new Error('INVALID_DATA');
      }

      // Check Expiration
      const expiresAt = data.expiresAt?.toDate();
      if (!expiresAt || expiresAt.getTime() <= Date.now()) {
        throw new Error('EXPIRED');
      }

      // A code issued before a logout/org-switch revocation must not mint a fresh session.
      const userRef = firestore.collection('users').doc(data.uid);
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        throw new Error('REVOKED');
      }
      const rawCanonicalVersion = userDoc.data()?.ecosystemSessionVersion;
      const canonicalSessionVersion =
        typeof rawCanonicalVersion === 'number' &&
        Number.isSafeInteger(rawCanonicalVersion) &&
        rawCanonicalVersion >= 1
          ? rawCanonicalVersion
          : 1;
      if (canonicalSessionVersion !== data.sessionVersion) {
        throw new Error('REVOKED');
      }

      // Atomically update state
      transaction.update(docRef, {
        status: 'consumed',
        consumedAt: FieldValue.serverTimestamp(),
        consumedBy: 'nestfinance-redeem-v1'
      });

      transaction.set(successAuditRef, buildRedeemAuditEvent({
        eventId: successAuditRef.id,
        eventType: 'handoff.redeemed',
        codeHash,
        networkFingerprint,
        uid: data.uid,
        organizationId: data.organizationId,
        sessionVersion: data.sessionVersion,
      }));

      uid = data.uid;
      organizationId = data.organizationId;
      accessSource = data.accessSource;
      sessionVersion = data.sessionVersion;
    });

    // Issuing Firebase Custom Token without revealing raw payload
    const customToken = await auth.createCustomToken(uid, {
      mn_app_id: 'nestfinance',
      mn_organization_id: organizationId,
      mn_handoff_version: 1,
      mn_access_source: accessSource,
      mn_session_version: sessionVersion
    });

    const duration = Date.now() - startTime;
    console.log(`[HANDOFF_REDEEM] Event: success, Duration: ${duration}ms`);

    return res.status(200).json({ customToken });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    if (['NOT_FOUND', 'INVALID_DATA', 'EXPIRED', 'REVOKED'].includes(error.message)) {
      console.log(`[HANDOFF_REDEEM] Event: rejected, Reason: ${error.message}, Duration: ${duration}ms`);

      // Avoid write amplification for random brute-force codes that never existed.
      if (error.message !== 'NOT_FOUND') {
        const rejectionAuditRef = firestore.collection('ecosystemHandoffAudit').doc();
        await rejectionAuditRef.set(buildRedeemAuditEvent({
          eventId: rejectionAuditRef.id,
          eventType: 'handoff.redeem_rejected',
          codeHash,
          networkFingerprint,
          uid: auditUid || null,
          organizationId: auditOrganizationId || null,
          sessionVersion: auditSessionVersion || null,
          reason: error.message,
        })).catch(() => undefined);
      }

      return res.status(400).json({ error: 'HANDOFF_INVALID_OR_EXPIRED' });
    }

    const internalErrorCode = error.code || 'UNKNOWN_INTERNAL_ERROR';
    console.error(`[HANDOFF_REDEEM_ERROR] Event: failure, Code: ${internalErrorCode}, Duration: ${duration}ms`);
    
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
