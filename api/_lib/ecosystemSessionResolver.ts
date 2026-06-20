
import { getFirebaseAdmin } from './firebaseAdmin.js';

export function isValidIanaTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch (e) {
    return false;
  }
}

export async function resolveEcosystemSession(uid: string, orgId: string) {
  const admin = getFirebaseAdmin();
  const db = admin.firestore;

  let isGlobalAccess = false;
  let accessSource = '';

  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) return { granted: false, denialReason: 'USER_NOT_FOUND' };

  const orgDoc = await db.collection('organizations').doc(orgId).get();
  if (!orgDoc.exists) return { granted: false, denialReason: 'ORG_NOT_FOUND' };

  const userData = userDoc.data() || {};
  const rawSystemRole = userData.systemRole || userData.appRole || userData.role || '';
  const systemRole = typeof rawSystemRole === 'string' ? rawSystemRole.toLowerCase() : '';

  const globalRoles = ['ceo', 'admin', 'global_admin', 'ecosystem_owner', 'founder'];
  
  if (globalRoles.includes(systemRole)) {
    isGlobalAccess = true;
    accessSource = 'global_role';
  } else {
    const memberDoc = await db.collection('organizations').doc(orgId).collection('users').doc(uid).get();
    if (memberDoc.exists) {
      accessSource = 'organization_membership';
    } else {
      // Check for alternatives paths for members, like root organization_members
      const rootMemberQuery = await db.collection('organization_members')
        .where('organizationId', '==', orgId)
        .where('uid', '==', uid)
        .get();

      if (!rootMemberQuery.empty) {
        accessSource = 'organization_membership';
      } else {
        return { granted: false, denialReason: 'NOT_A_MEMBER' };
      }
    }
  }

  // Safely resolve financeSetup status WITHOUT using bootstrapAvailabilityHelper or ANY dynamic imports
  let status = 'not_started';
  try {
    const configDoc = await db.collection('organizations').doc(orgId).collection('financeSettings').doc('config').get();
    if (configDoc.exists) {
      status = 'configured';
    } else {
      status = 'not_configured';
    }
  } catch (e) {
    // suppress errors
  }

  return {
    granted: true,
    organizationId: orgId,
    isGlobalAccess,
    accessSource,
    organization: {
      id: orgId,
      name: orgDoc.data()?.name || '',
      slug: orgDoc.data()?.slug || '',
      logoPath: orgDoc.data()?.logoPath || null,
    },
    profile: {
      displayName: userDoc.data()?.displayName || '',
      photoURL: userDoc.data()?.photoURL || null,
    },
    financeSetup: {
      status
    }
  };
}
    