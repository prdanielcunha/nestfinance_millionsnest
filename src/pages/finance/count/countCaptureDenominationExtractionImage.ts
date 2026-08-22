import type { CountCaptureDetail } from '@/src/services/countCaptureService';
import {
  COUNT_CAPTURE_DENOMINATION_MAX_REGION_BYTES,
  COUNT_CAPTURE_DENOMINATION_MAX_TOTAL_BYTES,
  type CountCaptureDenominationRegionInput,
} from '@/shared/finance/countCaptureDenominations';
import type { CountCaptureRegion } from '@/shared/finance/countCapture';

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('COUNT_CAPTURE_DENOMINATION_REGION_FAILED')), 'image/jpeg', quality));
}

async function sha256Hex(bytes: ArrayBuffer) {
  if (!globalThis.crypto?.subtle) throw new Error('COUNT_CAPTURE_CRYPTO_UNAVAILABLE');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  return btoa(binary);
}

type Decoded = { source: CanvasImageSource; width: number; height: number; dispose: () => void };
async function decode(blob: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, dispose: () => bitmap.close() };
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('COUNT_CAPTURE_DENOMINATION_REGION_FAILED'));
      element.src = url;
    });
    return { source: image, width: image.naturalWidth || image.width, height: image.naturalHeight || image.height, dispose: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function encodeRegion(decoded: Decoded, region: CountCaptureRegion) {
  const sx = Math.max(0, Math.floor(region.x * decoded.width));
  const sy = Math.max(0, Math.floor(region.y * decoded.height));
  const sw = Math.max(1, Math.min(decoded.width - sx, Math.ceil(region.width * decoded.width)));
  const sh = Math.max(1, Math.min(decoded.height - sy, Math.ceil(region.height * decoded.height)));
  const scale = Math.min(1, 360 / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('COUNT_CAPTURE_DENOMINATION_REGION_FAILED');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(decoded.source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  let quality = 0.8;
  let blob = await canvasToBlob(canvas, quality);
  while (blob.size > COUNT_CAPTURE_DENOMINATION_MAX_REGION_BYTES && quality > 0.44) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, quality);
  }
  if (blob.size <= 0 || blob.size > COUNT_CAPTURE_DENOMINATION_MAX_REGION_BYTES) throw new Error('COUNT_CAPTURE_DENOMINATION_REGION_TOO_LARGE');
  return blob;
}

export async function prepareCountCaptureDenominationRegions(capture: CountCaptureDetail): Promise<CountCaptureDenominationRegionInput[]> {
  if (!capture.normalizedUrl || !capture.normalization || capture.normalization.geometry.mode === 'full_frame' || capture.materialHidden || !capture.denominationCandidates?.length) throw new Error('COUNT_CAPTURE_DENOMINATION_REGION_UNAVAILABLE');
  const response = await fetch(capture.normalizedUrl, { method: 'GET', cache: 'no-store' });
  if (!response.ok) throw new Error('COUNT_CAPTURE_DENOMINATION_REGION_FAILED');
  const imageBlob = await response.blob();
  if (imageBlob.type && imageBlob.type !== 'image/jpeg') throw new Error('COUNT_CAPTURE_DENOMINATION_REGION_FAILED');
  const decoded = await decode(imageBlob);
  try {
    let totalBytes = 0;
    const output: CountCaptureDenominationRegionInput[] = [];
    for (const candidate of capture.denominationCandidates) {
      if (!candidate.region) throw new Error('COUNT_CAPTURE_DENOMINATION_REGION_UNAVAILABLE');
      const regionBlob = await encodeRegion(decoded, candidate.region);
      const bytes = await regionBlob.arrayBuffer();
      totalBytes += bytes.byteLength;
      if (totalBytes > COUNT_CAPTURE_DENOMINATION_MAX_TOTAL_BYTES) throw new Error('COUNT_CAPTURE_DENOMINATION_REGIONS_TOO_LARGE');
      output.push({ cellKey: candidate.cellKey, mimeType: 'image/jpeg', dataBase64: bytesToBase64(new Uint8Array(bytes)), sha256: await sha256Hex(bytes) });
    }
    return output;
  } finally {
    decoded.dispose();
  }
}
