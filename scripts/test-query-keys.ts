import { buildTransactionListQueryKeys, getTransactionListQueryBounds } from '../shared/finance/ledger/listQueryKeys.js';
import assert from 'assert';

function runTests() {
  console.log('Running Query Keys Logic Tests...');

  let testCount = 0;
  let passCount = 0;

  function test(name: string, fn: () => void) {
    testCount++;
    try {
      fn();
      console.log(`✅ ${name}`);
      passCount++;
    } catch (e: any) {
      console.error(`❌ ${name} failed: ${e.message}`);
    }
  }

  test('mesmas entradas geram mesmas chaves', () => {
    const k1 = buildTransactionListQueryKeys('e1', 'tx1', 'income', 'draft', 1000);
    const k2 = buildTransactionListQueryKeys('e1', 'tx1', 'income', 'draft', 1000);
    assert.deepStrictEqual(k1, k2);
  });

  test('transação mais recente ordena antes', () => {
    const k_old = buildTransactionListQueryKeys('e1', 'tx1', 'income', 'draft', 1000);
    const k_new = buildTransactionListQueryKeys('e1', 'tx2', 'income', 'draft', 2000);
    // string comparison: newer should be smaller
    assert(k_new.all < k_old.all);
  });

  test('mesmo timestamp usa transactionId como desempate', () => {
    const k_tx1 = buildTransactionListQueryKeys('e1', 'tx1', 'income', 'draft', 1000);
    const k_tx2 = buildTransactionListQueryKeys('e1', 'tx2', 'income', 'draft', 1000);
    assert(k_tx1.all < k_tx2.all); // tx1 comes before tx2
  });

  test('financeEntityId diferente gera prefixo diferente', () => {
    const k1 = buildTransactionListQueryKeys('e1', 'tx1', 'income', 'draft', 1000);
    const k2 = buildTransactionListQueryKeys('e2', 'tx1', 'income', 'draft', 1000);
    assert(k1.all.startsWith('e1|'));
    assert(k2.all.startsWith('e2|'));
  });

  test('income e expense geram chaves diferentes', () => {
    const k1 = buildTransactionListQueryKeys('e1', 'tx1', 'income', 'draft', 1000);
    const k2 = buildTransactionListQueryKeys('e1', 'tx1', 'expense', 'draft', 1000);
    assert.notStrictEqual(k1.direction, k2.direction);
  });

  test('draft e ready_for_review geram chaves diferentes', () => {
    const k1 = buildTransactionListQueryKeys('e1', 'tx1', 'income', 'draft', 1000);
    const k2 = buildTransactionListQueryKeys('e1', 'tx1', 'income', 'ready_for_review', 1000);
    assert.notStrictEqual(k1.status, k2.status);
  });

  test('alteração de status muda somente as projeções afetadas', () => {
    const k1 = buildTransactionListQueryKeys('e1', 'tx1', 'income', 'draft', 1000);
    const k2 = buildTransactionListQueryKeys('e1', 'tx1', 'income', 'ready_for_review', 1000);
    assert.strictEqual(k1.all, k2.all);
    assert.strictEqual(k1.direction, k2.direction);
    assert.notStrictEqual(k1.status, k2.status);
    assert.notStrictEqual(k1.directionStatus, k2.directionStatus);
  });

  test('alteração de direction muda as projeções afetadas', () => {
    const k1 = buildTransactionListQueryKeys('e1', 'tx1', 'income', 'draft', 1000);
    const k2 = buildTransactionListQueryKeys('e1', 'tx1', 'expense', 'draft', 1000);
    assert.strictEqual(k1.all, k2.all);
    assert.strictEqual(k1.status, k2.status);
    assert.notStrictEqual(k1.direction, k2.direction);
    assert.notStrictEqual(k1.directionStatus, k2.directionStatus);
  });

  test('alteração de occurredAt muda todas as chaves temporais', () => {
    const k1 = buildTransactionListQueryKeys('e1', 'tx1', 'income', 'draft', 1000);
    const k2 = buildTransactionListQueryKeys('e1', 'tx1', 'income', 'draft', 1001);
    assert.notStrictEqual(k1.all, k2.all);
    assert.notStrictEqual(k1.direction, k2.direction);
    assert.notStrictEqual(k1.status, k2.status);
    assert.notStrictEqual(k1.directionStatus, k2.directionStatus);
  });

  test('data inválida é rejeitada', () => {
    assert.throws(() => buildTransactionListQueryKeys('e1', 'tx1', 'income', 'draft', 'invalid-date'));
    assert.throws(() => buildTransactionListQueryKeys('e1', 'tx1', 'income', 'draft', -1));
  });

  test('ID inválido é rejeitado', () => {
    assert.throws(() => buildTransactionListQueryKeys('', 'tx1', 'income', 'draft', 1000));
    assert.throws(() => buildTransactionListQueryKeys('e1', '', 'income', 'draft', 1000));
  });

  test('delimiter injection é impossível', () => {
    assert.throws(() => buildTransactionListQueryKeys('e|1', 'tx1', 'income', 'draft', 1000));
    assert.throws(() => buildTransactionListQueryKeys('e1', 'tx|1', 'income', 'draft', 1000));
  });

  test('nenhum float é aceito', () => {
    assert.throws(() => buildTransactionListQueryKeys('e1', 'tx1', 'income', 'draft', 1000.5));
  });

  test('nenhuma dependência de locale', () => {
    // Dates are parsed using Date.getTime() implicitly when string, which is standard
    // Padded 0 strings don't use locale
    const k1 = buildTransactionListQueryKeys('e1', 'tx1', 'income', 'draft', 1000);
    assert(!k1.all.includes(','));
    assert(!k1.all.includes('.'));
  });

  test('bounds check: no temporal filter', () => {
    const b = getTransactionListQueryBounds('e1', 'income');
    assert.strictEqual(b.field, 'listQueryKeys.direction');
    assert.strictEqual(b.startAt, 'e1|income|');
    assert.strictEqual(b.endBefore, 'e1|income|\uffff');
  });

  test('bounds check: with occurredFrom and occurredTo', () => {
    const d1 = new Date('2023-01-01T00:00:00Z').getTime();
    const d2 = new Date('2023-12-31T23:59:59Z').getTime();
    const b = getTransactionListQueryBounds('e1', undefined, undefined, '2023-01-01T00:00:00Z', '2023-12-31T23:59:59Z');
    
    // The query is reverse ordered. Smaller stamp == later date.
    // So 'startAt' uses d2 (occurredTo), because it starts at the top (newest).
    const EXPECTED_MAX = 9999999999999;
    
    const expectedStartSuffix = String(EXPECTED_MAX - d2).padStart(13, '0');
    assert.strictEqual(b.startAt, 'e1|' + expectedStartSuffix);

    const expectedEndSuffix = String(EXPECTED_MAX - d1).padStart(13, '0') + '\uffff';
    assert.strictEqual(b.endBefore, 'e1|' + expectedEndSuffix);
  });

  console.log('\nTotals: ' + passCount + ' Passed, ' + (testCount - passCount) + ' Failed');
  if (passCount !== testCount) process.exit(1);
}

runTests();
