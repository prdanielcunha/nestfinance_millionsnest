import assert from 'node:assert/strict';
import { assessRemittance, parseRemittancePolicy } from '../shared/finance/remittancePolicy.js';
import type { CertifiedBookEntry } from '../shared/finance/ledger/certifiedPosting.js';
const material={effectivePeriod:'2026-01',recipient:'Synthetic convention',percentageBasisPoints:1000,incomeCategoryIds:['synthetic_tithe'],expenseCategoryId:'synthetic_remittance',dueDay:10};
const policy=parseRemittancePolicy(material,1);
function entry(id:string,creditCents:number,overrides:any={}):CertifiedBookEntry {
  return {id,sourceKind:'transaction',plan:{transactionKind:'income'},accountsSnapshot:[{id:'synthetic_income',type:'income'}],lines:[{ledgerAccountId:'synthetic_income',categoryId:'synthetic_tithe',creditCents,debitCents:0}],...overrides} as CertifiedBookEntry;
}
const assess=(entries:CertifiedBookEntry[],p=policy)=>assessRemittance('2026-08',p,entries,()=> '2026-08-01');
assert.equal(assess([entry('a',105)]).amountCents,11,'half-cent rounds up exactly');
assert.equal(assess([entry('a',1)],{...policy,percentageBasisPoints:5000}).amountCents,1);
assert.equal(assess([entry('a',1)],{...policy,percentageBasisPoints:0}).amountCents,0);
const excluded=entry('offering',500,{lines:[{ledgerAccountId:'synthetic_income',categoryId:'synthetic_offering',creditCents:500,debitCents:0}]});
assert.equal(assess([entry('tithe',1000),excluded,entry('transfer',500,{plan:{transactionKind:'transfer'}}),entry('opening',500,{sourceKind:'opening'})]).baseCents,1000);
const reversed=entry('reversal',0,{lines:[{ledgerAccountId:'synthetic_income',categoryId:'synthetic_tithe',creditCents:0,debitCents:2000}]});
assert.equal(assess([entry('a',3000),reversed]).amountCents,100);
assert.deepEqual(assess([reversed]).blockers,['REMITTANCE_NEGATIVE_BASE_REQUIRES_REVIEW']);
assert.equal(assessRemittance('2026-08',policy,[entry('other_month',100)],()=> '2026-09-01').amountCents,0);
assert.throws(()=>assess([entry('same',100),entry('same',100)]),/DUPLICATE_ENTRY/);
assert.throws(()=>assess([entry('overflow',20_000_000_001)]),/AMOUNT_OVERFLOW/);
assert.throws(()=>assess([],{...policy,effectivePeriod:'2026-09'}),/NOT_EFFECTIVE/);
for(const patch of [{dueDay:29},{percentageBasisPoints:10001},{incomeCategoryIds:['duplicate','duplicate']},{incomeCategoryIds:[]},{effectivePeriod:'2026-13'},{unexpected:true}])assert.throws(()=>parseRemittancePolicy({...material,...patch},1),/POLICY_INVALID/);
assert.throws(()=>parseRemittancePolicy(material,0),/POLICY_INVALID/);
console.log('PASS remittance policy: exact rounding, explicit categories, exclusions, reversals, bounds, version and effective month.');
