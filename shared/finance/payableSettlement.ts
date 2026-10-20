import { createHash } from 'node:crypto';
import type { PayableRecord } from './payableObligation.js';
import { certifiedPlanReferences, ledgerDate, ledgerFailure, ledgerId, type CertifiedLedgerConfiguration } from './ledger/certifiedConfiguration.js';
import { assertBookEntry, assertBookScope, bookEntryHash, bookId, certifyReversal, type CertifiedBookEntry } from './ledger/certifiedPosting.js';
import { canonicalStringify, type PostingPlan, type PostingPlanLine } from './ledger/postingPlan.js';

export type PayableAccountingPolicy={version:number;liabilityLedgerAccountId:string;feesCategoryId?:string;discountCategoryId?:string};
export type RecognizedPayable=Omit<PayableRecord,'schemaVersion'|'postingPerformed'> & {
  schemaVersion:2;postingPerformed:true;recognitionEntryId:string;recognitionDate:string;categoryId:string;fundId?:string;
  liabilityLedgerAccountId:string;
  bookSettings:{firstPeriod:string;timeZone:string};
  /** paidCents is principal settled, including explicit discounts; the actual
   * cash component is principalPaidCents. Fees never reduce principal due. */
  principalPaidCents:number;discountCents:number;feesPaidCents:number;
};
export type PayablePaymentInput={accountId:string;principalCents:number;feesCents:number;discountCents:number;paidOn:string;reference:string;evidenceIds?:string[];evidenceJustification?:string};
export type PayablePaymentReceipt=PayablePaymentInput & {
  id:string;payableId:string;organizationId:string;financeEntityId:string;appliedCents:number;cashOutCents:number;
  journalEntryId:string;payableVersionBefore:number;payableVersionAfter:number;sourceHash:string;
};
type Scope={configuration:CertifiedLedgerConfiguration;policy:PayableAccountingPolicy;organizationId:string;financeEntityId:string;actor:string;postedAt:string};
type ReversalScope=Omit<Scope,'configuration'|'policy'> & {configuration:Pick<CertifiedLedgerConfiguration,'firstPeriod'|'timeZone'>};
const hash=(value:unknown)=>'sha256:'+createHash('sha256').update(canonicalStringify(value)).digest('hex');
function cents(value:unknown,positive=false):asserts value is number {
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<(positive?1:0)||value>20_000_000_000)ledgerFailure('PAYABLE_SETTLEMENT_AMOUNT_INVALID');
}
function sum(...values:number[]) {
  const result=values.reduce((s,v)=>s+v,0);
  if(!values.every(Number.isSafeInteger)||!Number.isSafeInteger(result))ledgerFailure('PAYABLE_SETTLEMENT_AMOUNT_INVALID');
  return result;
}
export function payablePolicyReferences(s:Scope) {
  const references=certifiedPlanReferences(s.configuration,s.organizationId,s.financeEntityId);
  const p=s.policy;
  if(!s.configuration.enabled||!p||!Number.isSafeInteger(p.version)||p.version<1||!ledgerId(p.liabilityLedgerAccountId)||!ledgerId(s.actor))ledgerFailure('PAYABLE_ACCOUNTING_POLICY_INVALID');
  const liability=s.configuration.accounts.find(a=>a.id===p.liabilityLedgerAccountId);
  if(!liability||liability.type!=='liability'||liability.normalBalance!=='credit'||!liability.active||!liability.postingAllowed)ledgerFailure('PAYABLE_LIABILITY_ACCOUNT_REQUIRED');
  if(s.configuration.financeAccounts.some(a=>a.ledgerAccountId===liability.id))ledgerFailure('PAYABLE_CONTROL_ACCOUNT_MUST_BE_SEPARATE');
  function category(id:string|undefined,kind:'income'|'expense') {
    if(!id)return undefined;
    if(!ledgerId(id))ledgerFailure('PAYABLE_ACCOUNTING_POLICY_INVALID');
    const m=s.configuration.categories.find(c=>c.categoryId===id&&c.kind===kind);
    const a=s.configuration.accounts.find(a=>a.id===m?.ledgerAccountId);
    if(!m||!a||a.type!==kind||!a.active||!a.postingAllowed)ledgerFailure('PAYABLE_CATEGORY_MAPPING_REQUIRED');
    return m;
  }
  return {...references,fees:category(p.feesCategoryId,'expense'),discount:category(p.discountCategoryId,'income')};
}
function dateInBook(value:string,s:ReversalScope) {
  const date=ledgerDate(value,s.configuration.timeZone);
  if(date!==value||date.slice(0,7)<s.configuration.firstPeriod||date>ledgerDate(s.postedAt,s.configuration.timeZone))ledgerFailure('PAYABLE_SETTLEMENT_DATE_INVALID');
  return date;
}
function assertRecognized(p:RecognizedPayable,s:Pick<Scope,'organizationId'|'financeEntityId'>) {
  assertBookScope(p,s.organizationId,s.financeEntityId);
  for(const value of [p.amountCents,p.paidCents,p.remainingCents,p.principalPaidCents,p.discountCents,p.feesPaidCents])cents(value);
  if(p.schemaVersion!==2||p.postingPerformed!==true||!ledgerId(p.recognitionEntryId)||!ledgerId(p.liabilityLedgerAccountId)||!Number.isSafeInteger(p.version)||p.version<1||
    !p.bookSettings||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(p.bookSettings.firstPeriod)||typeof p.bookSettings.timeZone!=='string'||!p.bookSettings.timeZone||p.bookSettings.timeZone.length>100||
    p.amountCents<=0||sum(p.paidCents,p.remainingCents)!==p.amountCents||sum(p.principalPaidCents,p.discountCents)!==p.paidCents||
    !['open','partially_paid','settled'].includes(p.status)||
    p.status!==(p.remainingCents===0?'settled':p.paidCents>0?'partially_paid':'open'))ledgerFailure('PAYABLE_ACCOUNTING_STATE_INVALID');
}
function entry(s:Scope,args:{sourceKind:'payable_recognition'|'payable_payment';sourceId:string;entryDate:string;description:string;material:unknown;lines:PostingPlanLine[];accountEffects?:PostingPlan['accountEffects'];fundEffects?:PostingPlan['fundEffects']}):CertifiedBookEntry {
  const refs=payablePolicyReferences(s),sourceHash=hash(args.material);
  const id='je_'+bookId(s.organizationId,s.financeEntityId,args.sourceKind,args.sourceId);
  const lines=args.lines.filter(l=>l.debitCents||l.creditCents);
  const plan:PostingPlan={planVersion:'1.0',transactionId:args.sourceId,organizationId:s.organizationId,financeEntityId:s.financeEntityId,transactionKind:'adjustment',approvedVersion:0,approvalSourceHash:sourceHash,
    journalEntry:{entryDate:args.entryDate,description:args.description,referenceType:'finance_transaction',referenceId:args.sourceId,lines,totalDebitCents:sum(...lines.map(l=>l.debitCents)),totalCreditCents:sum(...lines.map(l=>l.creditCents))},
    accountEffects:args.accountEffects??[],fundEffects:args.fundEffects??[],blockers:[],warnings:[],planHash:hash({lines,sourceHash,policy:s.policy,referenceFingerprintHash:refs.referenceFingerprintHash})};
  const base:Omit<CertifiedBookEntry,'integrityHash'>={id,organizationId:s.organizationId,financeEntityId:s.financeEntityId,sourceTransactionId:args.sourceId,description:args.description,postedAt:s.postedAt,postedBy:s.actor,status:'valid',schemaVersion:1,sourceKind:args.sourceKind,effectiveDate:args.entryDate,currency:'BRL',configurationVersion:s.configuration.version,referenceFingerprintHash:refs.referenceFingerprintHash,sourceHash,plan,accountsSnapshot:s.configuration.accounts.map(a=>({...a})),
    lines:lines.map((l,i)=>({id:'jl_'+bookId(id,l.lineKey),organizationId:s.organizationId,financeEntityId:s.financeEntityId,journalEntryId:id,ledgerAccountId:l.ledgerAccountId,debitCents:l.debitCents,creditCents:l.creditCents,sequence:i+1,...(l.categoryId?{categoryId:l.categoryId}:{}),...(l.fundId?{fundId:l.fundId}:{})}))};
  const clean=JSON.parse(JSON.stringify(base));
  const result={...clean,integrityHash:bookEntryHash(clean)} as CertifiedBookEntry;
  assertBookEntry(result,s.organizationId,s.financeEntityId);
  return result;
}

/** Recognize the reviewed obligation once. This is not a bank payment. */
export function recognizePayable(s:Scope,payableId:string,p:PayableRecord,classification:{categoryId:string;fundId?:string;recognitionDate:string}) {
  assertBookScope(p,s.organizationId,s.financeEntityId);cents(p.amountCents,true);
  if(!ledgerId(payableId)||p.schemaVersion!==1||p.postingPerformed!==false||p.status!=='open'||p.paidCents!==0||p.remainingCents!==p.amountCents||!Number.isSafeInteger(p.version)||p.version<1)ledgerFailure('PAYABLE_RECOGNITION_STATE_INVALID');
  const refs=payablePolicyReferences(s),mapping=s.configuration.categories.find(c=>c.categoryId===classification.categoryId&&c.kind==='expense');
  if(!mapping||classification.fundId&&!ledgerId(classification.fundId))ledgerFailure('PAYABLE_CATEGORY_MAPPING_REQUIRED');
  const recognitionDate=dateInBook(classification.recognitionDate,s);
  const material={payableId,payable:p,classification,policy:s.policy,referenceFingerprintHash:refs.referenceFingerprintHash};
  const fund=classification.fundId?{fundId:classification.fundId}:{};
  const journal=entry(s,{sourceKind:'payable_recognition',sourceId:payableId,entryDate:recognitionDate,description:p.description,material,
    lines:[{lineKey:'expense',ledgerAccountId:mapping.ledgerAccountId,debitCents:p.amountCents,creditCents:0,categoryId:classification.categoryId,...fund},
      {lineKey:'payable',ledgerAccountId:s.policy.liabilityLedgerAccountId,debitCents:0,creditCents:p.amountCents,...fund}],
    fundEffects:classification.fundId?[{fundId:classification.fundId,effect:'decrease',amountCents:p.amountCents}]:[]});
  const next:RecognizedPayable={...p,...classification,schemaVersion:2,postingPerformed:true,recognitionEntryId:journal.id,recognitionDate,liabilityLedgerAccountId:s.policy.liabilityLedgerAccountId,bookSettings:{firstPeriod:s.configuration.firstPeriod,timeZone:s.configuration.timeZone},principalPaidCents:0,discountCents:0,feesPaidCents:0,version:sum(p.version,1)};
  assertRecognized(next,s);
  return {payable:next,journal};
}

/** Only a committed journal may apply the returned payable state. principal
 * plus discount reduces the obligation; fees only increase cash outflow. */
export function settlePayable(s:Scope,payableId:string,p:RecognizedPayable,paymentId:string,input:PayablePaymentInput) {
  assertRecognized(p,s);const refs=payablePolicyReferences(s);
  if(p.liabilityLedgerAccountId!==s.policy.liabilityLedgerAccountId)ledgerFailure('PAYABLE_LIABILITY_MAPPING_CHANGED');
  if(!ledgerId(payableId)||!ledgerId(paymentId)||!ledgerId(input.accountId)||typeof input.reference!=='string'||input.reference.trim().length<3||input.reference.length>180)ledgerFailure('PAYABLE_PAYMENT_INVALID');
  for(const v of [input.principalCents,input.feesCents,input.discountCents])cents(v);
  const applied=sum(input.principalCents,input.discountCents),cashOut=sum(input.principalCents,input.feesCents);
  if(applied<=0||applied>p.remainingCents||p.status==='settled')ledgerFailure('PAYABLE_PAYMENT_EXCEEDS_REMAINING');
  const paidOn=dateInBook(input.paidOn,s);
  if(paidOn<p.recognitionDate)ledgerFailure('PAYABLE_SETTLEMENT_DATE_INVALID');
  const bank=s.configuration.financeAccounts.find(a=>a.accountId===input.accountId&&a.type==='asset');
  if(!bank)ledgerFailure('PAYABLE_PAYMENT_ACCOUNT_REQUIRED');
  if(input.feesCents&&!refs.fees||input.discountCents&&!refs.discount)ledgerFailure('PAYABLE_CATEGORY_MAPPING_REQUIRED');
  const fund=p.fundId?{fundId:p.fundId}:{};
  const lines:PostingPlanLine[]=[{lineKey:'payable',ledgerAccountId:s.policy.liabilityLedgerAccountId,debitCents:applied,creditCents:0,...fund},
    {lineKey:'bank',ledgerAccountId:bank.ledgerAccountId,debitCents:0,creditCents:cashOut,financeAccountId:input.accountId}];
  if(input.feesCents)lines.push({lineKey:'fees',ledgerAccountId:refs.fees!.ledgerAccountId,debitCents:input.feesCents,creditCents:0,categoryId:s.policy.feesCategoryId,...fund});
  if(input.discountCents)lines.push({lineKey:'discount',ledgerAccountId:refs.discount!.ledgerAccountId,debitCents:0,creditCents:input.discountCents,categoryId:s.policy.discountCategoryId,...fund});
  const journal=entry(s,{sourceKind:'payable_payment',sourceId:paymentId,entryDate:paidOn,description:p.description,
    material:{payableId,paymentId,payableVersion:p.version,recognitionEntryId:p.recognitionEntryId,input,policy:s.policy,referenceFingerprintHash:refs.referenceFingerprintHash},lines,
    accountEffects:cashOut?[{financeAccountId:input.accountId,effect:'decrease',amountCents:cashOut,reason:'liability_settled'}]:[],
    fundEffects:p.fundId?[...(input.feesCents?[{fundId:p.fundId,effect:'decrease' as const,amountCents:input.feesCents}]:[]),...(input.discountCents?[{fundId:p.fundId,effect:'increase' as const,amountCents:input.discountCents}]:[])]:[]});
  const remaining=sum(p.remainingCents,-applied),paid=sum(p.paidCents,applied);
  const next:RecognizedPayable={...p,paidCents:paid,remainingCents:remaining,principalPaidCents:sum(p.principalPaidCents,input.principalCents),discountCents:sum(p.discountCents,input.discountCents),feesPaidCents:sum(p.feesPaidCents,input.feesCents),status:remaining===0?'settled':'partially_paid',version:sum(p.version,1)};
  assertRecognized(next,s);
  const receipt:PayablePaymentReceipt={...input,paidOn,reference:input.reference.trim(),id:paymentId,payableId,organizationId:s.organizationId,financeEntityId:s.financeEntityId,appliedCents:applied,cashOutCents:cashOut,journalEntryId:journal.id,payableVersionBefore:p.version,payableVersionAfter:next.version,sourceHash:journal.sourceHash};
  return {payable:next,journal,receipt};
}

export function reversePayablePayment(s:ReversalScope,payableId:string,p:RecognizedPayable,receipt:PayablePaymentReceipt,original:CertifiedBookEntry,reversalDate:string,reason:string) {
  assertRecognized(p,s);assertBookScope(receipt,s.organizationId,s.financeEntityId);assertBookEntry(original,s.organizationId,s.financeEntityId);
  if(receipt.payableId!==payableId||original.sourceKind!=='payable_payment'||original.sourceTransactionId!==receipt.id||original.id!==receipt.journalEntryId||original.sourceHash!==receipt.sourceHash)ledgerFailure('PAYABLE_PAYMENT_RECEIPT_INVALID');
  for(const value of [receipt.principalCents,receipt.feesCents,receipt.discountCents,receipt.appliedCents])cents(value);
  if(!Number.isSafeInteger(receipt.cashOutCents)||receipt.cashOutCents<0)ledgerFailure('PAYABLE_PAYMENT_RECEIPT_INVALID');
  const line=(key:string)=>original.plan.journalEntry.lines.find(l=>l.lineKey===key);
  if(sum(receipt.principalCents,receipt.discountCents)!==receipt.appliedCents||sum(receipt.principalCents,receipt.feesCents)!==receipt.cashOutCents||
    line('payable')?.debitCents!==receipt.appliedCents||line('payable')?.ledgerAccountId!==p.liabilityLedgerAccountId||
    (line('bank')?.creditCents??0)!==receipt.cashOutCents||(line('fees')?.debitCents??0)!==receipt.feesCents||
    (line('discount')?.creditCents??0)!==receipt.discountCents||original.effectiveDate!==receipt.paidOn||
    (receipt.cashOutCents>0&&(original.plan.accountEffects.length!==1||original.plan.accountEffects[0].financeAccountId!==receipt.accountId||original.plan.accountEffects[0].amountCents!==receipt.cashOutCents||original.plan.accountEffects[0].effect!=='decrease')))
    ledgerFailure('PAYABLE_PAYMENT_RECEIPT_INVALID');
  const payable:RecognizedPayable={...p,paidCents:sum(p.paidCents,-receipt.appliedCents),remainingCents:sum(p.remainingCents,receipt.appliedCents),principalPaidCents:sum(p.principalPaidCents,-receipt.principalCents),discountCents:sum(p.discountCents,-receipt.discountCents),feesPaidCents:sum(p.feesPaidCents,-receipt.feesCents),version:sum(p.version,1),status:'open'};
  payable.status=payable.remainingCents===0?'settled':payable.paidCents>0?'partially_paid':'open';
  assertRecognized(payable,s);
  const journal=certifyReversal(original,{actor:s.actor,postedAt:s.postedAt,effectiveDate:dateInBook(reversalDate,s),reason});
  return {payable,journal};
}
