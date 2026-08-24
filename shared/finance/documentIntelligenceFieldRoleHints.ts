import type {
  DocumentTextSignalCandidate,
  DocumentTextSignalsResult,
} from './documentIntelligenceTextSignals.js';

export const DOCUMENT_FIELD_ROLE_PREFIX_MAX_CHARACTERS = 96;

export type DocumentFieldRoleHint =
  | 'issue_date'
  | 'due_date'
  | 'total_amount'
  | 'issuer_tax_id'
  | 'recipient_tax_id'
  | 'payment_code'
  | 'pix_key';

export type DocumentFieldRoleReviewCandidate = {
  signal: DocumentTextSignalCandidate;
  roleHint: DocumentFieldRoleHint | null;
  roleEvidence: 'explicit_label' | null;
  matchedLabel: string | null;
  semanticState: 'unconfirmed';
  requiresConfirmation: true;
  source: 'native_text';
  derivedBy: 'deterministic_rule';
  ocrUsed: false;
  aiUsed: false;
  userConfirmed: false;
};

export type DocumentFieldRoleHintsResult = {
  deterministic: true;
  candidates: DocumentFieldRoleReviewCandidate[];
  hintedCandidates: number;
};

type RoleRule = {
  roleHint: DocumentFieldRoleHint;
  kinds: ReadonlySet<DocumentTextSignalCandidate['kind']>;
  labelPattern: RegExp;
};

const DATE_KINDS = new Set<DocumentTextSignalCandidate['kind']>(['date']);
const MONEY_KINDS = new Set<DocumentTextSignalCandidate['kind']>(['money']);
const TAX_ID_KINDS = new Set<DocumentTextSignalCandidate['kind']>(['cpf', 'cnpj']);
const BOLETO_KINDS = new Set<DocumentTextSignalCandidate['kind']>(['boleto']);

const ROLE_RULES: readonly RoleRule[] = [
  {
    roleHint: 'due_date',
    kinds: DATE_KINDS,
    labelPattern: /\b(?:data\s+de\s+vencimento|vencimento|due\s+date|fecha\s+de\s+vencimiento)\b[\s:=-]{0,16}$/iu,
  },
  {
    roleHint: 'issue_date',
    kinds: DATE_KINDS,
    labelPattern: /\b(?:data\s+de\s+emiss[aã]o|emiss[aã]o|issue\s+date|fecha\s+de\s+emisi[oó]n)\b[\s:=-]{0,16}$/iu,
  },
  {
    roleHint: 'total_amount',
    kinds: MONEY_KINDS,
    labelPattern: /\b(?:valor\s+total|total\s+a\s+pagar|total\s+amount|amount\s+due|importe\s+total|total)\b[\s:=-]{0,16}$/iu,
  },
  {
    roleHint: 'issuer_tax_id',
    kinds: TAX_ID_KINDS,
    labelPattern: /\b(?:(?:cnpj|cpf)\s+(?:do\s+)?emitente|emitente\s+(?:cnpj|cpf)|issuer\s+(?:tax\s+id|cnpj|cpf)|(?:tax\s+id|cnpj|cpf)\s+issuer|emisor\s+(?:cnpj|cpf)|(?:cnpj|cpf)\s+emisor)\b[\s:=-]{0,16}$/iu,
  },
  {
    roleHint: 'recipient_tax_id',
    kinds: TAX_ID_KINDS,
    labelPattern: /\b(?:(?:cnpj|cpf)\s+(?:do\s+)?destinat[aá]rio|destinat[aá]rio\s+(?:cnpj|cpf)|recipient\s+(?:tax\s+id|cnpj|cpf)|(?:tax\s+id|cnpj|cpf)\s+recipient|receptor\s+(?:cnpj|cpf)|(?:cnpj|cpf)\s+receptor)\b[\s:=-]{0,16}$/iu,
  },
  {
    roleHint: 'payment_code',
    kinds: BOLETO_KINDS,
    labelPattern: /\b(?:linha\s+digit[aá]vel|c[oó]digo\s+de\s+barras|digitable\s+line|barcode|l[ií]nea\s+digitable)\b[\s:=-]{0,16}$/iu,
  },
];

function sameLinePrefix(text: string, candidateStart: number) {
  const safeStart = Math.max(0, Math.min(candidateStart, text.length));
  const lineStart = text.lastIndexOf('\n', safeStart - 1) + 1;
  const boundedStart = Math.max(lineStart, safeStart - DOCUMENT_FIELD_ROLE_PREFIX_MAX_CHARACTERS);
  return text.slice(boundedStart, safeStart);
}

function findRoleHint(
  text: string,
  signal: DocumentTextSignalCandidate,
): Pick<DocumentFieldRoleReviewCandidate, 'roleHint' | 'roleEvidence' | 'matchedLabel'> {
  if (signal.kind === 'pix_key') {
    return { roleHint: 'pix_key', roleEvidence: 'explicit_label', matchedLabel: 'Pix' };
  }

  const prefix = sameLinePrefix(text, signal.start);
  for (const rule of ROLE_RULES) {
    if (!rule.kinds.has(signal.kind)) continue;
    const match = rule.labelPattern.exec(prefix);
    if (!match) continue;
    return {
      roleHint: rule.roleHint,
      roleEvidence: 'explicit_label',
      matchedLabel: match[0].trim().replace(/[\s:=-]+$/u, '').trim(),
    };
  }

  return { roleHint: null, roleEvidence: null, matchedLabel: null };
}

export function buildDocumentFieldRoleHints(
  input: string,
  signals: DocumentTextSignalsResult,
): DocumentFieldRoleHintsResult {
  const source = typeof input === 'string' ? input : '';
  const text = source.slice(0, Math.max(0, Math.min(signals.scannedCharacters, source.length)));
  const candidates = signals.candidates.map((signal) => {
    const role = signal.start >= 0 && signal.end <= text.length
      ? findRoleHint(text, signal)
      : { roleHint: null, roleEvidence: null, matchedLabel: null } as const;

    return {
      signal,
      ...role,
      semanticState: 'unconfirmed' as const,
      requiresConfirmation: true as const,
      source: 'native_text' as const,
      derivedBy: 'deterministic_rule' as const,
      ocrUsed: false as const,
      aiUsed: false as const,
      userConfirmed: false as const,
    };
  });

  return {
    deterministic: true,
    candidates,
    hintedCandidates: candidates.filter((candidate) => candidate.roleHint !== null).length,
  };
}
