import type { Transaction } from 'firebase-admin/firestore';
import { FieldValue,Timestamp } from 'firebase-admin/firestore';
import { deliverCertifiedReport,type CertifiedReportDelivery } from '../../../shared/finance/ledger/certifiedReportDelivery.js';
import { bookId,assertBookScope } from '../../../shared/finance/ledger/certifiedPosting.js';
import { ledgerDate,ledgerFailure,ledgerConfigurationKey } from '../../../shared/finance/ledger/certifiedConfiguration.js';
import { canonicalStringify } from '../../../shared/finance/ledger/postingPlan.js';
import { loadCertifiedBookReadModel } from './certifiedBookReadModel.js';
import { ledgerPeriodRef,readLedgerState,type LedgerCommandContext } from './certifiedLedgerStore.js';
import { parsePeriod } from './periodCloseReadModel.js';
import { stageCanonicalAuditCreate } from './auditFactProjection.js';
import { payablePolicyKey } from './payableSettlementStore.js';
import { loadRemittancePreview,remittancePolicyKey } from './remittanceStore.js';
export type FormalCloseBlocker={code:string;count:number};
const MAX_SOURCES=5000;
function monthBefore(period:string){const p=parsePeriod(period)!;const d=new Date(p.start);d.setUTCMonth(d.getUTCMonth()-1);return d.toISOString().slice(0,7);}
function nextMonth(period:string){return parsePeriod(period)!.endDateExclusive.slice(0,7);}
function failure(code:string):never{throw Object.assign(new Error(code),{status:409,error:code,code});}
export async function loadFormalClose(t:Transaction,c:LedgerCommandContext,period:string){
 const p=parsePeriod(period);if(!p)failure('PERIOD_CLOSE_INVALID_MONTH');
 const org=c.db.collection('organizations').doc(c.organizationId),entity=org.collection('financeEntities').doc(c.financeEntityId);
 const state=await readLedgerState(t,c),periodRef=ledgerPeriodRef(c.db,c.organizationId,c.financeEntityId,period),record=await t.get(periodRef);
 if(record.exists)assertBookScope(record.data(),c.organizationId,c.financeEntityId);
 const book=await loadCertifiedBookReadModel(t,c,p.startDate,p.endDateExclusive,true),config=book.internalConfiguration!;
 const snapshots=await Promise.all([
   t.get(org.collection('financeTransactions').where('financeEntityId','==',c.financeEntityId).limit(MAX_SOURCES+1)),
   t.get(entity.collection('countSessions').limit(MAX_SOURCES+1)),
   t.get(entity.collection('countVerificationSessions').limit(MAX_SOURCES+1)),
   t.get(entity.collection('universalEvidence').limit(MAX_SOURCES+1)),
   t.get(entity.collection('financePayables').limit(MAX_SOURCES+1)),
   t.get(org.collection('financeAccounts').where('financeEntityId','==',c.financeEntityId).limit(201)),
 ]);
 if(snapshots.some((s,i)=>s.size>(i===5?200:MAX_SOURCES)))failure('PERIOD_CLOSE_COVERAGE_INCOMPLETE');
 const [transactions,legacyCounts,counts,documents,bills,accounts]=snapshots;
 const blockers:FormalCloseBlocker[]=[],sourceRows:any[]=[],bankAccounts=new Set(accounts.docs.filter(d=>['bank_checking','bank_savings','payment_account'].includes(d.data().type)).map(d=>d.id));
 const addBlock=(code:string)=>{const b=blockers.find(b=>b.code===code);if(b)b.count++;else blockers.push({code,count:1});};
 const inPeriod=(value:any)=>{const date=ledgerDate(value,config.timeZone);return date>=p.startDate&&date<p.endDateExclusive;};
 const remember=(kind:string,d:any,date:any)=>sourceRows.push({kind,id:d.id,version:d.data().version??null,date:ledgerDate(date,config.timeZone),hash:bookId(canonicalStringify(d.data()))});
 let postedIncomeCents=0,postedExpenseCents=0,txCount=0,countCount=0,documentCount=0,outstandingCents=0;
 for(const d of transactions.docs){
   const v=d.data();assertBookScope(v,c.organizationId,c.financeEntityId);if(!inPeriod(v.occurredAt))continue;remember('transaction',d,v.occurredAt);txCount++;
   if(!['posted','reversed'].includes(v.status))addBlock('transactions_not_posted');
   if(v.status==='posted'){
     if(v.transactionKind==='income')postedIncomeCents+=v.amountCents;if(v.transactionKind==='expense')postedExpenseCents+=v.amountCents;
     if([v.accountId,v.sourceAccountId,v.destinationAccountId].some(id=>bankAccounts.has(id))&&v.reconciliationStatus!=='reconciled')addBlock('bank_transactions_unreconciled');
   }
 }
 const txMap=new Map(transactions.docs.map(d=>[d.id,d.data()]));
 for(const [collection,snapshot] of [['count',legacyCounts],['count_v3',counts]] as const)for(const d of snapshot.docs){
   const v=d.data();assertBookScope(v,c.organizationId,c.financeEntityId);if(!inPeriod(v.serviceDate))continue;remember(collection,d,v.serviceDate);countCount++;
   if(['cancelled','discarded'].includes(v.status))continue;
   if(v.status!=='matched'&&!(v.status==='requires_treasury_review'&&v.treasuryReview?.status==='accepted')){addBlock('counts_incomplete');continue;}
   const ids=v.countProposal?.transactionIds;
   const total=v.countA?.totalCents??v.evaluation?.totalCents??v.confirmations?.[0]?.controlTotalCents;
   if(!Number.isSafeInteger(total)||total<0){addBlock('counts_incomplete');continue;}
   if(total>0&&(!Array.isArray(ids)||ids.length===0||ids.some((id:string)=>!['posted','reversed'].includes(txMap.get(id)?.status))))addBlock('counts_not_posted');
 }
 const documentMap=new Map(documents.docs.map(d=>[d.id,d.data()]));
 const reviewedDocument=(v:any)=>v?.processingState==='rejected'||v?.processingState==='accepted'&&v.classification?.source==='human'&&v.review?.status==='reviewed';
 for(const d of documents.docs){const v=d.data();assertBookScope(v,c.organizationId,c.financeEntityId);if(!inPeriod(v.createdAt))continue;remember('document',d,v.createdAt);documentCount++;
   if(v.processingState==='duplicate'&&v.duplicate===true&&typeof v.duplicateOfEvidenceId==='string'&&v.duplicateOfEvidenceId!==d.id){
     const canonical=documentMap.get(v.duplicateOfEvidenceId);
     if(canonical){assertBookScope(canonical,c.organizationId,c.financeEntityId);if(reviewedDocument(canonical))continue;}
   }
   if(!reviewedDocument(v))addBlock('documents_not_reviewed');
 }
 for(const d of bills.docs){const v=d.data();assertBookScope(v,c.organizationId,c.financeEntityId);const basis=v.remittanceSource?.period?`${v.remittanceSource.period}-01`:v.recognitionDate||v.dueDate;if(!inPeriod(basis))continue;remember('payable',d,basis);
   if(v.status==='cancelled')continue;if(v.postingPerformed!==true)addBlock('payables_not_recognized');
 }
 // Historical figures come from immutable entries in this month, never a
 // bill's current remaining amount or a source reversed in a later month.
 postedIncomeCents=book.trialBalance.filter(r=>r.type==='income').reduce((n,r)=>n+r.creditCents-r.debitCents,0);
 postedExpenseCents=book.trialBalance.filter(r=>r.type==='expense').reduce((n,r)=>n+r.debitCents-r.creditCents,0);
 const payablePolicy=await t.get(org.collection('financeSettings').doc(payablePolicyKey(c.financeEntityId)));
 if(payablePolicy.exists){assertBookScope(payablePolicy.data(),c.organizationId,c.financeEntityId);const account=payablePolicy.data()!.policy?.liabilityLedgerAccountId;outstandingCents=-(book.trialBalance.find(r=>r.accountId===account)?.closingDebitNetCents||0);}
 if(outstandingCents<0)failure('PERIOD_CLOSE_PAYABLE_BALANCE_INVALID');
 if([postedIncomeCents,postedExpenseCents,outstandingCents].some(n=>!Number.isSafeInteger(n)))failure('PERIOD_CLOSE_AMOUNT_OVERFLOW');
 const policy=await t.get(org.collection('financeSettings').doc(remittancePolicyKey(c.financeEntityId)));
 if(policy.exists){assertBookScope(policy.data(),c.organizationId,c.financeEntityId);if(policy.data()!.policies?.some((r:any)=>r.effectivePeriod<=period)){
   const remittance=await loadRemittancePreview(t,c,period);
   if(!remittance.previous||remittance.previous.fingerprint!==remittance.fingerprint||remittance.assessment.blockers.length)addBlock('remittance_not_current');
   if(remittance.payable&&remittance.payable.postingPerformed!==true)addBlock('payables_not_recognized');
 }}
 const today=ledgerDate(new Date(),config.timeZone);if(p.endDateExclusive>today)addBlock('period_not_ended');
 const expectedPeriod=state.value.closedThrough?nextMonth(state.value.closedThrough):config.firstPeriod;
 if(period!==expectedPeriod&&record.data()?.status!=='closed')addBlock('period_out_of_sequence');
 sourceRows.sort((a,b)=>a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id));
 const summary={transactions:txCount,counts:countCount,documents:documentCount,postedIncomeCents,postedExpenseCents,outstandingPayablesCents:outstandingCents,remittanceConfigured:policy.exists};
 const fingerprint=bookId(canonicalStringify({organizationId:c.organizationId,financeEntityId:c.financeEntityId,period,bookRevision:state.value.revision,sourceRevision:state.value.sourceRevision??0,periodVersion:record.data()?.version??0,sourceRows,configuration:config,summary,remittancePolicy:policy.data()||null}));
 return {period,periodRef,record:record.data()||null,state,configuration:config,report:deliverCertifiedReport(book),sourceRows,summary,fingerprint,blockers,canClose:blockers.length===0&&record.data()?.status!=='closed'};
}
function chunksFor(report:CertifiedReportDelivery,sources:any[]){
 const sections:Array<[string,any[]]>=[['journal',report.journal],['ledger',report.ledger],['trialBalance',report.trialBalance],['sources',sources]];
 const chunks:Array<{id:string;section:string;rows:any[];hash:string}>=[];
 for(const [section,all] of sections){let rows:any[]=[],size=0;const flush=()=>{if(!rows.length)return;chunks.push({id:section+'_'+String(chunks.length).padStart(5,'0'),section,rows,hash:bookId(canonicalStringify(rows))});rows=[];size=0;};
   for(const row of all){const bytes=Buffer.byteLength(JSON.stringify(row));if(bytes>450000)failure('PERIOD_CLOSE_SNAPSHOT_TOO_LARGE');if(rows.length>=100||size+bytes>450000)flush();rows.push(row);size+=bytes;}flush();
 }
 if(chunks.length>350)failure('PERIOD_CLOSE_SNAPSHOT_TOO_LARGE');return chunks;
}
export async function stageFormalClose(t:Transaction,c:LedgerCommandContext,period:string,fingerprint:string,reason:string){
 if(typeof reason!=='string'||reason.trim().length<10||reason.length>1000)failure('PERIOD_CLOSE_REASON_REQUIRED');
 const p=await loadFormalClose(t,c,period);if(p.record?.status==='closed')failure('PERIOD_ALREADY_CLOSED');if(p.fingerprint!==fingerprint)failure('PERIOD_CLOSE_PREVIEW_CHANGED');if(!p.canClose)failure('PERIOD_CLOSE_BLOCKED');
 const version=(p.record?.version??0)+1,snapshotId='close_'+bookId(period,version,fingerprint),snapshotRef=p.periodRef.collection('snapshots').doc(snapshotId),chunks=chunksFor(p.report,p.sourceRows);
 const {journal:_,ledger:__,trialBalance:___,...reportHeader}=p.report;
 const manifest={organizationId:c.organizationId,financeEntityId:c.financeEntityId,period,version,snapshotId,fingerprint,summary:p.summary,reportHeader,configuration:p.configuration,
   chunks:chunks.map(({rows:_,...entry})=>entry),reason:reason.trim(),closedByUid:c.uid,closedByLabel:c.actorLabel&&c.actorLabel!==c.uid?c.actorLabel:'',closedAt:Timestamp.now(),immutable:true,schemaVersion:1};
 const manifestHash=bookId(canonicalStringify(manifest));
 t.create(snapshotRef,{...manifest,manifestHash});for(const chunk of chunks)t.create(snapshotRef.collection('chunks').doc(chunk.id),{organizationId:c.organizationId,financeEntityId:c.financeEntityId,...chunk});
 t.set(p.periodRef,{organizationId:c.organizationId,financeEntityId:c.financeEntityId,period,status:'closed',version,snapshotId,manifestHash,closedAt:manifest.closedAt,closedByLabel:manifest.closedByLabel});
 t.set(p.state.ref,{...p.state.value,closedThrough:period,revision:p.state.value.revision+1,periodFenceVersion:1,periodTimeZone:p.configuration.timeZone,updatedAt:FieldValue.serverTimestamp()});
 const audit=c.db.collection('organizations').doc(c.organizationId).collection('financeAuditLogs').doc();stageCanonicalAuditCreate(t,c.db,audit,{eventId:audit.id,organizationId:c.organizationId,financeEntityId:c.financeEntityId,actor:c.uid,resource:'finance_period',resourceId:p.periodRef.id,action:'finance.period.closed',requestId:c.requestId,versionBefore:version-1,versionAfter:version,details:{period,snapshotId,manifestHash,fingerprint,reason:reason.trim(),summary:p.summary},createdAt:manifest.closedAt});
 return {period,status:'closed',version,snapshotId,manifestHash};
}
export async function stageFormalReopen(t:Transaction,c:LedgerCommandContext,period:string,expectedVersion:number,reason:string){
 if(typeof reason!=='string'||reason.trim().length<10||reason.length>1000)failure('PERIOD_CLOSE_REASON_REQUIRED');
 const state=await readLedgerState(t,c),ref=ledgerPeriodRef(c.db,c.organizationId,c.financeEntityId,period),snap=await t.get(ref);
 if(!snap.exists)failure('PERIOD_NOT_CLOSED');const record=snap.data()!;assertBookScope(record,c.organizationId,c.financeEntityId);
 if(record.version!==expectedVersion)failure('PERIOD_CLOSE_VERSION_CONFLICT');if(record.status!=='closed'||state.value.closedThrough!==period)failure('PERIOD_REOPEN_LATEST_ONLY');
 const config=await t.get(c.db.collection('organizations').doc(c.organizationId).collection('financeSettings').doc(ledgerConfigurationKey(c.financeEntityId)));if(!config.exists)ledgerFailure('LEDGER_NOT_CONFIGURED');assertBookScope(config.data(),c.organizationId,c.financeEntityId);
 const previous=period===config.data()!.configuration.firstPeriod?null:monthBefore(period),version=record.version+1,now=Timestamp.now();
 t.update(ref,{status:'reopened',version,reopenedAt:now,reopenedByLabel:c.actorLabel&&c.actorLabel!==c.uid?c.actorLabel:'',reopenReason:reason.trim()});
 t.set(state.ref,{...state.value,closedThrough:previous,revision:state.value.revision+1,updatedAt:FieldValue.serverTimestamp()});
 const audit=c.db.collection('organizations').doc(c.organizationId).collection('financeAuditLogs').doc();stageCanonicalAuditCreate(t,c.db,audit,{eventId:audit.id,organizationId:c.organizationId,financeEntityId:c.financeEntityId,actor:c.uid,resource:'finance_period',resourceId:ref.id,action:'finance.period.reopened',requestId:c.requestId,versionBefore:record.version,versionAfter:version,details:{period,snapshotId:record.snapshotId,reason:reason.trim(),closedThroughBefore:period,closedThroughAfter:previous},createdAt:now});
 return {period,status:'reopened',version,snapshotId:record.snapshotId};
}
export async function readClosedReport(t:Transaction,c:LedgerCommandContext,period:string,snapshotId?:string){
 const ref=ledgerPeriodRef(c.db,c.organizationId,c.financeEntityId,period),record=await t.get(ref);if(!record.exists)failure('PERIOD_SNAPSHOT_NOT_FOUND');assertBookScope(record.data(),c.organizationId,c.financeEntityId);
 const id=snapshotId||record.data()!.snapshotId;if(typeof id!=='string'||!/^close_[a-f0-9]{64}$/.test(id))failure('PERIOD_SNAPSHOT_NOT_FOUND');
 const manifestRef=ref.collection('snapshots').doc(id),doc=await t.get(manifestRef);if(!doc.exists)failure('PERIOD_SNAPSHOT_NOT_FOUND');const {manifestHash,...manifest}=doc.data()!;assertBookScope(manifest,c.organizationId,c.financeEntityId);
 if(bookId(canonicalStringify(manifest))!==manifestHash||manifest.snapshotId!==id||manifest.period!==period)failure('PERIOD_SNAPSHOT_INTEGRITY_INVALID');
 const report={...manifest.reportHeader,journal:[],ledger:[],trialBalance:[]} as CertifiedReportDelivery;
 if(!Array.isArray(manifest.chunks)||manifest.chunks.length>350)failure('PERIOD_SNAPSHOT_INTEGRITY_INVALID');
 for(const part of manifest.chunks){const chunk=await t.get(manifestRef.collection('chunks').doc(part.id));if(!chunk.exists)failure('PERIOD_SNAPSHOT_INTEGRITY_INVALID');assertBookScope(chunk.data(),c.organizationId,c.financeEntityId);const data=chunk.data()!;
   if(part.hash!==bookId(canonicalStringify(data.rows))||data.section!==part.section)failure('PERIOD_SNAPSHOT_INTEGRITY_INVALID');
   if(['journal','ledger','trialBalance'].includes(part.section))(report as any)[part.section].push(...data.rows);
 }
 return {report,closure:{period,snapshotId:id,version:manifest.version,reason:manifest.reason,closedByLabel:manifest.closedByLabel,closedAt:manifest.closedAt.toDate().toISOString(),manifestHash}};
}
