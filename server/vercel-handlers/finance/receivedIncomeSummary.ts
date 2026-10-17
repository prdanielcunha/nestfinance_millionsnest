import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildReceivedIncome, validReceiptDate, type ReceiptInput } from '../../../shared/finance/receivedIncome.js';
import { resolveFinanceRequestContext } from './accessHelpers.js';

export const MAX_RECEIPT_SOURCE_RECORDS = 5000;
export default async function handler(req:VercelRequest,res:VercelResponse){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  try{
    const {db,organizationId,context}=await resolveFinanceRequestContext(req,'finance.view');
    const {startDate,endDate}=req.body||{};
    if(!validReceiptDate(startDate)||!validReceiptDate(endDate)||startDate>endDate)return res.status(400).json({error:'INVALID_RECEIPTS_PERIOD'});
    // Full bounded source avoids silently missing legacy records with no derived index.
    const [snapshot,settings]=await Promise.all([
      context.repository.getTransactionsQuery().limit(MAX_RECEIPT_SOURCE_RECORDS+1).get(),
      db.collection('organizations').doc(organizationId).collection('financeSettings').doc('config').get(),
    ]);
    if(snapshot.size>MAX_RECEIPT_SOURCE_RECORDS)return res.status(422).json({error:'RECEIPTS_SOURCE_TOO_LARGE'});
    const config=settings.data();
    if(config?.organizationId&&config.organizationId!==organizationId)return res.status(403).json({error:'FORBIDDEN'});
    const timezone=config?.timezone||'America/Sao_Paulo';
    try{new Intl.DateTimeFormat('en-US',{timeZone:timezone}).format();}catch{return res.status(409).json({error:'INVALID_FINANCE_TIMEZONE'});}
    const transactions:ReceiptInput[]=snapshot.docs.map((doc:any)=>{
      const data=doc.data();context.repository.assertEntityIsolation(data);
      return {id:doc.id,transactionKind:data.transactionKind,status:data.status,amountCents:data.amountCents,currency:data.currency,
        occurredAt:typeof data.occurredAt?.toDate==='function'?data.occurredAt.toDate().toISOString():data.occurredAt,
        paymentMethod:data.paymentMethod,countSource:data.countSource};
    });
    return res.status(200).json(buildReceivedIncome({startDate,endDate,timezone,transactions}));
  }catch(error:any){
    if(error?.status)return res.status(error.status).json({error:error.error||'RECEIPTS_SCOPE_ERROR'});
    if(['FORBIDDEN_FINANCE_ACCESS','Session not granted'].includes(error?.message))return res.status(403).json({error:'FORBIDDEN'});
    if(['auth/id-token-expired','auth/invalid-id-token','auth/id-token-revoked'].includes(error?.code))return res.status(401).json({error:'UNAUTHORIZED'});
    console.error('Received income summary failed');return res.status(500).json({error:'RECEIPTS_SUMMARY_FAILED'});
  }
}
