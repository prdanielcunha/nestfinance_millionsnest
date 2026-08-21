import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [detail, copy, service, handler, storage, gateway, contracts] = await Promise.all([
  read('src/pages/finance/inbox/UniversalEvidenceDetailPage.tsx'),
  read('src/pages/finance/inbox/inboxCopy.ts'),
  read('src/services/universalEvidenceInboxService.ts'),
  read('server/vercel-handlers/finance/universalEvidencePreview.ts'),
  read('server/vercel-handlers/finance/universalEvidenceStorage.ts'),
  read('api/finance-gateway.ts'),
  read('scripts/check-api-contracts.mjs'),
]);

let passed = 0;
const check = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log(`✅ ${message}`);
};

check(gateway.includes("case 'universal-evidence-preview'") && contracts.includes("operation: 'universal-evidence-preview'"), 'preview uses the existing certified finance gateway');
check(service.includes('operation=universal-evidence-preview') && service.includes('response.blob()'), 'frontend requests authenticated binary preview through finance gateway');
check(handler.includes("resolveFinanceRequestContext(req, 'finance.view')"), 'preview backend requires finance.view');
check(handler.includes("collection('financeEntities')") && handler.includes("collection('universalEvidence')"), 'preview lookup stays under canonical organization and finance entity');
check(handler.includes("data?.organizationId !== organizationId") && handler.includes("data?.financeEntityId !== financeEntityId"), 'preview defensively validates tenant and entity fields');
check(handler.includes("data?.version !== 2") && handler.includes("data?.processingState !== 'accepted'") && handler.includes("data?.processingState !== 'duplicate'"), 'preview is restricted to finalized accepted or duplicate evidence');
check(handler.includes('stored.sha256 !== verifiedSha256') && handler.includes('stored.size !== byteSize'), 'preview revalidates stored hash and size against certified metadata');
check(handler.includes('detectUniversalEvidenceMime') && handler.includes('stored.contentType !== verifiedMimeType'), 'preview revalidates byte signature and Storage content type');
check(handler.includes("'Cache-Control', 'private, no-store, max-age=0'") && handler.includes("'X-Content-Type-Options', 'nosniff'"), 'preview response is private no-store and nosniff');
check(handler.includes('PREVIEW_RESPONSE_CHUNK_BYTES') && handler.includes('res.write(chunk)') && handler.includes('res.end()'), 'verified preview bytes are streamed in bounded response chunks');
check(!handler.includes('.send(stored.bytes)') && !handler.includes("'Content-Length'"), 'preview avoids a buffered response body that would hit Vercel payload limits');
check(!handler.includes('getSignedUrl') && !handler.includes('createUploadUrl'), 'preview does not create signed read URLs');
check(!handler.includes('json({ path'), 'preview never returns the private Storage path as JSON');
check(storage.includes('async readPreview(path)') && storage.includes('await file.getMetadata()') && storage.includes('await file.download()'), 'storage adapter has bounded on-demand preview read');
check(storage.indexOf('if (size > UNIVERSAL_EVIDENCE_MAX_BYTES)') < storage.indexOf('const [bytes] = await file.download()'), 'size is checked before downloading preview bytes');
check(detail.includes('copy.previewOriginal') && detail.includes('onClick={() => (previewUrl ? closePreview() : void openPreview())}'), 'preview requires explicit user action');
check((detail.match(/universalEvidenceInboxService\.preview\(/g) || []).length === 1, 'preview request exists only in the explicit preview loader');
check(detail.includes('URL.createObjectURL') && detail.includes('URL.revokeObjectURL'), 'browser preview uses revocable temporary blob URLs');
check(detail.includes('revokePreviewUrl();') && detail.includes('[accessState.organizationId, activeFinanceEntityId, evidenceId]'), 'preview is invalidated on canonical context or evidence changes');
check(detail.includes("previewState === 'accepted'") && detail.includes("previewState === 'duplicate'") && detail.includes('evidence.verification.contentHashVerified'), 'UI only offers preview for fully verified finalized evidence');
check(copy.includes("previewOriginal: 'Visualizar original'") && copy.includes("previewOriginal: 'View original'"), 'preview action is localized in PT/EN/ES');
check(copy.includes('temporária, privada') && copy.includes('temporary, private') && copy.includes('temporal, privada'), 'preview privacy boundary is localized in PT/EN/ES');
for (const forbidden of ['generateContent', 'GEMINI', 'PostingPlan', 'financeTransactions', 'financeJournalEntries', 'countSessions']) {
  check(!handler.includes(forbidden), `preview execution path has no ${forbidden} side effect/integration`);
}
check(!handler.includes('.set(') && !handler.includes('.update(') && !handler.includes('.create(') && !handler.includes('FieldValue'), 'preview handler is read-only');

console.log(`\nUniversal Evidence Inbox I2C totals: ${passed} Passed`);
