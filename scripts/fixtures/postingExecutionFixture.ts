import assert from 'node:assert/strict';
import { buildPostingPlan } from '../../shared/finance/ledger/postingPlan.js';
import { computeApprovalSourceHash } from '../../shared/finance/ledger/approvalSourceHash.js';
import { executionReferences, type PostingCatalog } from '../../shared/finance/ledger/postingExecution.js';
import type { FinanceAllocation } from '../../shared/finance/ledger/allocation.js';

export function postingExecutionFixture(kind:'income'|'expense'|'transfer'|'liability_settlement'='income', orgName='org_synthetic_execution', options:{accountId?:string;fundId?:string;countSource?:unknown}={}) {
const organizationId=orgName,financeEntityId='entity_synthetic_execution';
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
  const tx:any={id:'tx_11111111111111111111',organizationId,financeEntityId,
    transactionKind:kind,status:'approved_for_posting',cashFlowDirection:kind==='income'?'inflow':'outflow',
    amountCents:12345,currency:'BRL',occurredAt:'2026-10-10T12:00:00Z',recordedAt:'2026-10-11T12:00:00Z',
    paymentMethod:'cash',sourceContext:'manual',evidenceIds:[],evidenceJustification:'Synthetic receipt checked',
    reconciliationStatus:'unreconciled',createdBy:'creator',updatedBy:'approver',approvedBy:'approver',
    contentVersion:1,version:4,approvedVersion:3,schemaVersion:2,
    ...(kind==='income'||kind==='expense'?{accountId:options.accountId||'cash',allocationIds:['alloc_11111111111111111111']}:{}),
    ...(options.countSource?{countSource:options.countSource}:{}),
    ...(kind==='transfer'?{sourceAccountId:'cash',destinationAccountId:'bank'}:{}),
    ...(kind==='liability_settlement'?{sourceAccountId:'bank',liabilityAccountId:'liability',settlementType:'other_liability'}:{}),
  };
  const allocations:FinanceAllocation[]=kind==='income'||kind==='expense'?[{
    id:'alloc_11111111111111111111',organizationId,financeEntityId,transactionId:tx.id,
    categoryId:kind==='income'?'tithe':'rent',amountCents:12345,sequence:1,
    ...(options.fundId?{fundId:options.fundId}:{}),
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
