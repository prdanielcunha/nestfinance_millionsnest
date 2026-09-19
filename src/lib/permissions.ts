import { EcosystemAccessState } from "../types/access";

export function canManageFinanceEntities(accessState: EcosystemAccessState): boolean {
  return hasEffectiveCapability(accessState, 'organization.manage_entities');
}

export function hasEffectiveCapability(accessState: EcosystemAccessState | null, capability: string): boolean {
  if (!accessState) return false;
  if (accessState.isGlobalAccess) return true;

  const capabilities = accessState.capabilities ?? [];
  if (capabilities.includes('*') || capabilities.includes(capability)) return true;

  // Mirrors the canonical server helper: finance.manage is the explicit
  // application-level umbrella capability, never an inferred organization role.
  if (capability.startsWith('finance.') && capabilities.includes('finance.manage')) {
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
