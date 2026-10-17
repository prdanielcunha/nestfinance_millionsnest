import type { VercelRequest,VercelResponse } from '@vercel/node';
import { FieldPath } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';

/** T19 read-only paged list of unpaid obligation drafts. Never a payment ledger. */
export default async function handler(req:VercelRequest,res:VercelResponse){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  if(process.env.NESTFINANCE_PAYABLE_DRAFTS_ENABLED!=='true') {
    return res.status(503).json({error:'PAYABLE_DRAFTS_NOT_ENABLED'});
  }
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
    Object.keys(req.body).some((key:string)=>!['financeEntityId','afterDueDate','afterId'].includes(key))){
    return res.status(400).json({error:'INVALID_PARAMETERS'});
  }
  const {financeEntityId,afterDueDate,afterId}=req.body;
  if(typeof financeEntityId!=='string'||financeEntityId.length<1||financeEntityId.length>128||
    ((afterDueDate!==undefined||afterId!==undefined)&&
      (typeof afterDueDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(afterDueDate)||
        typeof afterId!=='string'||!/^obl_[a-f0-9]{32}$/.test(afterId)))){
    return res.status(400).json({error:'INVALID_PARAMETERS'});
  }
  try{
    const {db,organizationId,context}=await resolveFinanceRequestContext(req,'finance.view');
    let query=db.collection('organizations').doc(organizationId)
      .collection('financeObligations')
      .where('financeEntityId','==',financeEntityId)
      .orderBy('dueDate','asc').orderBy(FieldPath.documentId(),'asc');
    if(afterDueDate!==undefined&&afterId!==undefined){
      query=query.startAfter(afterDueDate,afterId);
    }
    const snapshot=await query.limit(26).get();
    const results=snapshot.docs.slice(0,25).map(d=>{
      const data=d.data();
      context.repository.assertEntityIsolation(data);
      return {
        id:d.id,description:String(data.description||''),
        amountCents:data.amountCents,amountPaidCents:data.amountPaidCents,
        outstandingCents:data.outstandingCents,
        currency:'BRL',dueDate:data.dueDate,competenceDate:data.competenceDate||null,
        payeeName:typeof data.payeeName==='string'?data.payeeName:null,
        categoryId:typeof data.categoryId==='string'?data.categoryId:null,
        status:data.status,version:data.version,financialPostingPerformed:false,
      };
    });
    const hasMore=snapshot.docs.length>25;
    const last=results.at(-1);
    return res.status(200).json({
      items:results,hasMore,
      nextCursor:hasMore&&last?{afterDueDate:last.dueDate,afterId:last.id}:null,
      financialPostingPerformed:false,
    });
  }catch(error:any){
    if([401,403,404].includes(error?.status)){
      return res.status(error.status).json({error:error.error||'FORBIDDEN'});
    }
    const msg=String(error?.message||'');
    if(msg==='FINANCE_ENTITY_MISMATCH'||msg==='FORBIDDEN_FINANCE_ACCESS'||msg==='Session not granted') {
      return res.status(403).json({error:'FORBIDDEN'});
    }
    if(msg==='FINANCE_ENTITY_NOT_FOUND')return res.status(404).json({error:msg});
    console.error('Payable list unavailable',{reason:msg.slice(0,72)});
    return res.status(500).json({error:'INTERNAL_SERVER_ERROR'});
  }
}
