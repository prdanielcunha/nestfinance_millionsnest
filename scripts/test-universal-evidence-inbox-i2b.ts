import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [routes, router, inbox, detail, copy, service, handler, gateway, contracts] = await Promise.all([
  read('src/app/router/routes.ts'),
  read('src/app/router/index.tsx'),
  read('src/pages/finance/InboxPage.tsx'),
  read('src/pages/finance/inbox/UniversalEvidenceDetailPage.tsx'),
  read('src/pages/finance/inbox/inboxCopy.ts'),
  read('src/services/universalEvidenceInboxService.ts'),
  read('server/vercel-handlers/finance/universalEvidenceDetail.ts'),
  read('api/finance-gateway.ts'),
  read('scripts/check-api-contracts.mjs'),
]);

let passed = 0;
const check = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log(`✅ ${message}`);
};

check(routes.includes("inboxEvidenceDetail: '/finance/inbox/:evidenceId'"), 'canonical Inbox evidence detail route exists');
check(router.includes('UniversalEvidenceDetailPage') && router.includes('APP_ROUTES.inboxEvidenceDetail'), 'detail page is lazy-routed');
check(inbox.includes('copy.openDetail') && inbox.includes("replace(':evidenceId', item.evidenceId)"), 'Inbox queue exposes an explicit localized detail action');
check(detail.includes("hasEffectiveCapability(accessState, 'finance.view')"), 'detail frontend fails closed without finance.view');
check(handler.includes("resolveFinanceRequestContext(req, 'finance.view')"), 'detail backend requires finance.view server-side');
check(handler.includes("collection('financeEntities')") && handler.includes("collection('universalEvidence')"), 'detail lookup stays under canonical organization and finance entity');
check(handler.includes("data?.organizationId !== organizationId") && handler.includes("data?.financeEntityId !== financeEntityId"), 'detail has defensive tenant/entity document validation');
check(service.includes('operation=universal-evidence-detail') && service.includes('financeEntityId, evidenceId'), 'frontend detail uses the existing authenticated finance gateway');
check(gateway.includes("case 'universal-evidence-detail'") && contracts.includes("operation: 'universal-evidence-detail'"), 'detail gateway operation is modeled and certified');
check(detail.includes('epochRef') && detail.includes('epoch !== epochRef.current'), 'stale detail responses are ignored after context changes');
check(detail.includes('role="alert"') && detail.includes('copy.retry') && detail.includes('copy.supportCode'), 'detail has recoverable human-safe error state');
check(copy.includes("fileSize: 'Tamanho'") && copy.includes("fileSize: 'Size'") && copy.includes("fileSize: 'Tamaño'"), 'file metadata labels are localized in PT/EN/ES');
check(copy.includes('Nenhuma ação contábil foi executada') && copy.includes('No accounting action was performed') && copy.includes('No se realizó ninguna acción contable'), 'read-only accounting boundary is explicit in all three languages');
check(handler.includes('verification: {') && handler.includes('contentHashVerified'), 'server returns verification results as booleans');
check(!/originalSha256\s*:/.test(handler) && !/duplicateOfEvidenceId\s*:/.test(handler), 'detail DTO does not expose private hash or canonical duplicate id');
check(!handler.includes('getUniversalEvidenceStorageAdapter') && !handler.includes('createReadStream') && !handler.includes('getSignedUrl'), 'detail does not read binaries or generate Storage URLs');
check(!handler.includes('FieldValue') && !handler.includes('.set(') && !handler.includes('.update(') && !handler.includes('.create('), 'detail handler is read-only');
for (const forbidden of ['generateContent', 'GEMINI', 'OCR', 'PostingPlan', 'financeTransactions', 'financeJournalEntries', 'countSessions']) {
  check(!handler.includes(forbidden), `detail execution path has no ${forbidden} side effect/integration`);
}
check(detail.includes('OCR, IA, classificação') && detail.includes('OCR, AI, classification'), 'UI does not imply intelligence that is not active');

console.log(`\nUniversal Evidence Inbox I2B totals: ${passed} Passed`);
