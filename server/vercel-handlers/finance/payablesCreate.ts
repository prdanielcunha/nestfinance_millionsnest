import { randomBytes } from 'node:crypto';
import type { VercelRequest,VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { parsePayableDraft,buildUnpaidPayable } from '../../../shared/finance/payableObligation.js';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash,executeWithIdempotency,hashPayload } from './idempotencyHelper.js';
import { isValidIdempotencyKey,isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { stageCanonicalAuditCreate } from './auditFactProjection.js';

/**
 * The church has an unpaid bill. Never write to financeTransactions,
 * financeJournalEntries, financeAggregates or balances from this handler.
 * No user-provided status/paid amounts/account posting is accepted.
 */
export default async function handler(req:VercelRequest,res:VercelResponse) {
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  if(process.env.NESTFINANCE_PAYABLES_WRITE_ENABLED!=='true') {
    return res.status(503).json({error:'PAYABLES_CREATION_NOT_ENABLED'});
  }
  if(!String(req.headers['content-type']||'').includes('application/json'))
    return res.status(415).json({error:'UNSUPPORTED_MEDIA_TYPE'});
  const body=req.body;
  if(!body||typeof body!=='object'||Array.isArray(body)||
     JSON.stringify(body).length>8192||
     Object.keys(body).some(k=>!['financeEntityId','payload','idempotencyKey','requestId'].includes(k))){
    return res.status(400).json({error:'INVALID_PARAMETERS'});
  }
  const {financeEntityId,payload,idempotencyKey,requestId}=body;
  if(typeof financeEntityId!=='string'||! /^[a-zA-Z0-9_.-]{1,128}$/.test(financeEntityId)||
     !isValidIdempotencyKey(idempotencyKey)||!isValidRequestId(requestId)){
    return res.status(400).json({error:'INVALID_PARAMETERS'});
  }
  let draft;
  try{draft=parsePayableDraft(payload);}catch(error:any){
    return res.status(400).json({error:String(error.message||'PAYABLE_INVALID_BODY')});
  }
  try {
    const {db,uid,organizationId,context}=await resolveFinanceRequestContext(req,'finance.create_drafts');
    const orgRef=db.collection('organizations').doc(organizationId);
    const entityRef=orgRef.collection('financeEntities').doc(financeEntityId);
    const keyHash=buildIdempotencyKeyHash(organizationId,financeEntityId,uid,'payables_create',idempotencyKey);
    const payloadHash=hashPayload({draft,financeEntityId});
    const result=await executeWithIdempotency(db,context.repository.getIdempotencyRef(),keyHash,payloadHash,async transaction=>{
      const entity=await transaction.get(entityRef);
      if(!entity.exists||entity.data()?.active===false)throw Error('FINANCE_ENTITY_NOT_ACTIVE');
      const id='pay_'+randomBytes(16).toString('hex');
      const ref=entityRef.collection('financePayables').doc(id);
      const auditRef=context.repository.getAuditRef().doc();
      const record=buildUnpaidPayable(draft,organizationId,financeEntityId);
      transaction.create(ref,{...record,createdByUid:uid,createdAt:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp()});
      stageCanonicalAuditCreate(transaction,db,auditRef,{
        eventId:auditRef.id,organizationId,financeEntityId,
        actor:uid,action:'finance.payable.draft_created',resource:'finance_payable',resourceId:id,
        requestId,versionAfter:1,
        metadata:{status:'awaiting_review',financialMutation:false,postingPerformed:false},
        createdAt:FieldValue.serverTimestamp(),
      });
      return {id,financeEntityId,status:'awaiting_review',version:1,postingPerformed:false};
    });
    return res.status(201).json(result);
  }catch(error:any){
    const msg=String(error?.message||'');
    if(msg.includes('FINANCE_IDEMPOTENCY_CONFLICT'))return res.status(409).json({error:'FINANCE_IDEMPOTENCY_CONFLICT'});
    if(msg==='FINANCE_ENTITY_NOT_ACTIVE')return res.status(404).json({error:msg});
    if(error?.status===401||error?.code==='auth/id-token-expired')return res.status(401).json({error:'UNAUTHORIZED'});
    if(error?.status===403||msg==='FINANCE_ENTITY_MISMATCH'||msg==='FORBIDDEN_FINANCE_ACCESS'||msg==='COUNT_TEAM_TREASURY_ACCESS_FORBIDDEN')return res.status(403).json({error:'FORBIDDEN'});
    if(error?.status===404)return res.status(404).json({error:'FINANCE_ENTITY_NOT_FOUND'});
    console.error('Create unpaid payable failed',{type:msg.slice(0,80)});
    return res.status(500).json({error:'INTERNAL_SERVER_ERROR'});
  }
}
