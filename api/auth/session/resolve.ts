import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../_lib/firebaseAdmin';
import { resolveEcosystemSession } from '../../_lib/ecosystemSessionResolver';

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

  // Feature Flag
  if (process.env.NESTFINANCE_SESSION_RESOLVE_ENABLED !== 'true') {
    return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  let auth;
  try {
    const admin = getFirebaseAdmin();
    auth = admin.auth;
  } catch (err: any) {
    if (err.message === 'MISSING_FIREBASE_CREDENTIALS') {
      return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
    }
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }

  const startTime = Date.now();

  try {
    // verifyIdToken with checkRevoked = true
    const decodedToken = await auth.verifyIdToken(idToken, true);

    const uid = decodedToken.uid;
    const mn_app_id = decodedToken.mn_app_id;
    const mn_handoff_version = decodedToken.mn_handoff_version;
    const mn_organization_id = decodedToken.mn_organization_id;

    if (mn_app_id !== 'nestfinance' || mn_handoff_version !== 1 || !mn_organization_id || typeof mn_organization_id !== 'string') {
      console.log(`[SESSION_RESOLVE] Event: rejected, Reason: INVALID_CLAIMS, Duration: ${Date.now() - startTime}ms`);
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    const resolution = await resolveEcosystemSession(uid, mn_organization_id);

    if (resolution.granted) {
      console.log(`[SESSION_RESOLVE] Event: granted, Org: ${mn_organization_id}, isGlobal: ${resolution.isGlobalAccess}, Duration: ${Date.now() - startTime}ms`);
      return res.status(200).json({
        status: 'granted',
        organizationId: resolution.organizationId,
        isGlobalAccess: resolution.isGlobalAccess,
        accessSource: resolution.accessSource
      });
    } else {
      console.log(`[SESSION_RESOLVE] Event: denied, Org: ${mn_organization_id}, Reason: ${resolution.denialReason}, Duration: ${Date.now() - startTime}ms`);
      return res.status(403).json({ status: 'denied' });
    }

  } catch (error: any) {
    const duration = Date.now() - startTime;
    // Handle specific auth errors if needed
    if (error.code === 'auth/id-token-revoked' || error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
       console.log(`[SESSION_RESOLVE] Event: rejected, Reason: ${error.code}, Duration: ${duration}ms`);
       return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    
    console.error(`[SESSION_RESOLVE_ERROR] Event: failure, Code: ${error.code || 'UNKNOWN'}, Duration: ${duration}ms`);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
