import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { requireFinanceEntityAccess } from './accessHelpers.js';

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
    return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
  }

  const { auth, firestore } = admin;

  try {
    const decodedToken = await auth.verifyIdToken(idToken, true);
    const uid = decodedToken.uid;
    const organizationId = decodedToken.mn_organization_id;

    if (!organizationId || typeof organizationId !== 'string') {
      return res.status(403).json({ error: 'FORBIDDEN_MISSING_ORG' });
    }

    const { financeEntityId } = req.body;
    if (!financeEntityId || typeof financeEntityId !== 'string') {
      return res.status(400).json({ error: 'INVALID_PAYLOAD' });
    }

    const access = await requireFinanceEntityAccess({
      db: firestore,
      uid,
      organizationId,
      financeEntityId,
      sessionGranted: true
    });

    const accountsSnap = await access.repository.getAccountsQuery().get();
    const fundsSnap = await access.repository.getFundsQuery().get();
    const categoriesSnap = await access.repository.getCategoriesQuery().get();

    const scopedAccounts = accountsSnap.size;
    const scopedFunds = fundsSnap.size;
    const scopedCategories = categoriesSnap.size;

    let status: 'not_started' | 'legacy_data_available' | 'ready' = 'not_started';
    
    if (scopedAccounts > 0 || scopedFunds > 0 || scopedCategories > 0) {
        status = 'ready';
    }
    
    const { getApplicationAvailability } = await import('./bootstrapAvailabilityHelper.js');
    const applicationAvailability = await getApplicationAvailability(financeEntityId);

    return res.status(200).json({
       status,
       counts: {
           scopedAccounts,
           scopedFunds,
           scopedCategories,
           unscopedAccounts: 0,
           unscopedFunds: 0,
           unscopedCategories: 0
       },
       canAdoptLegacyData: false,
       recommendedTemplateId: 'obpc-br-v1',
       applicationAvailability
    });

  } catch (error: any) {
    if (error.code === 'auth/argument-error' || error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    if (error.message === 'FINANCE_ENTITY_NOT_FOUND' || error.message === 'FINANCE_ENTITY_NOT_ACTIVE') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'FORBIDDEN_FINANCE_ACCESS') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    console.error('Entities bootstrap status error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}

