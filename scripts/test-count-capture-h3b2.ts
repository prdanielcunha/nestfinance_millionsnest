import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildCountCapturePageHomography,
  countCaptureQuadArea,
  getCountCaptureEvidenceRegion,
  isCountCaptureEvidenceRegionWithinPage,
  mapCountCapturePagePoint,
  validateCountCaptureGeometry,
  validateCountCaptureNormalizedQuad,
  COUNT_CAPTURE_TEMPLATE_V1_EVIDENCE_REGIONS,
  type CountCaptureNormalizedQuad,
} from '../shared/finance/countCaptureGeometry.js';
import { validateCountCaptureNormalization } from '../shared/finance/countCapture.js';

const unitQuad: CountCaptureNormalizedQuad = [
  { x: 0.02, y: 0.02 },
  { x: 0.98, y: 0.03 },
  { x: 0.97, y: 0.98 },
  { x: 0.03, y: 0.97 },
];
assert.deepEqual(validateCountCaptureNormalizedQuad(unitQuad), unitQuad);
assert.ok(countCaptureQuadArea(unitQuad) > 0.85);
assert.throws(() => validateCountCaptureNormalizedQuad([
  { x: 0.05, y: 0.05 },
  { x: 0.95, y: 0.95 },
  { x: 0.95, y: 0.05 },
  { x: 0.05, y: 0.95 },
]), /COUNT_CAPTURE_INVALID_GEOMETRY/);
assert.throws(() => validateCountCaptureNormalizedQuad([
  { x: Number.NaN, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
]), /COUNT_CAPTURE_INVALID_GEOMETRY/);
assert.throws(() => validateCountCaptureNormalizedQuad([
  { x: 0.48, y: 0.48 }, { x: 0.52, y: 0.48 }, { x: 0.52, y: 0.52 }, { x: 0.48, y: 0.52 },
]), /COUNT_CAPTURE_INVALID_GEOMETRY/);
assert.throws(() => validateCountCaptureNormalizedQuad([
  unitQuad[1], unitQuad[2], unitQuad[3], unitQuad[0],
]), /COUNT_CAPTURE_INVALID_GEOMETRY/, 'quad order must stay TL/TR/BR/BL');

const trapezoid: CountCaptureNormalizedQuad = [
  { x: 0.18, y: 0.08 },
  { x: 0.82, y: 0.12 },
  { x: 0.94, y: 0.94 },
  { x: 0.07, y: 0.9 },
];
const homography = buildCountCapturePageHomography(trapezoid);
const mappedCorners = [
  mapCountCapturePagePoint(homography, 0, 0),
  mapCountCapturePagePoint(homography, 1, 0),
  mapCountCapturePagePoint(homography, 1, 1),
  mapCountCapturePagePoint(homography, 0, 1),
];
for (let index = 0; index < 4; index += 1) {
  assert.ok(Math.abs(mappedCorners[index].x - trapezoid[index].x) < 1e-8);
  assert.ok(Math.abs(mappedCorners[index].y - trapezoid[index].y) < 1e-8);
}

assert.deepEqual(validateCountCaptureGeometry({ mode: 'auto', confidence: 0.91, corners: trapezoid }), { mode: 'auto', confidence: 0.91, corners: trapezoid });
assert.deepEqual(validateCountCaptureGeometry({ mode: 'manual', confidence: null, corners: trapezoid }), { mode: 'manual', confidence: null, corners: trapezoid });
assert.deepEqual(validateCountCaptureGeometry({ mode: 'full_frame', confidence: null, corners: null }), { mode: 'full_frame', confidence: null, corners: null });
assert.throws(() => validateCountCaptureGeometry({ mode: 'auto', confidence: null, corners: trapezoid }), /COUNT_CAPTURE_INVALID_GEOMETRY/);
assert.throws(() => validateCountCaptureGeometry({ mode: 'full_frame', confidence: 0.4, corners: null }), /COUNT_CAPTURE_INVALID_GEOMETRY/);

for (const [key, region] of Object.entries(COUNT_CAPTURE_TEMPLATE_V1_EVIDENCE_REGIONS)) {
  assert.equal(isCountCaptureEvidenceRegionWithinPage(region), true, `${key} region must remain inside normalized page`);
}
assert.ok(getCountCaptureEvidenceRegion(1, 'tithe'));
assert.equal(getCountCaptureEvidenceRegion(99, 'tithe'), null);

const normalized = validateCountCaptureNormalization({
  sourceWidth: 3024,
  sourceHeight: 4032,
  normalizedWidth: 1381,
  normalizedHeight: 2000,
  rotationDegrees: 0,
  perspectiveApplied: true,
  geometry: { mode: 'manual', confidence: null, corners: trapezoid },
});
assert.equal(normalized.geometry.mode, 'manual');
assert.equal(normalized.perspectiveApplied, true);
assert.throws(() => validateCountCaptureNormalization({
  sourceWidth: 3024,
  sourceHeight: 4032,
  normalizedWidth: 1381,
  normalizedHeight: 2000,
  rotationDegrees: 0,
  perspectiveApplied: false,
  geometry: { mode: 'manual', confidence: null, corners: trapezoid },
}), /COUNT_CAPTURE_INVALID_NORMALIZATION/);
// Backward compatibility for already stored H3B1 full-frame captures.
assert.deepEqual(validateCountCaptureNormalization({
  sourceWidth: 1000,
  sourceHeight: 1500,
  normalizedWidth: 1000,
  normalizedHeight: 1500,
  rotationDegrees: 0,
  perspectiveApplied: false,
}).geometry, { mode: 'full_frame', confidence: null, corners: null });

const [image, geometryClient, editor, capturePage, reviewPage, copy, shared, finalize] = await Promise.all([
  readFile('src/pages/finance/count/countCaptureImage.ts', 'utf8'),
  readFile('src/pages/finance/count/countCaptureGeometryClient.ts', 'utf8'),
  readFile('src/pages/finance/count/CountCaptureCornerEditor.tsx', 'utf8'),
  readFile('src/pages/finance/count/CountCapturePage.tsx', 'utf8'),
  readFile('src/pages/finance/count/CountCaptureReviewPage.tsx', 'utf8'),
  readFile('src/pages/finance/count/countCaptureCopy.ts', 'utf8'),
  readFile('shared/finance/countCapture.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/countCapturesFinalize.ts', 'utf8'),
]);
const joined = [image, geometryClient, editor, capturePage, reviewPage, copy, shared, finalize].join('\n');
assert.ok(geometryClient.includes('COUNT_CAPTURE_AUTO_GEOMETRY_THRESHOLD'));
assert.ok(geometryClient.includes('detectCountCapturePageQuad'));
assert.ok(geometryClient.includes('warpCountCapturePage'));
assert.ok(image.includes("geometryMode = manualCorners ? 'manual' : autoCorners ? 'auto' : 'full_frame'"));
assert.ok(capturePage.includes('CountCaptureCornerEditor'));
assert.ok(capturePage.includes('prepared.geometryNeedsReview'));
assert.ok(capturePage.includes('validateCountCaptureNormalizedQuad'));
assert.ok(editor.includes('onPointerMove') && editor.includes('h-11 w-11'));
assert.ok(reviewPage.includes('EvidenceRegionCrop') && reviewPage.includes('getCountCaptureEvidenceRegion'));
assert.ok(reviewPage.includes("capture.normalization.geometry.mode === 'full_frame'"), 'review regions must fail closed for full-frame captures');
assert.ok(finalize.includes('buildUnresolvedCountCaptureCandidates(canonical.form.templateVersion)'), 'candidate regions must bind to immutable form template version');
assert.ok(finalize.includes("normalizedGeometry.geometry.mode === 'full_frame' ? { ...field, region: null } : field"), 'full-frame captures must not receive coordinate evidence regions');
assert.ok(finalize.includes('evidenceRegionsBound: normalizedGeometry.geometry.mode !== \'full_frame\''));
assert.ok(copy.includes('geometryNeedsReview') && copy.includes('PT:') && copy.includes('EN:') && copy.includes('ES:'));
assert.ok(!joined.includes('localStorage'));
assert.ok(!geometryClient.includes('OCR') && !geometryClient.includes('vision'), 'geometry engine must not read financial values');
assert.ok(!capturePage.includes('valueCents'), 'capture geometry UI must not invent monetary candidates');
for (const forbidden of ['financeTransactions', 'financeJournalEntries', 'financeJournalLines', 'financeAggregates', 'approve-for-posting']) {
  assert.ok(![geometryClient, image, capturePage, finalize].join('\n').includes(forbidden), `H3B2 geometry path must not reference ${forbidden}`);
}

console.log('✅ Count Capture H3B2 geometry contract passed');
