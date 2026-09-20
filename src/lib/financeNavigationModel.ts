import type { FinanceExperienceMode } from './financeExperience';

export type FinanceNavigationId =
  | 'finance'
  | 'transactions'
  | 'count'
  | 'inbox'
  | 'review'
  | 'balance'
  | 'reports'
  | 'audit'
  | 'settings';

export type FinanceNavigationAuthority = {
  canView: boolean;
  canCreate: boolean;
  canReview: boolean;
  canManage: boolean;
};

export type FinanceNavigationProfile = {
  primary: FinanceNavigationId[];
  more: FinanceNavigationId[];
};

const PROFILE_ORDER: Record<FinanceExperienceMode, FinanceNavigationProfile> = {
  ecosystem: {
    primary: ['finance', 'count', 'inbox', 'review'],
    more: ['transactions', 'balance', 'reports', 'audit', 'settings'],
  },
  organization_admin: {
    primary: ['finance', 'count', 'inbox', 'review'],
    more: ['transactions', 'balance', 'reports', 'audit', 'settings'],
  },
  review: {
    primary: ['finance', 'review', 'inbox', 'transactions'],
    more: ['balance', 'reports', 'audit'],
  },
  operation: {
    primary: ['finance', 'transactions', 'inbox', 'count'],
    more: [],
  },
  read_only: {
    primary: ['finance', 'transactions', 'balance', 'reports'],
    more: ['audit'],
  },
};

function isNavigationItemAvailable(
  id: FinanceNavigationId,
  authority: FinanceNavigationAuthority,
) {
  if (id === 'finance') return true;
  if (id === 'review') return authority.canReview;
  if (id === 'settings') return authority.canManage;
  if (id === 'count') return authority.canView && authority.canCreate;
  if (id === 'inbox') return authority.canView || authority.canCreate || authority.canReview;
  return authority.canView;
}

export function buildFinanceNavigation(
  mode: FinanceExperienceMode,
  authority: FinanceNavigationAuthority,
): FinanceNavigationProfile {
  const profile = PROFILE_ORDER[mode];
  const primary = profile.primary.filter((id) => isNavigationItemAvailable(id, authority));
  const primarySet = new Set(primary);
  const more = profile.more.filter(
    (id) => !primarySet.has(id) && isNavigationItemAvailable(id, authority),
  );

  return { primary, more };
}
