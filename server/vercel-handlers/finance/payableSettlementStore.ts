import { assertFinanceCatalogScope } from './financeCatalogScope.js';
import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { assertBookScope, bookId, type CertifiedBookEntry } from '../../../shared/finance/ledger/certifiedPosting.js';
import { ledgerFailure, ledgerId } from '../../../shared/finance/ledger/certifiedConfiguration.js';
import { recognizePayable, settlePayable, reversePayablePayment, type PayableAccountingPolicy, type PayablePaymentInput, type PayablePaymentReceipt, type RecognizedPayable } from '../../../shared/finance/payableSettlement.js';
import type { PayableRecord } from '../../../shared/finance/payableObligation.js';
import { loadCertifiedLedgerConfiguration } from './certifiedLedgerConfiguration.js';
import { assertLedgerPeriodOpen, readAccountEffects, readFundEffects, readLedgerState, writeEntry, type LedgerCommandContext } from './certifiedLedgerStore.js';
import { assertTransactionEvidenceReferences } from './transactionEvidenceValidation.js';

export const payablePolicyKey=(entity:string)=>'payable_accounting_policy_'+bookId(entity);
async function load(t:Transaction,c:LedgerCommandContext,payableId:string,expectedVersion:number) {
  if(!/^pay_[a-f0-9]{32}$/.test(payableId)||!Number.isSafeInteger(expectedVersion)||expectedVersion<1)ledgerFailure('PAYABLE_COMMAND_INVALID');
  const org=c.db.collection('organizations').doc(c.organizationId),entity=org.collection('financeEntities').doc(c.financeEntityId);
  const entitySnap=await t.get(entity);
  if(!entitySnap.exists||entitySnap.data()?.organizationId!==c.organizationId||entitySnap.data()?.active!==true)ledgerFailure('FINANCE_ENTITY_NOT_ACTIVE');
  const ref=entity.collection('financePayables').doc(payableId),snapshot=await t.get(ref);
  if(!snapshot.exists)ledgerFailure('PAYABLE_NOT_FOUND');
  const payable=snapshot.data()!;
  assertBookScope(payable,c.organizationId,c.financeEntityId);
  if(payable.version!==expectedVersion)ledgerFailure('PAYABLE_VERSION_CONFLICT');
  if(entitySnap.data()?.reviewPolicy?.requireDistinctApprover===true&&(!payable.createdByUid||payable.createdByUid===c.uid))ledgerFailure('PAYABLE_DISTINCT_APPROVER_REQUIRED');
  const config=await loadCertifiedLedgerConfiguration(c.db,c.organizationId,c.financeEntityId,t);
  const policySnap=await t.get(org.collection('financeSettings').doc(payablePolicyKey(c.financeEntityId)));
  if(!policySnap.exists)ledgerFailure('PAYABLE_ACCOUNTING_NOT_CONFIGURED');
  assertBookScope(policySnap.data(),c.organizationId,c.financeEntityId);
  const policy=policySnap.data()!.policy as PayableAccountingPolicy;
  const state=await readLedgerState(t,c);
  if(payable.fundId){
    if(!ledgerId(payable.fundId))ledgerFailure('LEDGER_FUND_UNAVAILABLE');
    const fund=await t.get(org.collection('financeFunds').doc(payable.fundId));
    if(!fund.exists||fund.data()?.active!==true)ledgerFailure('LEDGER_FUND_UNAVAILABLE');
    assertFinanceCatalogScope(fund,c.organizationId,c.financeEntityId,'financeFunds');
  }
  return {org,entity,ref,payable,configuration:config.configuration,policy,state,scope:{configuration:config.configuration,policy,organizationId:c.organizationId,financeEntityId:c.financeEntityId,actor:c.uid,postedAt:new Date().toISOString()}};
}
async function prepare(t:Transaction,c:LedgerCommandContext,entry:CertifiedBookEntry,state:Awaited<ReturnType<typeof readLedgerState>>) {
  assertLedgerPeriodOpen(state.value,entry.effectiveDate);
  const ref=c.db.collection('organizations').doc(c.organizationId).collection('financeJournalEntries').doc(entry.id);
  if((await t.get(ref)).exists)ledgerFailure('PAYABLE_JOURNAL_ALREADY_EXISTS');
  const accounts=await readAccountEffects(t,c,entry),funds=await readFundEffects(t,c,entry);
  let cashDay:{ref:FirebaseFirestore.DocumentReference;value:Record<string,unknown>}|null=null;
  if(entry.sourceKind==='payable_payment'){
    const dayRef=c.db.collection('organizations').doc(c.organizationId).collection('financeAggregates').doc('payable_cash_day_'+bookId(c.financeEntityId,entry.effectiveDate));
    const previous=await t.get(dayRef),data=previous.data();if(data)assertBookScope(data,c.organizationId,c.financeEntityId);
    const out=entry.plan.accountEffects.filter(e=>e.effect==='decrease').reduce((s,e)=>s+e.amountCents,0),correction=entry.plan.accountEffects.filter(e=>e.effect==='increase').reduce((s,e)=>s+e.amountCents,0);
    const paymentOutCents=(data?.paymentOutCents??0)+out,correctionInCents=(data?.correctionInCents??0)+correction;
    if(!Number.isSafeInteger(paymentOutCents)||paymentOutCents<0||!Number.isSafeInteger(correctionInCents)||correctionInCents<0)ledgerFailure('LEDGER_AMOUNT_OVERFLOW');
    cashDay={ref:dayRef,value:{organizationId:c.organizationId,financeEntityId:c.financeEntityId,date:entry.effectiveDate,paymentOutCents,correctionInCents,updatedAt:FieldValue.serverTimestamp()}};
  }
  return {accounts,funds,cashDay};
}
export async function stagePayableRecognition(t:Transaction,c:LedgerCommandContext,payableId:string,expectedVersion:number,classification:{categoryId:string;fundId?:string;recognitionDate:string}) {
  const loaded=await load(t,c,payableId,expectedVersion);
  if(classification.fundId){
    if(!ledgerId(classification.fundId))ledgerFailure('LEDGER_FUND_UNAVAILABLE');
    const fund=await t.get(loaded.org.collection('financeFunds').doc(classification.fundId));
    if(!fund.exists||fund.data()?.active!==true)ledgerFailure('LEDGER_FUND_UNAVAILABLE');
    assertFinanceCatalogScope(fund,c.organizationId,c.financeEntityId,'financeFunds');
  }
  const result=recognizePayable(loaded.scope,payableId,loaded.payable as PayableRecord,classification);
  const effects=await prepare(t,c,result.journal,loaded.state);
  writeEntry(t,c,result.journal,loaded.state,effects.accounts,effects.funds,{payableId,versionBefore:expectedVersion,versionAfter:result.payable.version});
  t.set(loaded.ref,{...result.payable,updatedAt:FieldValue.serverTimestamp(),recognizedByUid:c.uid,recognizedAt:FieldValue.serverTimestamp()});
  return {payableId,status:result.payable.status,version:result.payable.version,journalEntryId:result.journal.id,remainingCents:result.payable.remainingCents};
}
export async function stagePayablePayment(t:Transaction,c:LedgerCommandContext,payableId:string,expectedVersion:number,paymentId:string,input:PayablePaymentInput) {
  if(!ledgerId(paymentId))ledgerFailure('PAYABLE_COMMAND_INVALID');
  const loaded=await load(t,c,payableId,expectedVersion);
  const receiptRef=loaded.ref.collection('paymentReceipts').doc(paymentId);
  if((await t.get(receiptRef)).exists)ledgerFailure('PAYABLE_PAYMENT_ALREADY_EXISTS');
  if(!Array.isArray(input.evidenceIds)||input.evidenceIds.length===0){
    if(typeof input.evidenceJustification!=='string'||input.evidenceJustification.trim().length<10||input.evidenceJustification.length>500)ledgerFailure('PAYABLE_PAYMENT_EVIDENCE_REQUIRED');
  }
  await assertTransactionEvidenceReferences({transaction:t,evidenceIds:input.evidenceIds,organizationId:c.organizationId,financeEntityId:c.financeEntityId,entityRef:loaded.entity});
  const result=settlePayable(loaded.scope,payableId,loaded.payable as RecognizedPayable,paymentId,input);
  const effects=await prepare(t,c,result.journal,loaded.state);
  writeEntry(t,c,result.journal,loaded.state,effects.accounts,effects.funds,{payableId,paymentId,versionBefore:expectedVersion,versionAfter:result.payable.version});
  if(effects.cashDay)t.set(effects.cashDay.ref,effects.cashDay.value);
  t.create(receiptRef,{...result.receipt,createdByUid:c.uid,createdAt:FieldValue.serverTimestamp()});
  t.set(loaded.ref,{...result.payable,updatedAt:FieldValue.serverTimestamp()});
  return {payableId,paymentId,status:result.payable.status,version:result.payable.version,journalEntryId:result.journal.id,remainingCents:result.payable.remainingCents,appliedCents:result.receipt.appliedCents,cashOutCents:result.receipt.cashOutCents};
}
export async function stagePayablePaymentReversal(t:Transaction,c:LedgerCommandContext,payableId:string,expectedVersion:number,paymentId:string,reversalDate:string,reason:string) {
  if(!ledgerId(paymentId)||!/^pay_[a-f0-9]{32}$/.test(payableId)||!Number.isSafeInteger(expectedVersion)||expectedVersion<1)ledgerFailure('PAYABLE_COMMAND_INVALID');
  const org=c.db.collection('organizations').doc(c.organizationId),entity=org.collection('financeEntities').doc(c.financeEntityId);
  const entitySnap=await t.get(entity);if(!entitySnap.exists||entitySnap.data()?.organizationId!==c.organizationId||entitySnap.data()?.active!==true)ledgerFailure('FINANCE_ENTITY_NOT_ACTIVE');
  const ref=entity.collection('financePayables').doc(payableId),payableSnap=await t.get(ref);
  if(!payableSnap.exists)ledgerFailure('PAYABLE_NOT_FOUND');
  const payable=payableSnap.data() as RecognizedPayable;assertBookScope(payable,c.organizationId,c.financeEntityId);
  if(payable.version!==expectedVersion)ledgerFailure('PAYABLE_VERSION_CONFLICT');
  const state=await readLedgerState(t,c);
  // Historical reversal uses the immutable journal plus recognition-time book
  // settings. Archiving today's account/category or changing policy cannot
  // silently remap, resize or prevent correcting an old payment.
  const scope={organizationId:c.organizationId,financeEntityId:c.financeEntityId,actor:c.uid,postedAt:new Date().toISOString(),configuration:payable.bookSettings};
  const receiptSnap=await t.get(ref.collection('paymentReceipts').doc(paymentId));
  if(!receiptSnap.exists)ledgerFailure('PAYABLE_PAYMENT_NOT_FOUND');
  const receipt=receiptSnap.data() as PayablePaymentReceipt;
  if(receipt.id!==paymentId||!ledgerId(receipt.journalEntryId))ledgerFailure('PAYABLE_PAYMENT_RECEIPT_INVALID');
  const reversalRef=ref.collection('paymentReversals').doc(paymentId);
  if((await t.get(reversalRef)).exists)ledgerFailure('PAYABLE_PAYMENT_ALREADY_REVERSED');
  const entry=await t.get(org.collection('financeJournalEntries').doc(receipt.journalEntryId));
  if(!entry.exists)ledgerFailure('LEDGER_ORIGINAL_ENTRY_MISSING');
  const result=reversePayablePayment(scope,payableId,payable,receipt,entry.data() as CertifiedBookEntry,reversalDate,reason);
  const effects=await prepare(t,c,result.journal,state);
  writeEntry(t,c,result.journal,state,effects.accounts,effects.funds,{payableId,paymentId,reason:reason.trim(),originalJournalEntryId:receipt.journalEntryId,versionBefore:expectedVersion,versionAfter:result.payable.version});
  if(effects.cashDay)t.set(effects.cashDay.ref,effects.cashDay.value);
  t.create(reversalRef,{organizationId:c.organizationId,financeEntityId:c.financeEntityId,paymentId,journalEntryId:result.journal.id,reason:reason.trim(),createdByUid:c.uid,createdAt:FieldValue.serverTimestamp()});
  t.set(ref,{...result.payable,updatedAt:FieldValue.serverTimestamp()});
  return {payableId,paymentId,status:result.payable.status,version:result.payable.version,journalEntryId:result.journal.id,remainingCents:result.payable.remainingCents};
}
