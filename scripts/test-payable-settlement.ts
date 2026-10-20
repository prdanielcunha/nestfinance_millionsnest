import assert from 'node:assert/strict';
import { recognizePayable,settlePayable,reversePayablePayment } from '../shared/finance/payableSettlement.js';
import { buildCertifiedBookReport } from '../shared/finance/ledger/certifiedReports.js';
import type { CertifiedLedgerConfiguration } from '../shared/finance/ledger/certifiedConfiguration.js';
const configuration:CertifiedLedgerConfiguration={schemaVersion:1,enabled:true,version:1,firstPeriod:'2026-09',timeZone:'America/Sao_Paulo',currency:'BRL',dateBasis:'competence_date',openingEquityAccountId:'equity',
  accounts:[
    {id:'bank',name:'Bank',type:'asset',normalBalance:'debit',active:true,postingAllowed:true},
    {id:'equity',name:'Opening equity',type:'equity',normalBalance:'credit',active:true,postingAllowed:true},
    {id:'payables',name:'Payables',type:'liability',normalBalance:'credit',active:true,postingAllowed:true},
    {id:'power',name:'Power expense',type:'expense',normalBalance:'debit',active:true,postingAllowed:true},
    {id:'fees',name:'Financial charges',type:'expense',normalBalance:'debit',active:true,postingAllowed:true},
    {id:'discount',name:'Settlement discount',type:'income',normalBalance:'credit',active:true,postingAllowed:true}],
  financeAccounts:[{accountId:'bank_account',ledgerAccountId:'bank',type:'asset'}],categories:[{categoryId:'power_category',ledgerAccountId:'power',kind:'expense'},{categoryId:'fees_category',ledgerAccountId:'fees',kind:'expense'},{categoryId:'discount_category',ledgerAccountId:'discount',kind:'income'}]};
const scope={configuration,policy:{version:1,liabilityLedgerAccountId:'payables',feesCategoryId:'fees_category',discountCategoryId:'discount_category'},organizationId:'synthetic_org',financeEntityId:'synthetic_church',actor:'synthetic_approver',postedAt:'2026-10-10T12:00:00Z'};
const payable:any={organizationId:scope.organizationId,financeEntityId:scope.financeEntityId,description:'Synthetic power bill',counterparty:'Synthetic vendor',amountCents:10000,dueDate:'2026-10-05',status:'open',paidCents:0,remainingCents:10000,version:2,schemaVersion:1,postingPerformed:false};
const id='pay_'+'a'.repeat(32);
const recognized=recognizePayable(scope,id,payable,{categoryId:'power_category',fundId:'synthetic_fund',recognitionDate:'2026-09-30'});
let cases=0;
assert.equal(recognized.payable.status,'open');assert.equal(recognized.payable.remainingCents,10000);assert.deepEqual(recognized.journal.plan.accountEffects,[]);cases++;
assert.equal(recognized.journal.lines.find(l=>l.ledgerAccountId==='power')!.debitCents,10000);assert.equal(recognized.journal.lines.find(l=>l.ledgerAccountId==='payables')!.creditCents,10000);cases++;
const first=settlePayable(scope,id,recognized.payable,'payment_first',{accountId:'bank_account',principalCents:4000,feesCents:150,discountCents:500,paidOn:'2026-10-01',reference:'Synthetic first receipt'});
assert.equal(first.payable.remainingCents,5500);assert.equal(first.payable.status,'partially_paid');assert.equal(first.receipt.appliedCents,4500);assert.equal(first.receipt.cashOutCents,4150);cases++;
assert.equal(first.payable.principalPaidCents,4000);assert.equal(first.payable.discountCents,500);assert.equal(first.payable.feesPaidCents,150);cases++;
assert.equal(first.journal.lines.filter(l=>l.ledgerAccountId==='power').length,0,'payment cannot recognize invoice expense twice');cases++;
assert.equal(first.journal.plan.fundEffects.reduce((s,e)=>s+(e.effect==='increase'?e.amountCents:-e.amountCents),0),350,'only fee/discount change recognized fund movement');cases++;
const final=settlePayable(scope,id,first.payable,'payment_final',{accountId:'bank_account',principalCents:5500,feesCents:0,discountCents:0,paidOn:'2026-10-02',reference:'Synthetic final receipt'});
assert.equal(final.payable.status,'settled');assert.equal(final.payable.remainingCents,0);assert.equal(final.payable.principalPaidCents,9500);cases++;
const reversed=reversePayablePayment(scope,id,final.payable,first.receipt,first.journal,'2026-10-04','Correction of synthetic first payment');
assert.equal(reversed.payable.remainingCents,4500);assert.equal(reversed.payable.principalPaidCents,5500);assert.equal(reversed.payable.discountCents,0);assert.equal(reversed.payable.feesPaidCents,0);assert.equal(reversed.payable.status,'partially_paid');cases++;
assert.equal(reversed.journal.plan.accountEffects[0].effect,'increase');assert.equal(reversed.journal.plan.accountEffects[0].amountCents,4150);cases++;
const reversedFinal=reversePayablePayment(scope,id,reversed.payable,final.receipt,final.journal,'2026-10-05','Correction of synthetic final payment');
assert.equal(reversedFinal.payable.status,'open');assert.equal(reversedFinal.payable.remainingCents,10000);assert.equal(reversedFinal.payable.paidCents,0);cases++;
const fullDiscount=settlePayable(scope,id,recognized.payable,'discount_only',{accountId:'bank_account',principalCents:0,feesCents:0,discountCents:10000,paidOn:'2026-10-01',reference:'Synthetic full discount'});
assert.equal(fullDiscount.payable.status,'settled');assert.equal(fullDiscount.receipt.cashOutCents,0);assert.deepEqual(fullDiscount.journal.plan.accountEffects,[]);cases++;
const report=buildCertifiedBookReport([recognized.journal,first.journal,final.journal,reversed.journal],{organizationId:scope.organizationId,financeEntityId:scope.financeEntityId,startDate:'2026-09-01',endDateExclusive:'2026-11-01'});
assert.equal(report.trialBalance.find(a=>a.accountId==='payables')!.closingDebitNetCents,-4500);assert.equal(report.trialBalance.find(a=>a.accountId==='power')!.debitCents,10000);cases++;
const payment={accountId:'bank_account',principalCents:1000,feesCents:0,discountCents:0,paidOn:'2026-10-01',reference:'Synthetic receipt'};
for(const bad of [{principalCents:10001},{principalCents:-1},{feesCents:-1},{discountCents:-1},{principalCents:1.5},{principalCents:NaN},{principalCents:Infinity},{principalCents:0},{principalCents:9500,discountCents:501},{paidOn:'2026-09-29'},{paidOn:'2026-02-30'},{reference:''},{accountId:'foreign_account'}]){assert.throws(()=>settlePayable(scope,id,recognized.payable,'invalid_payment',{...payment,...bad}));cases++;}
assert.throws(()=>settlePayable(scope,id,final.payable,'paid_twice',payment));cases++;
assert.throws(()=>recognizePayable(scope,id,{...payable,status:'awaiting_review'},{categoryId:'power_category',recognitionDate:'2026-09-30'}));cases++;
assert.throws(()=>recognizePayable(scope,id,recognized.payable as any,{categoryId:'power_category',recognitionDate:'2026-09-30'}));cases++;
assert.throws(()=>settlePayable({...scope,financeEntityId:'foreign'},id,recognized.payable,'foreign',payment));cases++;
assert.throws(()=>settlePayable({...scope,policy:{...scope.policy,liabilityLedgerAccountId:'bank'}},id,recognized.payable,'bad_control',payment));cases++;
assert.throws(()=>settlePayable({...scope,policy:{version:1,liabilityLedgerAccountId:'payables'}},id,recognized.payable,'no_fee_mapping',{...payment,feesCents:10}));cases++;
assert.throws(()=>reversePayablePayment(scope,id,final.payable,{...first.receipt,appliedCents:10},first.journal,'2026-10-04','Forged receipt must be denied'));cases++;
assert.throws(()=>reversePayablePayment(scope,id,final.payable,first.receipt,final.journal,'2026-10-04','Wrong original must be denied'));cases++;
assert.throws(()=>reversePayablePayment(scope,id,final.payable,first.receipt,first.journal,'2026-09-30','Cannot reverse before payment date'));cases++;
const maxRecognition=recognizePayable(scope,id,{...payable,amountCents:20_000_000_000,remainingCents:20_000_000_000},{categoryId:'power_category',recognitionDate:'2026-09-30'});
const maxPayment=settlePayable(scope,id,maxRecognition.payable,'maximum_payment',{...payment,principalCents:20_000_000_000,feesCents:1});
assert.equal(maxPayment.receipt.cashOutCents,20_000_000_001);
assert.equal(reversePayablePayment(scope,id,maxPayment.payable,maxPayment.receipt,maxPayment.journal,'2026-10-02','Reverse maximum principal plus fee').payable.remainingCents,20_000_000_000);cases++;
const archivedScope={...scope,configuration:{...scope.configuration,accounts:scope.configuration.accounts.map(a=>({...a,active:false}))}};
assert.equal(reversePayablePayment(archivedScope,id,final.payable,first.receipt,first.journal,'2026-10-04','Historical snapshot is independent of current chart').payable.remainingCents,4500);cases++;
assert.throws(()=>settlePayable(scope,id,recognized.payable,'future_payment',{...payment,paidOn:'2026-10-11'}));cases++;
console.log(`Payable settlement: ${cases} new cases passed; recognition, partial/full payments, fee, discount, reversal, no duplicate invoice expense, balances and invalid inputs.`);
