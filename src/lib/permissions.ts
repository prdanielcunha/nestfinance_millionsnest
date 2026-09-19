import { EcosystemAccessState } from "../types/access";

export function canManageFinanceEntities(accessState: EcosystemAccessState): boolean {
  return hasEffectiveCapability(accessState, 'organization.manage_entities');
}

export function hasEffectiveCapability(accessState: EcosystemAccessState | null, capability: string): boolean {
  if (!accessState) return false;
  if (accessState.isGlobalAccess) return true;

  const organizationRole = String(accessState.organizationRole || '').trim().toLowerCase();
  if (
    (organizationRole === 'owner' || organizationRole === 'admin') &&
    (capability.startsWith('finance.') || capability === 'organization.manage_entities')
  ) {
    return true;
  }

  const capabilities = accessState.capabilities ?? [];
  if (capabilities.includes('*') || capabilities.includes(capability)) return true;

  // Mirrors the canonical server helper: finance.manage is the explicit
  // application-level umbrella capability, never an inferred organization role.
  if (capability.startsWith('finance.') && capabilities.includes('finance.manage')) {
    return true;
  }

  const structuralFinanceCapabilities = new Set([
    'finance.accounts.manage',
    'finance.accounts.repair',
    'finance.funds.manage',
    'finance.categories.manage',
  ]);
  if (
    structuralFinanceCapabilities.has(capability) &&
    capabilities.includes('organization.manage_entities')
  ) {
    return true;
  }

  return false;
}

export function hasAnyEffectiveCapability(
  accessState: EcosystemAccessState | null,
  capabilities: readonly string[],
): boolean {
  return capabilities.some((capability) => hasEffectiveCapability(accessState, capability));
}
