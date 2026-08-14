import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildUnresolvedCountCaptureCandidates,
  isCountCaptureMaterialHidden,
  isValidCountCaptureSha256,
  parseCountPaperIdentityPayload,
  validateCountCaptureReviewFields,
} from '../shared/finance/countCapture.js';

const validQr = JSON.stringify({ formId: 'cpf_0123456789abcdef', templateVersion: 1, checksum: 'a'.repeat(24) });
assert.deepEqual(parseCountPaperIdentityPayload(validQr), { formId: 'cpf_0123456789abcdef', templateVersion: 1, checksum: 'a'.repeat(24) });
assert.throws(() => parseCountPaperIdentityPayload(JSON.stringify({ formId: 'cpf_0123456789abcdef', templateVersion: 1, checksum: 'a'.repeat(24), amount: 100 })), /COUNT_CAPTURE_INVALID_QR/);
assert.throws(() => parseCountPaperIdentityPayload(JSON.stringify({ formId: 'cpf_0123456789abcdef', templateVersion: 2, checksum: 'a'.repeat(24) })), /COUNT_CAPTURE_UNSUPPORTED_TEMPLATE/);
assert.equal(isValidCountCaptureSha256('a'.repeat(64)), true);
assert.equal(isValidCountCaptureSha256('a'.repeat(63)), false);

const unresolved = buildUnresolvedCountCaptureCandidates();
assert.equal(unresolved.length, 4);
assert.ok(unresolved.every((field) => field.state === 'unresolved' && field.valueCents === null && field.confidence === null));
assert.equal(isCountCaptureMaterialHidden('count_a', 'counting_b'), true);
assert.equal(isCountCaptureMaterialHidden('count_a', 'recounting'), true);
assert.equal(isCountCaptureMaterialHidden('count_b', 'recounting'), true);
assert.equal(isCountCaptureMaterialHidden('count_b', 'counting_b'), false);
assert.throws(() => validateCountCaptureReviewFields([{ key: 'tithe', decision: 'corrected', valueCents: 100 }]), /COUNT_CAPTURE_INVALID_REVIEW/);
assert.ok(validateCountCaptureReviewFields([
  { key: 'tithe', decision: 'corrected', valueCents: 100 },
  { key: 'offering', decision: 'unreadable', valueCents: null },
  { key: 'other_income', decision: 'corrected', valueCents: 0 },
  { key: 'pix', decision: 'corrected', valueCents: 200 },
]));

const [capturePage, reviewPage, copy, service, start, finalize, detail, review, routes, storage, image] = await Promise.all([
  readFile('src/pages/finance/count/CountCapturePage.tsx', 'utf8'),
  readFile('src/pages/finance/count/CountCaptureReviewPage.tsx', 'utf8'),
  readFile('src/pages/finance/count/countCaptureCopy.ts', 'utf8'),
  readFile('src/services/countCaptureService.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/countCapturesStart.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/countCapturesFinalize.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/countCapturesDetail.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/countCapturesSaveReview.ts', 'utf8'),
  readFile('src/app/router/routes.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/countCaptureStorage.ts', 'utf8'),
  readFile('src/pages/finance/count/countCaptureImage.ts', 'utf8'),
]);
const joined = [capturePage, reviewPage, copy, service, start, finalize, detail, review, routes, storage, image].join('\n');
assert.ok(!joined.includes('localStorage'), 'Count Capture must not persist image/value material in localStorage');
assert.ok(service.includes("method: 'PUT'"), 'client uploads only to a server-authorized signed object URL');
assert.ok(service.includes('response.status !== 412'), 'ambiguous retry can proceed to server hash verification after write-once precondition');
assert.ok(service.includes('requiredHeaders'), 'client must replay signed upload precondition headers');
assert.ok(storage.includes("'x-goog-if-generation-match': '0'"), 'signed upload object paths are write-once');
assert.ok(image.includes("subtle.digest('SHA-256'"), 'client declares SHA-256 for retry-safe server verification');
assert.ok(start.includes('declaredSha256: originalSha256') && start.includes('declaredSha256: normalizedSha256'));
assert.ok(finalize.includes('original.sha256 !== capture.original?.declaredSha256'));
assert.ok(finalize.includes('normalized.sha256 !== capture.normalized?.declaredSha256'));
assert.ok(!capturePage.includes('firebase/storage') && !service.includes('firebase/storage'), 'Count Capture client must not use direct Firebase Storage SDK writes');
assert.ok(start.includes("'finance.create_drafts'"));
assert.ok(detail.includes("resolveFinanceRequestContext(req, 'finance.view')"));
assert.ok(start.includes('transaction.get(canonical.sessionRef)'), 'capture start re-checks Count stage transactionally');
assert.ok(finalize.includes('transaction.get(canonical.sessionRef)'), 'finalize re-checks Count stage transactionally');
assert.ok(review.includes('transaction.get(canonical.sessionRef)'), 'review save re-checks blind state transactionally');
assert.ok(detail.includes('isCountCaptureMaterialHidden'));
assert.ok(detail.includes('originalUrl = null') && detail.includes('normalizedUrl = null'));
assert.ok(review.includes('candidateValueCents') && review.includes('materialRedacted: true'));
assert.ok(routes.includes("countCapture: '/finance/count/capture'") && routes.includes("countCaptureReview: '/finance/count/captures/:captureId'"));
assert.ok(copy.includes('PT:') && copy.includes('EN:') && copy.includes('ES:'));

const handlers = [start, finalize, detail, review].join('\n');
for (const forbidden of ['financeTransactions', 'financeJournalEntries', 'financeJournalLines', 'financeAggregates', 'posting-plan', 'approve-for-posting']) {
  assert.ok(!handlers.includes(forbidden), `H3B1 handler must not reference ${forbidden}`);
}

console.log('✅ Count Capture H3B1 static contract passed');
