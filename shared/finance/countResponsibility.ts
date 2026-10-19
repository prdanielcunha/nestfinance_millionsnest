/**
 * Transitional NestFinance/Hub responsibility marker.
 *
 * This is NOT an authorization service: it classifies only capabilities
 * supplied by an already verified canonical Hub membership. The server still
 * checks tenant/entity scope and operation allowlists on every request.
 *
 * Existing finance.view + finance.create_drafts are technical grants shared by
 * legacy Count and treasury APIs. They are not treasury authority for members
 * whose Hub grants explicitly identify Count-only responsibility.
 */
import { isIndividualFinanceAccess } from './individualAccess.js';

export function explicitCountOnlyGrant(capabilities: unknown): boolean | null {
  // Malformed canonical grants must never be silently discarded: doing so
  // could turn a mixed/unknown responsibility set into an apparent Count-only set.
  if (!Array.isArray(capabilities) || capabilities.some(value => typeof value !== 'string')) return null;
  const grants: string[] = capabilities;
  if (isIndividualFinanceAccess(grants)) {
    return (grants.includes('finance.count.execute') || grants.includes('finance.count.view')) &&
      !grants.some(grant => ['*', 'finance.manage', 'finance.treasury.view'].includes(grant));
  }

  if (!grants.includes('finance.count.execute') && !grants.includes('finance.count.view')) {
    return null; // No explicit marker: preserve the conservative legacy bridge.
  }

  return grants.every((grant) =>
    grant === 'finance.view' ||
    grant === 'finance.create_drafts' ||
    // A visibility grant must not turn shared Count draft permissions into
    // authority to create treasury transactions. Count's read boundary remains.
    grant === 'finance.balance.view' ||
    grant === 'organization.manage_team' ||
    grant.startsWith('finance.count.')
  );
}

export function hasExplicitCountResponsibility(capabilities: unknown): boolean {
  return Array.isArray(capabilities) && capabilities.some(
    (value) => value === 'finance.count.execute' || value === 'finance.count.view',
  );
}

/** Team administration is not financial administration. */
export function explicitTeamOnlyGrant(capabilities: unknown): boolean {
  if (!Array.isArray(capabilities) || capabilities.some(value => typeof value !== 'string')) return false;
  const grants: string[] = capabilities;
  return grants.includes('organization.manage_team') &&
    !grants.some((grant) =>
      grant === '*' ||
      grant === 'organization.manage_entities' ||
      (grant.startsWith('finance.') && grant !== 'finance.balance.view')
    );
}
