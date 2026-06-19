import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';

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

    const sessionList = await resolveEcosystemSession(uid, organizationId);
    if (!sessionList.granted || sessionList.isGlobalAccess !== true) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const { financeEntityId } = req.body;
    if (!financeEntityId || typeof financeEntityId !== 'string') {
      return res.status(400).json({ error: 'INVALID_PAYLOAD' });
    }

    const orgRef = firestore.collection('organizations').doc(organizationId);
    
    // Verify entity exists
    const entityDoc = await orgRef.collection('financeEntities').doc(financeEntityId).get();
    if (!entityDoc.exists) {
        return res.status(404).json({ error: 'FINANCE_ENTITY_NOT_FOUND' });
    }

    // Determine oldest entity
    const entitiesSnap = await orgRef.collection('financeEntities')
        .orderBy('createdAt', 'asc')
        .limit(1)
        .get();
        
    let isOldestEntity = false;
    if (!entitiesSnap.empty && entitiesSnap.docs[0].id === financeEntityId) {
        isOldestEntity = true;
    }

    // Get counts
    const accountsSnap = await orgRef.collection('financeAccounts').get();
    const fundsSnap = await orgRef.collection('financeFunds').get();
    const categoriesSnap = await orgRef.collection('financeCategories').get();

    let scopedAccounts = 0;
    let scopedFunds = 0;
    let scopedCategories = 0;
    
    let unscopedAccounts = 0;
    let unscopedFunds = 0;
    let unscopedCategories = 0;

    accountsSnap.forEach(doc => {
       if (doc.data().financeEntityId === financeEntityId) scopedAccounts++;
       else if (!doc.data().financeEntityId) unscopedAccounts++;
    });

    fundsSnap.forEach(doc => {
       if (doc.data().financeEntityId === financeEntityId) scopedFunds++;
       else if (!doc.data().financeEntityId) unscopedFunds++;
    });

    categoriesSnap.forEach(doc => {
       if (doc.data().financeEntityId === financeEntityId) scopedCategories++;
       else if (!doc.data().financeEntityId) unscopedCategories++;
    });

    const hasUnscoped = unscopedAccounts > 0 || unscopedFunds > 0 || unscopedCategories > 0;
    const canAdoptLegacyData = hasUnscoped && isOldestEntity;
    
    let status: 'not_started' | 'legacy_data_available' | 'ready' = 'not_started';
    
    if (scopedAccounts > 0 || scopedFunds > 0 || scopedCategories > 0) {
        status = 'ready';
    } else if (canAdoptLegacyData) {
        status = 'legacy_data_available';
    }
    
    return res.status(200).json({
       status,
       counts: {
           scopedAccounts,
           scopedFunds,
           scopedCategories,
           unscopedAccounts,
           unscopedFunds,
           unscopedCategories
       },
       canAdoptLegacyData,
       recommendedTemplateId: 'obpc-br-v1'
    });

  } catch (error: any) {
    if (error.code === 'auth/argument-error' || error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    console.error('Entities bootstrap status error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
