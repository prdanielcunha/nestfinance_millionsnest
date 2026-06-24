import assert from 'assert';
import { LedgerTransaction } from '../shared/finance/ledger/transaction.js';
import { FinanceAllocation } from '../shared/finance/ledger/allocation.js';
import { PostingMappingSnapshot, PostingPreviewPolicy } from '../shared/finance/ledger/postingMappings.js';
import { buildPostingPlan, buildReversalPlan, describePostingPlan } from '../shared/finance/ledger/postingPlan.js';

let passed = 0;
let failed = 0;

function runTest(name: string, testFn: () => void) {
  try {
    testFn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e: any) {
    console.log(`❌ ${name}: ${e.message}`);
    failed++;
  }
}

const baseInput = {
  transaction: {
    id: 'tx_1',
    organizationId: 'org_1',
    financeEntityId: 'fe_1',
    transactionKind: 'income' as const,
    cashFlowDirection: 'inflow' as const,
    status: 'approved_for_posting' as const,
    amountCents: 1000,
    currency: 'BRL',
    occurredAt: '2023-01-01',
    recordedAt: '2023-01-01',
    paymentMethod: 'pix',
    sourceContext: 'test',
    evidenceIds: [],
    reconciliationStatus: 'unreconciled' as const,
    createdBy: 'user',
    updatedBy: 'user',
    version: 1,
    schemaVersion: 1,
    accountId: 'acc1',
    allocationIds: ['alloc1'],
    approvedVersion: 1,
    approvalSourceHash: 'hash123'
  } as any,
  approval: {
    approvedVersion: 1,
    approvalSourceHash: 'hash123',
    status: 'approved'
  },
  allocations: [
    {
      id: 'alloc1',
      organizationId: 'org_1',
      financeEntityId: 'fe_1',
      transactionId: 'tx_1',
      amountCents: 1000,
      categoryId: 'cat_1',
      sequence: 1,
      createdAt: '2023-01-01',
      createdBy: 'user',
      schemaVersion: 1
    }
  ],
  mappings: {
    financeAccounts: [
      { accountId: 'acc1', ledgerAccountId: 'la_asset_banco', type: 'asset' as const },
      { accountId: 'cc1', ledgerAccountId: 'la_liab_card', type: 'liability' as const },
      { accountId: 'person1', ledgerAccountId: 'la_liab_reimb', type: 'liability' as const }
    ],
    categories: [
      { categoryId: 'cat_1', ledgerAccountId: 'la_inc_1', kind: 'income' as const },
      { categoryId: 'cat_exp', ledgerAccountId: 'la_exp_1', kind: 'expense' as const }
    ]
  },
  policy: {
    ledgerAccounts: [
      { id: 'la_asset_banco', organizationId: 'org_1', financeEntityId: 'fe_1', active: true, postingAllowed: true },
      { id: 'la_liab_card', organizationId: 'org_1', financeEntityId: 'fe_1', active: true, postingAllowed: true },
      { id: 'la_liab_reimb', organizationId: 'org_1', financeEntityId: 'fe_1', active: true, postingAllowed: true },
      { id: 'la_inc_1', organizationId: 'org_1', financeEntityId: 'fe_1', active: true, postingAllowed: true },
      { id: 'la_exp_1', organizationId: 'org_1', financeEntityId: 'fe_1', active: true, postingAllowed: true }
    ]
  }
};

runTest('1. income gera débito em ativo e crédito em receita', () => {
  const plan = buildPostingPlan(baseInput);
  assert.strictEqual(plan.blockers.length, 0);
  assert.strictEqual(plan.journalEntry.lines.length, 2);
  const debit = plan.journalEntry.lines.find(l => l.debitCents > 0)!;
  const credit = plan.journalEntry.lines.find(l => l.creditCents > 0)!;
  assert.strictEqual(debit.ledgerAccountId, 'la_asset_banco');
  assert.strictEqual(credit.ledgerAccountId, 'la_inc_1');
});

runTest('2. expense paga gera débito em despesa e crédito em ativo', () => {
  const input = JSON.parse(JSON.stringify(baseInput));
  input.transaction.transactionKind = 'expense';
  input.transaction.cashFlowDirection = 'outflow';
  input.allocations[0].categoryId = 'cat_exp';
  const plan = buildPostingPlan(input);
  assert.strictEqual(plan.blockers.length, 0);
  const debit = plan.journalEntry.lines.find(l => l.debitCents > 0)!;
  const credit = plan.journalEntry.lines.find(l => l.creditCents > 0)!;
  assert.strictEqual(debit.ledgerAccountId, 'la_exp_1');
  assert.strictEqual(credit.ledgerAccountId, 'la_asset_banco');
  
  // accountEffects should be decrease
  const ae = plan.accountEffects.find(e => e.financeAccountId === 'acc1')!;
  assert.strictEqual(ae.effect, 'decrease');
});

runTest('3. compra no cartão gera crédito em passivo', () => {
  const input = JSON.parse(JSON.stringify(baseInput));
  input.transaction.transactionKind = 'expense';
  input.transaction.accountId = 'cc1';
  input.allocations[0].categoryId = 'cat_exp';
  const plan = buildPostingPlan(input);
  assert.strictEqual(plan.blockers.length, 0);
  const credit = plan.journalEntry.lines.find(l => l.creditCents > 0)!;
  assert.strictEqual(credit.ledgerAccountId, 'la_liab_card');
  
  // accountEffects should be increase liability
  const ae = plan.accountEffects.find(e => e.financeAccountId === 'cc1')!;
  assert.strictEqual(ae.effect, 'increase');
  assert.strictEqual(ae.reason, 'liability_created');
});

runTest('4. compra no cartão não reduz banco', () => {
  const input = JSON.parse(JSON.stringify(baseInput));
  input.transaction.transactionKind = 'expense';
  input.transaction.accountId = 'cc1';
  input.allocations[0].categoryId = 'cat_exp';
  const plan = buildPostingPlan(input);
  assert.strictEqual(plan.accountEffects.some(e => e.financeAccountId === 'acc1'), false);
});

runTest('5. pessoa pagou gera reembolso a pagar', () => {
  const input = JSON.parse(JSON.stringify(baseInput));
  input.transaction.transactionKind = 'expense';
  delete input.transaction.accountId;
  input.transaction.reimbursement = { payableId: 'person1', personName: 'Person', description: 'desc' };
  input.allocations[0].categoryId = 'cat_exp';
  const plan = buildPostingPlan(input);
  assert.strictEqual(plan.blockers.length, 0);
  const credit = plan.journalEntry.lines.find(l => l.creditCents > 0)!;
  assert.strictEqual(credit.ledgerAccountId, 'la_liab_reimb');
});

runTest('6. reembolso não reduz banco no reconhecimento inicial', () => {
  const input = JSON.parse(JSON.stringify(baseInput));
  input.transaction.transactionKind = 'expense';
  delete input.transaction.accountId;
  input.transaction.reimbursement = { payableId: 'person1', personName: 'Person', description: 'desc' };
  input.allocations[0].categoryId = 'cat_exp';
  const plan = buildPostingPlan(input);
  assert.strictEqual(plan.accountEffects.some(e => e.financeAccountId === 'acc1'), false);
});

runTest('7. transfer gera asset -> asset', () => {
  const input = JSON.parse(JSON.stringify(baseInput));
  input.transaction.transactionKind = 'transfer';
  input.transaction.sourceAccountId = 'acc1';
  input.transaction.destinationAccountId = 'acc2';
  input.mappings.financeAccounts.push({ accountId: 'acc2', ledgerAccountId: 'la_asset_banco2', type: 'asset' });
  input.policy.ledgerAccounts.push({ id: 'la_asset_banco2', organizationId: 'org_1', financeEntityId: 'fe_1', active: true, postingAllowed: true });
  input.allocations = [];
  const plan = buildPostingPlan(input);
  assert.strictEqual(plan.blockers.length, 0);
  const debit = plan.journalEntry.lines.find(l => l.debitCents > 0)!;
  const credit = plan.journalEntry.lines.find(l => l.creditCents > 0)!;
  assert.strictEqual(debit.ledgerAccountId, 'la_asset_banco2');
  assert.strictEqual(credit.ledgerAccountId, 'la_asset_banco');
});

runTest('8. transfer não gera receita ou despesa', () => {
  const input = JSON.parse(JSON.stringify(baseInput));
  input.transaction.transactionKind = 'transfer';
  input.transaction.sourceAccountId = 'acc1';
  input.transaction.destinationAccountId = 'acc2';
  input.mappings.financeAccounts.push({ accountId: 'acc2', ledgerAccountId: 'la_asset_banco2', type: 'asset' });
  input.policy.ledgerAccounts.push({ id: 'la_asset_banco2', organizationId: 'org_1', financeEntityId: 'fe_1', active: true, postingAllowed: true });
  input.allocations = [];
  const plan = buildPostingPlan(input);
  assert.strictEqual(plan.journalEntry.lines.some(l => l.categoryId !== undefined), false);
});

runTest('9. pagamento de fatura reduz passivo', () => {
  const input = JSON.parse(JSON.stringify(baseInput));
  input.transaction.transactionKind = 'liability_settlement';
  input.transaction.sourceAccountId = 'acc1';
  input.transaction.liabilityAccountId = 'cc1';
  input.allocations = [];
  const plan = buildPostingPlan(input);
  assert.strictEqual(plan.blockers.length, 0);
  const debit = plan.journalEntry.lines.find(l => l.debitCents > 0)!;
  assert.strictEqual(debit.ledgerAccountId, 'la_liab_card');
  const decrease = plan.accountEffects.find(e => e.financeAccountId === 'cc1')!;
  assert.strictEqual(decrease.effect, 'decrease');
});

runTest('10. pagamento de fatura não duplica despesa', () => {
  const input = JSON.parse(JSON.stringify(baseInput));
  input.transaction.transactionKind = 'liability_settlement';
  input.transaction.sourceAccountId = 'acc1';
  input.transaction.liabilityAccountId = 'cc1';
  input.allocations = [];
  const plan = buildPostingPlan(input);
  assert.strictEqual(plan.journalEntry.lines.some(l => l.categoryId !== undefined), false);
});

runTest('11. pagamento de reembolso reduz passivo', () => {
  const input = JSON.parse(JSON.stringify(baseInput));
  input.transaction.transactionKind = 'liability_settlement';
  input.transaction.sourceAccountId = 'acc1';
  input.transaction.liabilityAccountId = 'person1';
  input.allocations = [];
  const plan = buildPostingPlan(input);
  assert.strictEqual(plan.blockers.length, 0);
  const debit = plan.journalEntry.lines.find(l => l.debitCents > 0)!;
  assert.strictEqual(debit.ledgerAccountId, 'la_liab_reimb');
});

runTest('12. allocations fecham exatamente', () => {
  const plan = buildPostingPlan(baseInput);
  assert.strictEqual(plan.blockers.length, 0);
});

runTest('13. allocations incompletas bloqueiam', () => {
  const input = JSON.parse(JSON.stringify(baseInput));
  input.allocations[0].amountCents = 900;
  const plan = buildPostingPlan(input);
  assert.strictEqual(plan.blockers.some(b => b.code === 'ALLOCATION_TOTAL_MISMATCH'), true);
});

runTest('14. categoria sem ledger mapping bloqueia', () => {
  const input = JSON.parse(JSON.stringify(baseInput));
  input.allocations[0].categoryId = 'cat_unknown';
  const plan = buildPostingPlan(input);
  assert.strictEqual(plan.blockers.some(b => b.code === 'FINANCE_CATEGORY_LEDGER_MAPPING_MISSING'), true);
});

runTest('15. conta sem ledger mapping bloqueia', () => {
  const input = JSON.parse(JSON.stringify(baseInput));
  input.transaction.accountId = 'acc_unknown';
  const plan = buildPostingPlan(input);
  assert.strictEqual(plan.blockers.some(b => b.code === 'FINANCE_ACCOUNT_LEDGER_MAPPING_MISSING'), true);
});

runTest('16. cross-entity bloqueia', () => {
  const input = JSON.parse(JSON.stringify(baseInput));
  input.policy.ledgerAccounts[0].financeEntityId = 'fe_other';
  const plan = buildPostingPlan(input);
  assert.strictEqual(plan.blockers.some(b => b.code === 'CROSS_ENTITY_REFERENCE'), true);
});

runTest('17. aprovação stale bloqueia', () => {
  const input = JSON.parse(JSON.stringify(baseInput));
  input.transaction.approvedVersion = 2;
  const plan = buildPostingPlan(input);
  assert.strictEqual(plan.blockers.some(b => b.code === 'FINANCE_APPROVAL_STALE'), true);
});

runTest('18. aprovação invalidada bloqueia', () => {
  const input = JSON.parse(JSON.stringify(baseInput));
  input.approval.status = 'invalidated';
  const plan = buildPostingPlan(input);
  assert.strictEqual(plan.blockers.some(b => b.code === 'FINANCE_APPROVAL_INVALIDATED'), true);
});

runTest('19. transação já lançada bloqueia', () => {
  const input = JSON.parse(JSON.stringify(baseInput));
  input.transaction.status = 'posted';
  const plan = buildPostingPlan(input);
  assert.strictEqual(plan.blockers.some(b => b.code === 'FINANCE_TRANSACTION_ALREADY_POSTED'), true);
});

runTest('20. plano balanceado passa', () => {
  const plan = buildPostingPlan(baseInput);
  assert.strictEqual(plan.blockers.length, 0);
  assert.strictEqual(plan.journalEntry.totalDebitCents, plan.journalEntry.totalCreditCents);
});

runTest('21. plano desbalanceado falha', () => {
  const input = JSON.parse(JSON.stringify(baseInput));
  input.mappings.categories[0].kind = 'expense'; // intentional misconfig
  const plan = buildPostingPlan(input);
  assert.strictEqual(plan.blockers.some(b => b.code === 'CATEGORY_KIND_MISMATCH'), true);
});

runTest('22. débito total igual a crédito total', () => {
  const plan = buildPostingPlan(baseInput);
  assert.strictEqual(plan.journalEntry.totalDebitCents, 1000);
  assert.strictEqual(plan.journalEntry.totalCreditCents, 1000);
});

runTest('23. planHash é determinístico', () => {
  const plan1 = buildPostingPlan(baseInput);
  const plan2 = buildPostingPlan(JSON.parse(JSON.stringify(baseInput)));
  assert.strictEqual(plan1.planHash, plan2.planHash);
});

runTest('24. alteração material muda planHash', () => {
  const plan1 = buildPostingPlan(baseInput);
  const input2 = JSON.parse(JSON.stringify(baseInput));
  input2.transaction.amountCents = 1001;
  input2.allocations[0].amountCents = 1001;
  const plan2 = buildPostingPlan(input2);
  assert.notStrictEqual(plan1.planHash, plan2.planHash);
});

runTest('25. texto visual não muda planHash', () => {
  const plan1 = buildPostingPlan(baseInput);
  const input2 = JSON.parse(JSON.stringify(baseInput));
  input2.transaction.description = 'Visual change';
  const plan2 = buildPostingPlan(input2);
  assert.strictEqual(plan1.planHash, plan2.planHash);
});

runTest('26. reversão inverte todas as linhas', () => {
  const plan = buildPostingPlan(baseInput);
  const rev = buildReversalPlan(plan);
  assert.strictEqual(rev.journalEntry.lines.length, plan.journalEntry.lines.length);
  for (let i = 0; i < plan.journalEntry.lines.length; i++) {
    const orig = plan.journalEntry.lines[i];
    const revLine = rev.journalEntry.lines.find(l => l.lineKey === orig.lineKey)!;
    assert.strictEqual(revLine.debitCents, orig.creditCents);
    assert.strictEqual(revLine.creditCents, orig.debitCents);
  }
});

runTest('27. reversão permanece balanceada', () => {
  const plan = buildPostingPlan(baseInput);
  const rev = buildReversalPlan(plan);
  const debitSum = rev.journalEntry.lines.reduce((s, l) => s + l.debitCents, 0);
  const creditSum = rev.journalEntry.lines.reduce((s, l) => s + l.creditCents, 0);
  assert.strictEqual(debitSum, creditSum);
});

runTest('28. reversão referencia o plano original', () => {
  const plan = buildPostingPlan(baseInput);
  const rev = buildReversalPlan(plan);
  assert.strictEqual(rev.transactionId, plan.transactionId);
  // and planHash is different
  assert.notStrictEqual(rev.planHash, plan.planHash);
});

// Human explanation tests
runTest('Explicação Humana - Income', () => {
  const plan = buildPostingPlan(baseInput);
  const lines = describePostingPlan(plan, { getAccountName: () => 'Banco', getCategoryName: () => 'Dízimo', formatMoney: () => '10' });
  assert.strictEqual(lines.some(l => l.includes('receberá')), true);
});

runTest('Explicação Humana - Expense no Cartão', () => {
  const input = JSON.parse(JSON.stringify(baseInput));
  input.transaction.transactionKind = 'expense';
  input.transaction.accountId = 'cc1';
  input.allocations[0].categoryId = 'cat_exp';
  const plan = buildPostingPlan(input);
  const lines = describePostingPlan(plan, { getAccountName: () => 'Cartão', getCategoryName: () => 'Dízimo', formatMoney: () => '10' });
  assert.strictEqual(lines.some(l => l.includes('obrigação')), true);
  assert.strictEqual(lines.some(l => l.includes('Nenhum saldo')), true);
});

console.log(`\nTotals: Passed ${passed}, Failed ${failed}`);
if (failed > 0) process.exit(1);
