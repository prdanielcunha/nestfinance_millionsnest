import type { firestore } from 'firebase-admin';

import { canManageFinanceBootstrap } from './bootstrapAvailabilityHelper.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { VercelRequest } from '@vercel/node';

function resolveHandoffBinding(decodedToken: Record<string, unknown>) {
  const handoffKeys = [
    'mn_app_id',
    'mn_handoff_version',
    'mn_organization_id',
    'mn_session_version',
  ];
  const hasHandoffNamespace = handoffKeys.some(
    key => decodedToken[key] !== undefined && decodedToken[key] !== null,
  );

  if (!hasHandoffNamespace) {
    return {
      bound: false as const,
      organizationId: null,
      sessionVersion: null,
    };
  }

  const organizationId = decodedToken.mn_organization_id;
  const sessionVersion = decodedToken.mn_session_version;

  if (
    decodedToken.mn_app_id !== 'nestfinance' ||
    decodedToken.mn_handoff_version !== 1 ||
    typeof organizationId !== 'string' ||
    organizationId.trim() === '' ||
    typeof sessionVersion !== 'number' ||
    !Number.isSafeInteger(sessionVersion) ||
    sessionVersion < 1
  ) {
    throw { status: 401, error: 'UNAUTHORIZED' };
  }

  return {
    bound: true as const,
    organizationId,
    sessionVersion,
  };
}

export async function resolveFinanceRequestContext(req: VercelRequest, requiredCapability: 'finance.view' | 'finance.create_drafts' | 'finance.submit_for_review' | 'finance.review' | 'finance.approve_for_posting' | 'finance.invalidate_approval' | 'finance.return_to_draft') {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw { status: 401, error: 'UNAUTHORIZED' };
  }

  const token = authHeader.split('Bearer ')[1];
  const admin = getFirebaseAdmin();
  const db = admin.firestore;
  // Finance mutations/reads must reject revoked Firebase sessions, matching auth/session/resolve.
  const decodedToken = await admin.auth.verifyIdToken(token, true);
  const uid = decodedToken.uid;
  const handoff = resolveHandoffBinding(decodedToken as Record<string, unknown>);

  // Handoff token organization is canonical. Header remains only for compatibility/consistency checking.
  const headerOrgId = req.headers['x-organization-id'] as string;
  const tokenOrgId = handoff.organizationId;
  const organizationId = tokenOrgId || headerOrgId;

  if (!organizationId) {
    throw { status: 400, error: 'MISSING_ORGANIZATION_ID' };
  }

  const sessionList = await resolveEcosystemSession(uid, organizationId, handoff.bound ? {
    requireSessionVersion: true,
    expectedSessionVersion: handoff.sessionVersion,
  } : {});

  if (!sessionList.granted && sessionList.denialReason === 'SESSION_VERSION_MISMATCH') {
    throw { status: 401, error: 'UNAUTHORIZED' };
  }

  // Never let a caller retarget a handoff-bound token through a conflicting header.
  if (tokenOrgId && headerOrgId && tokenOrgId !== headerOrgId) {
    console.error(`[CRITICAL] Multi-tenant violation attempt: User ${uid} with tokenOrg ${tokenOrgId} attempted to access headerOrg ${headerOrgId}`);
    throw { status: 403, error: 'FORBIDDEN_ORGANIZATION_MISMATCH' };
  }

  const financeEntityId = req.body?.financeEntityId || req.query?.financeEntityId;
  if (!financeEntityId || typeof financeEntityId !== 'string') {
    throw { status: 400, error: 'INVALID_PARAMETERS', details: 'Missing financeEntityId' };
  }

  const context = await requireFinanceTransactionAccess({
    db,
    uid,
    organizationId,
    financeEntityId,
    sessionList,
    capability: requiredCapability
  });

  return { admin, db, uid, organizationId, financeEntityId, sessionList, context };
}

function canonicalPermissions(sessionList: any): string[] {
  if (Array.isArray(sessionList?.permissions)) return sessionList.permissions;
  // Compatibility with older in-process callers/tests. The canonical resolver only exposes
  // capabilities as an alias of its resolved permissions, never from legacy membership docs.
  return Array.isArray(sessionList?.capabilities) ? sessionList.capabilities : [];
}

export function hasEffectiveCapability(sessionList: any, requestedCapability: string): boolean {
  if (sessionList?.isGlobalAccess) return true;

  const organizationRole = String(sessionList?.organizationRole || '').trim().toLowerCase();
  if (
    (organizationRole === 'owner' || organizationRole === 'admin') &&
    (requestedCapability.startsWith('finance.') || requestedCapability === 'organization.manage_entities')
  ) {
    return true;
  }

  const permissions = canonicalPermissions(sessionList);
  if (permissions.includes('*') || permissions.includes(requestedCapability)) return true;

  if (requestedCapability.startsWith('finance.') && permissions.includes('finance.manage')) {
    return true;
  }

  const structuralFinanceCapabilities = new Set([
    'finance.accounts.manage',
    'finance.accounts.repair',
    'finance.funds.manage',
    'finance.categories.manage',
  ]);
  if (
    structuralFinanceCapabilities.has(requestedCapability) &&
    permissions.includes('organization.manage_entities')
  ) {
    return true;
  }

  return false;
}

export function hasFinanceEntityScope(sessionList: any, financeEntityId: string): boolean {
  if (sessionList?.isGlobalAccess) return true;

  const scopes = sessionList?.scopes;
  if (!scopes || typeof scopes !== 'object') return true;

  const globalScope = scopes['*'];
  if (Array.isArray(globalScope) && globalScope.includes('*')) return true;

  // Current Hub contract allows scopes to be absent. When financeEntityIds is explicitly
  // present, however, it is authoritative and restrictive.
  if (Object.prototype.hasOwnProperty.call(scopes, 'financeEntityIds')) {
    const financeEntityIds = scopes.financeEntityIds;
    return Array.isArray(financeEntityIds) && (financeEntityIds.includes('*') || financeEntityIds.includes(financeEntityId));
  }

  return true;
}

export function canManageFinanceEntities(sessionList: any): boolean {
  return hasEffectiveCapability(sessionList, 'organization.manage_entities');
}

export function hasFinanceCapability(sessionList: any, requestedCapability: 'finance.view' | 'finance.create_drafts' | 'finance.submit_for_review' | 'finance.review' | 'finance.approve_for_posting' | 'finance.invalidate_approval' | 'finance.return_to_draft'): boolean {
  if (hasEffectiveCapability(sessionList, requestedCapability)) return true;
  if (hasEffectiveCapability(sessionList, 'finance.manage')) return true;
  if (requestedCapability === 'finance.return_to_draft' && hasEffectiveCapability(sessionList, 'finance.review')) return true;
  if (requestedCapability === 'finance.invalidate_approval' && hasEffectiveCapability(sessionList, 'finance.review')) return true;
  return false;
}

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
    throw new Error('Session not granted');
  }

  const entityDoc = await db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId).get();

  if (!entityDoc.exists) {
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

export async function requireScopedFinanceAccount({
  db,
  uid,
  organizationId,
  financeEntityId,
  accountId,
  requiredPermission,
  sessionGranted,
  transaction
}: {
  db: firestore.Firestore;
  uid: string;
  organizationId: string;
  financeEntityId: string;
  accountId: string;
  requiredPermission?: string;
  sessionGranted?: boolean;
  transaction?: firestore.Transaction;
}) {
  const context = await requireFinanceEntityAccess({
    db,
    uid,
    organizationId,
    financeEntityId,
    requiredPermission,
    sessionGranted
  });

  const accountRef = context.repository.getAccountsRef().doc(accountId);
  const accountDoc = transaction ? await transaction.get(accountRef) : await accountRef.get();

  if (!accountDoc.exists) {
    throw new Error('ACCOUNT_NOT_FOUND');
  }

  const accountData = accountDoc.data()!;
  context.repository.assertEntityIsolation(accountData);

  return {
    context,
    accountRef,
    accountDoc,
    accountData
  };
}

export async function requireFinanceTransactionAccess({
  db,
  uid,
  organizationId,
  financeEntityId,
  sessionList,
  capability
}: {
  db: firestore.Firestore;
  uid: string;
  organizationId: string;
  financeEntityId: string;
  sessionList: any;
  capability: 'finance.view' | 'finance.create_drafts' | 'finance.submit_for_review' | 'finance.review' | 'finance.approve_for_posting' | 'finance.invalidate_approval' | 'finance.return_to_draft';
}): Promise<FinanceEntityAccessContext> {
  if (!organizationId) throw new Error('Organization ID is required');
  if (!financeEntityId) throw new Error('Finance Entity ID is required');
  if (!sessionList?.granted) throw new Error('Session not granted');

  const entityDoc = await db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId).get();

  if (!entityDoc.exists) {
    throw new Error('FINANCE_ENTITY_NOT_FOUND');
  }

  const data = entityDoc.data();
  if (data?.active === false) {
    throw new Error('FINANCE_ENTITY_NOT_ACTIVE');
  }

  if (!hasFinanceCapability(sessionList, capability) || !hasFinanceEntityScope(sessionList, financeEntityId)) {
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
    getTransactionsRef: () => orgRef.collection('financeTransactions'),
    getTransactionsQuery: () => orgRef.collection('financeTransactions').where('financeEntityId', '==', financeEntityId),
    getAllocationsRef: () => orgRef.collection('financeAllocations'),
    getAllocationsQuery: () => orgRef.collection('financeAllocations').where('financeEntityId', '==', financeEntityId),
    getIdempotencyRef: () => orgRef.collection('financeIdempotency'),
    getReconciliationsRef: () => orgRef.collection('financeReconciliations'),
    getReconciliationSessionsRef: () => orgRef.collection('financeReconciliationSessions'),
    getReconciliationsQuery: () => orgRef.collection('financeReconciliations').where('financeEntityId', '==', financeEntityId),
    getReconciliationLineLocksRef: () => orgRef.collection('financeReconciliationLineLocks'),
    getReconciliationReversalsRef: () => orgRef.collection('financeReconciliationReversals'),
    getPeriodCloseReviewsRef: () => orgRef.collection('financePeriodCloseReviews'),
    getPeriodCloseReviewsQuery: () => orgRef.collection('financePeriodCloseReviews').where('financeEntityId', '==', financeEntityId),

    assertEntityIsolation
  };
}
