import { CompanyRegistryProvider, CompanyRegistryLookupResult } from './CompanyRegistryProvider.js';
import { BrasilApiCompanyRegistryProvider } from './BrasilApiCompanyRegistryProvider.js';
import { CnpjWsCompanyRegistryProvider } from './CnpjWsCompanyRegistryProvider.js';

export class CompanyRegistryProviderChain implements CompanyRegistryProvider {
  readonly id = 'chain';
  private primary = new BrasilApiCompanyRegistryProvider();
  private fallback = new CnpjWsCompanyRegistryProvider();

  async lookupCnpj(normalizedTaxId: string, signal: AbortSignal): Promise<CompanyRegistryLookupResult> {
    try {
      // 4 secs timeout for primary
      const primaryController = new AbortController();
      const onMainAbort = () => primaryController.abort();
      signal.addEventListener('abort', onMainAbort);
      const primaryTimeout = setTimeout(() => primaryController.abort(), 4000);

      try {
        const res = await this.primary.lookupCnpj(normalizedTaxId, primaryController.signal);
        clearTimeout(primaryTimeout);
        signal.removeEventListener('abort', onMainAbort);
        return res;
      } catch (err: any) {
        clearTimeout(primaryTimeout);
        signal.removeEventListener('abort', onMainAbort);

        // If NOT_FOUND, return immediately. No need to fallback.
        if (err.message === 'REGISTRY_NOT_FOUND') {
          throw err; 
        }

        console.warn(`Primary provider failed: ${err.message}. Attempting fallback.`);
      }

      if (signal.aborted) {
         throw new Error('REGISTRY_PROVIDER_TIMEOUT');
      }

      // 4 secs timeout for fallback
      const fallbackController = new AbortController();
      const onFallbackAbort = () => fallbackController.abort();
      signal.addEventListener('abort', onFallbackAbort);
      const fallbackTimeout = setTimeout(() => fallbackController.abort(), 4000);

      try {
        const res = await this.fallback.lookupCnpj(normalizedTaxId, fallbackController.signal);
        clearTimeout(fallbackTimeout);
        signal.removeEventListener('abort', onFallbackAbort);
        return res;
      } catch (err: any) {
         clearTimeout(fallbackTimeout);
         signal.removeEventListener('abort', onFallbackAbort);
         
         if (err.message === 'REGISTRY_NOT_FOUND') {
           throw err; 
         }

         throw new Error('REGISTRY_ALL_PROVIDERS_UNAVAILABLE');
      }

    } catch (err: any) {
      throw err;
    }
  }
}
