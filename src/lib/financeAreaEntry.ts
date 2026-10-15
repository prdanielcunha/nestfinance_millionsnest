import type { EcosystemAccessState } from '@/src/types/access';
import { hasEffectiveCapability } from './permissions';

/**
 * Presentation-only entry policy based on the already resolved ecosystem roles
 * and capabilities. It never grants access or replaces server-side permissions.
 * Count uses the existing finance.view + finance.create_drafts contract.
 */
export type FinanceArea = 'count' | 'treasury' | 'accountant';

export type FinanceAreaEntry = {
  count: boolean;
  treasury: boolean;
  accountant: boolean;
  preferred: FinanceArea | null;
  directEntry: boolean;
  countOnlyRoleHint: boolean;
};

function tokens(access: EcosystemAccessState): string[] {
  const values = [access.organizationRole, ...(access.roles || [])];
  return values.flatMap((value) =>
    String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .split(/_+/)
      .filter(Boolean),
  );
}

export function resolveFinanceAreaEntry(access: EcosystemAccessState | null): FinanceAreaEntry {
  const none: FinanceAreaEntry = { count: false, treasury: false, accountant: false, preferred: null, directEntry: false, countOnlyRoleHint: false };
  if (!access || access.status !== 'granted') return none;
  const view = hasEffectiveCapability(access, 'finance.view');
  const create = hasEffectiveCapability(access, 'finance.create_drafts');
  const review = hasEffectiveCapability(access, 'finance.review') ||
    hasEffectiveCapability(access, 'finance.approve_for_posting');
  const manage = hasEffectiveCapability(access, 'finance.manage') ||
    hasEffectiveCapability(access, 'organization.manage_entities');
  const roleTokens = new Set(tokens(access));
  const roleHas = (...words: string[]) => words.some((word) => roleTokens.has(word));
  const countRole = roleHas('conferente', 'contagem', 'counting', 'counter');
  const accountantRole = roleHas('contador', 'contabil', 'contabilidade', 'accountant', 'accounting');
  const treasuryRole = roleHas('tesoureiro', 'tesouraria', 'treasurer', 'treasury', 'financeiro', 'finance') ||
    roleHas('owner', 'admin', 'administrador');
  const countOnlyRoleHint = countRole && !treasuryRole && !accountantRole && !review && !manage && !access.isGlobalAccess;
  const accountantOnly = accountantRole && !countRole && !treasuryRole && !manage && !access.isGlobalAccess;
  const treasuryOnly = treasuryRole && !countRole && !accountantRole && !manage && !access.isGlobalAccess;
  // Existing finance.create_drafts is shared with Count; role hints narrow the
  // displayed landing choices but cannot restrict the underlying financial API.
  const count = view && create &&
    (countRole || manage || access.isGlobalAccess === true || (!treasuryRole && !accountantRole));
  const treasury = view && !countOnlyRoleHint && !accountantOnly;
  const accountant = view && accountantRole;
  const preferred = countOnlyRoleHint && count
    ? 'count'
    : accountantOnly && accountant
      ? 'accountant'
      : treasury
        ? 'treasury'
        : count
          ? 'count'
          : null;
  const directEntry = (countOnlyRoleHint && count) || (accountantOnly && accountant) || (treasuryOnly && treasury);
  return { count, treasury, accountant, preferred, directEntry, countOnlyRoleHint };
}
