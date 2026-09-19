import { GoogleGenAI } from '@google/genai';
import {
  DOCUMENT_TRANSACTION_PROVIDER_FIELD_KEYS,
  validateDocumentTransactionProviderResult,
  type DocumentTransactionCategoryOption,
  type DocumentTransactionProviderResult,
} from '../../../shared/finance/documentTransactionIntelligence.js';

export type DocumentTransactionProviderResponse = {
  provider: 'gemini_interactions' | 'vertex_genai' | 'test';
  model: string;
  revision: string;
  result: DocumentTransactionProviderResult;
};

export interface DocumentTransactionIntelligenceProvider {
  analyze(input: {
    bytes: Buffer;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
    categories: DocumentTransactionCategoryOption[];
    locale: 'PT' | 'EN' | 'ES';
  }): Promise<DocumentTransactionProviderResponse>;
}

const TEST_PROVIDER_SYMBOL = Symbol.for('TEST_DOCUMENT_TRANSACTION_INTELLIGENCE_PROVIDER');
const GEMINI_INTERACTIONS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const PROVIDER_REVISION = 'document-to-draft-structured-v2';
const MAX_PROVIDER_RESPONSE_CHARS = 96 * 1024;
const MAX_CATEGORY_OPTIONS = 200;
const PROVIDER_TIMEOUT_MS = 30_000;

function buildSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      fields: {
        type: 'array',
        minItems: DOCUMENT_TRANSACTION_PROVIDER_FIELD_KEYS.length,
        maxItems: DOCUMENT_TRANSACTION_PROVIDER_FIELD_KEYS.length,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            key: { type: 'string', enum: [...DOCUMENT_TRANSACTION_PROVIDER_FIELD_KEYS] },
            status: { type: 'string', enum: ['recognized', 'uncertain', 'absent'] },
            observation: { type: 'string', maxLength: 240 },
          },
          required: ['key', 'status', 'observation'],
        },
      },
    },
    required: ['fields'],
  };
}

function catalogText(categories: DocumentTransactionCategoryOption[]) {
  if (categories.length > MAX_CATEGORY_OPTIONS) {
    return 'Category catalog is too large for a safe bounded suggestion. Return category_id as absent.';
  }
  if (categories.length === 0) return 'No active categories are available. Return category_id as absent.';
  return [
    'Allowed active categories. category_id may use ONLY one exact id from this list when the document meaning clearly matches:',
    ...categories.map((category) => `- ${category.id} | ${category.kind} | ${category.name}`),
  ].join('\n');
}

function prompt(categories: DocumentTransactionCategoryOption[], locale: 'PT' | 'EN' | 'ES') {
  const descriptionLanguage = locale === 'PT' ? 'Brazilian Portuguese' : locale === 'ES' ? 'natural Spanish' : 'natural English';
  return [
    'Analyze exactly ONE financial evidence file for a church finance workflow.',
    'This engine must work across many document shapes, not only retail receipts. Examples include fiscal receipts, invoices, service invoices, utility bills, payment proofs, Pix/transfer receipts, bank slips, card slips, donation receipts, reimbursements, tax documents, statements, contract charges and unfamiliar documents.',
    'Your output is only a non-authoritative proposal. A human must confirm before any financial draft exists.',
    'Read only what is visibly supported by the supplied image or PDF. Never invent tax IDs, amounts, dates, party roles, payment status, payment method, document numbers, transaction direction, or category.',
    'A multi-page PDF can still be ONE document. document_multiplicity=multiple only when the file contains two or more independent financial records that should not become one transaction.',
    'Return exactly one field object for every required key.',
    '',
    'Field rules:',
    '- document_type observation must be one of: receipt, fiscal_receipt, invoice, service_invoice, utility_bill, payment_proof, pix_receipt, bank_transfer_receipt, bank_slip, card_slip, donation_receipt, reimbursement_receipt, tax_document, statement, contract_charge, other, unknown.',
    '- transaction_kind observation must be expense, income, transfer, non_transaction, or unknown. Use transfer only when money is clearly moving between accounts rather than representing income/expense. Use non_transaction for quote/order/statement-like evidence that does not prove a single financial event.',
    '- counterparty_name is the OTHER economic party relative to the church-side transaction when that can be supported. For an expense this is commonly supplier/payee; for an income this is commonly payer/donor/customer. If direction or party is unclear, mark uncertain rather than guessing.',
    '- issuer_tax_id: only a CNPJ explicitly attributable to issuer/provider/seller. Do not copy an unlabeled CNPJ into multiple roles.',
    '- recipient_tax_id: only a CNPJ explicitly attributable to recipient/customer/consumer/buyer/tomador/destinatário/receptor.',
    '- payer_tax_id: only a CNPJ explicitly attributable to payer/debtor/source of payment.',
    '- payee_tax_id: only a CNPJ explicitly attributable to beneficiary/payee/receiver/creditor.',
    '- document_number: fiscal/document/invoice/receipt identifier when explicitly visible. Do not use authorization codes, terminal IDs or card fragments as document number.',
    '- total_amount: the final financial total for this one document. Never use subtotal, tax total, discount, unit price, installment value or change as the final total unless the document explicitly identifies it as the transaction total.',
    '- currency observation must be one of: BRL, USD, EUR, GBP, ARS, CLP, COP, MXN, other, unknown. Use BRL only when R$, BRL or Brazilian fiscal context clearly supports it; never assume BRL just because the interface is Brazilian.',
    '- occurred_at: transaction/payment/purchase/issue date that best represents the actual financial event. Preserve a visible date as YYYY-MM-DD or DD/MM/YYYY. If several dates conflict and event date is unclear, mark uncertain.',
    '- due_date: payment due date only when explicitly shown. This is not the occurred_at date unless they are actually the same event date.',
    '- settlement_state observation must be paid, unpaid, or unknown. A payment proof, successful Pix/transfer receipt or completed card/retail receipt can be paid when the document supports completion. An invoice, utility bill, bank slip or charge without payment evidence is unpaid or unknown; never infer payment merely because an amount is due.',
    '- payment_method observation must be one of: cash, pix, bank_transfer, bank_deposit, debit_card, credit_card, prepaid_card, bank_slip, check, automatic_debit, other, unknown.',
    `- description: a short factual description in ${descriptionLanguage}, based only on the document content. Summarize what the financial event is about without adding accounting interpretation that is not present.`,
    '- category_id: choose only from the supplied active category IDs and only when the document meaning clearly matches the category AND the category direction matches transaction_kind. Otherwise absent or uncertain.',
    '- document_multiplicity observation must be single, multiple, or uncertain.',
    '',
    'Status rules:',
    '- recognized: one reading/meaning is well supported by visible evidence.',
    '- uncertain: some evidence exists but multiple readings/roles/values are plausible.',
    '- absent: the field is not present or cannot be supported.',
    '- For uncertain/absent fields, observation should be empty or a very short reason; never guess.',
    '',
    'Identity safety:',
    '- The system compares observed CNPJs to the active church on the server. Do not decide whether a CNPJ belongs to the church.',
    '- Preserve party roles exactly. On expenses the church may appear as recipient/buyer or payer; on income it may appear as payee/beneficiary, recipient, or issuer of a service invoice.',
    '- Never relabel another party CNPJ as the church CNPJ just to make the document fit.',
    '',
    catalogText(categories),
  ].join('\n');
}
function extractInteractionsText(payload: any) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.steps)) {
    throw new Error('DOCUMENT_ANALYSIS_PROVIDER_INVALID_RESPONSE');
  }
  const texts: string[] = [];
  for (const step of payload.steps) {
    if (!step || step.type !== 'model_output' || !Array.isArray(step.content)) continue;
    for (const item of step.content) {
      if (item?.type === 'text' && typeof item.text === 'string') texts.push(item.text);
    }
  }
  if (texts.length !== 1 || texts[0].length > MAX_PROVIDER_RESPONSE_CHARS) {
    throw new Error('DOCUMENT_ANALYSIS_PROVIDER_INVALID_RESPONSE');
  }
  return texts[0];
}

function mediaInput(bytes: Buffer, mimeType: string) {
  return mimeType === 'application/pdf'
    ? { type: 'document', data: bytes.toString('base64'), mime_type: mimeType }
    : { type: 'image', data: bytes.toString('base64'), mime_type: mimeType };
}

async function callGeminiDeveloperApi(input: {
  bytes: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  categories: DocumentTransactionCategoryOption[];
  locale: 'PT' | 'EN' | 'ES';
  apiKey: string;
  model: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(GEMINI_INTERACTIONS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': input.apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: input.model,
        store: false,
        input: [
          { type: 'text', text: prompt(input.categories, input.locale) },
          mediaInput(input.bytes, input.mimeType),
        ],
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: buildSchema(),
        },
      }),
    });
    if (!response.ok) throw new Error('DOCUMENT_ANALYSIS_PROVIDER_UNAVAILABLE');
    const raw = await response.text();
    if (!raw || raw.length > MAX_PROVIDER_RESPONSE_CHARS) throw new Error('DOCUMENT_ANALYSIS_PROVIDER_INVALID_RESPONSE');
    let payload: any;
    try { payload = JSON.parse(raw); } catch { throw new Error('DOCUMENT_ANALYSIS_PROVIDER_INVALID_RESPONSE'); }
    const outputText = extractInteractionsText(payload);
    let output: unknown;
    try { output = JSON.parse(outputText); } catch { throw new Error('DOCUMENT_ANALYSIS_PROVIDER_INVALID_RESPONSE'); }
    return validateDocumentTransactionProviderResult(output);
  } catch (error: any) {
    if (error?.name === 'AbortError') throw new Error('DOCUMENT_ANALYSIS_PROVIDER_TIMEOUT');
    const message = String(error?.message || '');
    if (message.startsWith('DOCUMENT_ANALYSIS_')) throw error;
    throw new Error('DOCUMENT_ANALYSIS_PROVIDER_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
}

async function callVertexAi(input: {
  bytes: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  categories: DocumentTransactionCategoryOption[];
  locale: 'PT' | 'EN' | 'ES';
  project: string;
  location: string;
  model: string;
}) {
  const ai = new GoogleGenAI({
    vertexai: true,
    project: input.project,
    location: input.location,
  });
  const mediaPart = {
    inlineData: {
      data: input.bytes.toString('base64'),
      mimeType: input.mimeType,
    },
  };
  try {
    const response: any = await Promise.race([
      (ai.models as any).generateContent({
        model: input.model,
        contents: [{
          role: 'user',
          parts: [{ text: prompt(input.categories, input.locale) }, mediaPart],
        }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: buildSchema(),
          temperature: 0,
        },
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DOCUMENT_ANALYSIS_PROVIDER_TIMEOUT')), PROVIDER_TIMEOUT_MS)),
    ]);
    const outputText = typeof response?.text === 'string'
      ? response.text
      : typeof response?.text === 'function'
        ? response.text()
        : '';
    if (!outputText || outputText.length > MAX_PROVIDER_RESPONSE_CHARS) {
      throw new Error('DOCUMENT_ANALYSIS_PROVIDER_INVALID_RESPONSE');
    }
    let output: unknown;
    try { output = JSON.parse(outputText); } catch { throw new Error('DOCUMENT_ANALYSIS_PROVIDER_INVALID_RESPONSE'); }
    return validateDocumentTransactionProviderResult(output);
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message.startsWith('DOCUMENT_ANALYSIS_')) throw error;
    throw new Error('DOCUMENT_ANALYSIS_PROVIDER_UNAVAILABLE');
  }
}

function productionProvider(): DocumentTransactionIntelligenceProvider {
  return {
    async analyze(input) {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
      const model =
        process.env.NESTFINANCE_DOCUMENT_VISION_MODEL ||
        process.env.NESTFINANCE_COUNT_CAPTURE_VISION_MODEL ||
        'gemini-2.5-flash';

      if (apiKey) {
        const result = await callGeminiDeveloperApi({ ...input, apiKey, model });
        return { provider: 'gemini_interactions', model, revision: PROVIDER_REVISION, result };
      }

      const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || '';
      const location = process.env.GOOGLE_CLOUD_LOCATION || 'global';
      if (!project) throw new Error('DOCUMENT_ANALYSIS_NOT_CONFIGURED');

      const result = await callVertexAi({ ...input, project, location, model });
      return { provider: 'vertex_genai', model, revision: PROVIDER_REVISION, result };
    },
  };
}

export function getDocumentTransactionIntelligenceProvider(): DocumentTransactionIntelligenceProvider {
  if (process.env.NODE_ENV === 'test') {
    const injected = (globalThis as any)[TEST_PROVIDER_SYMBOL];
    if (injected) return injected as DocumentTransactionIntelligenceProvider;
  }
  return productionProvider();
}

export const DOCUMENT_TRANSACTION_PROVIDER_REVISION = PROVIDER_REVISION;
