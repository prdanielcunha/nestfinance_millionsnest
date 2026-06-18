import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
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

    const fundsRef = firestore.collection('organizations').doc(organizationId).collection('financeFunds');
    const fundsSnapshot = await fundsRef.orderBy('normalizedName').limit(100).get();

    const validColors = ['slate', 'blue', 'emerald', 'amber', 'violet', 'rose'];

    const funds = [];
    for (const doc of fundsSnapshot.docs) {
      try {
        const data = doc.data();
        if (!data || typeof data.name !== 'string' || typeof data.restricted !== 'boolean') {
          continue; // Structurally invalid doc
        }

        const colorToken = typeof data.colorToken === 'string' && validColors.includes(data.colorToken)
          ? data.colorToken
          : 'slate';

        funds.push({
          id: doc.id,
          name: data.name,
          restricted: data.restricted,
          colorToken,
          active: typeof data.active === 'boolean' ? data.active : true,
        });
      } catch {
        // Skip document if error occurs parsing it
      }
    }

    return res.status(200).json({ funds });

  } catch (error: any) {
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/id-token-revoked' || error.code === 'auth/argument-error') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    console.error('List funds error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
