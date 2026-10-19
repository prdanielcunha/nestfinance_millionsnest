import { EcosystemAccessState } from "../types/access";
import { individualFinanceCapability } from '../../shared/finance/individualAccess.js';
import { isIndividualFinanceAccess } from '../../shared/finance/individualAccess.js';

export function canExecuteCount(accessState: EcosystemAccessState | null): boolean {
  return hasEffectiveCapability(accessState, 'finance.count.execute') ||
    (!isIndividualFinanceAccess(accessState?.capabilities) && hasEffectiveCapability(accessState, 'finance.create_drafts'));
}
import { explicitCountOnlyGrant, explicitTeamOnlyGrant } from '../../shared/finance/countResponsibility.js';

export function canManageFinanceEntities(accessState: EcosystemAccessState): boolean {
  return hasEffectiveCapability(accessState, 'organization.manage_entities');
}

export function hasEffectiveCapability(accessState: EcosystemAccessState | null, capability: string): boolean {
  if (!accessState) return false;
  if (accessState.isGlobalAccess) return true;
  const individual = individualFinanceCapability(accessState.capabilities, capability);
  if (individual !== undefined) return individual;

  if (
    explicitTeamOnlyGrant(accessState.capabilities) &&
    (capability.startsWith('finance.') || capability === 'organization.manage_entities')
  ) return false;

  // UI adapts to the same signed Hub responsibility classification as the
  // server. This is a display restriction only; API authorization is mandatory.
  if (
    explicitCountOnlyGrant(accessState.capabilities) === true &&
    (capability.startsWith('finance.') || capability === 'organization.manage_entities') &&
    !['finance.view', 'finance.create_drafts', 'finance.count.execute', 'finance.count.view'].includes(capability)
  ) return false;

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
