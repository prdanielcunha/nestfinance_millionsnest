import type { VercelRequest,VercelResponse } from '@vercel/node';
import { hasEffectiveCapability,resolveFinanceRequestContext } from './accessHelpers.js';
import { isValidIdempotencyKey,isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { ledgerId,ledgerConfigurationKey } from '../../../shared/finance/ledger/certifiedConfiguration.js';
import { assertBookScope } from '../../../shared/finance/ledger/certifiedPosting.js';
import { remittancePeriod } from '../../../shared/finance/remittancePolicy.js';
import { readLedgerState,ledgerPeriodRef } from './certifiedLedgerStore.js';
import { loadFormalClose,stageFormalClose,stageFormalReopen,readClosedReport } from './formalPeriodCloseStore.js';
import { buildIdempotencyKeyHash,executeWithIdempotency,hashPayload } from './idempotencyHelper.js';
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','private, no-store');if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 if(!String(req.headers['content-type']||'').includes('application/json'))return res.status(415).json({error:'UNSUPPORTED_MEDIA_TYPE'});
 const b=req.body,fields:Record<string,string[]>={status:['financeEntityId','action','period'],preview:['financeEntityId','action','period'],snapshot:['financeEntityId','action','period','snapshotId'],history:['financeEntityId','action','period','beforeVersion'],close:['financeEntityId','action','period','fingerprint','reason','idempotencyKey','requestId'],reopen:['financeEntityId','action','period','expectedVersion','reason','idempotencyKey','requestId']};
 if(!b||typeof b!=='object'||Array.isArray(b)||JSON.stringify(b).length>4096||!ledgerId(b.financeEntityId)||!remittancePeriod(b.period)||!Object.hasOwn(fields,b.action)||Object.keys(b).some(k=>!fields[b.action].includes(k)))return res.status(400).json({error:'INVALID_PARAMETERS'});
 const mutation=['close','reopen'].includes(b.action);
 if(mutation&&(!isValidIdempotencyKey(b.idempotencyKey)||!isValidRequestId(b.requestId)))return res.status(400).json({error:'INVALID_PARAMETERS'});
 if(b.action==='close'&&(typeof b.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(b.fingerprint))||b.action==='reopen'&&(!Number.isSafeInteger(b.expectedVersion)||b.expectedVersion<1)||b.snapshotId!==undefined&&!/^close_[a-f0-9]{64}$/.test(b.snapshotId)||b.beforeVersion!==undefined&&(!Number.isSafeInteger(b.beforeVersion)||b.beforeVersion<1))return res.status(400).json({error:'INVALID_PARAMETERS'});
 try{
   const a=await resolveFinanceRequestContext(req,mutation?'finance.manage':'finance.view');
   if(!hasEffectiveCapability(a.sessionList,'finance.balance.view')||!hasEffectiveCapability(a.sessionList,'finance.accountant.view_exports'))return res.status(403).json({error:'FORBIDDEN'});
   const {db,uid,actorLabel,organizationId,financeEntityId,context}=a,c={db,uid,actorLabel,organizationId,financeEntityId,requestId:b.requestId||'readonly_formal_close'};
   if(b.action==='status'){
     const result=await db.runTransaction(async t=>{const state=await readLedgerState(t,c),period=await t.get(ledgerPeriodRef(db,organizationId,financeEntityId,b.period));if(period.exists)assertBookScope(period.data(),organizationId,financeEntityId);
       const cfg=await t.get(db.collection('organizations').doc(organizationId).collection('financeSettings').doc(ledgerConfigurationKey(financeEntityId)));if(cfg.exists)assertBookScope(cfg.data(),organizationId,financeEntityId);
       const r=period.data();return {period:b.period,status:r?.status||'open',version:r?.version??0,snapshotId:r?.snapshotId||null,closedThrough:state.value.closedThrough,firstPeriod:cfg.data()?.configuration?.firstPeriod||null,closedAt:r?.closedAt?.toDate?.().toISOString()||null,closedByLabel:r?.closedByLabel||'',canManage:hasEffectiveCapability(a.sessionList,'finance.manage')};},{readOnly:true});return res.status(200).json(result);
   }
   if(b.action==='preview'){
     const p=await db.runTransaction(t=>loadFormalClose(t,c,b.period),{readOnly:true});
     return res.status(200).json({period:b.period,fingerprint:p.fingerprint,summary:p.summary,totals:p.report.totals,blockers:p.blockers,canClose:p.canClose,version:p.record?.version??0});
   }
   if(b.action==='snapshot')return res.status(200).json(await db.runTransaction(t=>readClosedReport(t,c,b.period,b.snapshotId),{readOnly:true}));
   if(b.action==='history'){
     let query=ledgerPeriodRef(db,organizationId,financeEntityId,b.period).collection('snapshots').orderBy('version','desc');if(b.beforeVersion)query=query.startAfter(b.beforeVersion);
     const rows=await query.limit(21).get();const items=rows.docs.slice(0,20).map(d=>{const r=d.data();assertBookScope(r,organizationId,financeEntityId);return {snapshotId:d.id,version:r.version,closedAt:r.closedAt.toDate().toISOString(),closedByLabel:r.closedByLabel,reason:r.reason,manifestHash:r.manifestHash};});
     return res.status(200).json({items,hasMore:rows.size>20,nextCursor:rows.size>20?items.at(-1)!.version:null});
   }
   const key=buildIdempotencyKeyHash(organizationId,financeEntityId,uid,'formal_period_'+b.action,b.idempotencyKey),{requestId:_,idempotencyKey:__,...material}=b;
   return res.status(200).json(await executeWithIdempotency<any>(db,context.repository.getIdempotencyRef(),key,hashPayload(material),t=>b.action==='close'?stageFormalClose(t,c,b.period,b.fingerprint,b.reason):stageFormalReopen(t,c,b.period,b.expectedVersion,b.reason)));
 }catch(e:any){
    // Preserve the shared atomic period-fence error at this HTTP boundary.
    if (e?.code === 'LEDGER_PERIOD_CLOSED' || String(e?.code || '').startsWith('LEDGER_PERIOD_FENCE_')) return res.status(409).json({ error: e.code });
const code=String(e?.error||e?.code||e?.message||'');
   if(e?.status===401||code.startsWith('auth/'))return res.status(401).json({error:'UNAUTHORIZED'});
   if(e?.status===403||code.includes('FORBIDDEN'))return res.status(403).json({error:'FORBIDDEN'});
   if(code.startsWith('PERIOD_')||code.startsWith('LEDGER_')||code.startsWith('REMITTANCE_')||code.startsWith('FINANCE_IDEMPOTENCY_CONFLICT'))return res.status(409).json({error:code.split(':')[0]});
   console.error('Formal period close unavailable',{code:code.slice(0,80)});return res.status(500).json({error:'PERIOD_CLOSE_UNAVAILABLE'});
 }
}
