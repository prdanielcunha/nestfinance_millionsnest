import type { Transaction } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { assessRemittance,parseRemittancePolicy,type RemittancePolicy } from '../../../shared/finance/remittancePolicy.js';
import { assertBookScope,bookId } from '../../../shared/finance/ledger/certifiedPosting.js';
import { ledgerFailure } from '../../../shared/finance/ledger/certifiedConfiguration.js';
import { receiptDay } from '../../../shared/finance/receivedIncome.js';
import { computeApprovalSourceHash } from '../../../shared/finance/ledger/approvalSourceHash.js';
import { canonicalStringify } from '../../../shared/finance/ledger/postingPlan.js';
import { buildUnpaidPayable } from '../../../shared/finance/payableObligation.js';
import { loadCertifiedBookReadModel } from './certifiedBookReadModel.js';
import { readLedgerState,type LedgerCommandContext } from './certifiedLedgerStore.js';
import { stageCanonicalAuditCreate } from './auditFactProjection.js';
import { parsePeriod } from './periodCloseReadModel.js';
export const remittancePolicyKey=(entity:string)=>'remittance_policy_'+bookId(entity);
export const remittanceAssessmentKey=(entity:string,period:string)=>'remittance_assessment_'+bookId(entity,period);
function failure(code:string):never{throw Object.assign(new Error(code),{code,status:409});}
export async function loadRemittancePreview(t:Transaction,c:LedgerCommandContext,period:string){
  const p=parsePeriod(period);if(!p)failure('REMITTANCE_PERIOD_INVALID');
  const org=c.db.collection('organizations').doc(c.organizationId),settings=org.collection('financeSettings');
  const rules=await t.get(settings.doc(remittancePolicyKey(c.financeEntityId)));
  if(!rules.exists)failure('REMITTANCE_POLICY_REQUIRED');assertBookScope(rules.data(),c.organizationId,c.financeEntityId);
  const policies=rules.data()!.policies as RemittancePolicy[];
  if(!Array.isArray(policies)||policies.length>100)failure('REMITTANCE_POLICY_INVALID');
  for(const policy of policies){const {revision,...material}=policy;parseRemittancePolicy(material,revision);}
  const selected=policies.filter(r=>r.effectivePeriod<=period).sort((a,b)=>b.effectivePeriod.localeCompare(a.effectivePeriod)||b.revision-a.revision)[0];
  if(!selected)failure('REMITTANCE_POLICY_NOT_EFFECTIVE');
  const book=await loadCertifiedBookReadModel(t,c,p.startDate,p.endDateExclusive,true);
  const entries=book.internalEntries!,configuration=book.internalConfiguration!;
  const dates=new Map<string,string>(),orgTx=org.collection('financeTransactions');
  for(const entry of entries.filter(e=>e.sourceKind==='transaction'&&e.plan.transactionKind==='income')){
    if(entry.reversalOfEntryId){dates.set(entry.id,entry.effectiveDate);continue;}
    const source=await t.get(orgTx.doc(entry.sourceTransactionId));if(!source.exists)failure('REMITTANCE_SOURCE_MISSING');
    const tx:any={...source.data(),id:source.id};assertBookScope(tx,c.organizationId,c.financeEntityId);
    const allocationDocs=await t.get(org.collection('financeAllocations').where('transactionId','==',source.id).limit(101));
    if(allocationDocs.size>100)failure('REMITTANCE_SOURCE_INVALID');
    const allocations=allocationDocs.docs.map(d=>({...d.data(),id:d.id}) as any);for(const a of allocations)assertBookScope(a,c.organizationId,c.financeEntityId);
    if(computeApprovalSourceHash(tx as any,allocations,3)!==entry.sourceHash)failure('REMITTANCE_SOURCE_CHANGED');
    const day=receiptDay(source.data()!.occurredAt,configuration.timeZone);if(!day)failure('REMITTANCE_SOURCE_DATE_INVALID');dates.set(entry.id,day);
  }
  const assessment=assessRemittance(period,selected,entries,e=>dates.get(e.id)||'');
  const fingerprint=bookId(canonicalStringify(assessment));
  const ref=settings.doc(remittanceAssessmentKey(c.financeEntityId,period)),previous=await t.get(ref);
  if(previous.exists)assertBookScope(previous.data(),c.organizationId,c.financeEntityId);
  const stored=previous.data();
  let payable:any=null;
  if(stored?.payableId){const snap=await t.get(org.collection('financeEntities').doc(c.financeEntityId).collection('financePayables').doc(stored.payableId));if(!snap.exists)failure('REMITTANCE_PAYABLE_MISSING');assertBookScope(snap.data(),c.organizationId,c.financeEntityId);payable={id:snap.id,...snap.data()};}
  return {assessment,fingerprint,bookRevision:book.coverage.revision,closedThrough:book.closedThrough,ref,previous:stored||null,payable};
}
export async function stageRemittancePolicy(t:Transaction,c:LedgerCommandContext,input:unknown,expectedRevision:number,reason:string){
  if(typeof reason!=='string'||reason.trim().length<10||reason.length>1000)failure('REMITTANCE_REASON_REQUIRED');
  const org=c.db.collection('organizations').doc(c.organizationId),ref=org.collection('financeSettings').doc(remittancePolicyKey(c.financeEntityId));
  const snap=await t.get(ref),old=snap.data();if(old)assertBookScope(old,c.organizationId,c.financeEntityId);
  if((old?.revision??0)!==expectedRevision)failure('REMITTANCE_VERSION_CONFLICT');
  const policy=parseRemittancePolicy(input,expectedRevision+1),state=await readLedgerState(t,c);
  if(state.value.closedThrough&&policy.effectivePeriod<=state.value.closedThrough)ledgerFailure('LEDGER_PERIOD_CLOSED');
  if((old?.policies?.length??0)>=100)failure('REMITTANCE_POLICY_LIMIT');
  if(old?.policies?.some((p:RemittancePolicy)=>p.effectivePeriod>policy.effectivePeriod))failure('REMITTANCE_BACKDATED_POLICY');
  for(const [id,kind] of [...policy.incomeCategoryIds.map(id=>[id,'income']),[policy.expenseCategoryId,'expense']]){
    const cat=await t.get(org.collection('financeCategories').doc(id));if(!cat.exists||cat.data()?.active!==true||cat.data()?.kind!==kind)failure('REMITTANCE_CATEGORY_INVALID');assertBookScope(cat.data(),c.organizationId,c.financeEntityId);
  }
  const history={organizationId:c.organizationId,financeEntityId:c.financeEntityId,policy,reason:reason.trim(),actorUid:c.uid,actorLabel:c.actorLabel&&c.actorLabel!==c.uid?c.actorLabel:'',changedAt:FieldValue.serverTimestamp()};
  t.create(ref.collection('history').doc(String(policy.revision)),history);
  t.set(ref,{organizationId:c.organizationId,financeEntityId:c.financeEntityId,revision:policy.revision,policies:[...(old?.policies||[]),policy]});
  const audit=org.collection('financeAuditLogs').doc();stageCanonicalAuditCreate(t,c.db,audit,{eventId:audit.id,organizationId:c.organizationId,financeEntityId:c.financeEntityId,actor:c.uid,resource:'remittance_policy',resourceId:ref.id,action:'finance.remittance.policy_changed',requestId:c.requestId,versionBefore:expectedRevision,versionAfter:policy.revision,details:{reason:reason.trim(),before:old?.policies?.at(-1)||null,after:policy},createdAt:FieldValue.serverTimestamp()});
  return {revision:policy.revision,policy};
}
export async function stageRemittanceAssessment(t:Transaction,c:LedgerCommandContext,period:string,fingerprint:string,reason:string,language:'PT'|'EN'|'ES',replace:boolean){
  const loaded=await loadRemittancePreview(t,c,period),a=loaded.assessment;
  if(loaded.closedThrough&&period<=loaded.closedThrough)ledgerFailure('LEDGER_PERIOD_CLOSED');
  if(fingerprint!==loaded.fingerprint)failure('REMITTANCE_PREVIEW_CHANGED');
  if(a.blockers.length)failure(a.blockers[0]);
  if(loaded.previous&&!replace){if(loaded.previous.fingerprint===fingerprint)return {payableId:loaded.previous.payableId,assessmentRevision:loaded.previous.revision,replayed:true};failure('REMITTANCE_EXISTING_ASSESSMENT_CHANGED');}
  if(replace&&(!loaded.previous||typeof reason!=='string'||reason.trim().length<10||reason.length>1000))failure('REMITTANCE_REASON_REQUIRED');
  if(loaded.payable&&(loaded.payable.postingPerformed===true||loaded.payable.paidCents!==0||!['awaiting_review','open'].includes(loaded.payable.status)))failure('REMITTANCE_ALREADY_RECOGNIZED');
  const org=c.db.collection('organizations').doc(c.organizationId),bills=org.collection('financeEntities').doc(c.financeEntityId).collection('financePayables');
  const revision=(loaded.previous?.revision??0)+1,payableId=a.amountCents>0?'pay_'+bookId(c.financeEntityId,period,revision,fingerprint).slice(0,32):null;
  const label=language==='EN'?'Remittance':language==='ES'?'Remesa':'Repasse';
  const receipt={organizationId:c.organizationId,financeEntityId:c.financeEntityId,period,revision,fingerprint,payableId,assessment:a,bookRevision:loaded.bookRevision,reason:reason?.trim()||'',createdByUid:c.uid,createdByLabel:c.actorLabel&&c.actorLabel!==c.uid?c.actorLabel:'',createdAt:FieldValue.serverTimestamp()};
  if(loaded.payable)t.update(bills.doc(loaded.payable.id),{status:'cancelled',version:loaded.payable.version+1,cancellationReason:reason.trim(),cancelledAt:FieldValue.serverTimestamp(),cancelledByUid:c.uid});
  if(payableId)t.create(bills.doc(payableId),{...buildUnpaidPayable({description:`${label} ${period} — ${a.policy.recipient}`,counterparty:a.policy.recipient,amountCents:a.amountCents,dueDate:parsePeriod(period)!.endDateExclusive.slice(0,7)+'-'+String(a.policy.dueDay).padStart(2,'0'),documentReference:`${label} ${period}`,notes:`${label}: ${a.policy.percentageBasisPoints/100}%`},c.organizationId,c.financeEntityId),createdByUid:c.uid,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),remittanceSource:{period,assessmentRevision:revision,fingerprint,expenseCategoryId:a.policy.expenseCategoryId}});
  t.create(loaded.ref.collection('history').doc(String(revision)),receipt);t.set(loaded.ref,receipt);
  const audit=org.collection('financeAuditLogs').doc();stageCanonicalAuditCreate(t,c.db,audit,{eventId:audit.id,organizationId:c.organizationId,financeEntityId:c.financeEntityId,actor:c.uid,resource:'remittance_assessment',resourceId:loaded.ref.id,action:replace?'finance.remittance.reassessed':'finance.remittance.assessed',requestId:c.requestId,versionBefore:revision-1,versionAfter:revision,details:{period,baseCents:a.baseCents,amountCents:a.amountCents,payableId,previousPayableId:loaded.previous?.payableId||null,reason:reason?.trim()||'',postingPerformed:false},createdAt:FieldValue.serverTimestamp()});
  return {payableId,assessmentRevision:revision,replayed:false};
}
