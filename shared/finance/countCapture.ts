import {
  getCountCaptureEvidenceRegion,
  validateCountCaptureGeometry,
  type CountCaptureGeometry,
  type CountCaptureNormalizedPoint,
  type CountCaptureNormalizedQuad,
} from './countCaptureGeometry.js';
import {
  COUNT_PAPER_TEMPLATE_VERSION,
  isValidCountPaperChecksum,
  isValidCountPaperFormId,
  type CountPaperIdentity,
  type CountPaperStage,
} from './countPaper.js';
import type { CountSessionStatus } from './count.js';

export const COUNT_CAPTURE_SCHEMA_VERSION = 1 as const;
export const COUNT_CAPTURE_STATUSES = ['awaiting_upload', 'captured', 'duplicate', 'reviewed'] as const;
export const COUNT_CAPTURE_FIELD_KEYS = ['tithe', 'offering', 'other_income', 'pix'] as const;
export const COUNT_CAPTURE_ORIGINAL_MAX_BYTES = 12 * 1024 * 1024;
export const COUNT_CAPTURE_NORMALIZED_MAX_BYTES = 4 * 1024 * 1024;
export const COUNT_CAPTURE_UPLOAD_TTL_MS = 10 * 60 * 1000;
export const COUNT_CAPTURE_READ_TTL_MS = 2 * 60 * 1000;

export type CountCaptureStatus = (typeof COUNT_CAPTURE_STATUSES)[number];
export type CountCaptureFieldKey = (typeof COUNT_CAPTURE_FIELD_KEYS)[number];
export type CountCaptureCandidateState = 'unresolved' | 'recognized' | 'uncertain';
export type CountCaptureReviewDecision = 'confirmed' | 'corrected' | 'unreadable';

export type CountCaptureRegion = { x: number; y: number; width: number; height: number };
export type CountCaptureCandidateField = {
  key: CountCaptureFieldKey;
  state: CountCaptureCandidateState;
  valueCents: number | null;
  confidence: number | null;
  source: 'none' | 'deterministic' | 'ocr' | 'vision';
  region: CountCaptureRegion | null;
};
export type CountCaptureReviewInputField = { key: CountCaptureFieldKey; decision: CountCaptureReviewDecision; valueCents: number | null };
export type CountCaptureReviewedField = CountCaptureReviewInputField & { candidateValueCents: number | null; candidateState: CountCaptureCandidateState };
export type CountCaptureNormalization = {
  sourceWidth: number;
  sourceHeight: number;
  normalizedWidth: number;
  normalizedHeight: number;
  rotationDegrees: 0 | 90 | 180 | 270;
  perspectiveApplied: boolean;
  geometry: CountCaptureGeometry;
};

export type { CountCaptureGeometry, CountCaptureNormalizedPoint, CountCaptureNormalizedQuad };

export function isValidCountCaptureId(value: unknown): value is string {
  return typeof value === 'string' && /^cpc_[a-f0-9]{24}$/.test(value);
}
export function isValidCountCaptureSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
export function isSupportedCountCaptureOriginalType(value: unknown): value is string {
  return typeof value === 'string' && ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(value.toLowerCase());
}
export function isSupportedCountCaptureNormalizedType(value: unknown): value is string {
  return typeof value === 'string' && ['image/jpeg', 'image/webp'].includes(value.toLowerCase());
}
export function isValidCaptureByteSize(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= max;
}

export function parseCountPaperIdentityPayload(raw: unknown): CountPaperIdentity {
  if (typeof raw !== 'string' || raw.length < 2 || raw.length > 256) throw new Error('COUNT_CAPTURE_INVALID_QR');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('COUNT_CAPTURE_INVALID_QR'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('COUNT_CAPTURE_INVALID_QR');
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = ['checksum', 'formId', 'templateVersion'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) throw new Error('COUNT_CAPTURE_INVALID_QR');
  if (!isValidCountPaperFormId(record.formId)) throw new Error('COUNT_CAPTURE_INVALID_QR');
  if (record.templateVersion !== COUNT_PAPER_TEMPLATE_VERSION) throw new Error('COUNT_CAPTURE_UNSUPPORTED_TEMPLATE');
  if (!isValidCountPaperChecksum(record.checksum)) throw new Error('COUNT_CAPTURE_INVALID_QR');
  return { formId: record.formId, templateVersion: record.templateVersion, checksum: record.checksum };
}

export function buildUnresolvedCountCaptureCandidates(templateVersion = COUNT_PAPER_TEMPLATE_VERSION): CountCaptureCandidateField[] {
  return COUNT_CAPTURE_FIELD_KEYS.map((key) => ({
    key,
    state: 'unresolved',
    valueCents: null,
    confidence: null,
    source: 'none',
    region: getCountCaptureEvidenceRegion(templateVersion, key),
  }));
}

export function isCountCaptureMaterialHidden(stage: CountPaperStage, status: CountSessionStatus): boolean {
  if (status === 'recounting') return true;
  if (stage === 'count_a' && status === 'counting_b') return true;
  return false;
}

export function validateCountCaptureNormalization(value: unknown): CountCaptureNormalization {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('COUNT_CAPTURE_INVALID_NORMALIZATION');
  const input = value as Record<string, unknown>;
  const integer = (key: string) => {
    const current = input[key];
    if (typeof current !== 'number' || !Number.isInteger(current) || current <= 0 || current > 12000) throw new Error('COUNT_CAPTURE_INVALID_NORMALIZATION');
    return current;
  };
  const rotation = input.rotationDegrees;
  if (![0, 90, 180, 270].includes(rotation as number)) throw new Error('COUNT_CAPTURE_INVALID_NORMALIZATION');
  if (typeof input.perspectiveApplied !== 'boolean') throw new Error('COUNT_CAPTURE_INVALID_NORMALIZATION');

  // H3B1 captures created before geometry metadata remain valid as full-frame evidence.
  const geometry = input.geometry === undefined
    ? { mode: 'full_frame' as const, confidence: null, corners: null }
    : validateCountCaptureGeometry(input.geometry);
  if (input.perspectiveApplied !== (geometry.mode !== 'full_frame')) throw new Error('COUNT_CAPTURE_INVALID_NORMALIZATION');

  return {
    sourceWidth: integer('sourceWidth'),
    sourceHeight: integer('sourceHeight'),
    normalizedWidth: integer('normalizedWidth'),
    normalizedHeight: integer('normalizedHeight'),
    rotationDegrees: rotation as 0 | 90 | 180 | 270,
    perspectiveApplied: input.perspectiveApplied,
    geometry,
  };
}

export function validateCountCaptureReviewFields(value: unknown): CountCaptureReviewInputField[] {
  if (!Array.isArray(value) || value.length !== COUNT_CAPTURE_FIELD_KEYS.length) throw new Error('COUNT_CAPTURE_INVALID_REVIEW');
  const seen = new Set<string>();
  return value.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('COUNT_CAPTURE_INVALID_REVIEW');
    const input = raw as Record<string, unknown>;
    const key = input.key;
    if (typeof key !== 'string' || !COUNT_CAPTURE_FIELD_KEYS.includes(key as CountCaptureFieldKey) || seen.has(key)) throw new Error('COUNT_CAPTURE_INVALID_REVIEW');
    seen.add(key);
    const decision = input.decision;
    if (!['confirmed', 'corrected', 'unreadable'].includes(String(decision))) throw new Error('COUNT_CAPTURE_INVALID_REVIEW');
    const valueCents = input.valueCents;
    if (decision === 'unreadable') {
      if (valueCents !== null) throw new Error('COUNT_CAPTURE_INVALID_REVIEW');
    } else if (typeof valueCents !== 'number' || !Number.isSafeInteger(valueCents) || valueCents < 0 || valueCents > 99_999_999_999) throw new Error('COUNT_CAPTURE_INVALID_REVIEW');
    return { key: key as CountCaptureFieldKey, decision: decision as CountCaptureReviewDecision, valueCents: valueCents as number | null };
  });
}
