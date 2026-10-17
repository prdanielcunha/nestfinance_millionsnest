import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildUnpaidPayable,parsePayableDraft,validPayableDate } from '../shared/finance/payableObligation.js';

const base={description:'Conta de energia',counterparty:'Concessionária',amountCents:18050,dueDate:'2026-11-10'};
assert.deepEqual(parsePayableDraft(base),base);
assert.deepEqual(buildUnpaidPayable(base,'org_a','entity_a'),{
  ...base,organizationId:'org_a',financeEntityId:'entity_a',
  status:'awaiting_review',paidCents:0,remainingCents:18050,
  version:1,schemaVersion:1,postingPerformed:false,
});
assert.equal(validPayableDate('2026-02-29'),false);
assert.equal(validPayableDate('2028-02-29'),true);
for(const addition of [{paidCents:0},{remainingCents:0},{status:'settled'},{accountId:'acc_123'},
  {journalEntryId:'je_foo'},{postingPerformed:true}]) {
  assert.throws(()=>parsePayableDraft({...base,...addition}));
}
for(const amountCents of [0,-1,1.5,NaN,Infinity,20_000_000_001]) {
  assert.throws(()=>parsePayableDraft({...base,amountCents}));
}
for(const dueDate of ['2026-02-30','2026-13-01','2026-01-00','yesterday']) {
  assert.throws(()=>parsePayableDraft({...base,dueDate}));
}
const ui=readFileSync('src/pages/finance/PayablesPage.tsx','utf8');
const tx=readFileSync('src/pages/finance/transactions/TransactionCreatePage.tsx','utf8');
const hub=readFileSync('src/pages/finance/TreasuryHubPage.tsx','utf8');
const gateway=readFileSync('api/finance-gateway.ts','utf8');
const rules=readFileSync('firestore.rules','utf8');
const route=readFileSync('src/app/router/index.tsx','utf8');
for(const field of ['description','counterparty','amountText','dueDate','documentReference','notes']) {
  assert.ok(ui.includes(field),'missing UI obligation field '+field);
}
for(const word of ['Contas a pagar','Bills to pay','Cuentas por pagar','Aguardando revisão','Sin pagar']) {
  assert.ok(ui.includes(word),'missing PT/EN/ES copy '+word);
}
assert.ok(ui.includes('payablesService.create('));
assert.ok(ui.includes('payablesService.list('));
assert.ok(ui.includes('FinanceContextGuard'));
assert.ok(tx.includes('Sim, já paguei') && tx.includes('Ainda vou pagar'));
assert.ok(hub.includes('route: APP_ROUTES.payables'));
assert.ok(route.includes('PayablesPage'));
assert.ok(gateway.includes("case 'payables-create'")&&gateway.includes("case 'payables-list'"));
assert.match(rules,/match \/financeEntities\/\{entityId\}\/financePayables\/\{document=\*\*\} \{\s*allow read, create, update, delete: if false;/);
console.log('✅ E05 T18/T19 contract, date/amount/client mutation guards, UI PT/EN/ES and server-only gateway');
