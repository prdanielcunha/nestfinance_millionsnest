import { randomBytes } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { executeWithIdempotency,buildIdempotencyKeyHash,hashPayload } from './idempotencyHelper.js';
import { isValidIdempotencyKey,isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { normalizePayableDraftInput } from '../../../shared/finance/payableDraft.js';
import { stageCanonicalAuditCreate } from './auditFactProjection.js';

/**
 * T18: "Ainda vou pagar". Recording a bill is never treated as paying it.
 * Server-only financeObligations record, pending review. No journal, ledger,
 * transfers, cash effects, paid flags or bank posting.
 */
export default async function handler(req:VercelRequest,res:VercelResponse){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  if(process.env.NESTFINANCE_PAYABLE_DRAFTS_ENABLED!=='true') {
    return res.status(503).json({error:'PAYABLE_DRAFTS_NOT_ENABLED'});
  }
  if(typeof req.headers['content-type']!=='string'||!req.headers['content-type'].includes('application/json')){
    return res.status(415).json({error:'UNSUPPORTED_MEDIA_TYPE'});
  }
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
      Object.keys(req.body).some((key:string)=>!['financeEntityId','draft','idempotencyKey','requestId'].includes(key))){
    return res.status(400).json({error:'INVALID_PARAMETERS'});
  }
  const {financeEntityId,draft,idempotencyKey,requestId}=req.body;
  if(typeof financeEntityId!=='string'||financeEntityId.length<1||financeEntityId.length>128||
      !isValidIdempotencyKey(idempotencyKey)||!isValidRequestId(requestId)){
    return res.status(400).json({error:'INVALID_PARAMETERS'});
  }
  let normalized;
  try{normalized=normalizePayableDraftInput(draft);}
  catch(e:any){return res.status(400).json({error:String(e.message).startsWith('PAYABLE_')?e.message:'PAYABLE_INVALID_PAYLOAD'});}
  try{
    const {db,uid,organizationId,context}=await resolveFinanceRequestContext(req,'finance.create_drafts');
    const keyHash=buildIdempotencyKeyHash(organizationId,financeEntityId,uid,'payable_create_draft',idempotencyKey);
    const payloadHash=hashPayload({financeEntityId,draft:normalized});
    const orgRef=db.collection('organizations').doc(organizationId);
    const payableId='obl_'+randomBytes(16).toString('hex');
    const payableRef=orgRef.collection('financeObligations').doc(payableId);
    const auditRef=context.repository.getAuditRef().doc();
    const result=await executeWithIdempotency(db,context.repository.getIdempotencyRef(),keyHash,payloadHash,async tx=>{
      if(normalized.categoryId){
        const category=await tx.get(context.repository.getCategoriesRef().doc(normalized.categoryId));
        const data=category.data();
        if(!category.exists||!data||data.financeEntityId!==financeEntityId||
            data.organizationId!==organizationId||data.active===false||data.kind!=='expense'){
          throw Error('PAYABLE_CATEGORY_NOT_AVAILABLE');
        }
      }
      const data={
        ...normalized,organizationId,financeEntityId,
        id:payableId,version:1,schemaVersion:1,
        createdByUid:uid,createdAt:FieldValue.serverTimestamp(),
        updatedByUid:uid,updatedAt:FieldValue.serverTimestamp(),
      };
      tx.create(payableRef,data);
      stageCanonicalAuditCreate(tx,db,auditRef,{
        organizationId,financeEntityId,entityType:'financeObligation',entityId:payableId,
        actorUid:uid,action:'finance.obligation_draft_created',
        requestId,idempotencyKey,versionAfter:1,schemaVersion:1,
        details:{status:'draft',financialPostingPerformed:false},
        createdAt:FieldValue.serverTimestamp(),
      });
      return {payableId,financeEntityId,status:'draft' as const,version:1,financialPostingPerformed:false as const};
    });
    return res.status(201).json(result);
  }catch(error:any){
    if(error?.status===401||error?.status===403||error?.status===404) {
      return res.status(error.status).json({error:error.error||'FORBIDDEN'});
    }
    const msg=String(error?.message||'');
    if(msg.includes('FINANCE_IDEMPOTENCY_CONFLICT'))return res.status(409).json({error:'PAYABLE_IDEMPOTENCY_CONFLICT'});
    if(msg==='PAYABLE_CATEGORY_NOT_AVAILABLE')return res.status(400).json({error:msg});
    if(msg==='FINANCE_ENTITY_MISMATCH'||msg==='FORBIDDEN_FINANCE_ACCESS'||msg==='Session not granted'){
      return res.status(403).json({error:'FORBIDDEN'});
    }
    if(msg==='FINANCE_ENTITY_NOT_FOUND')return res.status(404).json({error:msg});
    console.error('Payable create unavailable',{reason:msg.slice(0,72)});
    return res.status(500).json({error:'INTERNAL_SERVER_ERROR'});
  }
}
