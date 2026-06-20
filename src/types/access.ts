export type AccessStatus =
  | 'initializing'
  | 'unauthenticated'
  | 'authenticated_unresolved'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'error';

export type EcosystemAccessState = {
  status: AccessStatus;
  organizationId?: string;
  isGlobalAccess?: boolean;
  accessSource?: 'global_system_role' | 'global_role' | 'organization_membership';
  organization?: {
    id: string;
    name: string;
    slug?: string;
    logoPath?: string;
  };
  profile?: {
    displayName: string;
    photoURL?: string;
  };
  financeSetup?: {
    status: 'not_configured' | 'configured';
  };
};
