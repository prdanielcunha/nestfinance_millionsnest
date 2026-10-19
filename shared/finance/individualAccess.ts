/** Opt-in contract issued only by the canonical Hub member-access command. */
export const INDIVIDUAL_FINANCE_ACCESS = 'finance.access.individual_v1';

export function isIndividualFinanceAccess(grants: unknown): boolean {
  return Array.isArray(grants) && grants.every(value => typeof value === 'string') &&
    grants.includes(INDIVIDUAL_FINANCE_ACCESS);
}

/** Undefined keeps existing memberships on their certified legacy policy. */
export function individualFinanceCapability(grants: unknown, capability: string): boolean | undefined {
  if (!isIndividualFinanceAccess(grants)) return undefined;
  const permissions = grants as string[];
  return permissions.includes('*') || permissions.includes(capability) ||
    (capability.startsWith('finance.') && permissions.includes('finance.manage'));
}
