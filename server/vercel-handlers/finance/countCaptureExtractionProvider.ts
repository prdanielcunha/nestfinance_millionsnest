import {
  COUNT_CAPTURE_EXTRACTION_FIELD_KEYS,
  COUNT_CAPTURE_EXTRACTION_MAX_OBSERVATION_CHARS,
  COUNT_CAPTURE_EXTRACTION_TIMEOUT_MS,
  validateCountCaptureProviderResult,
  type CountCaptureExtractionRegionInput,
  type CountCaptureProviderResult,
} from '../../../shared/finance/countCaptureExtraction.js';

export type CountCaptureExtractionProviderResponse = {
  provider: 'gemini_interactions' | 'test';
  model: string;
  revision: string;
  result: CountCaptureProviderResult;
};

export interface CountCaptureExtractionProvider {
  extract(input: { regions: CountCaptureExtractionRegionInput[] }): Promise<CountCaptureExtractionProviderResponse>;
}

const TEST_PROVIDER_SYMBOL = Symbol.for('TEST_COUNT_CAPTURE_EXTRACTION_PROVIDER');
const GEMINI_INTERACTIONS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const PROVIDER_REVISION = 'count-sheet-regions-json-v1';
const MAX_PROVIDER_RESPONSE_CHARS = 64 * 1024;

function buildResponseSchema() {
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
            key: { type: 'string', enum: [...COUNT_CAPTURE_EXTRACTION_FIELD_KEYS] },
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

function buildInput(regions: CountCaptureExtractionRegionInput[]) {
  const content: Array<Record<string, unknown>> = [
    {
      type: 'text',
      text: [
        'Read four isolated value regions from an official Count Sheet.',
        'Each following image is already cropped to exactly one labeled field.',
        'Do not calculate, sum, reconcile, infer from other fields, or invent missing values.',
        'Return status recognized only when one handwritten/printed monetary observation is unambiguous.',
        'Use uncertain when more than one reading is plausible, unreadable when marks exist but cannot be read, and blank when no value is present.',
        'Observation must contain only the value exactly as seen (for example R$ 1.234,56 or 100,00). For uncertain/unreadable/blank, keep observation short and do not guess.',
      ].join(' '),
    },
  ];

  for (const region of regions) {
    content.push({ type: 'text', text: `Field key: ${region.key}` });
    content.push({ type: 'image', data: region.dataBase64, mime_type: region.mimeType });
  }
  return content;
}

function extractModelOutputText(payload: any): string {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.steps)) {
    throw new Error('COUNT_CAPTURE_EXTRACTION_PROVIDER_INVALID_RESPONSE');
  }
  const texts: string[] = [];
  for (const step of payload.steps) {
    if (!step || step.type !== 'model_output' || !Array.isArray(step.content)) continue;
    for (const item of step.content) {
      if (item?.type === 'text' && typeof item.text === 'string') texts.push(item.text);
    }
  }
  if (texts.length !== 1 || texts[0].length > MAX_PROVIDER_RESPONSE_CHARS) {
    throw new Error('COUNT_CAPTURE_EXTRACTION_PROVIDER_INVALID_RESPONSE');
  }
  return texts[0];
}

function productionProvider(): CountCaptureExtractionProvider {
  if (process.env.NESTFINANCE_COUNT_CAPTURE_AI_ENABLED !== 'true') {
    return {
      async extract() {
        throw new Error('COUNT_CAPTURE_EXTRACTION_DISABLED');
      },
    };
  }

  const apiKey = process.env.GEMINI_API_KEY || '';
  const model = process.env.NESTFINANCE_COUNT_CAPTURE_VISION_MODEL || '';
  if (!apiKey || !model) {
    return {
      async extract() {
        throw new Error('COUNT_CAPTURE_EXTRACTION_NOT_CONFIGURED');
      },
    };
  }

  return {
    async extract({ regions }) {
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
            input: buildInput(regions),
            response_format: {
              type: 'text',
              mime_type: 'application/json',
              schema: buildResponseSchema(),
            },
          }),
        });
        if (!response.ok) throw new Error('COUNT_CAPTURE_EXTRACTION_PROVIDER_UNAVAILABLE');
        const raw = await response.text();
        if (!raw || raw.length > MAX_PROVIDER_RESPONSE_CHARS) throw new Error('COUNT_CAPTURE_EXTRACTION_PROVIDER_INVALID_RESPONSE');
        let payload: unknown;
        try { payload = JSON.parse(raw); } catch { throw new Error('COUNT_CAPTURE_EXTRACTION_PROVIDER_INVALID_RESPONSE'); }
        const outputText = extractModelOutputText(payload);
        let output: unknown;
        try { output = JSON.parse(outputText); } catch { throw new Error('COUNT_CAPTURE_EXTRACTION_PROVIDER_INVALID_RESPONSE'); }
        return {
          provider: 'gemini_interactions',
          model,
          revision: PROVIDER_REVISION,
          result: validateCountCaptureProviderResult(output),
        };
      } catch (error: any) {
        if (error?.name === 'AbortError') throw new Error('COUNT_CAPTURE_EXTRACTION_PROVIDER_TIMEOUT');
        const message = String(error?.message || '');
        if (message.startsWith('COUNT_CAPTURE_EXTRACTION_')) throw error;
        throw new Error('COUNT_CAPTURE_EXTRACTION_PROVIDER_UNAVAILABLE');
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function getCountCaptureExtractionProvider(): CountCaptureExtractionProvider {
  if (process.env.NODE_ENV === 'test') {
    const injected = (globalThis as any)[TEST_PROVIDER_SYMBOL];
    if (injected) return injected as CountCaptureExtractionProvider;
  }
  return productionProvider();
}
