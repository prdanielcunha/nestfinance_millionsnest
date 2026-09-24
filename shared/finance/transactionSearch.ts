export const TRANSACTION_SEARCH_SCHEMA_VERSION = 1 as const;
export const TRANSACTION_SEARCH_MIN_QUERY_LENGTH = 2 as const;
export const TRANSACTION_SEARCH_MAX_QUERY_LENGTH = 64 as const;
export const TRANSACTION_SEARCH_MAX_KEYS = 256 as const;
export const TRANSACTION_SEARCH_MAX_PREFIX_LENGTH = 24 as const;

export type TransactionSearchDocument = {
  transactionId: string;
  organizationId: string;
  financeEntityId: string;
  sourceVersion: number;
  searchKeys: string[];
  schemaVersion: typeof TRANSACTION_SEARCH_SCHEMA_VERSION;
  updatedAt?: unknown;
};

function stripDiacritics(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '');
}

export function normalizeTransactionSearchText(value: unknown) {
  if (typeof value !== 'string') return '';
  return stripDiacritics(value)
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function transactionSearchTokens(values: unknown[]) {
  const output: string[] = [];
  for (const value of values) {
    const normalized = normalizeTransactionSearchText(value);
    if (!normalized) continue;
    for (const token of normalized.split(' ')) {
      if (token.length < TRANSACTION_SEARCH_MIN_QUERY_LENGTH) continue;
      if (!output.includes(token)) output.push(token);
    }
  }
  return output;
}

function amountSearchValues(value: unknown) {
  const cents = Number(value);
  if (!Number.isInteger(cents)) return [];
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, '0');
  return [
    String(whole),
    fraction,
    String(absolute),
    `${whole},${fraction}`,
    `${whole}.${fraction}`,
  ];
}

function dateSearchValues(value: unknown) {
  let iso = '';
  if (typeof value === 'string') {
    iso = value;
  } else if (value && typeof (value as any).toDate === 'function') {
    try {
      iso = (value as any).toDate().toISOString();
    } catch {
      return [];
    }
  }
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/u);
  if (!match) return [];
  const [, year, month, day] = match;
  return [
    day,
    month,
    year,
    `${day}/${month}`,
    `${day}/${month}/${year}`,
    `${day}${month}`,
    `${day}${month}${year}`,
  ];
}

function transactionSearchValues(transaction: Record<string, any>) {
  return [
    transaction.id,
    transaction.transactionId,
    transaction.description,
    transaction.counterparty,
    transaction.paymentMethod,
    transaction.sourceContext,
    transaction.accountId,
    transaction.sourceAccountId,
    transaction.destinationAccountId,
    transaction.liabilityAccountId,
    transaction.accountSnapshot?.name,
    transaction.liabilityAccountSnapshot?.name,
    ...amountSearchValues(transaction.amountCents),
    ...dateSearchValues(transaction.occurredAt),
  ];
}

export function buildTransactionSearchKeys(transaction: Record<string, any>) {
  const tokens = transactionSearchTokens(transactionSearchValues(transaction));

  const keys = new Set<string>();
  for (const token of tokens) {
    const maximum = Math.min(token.length, TRANSACTION_SEARCH_MAX_PREFIX_LENGTH);
    for (
      let length = TRANSACTION_SEARCH_MIN_QUERY_LENGTH;
      length <= maximum;
      length += 1
    ) {
      keys.add(token.slice(0, length));
      if (keys.size >= TRANSACTION_SEARCH_MAX_KEYS) {
        return [...keys].sort();
      }
    }
  }
  return [...keys].sort();
}

export function normalizeTransactionSearchQuery(value: unknown) {
  const normalized = normalizeTransactionSearchText(value);
  if (
    normalized.length < TRANSACTION_SEARCH_MIN_QUERY_LENGTH ||
    normalized.length > TRANSACTION_SEARCH_MAX_QUERY_LENGTH
  ) {
    return null;
  }
  const tokens = normalized
    .split(' ')
    .filter((token) => token.length >= TRANSACTION_SEARCH_MIN_QUERY_LENGTH)
    .slice(0, 8);
  if (tokens.length === 0) return null;
  return {
    normalized,
    tokens,
    lookupKey: tokens[0].slice(0, TRANSACTION_SEARCH_MAX_PREFIX_LENGTH),
  };
}

export function transactionMatchesSearchQuery(
  transaction: Record<string, any>,
  query: string,
) {
  const normalizedQuery = normalizeTransactionSearchQuery(query);
  if (!normalizedQuery) return false;
  const candidateTokens = transactionSearchTokens(
    transactionSearchValues(transaction),
  );

  return normalizedQuery.tokens.every((queryToken) =>
    candidateTokens.some((candidate) => candidate.startsWith(queryToken)),
  );
}


export type TransactionNaturalQuery = {
  original: string;
  residualQuery: string;
  understood: boolean;
  filters: {
    direction?: 'income' | 'expense' | 'transfer' | 'liability_settlement';
    status?: 'draft' | 'ready_for_review' | 'approved_for_posting' | 'posted' | 'reversed';
    occurredFrom?: string;
    occurredTo?: string;
    amountMinCents?: number;
    amountMaxCents?: number;
  };
  labels: string[];
};

const MONTHS: Record<string, number> = {
  janeiro:1, jan:1, january:1, enero:1,
  fevereiro:2, fev:2, february:2, feb:2, febrero:2,
  marco:3, mar:3, march:3, marzo:3,
  abril:4, abr:4, april:4,
  maio:5, may:5, mayo:5,
  junho:6, jun:6, june:6, junio:6,
  julho:7, jul:7, july:7, julio:7,
  agosto:8, ago:8, august:8,
  setembro:9, set:9, september:9, sep:9, septiembre:9,
  outubro:10, out:10, october:10, oct:10, octubre:10,
  novembro:11, nov:11, november:11, noviembre:11,
  dezembro:12, dez:12, december:12, dec:12, diciembre:12,
};

function isoDate(year:number, month:number, day:number) {
  return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
function monthRange(year:number, month:number) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: isoDate(year,month,1), to: isoDate(year,month,last) };
}
function parseNaturalMoney(raw:string) {
  const cleaned = raw.replace(/\s/gu,'').replace(/r\$/giu,'');
  if (!cleaned) return null;
  let normalized=cleaned;
  if (cleaned.includes(',') && cleaned.includes('.')) normalized=cleaned.replace(/\./gu,'').replace(',','.');
  else if (cleaned.includes(',')) normalized=cleaned.replace(',','.');
  const value=Number(normalized);
  if (!Number.isFinite(value) || value < 0 || value > 999_999_999) return null;
  return Math.round(value*100);
}
function endOfLocalDayIso(date:Date) {
  return new Date(date.getFullYear(),date.getMonth(),date.getDate(),23,59,59,999).toISOString();
}
function startOfLocalDayIso(date:Date) {
  return new Date(date.getFullYear(),date.getMonth(),date.getDate(),0,0,0,0).toISOString();
}

/**
 * Deterministic, local natural-language parser. It never calls AI.
 * It only extracts filters we can prove and leaves all other words as residual text search.
 */
export function parseTransactionNaturalQuery(value: unknown, now = new Date()): TransactionNaturalQuery {
  const original = typeof value === 'string' ? value.trim().slice(0, TRANSACTION_SEARCH_MAX_QUERY_LENGTH) : '';
  const normalized = normalizeTransactionSearchText(original);
  const filters: TransactionNaturalQuery['filters'] = {};
  const labels:string[]=[];
  const consumed=new Set<string>();
  const tokens=normalized.split(' ').filter(Boolean);
  const consume=(...words:string[])=>words.forEach(w=>consumed.add(w));

  const directionMatchers:[RegExp,NonNullable<TransactionNaturalQuery['filters']['direction']>,string][]=[
    [/\b(entradas?|receitas?|income|incomes|ingresos?)\b/u,'income','entrada'],
    [/\b(saidas?|despesas?|expenses?|gastos?|egresos?)\b/u,'expense','saída'],
    [/\b(transferencias?|transfers?|traspasos?)\b/u,'transfer','transferência'],
  ];
  for(const [pattern,direction,label] of directionMatchers){
    const match=normalized.match(pattern);
    if(match){ filters.direction=direction; labels.push(label); consume(...match[0].split(' ')); break; }
  }

  const statusMatchers:[RegExp,NonNullable<TransactionNaturalQuery['filters']['status']>,string][]=[
    [/\b(rascunhos?|drafts?|borradores?)\b/u,'draft','rascunho'],
    [/\b(para conferir|aguardando revisao|needs review|to review|para revisar)\b/u,'ready_for_review','para conferir'],
    [/\b(aprovadas?|approved|aprobados?)\b/u,'approved_for_posting','aprovada'],
    [/\b(lancadas?|posted|contabilizadas?|registradas?)\b/u,'posted','lançada'],
    [/\b(revertidas?|reversed|revertidos?)\b/u,'reversed','revertida'],
  ];
  for(const [pattern,status,label] of statusMatchers){
    const match=normalized.match(pattern);
    if(match){ filters.status=status; labels.push(label); consume(...match[0].split(' ')); break; }
  }

  const todayWords=['hoje','today','hoy'];
  const yesterdayWords=['ontem','yesterday','ayer'];
  const thisMonthPhrases=['este mes','this month','mes atual','este mes'];
  if(todayWords.some(w=>tokens.includes(w))){
    const d=new Date(now);
    filters.occurredFrom=startOfLocalDayIso(d); filters.occurredTo=endOfLocalDayIso(d);
    labels.push('hoje'); todayWords.forEach(w=>consume(w));
  } else if(yesterdayWords.some(w=>tokens.includes(w))){
    const d=new Date(now); d.setDate(d.getDate()-1);
    filters.occurredFrom=startOfLocalDayIso(d); filters.occurredTo=endOfLocalDayIso(d);
    labels.push('ontem'); yesterdayWords.forEach(w=>consume(w));
  } else if(thisMonthPhrases.some(p=>normalized.includes(p))){
    const range=monthRange(now.getFullYear(),now.getMonth()+1);
    filters.occurredFrom=range.from; filters.occurredTo=range.to; labels.push('mês atual');
    consume('este','mes','this','month','atual');
  } else {
    for(const [name,month] of Object.entries(MONTHS)){
      if(!tokens.includes(name)) continue;
      const yearMatch=normalized.match(/\b(20\d{2})\b/u);
      const year=yearMatch?Number(yearMatch[1]):now.getFullYear();
      const range=monthRange(year,month);
      filters.occurredFrom=range.from; filters.occurredTo=range.to;
      labels.push(`${name} ${year}`);
      consume(name);
      if(yearMatch) consume(yearMatch[1]);
      break;
    }
  }

  const between=normalized.match(/\b(?:entre|between)\s+(?:r\$?\s*)?([0-9][0-9.,]*)\s+(?:e|and|y)\s+(?:r\$?\s*)?([0-9][0-9.,]*)\b/u);
  if(between){
    const a=parseNaturalMoney(between[1]), b=parseNaturalMoney(between[2]);
    if(a!==null&&b!==null){
      filters.amountMinCents=Math.min(a,b); filters.amountMaxCents=Math.max(a,b);
      labels.push(`valor ${Math.min(a,b)/100}–${Math.max(a,b)/100}`);
      consume('entre','between','e','and','y',between[1],between[2]);
    }
  } else {
    const over=normalized.match(/\b(?:acima de|mais de|maior que|over|above|more than|mas de|mayor que)\s+(?:r\$?\s*)?([0-9][0-9.,]*)\b/u);
    if(over){
      const cents=parseNaturalMoney(over[1]);
      if(cents!==null){ filters.amountMinCents=cents+1; labels.push(`acima de ${cents/100}`); consume('acima','de','mais','maior','que','over','above','more','than','mas','mayor',over[1]); }
    }
    const under=normalized.match(/\b(?:ate|abaixo de|menos de|menor que|under|below|less than|hasta|menos de|menor que)\s+(?:r\$?\s*)?([0-9][0-9.,]*)\b/u);
    if(under){
      const cents=parseNaturalMoney(under[1]);
      if(cents!==null){ filters.amountMaxCents=Math.max(0,cents-1); labels.push(`abaixo de ${cents/100}`); consume('ate','abaixo','de','menos','menor','que','under','below','less','than','hasta',under[1]); }
    }
  }

  const filler=new Set(['de','do','da','dos','das','em','no','na','nos','nas','com','por','the','of','in','on','from','del','de','en','con']);
  const residual=tokens.filter(token=>!consumed.has(token)&&!filler.has(token)).join(' ').trim();
  const understood=Object.keys(filters).length>0;
  return { original, residualQuery: residual, understood, filters, labels };
}
