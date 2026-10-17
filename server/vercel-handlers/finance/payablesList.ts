import type { VercelRequest,VercelResponse } from '@vercel/node';
import { FieldPath } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';

/** Private, cursor-based read: returns explicitly unpaid/awaiting review bills only. */
export default async function handler(req:VercelRequest,res:VercelResponse){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  const body=req.body;
  if(!body||typeof body!=='object'||Array.isArray(body)||
     JSON.stringify(body).length>2048||
     Object.keys(body).some(k=>!['financeEntityId','afterId'].includes(k))){
    return res.status(400).json({error:'INVALID_PARAMETERS'});
  }
  const {financeEntityId,afterId}=body;
  if(typeof financeEntityId!=='string'||! /^[a-zA-Z0-9_.-]{1,128}$/.test(financeEntityId)||
    (afterId!==undefined&&(typeof afterId!=='string'||! /^pay_[0-9a-f]{32}$/.test(afterId)))){
    return res.status(400).json({error:'INVALID_PARAMETERS'});
  }
  try{
    const {db,organizationId}=await resolveFinanceRequestContext(req,'finance.view');
    const collection=db.collection('organizations').doc(organizationId)
      .collection('financeEntities').doc(financeEntityId).collection('financePayables');
    let query=collection.orderBy(FieldPath.documentId());
    if(afterId)query=query.startAfter(afterId);
    const snapshot=await query.limit(26).get();
    const items=snapshot.docs.slice(0,25).map(doc=>{
      const data=doc.data();
      // No permissive filtering: corrupt tenant scope is an integrity error,
      // and must never leak a foreign bill.
      if(data.financeEntityId!==financeEntityId||data.organizationId!==organizationId) {
        throw Error('PAYABLE_INTEGRITY_SCOPE_MISMATCH');
      }
      return {
        id:doc.id,description:data.description,counterparty:data.counterparty,
        amountCents:data.amountCents,dueDate:data.dueDate,status:data.status,
        paidCents:data.paidCents,remainingCents:data.remainingCents,
        documentReference:data.documentReference??null,notes:data.notes??null,
        version:data.version,
        postingPerformed:false as const,
      };
    });
    const hasMore=snapshot.docs.length>25;
    return res.status(200).json({
      financeEntityId,items,hasMore,
      creationEnabled:process.env.NESTFINANCE_PAYABLES_WRITE_ENABLED==='true',
      reviewEnabled:process.env.NESTFINANCE_PAYABLES_REVIEW_ENABLED==='true',
      nextCursor:hasMore&&items.length>0?items[items.length-1].id:null,
      postingPerformed:false,
    });
  }catch(error:any){
    const msg=String(error?.message||'');
    if(error?.status===401||error?.code==='auth/id-token-expired')return res.status(401).json({error:'UNAUTHORIZED'});
    if(error?.status===403||msg==='FORBIDDEN_FINANCE_ACCESS'||msg==='FINANCE_ENTITY_MISMATCH'||msg==='COUNT_TEAM_TREASURY_ACCESS_FORBIDDEN')return res.status(403).json({error:'FORBIDDEN'});
    if(msg==='PAYABLE_INTEGRITY_SCOPE_MISMATCH')return res.status(409).json({error:msg});
    if(error?.status===404||msg==='FINANCE_ENTITY_NOT_FOUND')return res.status(404).json({error:'FINANCE_ENTITY_NOT_FOUND'});
    console.error('Read unpaid payables failed',{type:msg.slice(0,80)});
    return res.status(500).json({error:'INTERNAL_SERVER_ERROR'});
  }
}
