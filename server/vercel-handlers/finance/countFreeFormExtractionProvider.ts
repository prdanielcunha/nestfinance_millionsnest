import {
  COUNT_CAPTURE_EXTRACTION_MAX_OBSERVATION_CHARS,
  COUNT_CAPTURE_EXTRACTION_TIMEOUT_MS,
  validateCountCaptureProviderResult,
  type CountCaptureProviderResult,
} from '../../../shared/finance/countCaptureExtraction.js';

export type CountFreeFormExtractionProviderResponse = {
  provider: 'gemini_interactions' | 'test';
  model: string;
  revision: string;
  result: CountCaptureProviderResult;
};

export interface CountFreeFormExtractionProvider {
  extract(input: {
    bytes: Buffer;
    mimeType: 'image/jpeg' | 'image/webp';
    locale: 'PT' | 'EN' | 'ES';
  }): Promise<CountFreeFormExtractionProviderResponse>;
}

const TEST_PROVIDER_SYMBOL = Symbol.for('TEST_COUNT_FREE_FORM_EXTRACTION_PROVIDER');
const GEMINI_INTERACTIONS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const PROVIDER_REVISION = 'count-free-form-full-frame-v1';
const MAX_PROVIDER_RESPONSE_CHARS = 64 * 1024;

function schema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      fields: {
        type: 'array',
        minItems: 4,
        maxItems: 4,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            key: { type: 'string', enum: ['tithe', 'offering', 'other_income', 'pix'] },
            status: { type: 'string', enum: ['recognized', 'uncertain', 'unreadable', 'blank'] },
            observation: { type: 'string', maxLength: COUNT_CAPTURE_EXTRACTION_MAX_OBSERVATION_CHARS },
          },
          required: ['key', 'status', 'observation'],
        },
      },
    },
    required: ['fields'],
  };
}

function instruction(locale: 'PT' | 'EN' | 'ES') {
  const language = locale === 'PT' ? 'Portuguese' : locale === 'ES' ? 'Spanish' : 'English';
  return [
    'Read ONE informal church cash-count note from the full image.',
    'The note may be handwritten, printed, a notebook page, plain paper, calculator annotation, or another free-form layout.',
    'It is NOT an official Count Sheet. There are no fixed regions and no QR/layout identity to trust.',
    'Return exactly four fields: tithe, offering, other_income, pix.',
    'Use semantic labels in the image to associate amounts. Common concepts include dízimos/tithes/diezmos, ofertas/offerings/ofrendas, outras entradas/other income/otros ingresos, and Pix.',
    'Recognize synonyms only when the meaning is clear from the note. Do not classify an unlabeled number into a category.',
    'Do not add, subtract, reconcile, derive, total, or move values between categories.',
    'Do not infer Pix from a bank-like number or cash from a currency symbol.',
    'A zero is recognized only when zero is explicitly written for that category.',
    'If the same category has several line items and there is no explicit category total, mark uncertain; do not sum them.',
    'If there are two plausible values for one category, mark uncertain.',
    'Use unreadable when the label/category is clear but its amount cannot be read.',
    'Use blank when that category is not present in the note.',
    'Use recognized only when one category label and one amount are clearly associated.',
    'For recognized, observation must contain only the monetary value exactly as seen. For uncertain/unreadable/blank, keep observation empty or a very short reason.',
    `The review UI language is ${language}; however, read labels in any language actually visible in the image.`,
    'This is only an assisted suggestion. Never claim that values were verified or approved.',
  ].join(' ');
}

function extractText(payload: any): string {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.steps)) {
    throw new Error('COUNT_FREE_FORM_EXTRACTION_PROVIDER_INVALID_RESPONSE');
  }
  const texts: string[] = [];
  for (const step of payload.steps) {
    if (!step || step.type !== 'model_output' || !Array.isArray(step.content)) continue;
    for (const item of step.content) {
      if (item?.type === 'text' && typeof item.text === 'string') texts.push(item.text);
    }
  }
  if (texts.length !== 1 || texts[0].length > MAX_PROVIDER_RESPONSE_CHARS) {
    throw new Error('COUNT_FREE_FORM_EXTRACTION_PROVIDER_INVALID_RESPONSE');
  }
  return texts[0];
}

function productionProvider(): CountFreeFormExtractionProvider {
  if (process.env.NESTFINANCE_COUNT_CAPTURE_AI_ENABLED !== 'true') {
    return { async extract() { throw new Error('COUNT_FREE_FORM_EXTRACTION_DISABLED'); } };
  }
  const apiKey = process.env.GEMINI_API_KEY || '';
  const model = process.env.NESTFINANCE_COUNT_CAPTURE_VISION_MODEL || '';
  if (!apiKey || !model) {
    return { async extract() { throw new Error('COUNT_FREE_FORM_EXTRACTION_NOT_CONFIGURED'); } };
  }

  return {
    async extract(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), COUNT_CAPTURE_EXTRACTION_TIMEOUT_MS);
      try {
        const response = await fetch(GEMINI_INTERACTIONS_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            store: false,
            input: [
              { type: 'text', text: instruction(input.locale) },
              { type: 'image', data: input.bytes.toString('base64'), mime_type: input.mimeType },
            ],
            response_format: { type: 'text', mime_type: 'application/json', schema: schema() },
          }),
        });
        if (!response.ok) throw new Error('COUNT_FREE_FORM_EXTRACTION_PROVIDER_UNAVAILABLE');
        const raw = await response.text();
        if (!raw || raw.length > MAX_PROVIDER_RESPONSE_CHARS) throw new Error('COUNT_FREE_FORM_EXTRACTION_PROVIDER_INVALID_RESPONSE');
        let payload: any;
        try { payload = JSON.parse(raw); } catch { throw new Error('COUNT_FREE_FORM_EXTRACTION_PROVIDER_INVALID_RESPONSE'); }
        let output: unknown;
        try { output = JSON.parse(extractText(payload)); } catch { throw new Error('COUNT_FREE_FORM_EXTRACTION_PROVIDER_INVALID_RESPONSE'); }
        return {
          provider: 'gemini_interactions',
          model,
          revision: PROVIDER_REVISION,
          result: validateCountCaptureProviderResult(output),
        };
      } catch (error: any) {
        if (error?.name === 'AbortError') throw new Error('COUNT_FREE_FORM_EXTRACTION_PROVIDER_TIMEOUT');
        const message = String(error?.message || '');
        if (message.startsWith('COUNT_FREE_FORM_')) throw error;
        throw new Error('COUNT_FREE_FORM_EXTRACTION_PROVIDER_UNAVAILABLE');
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function getCountFreeFormExtractionProvider(): CountFreeFormExtractionProvider {
  if (process.env.NODE_ENV === 'test') {
    const injected = (globalThis as any)[TEST_PROVIDER_SYMBOL];
    if (injected) return injected as CountFreeFormExtractionProvider;
  }
  return productionProvider();
}
