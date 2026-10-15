import type { EcosystemAccessState } from '../types/access';
import { hasEffectiveCapability } from './permissions';

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
  const roles = rolesOf(access);
  const roleIs = (...words: string[]) => roles.some(role => words.some(word => role.includes(word)));
  const isAdmin = access.isGlobalAccess ||
    roleIs('owner', 'admin', 'administrador') ||
    hasEffectiveCapability(access, 'finance.manage') ||
    hasEffectiveCapability(access, 'organization.manage_entities');
  const countRole = roleIs('volunteer', 'voluntario', 'voluntário', 'conferente', 'count_team', 'counting_team', 'equipe_contagem');
  const treasuryRole = roleIs('treasurer', 'tesoureiro', 'tesouraria', 'financeiro', 'finance_team');
  const accountantRole = roleIs('accountant', 'contador', 'contabil', 'contábil', 'accounting');
  const canView = hasEffectiveCapability(access, 'finance.view');
  const canDraft = hasEffectiveCapability(access, 'finance.create_drafts');
  const hasTreasuryPowers = hasEffectiveCapability(access, 'finance.review') ||
    hasEffectiveCapability(access, 'finance.approve_for_posting') ||
    hasEffectiveCapability(access, 'finance.post_transactions');
  const canCount = canView && canDraft && (countRole || isAdmin || treasuryRole || !accountantRole);
  const explicitlyCountOnly = countRole && !treasuryRole && !accountantRole && !isAdmin && !hasTreasuryPowers;
  // create_drafts is shared by Count and transactions. Do not mistake this
  // capability alone for a financial-operations role if Count is explicitly assigned.
  const canFinance = canView && !explicitlyCountOnly && (isAdmin || treasuryRole ||
    hasTreasuryPowers || (canDraft && !countRole && !accountantRole));
  const canAccountant = canView && (accountantRole || treasuryRole || isAdmin || hasTreasuryPowers);
  const accountantOnly = accountantRole && !isAdmin && !countRole && !treasuryRole &&
    !hasTreasuryPowers && !canDraft && canView;
  return {
    canCount,
    canFinance,
    canAccountant,
    countOnly: canCount && !canFinance && !canAccountant,
    financeOnly: canFinance && !canCount && !canAccountant,
    accountantOnly,
    roleBasis: countRole || treasuryRole || accountantRole || isAdmin ? 'explicit' : 'capability_fallback',
  };
}
