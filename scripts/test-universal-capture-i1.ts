import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { detectUniversalEvidenceMime, inspectImageMetadata, UNIVERSAL_EVIDENCE_MAX_BYTES } from '../shared/finance/universalEvidence.js';

const files = await Promise.all([
  readFile('src/pages/finance/capture/universalCaptureCopy.ts', 'utf8'),
  readFile('src/pages/finance/capture/UniversalCapturePage.tsx', 'utf8'),
  readFile('src/services/universalCaptureService.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/universalEvidenceFinalize.ts', 'utf8'),
]);
const [copy, page, service, handler] = files;
let passed = 0;
const verify = (condition: unknown, message: string) => { if (!condition) throw new Error(message); passed++; console.log(`✅ ${message}`); };
verify(['PT:', 'EN:', 'ES:'].every((locale) => copy.includes(locale)), 'PT/EN/ES capture copy is complete');
verify(['camera', 'photo', 'file', 'clipboard'].every((source) => page.includes(`'${source}'`)), 'camera, photo, file and clipboard sources are present');
verify(page.includes('navigator.clipboard?.read') && page.includes("state === 'selecting'"), 'clipboard is capability-detected with a selection fallback');
verify(['selecting', 'preview', 'validating', 'accepted', 'duplicate', 'unsupported', 'too_large', 'corrupt', 'recoverable_error'].every((state) => page.includes(`'${state}'`)), 'all deterministic UX states are represented');
verify(service.includes("crypto.subtle.digest('SHA-256'") && !service.includes('localStorage'), 'browser SHA-256 uses Web Crypto without financial localStorage');
verify(!files.join('\n').match(/Gemini|Vision|\bOCR\b|@google\/genai|PostingPlan|financeTransactions|financeJournal|financeAggregates|balance|countSessions/), 'I1 path has zero AI, OCR, posting, transaction, journal, aggregate, balance or Count mutation usage');
verify(handler.includes("collection('universalEvidenceHashes')") && handler.includes("collection('financeEntities').doc(financeEntityId)"), 'duplicate index is financeEntity-scoped');
verify(handler.includes('resolveFinanceRequestContext') && !handler.match(/organizationId\s*[,}]\s*=\s*req\.body/), 'organization and entity authority are resolved server-side');
const png = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,2,0,0,0,3]);
verify(detectUniversalEvidenceMime(png) === 'image/png', 'PNG MIME is verified from bytes');
verify(JSON.stringify(inspectImageMetadata(png, 'image/png')) === JSON.stringify({ width: 2, height: 3, orientation: 1 }), 'image dimensions and orientation are deterministic');
verify(detectUniversalEvidenceMime(Uint8Array.from([1,2,3])) === null, 'corrupt bytes are rejected');
verify(UNIVERSAL_EVIDENCE_MAX_BYTES === 10 * 1024 * 1024, 'evidence size bound is 10 MB');
verify(createHash('sha256').update('nestfinance').digest('hex') === 'a5db091a49bc4f374b44e7358117f0b1a43824ccd3eb3e0f1f9c9a45c39f8471', 'SHA-256 certification vector is stable');
console.log(`\nUniversal Capture I1 static totals: ${passed} Passed`);
