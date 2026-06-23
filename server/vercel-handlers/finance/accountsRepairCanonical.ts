import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { requireFinanceEntityAccess } from './accessHelpers.js';
import { FieldValue } from 'firebase-admin/firestore';
import { CANONICAL_ACCOUNT_TEMPLATES, getAccountNature } from '../../../shared/finance/smartLogic.js';

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

    const { financeEntityId, accountIds } = req.body;

    if (!financeEntityId || typeof financeEntityId !== 'string') {
      return res.status(400).json({ error: 'FINANCE_ENTITY_REQUIRED' });
    }

    if (!Array.isArray(accountIds) || accountIds.length === 0) {
      return res.status(400).json({ error: 'INVALID_ACCOUNT_IDS' });
    }

    // Require finance entity access and active status
    const access = await requireFinanceEntityAccess({
      db: firestore,
      uid,
      organizationId,
      financeEntityId,
      sessionGranted: true
    });

    const orgRef = firestore.collection('organizations').doc(organizationId);
    const accountsRef = orgRef.collection('financeAccounts');
    const auditRef = orgRef.collection('financeAuditLogs');

    const ts = FieldValue.serverTimestamp();

    const results = await firestore.runTransaction(async (transaction) => {
      const repairResults = [];

      for (const accountId of accountIds) {
        if (typeof accountId !== 'string' || !accountId) {
          continue;
        }

        const accountRef = accountsRef.doc(accountId);
        const accountSnap = await transaction.get(accountRef);

        if (!accountSnap.exists) {
          repairResults.push({ accountId, status: 'not_found' });
          continue;
        }

        const accountData = accountSnap.data();

        // Security check: assert isolation
        if (accountData.financeEntityId !== financeEntityId) {
          repairResults.push({ accountId, status: 'mismatched_entity' });
          continue;
        }

        const templateKey = accountData.templateKey;
        if (!templateKey) {
          repairResults.push({ accountId, status: 'not_canonical' });
          continue;
        }

        const canon = CANONICAL_ACCOUNT_TEMPLATES[templateKey];
        if (!canon) {
          repairResults.push({ accountId, status: 'unrecognized_canonical' });
          continue;
        }

        // Determine if we need to repair
        const currentType = accountData.type;
        const currentNature = accountData.nature;
        const currentStatus = accountData.configurationStatus;

        const expectedType = canon.type;
        const expectedNature = canon.nature;

        const needsType = !currentType || currentType !== expectedType;
        const needsNature = !currentNature || currentNature !== expectedNature;
        const needsStatus = currentStatus !== 'complete';

        if (needsType || needsNature || needsStatus) {
          const updates: any = {
            updatedAt: ts,
            updatedBy: uid
          };

          if (needsType) updates.type = expectedType;
          if (needsNature) updates.nature = expectedNature;
          if (needsStatus) updates.configurationStatus = 'complete';

          transaction.update(accountRef, updates);

          // Generate audit log in transaction
          const auditDocRef = auditRef.doc();
          transaction.create(auditDocRef, {
            id: auditDocRef.id,
            financeEntityId,
            organizationId,
            action: 'account_repair_canonical',
            accountId,
            templateKey,
            oldState: { type: currentType || null, nature: currentNature || null, configurationStatus: currentStatus || null },
            newState: { type: expectedType, nature: expectedNature, configurationStatus: 'complete' },
            performedBy: uid,
            createdAt: ts
          });

          repairResults.push({ accountId, status: 'repaired', templateKey });
        } else {
          repairResults.push({ accountId, status: 'already_complete', templateKey });
        }
      }

      return repairResults;
    });

    return res.status(200).json({ success: true, results });
  } catch (error: any) {
    console.error('[accountsRepairCanonical] Error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
}
