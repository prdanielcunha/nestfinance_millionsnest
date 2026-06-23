import { getCompatibility } from '../shared/finance/smartLogic';

function runTests() {
  let failed = 0;
  
  const test = (name: string, result: any, expectedLevel: string) => {
    if (result.level !== expectedLevel) {
      console.error(`TEST FAILED: ${name}. Expected ${expectedLevel}, got ${result.level} - ${result.explanation}`);
      failed++;
    } else {
      console.log(`TEST PASSED: ${name}`);
    }
  };

  test('draft sem método salva (unspecified income)', getCompatibility('bank_checking', 'unspecified', 'income'), 'allowed_with_context');
  test('draft sem método salva (undefined expense)', getCompatibility('cash', undefined, 'expense'), 'allowed_with_context');
  test('caixa + Pix falha no backend', getCompatibility('cash', 'pix', 'income'), 'impossible');
  test('transferência entre mesma conta (logica basica passa, handler recusa)', getCompatibility('bank_checking', 'pix', 'transfer'), 'recommended');
  test('saque é banco -> caixa (expense com dinheiro)', getCompatibility('bank_checking', 'cash', 'expense'), 'guided_flow');
  test('depósito é caixa -> banco (income com dinheiro)', getCompatibility('bank_checking', 'cash', 'income'), 'guided_flow');
  test('cartão não reduz banco na compra (bank_checking + credit_card + expense)', getCompatibility('bank_checking', 'credit_card', 'expense'), 'impossible');
  test('pessoa pagou não reduz conta da igreja (reimbursement + expense)', getCompatibility('reimbursement_payable', 'pix', 'expense'), 'allowed_with_context');

  if (failed > 0) process.exit(1);
  console.log('Payment smart logic core tests passed.');
}

runTests();
