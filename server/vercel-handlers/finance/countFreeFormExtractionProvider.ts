import {
  COUNT_CAPTURE_EXTRACTION_MAX_OBSERVATION_CHARS,
  COUNT_CAPTURE_EXTRACTION_TIMEOUT_MS,
  validateCountCaptureProviderResult,
  type CountCaptureProviderResult,
} from '../../../shared/finance/countCaptureExtraction.js';
import type { VercelRequest } from '@vercel/node';
import { createFinanceNestAiClient, financeNestAiLocale, financeNestAiModelLabel } from './nestAiProxy.js';

export type CountFreeFormExtractionProviderResponse = {
  provider: 'nestai' | 'test';
  model: string;
  revision: string;
  result: CountCaptureProviderResult;
};

export interface CountFreeFormExtractionProvider {
  extract(input: {
    bytes: Buffer;
    mimeType: 'image/jpeg' | 'image/webp';
    locale: 'PT' | 'EN' | 'ES';
    req: VercelRequest;
    organizationId: string;
  }): Promise<CountFreeFormExtractionProviderResponse>;
}

const TEST_PROVIDER_SYMBOL = Symbol.for('TEST_COUNT_FREE_FORM_EXTRACTION_PROVIDER');
const PROVIDER_REVISION = 'count-free-form-full-frame-nestai-v2';

function productionProvider(): CountFreeFormExtractionProvider {
  if (process.env.NESTFINANCE_COUNT_CAPTURE_AI_ENABLED !== 'true') {
    return { async extract() { throw new Error('COUNT_FREE_FORM_EXTRACTION_DISABLED'); } };
  }

  return {
    async extract(input) {
      try {
        const client = createFinanceNestAiClient({
          req: input.req,
          organizationId: input.organizationId,
          locale: financeNestAiLocale(input.locale),
        });
        const response = await client.vision<CountCaptureProviderResult>('finance.count.freeform.extract', {
          fileBase64: input.bytes.toString('base64'),
          mimeType: input.mimeType,
          fileName: 'count-free-form.' + (input.mimeType === 'image/webp' ? 'webp' : 'jpg'),
          context: { locale: input.locale },
        });
        return {
          provider: 'nestai',
          model: financeNestAiModelLabel(),
          revision: PROVIDER_REVISION,
          result: validateCountCaptureProviderResult(response.result),
        };
      } catch (error: any) {
        const message = String(error?.message || '');
        if (message.includes('TIMEOUT')) throw new Error('COUNT_FREE_FORM_EXTRACTION_PROVIDER_TIMEOUT');
        if (message.startsWith('COUNT_FREE_FORM_')) throw error;
        throw new Error('COUNT_FREE_FORM_EXTRACTION_PROVIDER_UNAVAILABLE');
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
