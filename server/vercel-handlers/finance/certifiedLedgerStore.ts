import { FieldValue, Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';
import type { FinanceAllocation } from '../../../shared/finance/ledger/allocation.js';
import { ledgerFailure, ledgerId } from '../../../shared/finance/ledger/certifiedConfiguration.js';
import { assertBookEntry, assertBookScope, bookId, certifyApprovedPosting, certifyOpening, certifyReversal, type CertifiedBookEntry } from '../../../shared/finance/ledger/certifiedPosting.js';
import { canonicalStringify } from '../../../shared/finance/ledger/postingPlan.js';
import { createHash } from 'node:crypto';
import { parseOpeningBalanceDeclaration } from '../../../shared/finance/openingBalanceDeclaration.js';
import { buildTransactionListQueryKeys } from '../../../shared/finance/ledger/listQueryKeys.js';
import type { LedgerTransaction } from '../../../shared/finance/ledger/transaction.js';
import { loadCertifiedLedgerConfiguration } from './certifiedLedgerConfiguration.js';
import { stageCanonicalAuditCreate } from './auditFactProjection.js';
import { stageFinanceFact } from './factStream.js';
import { assertTransactionEvidenceReferences } from './transactionEvidenceValidation.js';
import { computeApprovalSourceHash } from '../../../shared/finance/ledger/approvalSourceHash.js';
import { transactionCorrectionSnapshot } from '../../../shared/finance/transactionCorrection.js';
import { readCertifiedCountClaim, stageCertifiedCountClaim, readCertifiedCountReversalClaim } from './certifiedCountSource.js';

export type LedgerCommandContext = {db:Firestore;organizationId:string;financeEntityId:string;uid:string;requestId:string;actorLabel?:string};
export function ledgerStateRef(db:Firestore, org:string, entity:string) {
  return db.collection('organizations').doc(org).collection('financeSettings').doc('ledger_state_'+bookId(entity));
}
export function ledgerPeriodRef(db:Firestore,org:string,entity:string,period:string) {
  return db.collection('organizations').doc(org).collection('financeSettings').doc('ledger_period_'+bookId(entity,period));
}
export async function readLedgerState(t:Transaction,c:LedgerCommandContext) {
  const ref=ledgerStateRef(c.db,c.organizationId,c.financeEntityId);
  const snap=await t.get(ref);
  const value=snap.exists?snap.data()!:{organizationId:c.organizationId,financeEntityId:c.financeEntityId,revision:0,entryCount:0,closedThrough:null};
  assertBookScope(value,c.organizationId,c.financeEntityId);
  if (!Number.isSafeInteger(value.revision)||value.revision<0||!Number.isSafeInteger(value.entryCount)||value.entryCount<0||
      value.closedThrough!==null&&!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value.closedThrough)) ledgerFailure('LEDGER_STATE_INVALID');
  return {ref,value};
}
export function assertLedgerPeriodOpen(state:Record<string,any>,effectiveDate:string) {
  if (state.closedThrough && effectiveDate.slice(0,7)<=state.closedThrough) ledgerFailure('LEDGER_PERIOD_CLOSED');
}
function plus(a:number,b:number) {
  const result=a+b;
  if (!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||!Number.isSafeInteger(result)) ledgerFailure('LEDGER_AMOUNT_OVERFLOW');
  return result;
}

/** All reads (source, chart, references, state, balances) precede every write.
 * A single shared revision serializes posting, reversal and future period close.
 * Firestore retry semantics prevent partial journals and duplicate effects. */
export async function stageCertifiedPosting(t:Transaction,c:LedgerCommandContext,transactionId:string,expectedVersion:number) {
  if (!ledgerId(transactionId)||!Number.isSafeInteger(expectedVersion)||expectedVersion<1) ledgerFailure('LEDGER_COMMAND_INVALID');
  const org=c.db.collection('organizations').doc(c.organizationId);
  const txRef=org.collection('financeTransactions').doc(transactionId);
  const txSnap=await t.get(txRef);
  if(!txSnap.exists) ledgerFailure('LEDGER_TRANSACTION_NOT_FOUND');
  const tx={...txSnap.data(),id:txSnap.id} as LedgerTransaction;
  assertBookScope(tx,c.organizationId,c.financeEntityId);
  if(tx.version!==expectedVersion) ledgerFailure('LEDGER_VERSION_CONFLICT');
  const approval=await t.get(txRef.collection('approvals').doc('latest'));
  const allocs=await t.get(org.collection('financeAllocations').where('transactionId','==',transactionId).limit(101));
  const allocations=allocs.docs.map(d=>({...d.data(),id:d.id}) as FinanceAllocation);
  const configuration=await loadCertifiedLedgerConfiguration(c.db,c.organizationId,c.financeEntityId,t);
  await assertTransactionEvidenceReferences({transaction:t,evidenceIds:tx.evidenceIds,organizationId:c.organizationId,financeEntityId:c.financeEntityId,
    entityRef:org.collection('financeEntities').doc(c.financeEntityId)});
  const state=await readLedgerState(t,c);
  const countClaim=await readCertifiedCountClaim(t,c,tx,configuration.configuration.timeZone);
  const entry=certifyApprovedPosting({transaction:tx,allocations,approval:approval.data(),configuration:configuration.configuration,
    organizationId:c.organizationId,financeEntityId:c.financeEntityId,actor:c.uid,postedAt:new Date().toISOString(),countSourceProofHash:countClaim?.proofHash});
  assertLedgerPeriodOpen(state.value,entry.effectiveDate);
  const entryRef=org.collection('financeJournalEntries').doc(entry.id);
  if((await t.get(entryRef)).exists) ledgerFailure('LEDGER_ALREADY_POSTED');
  for(const fundId of new Set(allocations.map(a=>a.fundId).filter(Boolean))) {
    if(!ledgerId(fundId))ledgerFailure('LEDGER_FUND_UNAVAILABLE');
    const f=await t.get(org.collection('financeFunds').doc(fundId));
    if(!f.exists||f.data()?.active!==true)ledgerFailure('LEDGER_FUND_UNAVAILABLE');
    assertBookScope(f.data(),c.organizationId,c.financeEntityId);
  }
  const effects=await readAccountEffects(t,c,entry);
  const fundEffects=await readFundEffects(t,c,entry);
  writeEntry(t,c,entry,state,effects,fundEffects,{versionBefore:expectedVersion,versionAfter:expectedVersion+1,...(countClaim?{countSourceProofHash:countClaim.proofHash}:{})});
  if(countClaim)stageCertifiedCountClaim(t,c,countClaim,tx,entry.id,c.uid);
  t.update(txRef,{status:'posted',version:expectedVersion+1,journalEntryId:entry.id,effectiveJournalDate:entry.effectiveDate,
    postedBy:c.uid,postedAt:FieldValue.serverTimestamp(),updatedBy:c.uid,updatedAt:FieldValue.serverTimestamp(),
    listQueryKeys:buildTransactionListQueryKeys(c.financeEntityId,transactionId,tx.transactionKind,'posted',tx.occurredAt)});
  stageFinanceFact(t,c.db,{organizationId:c.organizationId,eventType:'TRANSACTION_POSTED',entityType:'finance_transaction',entityId:transactionId,
    actorUserId:c.uid,correlationId:'ledger_post_'+bookId(entry.id),payload:{financeEntityId:c.financeEntityId,status:'posted',version:expectedVersion+1,postingExecuted:true},
    sourceRefs:[{kind:'record',ref:txRef.path,version:expectedVersion+1},{kind:'record',ref:entryRef.path}]});
  return {transactionId,journalEntryId:entry.id,status:'posted',version:expectedVersion+1,effectiveDate:entry.effectiveDate};
}

export async function stageCertifiedReversal(t:Transaction,c:LedgerCommandContext,transactionId:string,expectedVersion:number,reversalDate:string,reason:string) {
  if(!ledgerId(transactionId)||!Number.isSafeInteger(expectedVersion)||expectedVersion<1)ledgerFailure('LEDGER_COMMAND_INVALID');
  const org=c.db.collection('organizations').doc(c.organizationId);
  const txRef=org.collection('financeTransactions').doc(transactionId);
  const txSnap=await t.get(txRef);
  if(!txSnap.exists)ledgerFailure('LEDGER_TRANSACTION_NOT_FOUND');
  const tx={...txSnap.data(),id:txSnap.id} as LedgerTransaction;
  assertBookScope(tx,c.organizationId,c.financeEntityId);
  if(tx.version!==expectedVersion)ledgerFailure('LEDGER_VERSION_CONFLICT');
  if(tx.status!=='posted'||!ledgerId(tx.journalEntryId)||tx.reconciliationStatus!=='unreconciled') ledgerFailure('LEDGER_REVERSAL_STATE_INVALID');
  if((tx as any).payableSource||(tx as any).reimbursement)ledgerFailure('LEDGER_LINKED_OBLIGATION_NOT_SUPPORTED');
  const source=await t.get(org.collection('financeJournalEntries').doc(tx.journalEntryId));
  if(!source.exists)ledgerFailure('LEDGER_ORIGINAL_ENTRY_MISSING');
  const original=source.data() as CertifiedBookEntry;
  assertBookEntry(original,c.organizationId,c.financeEntityId);
  if(original.sourceKind!=='transaction'||original.sourceTransactionId!==transactionId||original.id!==tx.journalEntryId)ledgerFailure('LEDGER_SOURCE_INVALID');
  const state=await readLedgerState(t,c);
  const entry=certifyReversal(original,{actor:c.uid,postedAt:new Date().toISOString(),effectiveDate:reversalDate,reason});
  assertLedgerPeriodOpen(state.value,entry.effectiveDate);
  if((await t.get(org.collection('financeJournalEntries').doc(entry.id))).exists)ledgerFailure('LEDGER_ALREADY_REVERSED');
  const allocationsSnapshot=await t.get(org.collection('financeAllocations').where('transactionId','==',transactionId).limit(101));
  if(allocationsSnapshot.size>100)ledgerFailure('LEDGER_ALLOCATION_INVALID');
  const allocations=allocationsSnapshot.docs.map(doc=>({...doc.data(),id:doc.id}) as FinanceAllocation);
  for(const allocation of allocations)assertBookScope(allocation,c.organizationId,c.financeEntityId);
  if(computeApprovalSourceHash(tx,allocations,3)!==original.sourceHash)ledgerFailure('LEDGER_REVERSAL_SOURCE_CHANGED');
  const effects=await readAccountEffects(t,c,entry);
  const fundEffects=await readFundEffects(t,c,entry);
  const countClaim=await readCertifiedCountReversalClaim(t,c,tx);
  const finalRecord={...tx,status:'reversed',version:expectedVersion+1,reversedBy:c.uid,
    reversalJournalEntryId:entry.id,reversalEffectiveDate:entry.effectiveDate,reversalReason:reason.trim()};
  writeEntry(t,c,entry,state,effects,fundEffects,{reason:reason.trim(),originalJournalEntryId:original.id,
    versionBefore:expectedVersion,versionAfter:expectedVersion+1,before:{transaction:tx,allocations},after:{transaction:finalRecord,allocations}});
  const auditId='audit_'+bookId(entry.id);
  t.create(txRef.collection('corrections').doc(auditId),{id:auditId,organizationId:c.organizationId,financeEntityId:c.financeEntityId,
    transactionId,actorUid:c.uid,actorLabel:c.actorLabel||c.uid,changedAt:Timestamp.now(),reason:reason.trim(),
    versionBefore:expectedVersion,versionAfter:expectedVersion+1,kind:'reversal',originalJournalEntryId:original.id,reversalJournalEntryId:entry.id,
    before:transactionCorrectionSnapshot(tx,allocations),after:transactionCorrectionSnapshot(finalRecord,allocations)});
  if(countClaim)t.update(countClaim,{state:'reversed',reversalJournalEntryId:entry.id,reversedBy:c.uid,reversedAt:FieldValue.serverTimestamp()});
  t.update(txRef,{status:'reversed',version:expectedVersion+1,reversedBy:c.uid,reversedAt:FieldValue.serverTimestamp(),
    reversalJournalEntryId:entry.id,reversalEffectiveDate:entry.effectiveDate,reversalReason:reason.trim(),updatedBy:c.uid,updatedAt:FieldValue.serverTimestamp(),
    listQueryKeys:buildTransactionListQueryKeys(c.financeEntityId,transactionId,tx.transactionKind,'reversed',tx.occurredAt)});
  stageFinanceFact(t,c.db,{organizationId:c.organizationId,eventType:'TRANSACTION_REVERSED',entityType:'finance_transaction',entityId:transactionId,
    actorUserId:c.uid,correlationId:'ledger_reverse_'+bookId(entry.id),payload:{financeEntityId:c.financeEntityId,status:'reversed',version:expectedVersion+1,effectiveDate:entry.effectiveDate},
    sourceRefs:[{kind:'record',ref:txRef.path,version:expectedVersion+1},{kind:'record',ref:org.collection('financeJournalEntries').doc(entry.id).path}]});
  return {transactionId,journalEntryId:entry.id,originalJournalEntryId:original.id,status:'reversed',version:expectedVersion+1,effectiveDate:entry.effectiveDate};
}

export async function stageCertifiedOpening(t:Transaction,c:LedgerCommandContext,accountId:string,expectedOpeningRevision:number,reason:string) {
  if(!ledgerId(accountId)||!Number.isSafeInteger(expectedOpeningRevision)||expectedOpeningRevision<1||typeof reason!=='string'||reason.trim().length<10||reason.length>1000)ledgerFailure('LEDGER_OPENING_INVALID');
  const org=c.db.collection('organizations').doc(c.organizationId);
  const accountRef=org.collection('financeAccounts').doc(accountId),accountSnap=await t.get(accountRef);
  if(!accountSnap.exists)ledgerFailure('LEDGER_FINANCE_ACCOUNT_UNAVAILABLE');
  const account=accountSnap.data()!;
  assertBookScope(account,c.organizationId,c.financeEntityId);
  if(account.openingBalanceRevision!==expectedOpeningRevision||account.openingBalanceDeclaration?.status!=='pending_review')ledgerFailure('LEDGER_OPENING_DECLARATION_CHANGED');
  const declaration=parseOpeningBalanceDeclaration({...account.openingBalanceDeclaration,status:'declared'});
  if(declaration.status!=='pending_review')ledgerFailure('LEDGER_OPENING_INVALID');
  const declarationHash='sha256:'+createHash('sha256').update(canonicalStringify(declaration)).digest('hex');
  const loaded=await loadCertifiedLedgerConfiguration(c.db,c.organizationId,c.financeEntityId,t);
  const state=await readLedgerState(t,c);
  assertLedgerPeriodOpen(state.value,declaration.asOf);
  const receiptRef=org.collection('financeSettings').doc('ledger_opening_'+bookId(c.financeEntityId,accountId));
  const aggregateRef=org.collection('financeAggregates').doc('ledger_account_'+bookId(c.financeEntityId,accountId));
  if((await t.get(receiptRef)).exists||(await t.get(aggregateRef)).exists)ledgerFailure('LEDGER_OPENING_ALREADY_CERTIFIED');
  const entry=certifyOpening({configuration:loaded.configuration,organizationId:c.organizationId,financeEntityId:c.financeEntityId,accountId,
    amountCents:declaration.amountCents,asOf:declaration.asOf,actor:c.uid,postedAt:new Date().toISOString(),declarationHash});
  if(entry&&(await t.get(org.collection('financeJournalEntries').doc(entry.id))).exists)ledgerFailure('LEDGER_OPENING_ALREADY_CERTIFIED');
  t.create(receiptRef,{organizationId:c.organizationId,financeEntityId:c.financeEntityId,accountId,declaration,declarationHash,
    openingRevision:expectedOpeningRevision,journalEntryId:entry?.id??null,verifiedBy:c.uid,reason:reason.trim(),verifiedAt:FieldValue.serverTimestamp()});
  t.create(aggregateRef,{organizationId:c.organizationId,financeEntityId:c.financeEntityId,accountId,openingVerified:true,
    openingCents:declaration.amountCents,openingAsOf:declaration.asOf,openingReceiptId:receiptRef.id,
    openingJournalEntryId:entry?.id??null,balanceCents:declaration.amountCents,revision:1,updatedAt:FieldValue.serverTimestamp()});
  // This is the sole explicit certification step. Editing a pending declaration
  // later must never rewrite this verified opening or its immutable journal.
  t.update(accountRef,{openingBalanceCents:declaration.amountCents,certifiedOpeningReceiptId:receiptRef.id});
  if(entry)writeEntry(t,c,entry,state,[],[],{openingReceiptId:receiptRef.id,reason:reason.trim(),declarationHash});
  else {
    t.set(state.ref,{...state.value,revision:plus(state.value.revision,1),updatedAt:FieldValue.serverTimestamp()});
    const auditRef=org.collection('financeAuditLogs').doc('audit_'+bookId(receiptRef.id));
    stageCanonicalAuditCreate(t,c.db,auditRef,{eventId:auditRef.id,organizationId:c.organizationId,financeEntityId:c.financeEntityId,
      actor:c.uid,resource:'finance_account',resourceId:accountId,action:'ledger.opening.certified_zero',requestId:c.requestId,
      details:{openingReceiptId:receiptRef.id,reason:reason.trim(),declarationHash},createdAt:FieldValue.serverTimestamp()});
  }
  return {accountId,openingReceiptId:receiptRef.id,journalEntryId:entry?.id??null,openingCertified:true};
}

export async function readFundEffects(t:Transaction,c:LedgerCommandContext,entry:CertifiedBookEntry) {
  const deltas=new Map<string,number>();
  for(const e of entry.plan.fundEffects) {
    if(!ledgerId(e.fundId)||!Number.isSafeInteger(e.amountCents)||e.amountCents<0)ledgerFailure('LEDGER_EFFECT_INVALID');
    const delta=e.effect==='none'?0:['increase','transfer_in'].includes(e.effect)?e.amountCents:-e.amountCents;
    deltas.set(e.fundId,plus(deltas.get(e.fundId)??0,delta));
  }
  const result=[];
  for(const [fundId,delta] of deltas) {
    const ref=c.db.collection('organizations').doc(c.organizationId).collection('financeAggregates').doc('ledger_fund_movement_'+bookId(c.financeEntityId,fundId));
    const snap=await t.get(ref),previous=snap.data();
    if(previous)assertBookScope(previous,c.organizationId,c.financeEntityId);
    if(previous&&previous.fundId!==fundId)ledgerFailure('LEDGER_EFFECT_INVALID');
    // This is explicitly a movement projection, never an invented opening or
    // total fund balance. The journal retains the original fund dimensions.
    result.push({ref,fundId,postedNetMovementCents:plus(previous?.postedNetMovementCents??0,delta),revision:plus(previous?.revision??0,1)});
  }
  return result;
}

export async function readAccountEffects(t:Transaction,c:LedgerCommandContext,entry:CertifiedBookEntry) {
  const deltas=new Map<string,number>();
  for(const effect of entry.plan.accountEffects) {
    if(!ledgerId(effect.financeAccountId)||!Number.isSafeInteger(effect.amountCents)||effect.amountCents<=0)ledgerFailure('LEDGER_EFFECT_INVALID');
    const delta=effect.effect==='increase'?effect.amountCents:-effect.amountCents;
    deltas.set(effect.financeAccountId,plus(deltas.get(effect.financeAccountId)??0,delta));
  }
  const result=[];
  for(const [accountId,delta] of deltas) {
    const ref=c.db.collection('organizations').doc(c.organizationId).collection('financeAggregates').doc('ledger_account_'+bookId(c.financeEntityId,accountId));
    const snap=await t.get(ref), value=snap.data();
    // An absent/unknown opening is not a zero balance. A separate explicit
    // opening certification must establish it before actual posting is enabled.
    if(!value||value.openingVerified!==true)ledgerFailure('LEDGER_ACCOUNT_OPENING_REQUIRED');
    assertBookScope(value,c.organizationId,c.financeEntityId);
    if(value.accountId!==accountId||!Number.isSafeInteger(value.revision)||value.revision<1)ledgerFailure('LEDGER_ACCOUNT_BALANCE_INVALID');
    result.push({ref,accountId,balanceCents:plus(value.balanceCents,delta),revision:plus(value.revision,1)});
  }
  return result;
}
export function writeEntry(t:Transaction,c:LedgerCommandContext,entry:CertifiedBookEntry,state:Awaited<ReturnType<typeof readLedgerState>>,effects:Awaited<ReturnType<typeof readAccountEffects>>,fundEffects:Awaited<ReturnType<typeof readFundEffects>>,details:Record<string,unknown>={}) {
  const org=c.db.collection('organizations').doc(c.organizationId);
  t.create(org.collection('financeJournalEntries').doc(entry.id),entry);
  for(const effect of effects)t.update(effect.ref,{balanceCents:effect.balanceCents,revision:effect.revision,lastJournalEntryId:entry.id,updatedAt:FieldValue.serverTimestamp()});
  for(const effect of fundEffects)t.set(effect.ref,{organizationId:c.organizationId,financeEntityId:c.financeEntityId,fundId:effect.fundId,postedNetMovementCents:effect.postedNetMovementCents,revision:effect.revision,totalBalanceKnown:false,lastJournalEntryId:entry.id,updatedAt:FieldValue.serverTimestamp()});
  t.set(state.ref,{...state.value,revision:plus(state.value.revision,1),entryCount:plus(state.value.entryCount,1),updatedAt:FieldValue.serverTimestamp()});
  const auditRef=org.collection('financeAuditLogs').doc('audit_'+bookId(entry.id));
  stageCanonicalAuditCreate(t,c.db,auditRef,{eventId:auditRef.id,organizationId:c.organizationId,financeEntityId:c.financeEntityId,
    actor:c.uid,resource:entry.sourceKind==='opening'?'finance_opening':entry.sourceKind.startsWith('payable_')?'finance_payable':'finance_transaction',resourceId:entry.sourceKind==='opening'?details.openingReceiptId:details.payableId??entry.sourceTransactionId,
    action:entry.sourceKind==='opening'?'ledger.opening.certified':entry.sourceKind.startsWith('payable_')?entry.reversalOfEntryId?'payable.payment.reversed':entry.sourceKind==='payable_payment'?'payable.payment.posted':'payable.recognized':entry.reversalOfEntryId?'transaction.reversed':'transaction.posted',requestId:c.requestId,
    details:{...details,journalEntryId:entry.id,effectiveDate:entry.effectiveDate,integrityHash:entry.integrityHash},createdAt:FieldValue.serverTimestamp()});
}
