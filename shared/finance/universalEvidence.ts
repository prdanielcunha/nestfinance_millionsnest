export const UNIVERSAL_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
export const UNIVERSAL_EVIDENCE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export type UniversalEvidenceMime = typeof UNIVERSAL_EVIDENCE_TYPES[number];
export type UniversalEvidenceSourceKind = 'camera' | 'photo' | 'file' | 'clipboard';

export function isUniversalEvidenceMime(value: unknown): value is UniversalEvidenceMime {
  return typeof value === 'string' && (UNIVERSAL_EVIDENCE_TYPES as readonly string[]).includes(value);
}

export function isUniversalEvidenceSourceKind(value: unknown): value is UniversalEvidenceSourceKind {
  return value === 'camera' || value === 'photo' || value === 'file' || value === 'clipboard';
}

export function isUniversalEvidenceSize(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= UNIVERSAL_EVIDENCE_MAX_BYTES;
}

export function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function detectUniversalEvidenceMime(bytes: Uint8Array): UniversalEvidenceMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.slice(0, 8).every((byte, index) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index])) return 'image/png';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-') return 'application/pdf';
  return null;
}

function u16(bytes: Uint8Array, offset: number, little = false) {
  return little ? bytes[offset] | (bytes[offset + 1] << 8) : (bytes[offset] << 8) | bytes[offset + 1];
}

function u32(bytes: Uint8Array, offset: number, little = false) {
  return little
    ? (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
    : ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

export function inspectImageMetadata(bytes: Uint8Array, mime: UniversalEvidenceMime) {
  if (mime === 'image/png' && bytes.length >= 24) return { width: u32(bytes, 16), height: u32(bytes, 20), orientation: 1 };
  if (mime === 'image/webp' && bytes.length >= 30 && String.fromCharCode(...bytes.slice(12, 16)) === 'VP8X') {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return { width, height, orientation: 1 };
  }
  if (mime !== 'image/jpeg') return null;
  let offset = 2;
  let orientation = 1;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    const length = u16(bytes, offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if (marker === 0xe1 && length >= 16 && String.fromCharCode(...bytes.slice(offset + 4, offset + 10)) === 'Exif\0\0') {
      const tiff = offset + 10;
      const little = String.fromCharCode(bytes[tiff], bytes[tiff + 1]) === 'II';
      const ifd = tiff + u32(bytes, tiff + 4, little);
      const entries = ifd + 2 <= bytes.length ? u16(bytes, ifd, little) : 0;
      for (let i = 0; i < entries; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 <= bytes.length && u16(bytes, entry, little) === 0x0112) orientation = u16(bytes, entry + 8, little);
      }
    }
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && offset + 9 <= bytes.length) {
      return { width: u16(bytes, offset + 7), height: u16(bytes, offset + 5), orientation: orientation >= 1 && orientation <= 8 ? orientation : 1 };
    }
    offset += 2 + length;
  }
  return null;
}
