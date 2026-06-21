import { EcosystemAccessState } from "../types/access";

export function canManageFinanceEntities(accessState: EcosystemAccessState): boolean {
  if (accessState.isGlobalAccess) {
    return true;
  }
  
  if (accessState.capabilities?.includes('organization.manage_entities')) {
    return true;
  }
  
  return false;
}
