import {
  COUNT_CAPTURE_DENOMINATION_CELL_KEYS,
  COUNT_CAPTURE_DENOMINATION_MAX_OBSERVATION_CHARS,
  COUNT_CAPTURE_DENOMINATION_TIMEOUT_MS,
  validateCountCaptureDenominationProviderResult,
  type CountCaptureDenominationProviderResult,
  type CountCaptureDenominationRegionInput,
} from '../../../shared/finance/countCaptureDenominations.js';
import type { VercelRequest } from '@vercel/node';
import { createFinanceNestAiClient, financeNestAiModelLabel } from './nestAiProxy.js';

export type CountCaptureDenominationExtractionProviderResponse = {
  provider: 'nestai' | 'test';
  model: string;
  revision: string;
  result: CountCaptureDenominationProviderResult;
};

export interface CountCaptureDenominationExtractionProvider {
  extract(input: { regions: CountCaptureDenominationRegionInput[]; req: VercelRequest; organizationId: string }): Promise<CountCaptureDenominationExtractionProviderResponse>;
}

const TEST_PROVIDER_SYMBOL = Symbol.for('TEST_COUNT_CAPTURE_DENOMINATION_EXTRACTION_PROVIDER');
const PROVIDER_REVISION = 'count-sheet-denomination-quantities-nestai-v2';

function productionProvider(): CountCaptureDenominationExtractionProvider {
  if (process.env.NESTFINANCE_COUNT_CAPTURE_AI_ENABLED !== 'true') {
    return { async extract() { throw new Error('COUNT_CAPTURE_DENOMINATION_EXTRACTION_DISABLED'); } };
  }

  return {
    async extract({ regions, req, organizationId }) {
      try {
        const client = createFinanceNestAiClient({ req, organizationId, locale: 'PT' });
        const response = await client.vision<CountCaptureDenominationProviderResult>('finance.count.denominations.extract', {
          files: regions.map((region) => ({
            fileBase64: region.dataBase64,
            mimeType: region.mimeType,
            fileName: region.cellKey.replace(':', '-') + '.jpg',
            label: region.cellKey,
          })),
          context: { expectedCellKeys: regions.map((region) => region.cellKey) },
        });
        return {
          provider: 'nestai',
          model: financeNestAiModelLabel(),
          revision: PROVIDER_REVISION,
          result: validateCountCaptureDenominationProviderResult(response.result),
        };
      } catch (error: any) {
        const message = String(error?.message || '');
        if (message.includes('TIMEOUT')) throw new Error('COUNT_CAPTURE_DENOMINATION_PROVIDER_TIMEOUT');
        if (message.startsWith('COUNT_CAPTURE_DENOMINATION_')) throw error;
        throw new Error('COUNT_CAPTURE_DENOMINATION_PROVIDER_UNAVAILABLE');
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
