import type { VercelRequest } from '@vercel/node';
import {
  validateDocumentTransactionProviderResult,
  type DocumentTransactionCategoryOption,
  type DocumentTransactionProviderResult,
} from '../../../shared/finance/documentTransactionIntelligence.js';
import {
  createFinanceNestAiClient,
  financeNestAiLocale,
  financeNestAiModelLabel,
} from './nestAiProxy.js';

export type DocumentTransactionProviderResponse = {
  provider: 'nestai' | 'test';
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
    req: VercelRequest;
    organizationId: string;
  }): Promise<DocumentTransactionProviderResponse>;
}

const TEST_PROVIDER_SYMBOL = Symbol.for('TEST_DOCUMENT_TRANSACTION_INTELLIGENCE_PROVIDER');
const PROVIDER_REVISION = 'document-to-draft-nestai-v3';

function fileNameFor(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'financial-evidence.pdf';
  if (mimeType === 'image/png') return 'financial-evidence.png';
  if (mimeType === 'image/webp') return 'financial-evidence.webp';
  return 'financial-evidence.jpg';
}

export function getDocumentTransactionModelName() {
  return financeNestAiModelLabel();
}

function productionProvider(): DocumentTransactionIntelligenceProvider {
  return {
    async analyze(input) {
      try {
        const client = createFinanceNestAiClient({
          req: input.req,
          organizationId: input.organizationId,
          locale: financeNestAiLocale(input.locale),
        });
        const response = await client.vision<DocumentTransactionProviderResult>(
          'finance.document.transaction.extract',
          {
            fileBase64: input.bytes.toString('base64'),
            mimeType: input.mimeType,
            fileName: fileNameFor(input.mimeType),
            context: {
              categories: input.categories.slice(0, 200),
              locale: input.locale,
              authority: {
                humanConfirmationRequired: true,
                createsTransaction: false,
                postsTransaction: false,
              },
            },
          },
        );
        return {
          provider: 'nestai',
          model: financeNestAiModelLabel(),
          revision: PROVIDER_REVISION,
          result: validateDocumentTransactionProviderResult(response.result),
        };
      } catch (error: any) {
        const message = String(error?.message || '');
        if (message.includes('TIMEOUT')) throw new Error('DOCUMENT_ANALYSIS_PROVIDER_TIMEOUT');
        if (message.startsWith('DOCUMENT_ANALYSIS_')) throw error;
        throw new Error('DOCUMENT_ANALYSIS_PROVIDER_UNAVAILABLE');
      }
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
