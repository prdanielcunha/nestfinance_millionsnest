import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';
import { requireFinanceEntityAccess } from './accessHelpers.js';

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

    const { financeEntityId } = req.body || {};
    if (!financeEntityId || typeof financeEntityId !== 'string') {
      return res.status(400).json({ error: 'FINANCE_ENTITY_REQUIRED' });
    }

    const access = await requireFinanceEntityAccess({
      db: firestore,
      uid,
      organizationId,
      financeEntityId,
      sessionGranted: true
    });

    const accountsSnapshot = await access.repository.getAccountsQuery().limit(1001).get();

    if (accountsSnapshot.size > 1000) {
       console.error(`[CRITICAL] Account limit exceeded for entity ${financeEntityId}.`);
       return res.status(400).json({ error: 'CATALOG_LIMIT_EXCEEDED' });
    }

    const docs = accountsSnapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
    
    docs.sort((a, b) => {
      const nameA = a.data.normalizedName || (typeof a.data.name === 'string' ? a.data.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() : '') || a.id;
      const nameB = b.data.normalizedName || (typeof b.data.name === 'string' ? b.data.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() : '') || b.id;
      return nameA.localeCompare(nameB);
    });

    const accounts = [];
    for (const doc of docs) {
      const data = doc.data;
      access.repository.assertEntityIsolation(data);
      accounts.push({
        id: doc.id,
        name: data.name,
        type: data.type,
        institutionName: data.institutionName,
        accountLast4: data.accountLast4,
        currency: data.currency,
        financeEntityId: data.financeEntityId,
        active: data.active
      });
    }

    return res.status(200).json({ accounts });

  } catch (error: any) {
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/id-token-revoked' || error.code === 'auth/argument-error') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    if (error.message === 'FINANCE_ENTITY_NOT_FOUND' || error.message === 'FINANCE_ENTITY_NOT_ACTIVE') {
       return res.status(404).json({ error: error.message });
    }
    if (error.message === 'FORBIDDEN_FINANCE_ACCESS') {
       return res.status(403).json({ error: 'FORBIDDEN' });
    }
    console.error('List accounts error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
