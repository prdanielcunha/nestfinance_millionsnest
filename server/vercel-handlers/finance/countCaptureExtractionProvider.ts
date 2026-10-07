import {
  COUNT_CAPTURE_EXTRACTION_FIELD_KEYS,
  COUNT_CAPTURE_EXTRACTION_MAX_OBSERVATION_CHARS,
  COUNT_CAPTURE_EXTRACTION_TIMEOUT_MS,
  validateCountCaptureProviderResult,
  type CountCaptureExtractionRegionInput,
  type CountCaptureProviderResult,
} from '../../../shared/finance/countCaptureExtraction.js';
import type { VercelRequest } from '@vercel/node';
import { createFinanceNestAiClient, financeNestAiModelLabel } from './nestAiProxy.js';

export type CountCaptureExtractionProviderResponse = {
  provider: 'nestai' | 'test';
  model: string;
  revision: string;
  result: CountCaptureProviderResult;
};

export interface CountCaptureExtractionProvider {
  extract(input: { regions: CountCaptureExtractionRegionInput[]; req: VercelRequest; organizationId: string }): Promise<CountCaptureExtractionProviderResponse>;
}

const TEST_PROVIDER_SYMBOL = Symbol.for('TEST_COUNT_CAPTURE_EXTRACTION_PROVIDER');
const PROVIDER_REVISION = 'count-sheet-regions-nestai-v2';

function productionProvider(): CountCaptureExtractionProvider {
  if (process.env.NESTFINANCE_COUNT_CAPTURE_AI_ENABLED !== 'true') {
    return { async extract() { throw new Error('COUNT_CAPTURE_EXTRACTION_DISABLED'); } };
  }

  return {
    async extract({ regions, req, organizationId }) {
      try {
        const client = createFinanceNestAiClient({ req, organizationId, locale: 'PT' });
        const response = await client.vision<CountCaptureProviderResult>('finance.count.regions.extract', {
          files: regions.map((region) => ({
            fileBase64: region.dataBase64,
            mimeType: region.mimeType,
            fileName: region.key + '.jpg',
            label: region.key,
          })),
          context: { expectedKeys: COUNT_CAPTURE_EXTRACTION_FIELD_KEYS },
        });
        return {
          provider: 'nestai',
          model: financeNestAiModelLabel(),
          revision: PROVIDER_REVISION,
          result: validateCountCaptureProviderResult(response.result),
        };
      } catch (error: any) {
        const message = String(error?.message || '');
        if (message.includes('TIMEOUT')) throw new Error('COUNT_CAPTURE_EXTRACTION_PROVIDER_TIMEOUT');
        if (message.startsWith('COUNT_CAPTURE_EXTRACTION_')) throw error;
        throw new Error('COUNT_CAPTURE_EXTRACTION_PROVIDER_UNAVAILABLE');
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
