import type { EcosystemAccessState } from '../types/access';
import { hasEffectiveCapability } from './permissions';

export type FinanceExperienceMode =
  | 'ecosystem'
  | 'organization_admin'
  | 'review'
  | 'operation'
  | 'read_only';

export function getFinanceExperienceMode(accessState: EcosystemAccessState | null): FinanceExperienceMode {
  if (!accessState) return 'read_only';
  if (accessState.isGlobalAccess) return 'ecosystem';

  const organizationRole = String(accessState.organizationRole || '').toLowerCase();
  if (
    organizationRole === 'owner' ||
    organizationRole === 'admin' ||
    hasEffectiveCapability(accessState, 'finance.manage') ||
    hasEffectiveCapability(accessState, 'organization.manage_entities')
  ) {
    return 'organization_admin';
  }

  if (
    hasEffectiveCapability(accessState, 'finance.review') ||
    hasEffectiveCapability(accessState, 'finance.approve_for_posting')
  ) {
    return 'review';
  }

  if (
    hasEffectiveCapability(accessState, 'finance.create_drafts') ||
    hasEffectiveCapability(accessState, 'finance.submit_for_review')
  ) {
    return 'operation';
  }

  return 'read_only';
}
