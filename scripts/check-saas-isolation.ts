import { promises as fs } from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

export const FINANCE_COLLECTIONS = [
  'financeSettings',
  'financeCategories',
  'financeAccounts',
  'financeEntities',
  'financeFunds',
  'financeTransactions',
  'financeAllocations',
  'financeAuditLogs',
  'financeIdempotency',
  'financeUniqueKeys',
  'financeJournalEntries',
  'financeJournalLines',
  'financeAggregates',
  'universalEvidence',
  'universalEvidenceHashes',
] as const;

const ENTITY_SENSITIVE_COLLECTIONS = [
  'financeAccounts',
  'financeFunds',
  'financeCategories',
  'financeTransactions',
  'financeAllocations',
  'financeIdempotency',
  'financeJournalEntries',
  'financeJournalLines',
  'financeAggregates',
  'universalEvidence',
  'universalEvidenceHashes',
] as const;

const AUTHORIZATION_MARKERS = [
  'resolveFinanceRequestContext',
  'requireFinanceEntityAccess',
  'requireFinanceTransactionAccess',
  'resolveEcosystemSession',
  'canManageFinanceBootstrap',
  'canManageFinanceEntities',
  'access.repository',
  'context.repository',
];

const ENTITY_SCOPE_MARKERS = [
  'resolveFinanceRequestContext',
  'requireFinanceEntityAccess',
  'requireFinanceTransactionAccess',
  'requireScopedFinanceAccount',
  'canManageFinanceEntities',
  'assertEntityIsolation',
  '.financeEntityId !== financeEntityId',
  "where('financeEntityId'",
  'where("financeEntityId"',
  'getAccountsQuery',
  'getFundsQuery',
  'getCategoriesQuery',
  'getTransactionsQuery',
  'getAllocationsQuery',
];

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function analyzeFinanceHandler(file: string, code: string): string[] {
  const violations: string[] = [];

  // Helpers are validated through the handlers that consume them. This checker is intended to
  // certify public finance handlers, not utility modules without a Vercel handler entrypoint.
  if (!code.includes('export default async function handler')) return violations;

  if (/const\s*{\s*[^}]*\borganizationId\b[^}]*}\s*=\s*(req\.body|JSON\.parse\([^)]+\))/s.test(code)) {
    violations.push(`${file}: Extracts organizationId from req.body`);
  }

  if (/\borganizationId\s*=\s*(req\.body|JSON\.parse\([^)]+\))/s.test(code)) {
    violations.push(`${file}: Assigns organizationId from req.body`);
  }

  const financeAlternation = FINANCE_COLLECTIONS.map(escapeRegex).join('|');
  const rootFinanceCollection = new RegExp(`(?:db|firestore)\\.collection\\((['"])(?:${financeAlternation})\\1\\)`);
  if (rootFinanceCollection.test(code)) {
    violations.push(`${file}: Uses a root finance collection without organization scope`);
  }

  const directOrgFinanceCollection = new RegExp(`\\.collection\\((['"])(?:${financeAlternation})\\1\\)`);
  if (directOrgFinanceCollection.test(code)) {
    const hasAuthorizationBoundary = AUTHORIZATION_MARKERS.some((marker) => code.includes(marker));
    if (!hasAuthorizationBoundary) {
      violations.push(`${file}: Direct finance collection access has no recognized authorization boundary`);
    }
  }

  const sensitiveAlternation = ENTITY_SENSITIVE_COLLECTIONS.map(escapeRegex).join('|');
  const directSensitiveCollection = new RegExp(`\\.collection\\((['"])(?:${sensitiveAlternation})\\1\\)`);
  if (directSensitiveCollection.test(code)) {
    const hasEntityScope = ENTITY_SCOPE_MARKERS.some((marker) => code.includes(marker));
    if (!hasEntityScope) {
      violations.push(`${file}: Entity-sensitive finance collection access has no recognized entity-scope guard`);
    }
  }

  // A handler that touches tenant finance data must derive organization context from a verified
  // token/shared request context, never only from a caller-controlled header.
  if (directOrgFinanceCollection.test(code)) {
    const hasTokenBoundOrganization =
      code.includes('decodedToken.mn_organization_id') ||
      code.includes('resolveFinanceRequestContext') ||
      code.includes('resolveEcosystemSession');
    if (!hasTokenBoundOrganization) {
      violations.push(`${file}: Finance access lacks a token-bound/canonical organization context`);
    }
  }

  return [...new Set(violations)];
}

export async function runSaasIsolationCheck(
  handlersDir = path.join(process.cwd(), 'server', 'vercel-handlers', 'finance'),
  fsImpl: Pick<typeof fs, 'readdir' | 'readFile'> = fs,
) {
  const files = await fsImpl.readdir(handlersDir);
  const violations: string[] = [];

  for (const fileEntry of files as any[]) {
    const file = typeof fileEntry === 'string' ? fileEntry : fileEntry.name;
    if (!file.endsWith('.ts')) continue;
    const filePath = path.join(handlersDir, file);
    const code = await fsImpl.readFile(filePath, 'utf8');
    violations.push(...analyzeFinanceHandler(file, code));
  }

  if (violations.length > 0) {
    throw new Error(`SaaS isolation certification failed with ${violations.length} violation(s):\n- ${violations.join('\n- ')}`);
  }

  console.log(`SaaS isolation checks passed across ${files.filter((entry: any) => (typeof entry === 'string' ? entry : entry.name).endsWith('.ts')).length} finance TypeScript files.`);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  runSaasIsolationCheck().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
