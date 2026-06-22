import { EcosystemAccessState } from "../types/access";

export function canManageFinanceEntities(accessState: EcosystemAccessState): boolean {
  return hasEffectiveCapability(accessState, 'organization.manage_entities');
}

export function hasEffectiveCapability(accessState: EcosystemAccessState | null, capability: string): boolean {
  if (!accessState) return false;
  if (accessState.isGlobalAccess) return true;
  return accessState.capabilities?.includes(capability) ?? false;
}
