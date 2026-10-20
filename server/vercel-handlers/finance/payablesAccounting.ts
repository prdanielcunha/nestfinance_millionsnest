import type { VercelRequest,VercelResponse } from '@vercel/node';
import { FieldPath } from 'firebase-admin/firestore';
import { hasEffectiveCapability,resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash,executeWithIdempotency,hashPayload } from './idempotencyHelper.js';
import { isValidIdempotencyKey,isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { assertBookScope,bookId } from '../../../shared/finance/ledger/certifiedPosting.js';
import { ledgerFailure,ledgerId } from '../../../shared/finance/ledger/certifiedConfiguration.js';
import { payablePolicyReferences,type PayableAccountingPolicy,type PayablePaymentInput } from '../../../shared/finance/payableSettlement.js';
import { loadCertifiedLedgerConfiguration } from './certifiedLedgerConfiguration.js';
import { payablePolicyKey,stagePayableRecognition,stagePayablePayment,stagePayablePaymentReversal } from './payableSettlementStore.js';

/** Record an already-performed payment. No bank/PSP API or transfer is invoked. */
export default async function handler(req:VercelRequest,res:VercelResponse){
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  if(!String(req.headers['content-type']||'').includes('application/json'))return res.status(415).json({error:'UNSUPPORTED_MEDIA_TYPE'});
  const b=req.body;
  if(!b||typeof b!=='object'||Array.isArray(b)||JSON.stringify(b).length>8192||!ledgerId(b.financeEntityId))return res.status(400).json({error:'INVALID_PARAMETERS'});
  const fields:Record<string,string[]>={
    options:['financeEntityId','action'],history:['financeEntityId','action','payableId','afterId'],
    recognize:['financeEntityId','action','payableId','expectedVersion','classification','idempotencyKey','requestId'],
    payment:['financeEntityId','action','payableId','expectedVersion','input','idempotencyKey','requestId'],
    reverse:['financeEntityId','action','payableId','expectedVersion','paymentId','reversalDate','reason','idempotencyKey','requestId'],
  };
  if(typeof b.action!=='string'||!Object.hasOwn(fields,b.action)||Object.keys(b).some(k=>!fields[b.action].includes(k)))return res.status(400).json({error:'INVALID_PARAMETERS'});
  const read=b.action==='options'||b.action==='history';
  if(b.action!=='options'&&!/^pay_[a-f0-9]{32}$/.test(b.payableId))return res.status(400).json({error:'INVALID_PARAMETERS'});
  if(!read&&(!Number.isSafeInteger(b.expectedVersion)||b.expectedVersion<1||!isValidIdempotencyKey(b.idempotencyKey)||!isValidRequestId(b.requestId)))return res.status(400).json({error:'INVALID_PARAMETERS'});
  if(b.action==='recognize'&&(!b.classification||typeof b.classification!=='object'||Array.isArray(b.classification)||Object.keys(b.classification).some(k=>!['categoryId','fundId','recognitionDate'].includes(k))||!ledgerId(b.classification.categoryId)))return res.status(400).json({error:'INVALID_PARAMETERS'});
  if(b.action==='payment'&&(!b.input||typeof b.input!=='object'||Array.isArray(b.input)||Object.keys(b.input).some(k=>!['accountId','principalCents','feesCents','discountCents','paidOn','reference','evidenceIds','evidenceJustification'].includes(k))))return res.status(400).json({error:'INVALID_PARAMETERS'});
  try{
    const access=await resolveFinanceRequestContext(req,read?'finance.view':b.action==='reverse'?'finance.manage':'finance.approve_for_posting');
    const {db,organizationId,financeEntityId,uid,context,sessionList}=access;
    const org=db.collection('organizations').doc(organizationId),entity=org.collection('financeEntities').doc(financeEntityId);
    if(b.action==='options'){
      const configured=await org.collection('financeSettings').doc(payablePolicyKey(financeEntityId)).get();
      if(!configured.exists)return res.status(200).json({state:'setup_required',accounts:[],categories:[],canRecord:false,canReverse:false,canConfigure:hasEffectiveCapability(sessionList,'finance.manage'),feesSupported:false,discountSupported:false});
      assertBookScope(configured.data(),organizationId,financeEntityId);
      const loaded=await loadCertifiedLedgerConfiguration(db,organizationId,financeEntityId);
      const policy=payablePolicyReferences({configuration:loaded.configuration,policy:configured.data()!.policy as PayableAccountingPolicy,organizationId,financeEntityId,actor:uid,postedAt:new Date().toISOString()});
      const accounts=[] as Array<{id:string;name:string}>,categories=[] as Array<{id:string;name:string}>;
      for(const mapping of loaded.configuration.financeAccounts.filter(a=>a.type==='asset')){
        const [a,balance]=await Promise.all([org.collection('financeAccounts').doc(mapping.accountId).get(),org.collection('financeAggregates').doc('ledger_account_'+bookId(financeEntityId,mapping.accountId)).get()]);
        if(!balance.exists||balance.data()?.openingVerified!==true)continue;
        assertBookScope(balance.data(),organizationId,financeEntityId);
        accounts.push({id:a.id,name:String(a.data()?.name||a.id).slice(0,120)});
      }
      for(const mapping of loaded.configuration.categories.filter(c=>c.kind==='expense')){
        const category=await org.collection('financeCategories').doc(mapping.categoryId).get();
        categories.push({id:category.id,name:String(category.data()?.name||category.id).slice(0,120)});
      }
      return res.status(200).json({state:accounts.length?'ready':'opening_required',accounts,categories,
        canRecord:hasEffectiveCapability(sessionList,'finance.approve_for_posting'),canReverse:hasEffectiveCapability(sessionList,'finance.manage'),canConfigure:hasEffectiveCapability(sessionList,'finance.manage'),feesSupported:Boolean(policy.fees),discountSupported:Boolean(policy.discount)});
    }
    if(b.action==='history'){
      const ref=entity.collection('financePayables').doc(b.payableId),p=await ref.get();
      if(!p.exists)ledgerFailure('PAYABLE_NOT_FOUND');assertBookScope(p.data(),organizationId,financeEntityId);
      if(b.afterId!==undefined&&!ledgerId(b.afterId))return res.status(400).json({error:'INVALID_PARAMETERS'});
      let query=ref.collection('paymentReceipts').orderBy(FieldPath.documentId());if(b.afterId)query=query.startAfter(b.afterId);
      const page=await query.limit(26).get(),items=[];
      for(const row of page.docs.slice(0,25)){
        const r=row.data();assertBookScope(r,organizationId,financeEntityId);
        if(r.id!==row.id||r.payableId!==b.payableId)ledgerFailure('PAYABLE_PAYMENT_RECEIPT_INVALID');
        const reversed=await ref.collection('paymentReversals').doc(row.id).get();
        if(reversed.exists)assertBookScope(reversed.data(),organizationId,financeEntityId);
        items.push({id:row.id,principalCents:r.principalCents,feesCents:r.feesCents,discountCents:r.discountCents,cashOutCents:r.cashOutCents,paidOn:r.paidOn,reference:r.reference,reversed:reversed.exists});
      }
      return res.status(200).json({items,hasMore:page.size>25,nextCursor:page.size>25?items[items.length-1].id:null});
    }
    const key=buildIdempotencyKeyHash(organizationId,financeEntityId,uid,'payable_'+b.action,b.idempotencyKey);
    const {idempotencyKey:_,requestId:__,...material}=b;
    const command={db,organizationId,financeEntityId,uid,requestId:b.requestId};
    const outcome=await executeWithIdempotency(db,context.repository.getIdempotencyRef(),key,hashPayload(material),async t=>{
      if(b.action==='recognize')return stagePayableRecognition(t,command,b.payableId,b.expectedVersion,b.classification);
      if(b.action==='payment')return stagePayablePayment(t,command,b.payableId,b.expectedVersion,'payment_'+bookId(key),b.input as PayablePaymentInput);
      return stagePayablePaymentReversal(t,command,b.payableId,b.expectedVersion,b.paymentId,b.reversalDate,b.reason);
    });
    return res.status(200).json(outcome);
  }catch(error:any){
    // Preserve the shared atomic period-fence error at this HTTP boundary.
    if (error?.code === 'LEDGER_PERIOD_CLOSED' || String(error?.code || '').startsWith('LEDGER_PERIOD_FENCE_')) return res.status(409).json({ error: error.code });

    const code=String(error?.code||error?.error||error?.message||'');
    if(error?.status===401||code.startsWith('auth/'))return res.status(401).json({error:'UNAUTHORIZED'});
    if(error?.status===403||code.includes('FORBIDDEN')||code.includes('COUNT_TEAM'))return res.status(403).json({error:'FORBIDDEN'});
    if(code==='PAYABLE_NOT_FOUND'||code==='PAYABLE_PAYMENT_NOT_FOUND')return res.status(404).json({error:code});
    if(code==='FINANCE_ENTITY_NOT_ACTIVE')return res.status(404).json({error:code});
    if(code.startsWith('PAYABLE_')||code.startsWith('LEDGER_')||code.startsWith('FINANCE_IDEMPOTENCY_CONFLICT'))return res.status(409).json({error:code.split(':')[0]});
    console.error('Payable accounting unavailable',{code:code.slice(0,80)});
    return res.status(500).json({error:'INTERNAL_SERVER_ERROR'});
  }
}
