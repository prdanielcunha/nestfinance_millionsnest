import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getPayableDueState,localCivilDay} from '../shared/finance/payableUrgency.js';

const base={dueDate:'2026-10-17',today:'2026-10-17',amountCents:12050,paidCents:0,
  remainingCents:12050,status:'open' as const};
assert.deepEqual(getPayableDueState(base),{kind:'today',days:0});
assert.deepEqual(getPayableDueState({...base,dueDate:'2026-10-16'}),{kind:'overdue',days:1});
assert.deepEqual(getPayableDueState({...base,dueDate:'2026-10-18'}),{kind:'upcoming',days:1});
assert.deepEqual(getPayableDueState({...base,dueDate:'2026-10-20'}),{kind:'upcoming',days:3});
assert.deepEqual(getPayableDueState({...base,today:'2026-03-01',dueDate:'2026-02-28'}),{kind:'overdue',days:1});
assert.deepEqual(getPayableDueState({...base,today:'2028-03-01',dueDate:'2028-02-29'}),{kind:'overdue',days:1});
assert.deepEqual(getPayableDueState({...base,status:'awaiting_review'}),{kind:'today',days:0});
assert.deepEqual(getPayableDueState({...base,status:'partially_paid',paidCents:2050,remainingCents:10000}),
  {kind:'today',days:0});
assert.deepEqual(getPayableDueState({...base,status:'settled',paidCents:12050,remainingCents:0}),
  {kind:'closed',days:null});
assert.deepEqual(getPayableDueState({...base,status:'cancelled'}),{kind:'closed',days:null});
for(const fields of [
  {dueDate:'2026-02-30'},
  {dueDate:'2026-13-01'},
  {today:'tomorrow'},
  {amountCents:0},
  {remainingCents:-1},
  {paidCents:-1},
  {paidCents:12000},
  {remainingCents:NaN},
  {amountCents:1.5},
  {status:'untrusted'},
  {status:'awaiting_review',paidCents:1,remainingCents:12049},
])assert.equal(getPayableDueState({...base,...fields} as any).kind,'invalid',JSON.stringify(fields));
const localDate=new Date(2026,9,17,23,59);
assert.equal(localCivilDay(localDate),'2026-10-17');

const ui=readFileSync('src/pages/finance/PayablesPage.tsx','utf8');
for(const v of ['Vencida há','Overdue by','Vencida hace','Vence hoje','Due today','Vence hoy',
  'Parcialmente paga','Partially paid','Parcialmente pagada','Marcada como quitada',
  'Marked as settled','Marcada como liquidada','Cancelada','Cancelled','daySingular','dayPlural',
  'getPayableDueState({...item,today:localCivilDay(new Date())})'])
  assert.ok(ui.includes(v),'Payable due UX missing: '+v);
assert.ok(ui.includes("role={urgency.kind==='invalid'?'alert':undefined}"),
  'Corrupt payable must be visible as a warning, never assumed paid');
console.log('✅ T19 unpaid due clarity: civil days, overdue, today, partial/settled distinctions, PT/EN/ES, fail closed');
