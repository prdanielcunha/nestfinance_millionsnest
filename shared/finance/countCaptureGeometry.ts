export type CountCaptureNormalizedPoint = { x: number; y: number };
export type CountCaptureNormalizedQuad = [
  CountCaptureNormalizedPoint,
  CountCaptureNormalizedPoint,
  CountCaptureNormalizedPoint,
  CountCaptureNormalizedPoint,
];
export type CountCaptureGeometryMode = 'full_frame' | 'auto' | 'manual';
export type CountCaptureGeometry = {
  mode: CountCaptureGeometryMode;
  confidence: number | null;
  corners: CountCaptureNormalizedQuad | null;
};

export type CountCaptureEvidenceRegionKey = 'tithe' | 'offering' | 'other_income' | 'pix' | 'denominations';
export type CountCaptureEvidenceRegion = { x: number; y: number; width: number; height: number };

// Template-v1 regions are deliberately broad inspection windows, not OCR truth.
// They are bound to the immutable H3A template version and only help a human or a
// later certified extractor focus on the expected section of a normalized A4 page.
export const COUNT_CAPTURE_TEMPLATE_V1_EVIDENCE_REGIONS: Readonly<Record<CountCaptureEvidenceRegionKey, CountCaptureEvidenceRegion>> = Object.freeze({
  tithe: Object.freeze({ x: 0.015, y: 0.195, width: 0.245, height: 0.17 }),
  offering: Object.freeze({ x: 0.255, y: 0.195, width: 0.245, height: 0.17 }),
  other_income: Object.freeze({ x: 0.495, y: 0.195, width: 0.245, height: 0.17 }),
  pix: Object.freeze({ x: 0.735, y: 0.195, width: 0.25, height: 0.17 }),
  denominations: Object.freeze({ x: 0.015, y: 0.31, width: 0.97, height: 0.43 }),
});

const EPSILON = 1e-8;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isCountCaptureEvidenceRegionWithinPage(region: CountCaptureEvidenceRegion): boolean {
  return finite(region.x) && finite(region.y) && finite(region.width) && finite(region.height) &&
    region.x >= 0 && region.y >= 0 && region.width > 0 && region.height > 0 &&
    region.x + region.width <= 1 + EPSILON && region.y + region.height <= 1 + EPSILON;
}

export function getCountCaptureEvidenceRegion(templateVersion: number, key: CountCaptureEvidenceRegionKey): CountCaptureEvidenceRegion | null {
  if (templateVersion !== 1) return null;
  const region = COUNT_CAPTURE_TEMPLATE_V1_EVIDENCE_REGIONS[key];
  return region && isCountCaptureEvidenceRegionWithinPage(region) ? { ...region } : null;
}

function cross(a: CountCaptureNormalizedPoint, b: CountCaptureNormalizedPoint, c: CountCaptureNormalizedPoint) {
  return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
}

function distance(a: CountCaptureNormalizedPoint, b: CountCaptureNormalizedPoint) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function countCaptureQuadArea(quad: CountCaptureNormalizedQuad): number {
  let area = 0;
  for (let index = 0; index < quad.length; index += 1) {
    const current = quad[index];
    const next = quad[(index + 1) % quad.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}

export function validateCountCaptureNormalizedQuad(value: unknown): CountCaptureNormalizedQuad {
  if (!Array.isArray(value) || value.length !== 4) throw new Error('COUNT_CAPTURE_INVALID_GEOMETRY');
  const quad = value.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('COUNT_CAPTURE_INVALID_GEOMETRY');
    const point = raw as Record<string, unknown>;
    if (!finite(point.x) || !finite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
      throw new Error('COUNT_CAPTURE_INVALID_GEOMETRY');
    }
    return { x: point.x, y: point.y };
  }) as CountCaptureNormalizedQuad;

  // Canonical order is top-left, top-right, bottom-right, bottom-left.
  if (!(quad[0].x < quad[1].x && quad[3].x < quad[2].x && quad[0].y < quad[3].y && quad[1].y < quad[2].y)) {
    throw new Error('COUNT_CAPTURE_INVALID_GEOMETRY');
  }
  const topAverage = (quad[0].y + quad[1].y) / 2;
  const bottomAverage = (quad[2].y + quad[3].y) / 2;
  const leftAverage = (quad[0].x + quad[3].x) / 2;
  const rightAverage = (quad[1].x + quad[2].x) / 2;
  if (bottomAverage - topAverage < 0.1 || rightAverage - leftAverage < 0.1) throw new Error('COUNT_CAPTURE_INVALID_GEOMETRY');

  // A convex clockwise-in-screen-space polygon has positive turns with the y-axis downward.
  const turns = quad.map((point, index) => cross(point, quad[(index + 1) % 4], quad[(index + 2) % 4]));
  if (turns.some((turn) => turn <= 0.002)) throw new Error('COUNT_CAPTURE_INVALID_GEOMETRY');
  if (countCaptureQuadArea(quad) < 0.12) throw new Error('COUNT_CAPTURE_INVALID_GEOMETRY');
  if (quad.some((point, index) => distance(point, quad[(index + 1) % 4]) < 0.1)) throw new Error('COUNT_CAPTURE_INVALID_GEOMETRY');
  return quad;
}

export function validateCountCaptureGeometry(value: unknown): CountCaptureGeometry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('COUNT_CAPTURE_INVALID_GEOMETRY');
  const input = value as Record<string, unknown>;
  const mode = input.mode;
  if (!['full_frame', 'auto', 'manual'].includes(String(mode))) throw new Error('COUNT_CAPTURE_INVALID_GEOMETRY');
  const confidence = input.confidence;
  let normalizedConfidence: number | null = null;
  if (confidence !== null) {
    if (!finite(confidence) || confidence < 0 || confidence > 1) throw new Error('COUNT_CAPTURE_INVALID_GEOMETRY');
    normalizedConfidence = confidence;
  }

  if (mode === 'full_frame') {
    if (input.corners !== null || normalizedConfidence !== null) throw new Error('COUNT_CAPTURE_INVALID_GEOMETRY');
    return { mode: 'full_frame', confidence: null, corners: null };
  }

  const corners = validateCountCaptureNormalizedQuad(input.corners);
  if (mode === 'auto' && normalizedConfidence === null) throw new Error('COUNT_CAPTURE_INVALID_GEOMETRY');
  return {
    mode: mode as 'auto' | 'manual',
    confidence: normalizedConfidence,
    corners,
  };
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const n = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < EPSILON) throw new Error('COUNT_CAPTURE_INVALID_GEOMETRY');
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let current = column; current <= n; current += 1) augmented[column][current] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      if (Math.abs(factor) < EPSILON) continue;
      for (let current = column; current <= n; current += 1) augmented[row][current] -= factor * augmented[column][current];
    }
  }
  return augmented.map((row) => row[n]);
}

// Returns a homography mapping normalized output-page coordinates (u,v) to the
// normalized source photograph. The caller can inverse-map every output pixel,
// avoiding holes that forward mapping would create.
export function buildCountCapturePageHomography(quadInput: unknown): readonly number[] {
  const quad = validateCountCaptureNormalizedQuad(quadInput);
  const destinations = [
    { u: 0, v: 0, point: quad[0] },
    { u: 1, v: 0, point: quad[1] },
    { u: 1, v: 1, point: quad[2] },
    { u: 0, v: 1, point: quad[3] },
  ];
  const matrix: number[][] = [];
  const vector: number[] = [];
  for (const { u, v, point } of destinations) {
    matrix.push([u, v, 1, 0, 0, 0, -point.x * u, -point.x * v]);
    vector.push(point.x);
    matrix.push([0, 0, 0, u, v, 1, -point.y * u, -point.y * v]);
    vector.push(point.y);
  }
  return solveLinearSystem(matrix, vector);
}

export function mapCountCapturePagePoint(homography: readonly number[], u: number, v: number): CountCaptureNormalizedPoint {
  if (homography.length !== 8 || !finite(u) || !finite(v)) throw new Error('COUNT_CAPTURE_INVALID_GEOMETRY');
  const denominator = homography[6] * u + homography[7] * v + 1;
  if (!Number.isFinite(denominator) || Math.abs(denominator) < EPSILON) throw new Error('COUNT_CAPTURE_INVALID_GEOMETRY');
  const x = (homography[0] * u + homography[1] * v + homography[2]) / denominator;
  const y = (homography[3] * u + homography[4] * v + homography[5]) / denominator;
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('COUNT_CAPTURE_INVALID_GEOMETRY');
  return { x, y };
}
