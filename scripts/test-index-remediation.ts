import { normalizeFirestoreInfrastructureError } from '../server/shared/firestore/indexRemediation.js';
import assert from 'assert';

function runTests() {
  console.log('Running indexRemediation tests');
  
  let passed = 0;
  let total = 0;
  
  const test = (name: string, fn: () => void) => {
    total++;
    try {
      fn();
      passed++;
      console.log(`✅ ${name}`);
    } catch (e: any) {
      console.log(`❌ ${name}`);
      console.error(e);
    }
  };

  test('reconhece erro real de índice (code 9)', () => {
     const err = normalizeFirestoreInfrastructureError({ code: 9, message: 'The query requires an index.' }, { requestId: '123', operation: 'op', isGlobalAdmin: false });
     assert.equal(err?.code, 'FIRESTORE_INDEX_REQUIRED');
  });

  test('reconhece erro real de índice (code failed-precondition)', () => {
     const err = normalizeFirestoreInfrastructureError({ code: 'failed-precondition', message: 'The query requires an index.' }, { requestId: '123', operation: 'op', isGlobalAdmin: false });
     assert.equal(err?.code, 'FIRESTORE_INDEX_REQUIRED');
  });

  test('link oficial é extraído para global admin', () => {
     const url = 'https://console.firebase.google.com/v1/r/project/demo/firestore/indexes?create_composite=123';
     const err = normalizeFirestoreInfrastructureError({ code: 9, message: `The query requires an index. You can create it here: ${url}` }, { requestId: '123', operation: 'op', isGlobalAdmin: true });
     assert.equal(err?.indexCreateUrl, url);
  });

  test('usuário comum não recebe URL', () => {
     const url = 'https://console.firebase.google.com/v1/r/project/demo/firestore/indexes?create_composite=123';
     const err = normalizeFirestoreInfrastructureError({ code: 9, message: `The query requires an index. You can create it here: ${url}` }, { requestId: '123', operation: 'op', isGlobalAdmin: false });
     assert.equal(err?.indexCreateUrl, undefined);
  });

  test('hostname diferente é rejeitado', () => {
     const url = 'https://evil.com/v1/r/project/demo/firestore/indexes?create_composite=123';
     const err = normalizeFirestoreInfrastructureError({ code: 9, message: `The query requires an index. You can create it here: ${url}` }, { requestId: '123', operation: 'op', isGlobalAdmin: true });
     assert.equal(err?.indexCreateUrl, undefined);
  });

  test('protocolo diferente de HTTPS é rejeitado', () => {
     const url = 'http://console.firebase.google.com/v1/r/project/demo/firestore/indexes?create_composite=123';
     const err = normalizeFirestoreInfrastructureError({ code: 9, message: `The query requires an index. You can create it here: ${url}` }, { requestId: '123', operation: 'op', isGlobalAdmin: true });
     assert.equal(err?.indexCreateUrl, undefined);
  });

  test('timeout não mostra botão de índice', () => {
     const err = normalizeFirestoreInfrastructureError({ code: 'deadline-exceeded', message: `Timeout` }, { requestId: '123', operation: 'op', isGlobalAdmin: true });
     assert.equal(err, null);
  });
  
  test('erro interno genérico não mostra botão de índice', () => {
     const err = normalizeFirestoreInfrastructureError({ code: 'internal', message: `Internal server error` }, { requestId: '123', operation: 'op', isGlobalAdmin: true });
     assert.equal(err, null);
  });

  console.log(`\nTotals: ${passed} passed, ${total - passed} failed`);
  if (passed !== total) {
     process.exit(1);
  }
}

runTests();
