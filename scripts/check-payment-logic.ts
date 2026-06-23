import { getCompatibility, validateDraftMinimum, validateSubmissionReadiness, simulatePosting } from '../shared/finance/smartLogic';

function runTests() {
  let failed = 0;
  
  const testCompat = (name: string, result: any, expectedLevel: string) => {
    if (result.level !== expectedLevel) {
      console.error(`TEST FAILED: ${name}. Expected ${expectedLevel}, got ${result.level} - ${result.explanation}`);
      failed++;
    } else {
      console.log(`TEST PASSED: ${name}`);
    }
  };

  testCompat('draft sem método salva (unspecified income)', getCompatibility('bank_checking', 'unspecified', 'income'), 'allowed_with_context');
  testCompat('draft sem método salva (undefined expense)', getCompatibility('cash', undefined, 'expense'), 'allowed_with_context');
  testCompat('caixa + Pix falha no backend', getCompatibility('cash', 'pix', 'income'), 'impossible');
  testCompat('transferência entre mesma conta (logica basica passa, handler recusa)', getCompatibility('bank_checking', 'pix', 'transfer'), 'recommended');
  testCompat('saque é banco -> caixa (expense com dinheiro)', getCompatibility('bank_checking', 'cash', 'expense'), 'guided_flow');
  testCompat('depósito é caixa -> banco (income com dinheiro)', getCompatibility('bank_checking', 'cash', 'income'), 'guided_flow');
  testCompat('cartão não reduz banco na compra (bank_checking + credit_card + expense)', getCompatibility('bank_checking', 'credit_card', 'expense'), 'impossible');
  testCompat('pessoa pagou não reduz conta da igreja (reimbursement + expense)', getCompatibility('reimbursement_payable', 'pix', 'expense'), 'allowed_with_context');
  
  const orgId = 'org1';
  
  const testVal = (name: string, draft: any, valid: boolean) => {
      const res = validateDraftMinimum(draft, orgId);
      if (res.valid !== valid) {
         console.error(`TEST FAILED: ${name}. Expected ${valid}, got ${res.valid}`);
         console.error(res.errors);
         failed++;
      } else {
         console.log(`TEST PASSED: ${name}`);
      }
  };

  testVal('draft sem categoria salva', { direction: 'expense', amountCents: 100, occurredAt: '2023' }, true);
  testVal('draft sem método salva', { direction: 'income', amountCents: 100, occurredAt: '2023', accountId: '1' }, true);
  testVal('draft sem valor é rejeitado', { direction: 'income', occurredAt: '2023' }, false);
  testVal('draft com valor zero é rejeitado', { direction: 'income', amountCents: 0, occurredAt: '2023' }, false);
  testVal('draft com valor negativo é rejeitado', { direction: 'income', amountCents: -100, occurredAt: '2023' }, false);
  testVal('payload forjado Caixa + Pix falha', { direction: 'income', amountCents: 100, occurredAt: '2023', accountId: '1', paymentMethod: 'pix', accountSnapshot: { type: 'cash' } }, false);
  testVal('transferência com mesma conta é rejeitada', { direction: 'transfer', amountCents: 100, occurredAt: '2023', sourceAccountId: 'A', destinationAccountId: 'A' }, false);

  const testReadiness = (name: string, tx: any, valid: boolean) => {
      const res = validateSubmissionReadiness(tx);
      if (res.ready !== valid) {
         console.error(`TEST FAILED READINESS: ${name}. Expected ${valid}, got ${res.ready}`);
         console.error(res.errors);
         failed++;
      } else {
         console.log(`TEST PASSED READINESS: ${name}`);
      }
  }

  testReadiness('pagamento da fatura não possui categoria', { direction: 'liability_settlement', sourceAccountId: 'bank1', liabilityAccountId: 'card1', amountCents: 100, occurredAt: '2023', settlementType: 'credit_card_bill' }, true);
  testReadiness('pagar reembolso é liability settlement', { direction: 'liability_settlement', sourceAccountId: 'bank1', liabilityAccountId: 'reimb1', amountCents: 100, occurredAt: '2023', settlementType: 'reimbursement' }, true);

  const testPosting = (name: string, tx: any, expects: any[]) => {
      const posts = simulatePosting(tx);
      const str1 = JSON.stringify(posts);
      const str2 = JSON.stringify(expects);
      if (str1 !== str2) {
          console.error(`TEST FAILED POSTING: ${name}`);
          console.error(`Expected: ${str2}`);
          console.error(`Got: ${str1}`);
          failed++;
      } else {
          console.log(`TEST PASSED POSTING: ${name}`);
      }
  }

  testPosting('transfer', { direction: 'transfer', sourceAccountId: 'A', destinationAccountId: 'B', amountCents: 50 }, [
      { accountId: 'A', effect: 'decrease', amount: 50, nature: 'asset' },
      { accountId: 'B', effect: 'increase', amount: 50, nature: 'asset' }
  ]);
  
  testPosting('compra no cartão (expense liability)', { direction: 'expense', accountId: 'C', paymentMethod: 'credit_card', amountCents: 100 }, [
      { accountId: 'C', effect: 'increase', amount: 100, nature: 'liability' }
  ]);

  testPosting('compra banco (expense asset)', { direction: 'expense', accountId: 'B', paymentMethod: 'pix', amountCents: 100 }, [
      { accountId: 'B', effect: 'decrease', amount: 100, nature: 'asset' }
  ]);

  testPosting('pagar fatura', { direction: 'liability_settlement', sourceAccountId: 'B', liabilityAccountId: 'C', amountCents: 100 }, [
      { accountId: 'B', effect: 'decrease', amount: 100, nature: 'asset' },
      { accountId: 'C', effect: 'decrease', amount: 100, nature: 'liability' }
  ]);

  if (failed > 0) {
      console.log(`${failed} tests failed!`);
      process.exit(1);
  }
  console.log('Payment smart logic core tests passed.');
}

runTests();
