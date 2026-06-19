import { CompanyRegistryProvider, CompanyRegistryLookupResult } from './CompanyRegistryProvider.js';

export class BrasilApiCompanyRegistryProvider implements CompanyRegistryProvider {
  readonly id = 'brasilapi';

  async lookupCnpj(normalizedTaxId: string, signal: AbortSignal): Promise<CompanyRegistryLookupResult> {
    const url = `https://brasilapi.com.br/api/cnpj/v1/${normalizedTaxId}`;
    
    try {
      const response = await fetch(url, { signal });
      
      if (response.status === 404) {
        throw new Error('REGISTRY_NOT_FOUND');
      }
      
      if (!response.ok) {
        throw new Error('REGISTRY_PROVIDER_UNAVAILABLE');
      }
      
      const data = await response.json().catch(() => null);
      if (!data || typeof data !== 'object') {
        throw new Error('REGISTRY_INVALID_RESPONSE');
      }

      // Minimal safe mapper
      const cleanString = (val: any) => typeof val === 'string' && val.trim() ? val.trim() : null;
      
      return {
        provider: 'brasilapi',
        providerDataset: 'minha_receita',
        taxId: normalizedTaxId,
        legalName: cleanString(data.razao_social) || '',
        tradeName: cleanString(data.nome_fantasia),
        registrationStatus: cleanString(data.descricao_situacao_cadastral),
        registrationStatusDate: cleanString(data.data_situacao_cadastral),
        openingDate: cleanString(data.data_inicio_atividade),
        legalNatureCode: cleanString(data.codigo_natureza_juridica?.toString()),
        legalNatureDescription: cleanString(data.natureza_juridica),
        primaryActivityCode: cleanString(data.cnae_fiscal?.toString()),
        primaryActivityDescription: cleanString(data.cnae_fiscal_descricao),
        registeredAddress: {
          postalCode: cleanString(data.cep?.toString()),
          street: cleanString(data.logradouro),
          number: cleanString(data.numero),
          complement: cleanString(data.complemento),
          neighborhood: cleanString(data.bairro),
          city: cleanString(data.municipio),
          state: cleanString(data.uf)?.toUpperCase() || null,
        }
      };
      
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('REGISTRY_PROVIDER_TIMEOUT');
      }
      throw err;
    }
  }
}
