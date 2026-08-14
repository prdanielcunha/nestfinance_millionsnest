import { parseCountPaperIdentityPayload, type CountCaptureNormalization } from '@/shared/finance/countCapture';

export type PreparedCountCaptureImage = {
  original: File;
  normalized: Blob;
  originalSha256: string;
  normalizedSha256: string;
  previewUrl: string;
  normalizedPreviewUrl: string;
  normalization: CountCaptureNormalization;
  qrPayload: string | null;
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

export async function prepareCountCaptureImage(file: File): Promise<PreparedCountCaptureImage> {
  const decoded = await decodeImage(file);
  try {
    const longest = Math.max(decoded.width, decoded.height);
    const scale = longest > 2400 ? 2400 / longest : 1;
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('COUNT_CAPTURE_NORMALIZE_FAILED');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(decoded.source, 0, 0, width, height);

    const normalized = await canvasToBlob(canvas, 'image/jpeg', 0.88);
    const [qrPayload, originalSha256, normalizedSha256] = await Promise.all([
      detectQr(canvas),
      sha256Hex(file),
      sha256Hex(normalized),
    ]);

    return {
      original: file,
      normalized,
      originalSha256,
      normalizedSha256,
      previewUrl: URL.createObjectURL(file),
      normalizedPreviewUrl: URL.createObjectURL(normalized),
      normalization: {
        sourceWidth: decoded.width,
        sourceHeight: decoded.height,
        normalizedWidth: width,
        normalizedHeight: height,
        rotationDegrees: 0,
        perspectiveApplied: false,
      },
      qrPayload,
    };
  } finally {
    decoded.dispose();
  }
}

export function disposePreparedCountCaptureImage(image: PreparedCountCaptureImage | null) {
  if (!image) return;
  URL.revokeObjectURL(image.previewUrl);
  URL.revokeObjectURL(image.normalizedPreviewUrl);
}
