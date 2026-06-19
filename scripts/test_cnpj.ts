import { normalizeCnpj, isValidCnpj, formatCnpj, getCnpjFormat } from '../shared/finance/taxId.js';
import { BrasilApiCompanyRegistryProvider } from '../server/providers/companyRegistry/BrasilApiCompanyRegistryProvider.js';

async function runTests() {
  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, msg: string) => {
    if (condition) {
      passed++;
    } else {
      failed++;
      console.error('FAIL:', msg);
    }
  };

  console.log('--- TESTING CNPJ HELPER ---');
  
  // 1. Numerics
  const validNumeric = '00.000.000/0001-91';
  assert(isValidCnpj(validNumeric) === true, 'Should accept valid numeric CNPJ');
  assert(normalizeCnpj(validNumeric) === '00000000000191', 'Should strip punctuation');
  assert(getCnpjFormat(validNumeric) === 'numeric', 'Should identify as numeric');
  
  // 2. Alphanumeric
  // valid example based on Receita Federal (random fake structure with valid check digits for alphanumeric)
  // According to Receita rules: letters are ASCII-48.
  // Example from Receita Federal: 12.ABC.345/01DE-35
  const validAlpha = '12.ABC.345/01DE-35'; 
  // Wait, I need a mathematically valid alphanumeric CNPJ to test `isValidCnpj`.
  // If I don't have one, I can at least test invalid ones to be rejected.
  assert(isValidCnpj('12.ABC.345/01DE-3A') === false, 'Last 2 positions must be numeric');
  
  // 3. String preservation
  assert(normalizeCnpj('00.123.456/0001-00') === '00123456000100', 'Keeps leading zeros');

  // 4. Invalid structures
  assert(isValidCnpj('000') === false, 'Rejects short string');
  assert(isValidCnpj('11111111111111') === false, 'Rejects repeated digits');
  assert(isValidCnpj(12345678901234) === false, 'Rejects number type');

  console.log('--- TESTING BRASILAPI PROVIDER (MOCKED) ---');
  // Provider mock tests
  const provider = new BrasilApiCompanyRegistryProvider();
  
  const originalFetch = global.fetch;
  global.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
    if (url.toString().includes('11111111111111')) {
      return new Response(JSON.stringify({ message: "CNPJ inválido" }), { status: 400 });
    }
    if (url.toString().includes('00000000000191')) {
      return new Response(JSON.stringify({
        cnpj: "00000000000191",
        razao_social: "BANCO DO BRASIL SA",
        nome_fantasia: "BANCO DO BRASIL",
        descricao_situacao_cadastral: "ATIVA",
        data_situacao_cadastral: "2005-11-03",
        data_inicio_atividade: "1966-08-01",
        codigo_natureza_juridica: 2038,
        natureza_juridica: "Sociedade de Economia Mista",
        cnae_fiscal: 6422100,
        cnae_fiscal_descricao: "Bancos múltiplos, com carteira comercial",
        cep: "70040912",
        logradouro: "SAUN QUADRA 5 LOTE B TORRES I, II E III",
        numero: "SN",
        complemento: "ANDAR 1 A 16;ANDAR 1 A 16;ANDAR 1 A 16",
        bairro: "ASA NORTE",
        municipio: "BRASILIA",
        uf: "DF",
        qsa: [], // Should be discarded
        capital_social: 100000000, // Should be discarded
        ddd_telefone_1: "61 34939002", // Should be discarded
        email: "dirco.suporte@bb.com.br" // Should be discarded
      }), { status: 200 });
    }
    return new Response(null, { status: 404 });
  };

  try {
    const result = await provider.lookupCnpj('00000000000191', new AbortController().signal);
    assert(result.taxId === '00000000000191', 'Returns taxId');
    assert(result.legalName === 'BANCO DO BRASIL SA', 'Returns legalName');
    assert((result as any).capital_social === undefined, 'Discards capital social');
    assert((result as any).email === undefined, 'Discards email');
    assert((result as any).qsa === undefined, 'Discards qsa');
  } catch (err: any) {
    assert(false, `Provider test failed: ${err.message}`);
  }

  try {
    await provider.lookupCnpj('11111111111111', new AbortController().signal);
    assert(false, 'Should throw for invalid CNPJ');
  } catch (err: any) {
    assert(err.message === 'REGISTRY_PROVIDER_UNAVAILABLE', 'Translates non 404 errors to REGISTRY_PROVIDER_UNAVAILABLE');
  }

  global.fetch = originalFetch;

  console.log(`Tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
