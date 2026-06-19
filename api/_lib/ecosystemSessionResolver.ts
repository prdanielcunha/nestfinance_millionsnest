
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

  const globalRoles = userDoc.data()?.globalRoles || [];
  if (globalRoles.includes('system_admin')) {
    isGlobalAccess = true;
    accessSource = 'global_system_role';
  } else {
    const memberDoc = await db.collection('organizations').doc(orgId).collection('users').doc(uid).get();
    if (memberDoc.exists) {
      accessSource = 'organization_membership';
    } else {
      return { granted: false, denialReason: 'NOT_A_MEMBER' };
    }
  }

  // Safely resolve financeSetup status WITHOUT using bootstrapAvailabilityHelper or ANY dynamic imports
  let status = 'not_started';
  try {
    const entitiesSnapshot = await db.collection('organizations').doc(orgId).collection('financeEntities')
      .where('active', '==', true)
      .limit(1)
      .get();
      
    if (!entitiesSnapshot.empty) {
      const entityId = entitiesSnapshot.docs[0].id;
      const settingsDoc = await db.collection('organizations').doc(orgId).collection('financeSettings').doc(`entity_${entityId}`).get();
      if (settingsDoc.exists) {
        status = settingsDoc.data()?.bootstrap?.status || 'not_started';
      }
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
    