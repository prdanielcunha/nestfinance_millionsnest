import type { VercelRequest,VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash,executeWithIdempotency,hashPayload } from './idempotencyHelper.js';
import { isValidIdempotencyKey,isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { stageCanonicalAuditCreate } from './auditFactProjection.js';

/**
 * T19: human authorization changes an unpaid obligation from
 * awaiting_review -> open. No cash movement, payment, journal or posting.
 * A second payment phase must use an independent ledger-certified endpoint.
 */
export default async function handler(req:VercelRequest,res:VercelResponse) {
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  if(process.env.NESTFINANCE_PAYABLES_REVIEW_ENABLED!=='true')
    return res.status(503).json({error:'PAYABLES_REVIEW_NOT_ENABLED'});
  if(!String(req.headers['content-type']||'').includes('application/json'))
    return res.status(415).json({error:'UNSUPPORTED_MEDIA_TYPE'});

  const b=req.body;
  if(!b||typeof b!=='object'||Array.isArray(b)||JSON.stringify(b).length>3072||
    Object.keys(b).some(k=>!['financeEntityId','payableId','expectedVersion','idempotencyKey','requestId'].includes(k)))
    return res.status(400).json({error:'INVALID_PARAMETERS'});
  const {financeEntityId,payableId,expectedVersion,idempotencyKey,requestId}=b;
  if(typeof financeEntityId!=='string'||! /^[a-zA-Z0-9_.-]{1,128}$/.test(financeEntityId)||
    typeof payableId!=='string'||!/^pay_[0-9a-f]{32}$/.test(payableId)||
    !Number.isSafeInteger(expectedVersion)||expectedVersion<1||expectedVersion>1_000_000||
    !isValidIdempotencyKey(idempotencyKey)||!isValidRequestId(requestId))
    return res.status(400).json({error:'INVALID_PARAMETERS'});

  try{
    const {db,uid,organizationId,context}=await resolveFinanceRequestContext(req,'finance.review');
    const entityRef=db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId);
    const payableRef=entityRef.collection('financePayables').doc(payableId);
    const keyHash=buildIdempotencyKeyHash(organizationId,financeEntityId,uid,
      'payables_review_open',idempotencyKey);
    const payloadHash=hashPayload({financeEntityId,payableId,expectedVersion,action:'approve_unpaid'});
    const outcome=await executeWithIdempotency(db,context.repository.getIdempotencyRef(),
      keyHash,payloadHash,async transaction=>{
        const [entitySnap,payableSnap]=await Promise.all([
          transaction.get(entityRef),transaction.get(payableRef),
        ]);
        if(!entitySnap.exists||entitySnap.data()?.active===false)
          throw Error('FINANCE_ENTITY_NOT_ACTIVE');
        if(!payableSnap.exists)throw Error('PAYABLE_NOT_FOUND');
        const payable=payableSnap.data()!;
        if(payable.organizationId!==organizationId||payable.financeEntityId!==financeEntityId)
          throw Error('PAYABLE_SCOPE_MISMATCH');
        if(payable.version!==expectedVersion)throw Error('PAYABLE_VERSION_CONFLICT');
        if(payable.status!=='awaiting_review'||payable.paidCents!==0||
          payable.remainingCents!==payable.amountCents||payable.postingPerformed!==false)
          throw Error('PAYABLE_REVIEW_STATE_CONFLICT');
        const auditRef=context.repository.getAuditRef().doc();
        transaction.update(payableRef,{
          status:'open',version:expectedVersion+1,
          reviewedByUid:uid,reviewedAt:FieldValue.serverTimestamp(),
          updatedAt:FieldValue.serverTimestamp(),
        });
        stageCanonicalAuditCreate(transaction,db,auditRef,{
          eventId:auditRef.id,organizationId,financeEntityId,
          actor:uid,action:'finance.payable.reviewed_unpaid',
          resource:'finance_payable',resourceId:payableId,requestId,
          versionBefore:expectedVersion,versionAfter:expectedVersion+1,
          metadata:{status:'open',paidCents:0,
            remainingCents:payable.amountCents,financialMutation:false,postingPerformed:false},
          createdAt:FieldValue.serverTimestamp(),
        });
        return {id:payableId,status:'open',version:expectedVersion+1,
          remainingCents:payable.amountCents,paidCents:0,postingPerformed:false};
      });
    return res.status(200).json(outcome);
  }catch(error:any){
    // Preserve the shared atomic period-fence error at this HTTP boundary.
    if (error?.code === 'LEDGER_PERIOD_CLOSED' || String(error?.code || '').startsWith('LEDGER_PERIOD_FENCE_')) return res.status(409).json({ error: error.code });

    const msg=String(error?.message||'');
    if(msg.includes('FINANCE_IDEMPOTENCY_CONFLICT')||
      ['PAYABLE_VERSION_CONFLICT','PAYABLE_REVIEW_STATE_CONFLICT'].includes(msg))
      return res.status(409).json({error:msg.includes('FINANCE_IDEMPOTENCY_CONFLICT')?'FINANCE_IDEMPOTENCY_CONFLICT':msg});
    if(['PAYABLE_SCOPE_MISMATCH','FORBIDDEN_FINANCE_ACCESS','FINANCE_ENTITY_MISMATCH',
      'COUNT_TEAM_TREASURY_ACCESS_FORBIDDEN'].includes(msg)||error?.status===403)
      return res.status(403).json({error:'FORBIDDEN'});
    if(msg==='PAYABLE_NOT_FOUND'||msg==='FINANCE_ENTITY_NOT_ACTIVE'||error?.status===404)
      return res.status(404).json({error:'PAYABLE_NOT_FOUND'});
    if(error?.status===401||error?.code==='auth/id-token-expired')
      return res.status(401).json({error:'UNAUTHORIZED'});
    console.error('Review unpaid bill unavailable',{type:msg.slice(0,60)});
    return res.status(500).json({error:'INTERNAL_SERVER_ERROR'});
  }
}
