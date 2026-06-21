import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';
import { canManageFinanceEntities } from './accessHelpers.js';
import { formatCnpj } from '../../../shared/finance/taxId.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method !== 'POST') {
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

    if (!canManageFinanceEntities(sessionList)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const orgRef = firestore.collection('organizations').doc(organizationId);
    const entitiesCol = orgRef.collection('financeEntities');
    
    // Ordered by displayName natively when querying
    const snapshot = await entitiesCol.orderBy('displayName', 'asc').get();

    const entities = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: data.id,
        taxIdFormatted: formatCnpj(data.taxId),
        legalName: data.legalName,
        tradeName: data.tradeName || null,
        displayName: data.displayName,
        registrationStatus: data.registration?.status || null,
        city: data.operationalAddressSameAsRegistered 
            ? data.registeredAddress?.city || null
            : data.operationalAddress?.city || null,
        state: data.operationalAddressSameAsRegistered
            ? data.registeredAddress?.state || null
            : data.operationalAddress?.state || null,
        active: data.active,
        hasLogo: !!data.logoPath
      };
    });

    return res.status(200).json({ entities });

  } catch (error: any) {
    if (error.code === 'auth/argument-error' || error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    console.error('Entities List error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
