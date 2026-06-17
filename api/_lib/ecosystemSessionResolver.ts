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
  organization?: {
    id: string;
    name: string;
    slug?: string;
    logoPath?: string;
  };
  profile?: {
    displayName: string;
    photoURL?: string;
  };
  financeSetup?: {
    status: 'not_configured' | 'configured';
  };
};

export function isUserOperational(userData?: Record<string, unknown>): boolean {
  if (!userData) return false;

  // We should not use subscription, plan, or billing fields as identity status.
  // Look only at canonical status or accountStatus
  const statusVal = userData.status !== undefined ? userData.status : userData.accountStatus;
  
  if (statusVal !== undefined && statusVal !== null) {
    const statusStr = String(statusVal).toLowerCase();
    if (['disabled', 'inactive', 'suspended', 'pending_deletion'].includes(statusStr)) {
      return false;
    }
  }

  return true;
}

export function isOrganizationOperational(orgData?: Record<string, unknown>): boolean {
  if (!orgData) return false;

  const statusVal = orgData.status;

  if (statusVal !== undefined && statusVal !== null) {
    const statusStr = String(statusVal).toLowerCase();
    if (['suspended', 'archived', 'disabled'].includes(statusStr)) {
      return false;
    }
  }

  return true;
}

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
  if (!isUserOperational(userData)) {
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
  if (!isOrganizationOperational(orgData)) {
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
    const fnRef = orgRef.collection('financeSettings').doc('config');
    const fnDoc = await fnRef.get();

    return {
      granted: true,
      uid,
      organizationId,
      isGlobalAccess: true,
      accessSource: 'global_system_role',
      organization: {
        id: organizationId,
        name: orgData?.name || 'Organização',
        slug: orgData?.slug,
        logoPath: orgData?.logoPath,
      },
      profile: {
        displayName: userData?.displayName || 'Usuário',
        photoURL: userData?.photoURL,
      },
      financeSetup: {
        status: fnDoc.exists ? 'configured' : 'not_configured',
      },
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
