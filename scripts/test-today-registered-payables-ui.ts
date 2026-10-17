import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync('src/pages/finance/TodayLedgerOverview.tsx','utf8');
const summary=readFileSync('server/vercel-handlers/finance/transactionsSummary.ts','utf8');
const model=readFileSync('shared/finance/todayOperationalSummary.ts','utf8');
for(const label of ['Contas a pagar cadastradas','Registered unpaid bills','Cuentas por pagar registradas']){
  assert.ok(ui.includes(label),label+' must be translated');
}
assert.ok(ui.includes('operational?.registeredPayablesDueSoonCount !== undefined'));
assert.ok(ui.includes('copy.dueSuffix(dueCount)'), 'documentary due candidates remain distinct');
assert.ok(ui.includes('copy.billsSuffix(operational.registeredPayablesDueSoonCount)'),
 'registered bills are displayed separately from OCR suggestions');
assert.ok(model.includes('registeredPayablesDueSoonCount?: number'));
assert.ok(summary.includes("entityRef.collection('financePayables')"));
assert.ok(summary.includes("'awaiting_review','open','partially_paid'"));
assert.ok(summary.includes("throw Object.assign(new Error('PAYABLE_SCOPE_MISMATCH')"));
assert.ok(!summary.includes('dueSoonCount + registeredPayablesDueSoonCount'),'do not double count evidence');
console.log('✅ Today T04: distinct, three-language registered due bills (not combined with document suggestions)');
