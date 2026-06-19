import { CompanyRegistryProvider, CompanyRegistryLookupResult } from './CompanyRegistryProvider.js';

export class CnpjWsCompanyRegistryProvider implements CompanyRegistryProvider {
  readonly id = 'cnpjws';

  async lookupCnpj(normalizedTaxId: string, signal: AbortSignal): Promise<CompanyRegistryLookupResult> {
    const url = `https://publica.cnpj.ws/cnpj/${normalizedTaxId}`;
    
    try {
      const response = await fetch(url, { 
          signal,
          headers: {
              'Accept': 'application/json',
              'User-Agent': 'NestFinance/1.0 CNPJ Lookup'
          }
      });
      
      if (response.status === 404) {
        throw new Error('REGISTRY_NOT_FOUND');
      }
      
      if (response.status === 429) {
        throw new Error('REGISTRY_PROVIDER_RATE_LIMITED');
      }

      if (!response.ok) {
        throw new Error('REGISTRY_PROVIDER_UNAVAILABLE');
      }
      
      const data = await response.json().catch(() => null);
      if (!data || typeof data !== 'object') {
        throw new Error('REGISTRY_INVALID_RESPONSE');
      }

      // Minimal safe mapper for public cnpj.ws
      const cleanString = (val: any) => typeof val === 'string' && val.trim() ? val.trim() : null;
      
      // According to cnpj.ws schema:
      // empresa.razao_social
      // estabelecimento.nome_fantasia
      // estabelecimento.situacao_cadastral
      // estabelecimento.data_inicio_atividade
      // empresa.natureza_juridica.descricao
      // estabelecimento.atividade_principal.classe / descricao
      // estabelecimento.tipo_logradouro
      // estabelecimento.logradouro
      // estabelecimento.numero
      // estabelecimento.complemento
      // estabelecimento.bairro
      // estabelecimento.cep
      // estabelecimento.cidade.nome
      // estabelecimento.estado.sigla

      const empresa = data.empresa || {};
      const estab = data.estabelecimento || {};
      
      // Legal nature might be an object
      const natCode = cleanString(empresa.natureza_juridica?.id?.toString());
      const natDesc = cleanString(empresa.natureza_juridica?.descricao);
      
      const pActCode = cleanString(estab.atividade_principal?.id?.toString());
      const pActDesc = cleanString(estab.atividade_principal?.descricao);

      // We only consider it valid if it has at least taxId and legalName
      const legalName = cleanString(empresa.razao_social);
      if (!legalName || legalName.length < 2) {
         throw new Error('REGISTRY_INVALID_RESPONSE');
      }

      const tipoLog = cleanString(estab.tipo_logradouro) || '';
      const log = cleanString(estab.logradouro) || '';
      const street = tipoLog && log ? `${tipoLog} ${log}` : log || tipoLog || null;

      return {
        provider: 'cnpjws',
        providerDataset: 'cnpjws_public',
        taxId: normalizedTaxId,
        legalName: legalName,
        tradeName: cleanString(estab.nome_fantasia),
        registrationStatus: cleanString(estab.situacao_cadastral),
        registrationStatusDate: cleanString(estab.data_situacao_cadastral),
        openingDate: cleanString(estab.data_inicio_atividade),
        legalNatureCode: natCode,
        legalNatureDescription: natDesc,
        primaryActivityCode: pActCode,
        primaryActivityDescription: pActDesc,
        registeredAddress: {
          postalCode: cleanString(estab.cep?.replace(/\D/g, '')),
          street,
          number: cleanString(estab.numero),
          complement: cleanString(estab.complemento),
          neighborhood: cleanString(estab.bairro),
          city: cleanString(estab.cidade?.nome),
          state: cleanString(estab.estado?.sigla)?.toUpperCase() || null,
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
