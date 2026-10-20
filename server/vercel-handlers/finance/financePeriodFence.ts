import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { bookId } from '../../../shared/finance/ledger/certifiedPosting.js';
import { ledgerDate } from '../../../shared/finance/ledger/certifiedConfiguration.js';

const wrappers=new WeakMap<object,Firestore>();
const datedFlat=new Set(['financeTransactions','financeAllocations','financeJournalEntries','financeReconciliations','financeReconciliationSessions','financeReconciliationReversals','financeReconciliationLineLocks','financeCategories','financeFunds']);
const datedNested=new Set(['countSessions','countVerificationSessions','countSecondInvites','countVerificationInvites','countCaptures','countCaptureHashes','countPaperForms','universalEvidence','universalEvidenceHashes','financePayables']);
function fail(code='LEDGER_PERIOD_CLOSED'):never{throw Object.assign(new Error(code),{status:409,error:code,code});}
type Write={method:string;args:any[]};
function scopeOf(path:string,data:any):{org:string;entity:string;collection:string;id:string}|null{
  const p=path.split('/');if(p[0]!=='organizations')return null;
  if(datedFlat.has(p[2])&&p.length===4)return {org:p[1],entity:data?.financeEntityId,collection:p[2],id:p[3]};
  if(p[2]==='financeAccounts'&&p.length===4)return {org:p[1],entity:data?.financeEntityId,collection:'opening',id:p[3]};
  if(p[2]==='financeEntities'&&p.length>=6&&datedNested.has(p[4])&&(p[4]!=='financePayables'||p.length===6))return {org:p[1],entity:p[3],collection:p[4],id:p[5]};
  return null;
}
/** Every financial source writer uses this same transaction boundary, including
 * legacy catalog handlers and background callers. Writes are staged until their
 * original records and period fences have been read in the SAME transaction.
 * No authority is granted here. Auth/RBAC remain in the canonical handlers.
 */
export function withFinancePeriodFence(db:Firestore):Firestore{
  const existing=wrappers.get(db);if(existing)return existing;
  const wrapped=new Proxy(db,{get(target,key){
    if(key!=='runTransaction'){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}
    return (operation:any,options?:any)=>target.runTransaction(async raw=>{
      if(options?.readOnly)return operation(raw);
      const writes:Write[]=[],cache=new Map<string,any>();let proxy:any;
      const remember=(ref:any,result:any)=>{if(typeof ref?.path==='string'&&typeof result?.exists==='boolean')cache.set(ref.path,result);if(result?.docs)for(const d of result.docs)if(d.ref?.path)cache.set(d.ref.path,d);return result;};
      const read=async(ref:any)=>{if(cache.has(ref.path))return cache.get(ref.path);return remember(ref,await raw.get(ref));};
      proxy=new Proxy(raw,{get(t,property){
        if(['set','update','create','delete'].includes(String(property)))return (...args:any[])=>{writes.push({method:String(property),args});return proxy;};
        if(property==='get')return async(ref:any,...args:any[])=>remember(ref,await (t.get as any)(ref,...args));
        if(property==='getAll')return async(...refs:any[])=>{const result=await (t.getAll as any)(...refs);result.forEach((r:any,i:number)=>remember(refs[i],r));return result;};
        const value=Reflect.get(t,property,t);return typeof value==='function'?value.bind(t):value;
      }});
      const result=await operation(proxy);
      const fences=new Map<string,any>();
      const touched=new Map<string,{ref:any;value:any;exists:boolean;org:string;entity:string}>();
      // A certified reversal in an OPEN month may update only the lifecycle of
      // its historical source. Its original journal remains immutable.
      const newJournals=writes.filter(w=>/\/financeJournalEntries\/[^/]+$/.test(w.args[0]?.path||'')&&w.method==='create').map(w=>w.args[1]);
      for(const w of writes){
        const ref=w.args[0],path=ref?.path;if(typeof path!=='string')continue;
        let proposed=w.method==='delete'?null:w.args[1];
        let scope=scopeOf(path,proposed||cache.get(path)?.data?.());
        if(!scope&&!scopeOf(path,{financeEntityId:'probe'}))continue;
        const oldSnap=await read(ref),old=oldSnap.exists?oldSnap.data():null;
        const after=w.method==='update'||w.method==='set'&&w.args[2]?.merge?{...old,...proposed}:proposed;
        scope=scopeOf(path,old||after)||scope;if(!scope)continue;
        if(typeof scope.entity!=='string'||!scope.entity||scope.entity.length>128)fail('LEDGER_PERIOD_FENCE_SCOPE_INVALID');
        if(after&&(after.organizationId!==undefined&&after.organizationId!==scope.org||after.financeEntityId!==undefined&&after.financeEntityId!==scope.entity))fail('LEDGER_PERIOD_FENCE_SCOPE_INVALID');
        const fk=scope.org+'|'+scope.entity;
        if(!fences.has(fk)){
          const stateRef=target.collection('organizations').doc(scope.org).collection('financeSettings').doc('ledger_state_'+bookId(scope.entity));
          const state=await read(stateRef);const value=state.exists?state.data():null;fences.set(fk,value);touched.set(fk,{ref:stateRef,value,exists:state.exists,org:scope.org,entity:scope.entity});
        }
        const state=fences.get(fk);if(state&&(state.organizationId!==scope.org||state.financeEntityId!==scope.entity))fail('LEDGER_PERIOD_FENCE_SCOPE_INVALID');if(!state?.closedThrough)continue;
        if(['financeCategories','financeFunds'].includes(scope.collection))continue;
        if(scope.collection==='opening'&&JSON.stringify(old?.openingBalanceDeclaration)===JSON.stringify(after?.openingBalanceDeclaration)&&old?.openingBalanceCents===after?.openingBalanceCents&&old?.certifiedOpeningReceiptId===after?.certifiedOpeningReceiptId)continue;
        if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(state.closedThrough)||state.organizationId!==scope.org||state.financeEntityId!==scope.entity)fail('LEDGER_STATE_INVALID');
        const timezone=state.periodTimeZone||'UTC';
        const dates:string[]=[];
        const add=(value:any,isNew=false)=>{
          if(value===undefined||value===null||value==='')return;
          if(isNew&&typeof value?.isEqual==='function'&&value.isEqual(FieldValue.serverTimestamp())){dates.push(ledgerDate(new Date(),timezone));return;}
          try{dates.push(ledgerDate(value,timezone));}catch{fail('LEDGER_PERIOD_FENCE_DATE_INVALID');}
        };
        const checkData=(data:any,isNew:boolean)=>{
          if(!data)return;
          if(scope!.collection==='financeTransactions'){add(data.occurredAt);add(data.competenceDate);}
          else if(scope!.collection==='financeJournalEntries')add(data.effectiveDate);
          else if(scope!.collection==='opening')add(data.openingBalanceDeclaration?.asOf);
          else if(scope!.collection==='countSessions'||scope!.collection==='countVerificationSessions')add(data.serviceDate);
          else if(scope!.collection==='financePayables')add(data.remittanceSource?.period?data.remittanceSource.period+'-01':data.recognitionDate||data.dueDate);
          else if(scope!.collection==='universalEvidence')add(data.createdAt,isNew);
          else if(data.statementDate)add(data.statementDate);
          else if(data.serviceDate)add(data.serviceDate);
        };
        checkData(old,false);checkData(after,!old);
        const pathParts=path.split('/');
        if(pathParts[2]==='financeEntities'&&pathParts.length>6&&['countSessions','countVerificationSessions','universalEvidence'].includes(pathParts[4])){const parent=await read(target.collection('organizations').doc(scope.org).collection('financeEntities').doc(scope.entity).collection(pathParts[4]).doc(pathParts[5]));if(parent.exists){add(parent.data()?.serviceDate);add(parent.data()?.createdAt);}}
        // Child artifacts inherit the canonical parent's date, never the caller's date.
        const sourceId=old?.transactionId||old?.activeTransactionId||after?.transactionId||after?.activeTransactionId;
        if(sourceId&&typeof sourceId==='string'){
          const source=await read(target.collection('organizations').doc(scope.org).collection('financeTransactions').doc(sourceId));
          if(!source.exists||source.data()?.financeEntityId!==scope.entity)fail('LEDGER_PERIOD_FENCE_SOURCE_INVALID');add(source.data()!.occurredAt);add(source.data()!.competenceDate);
        }
        let countId=old?.countSessionId||old?.sessionId||after?.countSessionId||after?.sessionId;
        if(!dates.length&&scope.collection==='countCaptureHashes'){
          if(old?.captureId&&after?.captureId&&old.captureId!==after.captureId)fail('LEDGER_PERIOD_FENCE_SOURCE_INVALID');
          const captureId=old?.captureId||after?.captureId;
          if(typeof captureId!=='string'||!captureId)fail('LEDGER_PERIOD_FENCE_SOURCE_INVALID');
          const capture=await read(target.collection('organizations').doc(scope.org).collection('financeEntities').doc(scope.entity).collection('countCaptures').doc(captureId));
          if(!capture.exists||capture.data()?.organizationId!==scope.org||capture.data()?.financeEntityId!==scope.entity)fail('LEDGER_PERIOD_FENCE_SOURCE_INVALID');
          countId=capture.data()?.countSessionId;
        }
        if(!dates.length&&countId&&typeof countId==='string'){
          for(const collection of ['countSessions','countVerificationSessions']){
            const source=await read(target.collection('organizations').doc(scope.org).collection('financeEntities').doc(scope.entity).collection(collection).doc(countId));
            if(source.exists){add(source.data()?.serviceDate);break;}
          }
        }
        const evidenceId=old?.evidenceId||after?.evidenceId;
        if(!dates.length&&evidenceId&&typeof evidenceId==='string'){
          const source=await read(target.collection('organizations').doc(scope.org).collection('financeEntities').doc(scope.entity).collection('universalEvidence').doc(evidenceId));
          if(source.exists)add(source.data()?.createdAt);
        }
        const reversal=scope.collection==='financeTransactions'&&old&&after&&newJournals.find(e=>e?.sourceKind==='transaction'&&e.sourceTransactionId===scope!.id&&e.reversalOfEntryId===old.journalEntryId&&e.effectiveDate?.slice(0,7)>state.closedThrough);
        const lifecycleOnly=reversal&&after.status==='reversed'&&['amountCents','occurredAt','competenceDate','accountId','sourceAccountId','destinationAccountId','paymentMethod','description','counterparty','approvalSourceHash','contentVersion'].every(k=>JSON.stringify(old[k])===JSON.stringify(after[k]));
        // A later certified payment may update only the lifecycle totals of an
        // old obligation. Creating/editing/reviewing a closed-month bill is blocked.
        const paymentFields=new Set(['paidCents','remainingCents','version','status','principalPaidCents','discountCents','feesPaidCents','updatedAt']);
        const payableLifecycle=scope.collection==='financePayables'&&old&&after&&old.postingPerformed===true&&
          [...new Set([...Object.keys(old),...Object.keys(after)])].every(k=>paymentFields.has(k)||JSON.stringify(old[k])===JSON.stringify(after[k]))&&
          writes.some(receipt=>receipt.args[0]?.path?.startsWith(path+'/paymentReceipts/')&&newJournals.some(e=>e?.sourceKind==='payable_payment'&&e.organizationId===scope!.org&&e.financeEntityId===scope!.entity&&e.sourceTransactionId===receipt.args[0].id&&e.effectiveDate?.slice(0,7)>state.closedThrough));
        if(!lifecycleOnly&&!payableLifecycle&&(!dates.length||dates.some(d=>d.slice(0,7)<=state.closedThrough)))fail();
      }
      // All supplemental fence reads above precede every physical write.
      for(const touchedState of touched.values()){const n=touchedState.value?.sourceRevision??0;if(!Number.isSafeInteger(n)||n<0||n===Number.MAX_SAFE_INTEGER)fail('LEDGER_STATE_INVALID');}
      for(const w of writes)(raw as any)[w.method](...w.args);
      for(const {ref,value,exists,org,entity} of touched.values()){
        const alreadyStaged=writes.some(w=>w.args[0]?.path===ref.path);
        raw.set(ref,{...(!exists&&!alreadyStaged?{organizationId:org,financeEntityId:entity,revision:0,entryCount:0,closedThrough:null}:{}),sourceRevision:(value?.sourceRevision??0)+1},{merge:true});
      }
      return result;
    },options);
  }});
  wrappers.set(db,wrapped);wrappers.set(wrapped,wrapped);return wrapped;
}
