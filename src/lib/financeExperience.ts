import type { EcosystemAccessState } from '../types/access';
import { hasEffectiveCapability } from './permissions';

export type FinanceExperienceMode =
  | 'ecosystem'
  | 'organization_admin'
  | 'review'
  | 'operation'
  | 'read_only';

export type FinanceInterfaceRole =
  | 'volunteer'
  | 'treasurer'
  | 'administrator'
  | 'accountant';

export function getFinanceExperienceMode(accessState: EcosystemAccessState | null): FinanceExperienceMode {
  if (!accessState) return 'read_only';
  if (accessState.isGlobalAccess) return 'ecosystem';

  const organizationRole = String(accessState.organizationRole || '').toLowerCase();
  if (
    organizationRole === 'owner' ||
    organizationRole === 'admin' ||
    hasEffectiveCapability(accessState, 'finance.manage') ||
    hasEffectiveCapability(accessState, 'organization.manage_entities')
  ) {
    return 'organization_admin';
  }

  if (
    hasEffectiveCapability(accessState, 'finance.review') ||
    hasEffectiveCapability(accessState, 'finance.approve_for_posting')
  ) {
    return 'review';
  }

  if (
    hasEffectiveCapability(accessState, 'finance.create_drafts') ||
    hasEffectiveCapability(accessState, 'finance.submit_for_review')
  ) {
    return 'operation';
  }

  return 'read_only';
}


function normalizedRoleHints(accessState: EcosystemAccessState | null) {
  if (!accessState) return [];
  const raw = [
    accessState.organizationRole,
    accessState.systemRole,
    ...(Array.isArray(accessState.roles) ? accessState.roles : []),
  ];
  return raw.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
}

export function getFinanceInterfaceRole(
  accessState: EcosystemAccessState | null,
): FinanceInterfaceRole {
  if (!accessState) return 'accountant';

  const roleHints = normalizedRoleHints(accessState);
  const hasHint = (...values: string[]) =>
    roleHints.some((role) => values.some((value) => role.includes(value)));

  if (
    accessState.isGlobalAccess ||
    hasHint('owner', 'admin', 'administrator', 'administrador') ||
    hasEffectiveCapability(accessState, 'finance.manage') ||
    hasEffectiveCapability(accessState, 'organization.manage_entities')
  ) {
    return 'administrator';
  }

  if (hasHint('accountant', 'contador', 'contabil', 'contábil', 'accounting')) {
    return 'accountant';
  }

  if (hasHint('treasurer', 'tesoureiro', 'tesouraria')) {
    return 'treasurer';
  }

  if (hasHint('volunteer', 'voluntario', 'voluntário')) {
    return 'volunteer';
  }

  if (
    hasEffectiveCapability(accessState, 'finance.review') ||
    hasEffectiveCapability(accessState, 'finance.approve_for_posting')
  ) {
    return 'treasurer';
  }

  if (
    hasEffectiveCapability(accessState, 'finance.create_drafts') ||
    hasEffectiveCapability(accessState, 'finance.submit_for_review')
  ) {
    return 'volunteer';
  }

  return 'accountant';
}
