import { createHash } from 'node:crypto';
import { FieldValue, type DocumentReference, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { preparePostingExecution, type PostingCatalog } from '../../../shared/finance/ledger/postingExecution.js';
import type { LedgerTransaction } from '../../../shared/finance/ledger/transaction.js';
import type { FinanceAllocation } from '../../../shared/finance/ledger/allocation.js';
import { buildTransactionListQueryKeys } from '../../../shared/finance/ledger/listQueryKeys.js';
import { isValidIdempotencyKey, isValidRequestId, isValidTransactionId } from '../../../shared/finance/ledger/ids.js';
import { receiptDay, validReceiptDate } from '../../../shared/finance/receivedIncome.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { stageCanonicalAuditRecord } from './auditFactProjection.js';
import { stageFinanceFact } from './factStream.js';
import { sanitizeFirestoreObject } from './sanitizeFirestoreObject.js';
import { journalEvidenceHash } from './ledgerJournalEvidence.js';
import { validateLedgerCountSource } from './ledgerCountSource.js';

const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
function fail(code:string):never { throw Object.assign(new Error(code),{code}); }
function referenceId(value:unknown):string {
  if(typeof value!=='string'||! /^[a-zA-Z0-9_.:-]{1,160}$/.test(value))fail('FINANCE_REFERENCE_INVALID');
  return value;
}
function scoped(data:any,organizationId:string,financeEntityId:string) {
  if(data?.organizationId!==organizationId||data?.financeEntityId!==financeEntityId)fail('FINANCE_CROSS_ENTITY_REFERENCE');
}
function safeAdd(a:number,b:number) {
  if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||!Number.isSafeInteger(a+b))fail('FINANCE_AMOUNT_OVERFLOW');
  return a+b;
}
type Command={transactionId:string;expectedVersion:number;idempotencyKey:string;requestId:string};
export type LedgerPostingStoreInput={db:Firestore;organizationId:string;financeEntityId:string;actorUid:string;command:Command};

export async function readPostingCatalog(t:{getAll(...refs:DocumentReference[]):Promise<DocumentSnapshot[]>},db:Firestore,organizationId:string,financeEntityId:string,tx:any,allocations:FinanceAllocation[]):Promise<PostingCatalog> {
  const org=db.collection('organizations').doc(organizationId);
  const unique=(values:unknown[])=>[...new Set(values.filter(value=>value!==undefined&&value!==null&&value!==''))].map(referenceId).sort();
  const accountIds=unique([tx.accountId,tx.sourceAccountId,tx.destinationAccountId,tx.liabilityAccountId]);
  const categoryIds=unique(allocations.map(value=>value.categoryId));
  const fundIds=unique(allocations.map(value=>value.fundId));
  async function read(collection:string,ids:string[]) {
    if(!ids.length)return [];
    const snapshots=await t.getAll(...ids.map(id=>org.collection(collection).doc(id)));
    return snapshots.map(doc=>{if(!doc.exists)fail('FINANCE_REFERENCE_NOT_FOUND');const data=doc.data()!;scoped(data,organizationId,financeEntityId);return {...data,id:doc.id};});
  }
  const [accountDocs,categoryDocs,fundDocs]=await Promise.all([read('financeAccounts',accountIds),read('financeCategories',categoryIds),read('financeFunds',fundIds)]);
  const ledgerIds=unique([...accountDocs,...categoryDocs].map((value:any)=>value.ledgerMapping));
  const ledgerDocs=await read('financeLedgerAccounts',ledgerIds);
  const base=(value:any)=>({id:value.id,organizationId:value.organizationId,financeEntityId:value.financeEntityId,active:value.active,version:value.ledgerConfigurationRevision??value.version});
  return {
    accounts:accountDocs.map((value:any)=>({...base(value),nature:value.nature,currency:value.currency,ledgerMapping:value.ledgerMapping,type:value.type})),
    categories:categoryDocs.map((value:any)=>({...base(value),kind:value.kind,ledgerMapping:value.ledgerMapping})),
    funds:fundDocs.map(base),
    ledgerAccounts:ledgerDocs.map((value:any)=>({...base(value),name:value.name,type:value.type,normalBalance:value.normalBalance,postingAllowed:value.postingAllowed})),
  };
}

/** Internal persistence adapter, not an HTTP endpoint. A caller must first
 * resolve canonical Finance authority. No existing product route calls this
 * adapter, and the dedicated server flag defaults OFF. */
export async function executeLedgerPosting(input:LedgerPostingStoreInput) {
  if(process.env.NESTFINANCE_LEDGER_POSTING_ENABLED!=='true')fail('FINANCE_LEDGER_POSTING_NOT_ENABLED');
  const {db,actorUid,command}=input,organizationId=referenceId(input.organizationId),financeEntityId=referenceId(input.financeEntityId);
  if(typeof actorUid!=='string'||!actorUid.trim()||actorUid.length>128||!command||!isValidTransactionId(command.transactionId)||
    !Number.isSafeInteger(command.expectedVersion)||command.expectedVersion<1||
    !isValidIdempotencyKey(command.idempotencyKey)||!isValidRequestId(command.requestId))fail('FINANCE_INVALID_EXECUTION_COMMAND');
  const org=db.collection('organizations').doc(organizationId),txRef=org.collection('financeTransactions').doc(command.transactionId);
  const entityRef=org.collection('financeEntities').doc(financeEntityId);
  const journalId='je_'+digest(`${organizationId}:${financeEntityId}:${command.transactionId}:posted`);
  const journalRef=org.collection('financeJournalEntries').doc(journalId);
  const keyHash=buildIdempotencyKeyHash(organizationId,financeEntityId,actorUid,'ledger_post',command.idempotencyKey);
  const payloadHash=hashPayload({transactionId:command.transactionId,expectedVersion:command.expectedVersion});
  const now=new Date().toISOString();
  return executeWithIdempotency(db,org.collection('financeIdempotency'),keyHash,payloadHash,async t=>{
    const [txDoc,approvalDoc,configurationDoc,settingsDoc,entityDoc,journalDoc]=await t.getAll(
      txRef,txRef.collection('approvals').doc('latest'),org.collection('financeLedgerExecution').doc(financeEntityId),
      org.collection('financeSettings').doc('config'),entityRef,journalRef,
    );
    if(!txDoc.exists||!approvalDoc.exists||!entityDoc.exists)fail('FINANCE_EXECUTION_SOURCE_NOT_FOUND');
    const tx={...txDoc.data(),id:txDoc.id} as LedgerTransaction;
    scoped(tx,organizationId,financeEntityId);
    if(entityDoc.data()?.active===false||
      (entityDoc.data()?.organizationId&&entityDoc.data()?.organizationId!==organizationId))fail('FINANCE_ENTITY_NOT_ACTIVE');
    if(!configurationDoc.exists)fail('FINANCE_LEDGER_INITIALIZATION_REQUIRED');
    const configuration=configurationDoc.data();scoped(configuration,organizationId,financeEntityId);
    if(configuration?.state!=='ready'||configuration.schemaVersion!==1||configuration.initializationMode!=='empty_posted_history'||
      configuration.baselineTransactionCount!==0||!Number.isSafeInteger(configuration.revision)||configuration.revision<1||
      !validReceiptDate(configuration.effectiveStartDate))fail('FINANCE_LEDGER_INITIALIZATION_REQUIRED');
    const settings=settingsDoc.data();
    if(settings?.organizationId&&settings.organizationId!==organizationId)fail('FINANCE_CROSS_ENTITY_REFERENCE');
    const timezone=settings?.timezone||'America/Sao_Paulo';
    const day=receiptDay(tx.occurredAt,timezone);if(!day)fail('FINANCE_EXECUTION_DATE_INVALID');
    if(day<configuration.effectiveStartDate)fail('FINANCE_BEFORE_LEDGER_BASELINE');
    const period=day.slice(0,7),periodRef=org.collection('financeLedgerPeriods').doc(`${financeEntityId}:${period}`);
    const [periodDoc,allocationsDoc]=await Promise.all([
      t.get(periodRef),t.get(org.collection('financeAllocations').where('financeEntityId','==',financeEntityId).where('transactionId','==',tx.id).limit(101)),
    ]);
    if(allocationsDoc.size>100)fail('FINANCE_EXECUTION_ALLOCATION_LIMIT');
    const periodData=periodDoc.data();if(periodData)scoped(periodData,organizationId,financeEntityId);
    if(periodData&&(!Number.isSafeInteger(periodData.version)||periodData.version<1||
      !Number.isSafeInteger(periodData.postedEntryCount)||periodData.postedEntryCount<0))fail('FINANCE_PERIOD_INTEGRITY');
    const allocations=allocationsDoc.docs.map(doc=>({...doc.data(),id:doc.id}) as FinanceAllocation);
    const catalog=await readPostingCatalog(t,db,organizationId,financeEntityId,tx,allocations);
    const countSourceProofHash=await validateLedgerCountSource({reader:t,db,organizationId,financeEntityId,transaction:tx,timezone});
    if(countSourceProofHash&&(approvalDoc.data()?.countSourceProofHash!==countSourceProofHash||(tx as any).countSourceProofHash!==countSourceProofHash))fail('FINANCE_COUNT_SOURCE_CHANGED');
    const lineCount=['income','expense'].includes(tx.transactionKind)?allocations.length+1:2;
    const execution=preparePostingExecution({transaction:tx,allocations,approval:approvalDoc.data() as any,catalog,
      expectedVersion:command.expectedVersion,actorUid,now,timezone,periodOpen:!periodDoc.exists||periodData?.state==='open',
      journalEntryId:journalId,journalLineIds:Array.from({length:lineCount},(_,i)=>'jl_'+digest(`${journalId}:${i+1}`)),
    });
    if(journalDoc.exists)fail('FINANCE_JOURNAL_ALREADY_EXISTS');
    const fundDeltas=new Map<string,number>();
    for(const effect of execution.plan.fundEffects) {
      if(effect.effect==='none')continue;
      const sign=effect.effect==='increase'||effect.effect==='transfer_in'?1:-1;
      fundDeltas.set(effect.fundId,safeAdd(fundDeltas.get(effect.fundId)||0,sign*effect.amountCents));
    }
    const movements=[...execution.accountDeltas.map(value=>({kind:'account',resourceId:value.accountId,deltaCents:value.deltaCents})),
      ...[...fundDeltas].map(([resourceId,deltaCents])=>({kind:'fund',resourceId,deltaCents}))];
    const projections=movements.flatMap(value=>['all',period].map(periodKey=>({...value,periodKey,
      ref:org.collection('financeAggregates').doc('ledger_'+digest(`${financeEntityId}:${value.kind}:${value.resourceId}:${periodKey}`))})));
    const projectionDocs=projections.length?await t.getAll(...projections.map(value=>value.ref)):[];
    let countLockRef:DocumentReference|null=null;
    if(tx.countSource) {
      const source=tx.countSource as any;
      if(!source.countSessionId||!source.countEntryType)fail('FINANCE_COUNT_SOURCE_INVALID');
      const countKey=hashPayload([financeEntityId,source.countSessionId,source.countEntryType,source.countReceiptMethod||tx.paymentMethod]);
      countLockRef=org.collection('financeUniqueKeys').doc(`ledger_count_${countKey}`);
      const lock=await t.get(countLockRef);if(lock.exists)fail('FINANCE_COUNT_SOURCE_ALREADY_POSTED');
    }
    const nextVersion=safeAdd(tx.version,1),periodVersion=safeAdd(periodData?.version??0,1);
    const periodCount=safeAdd(periodData?.postedEntryCount??0,1);
    const updates=projectionDocs.map((doc:DocumentSnapshot,index:number)=>{
      const previous=doc.data(),projection=projections[index];
      if(previous){scoped(previous,organizationId,financeEntityId);if(previous.resourceId!==projection.resourceId||previous.kind!==projection.kind||previous.periodKey!==projection.periodKey||previous.currency!=='BRL')fail('FINANCE_PROJECTION_SCOPE_MISMATCH');}
      const postedMovementCents=safeAdd(previous?.postedMovementCents??0,projection.deltaCents);
      if(previous&&(!Number.isSafeInteger(previous.postedMovementCents)||!Number.isSafeInteger(previous.version)||previous.version<1||!Number.isSafeInteger(previous.postingCount)||previous.postingCount<1))fail('FINANCE_PROJECTION_INTEGRITY');
      return {...projection,postedMovementCents,version:safeAdd(previous?.version??0,1),postingCount:safeAdd(previous?.postingCount??0,1)};
    });
    const journalMaterial=sanitizeFirestoreObject({...execution.journal,effectiveDay:day,period,
      accountDeltas:execution.accountDeltas,fundDeltas:[...fundDeltas].map(([fundId,deltaCents])=>({fundId,deltaCents})),
      sourceVersion:tx.version,approvalSourceHash:tx.approvalSourceHash,planHash:execution.plan.planHash,
      referenceFingerprintHash:execution.referenceFingerprintHash,countSourceProofHash,executionSchemaVersion:1});
    t.create(journalRef,{...journalMaterial,executionProofHash:journalEvidenceHash(journalMaterial),recordedAt:FieldValue.serverTimestamp()});
    for(const update of updates)t.set(update.ref,{organizationId,financeEntityId,resourceId:update.resourceId,kind:update.kind,
      periodKey:update.periodKey,currency:'BRL',postedMovementCents:update.postedMovementCents,
      version:update.version,postingCount:update.postingCount,lastJournalEntryId:journalId,
      // This projection contains movement only; it is never a verified opening or total balance.
      basis:'posted_movements_since_initialization',updatedAt:FieldValue.serverTimestamp()});
    t.set(periodRef,{organizationId,financeEntityId,period,state:'open',version:periodVersion,postedEntryCount:periodCount,
      lastJournalEntryId:journalId,updatedAt:FieldValue.serverTimestamp()});
    t.update(txRef,{status:'posted',journalEntryId:journalId,postedBy:actorUid,postedAt:FieldValue.serverTimestamp(),
      version:nextVersion,updatedBy:actorUid,updatedAt:FieldValue.serverTimestamp(),
      listQueryKeys:buildTransactionListQueryKeys(financeEntityId,tx.id,tx.transactionKind,'posted',tx.occurredAt)});
    if(countLockRef)t.create(countLockRef,{organizationId,financeEntityId,transactionId:tx.id,journalEntryId:journalId,
      state:'posted',countVersion:tx.countSource!.countVersion,countSourceProofHash,createdAt:FieldValue.serverTimestamp()});
    const auditId='audit_'+digest(journalId),auditRef=org.collection('financeAuditLogs').doc(auditId);
    stageCanonicalAuditRecord(t,db,auditRef,{eventId:auditId,organizationId,financeEntityId,actor:actorUid,
      resource:'transaction',resourceId:tx.id,action:'transaction.posted',requestId:command.requestId,
      beforeHash:tx.approvalSourceHash,afterHash:execution.plan.planHash,createdAt:FieldValue.serverTimestamp(),
      details:{versionBefore:tx.version,versionAfter:nextVersion,periodKey:period,journalEntryId:journalId}},'create');
    stageFinanceFact(t,db,{organizationId,eventType:'TRANSACTION_POSTED',entityType:'finance_transaction',entityId:tx.id,
      actorUserId:actorUid,correlationId:keyHash,payload:{financeEntityId,status:'posted',version:nextVersion,postingExecuted:true,period},
      sourceRefs:[{kind:'record',ref:txRef.path,version:nextVersion},{kind:'record',ref:journalRef.path},{kind:'audit',ref:auditRef.path}]});
    return {transactionId:tx.id,journalEntryId:journalId,version:nextVersion,status:'posted' as const};
  });
}
