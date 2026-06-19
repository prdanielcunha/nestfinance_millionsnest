import { normalizeCnpj, isValidCnpj, formatCnpj, getCnpjFormat } from '../shared/finance/taxId.js';
import { CompanyRegistryProviderChain } from '../server/providers/companyRegistry/CompanyRegistryProviderChain.js';

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
  
  console.log('--- TESTING CHAIN PROVIDER ---');
  // Mock fetch
  let calls: string[] = [];
  const originalFetch = global.fetch;
  
  global.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push(url.toString());
    
    // Brasil API route
    if (url.toString().includes('brasilapi')) {
       if (url.toString().includes('00000000000191')) {
          // Success
          return new Response(JSON.stringify({ 
             cnpj: "00000000000191", 
             razao_social: "BANCO DO BRASIL SA" 
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
       }
       if (url.toString().includes('11111111111111')) {
          // 404
          return new Response(JSON.stringify({ message: "CNPJ inválido" }), { status: 404 });
       }
       if (url.toString().includes('12345678901234')) {
          // 429
          return new Response(null, { status: 429 });
       }
       if (url.toString().includes('50000000000000')) {
          // 500
          return new Response(null, { status: 500 });
       }
       if (url.toString().includes('99999999999999')) {
          // simulate timeout or network error
          throw new Error("Network Error");
       }
       if (url.toString().includes('77777777777777')) {
         // Bad JSON
         return new Response("{ bad json }", { status: 200, headers: { 'Content-Type': 'application/json' } });
       }
    }
    
    // CnpjWs route
    if (url.toString().includes('cnpj.ws')) {
       if (url.toString().includes('12345678901234')) {
          return new Response(JSON.stringify({ 
             empresa: { razao_social: "FALLBACK SUCCESS" }
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
       }
       if (url.toString().includes('50000000000000') || url.toString().includes('99999999999999') || url.toString().includes('77777777777777')) {
          // Fallback also succeeds for these tests
          return new Response(JSON.stringify({ 
             empresa: { razao_social: "FALLBACK SECONDARY" }
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
       }
       return new Response(null, { status: 404 });
    }
    
    return new Response(null, { status: 404 });
  };

  const chain = new CompanyRegistryProviderChain();
  
  // Test 1: BrasilAPI success -> no fallback
  calls = [];
  try {
     const res1 = await chain.lookupCnpj('00000000000191', new AbortController().signal);
     assert(res1.provider === 'brasilapi', 'Main provider succeeded');
     assert(calls.length === 1, 'Only called BrasilAPI');
  } catch (e) { assert(false, 'Threw on Test 1'); }

  // Test 2: BrasilAPI 404 -> no fallback needed, immediate return NOT_FOUND
  calls = [];
  try {
     await chain.lookupCnpj('11111111111111', new AbortController().signal);
     assert(false, 'Should throw NOT_FOUND');
  } catch (err: any) { 
     assert(err.message === 'REGISTRY_NOT_FOUND', 'Should return NOT_FOUND');
     assert(calls.length === 1, 'Only called BrasilAPI');
  }

  // Test 3: BrasilAPI 429 -> Fallback success
  calls = [];
  try {
     const res3 = await chain.lookupCnpj('12345678901234', new AbortController().signal);
     assert(res3.provider === 'cnpjws', 'Fallback provider succeeded');
     assert(calls.length === 2, 'Called both providers');
  } catch (e) { assert(false, 'Threw on Test 3'); }
  
  // Test 4: BrasilAPI 500 -> Fallback success
  calls = [];
  try {
     const res4 = await chain.lookupCnpj('50000000000000', new AbortController().signal);
     assert(res4.provider === 'cnpjws', 'Fallback provider succeeded after 500');
     assert(calls.length === 2, 'Called both providers');
  } catch (e) { assert(false, 'Threw on Test 4'); }
  
  // Test 5: BrasilAPI Network Error -> Fallback success
  calls = [];
  try {
     const res5 = await chain.lookupCnpj('99999999999999', new AbortController().signal);
     assert(res5.provider === 'cnpjws', 'Fallback provider succeeded after Network Err');
     assert(calls.length === 2, 'Called both providers');
  } catch (e) { assert(false, 'Threw on Test 5'); }
  
  // Test 6: BrasilAPI Invalid JSON -> Fallback success
  calls = [];
  try {
     const res6 = await chain.lookupCnpj('77777777777777', new AbortController().signal);
     assert(res6.provider === 'cnpjws', 'Fallback provider succeeded after Invalid JSON');
     assert(calls.length === 2, 'Called both providers');
  } catch (e) { assert(false, 'Threw on Test 6'); }

  // Test 7: Both fail -> ALL_PROVIDERS_UNAVAILABLE
  calls = [];
  try {
     // I need a CNPJ that fails on BOTH.
     // By default Mock fallback returns 404 for something not listed above, wait 404 throws NOT_FOUND.
     // Let's modify behavior for 66666666666666 to 500 on both
  } catch (e) {}
  
  global.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
    return new Response(null, { status: 500 });
  };
  
  try {
     await chain.lookupCnpj('66666666666666', new AbortController().signal);
     assert(false, 'Should throw');
  } catch (err: any) {
     assert(err.message === 'REGISTRY_ALL_PROVIDERS_UNAVAILABLE', 'Returns ALL_UNAVAILABLE');
  }

  global.fetch = originalFetch;

  console.log(`Tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
