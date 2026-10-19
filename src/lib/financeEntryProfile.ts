import type { EcosystemAccessState } from '../types/access';
import { hasEffectiveCapability } from './permissions';
import { isIndividualFinanceAccess } from '../../shared/finance/individualAccess.js';
import { explicitCountOnlyGrant, explicitTeamOnlyGrant, hasExplicitCountResponsibility } from '../../shared/finance/countResponsibility.js';

export type FinanceEntryProfile = {
  canCount: boolean;
  canFinance: boolean;
  canAccountant: boolean;
  countOnly: boolean;
  financeOnly: boolean;
  accountantOnly: boolean;
  /** Only use known role hints for narrowing UI; backend remains authoritative. */
  roleBasis: 'explicit' | 'capability_fallback';
};

function rolesOf(access: EcosystemAccessState): string[] {
  return [access.organizationRole, access.systemRole, ...(Array.isArray(access.roles) ? access.roles : [])]
    .map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
}

export function getFinanceEntryProfile(access: EcosystemAccessState | null): FinanceEntryProfile {
  const empty = { canCount: false, canFinance: false, canAccountant: false, countOnly: false,
    financeOnly: false, accountantOnly: false, roleBasis: 'capability_fallback' as const };
  if (!access) return empty;
  if (!access.isGlobalAccess && isIndividualFinanceAccess(access.capabilities)) {
    const canCount = hasEffectiveCapability(access, 'finance.count.execute') || hasEffectiveCapability(access, 'finance.count.view');
    const canFinance = hasEffectiveCapability(access, 'finance.treasury.view');
    const canAccountant = hasEffectiveCapability(access, 'finance.accountant.view_exports');
    return { canCount, canFinance, canAccountant, countOnly: canCount && !canFinance && !canAccountant,
      financeOnly: canFinance && !canCount && !canAccountant, accountantOnly: canAccountant && !canFinance && !canCount, roleBasis: 'explicit' };
  }
  const countGrant = explicitCountOnlyGrant(access.capabilities);
  const teamOnly = explicitTeamOnlyGrant(access.capabilities);
  const explicitCount = hasExplicitCountResponsibility(access.capabilities);
  const roles = rolesOf(access);
  const roleIs = (...words: string[]) => roles.some(role => words.some(word => role.includes(word)));
  const isAdmin = access.isGlobalAccess || (!teamOnly &&
    roleIs('owner', 'admin', 'administrador')) ||
    hasEffectiveCapability(access, 'finance.manage') ||
    hasEffectiveCapability(access, 'organization.manage_entities');
  const countRole = roleIs('volunteer', 'voluntario', 'voluntário', 'conferente', 'contagem', 'count_team', 'counting_team', 'equipe_contagem');
  const treasuryRole = roleIs('treasurer', 'tesoureiro', 'tesouraria', 'financeiro', 'finance_team');
  const accountantRole = roleIs('accountant', 'contador', 'contabil', 'contábil', 'accounting');
  const canView = hasEffectiveCapability(access, 'finance.view');
  const canDraft = hasEffectiveCapability(access, 'finance.create_drafts');
  const hasTreasuryPowers = hasEffectiveCapability(access, 'finance.review') ||
    hasEffectiveCapability(access, 'finance.approve_for_posting') ||
    hasEffectiveCapability(access, 'finance.post_transactions');
  const hasDedicatedCountAccess = explicitCount && (
    hasEffectiveCapability(access, 'finance.count.execute') ||
    hasEffectiveCapability(access, 'finance.count.view')
  );
  const canCount = !teamOnly && (hasDedicatedCountAccess ||
    (canView && canDraft && (explicitCount || countRole || isAdmin || (!treasuryRole && !accountantRole))));
  const explicitlyCountOnly = countGrant === true || (countRole && !treasuryRole && !accountantRole && !isAdmin && !hasTreasuryPowers);
  // create_drafts is shared by Count and transactions. Do not mistake this
  // capability alone for a financial-operations role if Count is explicitly assigned.
  const canFinance = !teamOnly && canView && !explicitlyCountOnly && (isAdmin || treasuryRole ||
    hasTreasuryPowers || (canDraft && !countRole && !accountantRole));
  const canAccountant = !teamOnly && canView && !explicitlyCountOnly && (accountantRole || isAdmin || hasEffectiveCapability(access, 'finance.accountant.view_exports'));
  const accountantOnly = accountantRole && !isAdmin && !countRole && !treasuryRole &&
    !hasTreasuryPowers && !canDraft && canView;
  return {
    canCount,
    canFinance,
    canAccountant,
    countOnly: canCount && !canFinance && !canAccountant,
    financeOnly: canFinance && !canCount && !canAccountant,
    accountantOnly,
    roleBasis: explicitCount || countRole || treasuryRole || accountantRole || isAdmin ? 'explicit' : 'capability_fallback',
  };
}
