import { isValidCnpj } from './taxId.js';

export const DOCUMENT_TEXT_MAX_CHARACTERS = 100_000;
export const DOCUMENT_TEXT_MAX_CANDIDATES = 100;
export const DOCUMENT_TEXT_CONTEXT_RADIUS = 40;

export type DocumentTextSignalKind = 'cpf' | 'cnpj' | 'date' | 'money' | 'pix_key' | 'boleto';
export type DocumentTextSignalEvidence = 'validated' | 'explicit_label' | 'pattern_only';

export type DocumentTextSignalCandidate = {
  kind: DocumentTextSignalKind;
  raw: string;
  normalized: string;
  start: number;
  end: number;
  context: string;
  evidence: DocumentTextSignalEvidence;
  amountCents?: number;
  boletoDigits?: 44 | 47 | 48;
};

export type DocumentTextSignalsResult = {
  deterministic: true;
  inputCharacters: number;
  scannedCharacters: number;
  limited: boolean;
  candidateLimitReached: boolean;
  candidates: DocumentTextSignalCandidate[];
};

function digitsOnly(value: string) {
  return value.replace(/\D/g, '');
}

function contextFor(text: string, start: number, end: number) {
  const left = Math.max(0, start - DOCUMENT_TEXT_CONTEXT_RADIUS);
  const right = Math.min(text.length, end + DOCUMENT_TEXT_CONTEXT_RADIUS);
  return text.slice(left, right).replace(/\s+/g, ' ').trim();
}

function isValidCpf(value: string) {
  const cpf = digitsOnly(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;

  const calculateDigit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculateDigit(9) === Number(cpf[9]) && calculateDigit(10) === Number(cpf[10]);
}

function isValidCalendarDate(year: number, month: number, day: number) {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isoDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function moneyToCents(raw: string) {
  const withoutCurrency = raw.replace(/^\s*(?:R\$|BRL)\s*/i, '').trim().replace(/\s+/g, '');
  if (!withoutCurrency || !/^[0-9.,]+$/.test(withoutCurrency)) return null;

  let integerPart = withoutCurrency;
  let fractionPart = '';

  if (withoutCurrency.includes(',')) {
    const comma = withoutCurrency.lastIndexOf(',');
    const tail = withoutCurrency.slice(comma + 1);
    if (tail.length > 2) return null;
    integerPart = withoutCurrency.slice(0, comma).replace(/\./g, '');
    fractionPart = tail;
  } else if (withoutCurrency.includes('.')) {
    const pieces = withoutCurrency.split('.');
    const tail = pieces.at(-1) || '';
    if (pieces.length === 2 && tail.length > 0 && tail.length <= 2) {
      integerPart = pieces[0];
      fractionPart = tail;
    } else if (pieces.slice(1).every((part) => part.length === 3)) {
      integerPart = pieces.join('');
    } else {
      return null;
    }
  }

  integerPart = integerPart.replace(/\./g, '');
  if (!/^\d+$/.test(integerPart) || (fractionPart && !/^\d{1,2}$/.test(fractionPart))) return null;
  const cents = Number(integerPart) * 100 + Number(fractionPart.padEnd(2, '0') || '0');
  return Number.isSafeInteger(cents) ? cents : null;
}

function pushCandidate(
  target: DocumentTextSignalCandidate[],
  text: string,
  candidate: Omit<DocumentTextSignalCandidate, 'context'>,
) {
  target.push({ ...candidate, context: contextFor(text, candidate.start, candidate.end) });
}

function collectTaxIds(text: string, target: DocumentTextSignalCandidate[]) {
  const cnpjPattern = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
  for (const match of text.matchAll(cnpjPattern)) {
    const raw = match[0];
    const normalized = digitsOnly(raw);
    if (!isValidCnpj(normalized)) continue;
    const start = match.index;
    pushCandidate(target, text, {
      kind: 'cnpj', raw, normalized, start, end: start + raw.length, evidence: 'validated',
    });
  }

  const cpfPattern = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
  for (const match of text.matchAll(cpfPattern)) {
    const raw = match[0];
    const normalized = digitsOnly(raw);
    if (!isValidCpf(normalized)) continue;
    const start = match.index;
    pushCandidate(target, text, {
      kind: 'cpf', raw, normalized, start, end: start + raw.length, evidence: 'validated',
    });
  }
}

function collectDates(text: string, target: DocumentTextSignalCandidate[]) {
  const brazilianPattern = /\b(\d{2})[/.](\d{2})[/.](\d{4})\b/g;
  for (const match of text.matchAll(brazilianPattern)) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    if (!isValidCalendarDate(year, month, day)) continue;
    const raw = match[0];
    const start = match.index;
    pushCandidate(target, text, {
      kind: 'date', raw, normalized: isoDate(year, month, day), start, end: start + raw.length, evidence: 'validated',
    });
  }

  const isoPattern = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  for (const match of text.matchAll(isoPattern)) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!isValidCalendarDate(year, month, day)) continue;
    const raw = match[0];
    const start = match.index;
    pushCandidate(target, text, {
      kind: 'date', raw, normalized: isoDate(year, month, day), start, end: start + raw.length, evidence: 'validated',
    });
  }
}

function collectMoney(text: string, target: DocumentTextSignalCandidate[]) {
  const moneyPattern = /(?:R\$|\bBRL\b)\s*\d[\d. ]*(?:,\d{1,2})?(?:\.\d{1,2})?/gi;
  for (const match of text.matchAll(moneyPattern)) {
    const untrimmed = match[0];
    const raw = untrimmed.trimEnd();
    const amountCents = moneyToCents(raw);
    if (amountCents === null) continue;
    const start = match.index;
    pushCandidate(target, text, {
      kind: 'money', raw, normalized: `BRL:${amountCents}`, amountCents, start, end: start + raw.length, evidence: 'explicit_label',
    });
  }
}

function collectPix(text: string, target: DocumentTextSignalCandidate[]) {
  const pixPattern = /(?:chave\s+pix|pix)\s*[:=-]\s*([A-Z0-9._+@:/-]{3,120})/gi;
  for (const match of text.matchAll(pixPattern)) {
    const raw = match[0];
    const value = match[1];
    const valueOffset = raw.lastIndexOf(value);
    const start = match.index + valueOffset;
    pushCandidate(target, text, {
      kind: 'pix_key', raw: value, normalized: value.toLowerCase(), start, end: start + value.length, evidence: 'explicit_label',
    });
  }
}

function collectBoleto(text: string, target: DocumentTextSignalCandidate[]) {
  const boletoPattern = /(?<!\d)(?:\d[\s.-]?){44,48}(?![\s.-]?\d)/g;
  for (const match of text.matchAll(boletoPattern)) {
    const untrimmed = match[0];
    const raw = untrimmed.replace(/[\s.-]+$/, '');
    const normalized = digitsOnly(raw);
    if (normalized.length !== 44 && normalized.length !== 47 && normalized.length !== 48) continue;
    const start = match.index;
    pushCandidate(target, text, {
      kind: 'boleto', raw, normalized, boletoDigits: normalized.length as 44 | 47 | 48,
      start, end: start + raw.length, evidence: 'pattern_only',
    });
  }
}

function deduplicateAndSort(candidates: DocumentTextSignalCandidate[]) {
  const unique = new Map<string, DocumentTextSignalCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.kind}|${candidate.start}|${candidate.end}|${candidate.normalized}`;
    if (!unique.has(key)) unique.set(key, candidate);
  }
  return [...unique.values()].sort((a, b) => a.start - b.start || a.end - b.end || a.kind.localeCompare(b.kind));
}

export function detectDocumentTextSignals(input: string): DocumentTextSignalsResult {
  const source = typeof input === 'string' ? input : '';
  const text = source.slice(0, DOCUMENT_TEXT_MAX_CHARACTERS);
  const candidates: DocumentTextSignalCandidate[] = [];

  if (text.trim()) {
    collectTaxIds(text, candidates);
    collectDates(text, candidates);
    collectMoney(text, candidates);
    collectPix(text, candidates);
    collectBoleto(text, candidates);
  }

  const ordered = deduplicateAndSort(candidates);
  const candidateLimitReached = ordered.length > DOCUMENT_TEXT_MAX_CANDIDATES;

  return {
    deterministic: true,
    inputCharacters: source.length,
    scannedCharacters: text.length,
    limited: source.length > DOCUMENT_TEXT_MAX_CHARACTERS || candidateLimitReached,
    candidateLimitReached,
    candidates: ordered.slice(0, DOCUMENT_TEXT_MAX_CANDIDATES),
  };
}
