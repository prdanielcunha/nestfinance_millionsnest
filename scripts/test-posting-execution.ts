import assert from 'node:assert/strict';
import { buildPostingPlan } from '../shared/finance/ledger/postingPlan.js';
import { computeApprovalSourceHash } from '../shared/finance/ledger/approvalSourceHash.js';
import { executionReferences, preparePostingExecution, type PostingCatalog } from '../shared/finance/ledger/postingExecution.js';
import type { FinanceAllocation } from '../shared/finance/ledger/allocation.js';

const organizationId='org_synthetic_execution',financeEntityId='entity_synthetic_execution';
const scope={organizationId,financeEntityId,active:true,version:1};
const catalog:PostingCatalog={
  accounts:[{...scope,id:'cash',nature:'asset',currency:'BRL',ledgerMapping:'la_cash'},
    {...scope,id:'bank',nature:'asset',currency:'BRL',ledgerMapping:'la_bank'},
    {...scope,id:'liability',nature:'liability',currency:'BRL',ledgerMapping:'la_liability'}],
  categories:[{...scope,id:'tithe',kind:'income',ledgerMapping:'la_tithe'},
    {...scope,id:'rent',kind:'expense',ledgerMapping:'la_rent'}],
  ledgerAccounts:[
    {...scope,id:'la_cash',name:'Synthetic cash',type:'asset',normalBalance:'debit',postingAllowed:true},
    {...scope,id:'la_bank',name:'Synthetic bank',type:'asset',normalBalance:'debit',postingAllowed:true},
    {...scope,id:'la_liability',name:'Synthetic liability',type:'liability',normalBalance:'credit',postingAllowed:true},
    {...scope,id:'la_tithe',name:'Synthetic tithe',type:'income',normalBalance:'credit',postingAllowed:true},
    {...scope,id:'la_rent',name:'Synthetic rent',type:'expense',normalBalance:'debit',postingAllowed:true},
  ],funds:[{...scope,id:'mission'}],
};
function fixture(kind:'income'|'expense'|'transfer'|'liability_settlement'='income') {
  const tx:any={id:'tx_11111111111111111111',organizationId,financeEntityId,
    transactionKind:kind,status:'approved_for_posting',cashFlowDirection:kind==='income'?'inflow':'outflow',
    amountCents:12345,currency:'BRL',occurredAt:'2026-10-10T12:00:00Z',recordedAt:'2026-10-11T12:00:00Z',
    paymentMethod:'cash',sourceContext:'manual',evidenceIds:[],evidenceJustification:'Synthetic receipt checked',
    reconciliationStatus:'unreconciled',createdBy:'creator',updatedBy:'approver',approvedBy:'approver',
    contentVersion:1,version:4,approvedVersion:3,schemaVersion:2,
    ...(kind==='income'||kind==='expense'?{accountId:'cash',allocationIds:['alloc_11111111111111111111']}:{}),
    ...(kind==='transfer'?{sourceAccountId:'cash',destinationAccountId:'bank'}:{}),
    ...(kind==='liability_settlement'?{sourceAccountId:'bank',liabilityAccountId:'liability',settlementType:'other_liability'}:{}),
  };
  const allocations:FinanceAllocation[]=kind==='income'||kind==='expense'?[{
    id:'alloc_11111111111111111111',organizationId,financeEntityId,transactionId:tx.id,
    categoryId:kind==='income'?'tithe':'rent',amountCents:12345,sequence:1,
    createdAt:'2026-10-10T12:00:00Z',createdBy:'creator',schemaVersion:1,
  }]:[];
  tx.approvalSourceHash=computeApprovalSourceHash(tx,allocations,2);
  const selected=structuredClone(catalog),references=executionReferences(tx,allocations,selected);
  const approval={status:'approved_for_posting',approvedVersion:3,approvedContentVersion:1,approvedBy:'approver',
    approvalSourceHash:tx.approvalSourceHash,approvalAlgorithmVersion:2,approvedReferenceFingerprintHash:references.referenceFingerprintHash,
    approvedPlanHash:''};
  const plan=buildPostingPlan({transaction:tx,allocations,...references,approval:{...approval,approvalAlgorithmVersion:2}});
  assert.deepEqual(plan.blockers,[]);approval.approvedPlanHash=plan.planHash;
  return {transaction:tx,allocations,approval,catalog:selected,expectedVersion:4,actorUid:'poster',
    now:'2026-10-18T12:00:00Z',timezone:'America/Sao_Paulo',periodOpen:true,
    journalEntryId:'je_11111111111111111111',
    journalLineIds:plan.journalEntry.lines.map((_,i)=>'jl_'+String(i+1).padStart(20,'0'))};
}
for(const kind of ['income','expense','transfer','liability_settlement'] as const){
  const input=fixture(kind),result=preparePostingExecution(input);
  assert.equal(result.journal.lines.length,2);assert.equal(result.effectiveDay,'2026-10-10');
  assert.equal(result.period,'2026-10');
  assert.equal(result.journal.lines.reduce((n,l)=>n+l.debitCents,0),12345);
  assert.equal(result.journal.lines.reduce((n,l)=>n+l.creditCents,0),12345);
  const expected=kind==='income'?[{accountId:'cash',deltaCents:12345}]:kind==='expense'?[{accountId:'cash',deltaCents:-12345}]:
    kind==='transfer'?[{accountId:'bank',deltaCents:12345},{accountId:'cash',deltaCents:-12345}]:
    [{accountId:'bank',deltaCents:-12345},{accountId:'liability',deltaCents:-12345}];
  assert.deepEqual(result.accountDeltas,expected);
  assert.equal(input.transaction.status,'approved_for_posting','pure planning cannot post a record');
}
const failures:[string,(input:ReturnType<typeof fixture>)=>void][]=[
  ['stale version',i=>{i.expectedVersion=3;}],
  ['fractional version',i=>{i.expectedVersion=4.5;i.transaction.version=4.5;}],
  ['draft',i=>{i.transaction.status='draft';}],
  ['closed period',i=>{i.periodOpen=false;}],
  ['unsupported currency',i=>{i.transaction.currency='USD';}],
  ['future receipt',i=>{i.transaction.occurredAt='2026-10-20';}],
  ['duplicate posting',i=>{i.transaction.journalEntryId='je_22222222222222222222';}],
  ['changed amount',i=>{i.transaction.amountCents=1;}],
  ['changed evidence',i=>{i.transaction.evidenceJustification='Changed';}],
  ['stale material',i=>{i.transaction.contentVersion=2;}],
  ['invalid material version',i=>{i.transaction.contentVersion=-1;}],
  ['invalid approval algorithm',i=>{i.approval.approvalAlgorithmVersion=1;}],
  ['invalidated approval',i=>{i.approval.status='invalidated';}],
  ['changed approver',i=>{i.approval.approvedBy='another';}],
  ['stale plan',i=>{i.approval.approvedPlanHash='sha256:wrong';}],
  ['catalog version changed',i=>{i.catalog.accounts[0].version=2;}],
  ['cross entity catalog',i=>{i.catalog.accounts[0].financeEntityId='other';}],
  ['cross org allocation',i=>{i.allocations[0].organizationId='other';}],
  ['cross transaction allocation',i=>{i.allocations[0].transactionId='tx_other';}],
  ['unpersisted default mapping',i=>{i.catalog.accounts[0].ledgerMapping='la_default_asset_cash';}],
  ['disabled ledger',i=>{i.catalog.ledgerAccounts[0].postingAllowed=false;}],
  ['archived account',i=>{i.catalog.accounts[0].active=false;}],
  ['malformed catalog version',i=>{i.catalog.accounts[0].version=0;}],
  ['wrong ledger type',i=>{i.catalog.ledgerAccounts[0].type='income';}],
  ['cross entity ledger',i=>{i.catalog.ledgerAccounts[0].financeEntityId='other';}],
  ['unresolved fund',i=>{i.allocations[0].fundId='unconfigured';}],
  ['unconfigured cost center',i=>{i.allocations[0].costCenterId='unconfigured';}],
  ['duplicate allocation',i=>{i.allocations.push({...i.allocations[0]});}],
  ['fractional amount',i=>{i.transaction.amountCents=123.45;}],
  ['overflow',i=>{i.transaction.amountCents=Number.MAX_SAFE_INTEGER+1;}],
  ['duplicate journal line identity',i=>{i.journalLineIds[1]=i.journalLineIds[0];}],
];
for(const [name,mutate]of failures){const input=fixture();mutate(input);assert.throws(()=>preparePostingExecution(input),undefined,name);}
const permuted=fixture();permuted.catalog.accounts.reverse();permuted.catalog.ledgerAccounts.reverse();
assert.equal(preparePostingExecution(permuted).plan.planHash,preparePostingExecution(fixture()).plan.planHash);
const wrongIncome=fixture();wrongIncome.transaction.accountId='liability';assert.throws(()=>preparePostingExecution(wrongIncome));
const sameAccount=fixture('transfer');sameAccount.transaction.destinationAccountId='cash';assert.throws(()=>preparePostingExecution(sameAccount));
console.log('Posting execution: 4 balanced flows, 33 rejection/integrity cases and deterministic reference order passed');
