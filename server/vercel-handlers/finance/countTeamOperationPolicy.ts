/**
 * Server-side role barrier for treasury mutations and sensitive reads until dedicated Hub capabilities
 * finance.count.* and finance.treasury.* are issued canonically.
 *
 * The session argument MUST come from resolveEcosystemSession after verified Firebase auth.
 * Operation MUST be set by the canonical finance gateway, not from request body/query.
 * This is a restrictive compatibility bridge, not a replacement for per-entity RBAC.
 */
type CanonicalFinanceSession = {
  granted?: boolean;
  isGlobalAccess?: boolean;
  organizationRole?: unknown;
  systemRole?: unknown;
  roles?: unknown;
  permissions?: unknown;
  capabilities?: unknown;
};

const roles = (session: CanonicalFinanceSession) => [
  session.organizationRole, session.systemRole,
  ...(Array.isArray(session.roles) ? session.roles : []),
].map(x => String(x || '').trim().toLowerCase()).filter(Boolean);

const containsRole = (values: string[], words: string[]) =>
  values.some(value => words.some(word => value.includes(word)));

export function isExplicitCountOnlySession(session: CanonicalFinanceSession): boolean {
  if (!session?.granted || session.isGlobalAccess) return false;
  const role = roles(session);
  if (containsRole(role, ['owner', 'admin', 'administrador', 'treasurer', 'tesoureiro', 'tesouraria', 'financeiro', 'finance_team', 'accountant', 'contador', 'contabil', 'contábil', 'accounting'])) return false;
  if (!containsRole(role, ['count_team', 'counting_team', 'equipe_contagem', 'contagem', 'conferente', 'volunteer', 'voluntario', 'voluntário'])) return false;
  const permissions = Array.isArray(session.permissions)
    ? session.permissions
    : Array.isArray(session.capabilities) ? session.capabilities : [];
  if (permissions.some(p => typeof p === 'string' && (
    p === '*' || p === 'finance.manage' || p === 'finance.review' ||
    p === 'finance.approve_for_posting' || p === 'finance.post_transactions' ||
    p === 'finance.accountant.view_exports' || p === 'organization.manage_entities' ||
    p === 'finance.accounts.manage' || p === 'finance.accounts.repair' ||
    p === 'finance.funds.manage' || p === 'finance.categories.manage'
  ))) return false;
  return true;
}

const COUNT_OPERATIONS = [
  'count-sessions-', 'count-captures-', 'count-free-form-captures-', 'count-paper-forms-',
];
const COUNT_SHARED_NONPOSTING_OPERATIONS = new Set(['voice-transcription-create', 'journey-metrics-record']);
const COUNT_OPERATIONS_REQUIRING_TREASURY = new Set(['count-sessions-create-proposed-drafts']);

export function isAllowedCountTeamDraftOperation(operation: unknown): boolean {
  if (typeof operation !== 'string') return false;
  if (COUNT_OPERATIONS_REQUIRING_TREASURY.has(operation)) return false;
  return COUNT_SHARED_NONPOSTING_OPERATIONS.has(operation) ||
    COUNT_OPERATIONS.some(prefix => operation.startsWith(prefix));
}

/** Fail closed for count-only workers when a generic draft capability is shared. */
export function assertCountTeamDraftBoundary(session: CanonicalFinanceSession, operation: unknown) {
  if (!isExplicitCountOnlySession(session)) return;
  if (!isAllowedCountTeamDraftOperation(operation)) {
    throw { status: 403, error: 'FORBIDDEN_TREASURY_ROLE_REQUIRED' };
  }
}

/**
 * A Count-only member can read the counting artifacts needed for their
 * assignment, not treasury accounts, balances, transactions, reports,
 * reconciliation or the accountant package. Keep this a finite allowlist:
 * new finance.view endpoints fail closed until explicitly reviewed.
 *
 * The Count proposal preview intentionally remains treasury-only: it fetches
 * accounts, funds and categories, unlike the session/capture read models.
 */
const COUNT_READ_OPERATIONS = new Set([
  'count-sessions-list',
  'count-sessions-detail',
  'count-paper-forms-detail',
  'count-captures-detail',
]);

export function isAllowedCountTeamReadOperation(operation: unknown): boolean {
  return typeof operation === 'string' && COUNT_READ_OPERATIONS.has(operation);
}

/** Role restriction in addition to, never instead of, canonical tenant/entity authorization. */
export function assertCountTeamReadBoundary(session: CanonicalFinanceSession, operation: unknown) {
  if (!isExplicitCountOnlySession(session)) return;
  if (!isAllowedCountTeamReadOperation(operation)) {
    throw { status: 403, error: 'FORBIDDEN_TREASURY_ROLE_REQUIRED' };
  }
}
