import type { firestore } from 'firebase-admin';

import { canManageFinanceBootstrap } from './bootstrapAvailabilityHelper.js';

export interface RequiredAccessArgs {
  db: firestore.Firestore;
  uid: string;
  organizationId: string;
  financeEntityId: string;
  requiredPermission?: string;
  sessionGranted?: boolean; // From resolveEcosystemSession
}

export interface FinanceEntityAccessContext {
  organizationId: string;
  financeEntityId: string;
  financeEntity: any;
  repository: ReturnType<typeof createFinanceEntityScope>;
}

export async function requireFinanceEntityAccess({
  db,
  uid,
  organizationId,
  financeEntityId,
  requiredPermission,
  sessionGranted
}: RequiredAccessArgs): Promise<FinanceEntityAccessContext> {
  if (!organizationId) {
    throw new Error('Organization ID is required');
  }

  if (!financeEntityId) {
    throw new Error('Finance Entity ID is required');
  }

  if (!sessionGranted) {
    throw new Error('Session not granted'); // A higher level handles this typically
  }

  // Find entity
  const entityDoc = await db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId).get();
  
  if (!entityDoc.exists) {
    // Cannot leak existence
    throw new Error('FINANCE_ENTITY_NOT_FOUND');
  }

  const data = entityDoc.data();
  if (data?.active === false) {
    throw new Error('FINANCE_ENTITY_NOT_ACTIVE');
  }

  const access = await canManageFinanceBootstrap(uid, organizationId, financeEntityId);
  if (!access.canApply) {
     throw new Error('FORBIDDEN_FINANCE_ACCESS');
  }

  const repository = createFinanceEntityScope({ db, organizationId, financeEntityId });

  return {
    organizationId,
    financeEntityId,
    financeEntity: { id: entityDoc.id, ...data },
    repository
  };
}

export function createFinanceEntityScope(args: {
  db: firestore.Firestore;
  organizationId: string;
  financeEntityId: string;
}) {
  const { db, organizationId, financeEntityId } = args;
  const orgRef = db.collection('organizations').doc(organizationId);

  // Helper to validate the response respects the isolation scope (fail-closed)
  const assertEntityIsolation = (data: any) => {
    if (data.financeEntityId !== financeEntityId) {
      console.error(`[CRITICAL] Security violation: Document ${data.id || 'unknown'} has mismatched financeEntityId ${data.financeEntityId} instead of requested ${financeEntityId}.`);
      throw new Error('FINANCE_ENTITY_MISMATCH');
    }
  };

  return {
    getAccountsRef: () => orgRef.collection('financeAccounts'),
    getAccountsQuery: () => orgRef.collection('financeAccounts').where('financeEntityId', '==', financeEntityId),
    getFundsRef: () => orgRef.collection('financeFunds'),
    getFundsQuery: () => orgRef.collection('financeFunds').where('financeEntityId', '==', financeEntityId),
    getCategoriesRef: () => orgRef.collection('financeCategories'),
    getCategoriesQuery: () => orgRef.collection('financeCategories').where('financeEntityId', '==', financeEntityId),
    getSettingsRef: () => orgRef.collection('financeSettings'),
    getAuditRef: () => orgRef.collection('financeAuditLogs'),
    getUniqueKeysRef: () => orgRef.collection('financeUniqueKeys'),
    
    assertEntityIsolation
  };
}
