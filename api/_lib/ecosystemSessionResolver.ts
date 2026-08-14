import { getFirebaseAdmin } from './firebaseAdmin.js';

const CANONICAL_GLOBAL_ROLES = ['ceo', 'global_admin', 'ecosystem_owner', 'founder'] as const;
const NESTFINANCE_DEVELOPMENT_SYSTEM_ROLES = ['ceo', 'global_admin', 'ecosystem_owner'] as const;

export const ECOSYSTEM_SESSION_DENIAL_REASONS = {
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_INACTIVE: 'USER_INACTIVE',
  ORGANIZATION_NOT_FOUND: 'ORGANIZATION_NOT_FOUND',
  ORGANIZATION_INACTIVE: 'ORGANIZATION_INACTIVE',
  MEMBERSHIP_NOT_FOUND: 'MEMBERSHIP_NOT_FOUND',
  MEMBERSHIP_INACTIVE: 'MEMBERSHIP_INACTIVE',
  APP_NOT_ENABLED: 'APP_NOT_ENABLED',
  ENTITLEMENT_NOT_CONFIGURED: 'ENTITLEMENT_NOT_CONFIGURED',
  MEMBER_APP_ACCESS_DISABLED: 'MEMBER_APP_ACCESS_DISABLED',
  NESTFINANCE_DEVELOPMENT_ACCESS_RESTRICTED: 'NESTFINANCE_DEVELOPMENT_ACCESS_RESTRICTED',
} as const;

export interface EcosystemOrganizationSummary {
  id: string;
  name: string;
  slug: string;
  logoPath: string | null;
}

export interface EcosystemProfileSummary {
  displayName: string;
  photoURL: string | null;
}

export interface EcosystemFinanceSetupSummary {
  status: string;
}

interface EcosystemSessionBase {
  granted: boolean;
  organizationId: string;
  isGlobalAccess: boolean;
  accessSource: string;
  systemRole?: string;
  organizationRole?: string;
  roles: string[];
  permissions: string[];
  capabilities: string[];
  scopes: Record<string, string[]>;
}

export interface GrantedEcosystemSession extends EcosystemSessionBase {
  granted: true;
  organization: EcosystemOrganizationSummary;
  profile: EcosystemProfileSummary;
  financeSetup: EcosystemFinanceSetupSummary;
  denialReason?: never;
}

export interface DeniedEcosystemSession extends EcosystemSessionBase {
  granted: false;
  accessSource: 'denied';
  isGlobalAccess: false;
  denialReason: string;
  organization?: never;
  profile?: never;
  financeSetup?: never;
}

export type EcosystemSessionResolution = GrantedEcosystemSession | DeniedEcosystemSession;

export function isValidIanaTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch (e) {
    return false;
  }
}

function isCanonicalGlobalRole(systemRole: unknown): boolean {
  return typeof systemRole === 'string' && (CANONICAL_GLOBAL_ROLES as readonly string[]).includes(systemRole);
}

function canAccessNestFinanceDevelopment(systemRole: unknown): boolean {
  return typeof systemRole === 'string' && (NESTFINANCE_DEVELOPMENT_SYSTEM_ROLES as readonly string[]).includes(systemRole);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asScopes(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const result: Record<string, string[]> = {};
  for (const [key, entries] of Object.entries(value as Record<string, unknown>)) {
    result[key] = asStringArray(entries);
  }
  return result;
}

function denied(
  orgId: string,
  denialReason: string,
  systemRole?: string,
  organizationRole?: string
): DeniedEcosystemSession {
  return {
    granted: false,
    organizationId: orgId,
    isGlobalAccess: false,
    accessSource: 'denied',
    systemRole,
    organizationRole,
    roles: [],
    permissions: [],
    capabilities: [],
    scopes: {},
    denialReason,
  };
}

async function resolveFinanceSetupStatus(db: any, orgId: string): Promise<string> {
  let status = 'not_started';
  try {
    const configDoc = await db.collection('organizations').doc(orgId).collection('financeSettings').doc('config').get();
    status = configDoc.exists ? 'configured' : 'not_configured';
  } catch (e) {
    // Session authorization must not become permissive because setup metadata failed.
  }
  return status;
}

export async function resolveEcosystemSession(uid: string, orgId: string): Promise<EcosystemSessionResolution> {
  const admin = getFirebaseAdmin();
  const db = admin.firestore;

  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) {
    return denied(orgId, ECOSYSTEM_SESSION_DENIAL_REASONS.USER_NOT_FOUND);
  }

  const userData = userDoc.data() || {};
  if (
    userData.status === 'inactive' ||
    userData.status === 'suspended' ||
    userData.status === 'disabled' ||
    userData.disabled === true
  ) {
    return denied(orgId, ECOSYSTEM_SESSION_DENIAL_REASONS.USER_INACTIVE);
  }

  // Canonical Hub contract: only systemRole can convey ecosystem-global authority.
  const systemRole = typeof userData.systemRole === 'string' ? userData.systemRole : undefined;

  const orgDoc = await db.collection('organizations').doc(orgId).get();
  if (!orgDoc.exists) {
    return denied(orgId, ECOSYSTEM_SESSION_DENIAL_REASONS.ORGANIZATION_NOT_FOUND, systemRole);
  }

  const orgData = orgDoc.data() || {};
  if (
    orgData.status === 'archived' ||
    orgData.status === 'inactive' ||
    orgData.status === 'suspended' ||
    orgData.status === 'disabled' ||
    orgData.disabled === true
  ) {
    return denied(orgId, ECOSYSTEM_SESSION_DENIAL_REASONS.ORGANIZATION_INACTIVE, systemRole);
  }

  // Current MillionsNest policy intentionally restricts NestFinance while it is in development.
  if (!canAccessNestFinanceDevelopment(systemRole)) {
    return denied(
      orgId,
      ECOSYSTEM_SESSION_DENIAL_REASONS.NESTFINANCE_DEVELOPMENT_ACCESS_RESTRICTED,
      systemRole
    );
  }

  const common = {
    organization: {
      id: orgId,
      name: orgData.name || '',
      slug: orgData.slug || '',
      logoPath: orgData.logoPath || null,
    },
    profile: {
      displayName: userData.displayName || '',
      photoURL: userData.photoURL || null,
    },
    financeSetup: {
      status: await resolveFinanceSetupStatus(db, orgId),
    },
  };

  if (isCanonicalGlobalRole(systemRole)) {
    return {
      granted: true,
      organizationId: orgId,
      isGlobalAccess: true,
      accessSource: 'global_system_role',
      systemRole,
      organizationRole: undefined,
      roles: systemRole ? [systemRole] : [],
      permissions: ['*'],
      capabilities: ['*'],
      scopes: { '*': ['*'] },
      ...common,
    };
  }

  // Kept aligned with the Hub contract for the moment the development gate is widened.
  // Legacy /users membership and root organization_members are deliberately not authorization sources.
  const memberDoc = await db.collection('organizations').doc(orgId).collection('members').doc(uid).get();
  if (!memberDoc.exists) {
    return denied(orgId, ECOSYSTEM_SESSION_DENIAL_REASONS.MEMBERSHIP_NOT_FOUND, systemRole);
  }

  const memberData = memberDoc.data() || {};
  if (
    memberData.enabled === false ||
    memberData.status === 'inactive' ||
    memberData.status === 'suspended' ||
    memberData.status === 'disabled' ||
    memberData.status === 'removed' ||
    memberData.status === 'revoked' ||
    memberData.status === 'archived'
  ) {
    return denied(orgId, ECOSYSTEM_SESSION_DENIAL_REASONS.MEMBERSHIP_INACTIVE, systemRole);
  }

  const organizationRole = memberData.role || memberData.organizationRole || 'member';
  const enabledApps = Array.isArray(orgData.enabledApps) ? orgData.enabledApps : [];
  if (!enabledApps.includes('nestfinance')) {
    return denied(orgId, ECOSYSTEM_SESSION_DENIAL_REASONS.APP_NOT_ENABLED, systemRole, organizationRole);
  }

  const entitlement = orgData.entitlements?.nestfinance;
  if (!(entitlement?.active === true || entitlement?.status === 'active')) {
    return denied(
      orgId,
      ECOSYSTEM_SESSION_DENIAL_REASONS.ENTITLEMENT_NOT_CONFIGURED,
      systemRole,
      organizationRole
    );
  }

  const nestFinanceAccess = memberData.appAccess?.nestFinance;
  if (nestFinanceAccess?.enabled !== true) {
    return denied(
      orgId,
      ECOSYSTEM_SESSION_DENIAL_REASONS.MEMBER_APP_ACCESS_DISABLED,
      systemRole,
      organizationRole
    );
  }

  const permissions = asStringArray(nestFinanceAccess.permissions);
  const roles = asStringArray(nestFinanceAccess.roles);
  const scopes = asScopes(nestFinanceAccess.scopes);

  return {
    granted: true,
    organizationId: orgId,
    isGlobalAccess: false,
    accessSource: 'organization_membership',
    systemRole,
    organizationRole,
    roles,
    permissions,
    // Compatibility only: callers must not treat a separate legacy membership field as authoritative.
    capabilities: [...permissions],
    scopes,
    ...common,
  };
}
