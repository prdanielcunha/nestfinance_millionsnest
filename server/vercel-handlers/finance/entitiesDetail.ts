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

  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.includes('application/json')) {
    return res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE' });
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

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'INVALID_PAYLOAD' });
    }

    const { financeEntityId } = req.body;

    if (!financeEntityId || typeof financeEntityId !== 'string' || !financeEntityId.startsWith('fent_') || financeEntityId.length !== 37) {
      return res.status(400).json({ error: 'INVALID_ENTITY_ID' });
    }

    const orgRef = firestore.collection('organizations').doc(organizationId);
    const entityRef = orgRef.collection('financeEntities').doc(financeEntityId);
    
    const entityDoc = await entityRef.get();
    if (!entityDoc.exists) {
      return res.status(404).json({ error: 'FINANCE_ENTITY_NOT_FOUND' });
    }

    const data = entityDoc.data()!;

    let updatedAt = '';
    if (data.updatedAt) {
      updatedAt = data.updatedAt.toDate().toISOString();
    } else if (data.createdAt) {
      updatedAt = data.createdAt.toDate().toISOString();
    } else {
      updatedAt = new Date().toISOString();
    }

    const mapAddress = (addr: any) => ({
      postalCode: addr?.postalCode || null,
      street: addr?.street || null,
      number: addr?.number || null,
      complement: addr?.complement || null,
      neighborhood: addr?.neighborhood || null,
      city: addr?.city || null,
      state: addr?.state || null,
    });

    const entityResponse = {
      id: data.id,
      taxId: data.taxId,
      taxIdFormatted: formatCnpj(data.taxId),
      taxIdFormat: data.taxId.length === 14 ? 'numeric' : 'alphanumeric',
      legalName: data.legalName,
      tradeName: data.tradeName || null,
      displayName: data.displayName,
      registrationStatus: data.registration?.status || null,
      registeredAddress: mapAddress(data.registeredAddress),
      operationalAddress: mapAddress(data.operationalAddress),
      operationalAddressSameAsRegistered: data.operationalAddressSameAsRegistered ?? true,
      active: data.active,
      hasLogo: !!data.logoPath,
      updatedAt
    };

    return res.status(200).json({ entity: entityResponse });

  } catch (error: any) {
    if (error.code === 'auth/argument-error' || error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    console.error('Entities Detail error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
