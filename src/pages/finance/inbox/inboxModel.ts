import type { Language } from '@/src/contexts/LanguageContext';

export type InboxEvidenceState = 'accepted' | 'duplicate' | 'awaiting_upload' | 'unknown';

const localeByLanguage: Record<Language, string> = {
  PT: 'pt-BR',
  EN: 'en-US',
  ES: 'es-ES',
};

export function normalizeInboxEvidenceState(value: unknown): InboxEvidenceState {
  if (value === 'accepted' || value === 'duplicate' || value === 'awaiting_upload') return value;
  return 'unknown';
}

export function formatInboxBytes(value: unknown, language: Language): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';

  const units = ['B', 'KB', 'MB', 'GB'] as const;
  let amount = bytes;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }

  const digits = unitIndex === 0 ? 0 : 1;
  return `${new Intl.NumberFormat(localeByLanguage[language], {
    maximumFractionDigits: digits,
  }).format(amount)} ${units[unitIndex]}`;
}

export function formatInboxDate(value: unknown, language: Language): string {
  if (typeof value !== 'string' || !value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat(localeByLanguage[language], {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatInboxMime(value: unknown): string {
  if (value === 'application/pdf') return 'PDF';
  if (value === 'image/jpeg') return 'JPEG';
  if (value === 'image/png') return 'PNG';
  if (value === 'image/webp') return 'WEBP';
  return typeof value === 'string' && value ? value.toUpperCase() : '—';
}
