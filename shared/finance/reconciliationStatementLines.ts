import { detectDocumentTextSignals } from './documentIntelligenceTextSignals.js';

export const STATEMENT_PREPARATION_MAX_INPUT_CHARACTERS = 100_000;
export const STATEMENT_PREPARATION_MAX_SOURCE_LINES = 2_000;
export const STATEMENT_PREPARATION_MAX_CANDIDATE_LINES = 500;
export const STATEMENT_PREPARATION_MAX_LINE_CHARACTERS = 500;

export type StatementLineDirection = 'inflow' | 'outflow' | 'unknown';
export type StatementLineDirectionEvidence =
  | 'plus_sign'
  | 'minus_sign'
  | 'credit_marker'
  | 'debit_marker'
  | 'none';

export type StatementLineParseState =
  | 'prepared'
  | 'needs_direction_confirmation'
  | 'needs_amount_choice'
  | 'needs_date_choice';

export type StatementLineDateCandidate = {
  raw: string;
  normalized: string;
  start: number;
  end: number;
  evidence: 'validated';
};

export type StatementLineAmountCandidate = {
  raw: string;
  normalized: string;
  amountCents: number;
  start: number;
  end: number;
  currency: 'BRL' | null;
  direction: StatementLineDirection;
  directionEvidence: StatementLineDirectionEvidence;
};

export type PreparedStatementLine = {
  lineNumber: number;
  raw: string;
  lineLimited: boolean;
  dateCandidates: StatementLineDateCandidate[];
  amountCandidates: StatementLineAmountCandidate[];
  selectedDate: string | null;
  selectedAmountCents: number | null;
  selectedDirection: StatementLineDirection;
  descriptionCandidate: string | null;
  parseState: StatementLineParseState;
  semanticState: 'unconfirmed';
  requiresConfirmation: true;
  source: 'native_text';
  derivedBy: 'deterministic_rule';
  aiUsed: false;
  ocrUsed: false;
  userConfirmed: false;
};

export type StatementLinePreparationResult = {
  deterministic: true;
  inputCharacters: number;
  scannedCharacters: number;
  sourceLines: number;
  scannedLines: number;
  candidateLines: number;
  ignoredLines: number;
  preparedLines: number;
  needsConfirmationLines: number;
  limited: boolean;
  inputLimited: boolean;
  sourceLineLimitReached: boolean;
  candidateLimitReached: boolean;
  lines: PreparedStatementLine[];
};

const CREDIT_MARKERS = new Set([
  'C',
  'CR',
  'CRED',
  'CREDITO',
  'CRÉDITO',
  'CREDIT',
]);

const DEBIT_MARKERS = new Set([
  'D',
  'DB',
  'DEB',
  'DEBITO',
  'DÉBITO',
  'DEBIT',
]);

function normalizeDirectionMarker(value: string | undefined) {
  return (value || '').trim().toUpperCase();
}

function parseDecimalToCents(value: string) {
  const compact = value.replace(/\s+/gu, '');
  if (/^(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/u.test(compact)) {
    const normalized = compact.replace(/\./gu, '').replace(',', '.');
    const amount = Number(normalized);
    const cents = Math.round(amount * 100);
    return Number.isSafeInteger(cents) ? cents : null;
  }

  if (/^(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$/u.test(compact)) {
    const normalized = compact.replace(/,/gu, '');
    const amount = Number(normalized);
    const cents = Math.round(amount * 100);
    return Number.isSafeInteger(cents) ? cents : null;
  }

  return null;
}

function directionFor(input: {
  sign?: string;
  marker?: string;
}): Pick<StatementLineAmountCandidate, 'direction' | 'directionEvidence'> {
  if (input.sign === '+') {
    return { direction: 'inflow', directionEvidence: 'plus_sign' };
  }
  if (input.sign === '-') {
    return { direction: 'outflow', directionEvidence: 'minus_sign' };
  }

  const marker = normalizeDirectionMarker(input.marker);
  if (CREDIT_MARKERS.has(marker)) {
    return { direction: 'inflow', directionEvidence: 'credit_marker' };
  }
  if (DEBIT_MARKERS.has(marker)) {
    return { direction: 'outflow', directionEvidence: 'debit_marker' };
  }
  return { direction: 'unknown', directionEvidence: 'none' };
}

function amountCandidatesFor(line: string): StatementLineAmountCandidate[] {
  const pattern =
    /(?<![\d.,])(?<sign>[+-])?\s*(?:(?<currency>R\$|BRL)\s*)?(?<amount>(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}|(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})(?![\d.,])(?:\s*(?<marker>CRÉDITO|CREDITO|CREDIT|CRED|CR|C|DÉBITO|DEBITO|DEBIT|DEB|DB|D)\b)?/giu;

  const candidates: StatementLineAmountCandidate[] = [];
  for (const match of line.matchAll(pattern)) {
    const groups = match.groups || {};
    const amountRaw = groups.amount;
    if (!amountRaw) continue;

    const amountCents = parseDecimalToCents(amountRaw);
    if (amountCents === null) continue;

    const raw = match[0].trim();
    const leadingWhitespace = match[0].length - match[0].trimStart().length;
    const start = (match.index || 0) + leadingWhitespace;
    const end = start + raw.length;
    const direction = directionFor({ sign: groups.sign, marker: groups.marker });

    candidates.push({
      raw,
      normalized: `BRL:${amountCents}`,
      amountCents,
      start,
      end,
      currency: groups.currency ? 'BRL' : null,
      ...direction,
    });
  }

  const unique = new Map<string, StatementLineAmountCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.start}:${candidate.end}:${candidate.amountCents}:${candidate.direction}`;
    if (!unique.has(key)) unique.set(key, candidate);
  }
  return [...unique.values()].sort((a, b) => a.start - b.start || a.end - b.end);
}

function cleanDescription(value: string) {
  const normalized = value
    .replace(/^[\s|;:,.-]+/u, '')
    .replace(/[\s|;:,.-]+$/u, '')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!normalized || /^[CD]$/iu.test(normalized)) return null;
  return normalized.slice(0, 240);
}

function prepareOneLine(rawSource: string, lineNumber: number): PreparedStatementLine | null {
  const trimmed = rawSource.trim();
  if (!trimmed) return null;

  const lineLimited = trimmed.length > STATEMENT_PREPARATION_MAX_LINE_CHARACTERS;
  const raw = trimmed.slice(0, STATEMENT_PREPARATION_MAX_LINE_CHARACTERS);
  const signals = detectDocumentTextSignals(raw);
  const dateCandidates = signals.candidates
    .filter((candidate) => candidate.kind === 'date')
    .map((candidate) => ({
      raw: candidate.raw,
      normalized: candidate.normalized,
      start: candidate.start,
      end: candidate.end,
      evidence: 'validated' as const,
    }));

  if (dateCandidates.length === 0) return null;

  const amountCandidates = amountCandidatesFor(raw);
  if (amountCandidates.length === 0) return null;

  const selectedDate = dateCandidates.length === 1 ? dateCandidates[0].normalized : null;
  const selectedAmount = amountCandidates.length === 1 ? amountCandidates[0] : null;

  let parseState: StatementLineParseState;
  if (dateCandidates.length > 1) {
    parseState = 'needs_date_choice';
  } else if (amountCandidates.length > 1) {
    parseState = 'needs_amount_choice';
  } else if (selectedAmount?.direction === 'unknown') {
    parseState = 'needs_direction_confirmation';
  } else {
    parseState = 'prepared';
  }

  const firstDate = dateCandidates[0];
  const firstAmount = amountCandidates[0];
  const descriptionCandidate =
    firstDate && firstAmount && firstAmount.start > firstDate.end
      ? cleanDescription(raw.slice(firstDate.end, firstAmount.start))
      : null;

  return {
    lineNumber,
    raw,
    lineLimited,
    dateCandidates,
    amountCandidates,
    selectedDate,
    selectedAmountCents: selectedAmount?.amountCents ?? null,
    selectedDirection: selectedAmount?.direction ?? 'unknown',
    descriptionCandidate,
    parseState,
    semanticState: 'unconfirmed',
    requiresConfirmation: true,
    source: 'native_text',
    derivedBy: 'deterministic_rule',
    aiUsed: false,
    ocrUsed: false,
    userConfirmed: false,
  };
}

export function prepareStatementLines(input: string): StatementLinePreparationResult {
  const source = typeof input === 'string' ? input : '';
  const inputLimited = source.length > STATEMENT_PREPARATION_MAX_INPUT_CHARACTERS;
  const text = source.slice(0, STATEMENT_PREPARATION_MAX_INPUT_CHARACTERS);
  const allSourceLines = text.split(/\r?\n/u);
  const sourceLineLimitReached = allSourceLines.length > STATEMENT_PREPARATION_MAX_SOURCE_LINES;
  const sourceLines = allSourceLines.slice(0, STATEMENT_PREPARATION_MAX_SOURCE_LINES);

  const lines: PreparedStatementLine[] = [];
  let anyLineLimited = false;

  for (let index = 0; index < sourceLines.length; index += 1) {
    const candidate = prepareOneLine(sourceLines[index], index + 1);
    if (!candidate) continue;
    if (candidate.lineLimited) anyLineLimited = true;
    lines.push(candidate);
    if (lines.length >= STATEMENT_PREPARATION_MAX_CANDIDATE_LINES) break;
  }

  const candidateLimitReached =
    lines.length >= STATEMENT_PREPARATION_MAX_CANDIDATE_LINES &&
    sourceLines.slice(lines.at(-1)?.lineNumber || 0).some((line, index) =>
      prepareOneLine(line, (lines.at(-1)?.lineNumber || 0) + index + 1) !== null
    );

  const preparedLines = lines.filter((line) => line.parseState === 'prepared').length;

  return {
    deterministic: true,
    inputCharacters: source.length,
    scannedCharacters: text.length,
    sourceLines: allSourceLines.length,
    scannedLines: sourceLines.length,
    candidateLines: lines.length,
    ignoredLines: Math.max(0, sourceLines.length - lines.length),
    preparedLines,
    needsConfirmationLines: lines.length - preparedLines,
    limited:
      inputLimited ||
      sourceLineLimitReached ||
      candidateLimitReached ||
      anyLineLimited,
    inputLimited,
    sourceLineLimitReached,
    candidateLimitReached,
    lines,
  };
}
