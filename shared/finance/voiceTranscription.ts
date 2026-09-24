export const VOICE_CAPTURE_MAX_DURATION_MS = 60_000;
export const VOICE_CAPTURE_MAX_BYTES = 1_572_864;
export const VOICE_CAPTURE_MAX_BASE64_CHARS = 2_100_000;
export const VOICE_TRANSCRIPT_MAX_CHARS = 2_000;
export const VOICE_TRANSCRIPTION_VOCABULARY_REVISION = 'finance-ptbr-v1';

export const VOICE_CAPTURE_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
] as const;

export type VoiceCaptureMime = typeof VOICE_CAPTURE_MIME_TYPES[number];
export type VoiceCaptureLocale = 'PT' | 'EN' | 'ES';

export const VOICE_FINANCE_VOCABULARY = [
  'Pix',
  'dízimo',
  'dizimo',
  'oferta',
  'ofertas',
  'entrada',
  'saída',
  'saida',
  'dinheiro',
  'boleto',
  'cartão de débito',
  'cartão de crédito',
  'transferência',
  'transferencia',
  'depósito',
  'deposito',
  'conciliação',
  'conciliacao',
  'reembolso',
  'fornecedor',
] as const;

export function normalizeVoiceMime(value: string): VoiceCaptureMime | null {
  const normalized = value.toLowerCase().trim();
  return VOICE_CAPTURE_MIME_TYPES.find((candidate) => candidate === normalized) || null;
}

export function isVoiceCaptureDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 300 && value <= VOICE_CAPTURE_MAX_DURATION_MS;
}

export function isVoiceCaptureByteSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= VOICE_CAPTURE_MAX_BYTES;
}

export function normalizeVoiceTranscript(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, VOICE_TRANSCRIPT_MAX_CHARS);
}

function words(value: string) {
  return normalizeVoiceTranscript(value)
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9$.,%-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function scoreVoiceTranscript(reference: string, candidate: string) {
  const expected = words(reference);
  const actual = words(candidate);
  if (!expected.length) return { wordAccuracy: actual.length ? 0 : 1, edits: actual.length, expectedWords: 0 };

  const previous = Array(actual.length + 1).fill(0).map((_, index) => index);
  for (let i = 1; i <= expected.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= actual.length; j += 1) {
      const old = previous[j];
      previous[j] = expected[i - 1] === actual[j - 1]
        ? diagonal
        : Math.min(previous[j - 1] + 1, previous[j] + 1, diagonal + 1);
      diagonal = old;
    }
  }
  const edits = previous[actual.length];
  return {
    wordAccuracy: Math.max(0, 1 - edits / expected.length),
    edits,
    expectedWords: expected.length,
  };
}
