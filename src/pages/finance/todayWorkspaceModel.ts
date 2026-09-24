import type { FinanceExperienceMode } from '@/src/lib/financeExperience';

export type TodayWorkspaceTaskKind =
  | 'returned_corrections'
  | 'drafts'
  | 'transaction_review'
  | 'approved'
  | 'inbox_identification'
  | 'inbox_review'
  | 'count_divergence'
  | 'count_check';

export type TodayWorkspaceShortcutKind =
  | 'transactions'
  | 'new_transaction'
  | 'capture'
  | 'count'
  | 'review'
  | 'inbox'
  | 'reports'
  | 'balance'
  | 'audit'
  | 'settings';

export type TodayWorkspaceSnapshot = {
  returnedCorrections: number;
  drafts: number;
  readyForReview: number;
  approvedForPosting: number;
  inboxNeedsClassification: number;
  inboxPendingReview: number;
  countDivergences: number;
  countChecks: number;
};

export type TodayWorkspaceAuthority = {
  canView: boolean;
  canCreate: boolean;
  canReview: boolean;
  canApprove: boolean;
  canManage: boolean;
  canClassifyInbox: boolean;
  canReviewInbox: boolean;
  canCount: boolean;
};

export type TodayWorkspaceTask = {
  kind: TodayWorkspaceTaskKind;
  count: number;
};

export type TodayWorkspaceDefinition = {
  mode: FinanceExperienceMode;
  tasks: TodayWorkspaceTask[];
  shortcuts: TodayWorkspaceShortcutKind[];
};

function positive(kind: TodayWorkspaceTaskKind, count: number): TodayWorkspaceTask | null {
  return count > 0 ? { kind, count } : null;
}

function compact(items: Array<TodayWorkspaceTask | null>) {
  return items.filter((item): item is TodayWorkspaceTask => Boolean(item));
}

export function buildTodayWorkspace(
  mode: FinanceExperienceMode,
  snapshot: TodayWorkspaceSnapshot,
  authority: TodayWorkspaceAuthority,
): TodayWorkspaceDefinition {
  if (!authority.canView) {
    return { mode, tasks: [], shortcuts: [] };
  }

  const adminTasks = compact([
    authority.canReview ? positive('transaction_review', snapshot.readyForReview) : null,
    authority.canReviewInbox ? positive('inbox_review', snapshot.inboxPendingReview) : null,
    authority.canCount ? positive('count_divergence', snapshot.countDivergences) : null,
    authority.canCreate ? positive('returned_corrections', snapshot.returnedCorrections) : null,
    authority.canCreate ? positive('drafts', snapshot.drafts) : null,
    authority.canClassifyInbox ? positive('inbox_identification', snapshot.inboxNeedsClassification) : null,
    authority.canCount ? positive('count_check', snapshot.countChecks) : null,
    authority.canApprove ? positive('approved', snapshot.approvedForPosting) : null,
  ]);

  if (mode === 'ecosystem' || mode === 'organization_admin') {
    return {
      mode,
      tasks: adminTasks.slice(0, 3),
      shortcuts: [
        'transactions',
        'reports',
        'audit',
        ...(authority.canManage ? (['settings'] as const) : []),
      ],
    };
  }

  if (mode === 'review') {
    return {
      mode,
      tasks: compact([
        authority.canReview ? positive('transaction_review', snapshot.readyForReview) : null,
        authority.canReviewInbox ? positive('inbox_review', snapshot.inboxPendingReview) : null,
        authority.canApprove ? positive('approved', snapshot.approvedForPosting) : null,
      ]).slice(0, 3),
      shortcuts: ['review', 'inbox', 'reports', 'transactions'],
    };
  }

  if (mode === 'operation') {
    return {
      mode,
      tasks: compact([
        authority.canCreate ? positive('returned_corrections', snapshot.returnedCorrections) : null,
        authority.canCreate ? positive('drafts', snapshot.drafts) : null,
        authority.canClassifyInbox ? positive('inbox_identification', snapshot.inboxNeedsClassification) : null,
        authority.canCount ? positive('count_divergence', snapshot.countDivergences) : null,
        authority.canCount ? positive('count_check', snapshot.countChecks) : null,
      ]).slice(0, 3),
      shortcuts: [
        ...(authority.canCreate ? (['new_transaction', 'capture'] as const) : []),
        ...(authority.canCount ? (['count'] as const) : []),
        'transactions',
      ],
    };
  }

  return {
    mode,
    tasks: [],
    shortcuts: ['transactions', 'balance', 'reports', 'audit'],
  };
}
