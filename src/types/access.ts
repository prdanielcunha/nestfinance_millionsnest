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
  accessSource?: 'global_system_role' | 'organization_membership';
};
