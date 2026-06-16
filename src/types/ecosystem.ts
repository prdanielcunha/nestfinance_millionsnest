export type EcosystemSystemRole =
  | 'user'
  | 'support'
  | 'global_admin'
  | 'ecosystem_owner'
  | 'founder';

export type MembershipStatus =
  | 'invited'
  | 'active'
  | 'suspended'
  | 'disabled'
  | 'removed';

export type OrganizationRole =
  | 'owner'
  | 'admin'
  | 'member'
  | 'guest';

export type NestFinanceAccess = {
  enabled: boolean;
  roles: string[];
  permissions: string[];
  scopes?: {
    accountIds?: string[];
    fundIds?: string[];
    costCenterIds?: string[];
    congregationIds?: string[];
  };
  restrictions?: {
    canViewPrivateContributions?: boolean;
    maximumApprovalAmountCents?: number;
  };
};

export type OrganizationMembership = {
  uid: string;
  organizationId: string;
  status: MembershipStatus;
  organizationRole: OrganizationRole;
  title?: string;
  appAccess?: {
    musicScale?: unknown;
    nestFinance?: NestFinanceAccess;
  };
  version: number;
};
