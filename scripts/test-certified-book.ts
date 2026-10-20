import assert from 'node:assert/strict';
import { certifiedPlanReferences, ledgerDate, validateLedgerConfiguration, type CertifiedLedgerConfiguration } from '../shared/finance/ledger/certifiedConfiguration.js';
import { computeApprovalSourceHash } from '../shared/finance/ledger/approvalSourceHash.js';
import { buildPostingPlan } from '../shared/finance/ledger/postingPlan.js';
import { certifyApprovedPosting, certifyReversal, certifyOpening, assertBookEntry } from '../shared/finance/ledger/certifiedPosting.js';
import { buildCertifiedBookReport } from '../shared/finance/ledger/certifiedReports.js';

const org='synthetic_org',entity='synthetic_church';
const chart:CertifiedLedgerConfiguration={schemaVersion:1,enabled:true,version:1,firstPeriod:'2026-09',timeZone:'America/Sao_Paulo',currency:'BRL',dateBasis:'occurred_at',openingEquityAccountId:'equity',
  accounts:[{id:'cash',name:'Cash',type:'asset',normalBalance:'debit',active:true,postingAllowed:true},{id:'tithes',name:'Tithes',type:'income',normalBalance:'credit',active:true,postingAllowed:true},{id:'equity',name:'Opening equity',type:'equity',normalBalance:'credit',active:true,postingAllowed:true}],
  financeAccounts:[{accountId:'bank',ledgerAccountId:'cash',type:'asset'}],categories:[{categoryId:'tithe',ledgerAccountId:'tithes',kind:'income'}]};
const transaction:any={id:'tx_synthetic',organizationId:org,financeEntityId:entity,transactionKind:'income',cashFlowDirection:'inflow',status:'ready_for_review',amountCents:10000,currency:'BRL',occurredAt:'2026-10-01T01:00:00Z',recordedAt:'2026-10-02T01:00:00Z',accountId:'bank',description:'Synthetic delayed Pix',evidenceIds:[],evidenceJustification:'Synthetic test fixture only',paymentMethod:'pix',sourceContext:'manual',reconciliationStatus:'unreconciled',createdBy:'creator',updatedBy:'creator',version:4,contentVersion:3,schemaVersion:1};
const allocations:any[]=[{id:'alloc_synthetic',organizationId:org,financeEntityId:entity,transactionId:transaction.id,categoryId:'tithe',amountCents:10000,sequence:1}];
function fixture(){
  const tx=structuredClone(transaction),config=structuredClone(chart),allocs=structuredClone(allocations);
  const refs=certifiedPlanReferences(config,org,entity);
  const plan=buildPostingPlan({transaction:tx,allocations:allocs,...refs,isPreview:true,approval:{approvedVersion:tx.version,approvalSourceHash:'preview',status:'approved_for_posting',approvalAlgorithmVersion:3}});
  assert.deepEqual(plan.blockers,[]);
  const approval={status:'approved_for_posting',approvedVersion:tx.version,approvedContentVersion:tx.contentVersion,approvalAlgorithmVersion:3,approvalSourceHash:computeApprovalSourceHash(tx,allocs,3),approvedPlanHash:plan.planHash,approvedReferenceFingerprintHash:refs.referenceFingerprintHash};
  Object.assign(tx,approval,{version:tx.version+1});
  return {transaction:tx,allocations:allocs,approval,configuration:config,organizationId:org,financeEntityId:entity,actor:'synthetic_approver',postedAt:'2026-10-02T12:00:00.000Z'};
}
let cases=0;
function rejects(change:(f:ReturnType<typeof fixture>)=>void,code:string){const f=fixture();change(f);assert.throws(()=>certifyApprovedPosting(f),(e:any)=>e.code===code,code);cases++;}
const f=fixture(),entry=certifyApprovedPosting(f);cases++;
assert.equal(entry.effectiveDate,'2026-09-30','church local received day, not registration day');
assert.equal(entry.lines.reduce((s,l)=>s+l.debitCents,0),10000);
assert.equal(certifyApprovedPosting(f).id,entry.id,'deterministic identity');cases++;
rejects(f=>f.transaction.amountCents++,'LEDGER_APPROVAL_SOURCE_CHANGED');
rejects(f=>f.transaction.reimbursement={payableId:'person'},'LEDGER_APPROVAL_SOURCE_CHANGED');
rejects(f=>f.transaction.payableSource={id:'pay_synthetic'},'LEDGER_APPROVAL_SOURCE_CHANGED');
rejects(f=>f.transaction.settlementType='other_liability','LEDGER_APPROVAL_SOURCE_CHANGED');
rejects(f=>f.transaction.cashFlowDirection='outflow','LEDGER_APPROVAL_SOURCE_CHANGED');
rejects(f=>f.transaction.approvalAlgorithmVersion=2,'LEDGER_REAPPROVAL_REQUIRED');
rejects(f=>f.approval.approvalAlgorithmVersion=2,'LEDGER_REAPPROVAL_REQUIRED');
rejects(f=>f.transaction.approvalVerificationRepair={verificationAlgorithmVersion:3},'LEDGER_REAPPROVAL_REQUIRED');
rejects(f=>f.transaction.status='ready_for_review','LEDGER_REAPPROVAL_REQUIRED');
rejects(f=>f.approval.status='invalidated','LEDGER_REAPPROVAL_REQUIRED');
rejects(f=>f.transaction.version++,'LEDGER_REAPPROVAL_REQUIRED');
rejects(f=>f.transaction.contentVersion++,'LEDGER_REAPPROVAL_REQUIRED');
rejects(f=>f.configuration.dateBasis='competence_date','LEDGER_APPROVAL_REFERENCES_CHANGED');
rejects(f=>f.configuration.timeZone='UTC','LEDGER_APPROVAL_REFERENCES_CHANGED');
rejects(f=>f.configuration.version++,'LEDGER_APPROVAL_REFERENCES_CHANGED');
rejects(f=>f.approval.approvedPlanHash='sha256:forged','LEDGER_APPROVAL_PLAN_CHANGED');
rejects(f=>f.transaction.financeEntityId='another','LEDGER_SCOPE_INVALID');
rejects(f=>f.allocations[0].organizationId='another','LEDGER_SCOPE_INVALID');
rejects(f=>f.allocations[0].transactionId='another','LEDGER_ALLOCATION_INVALID');
const reversal=certifyReversal(entry,{actor:'synthetic_approver',postedAt:'2026-10-04T12:00:00Z',effectiveDate:'2026-10-04',reason:'Correction of synthetic duplicate receipt'});
assert.equal(reversal.reversalOfEntryId,entry.id);
assert.equal(entry.effectiveDate,'2026-09-30','original remains in original month');
assert.deepEqual(entry.lines.map(l=>[l.debitCents,l.creditCents]),reversal.lines.map(l=>[l.creditCents,l.debitCents]));cases++;
assert.throws(()=>certifyReversal(reversal,{actor:'synthetic_approver',postedAt:'2026-10-04',effectiveDate:'2026-10-04',reason:'Do not reverse reversal'}));cases++;
const originalClone=JSON.stringify(entry);
const report=buildCertifiedBookReport([reversal,entry],{organizationId:org,financeEntityId:entity,startDate:'2026-10-01',endDateExclusive:'2026-11-01'});
assert.equal(report.journal.length,1);assert.equal(report.journal[0].id,reversal.id);
const cash=report.trialBalance.find(r=>r.accountId==='cash')!;
assert.equal(cash.openingDebitNetCents,10000);assert.equal(cash.creditCents,10000);assert.equal(cash.closingDebitNetCents,0);
assert.equal(report.totals.debitCents,report.totals.creditCents);
assert.equal(JSON.stringify(entry),originalClone,'report cannot mutate original');cases++;
const september=buildCertifiedBookReport([entry,reversal],{organizationId:org,financeEntityId:entity,startDate:'2026-09-01',endDateExclusive:'2026-10-01'});
assert.equal(september.trialBalance.find(r=>r.accountId==='cash')!.closingDebitNetCents,10000);cases++;
assert.throws(()=>buildCertifiedBookReport([entry,entry],report.scope));cases++;
const tampered=structuredClone(entry);tampered.lines[0].debitCents++;
assert.throws(()=>assertBookEntry(tampered,org,entity));cases++;
for(const date of [null,undefined,0,true,'2026-02-30','invalid']){assert.throws(()=>ledgerDate(date,'UTC'));cases++;}
for(const timeZone of [undefined,'','Invalid/Zone']){assert.throws(()=>validateLedgerConfiguration({...chart,timeZone}));cases++;}
assert.equal(ledgerDate('2026-10-04','America/Sao_Paulo'),'2026-10-04');cases++;
assert.equal(ledgerDate('2026-10-04T01:00:00Z','America/Sao_Paulo'),'2026-10-03');cases++;
const openingArgs={configuration:chart,organizationId:org,financeEntityId:entity,accountId:'bank',amountCents:50000,asOf:'2026-09-01',actor:'synthetic_approver',postedAt:'2026-10-01T12:00:00Z',declarationHash:'sha256:'+'a'.repeat(64)};
const opening=certifyOpening(openingArgs)!;assert.equal(opening.sourceKind,'opening');assert.equal(opening.lines[0].debitCents,50000);cases++;
assert.equal(certifyOpening({...openingArgs,amountCents:0}),null);cases++;
assert.equal(certifyOpening({...openingArgs,amountCents:-50000})!.lines[0].creditCents,50000);cases++;
assert.throws(()=>certifyOpening({...openingArgs,asOf:'2026-09-02'}));cases++;
assert.throws(()=>certifyReversal(opening,{actor:'synthetic_approver',postedAt:'2026-10-04',effectiveDate:'2026-10-04',reason:'Opening corrections require dedicated workflow'}));cases++;
// Fully re-seal an economically invalid liability receipt: a matching hash
// cannot authorize a contradiction between journal and account projection.
const invalidNature=fixture();
invalidNature.configuration.accounts[0].type='liability';invalidNature.configuration.accounts[0].normalBalance='credit';invalidNature.configuration.financeAccounts[0].type='liability';
const invalidRefs=certifiedPlanReferences(invalidNature.configuration,org,entity);
invalidNature.approval.approvedReferenceFingerprintHash=invalidRefs.referenceFingerprintHash;invalidNature.transaction.approvedReferenceFingerprintHash=invalidRefs.referenceFingerprintHash;
assert.throws(()=>certifyApprovedPosting(invalidNature),(e:any)=>e.code==='LEDGER_ACCOUNT_NATURE_INVALID');cases++;
console.log(`Certified book: ${cases} cases passed (v3 seal, material, scope, immutable reversal, timezone, journal/ledger/trial balance).`);
