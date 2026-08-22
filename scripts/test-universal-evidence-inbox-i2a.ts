import { readFile } from 'node:fs/promises';
import {
  formatInboxBytes,
  formatInboxDate,
  formatInboxMime,
  normalizeInboxEvidenceState,
} from '../src/pages/finance/inbox/inboxModel.js';

const [copy, page, service, handler, gateway] = await Promise.all([
  readFile('src/pages/finance/inbox/inboxCopy.ts', 'utf8'),
  readFile('src/pages/finance/InboxPage.tsx', 'utf8'),
  readFile('src/services/universalEvidenceInboxService.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/universalEvidenceList.ts', 'utf8'),
  readFile('api/finance-gateway.ts', 'utf8'),
]);

let passed = 0;
const verify = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  passed++;
  console.log(`✅ ${message}`);
};

verify(['PT:', 'EN:', 'ES:'].every((locale) => copy.includes(locale)), 'Inbox copy is complete for PT/EN/ES');
verify(copy.includes('Nenhum lançamento é criado automaticamente.'), 'PT copy preserves no automatic posting promise');
verify(copy.includes('No transaction is created automatically.'), 'EN copy preserves no automatic posting promise');
verify(copy.includes('No se crea ningún asiento automáticamente.'), 'ES copy preserves no automatic posting promise');
verify(page.includes("hasEffectiveCapability(accessState, 'finance.view')"), 'Inbox route fails closed on finance.view');
verify(page.includes("hasEffectiveCapability(accessState, 'finance.create_drafts')"), 'Capture CTA is separately gated by finance.create_drafts');
verify(page.includes('<FinanceContextGuard>') && page.includes('FinanceEntityContextBar'), 'Inbox reuses canonical finance entity context UI');
verify(page.includes('epochRef') && page.includes('activeFinanceEntityId'), 'Inbox guards stale responses across entity changes');
verify(page.includes('universalEvidenceInboxService.list'), 'Inbox reads through the authenticated service');
verify(!page.includes('firebase/firestore') && !service.includes('firebase/firestore'), 'Frontend performs no direct Firestore evidence reads');
verify(service.includes('operation=universal-evidence-list'), 'Client calls only the certified finance gateway operation');
verify(service.includes("getIdToken()") && service.includes("x-organization-id"), 'Client sends authenticated canonical compatibility headers');
verify(handler.includes("resolveFinanceRequestContext(req, 'finance.view')"), 'Server requires finance.view through shared request context');
verify(handler.includes(".collection('organizations')") && handler.includes(".collection('financeEntities')") && handler.includes(".collection('universalEvidence')"), 'Server read is nested under organization and finance entity');
verify(handler.includes("orderBy('createdAt', 'desc')") && handler.includes('startAfter(cursorDoc)'), 'Inbox pagination is deterministic and cursor-based');
verify(handler.includes('limit + 1') && handler.includes('hasMore'), 'Pagination uses lookahead without unbounded reads');
verify(handler.includes("where('processingState', '==', 'accepted').count()"), 'Accepted summary count is server-side');
verify(handler.includes("where('processingState', '==', 'duplicate').count()"), 'Duplicate summary count is server-side');
verify(handler.includes("where('processingState', '==', 'awaiting_upload').count()"), 'Pending upload summary count is server-side');
verify(!handler.includes('originalSha256') && !handler.includes('duplicateOfEvidenceId') && !handler.includes('original: {'), 'Inbox DTO does not expose hashes, canonical duplicate ids, or storage metadata');
verify(gateway.includes("case 'universal-evidence-list':") && gateway.includes('universalEvidenceList'), 'Finance gateway routes the Inbox list handler');
verify(normalizeInboxEvidenceState('accepted') === 'accepted' && normalizeInboxEvidenceState('other') === 'unknown', 'Inbox status normalization fails closed');
verify(formatInboxBytes(1536, 'EN').endsWith('KB'), 'Inbox byte formatting is deterministic');
verify(formatInboxMime('application/pdf') === 'PDF' && formatInboxMime('image/webp') === 'WEBP', 'Inbox MIME labels are deterministic');
verify(formatInboxDate('2026-08-21T00:00:00.000Z', 'PT') !== '—' && formatInboxDate('invalid', 'PT') === '—', 'Inbox date formatting handles valid and corrupt values safely');

const executionPath = [page, service, handler].join('\n');
verify(!executionPath.match(/Gemini|Vision|\bOCR\b|@google\/genai|PostingPlan|financeTransactions|financeJournal|financeAggregates|countSessions/), 'Inbox I2A execution path has zero AI, OCR, posting, journal, aggregate, transaction or Count mutation usage');

console.log(`\nUniversal Evidence Inbox I2A totals: ${passed} Passed`);
