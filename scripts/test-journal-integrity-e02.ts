import assert from 'node:assert/strict';
import {
  assertJournalBalanced, calculateJournalTotals, validateJournalBalance, validateJournalLine,
  type JournalEntry, type JournalLine,
} from '../shared/finance/ledger/journal.js';

/** Critical E02 prerequisites: verify journal identity, safe-cent sums and balance. */
const id='je_1234',org='org_test',entity='fent_1234';
const base:JournalLine={
  id:'jl_1',organizationId:org,financeEntityId:entity,journalEntryId:id,
  ledgerAccountId:'la_bank',debitCents:12345,creditCents:0,sequence:1,
};
const credit:JournalLine={...base,id:'jl_2',ledgerAccountId:'la_contributions',debitCents:0,creditCents:12345,sequence:2};
const entry:JournalEntry={
  id,organizationId:org,financeEntityId:entity,sourceTransactionId:'tx_test',
  description:'Synthetic offering receipt',postedAt:'2026-10-16T00:00:00Z',
  postedBy:'test',status:'valid',lines:[base,credit],
};
assert.deepEqual(calculateJournalTotals(entry.lines),{debits:12345,credits:12345});
assert.doesNotThrow(()=>assertJournalBalanced(entry));
assert.doesNotThrow(()=>validateJournalBalance(entry.lines,entity));

function fail(f:()=>unknown,label:string){
  assert.throws(f,undefined,label);
}
fail(()=>validateJournalLine({...base,debitCents:-1},entity),'negative debit');
fail(()=>validateJournalLine({...base,debitCents:0,creditCents:0},entity),'empty line');
fail(()=>validateJournalLine({...base,creditCents:2},entity),'double side');
fail(()=>validateJournalLine({...base,debitCents:1.5},entity),'fractional cent');
fail(()=>validateJournalLine({...base,debitCents:NaN},entity),'NaN');
fail(()=>validateJournalLine({...base,ledgerAccountId:''},entity),'no ledger account');
fail(()=>validateJournalLine({...base,organizationId:''},entity),'no org');
fail(()=>validateJournalLine({...base,id:''},entity),'no line identity');
fail(()=>validateJournalLine({...base,journalEntryId:''},entity),'no journal parent');
fail(()=>validateJournalLine({...base,sequence:0},entity),'zero-based sequence');
fail(()=>validateJournalLine({...base,sequence:1.5},entity),'fractional sequence');
fail(()=>validateJournalLine({...base,financeEntityId:'another'},entity),'cross-entity');
fail(()=>calculateJournalTotals([{...base,debitCents:Number.MAX_SAFE_INTEGER},{...base,id:'other',debitCents:1}]),'unsafe debit sum');
fail(()=>calculateJournalTotals([{...credit,creditCents:Number.MAX_SAFE_INTEGER},{...credit,id:'other',creditCents:1}]),'unsafe credit sum');
fail(()=>validateJournalBalance([base,{...credit,creditCents:12344}],entity),'off by one cent');
fail(()=>validateJournalBalance([base,{...credit,sequence:1}],entity),'duplicate ordinal');
fail(()=>validateJournalBalance([base,{...credit,id:base.id}],entity),'duplicate line ID');
fail(()=>validateJournalBalance([base],entity),'single-entry journal');
fail(()=>validateJournalBalance(Array.from({length:501},(_,i)=>({...base,id:'jl_'+i,sequence:i+1})),entity),'too many journal lines');
fail(()=>assertJournalBalanced({...entry,lines:[base,{...credit,organizationId:'other'}]}),'cross org');
fail(()=>assertJournalBalanced({...entry,lines:[base,{...credit,journalEntryId:'other'}]}),'line references a different journal');
fail(()=>assertJournalBalanced({...entry,organizationId:''}),'missing org header');
fail(()=>assertJournalBalanced({...entry,id:''}),'missing journal ID');
fail(()=>assertJournalBalanced({...entry,financeEntityId:''}),'missing entity header');

assert.equal(entry.status,'valid');
console.log('✅ E02 journal core: balanced cents and 24 failure cases for invalid, foreign, overflow and duplicate lines');
