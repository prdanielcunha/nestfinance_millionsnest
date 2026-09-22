export type NestFinanceHandoffClaimValidation = {
  organizationId: string;
  accessSource: string | null;
};

const INVALID_HANDOFF_CLAIMS = 'HANDOFF_CLAIM_BINDING_INVALID';

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function validateNestFinanceHandoffClaims(
  claims: Record<string, unknown>,
  expectedOrganizationId?: string | null,
): NestFinanceHandoffClaimValidation {
  const appId = cleanString(claims.mn_app_id);
  const organizationId = cleanString(claims.mn_organization_id);
  const accessSource = cleanString(claims.mn_access_source) || null;
  const version = claims.mn_handoff_version;

  if (
    appId !== 'nestfinance' ||
    version !== 1 ||
    !organizationId ||
    organizationId.length > 256 ||
    organizationId === '.' ||
    organizationId === '..' ||
    organizationId.includes('/') ||
    organizationId.includes('\\') ||
    /[\x00-\x1F\x7F]/u.test(organizationId)
  ) {
    throw new Error(INVALID_HANDOFF_CLAIMS);
  }

  const expected = cleanString(expectedOrganizationId);
  if (expected && expected !== organizationId) {
    throw new Error(INVALID_HANDOFF_CLAIMS);
  }

  return { organizationId, accessSource };
}
