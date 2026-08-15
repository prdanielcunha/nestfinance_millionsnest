import {
  COUNT_CAPTURE_DENOMINATION_CELL_KEYS,
  COUNT_CAPTURE_DENOMINATION_MAX_OBSERVATION_CHARS,
  COUNT_CAPTURE_DENOMINATION_TIMEOUT_MS,
  validateCountCaptureDenominationProviderResult,
  type CountCaptureDenominationProviderResult,
  type CountCaptureDenominationRegionInput,
} from '../../../shared/finance/countCaptureDenominations.js';

export type CountCaptureDenominationExtractionProviderResponse = {
  provider: 'gemini_interactions' | 'test';
  model: string;
  revision: string;
  result: CountCaptureDenominationProviderResult;
};

export interface CountCaptureDenominationExtractionProvider {
  extract(input: { regions: CountCaptureDenominationRegionInput[] }): Promise<CountCaptureDenominationExtractionProviderResponse>;
}

const TEST_PROVIDER_SYMBOL = Symbol.for('TEST_COUNT_CAPTURE_DENOMINATION_EXTRACTION_PROVIDER');
const GEMINI_INTERACTIONS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const PROVIDER_REVISION = 'count-sheet-denomination-quantities-json-v1';
const MAX_PROVIDER_RESPONSE_CHARS = 128 * 1024;

function buildResponseSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      fields: {
        type: 'array',
        minItems: COUNT_CAPTURE_DENOMINATION_CELL_KEYS.length,
        maxItems: COUNT_CAPTURE_DENOMINATION_CELL_KEYS.length,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            cellKey: { type: 'string', enum: [...COUNT_CAPTURE_DENOMINATION_CELL_KEYS] },
            status: { type: 'string', enum: ['recognized', 'uncertain', 'unreadable', 'blank'] },
            observation: { type: 'string', maxLength: COUNT_CAPTURE_DENOMINATION_MAX_OBSERVATION_CHARS },
          },
          required: ['cellKey', 'status', 'observation'],
        },
      },
    },
    required: ['fields'],
  };
}

function buildInput(regions: CountCaptureDenominationRegionInput[]) {
  const content: Array<Record<string, unknown>> = [{
    type: 'text',
    text: [
      'Read isolated denomination quantity cells from an official Count Sheet.',
      'Each image is already cropped to exactly one labeled quantity cell.',
      'Return only the integer quantity visibly written in that cell.',
      'Do not multiply by denomination, calculate subtotals, infer from other cells, reconcile counts, or invent missing values.',
      'Use recognized only when one non-negative integer quantity is unambiguous.',
      'Use uncertain when more than one reading is plausible, unreadable when marks exist but cannot be read, and blank when no quantity is present.',
      'Observation for recognized must contain only decimal digits exactly representing the visible quantity. For all other statuses do not guess.',
    ].join(' '),
  }];
  for (const region of regions) {
    content.push({ type: 'text', text: `Cell key: ${region.cellKey}` });
    content.push({ type: 'image', data: region.dataBase64, mime_type: region.mimeType });
  }
  return content;
}

function extractModelOutputText(payload: any): string {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.steps)) throw new Error('COUNT_CAPTURE_DENOMINATION_PROVIDER_INVALID_RESPONSE');
  const texts: string[] = [];
  for (const step of payload.steps) {
    if (!step || step.type !== 'model_output' || !Array.isArray(step.content)) continue;
    for (const item of step.content) if (item?.type === 'text' && typeof item.text === 'string') texts.push(item.text);
  }
  if (texts.length !== 1 || texts[0].length > MAX_PROVIDER_RESPONSE_CHARS) throw new Error('COUNT_CAPTURE_DENOMINATION_PROVIDER_INVALID_RESPONSE');
  return texts[0];
}

function productionProvider(): CountCaptureDenominationExtractionProvider {
  if (process.env.NESTFINANCE_COUNT_CAPTURE_AI_ENABLED !== 'true') return { async extract() { throw new Error('COUNT_CAPTURE_DENOMINATION_EXTRACTION_DISABLED'); } };
  const apiKey = process.env.GEMINI_API_KEY || '';
  const model = process.env.NESTFINANCE_COUNT_CAPTURE_VISION_MODEL || '';
  if (!apiKey || !model) return { async extract() { throw new Error('COUNT_CAPTURE_DENOMINATION_EXTRACTION_NOT_CONFIGURED'); } };

  return {
    async extract({ regions }) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), COUNT_CAPTURE_DENOMINATION_TIMEOUT_MS);
      try {
        const response = await fetch(GEMINI_INTERACTIONS_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            store: false,
            input: buildInput(regions),
            response_format: { type: 'text', mime_type: 'application/json', schema: buildResponseSchema() },
          }),
        });
        if (!response.ok) throw new Error('COUNT_CAPTURE_DENOMINATION_PROVIDER_UNAVAILABLE');
        const raw = await response.text();
        if (!raw || raw.length > MAX_PROVIDER_RESPONSE_CHARS) throw new Error('COUNT_CAPTURE_DENOMINATION_PROVIDER_INVALID_RESPONSE');
        let payload: unknown;
        try { payload = JSON.parse(raw); } catch { throw new Error('COUNT_CAPTURE_DENOMINATION_PROVIDER_INVALID_RESPONSE'); }
        const outputText = extractModelOutputText(payload);
        let output: unknown;
        try { output = JSON.parse(outputText); } catch { throw new Error('COUNT_CAPTURE_DENOMINATION_PROVIDER_INVALID_RESPONSE'); }
        return { provider: 'gemini_interactions' as const, model, revision: PROVIDER_REVISION, result: validateCountCaptureDenominationProviderResult(output) };
      } catch (error: any) {
        if (error?.name === 'AbortError') throw new Error('COUNT_CAPTURE_DENOMINATION_PROVIDER_TIMEOUT');
        const message = String(error?.message || '');
        if (message.startsWith('COUNT_CAPTURE_DENOMINATION_')) throw error;
        throw new Error('COUNT_CAPTURE_DENOMINATION_PROVIDER_UNAVAILABLE');
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function getCountCaptureDenominationExtractionProvider(): CountCaptureDenominationExtractionProvider {
  if (process.env.NODE_ENV === 'test') {
    const injected = (globalThis as any)[TEST_PROVIDER_SYMBOL];
    if (injected) return injected as CountCaptureDenominationExtractionProvider;
  }
  return productionProvider();
}
