import { assertFinanceCatalogScope } from './financeCatalogScope.js';
import type { VercelRequest,VercelResponse } from '@vercel/node';
import { assertBookScope } from '../../../shared/finance/ledger/certifiedPosting.js';
import { ledgerId } from '../../../shared/finance/ledger/certifiedConfiguration.js';
import { remittancePeriod } from '../../../shared/finance/remittancePolicy.js';
import { isValidIdempotencyKey,isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { hasEffectiveCapability,resolveFinanceRequestContext } from './accessHelpers.js';
import { remittancePolicyKey,loadRemittancePreview,stageRemittancePolicy,stageRemittanceAssessment } from './remittanceStore.js';
import { buildIdempotencyKeyHash,executeWithIdempotency,hashPayload } from './idempotencyHelper.js';
export default async function handler(req:VercelRequest,res:VercelResponse){
  res.setHeader('Cache-Control','private, no-store');if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  if(!String(req.headers['content-type']||'').includes('application/json'))return res.status(415).json({error:'UNSUPPORTED_MEDIA_TYPE'});
  const b=req.body,fields:Record<string,string[]>={options:['financeEntityId','action'],preview:['financeEntityId','action','period'],configure:['financeEntityId','action','input','expectedRevision','reason','requestId','idempotencyKey'],assess:['financeEntityId','action','period','fingerprint','language','reason','requestId','idempotencyKey'],replace:['financeEntityId','action','period','fingerprint','language','reason','requestId','idempotencyKey']};
  if(!b||typeof b!=='object'||Array.isArray(b)||JSON.stringify(b).length>8192||!ledgerId(b.financeEntityId)||!Object.hasOwn(fields,b.action)||Object.keys(b).some(k=>!fields[b.action].includes(k)))return res.status(400).json({error:'INVALID_PARAMETERS'});
  if(b.reason!==undefined&&(typeof b.reason!=='string'||b.reason.length>1000))return res.status(400).json({error:'INVALID_PARAMETERS'});
  const read=['options','preview'].includes(b.action);
  if(!read&&(!isValidIdempotencyKey(b.idempotencyKey)||!isValidRequestId(b.requestId)))return res.status(400).json({error:'INVALID_PARAMETERS'});
  if(b.action==='configure'&&(!Number.isSafeInteger(b.expectedRevision)||b.expectedRevision<0))return res.status(400).json({error:'INVALID_PARAMETERS'});
  if(['preview','assess','replace'].includes(b.action)&&!remittancePeriod(b.period))return res.status(400).json({error:'INVALID_PARAMETERS'});
  if(['assess','replace'].includes(b.action)&&(!['PT','EN','ES'].includes(b.language)||typeof b.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(b.fingerprint)))return res.status(400).json({error:'INVALID_PARAMETERS'});
  try{
    const a=await resolveFinanceRequestContext(req,['configure','replace'].includes(b.action)?'finance.manage':read?'finance.view':'finance.create_drafts');
    if(!hasEffectiveCapability(a.sessionList,'finance.balance.view'))return res.status(403).json({error:'FORBIDDEN'});
    const {db,uid,actorLabel,organizationId,financeEntityId,context}=a,org=db.collection('organizations').doc(organizationId);
    const c={db,uid,actorLabel,organizationId,financeEntityId,requestId:b.requestId||'readonly_remittances'};
    if(b.action==='options'){
      const [policy,categories]=await Promise.all([org.collection('financeSettings').doc(remittancePolicyKey(financeEntityId)).get(),context.repository.getCategoriesQuery().limit(201).get()]);
      if(policy.exists)assertBookScope(policy.data(),organizationId,financeEntityId);if(categories.size>200)throw Error('REMITTANCE_CATEGORY_LIMIT');
      return res.status(200).json({revision:policy.data()?.revision??0,policies:policy.data()?.policies||[],categories:categories.docs.flatMap(d=>{assertFinanceCatalogScope(d,organizationId,financeEntityId,'financeCategories');return d.data().active===true&&['income','expense'].includes(d.data().kind)?[{id:d.id,name:d.data().name,kind:d.data().kind}]:[];}),canConfigure:hasEffectiveCapability(a.sessionList,'finance.manage'),canAssess:hasEffectiveCapability(a.sessionList,'finance.create_drafts')&&process.env.NESTFINANCE_PAYABLES_WRITE_ENABLED==='true'});
    }
    if(b.action==='preview'){
      const p=await db.runTransaction(t=>loadRemittancePreview(t,c,b.period),{readOnly:true});
      return res.status(200).json({assessment:p.assessment,fingerprint:p.fingerprint,closedThrough:p.closedThrough,bookRevision:p.bookRevision,previous:p.previous?{revision:p.previous.revision,payableId:p.previous.payableId,fingerprint:p.previous.fingerprint,amountCents:p.previous.assessment.amountCents}:null,payable:p.payable?{id:p.payable.id,status:p.payable.status,postingPerformed:p.payable.postingPerformed}:null});
    }
    if(['assess','replace'].includes(b.action)&&process.env.NESTFINANCE_PAYABLES_WRITE_ENABLED!=='true')return res.status(503).json({error:'PAYABLES_CREATION_NOT_ENABLED'});
    const key=buildIdempotencyKeyHash(organizationId,financeEntityId,uid,'remittance_'+b.action,b.idempotencyKey),{requestId:_,idempotencyKey:__,...material}=b;
    return res.status(200).json(await executeWithIdempotency<any>(db,context.repository.getIdempotencyRef(),key,hashPayload(material),t=>b.action==='configure'?stageRemittancePolicy(t,c,b.input,b.expectedRevision,b.reason):stageRemittanceAssessment(t,c,b.period,b.fingerprint,b.reason,b.language,b.action==='replace')));
  }catch(e:any){
    // Preserve the shared atomic period-fence error at this HTTP boundary.
    if (e?.code === 'LEDGER_PERIOD_CLOSED' || String(e?.code || '').startsWith('LEDGER_PERIOD_FENCE_')) return res.status(409).json({ error: e.code });
const code=String(e?.error||e?.code||e?.message||'');
    if(e?.status===401||code.startsWith('auth/'))return res.status(401).json({error:'UNAUTHORIZED'});
    if(e?.status===403||code.includes('FORBIDDEN'))return res.status(403).json({error:'FORBIDDEN'});
    if(code.startsWith('LEDGER_')||code.startsWith('REMITTANCE_')||code.startsWith('FINANCE_IDEMPOTENCY_CONFLICT'))return res.status(409).json({error:code.split(':')[0]});
    console.error('Remittance request unavailable');return res.status(500).json({error:'REMITTANCE_UNAVAILABLE'});
  }
}
