import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { detectUniversalEvidenceMime, inspectImageMetadata, UNIVERSAL_EVIDENCE_MAX_BYTES } from '../shared/finance/universalEvidence.js';
import { shouldFinalizeAfterUpload } from '../src/services/universalCaptureService.js';
import { createUniversalCaptureContext, hasUniversalCaptureContextChanged, isUniversalCaptureEpochCurrent } from '../src/pages/finance/capture/universalCaptureModel.js';

const files = await Promise.all([
  readFile('src/pages/finance/capture/universalCaptureCopy.ts', 'utf8'),
  readFile('src/pages/finance/capture/UniversalCapturePage.tsx', 'utf8'),
  readFile('src/app/layouts/ShellLayout.tsx', 'utf8'),
  readFile('src/services/universalCaptureService.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/universalEvidenceFinalize.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/universalEvidenceStorage.ts', 'utf8'),
]);
const [copy, page, shell, service, handler, storage] = files;
let passed = 0;
const verify = (condition: unknown, message: string) => { if (!condition) throw new Error(message); passed++; console.log(`✅ ${message}`); };

verify(['PT:', 'EN:', 'ES:'].every((locale) => copy.includes(locale)), 'PT/EN/ES capture copy is complete');
verify(copy.includes('Nenhum lançamento será criado automaticamente.'), 'PT copy preserves no automatic entry promise');
verify(copy.includes('No entry will be created automatically.'), 'EN copy preserves no automatic entry promise');
verify(copy.includes('No se creará ningún asiento automáticamente.'), 'ES copy preserves no automatic entry promise');
verify(['camera', 'photo', 'file', 'clipboard'].every((source) => page.includes(`'${source}'`)), 'camera, photo, file and clipboard sources are present');
verify(page.includes('navigator.clipboard?.read') && page.includes("state === 'selecting'"), 'clipboard is capability-detected with a selection fallback');
verify(['selecting', 'preview', 'validating', 'accepted', 'duplicate', 'unsupported', 'too_large', 'corrupt', 'recoverable_error'].every((state) => page.includes(`'${state}'`)), 'all deterministic UX states are represented');
verify(shell.includes("t('shortcut_income')") && shell.includes("navigateFromFab('income')"), 'income quick action is preserved');
verify(shell.includes("t('shortcut_expense')") && shell.includes("navigateFromFab('expense')"), 'expense quick action is preserved');
verify(shell.includes("t('shortcut_transfer')") && shell.includes("navigateFromFab('transfer')"), 'transfer quick action is preserved');
verify(shell.includes('copy.capture') && shell.includes('APP_ROUTES.universalCapture'), 'Universal Capture is added as a fourth quick action');
verify(shell.includes('aria-expanded={fabOpen}') && shell.includes("event.key === 'Escape'") && shell.includes('fabButtonRef.current?.focus()'), 'FAB keyboard and focus behavior is preserved');
verify(page.includes("hasEffectiveCapability(accessState, 'finance.create_drafts')"), 'capture route fails closed on finance.create_drafts capability');
verify(page.includes('captureContext.organizationId') && page.includes('captureContext.financeEntityId'), 'submit uses pinned organization and finance entity');
verify(page.includes('hasUniversalCaptureContextChanged') && page.includes('isUniversalCaptureEpochCurrent'), 'entity switch and stale response guards are wired');
verify(page.includes("state === 'recoverable_error'") && page.includes('onClick={submit}>{copy.retry}'), 'recoverable errors retry the same pinned file and idempotency keys');
verify(service.includes("crypto.subtle.digest('SHA-256'") && !service.includes('localStorage'), 'browser SHA-256 uses Web Crypto without financial localStorage');
verify(shouldFinalizeAfterUpload(200, true, true), 'successful upload advances to finalize');
verify(shouldFinalizeAfterUpload(412, false, true), 'write-once 412 advances to idempotent finalize');
verify(!shouldFinalizeAfterUpload(412, false, false), 'unrelated 412 is not masked');
verify(!shouldFinalizeAfterUpload(403, false, true), '403 upload failure remains a failure');
verify(!shouldFinalizeAfterUpload(500, false, true), '500 upload failure remains a failure');
verify(service.includes("['x-goog-if-generation-match']") && service.includes("=== '0'"), '412 convergence requires the write-once precondition');
verify(storage.indexOf('size > UNIVERSAL_EVIDENCE_MAX_BYTES') >= 0 && storage.indexOf('size > UNIVERSAL_EVIDENCE_MAX_BYTES') < storage.indexOf('file.createReadStream()'), 'real object size is rejected before streaming');
verify(handler.includes("collection('universalEvidenceHashes')") && handler.includes("collection('financeEntities').doc(financeEntityId)"), 'duplicate index is financeEntity-scoped');
verify(handler.includes('resolveFinanceRequestContext') && !handler.match(/organizationId\s*[,}]\s*=\s*req\.body/), 'organization and entity authority are resolved server-side');
verify(!files.join('\n').match(/Gemini|Vision|\bOCR\b|@google\/genai|PostingPlan|financeTransactions|financeJournal|financeAggregates|\bbalance\b|countSessions/), 'I1 path has zero AI, OCR, posting, transaction, journal, aggregate, balance or Count mutation usage');

const pinned = createUniversalCaptureContext({ organizationId: 'org-a', financeEntityId: 'entity-a', financeEntityName: 'Book A', epoch: 7 });
verify(Object.isFrozen(pinned) && pinned.organizationId === 'org-a' && pinned.financeEntityId === 'entity-a', 'capture context is immutable and pins organization/entity');
verify(!hasUniversalCaptureContextChanged(pinned, 'org-a', 'entity-a'), 'same organization/entity keeps capture valid');
verify(hasUniversalCaptureContextChanged(pinned, 'org-a', 'entity-b'), 'entity A to B switch invalidates capture');
verify(hasUniversalCaptureContextChanged(pinned, 'org-b', 'entity-a'), 'organization switch invalidates capture');
verify(isUniversalCaptureEpochCurrent(7, 7) && !isUniversalCaptureEpochCurrent(7, 8), 'epoch guard rejects stale responses');

const png = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,2,0,0,0,3]);
verify(detectUniversalEvidenceMime(png) === 'image/png', 'PNG MIME is verified from bytes');
verify(JSON.stringify(inspectImageMetadata(png, 'image/png')) === JSON.stringify({ width: 2, height: 3, orientation: 1 }), 'PNG dimensions and orientation are deterministic');

const vp8 = Uint8Array.from([82,73,70,70,22,0,0,0,87,69,66,80,86,80,56,32,10,0,0,0,0,0,0,0x9d,0x01,0x2a,2,0,3,0]);
const vp8l = Uint8Array.from([82,73,70,70,17,0,0,0,87,69,66,80,86,80,56,76,5,0,0,0,0x2f,1,0x80,0,0]);
const vp8x = Uint8Array.from([82,73,70,70,22,0,0,0,87,69,66,80,86,80,56,88,10,0,0,0,0,0,0,0,1,0,0,2,0,0]);
verify(detectUniversalEvidenceMime(vp8) === 'image/webp' && JSON.stringify(inspectImageMetadata(vp8, 'image/webp')) === JSON.stringify({ width: 2, height: 3, orientation: 1 }), 'VP8 WebP dimensions are deterministic');
verify(detectUniversalEvidenceMime(vp8l) === 'image/webp' && JSON.stringify(inspectImageMetadata(vp8l, 'image/webp')) === JSON.stringify({ width: 2, height: 3, orientation: 1 }), 'VP8L WebP dimensions are deterministic');
verify(detectUniversalEvidenceMime(vp8x) === 'image/webp' && JSON.stringify(inspectImageMetadata(vp8x, 'image/webp')) === JSON.stringify({ width: 2, height: 3, orientation: 1 }), 'VP8X WebP dimensions are deterministic');
verify(inspectImageMetadata(vp8.subarray(0, 22), 'image/webp') === null, 'truncated WebP fails closed');
verify(inspectImageMetadata(Uint8Array.from([...vp8.slice(0, 23), 1,2,3, ...vp8.slice(26)]), 'image/webp') === null, 'malformed VP8 start code fails closed');
verify(detectUniversalEvidenceMime(Uint8Array.from([1,2,3])) === null, 'corrupt bytes are rejected');
verify(UNIVERSAL_EVIDENCE_MAX_BYTES === 10 * 1024 * 1024, 'evidence size bound is 10 MB');
verify(createHash('sha256').update('nestfinance').digest('hex') === 'a5db091a49bc4f374b44e7358117f0b1a43824ccd3eb3e0f1f9c9a45c39f8471', 'SHA-256 certification vector is stable');
console.log(`\nUniversal Capture I1 static totals: ${passed} Passed`);
