import type { UniversalEvidenceDocumentType } from './universalEvidenceReview.js';

export type UniversalInputDirection = 'income' | 'expense' | 'transfer' | null;
export type UniversalInputPaymentMethod =
  | 'cash'
  | 'pix'
  | 'bank_transfer'
  | 'debit_card'
  | 'credit_card'
  | 'bank_slip'
  | 'check'
  | null;

export type UniversalTextIntent = {
  direction: UniversalInputDirection;
  amountCents: number | null;
  occurredAt: string | null;
  paymentMethod: UniversalInputPaymentMethod;
  confidence: 'high' | 'medium' | 'low';
  sourceText: string;
};

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDate(text: string, now: Date) {
  const iso = text.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) {
    const candidate = `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
    const parsed = new Date(`${candidate}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) return candidate;
  }

  const br = text.match(/\b(0?[1-9]|[12]\d|3[01])[/-](0?[1-9]|1[0-2])(?:[/-](20\d{2}|\d{2}))?\b/);
  if (br) {
    const year = br[3]
      ? Number(br[3]) < 100
        ? 2000 + Number(br[3])
        : Number(br[3])
      : now.getFullYear();
    const candidate = `${year}-${String(br[2]).padStart(2, '0')}-${String(br[1]).padStart(2, '0')}`;
    const parsed = new Date(`${candidate}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) return candidate;
  }

  if (/\b(hoje|today|hoy)\b/.test(text)) return localIsoDate(now);
  if (/\b(ontem|yesterday|ayer)\b/.test(text)) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return localIsoDate(yesterday);
  }
  return null;
}

function parseAmountCents(text: string) {
  const explicit = text.match(/(?:r\$|brl|\$)\s*(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})|\d+(?:[.,]\d{1,2})?)/);
  const withoutDates = text
    .replace(/\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-](?:20)?\d{2})?\b/g, ' ');
  const candidates = explicit
    ? [explicit]
    : Array.from(withoutDates.matchAll(/\b(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})|\d+(?:[.,]\d{1,2})?)\b/g));
  if (!candidates.length) return null;

  for (const match of candidates) {
    let raw = String(match[1] || '').replace(/\s/g, '');
    if (!raw) continue;

    const hasComma = raw.includes(',');
    const hasDot = raw.includes('.');
    let normalized = raw;
    if (hasComma) normalized = raw.replace(/\./g, '').replace(',', '.');
    else if (hasDot) {
      const parts = raw.split('.');
      const last = parts[parts.length - 1];
      normalized = last.length <= 2 ? raw : raw.replace(/\./g, '');
    }

    const amount = Number(normalized);
    if (Number.isFinite(amount) && amount > 0 && amount <= 100_000_000) {
      return Math.round(amount * 100);
    }
  }
  return null;
}

export function parseUniversalTextIntent(rawText: string, now = new Date()): UniversalTextIntent {
  const sourceText = rawText.trim().slice(0, 1000);
  const text = normalize(sourceText);

  const transfer = /\b(transferi|transferencia|transferir|transfer|transferred|transferencia|traspase)\b/.test(text);
  const income = /\b(recebi|recebimento|entrada|entrou|dizimo|oferta|doacao|income|received|deposit received|ingreso|recibi|ofrenda|diezmo|donacion)\b/.test(text);
  const expense = /\b(paguei|pagamento|comprei|compra|despesa|saida|gastei|paid|payment|purchase|expense|spent|pague|gasto|compra|salida)\b/.test(text);

  let direction: UniversalInputDirection = null;
  if (transfer && !income && !expense) direction = 'transfer';
  else if (income && !expense) direction = 'income';
  else if (expense && !income) direction = 'expense';

  let paymentMethod: UniversalInputPaymentMethod = null;
  if (/\bpix\b/.test(text)) paymentMethod = 'pix';
  else if (/\b(dinheiro|cash|efectivo)\b/.test(text)) paymentMethod = 'cash';
  else if (/\b(transferencia bancaria|bank transfer|transferencia bancar)\b/.test(text)) paymentMethod = 'bank_transfer';
  else if (/\b(cartao de debito|debit card|tarjeta de debito)\b/.test(text)) paymentMethod = 'debit_card';
  else if (/\b(cartao de credito|credit card|tarjeta de credito)\b/.test(text)) paymentMethod = 'credit_card';
  else if (/\b(boleto|bank slip)\b/.test(text)) paymentMethod = 'bank_slip';
  else if (/\b(cheque|check)\b/.test(text)) paymentMethod = 'check';

  const amountCents = parseAmountCents(text);
  const occurredAt = parseDate(text, now);
  const recognized = [direction, amountCents, occurredAt].filter(Boolean).length;
  const confidence = recognized === 3 ? 'high' : recognized >= 2 ? 'medium' : 'low';

  return { direction, amountCents, occurredAt, paymentMethod, confidence, sourceText };
}

export function classifyUniversalDocumentIntent(input: {
  filename?: string | null;
  sharedText?: string | null;
}): UniversalEvidenceDocumentType {
  const text = normalize(`${input.filename || ''} ${input.sharedText || ''}`);

  if (/\b(extrato|statement|bank statement|estado de cuenta)\b/.test(text)) return 'bank_statement';
  if (/\b(darf|das|imposto|tributo|tax|fiscal tax)\b/.test(text)) return 'tax_document';
  if (/\b(nota fiscal|nf-e|nfe|invoice|fatura|factura)\b/.test(text)) return 'invoice';
  if (/\b(comprovante|pix|transferencia|payment proof|proof of payment|pago|pagamento|pago)\b/.test(text)) return 'payment_proof';
  if (/\b(recibo|receipt|ticket)\b/.test(text)) return 'receipt';
  return 'other';
}
