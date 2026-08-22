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

function sessionPermissions(session: any): string[] {
  if (Array.isArray(session?.permissions)) return session.permissions;
  return Array.isArray(session?.capabilities) ? session.capabilities : [];
}

function hasEntityScope(session: any, financeEntityId: string): boolean {
  if (session?.isGlobalAccess === true) return true;

  const scopes = session?.scopes;
  if (!scopes || typeof scopes !== 'object') return true;

  const globalScope = scopes['*'];
  if (Array.isArray(globalScope) && globalScope.includes('*')) return true;

  if (Object.prototype.hasOwnProperty.call(scopes, 'financeEntityIds')) {
    const financeEntityIds = scopes.financeEntityIds;
    return Array.isArray(financeEntityIds) && (financeEntityIds.includes('*') || financeEntityIds.includes(financeEntityId));
  }

  return true;
}

export async function canManageFinanceBootstrap(uid: string, organizationId: string, financeEntityId: string) {
  // Authorization is resolved once from the canonical Hub-compatible session contract.
  // Legacy membership documents are intentionally not read here.
  const session = await resolveEcosystemSession(uid, organizationId);

  if (!session.granted) {
    return { canApply: false, reason: session.denialReason || 'UNAUTHORIZED' };
  }

  if (session.isGlobalAccess === true) {
    return { canApply: true, accessSource: 'global_system_role' };
  }

  if (!hasEntityScope(session, financeEntityId)) {
    return { canApply: false, reason: 'INSUFFICIENT_ENTITY_PERMISSION' };
  }

  const permissions = sessionPermissions(session);
  const roles = Array.isArray(session.roles) ? session.roles : [];
  const organizationRole = session.organizationRole;

  const hasFinanceAdmin =
    permissions.includes('*') ||
    permissions.includes('organization.manage_entities') ||
    permissions.includes('finance.manage') ||
    permissions.includes('finance_admin') ||
    roles.includes('admin') ||
    roles.includes('treasurer') ||
    organizationRole === 'owner' ||
    organizationRole === 'admin';

  if (!hasFinanceAdmin) {
    return { canApply: false, reason: 'INSUFFICIENT_FINANCE_PERMISSION' };
  }

  return { canApply: true, accessSource: 'organization_membership' };
}
