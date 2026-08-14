import {
  buildCountCapturePageHomography,
  countCaptureQuadArea,
  validateCountCaptureNormalizedQuad,
  type CountCaptureNormalizedPoint,
  type CountCaptureNormalizedQuad,
} from '@/shared/finance/countCaptureGeometry';

export const COUNT_CAPTURE_AUTO_GEOMETRY_THRESHOLD = 0.86;
export const COUNT_CAPTURE_DEFAULT_MANUAL_CORNERS: CountCaptureNormalizedQuad = [
  { x: 0.04, y: 0.04 },
  { x: 0.96, y: 0.04 },
  { x: 0.96, y: 0.96 },
  { x: 0.04, y: 0.96 },
];

type EdgeSample = { position: number; independent: number; score: number };
type FittedLine = { slope: number; intercept: number; residual: number; strength: number };

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function grayscale(image: ImageData) {
  const output = new Uint8Array(image.width * image.height);
  for (let index = 0, pixel = 0; index < image.data.length; index += 4, pixel += 1) {
    output[pixel] = Math.round(image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114);
  }
  return output;
}

function horizontalGradient(gray: Uint8Array, width: number, height: number, x: number, y: number) {
  const left = Math.max(0, x - 2);
  const right = Math.min(width - 1, x + 2);
  return Math.abs(gray[y * width + right] - gray[y * width + left]);
}

function verticalGradient(gray: Uint8Array, width: number, height: number, x: number, y: number) {
  const top = Math.max(0, y - 2);
  const bottom = Math.min(height - 1, y + 2);
  return Math.abs(gray[bottom * width + x] - gray[top * width + x]);
}

function fitLine(samples: EdgeSample[]): FittedLine | null {
  if (samples.length < 4) return null;
  const count = samples.length;
  const meanIndependent = samples.reduce((sum, item) => sum + item.independent, 0) / count;
  const meanPosition = samples.reduce((sum, item) => sum + item.position, 0) / count;
  let numerator = 0;
  let denominator = 0;
  for (const sample of samples) {
    numerator += (sample.independent - meanIndependent) * (sample.position - meanPosition);
    denominator += (sample.independent - meanIndependent) ** 2;
  }
  if (denominator <= 1e-8) return null;
  const slope = numerator / denominator;
  const intercept = meanPosition - slope * meanIndependent;
  const residual = Math.sqrt(samples.reduce((sum, sample) => {
    const predicted = slope * sample.independent + intercept;
    return sum + (sample.position - predicted) ** 2;
  }, 0) / count);
  const strength = samples.reduce((sum, item) => sum + item.score, 0) / count;
  return { slope, intercept, residual, strength };
}

function intersection(vertical: FittedLine, horizontal: FittedLine): CountCaptureNormalizedPoint | null {
  // vertical: x = a*y+b ; horizontal: y = c*x+d
  const denominator = 1 - vertical.slope * horizontal.slope;
  if (Math.abs(denominator) < 1e-5) return null;
  const x = (vertical.slope * horizontal.intercept + vertical.intercept) / denominator;
  const y = horizontal.slope * x + horizontal.intercept;
  return { x, y };
}

function sampleVerticalEdge(
  gray: Uint8Array,
  width: number,
  height: number,
  yValues: number[],
  minX: number,
  maxX: number,
): EdgeSample[] {
  return yValues.map((y) => {
    let bestX = minX;
    let bestScore = -1;
    for (let x = minX; x <= maxX; x += 1) {
      let score = 0;
      for (let offset = -2; offset <= 2; offset += 1) {
        const yy = Math.max(0, Math.min(height - 1, y + offset));
        score += horizontalGradient(gray, width, height, x, yy);
      }
      if (score > bestScore) { bestScore = score; bestX = x; }
    }
    return { position: bestX / width, independent: y / height, score: bestScore / 5 };
  });
}

function sampleHorizontalEdge(
  gray: Uint8Array,
  width: number,
  height: number,
  xValues: number[],
  minY: number,
  maxY: number,
): EdgeSample[] {
  return xValues.map((x) => {
    let bestY = minY;
    let bestScore = -1;
    for (let y = minY; y <= maxY; y += 1) {
      let score = 0;
      for (let offset = -2; offset <= 2; offset += 1) {
        const xx = Math.max(0, Math.min(width - 1, x + offset));
        score += verticalGradient(gray, width, height, xx, y);
      }
      if (score > bestScore) { bestScore = score; bestY = y; }
    }
    return { position: bestY / height, independent: x / width, score: bestScore / 5 };
  });
}

function evenlySpaced(min: number, max: number, count: number) {
  return Array.from({ length: count }, (_, index) => Math.round(min + ((max - min) * index) / Math.max(1, count - 1)));
}

export function detectCountCapturePageQuad(sourceCanvas: HTMLCanvasElement): { corners: CountCaptureNormalizedQuad | null; confidence: number } {
  const longest = Math.max(sourceCanvas.width, sourceCanvas.height);
  const scale = Math.min(1, 720 / longest);
  const width = Math.max(80, Math.round(sourceCanvas.width * scale));
  const height = Math.max(80, Math.round(sourceCanvas.height * scale));
  const analysis = document.createElement('canvas');
  analysis.width = width;
  analysis.height = height;
  const context = analysis.getContext('2d', { willReadFrequently: true });
  if (!context) return { corners: null, confidence: 0 };
  context.drawImage(sourceCanvas, 0, 0, width, height);
  const gray = grayscale(context.getImageData(0, 0, width, height));

  const yValues = evenlySpaced(Math.round(height * 0.18), Math.round(height * 0.82), 9);
  const xValues = evenlySpaced(Math.round(width * 0.18), Math.round(width * 0.82), 9);
  const left = fitLine(sampleVerticalEdge(gray, width, height, yValues, Math.round(width * 0.015), Math.round(width * 0.42)));
  const right = fitLine(sampleVerticalEdge(gray, width, height, yValues, Math.round(width * 0.58), Math.round(width * 0.985)));
  const top = fitLine(sampleHorizontalEdge(gray, width, height, xValues, Math.round(height * 0.015), Math.round(height * 0.42)));
  const bottom = fitLine(sampleHorizontalEdge(gray, width, height, xValues, Math.round(height * 0.58), Math.round(height * 0.985)));
  if (!left || !right || !top || !bottom) return { corners: null, confidence: 0 };

  const raw = [
    intersection(left, top),
    intersection(right, top),
    intersection(right, bottom),
    intersection(left, bottom),
  ];
  if (raw.some((point) => !point || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) return { corners: null, confidence: 0 };

  let corners: CountCaptureNormalizedQuad;
  try {
    corners = validateCountCaptureNormalizedQuad(raw as CountCaptureNormalizedQuad);
  } catch {
    return { corners: null, confidence: 0 };
  }

  const lines = [left, right, top, bottom];
  const strength = lines.reduce((sum, line) => sum + clamp01((line.strength - 12) / 55), 0) / lines.length;
  const fit = lines.reduce((sum, line) => sum + clamp01(1 - line.residual / 0.035), 0) / lines.length;
  const area = countCaptureQuadArea(corners);
  const areaScore = clamp01((area - 0.25) / 0.45);
  const confidence = clamp01(strength * 0.5 + fit * 0.35 + areaScore * 0.15);
  return { corners, confidence };
}

function bilinearSample(data: Uint8ClampedArray, width: number, height: number, x: number, y: number, output: Uint8ClampedArray, offset: number) {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const dx = Math.max(0, Math.min(1, x - x0));
  const dy = Math.max(0, Math.min(1, y - y0));
  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;
  for (let channel = 0; channel < 3; channel += 1) {
    const top = data[i00 + channel] * (1 - dx) + data[i10 + channel] * dx;
    const bottom = data[i01 + channel] * (1 - dx) + data[i11 + channel] * dx;
    output[offset + channel] = Math.round(top * (1 - dy) + bottom * dy);
  }
  output[offset + 3] = 255;
}

export function warpCountCapturePage(sourceCanvas: HTMLCanvasElement, cornersInput: unknown, longEdge = 2000): HTMLCanvasElement {
  const corners = validateCountCaptureNormalizedQuad(cornersInput);
  const homography = buildCountCapturePageHomography(corners);
  const targetHeight = Math.max(800, Math.min(2400, Math.round(longEdge)));
  const targetWidth = Math.round(targetHeight * (194 / 281));
  const output = document.createElement('canvas');
  output.width = targetWidth;
  output.height = targetHeight;
  const outputContext = output.getContext('2d');
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!outputContext || !sourceContext) throw new Error('COUNT_CAPTURE_GEOMETRY_FAILED');
  const source = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const target = outputContext.createImageData(targetWidth, targetHeight);

  for (let y = 0; y < targetHeight; y += 1) {
    const v = targetHeight <= 1 ? 0 : y / (targetHeight - 1);
    for (let x = 0; x < targetWidth; x += 1) {
      const u = targetWidth <= 1 ? 0 : x / (targetWidth - 1);
      const denominator = homography[6] * u + homography[7] * v + 1;
      const sourceX = ((homography[0] * u + homography[1] * v + homography[2]) / denominator) * (sourceCanvas.width - 1);
      const sourceY = ((homography[3] * u + homography[4] * v + homography[5]) / denominator) * (sourceCanvas.height - 1);
      bilinearSample(source.data, sourceCanvas.width, sourceCanvas.height, sourceX, sourceY, target.data, (y * targetWidth + x) * 4);
    }
  }
  outputContext.putImageData(target, 0, 0);
  return output;
}

export function cloneCountCaptureQuad(quad: CountCaptureNormalizedQuad): CountCaptureNormalizedQuad {
  return quad.map((point) => ({ ...point })) as CountCaptureNormalizedQuad;
}
