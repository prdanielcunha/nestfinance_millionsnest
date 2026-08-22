import { parseCountPaperIdentityPayload, type CountCaptureNormalization, type CountCaptureNormalizedQuad } from '@/shared/finance/countCapture';
import {
  COUNT_CAPTURE_AUTO_GEOMETRY_THRESHOLD,
  COUNT_CAPTURE_DEFAULT_MANUAL_CORNERS,
  cloneCountCaptureQuad,
  detectCountCapturePageQuad,
  warpCountCapturePage,
} from './countCaptureGeometryClient';

export type PreparedCountCaptureImage = {
  original: File;
  normalized: Blob;
  originalSha256: string;
  normalizedSha256: string;
  previewUrl: string;
  normalizedPreviewUrl: string;
  normalization: CountCaptureNormalization;
  qrPayload: string | null;
  suggestedCorners: CountCaptureNormalizedQuad;
  geometryConfidence: number;
  geometryNeedsReview: boolean;
};

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
};

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('COUNT_CAPTURE_NORMALIZE_FAILED'));
      else resolve(blob);
    }, type, quality);
  });
}

async function sha256Hex(blob: Blob) {
  if (!globalThis.crypto?.subtle) throw new Error('COUNT_CAPTURE_CRYPTO_UNAVAILABLE');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        dispose: () => bitmap.close(),
      };
    } catch {
      // Safari/device codecs are allowed to fall back to HTMLImageElement below.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.decoding = 'async';
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('COUNT_CAPTURE_DECODE_FAILED'));
      element.src = objectUrl;
    });
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error('COUNT_CAPTURE_DECODE_FAILED');
    return {
      source: image,
      width,
      height,
      dispose: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function renderOrientedCanvas(decoded: DecodedImage, rotationDegrees: 0 | 90 | 180 | 270) {
  const rotatedWidth = rotationDegrees === 90 || rotationDegrees === 270 ? decoded.height : decoded.width;
  const rotatedHeight = rotationDegrees === 90 || rotationDegrees === 270 ? decoded.width : decoded.height;
  const longest = Math.max(rotatedWidth, rotatedHeight);
  const scale = Math.min(1, 2400 / longest);
  const targetWidth = Math.max(1, Math.round(rotatedWidth * scale));
  const targetHeight = Math.max(1, Math.round(rotatedHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('COUNT_CAPTURE_NORMALIZE_FAILED');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.save();
  context.scale(scale, scale);
  if (rotationDegrees === 90) {
    context.translate(decoded.height, 0);
    context.rotate(Math.PI / 2);
  } else if (rotationDegrees === 180) {
    context.translate(decoded.width, decoded.height);
    context.rotate(Math.PI);
  } else if (rotationDegrees === 270) {
    context.translate(0, decoded.width);
    context.rotate(-Math.PI / 2);
  }
  context.drawImage(decoded.source, 0, 0, decoded.width, decoded.height);
  context.restore();
  return { canvas, orientedWidth: rotatedWidth, orientedHeight: rotatedHeight };
}

function downscaleFullFrame(source: HTMLCanvasElement) {
  const longest = Math.max(source.width, source.height);
  const scale = longest > 2400 ? 2400 / longest : 1;
  if (scale === 1) return source;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('COUNT_CAPTURE_NORMALIZE_FAILED');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function detectQr(canvas: HTMLCanvasElement): Promise<string | null> {
  const Detector = (globalThis as any).BarcodeDetector;
  if (typeof Detector !== 'function') return null;
  try {
    const supported = typeof Detector.getSupportedFormats === 'function' ? await Detector.getSupportedFormats() : ['qr_code'];
    if (Array.isArray(supported) && !supported.includes('qr_code')) return null;
    const detector = new Detector({ formats: ['qr_code'] });
    const found = await detector.detect(canvas);
    for (const candidate of found || []) {
      const rawValue = String(candidate?.rawValue || '');
      if (!rawValue) continue;
      try {
        parseCountPaperIdentityPayload(rawValue);
        return rawValue;
      } catch {
        // Ignore unrelated QR codes in the photograph.
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function prepareCountCaptureImage(
  file: File,
  options: {
    rotationDegrees?: 0 | 90 | 180 | 270;
    manualCorners?: CountCaptureNormalizedQuad | null;
    forceFullFrame?: boolean;
  } = {},
): Promise<PreparedCountCaptureImage> {
  const rotationDegrees = options.rotationDegrees ?? 0;
  const decoded = await decodeImage(file);
  try {
    const oriented = renderOrientedCanvas(decoded, rotationDegrees);
    const detected = options.manualCorners || options.forceFullFrame
      ? { corners: null, confidence: 0 }
      : detectCountCapturePageQuad(oriented.canvas);
    const manualCorners = options.manualCorners ? cloneCountCaptureQuad(options.manualCorners) : null;
    const autoCorners = detected.corners && detected.confidence >= COUNT_CAPTURE_AUTO_GEOMETRY_THRESHOLD
      ? cloneCountCaptureQuad(detected.corners)
      : null;
    const appliedCorners = manualCorners || autoCorners;
    const normalizedCanvas = appliedCorners
      ? warpCountCapturePage(oriented.canvas, appliedCorners)
      : downscaleFullFrame(oriented.canvas);
    const previewBlob = await canvasToBlob(oriented.canvas, 'image/jpeg', 0.86);
    const normalized = await canvasToBlob(normalizedCanvas, 'image/jpeg', 0.9);
    const [qrPayload, originalSha256, normalizedSha256] = await Promise.all([
      detectQr(normalizedCanvas),
      sha256Hex(file),
      sha256Hex(normalized),
    ]);

    const geometryMode = manualCorners ? 'manual' : autoCorners ? 'auto' : 'full_frame';
    const normalization: CountCaptureNormalization = {
      sourceWidth: oriented.orientedWidth,
      sourceHeight: oriented.orientedHeight,
      normalizedWidth: normalizedCanvas.width,
      normalizedHeight: normalizedCanvas.height,
      rotationDegrees,
      perspectiveApplied: geometryMode !== 'full_frame',
      geometry: geometryMode === 'full_frame'
        ? { mode: 'full_frame', confidence: null, corners: null }
        : {
            mode: geometryMode,
            confidence: geometryMode === 'auto' ? detected.confidence : null,
            corners: appliedCorners,
          },
    };

    return {
      original: file,
      normalized,
      originalSha256,
      normalizedSha256,
      previewUrl: URL.createObjectURL(previewBlob),
      normalizedPreviewUrl: URL.createObjectURL(normalized),
      normalization,
      qrPayload,
      suggestedCorners: cloneCountCaptureQuad(detected.corners || manualCorners || COUNT_CAPTURE_DEFAULT_MANUAL_CORNERS),
      geometryConfidence: detected.confidence,
      geometryNeedsReview: geometryMode === 'full_frame' && !options.forceFullFrame,
    };
  } finally {
    decoded.dispose();
  }
}

export function nextCountCaptureRotation(rotation: 0 | 90 | 180 | 270, direction: 'left' | 'right'): 0 | 90 | 180 | 270 {
  const delta = direction === 'right' ? 90 : 270;
  return ((rotation + delta) % 360) as 0 | 90 | 180 | 270;
}

export function disposePreparedCountCaptureImage(image: PreparedCountCaptureImage | null) {
  if (!image) return;
  URL.revokeObjectURL(image.previewUrl);
  URL.revokeObjectURL(image.normalizedPreviewUrl);
}
