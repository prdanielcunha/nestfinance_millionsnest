import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';

export type AvailabilityReason = 'emergency_disabled' | 'available';

export interface ApplicationAvailability {
  available: boolean;
  reason: AvailabilityReason;
}

export async function getApplicationAvailability(financeEntityId: string): Promise<ApplicationAvailability> {
  const isEmergencyDisabled = process.env.NESTFINANCE_BOOTSTRAP_EMERGENCY_DISABLED === 'true';
  
  if (isEmergencyDisabled) {
    return { available: false, reason: 'emergency_disabled' };
  }

  return { available: true, reason: 'available' };
}

export async function canManageFinanceBootstrap(uid: string, organizationId: string, financeEntityId: string) {
    const sessionList = await resolveEcosystemSession(uid, organizationId);
    
    if (!sessionList.granted) {
        return { canApply: false, reason: 'UNAUTHORIZED' };
    }

    if (sessionList.isGlobalAccess === true) {
        return { canApply: true, accessSource: 'global_role' };
    }

    const admin = getFirebaseAdmin();
    const db = admin.firestore;
    
    let memberData: any = null;
    const memberDoc = await db.collection('organizations').doc(organizationId).collection('users').doc(uid).get();

    if (memberDoc.exists) {
        memberData = memberDoc.data();
    } else {
        const rootMemberQuery = await db.collection('organization_members')
            .where('organizationId', '==', organizationId)
            .where('uid', '==', uid)
            .get();
        if (!rootMemberQuery.empty) {
            memberData = rootMemberQuery.docs[0].data();
        }
    }

    if (!memberData) {
        return { canApply: false, reason: 'NOT_A_MEMBER' };
    }

    if (memberData.status && memberData.status !== 'active') {
        return { canApply: false, reason: 'INACTIVE_MEMBERSHIP' };
    }

    const orgRole = memberData.organizationRole || memberData.role;
    const isOrgAdmin = orgRole === 'owner' || orgRole === 'admin';
    
    const financeAccess = memberData.nestFinanceAccess || {};
    const financeRoles = Array.isArray(financeAccess.roles) ? financeAccess.roles : [];
    const financePermissions = Array.isArray(financeAccess.permissions) ? financeAccess.permissions : [];
    
    const hasFinanceAdmin = isOrgAdmin || 
                         financeRoles.includes('admin') || 
                         financeRoles.includes('treasurer') || 
                         financePermissions.includes('finance_admin');

    if (hasFinanceAdmin) {
        // Enforce entity isolation if explicitly scoped
        if (financeAccess.scopes && Array.isArray(financeAccess.scopes.financeEntityIds)) {
            if (!financeAccess.scopes.financeEntityIds.includes(financeEntityId)) {
                return { canApply: false, reason: 'INSUFFICIENT_ENTITY_PERMISSION' };
            }
        }
        return { canApply: true, accessSource: 'organization_membership' };
    }

    return { canApply: false, reason: 'INSUFFICIENT_FINANCE_PERMISSION' };
}
