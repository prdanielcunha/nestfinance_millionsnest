import { getFirebaseAdmin } from './firebaseAdmin.js';

export type SessionResolution = {
  granted: boolean;
  uid: string;
  organizationId: string;
  isGlobalAccess: boolean;
  accessSource:
    | 'global_system_role'
    | 'organization_membership'
    | 'denied';
  denialReason?: string;
};

export async function resolveEcosystemSession(uid: string, organizationId: string): Promise<SessionResolution> {
  const { firestore } = getFirebaseAdmin();

  // Load canonical docs
  const userRef = firestore.collection('users').doc(uid);
  const orgRef = firestore.collection('organizations').doc(organizationId);
  const memRef = orgRef.collection('members').doc(uid);

  const [userDoc, orgDoc, memDoc] = await Promise.all([
    userRef.get(),
    orgRef.get(),
    memRef.get(),
  ]);

  if (!userDoc.exists) {
    return {
      granted: false,
      uid,
      organizationId,
      isGlobalAccess: false,
      accessSource: 'denied',
      denialReason: 'USER_NOT_FOUND',
    };
  }

  const userData = userDoc.data();
  if (userData?.status !== 'active') {
    return {
      granted: false,
      uid,
      organizationId,
      isGlobalAccess: false,
      accessSource: 'denied',
      denialReason: 'USER_NOT_ACTIVE',
    };
  }

  if (!orgDoc.exists) {
    return {
      granted: false,
      uid,
      organizationId,
      isGlobalAccess: false,
      accessSource: 'denied',
      denialReason: 'ORGANIZATION_NOT_FOUND',
    };
  }

  const orgData = orgDoc.data();
  if (orgData?.status !== 'active') {
    return {
      granted: false,
      uid,
      organizationId,
      isGlobalAccess: false,
      accessSource: 'denied',
      denialReason: 'ORGANIZATION_NOT_ACTIVE',
    };
  }

  const systemRole = userData?.systemRole;
  const isGlobalAccess = ['ceo', 'admin', 'global_admin'].includes(systemRole);

  if (isGlobalAccess) {
    return {
      granted: true,
      uid,
      organizationId,
      isGlobalAccess: true,
      accessSource: 'global_system_role',
    };
  }

  // Non-global users
  if (!memDoc.exists) {
    return {
      granted: false,
      uid,
      organizationId,
      isGlobalAccess: false,
      accessSource: 'denied',
      denialReason: 'MEMBERSHIP_NOT_FOUND',
    };
  }

  const memData = memDoc.data();
  if (memData?.status !== 'active') {
    return {
      granted: false,
      uid,
      organizationId,
      isGlobalAccess: false,
      accessSource: 'denied',
      denialReason: 'MEMBERSHIP_NOT_ACTIVE',
    };
  }

  // Validate NestFinance specifically
  if (!orgData?.enabledApps?.includes('nestfinance')) {
    return {
      granted: false,
      uid,
      organizationId,
      isGlobalAccess: false,
      accessSource: 'denied',
      denialReason: 'APP_NOT_ENABLED_IN_ORGANIZATION',
    };
  }

  if (memData?.appAccess?.nestFinance?.enabled !== true) {
    return {
      granted: false,
      uid,
      organizationId,
      isGlobalAccess: false,
      accessSource: 'denied',
      denialReason: 'USER_APP_ACCESS_DENIED',
    };
  }

  // Check entitlement
  // Since we don't have a canonical entitlement source for NestFinance yet
  return {
    granted: false,
    uid,
    organizationId,
    isGlobalAccess: false,
    accessSource: 'denied',
    denialReason: 'ENTITLEMENT_NOT_CONFIGURED',
  };
}
