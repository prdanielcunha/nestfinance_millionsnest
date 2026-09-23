import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext } from './accessHelpers.js';

export default async function handler(req:VercelRequest,res:VercelResponse){
  if(req.method!=='POST') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  try{
    const {financeEntityId,correctionId}=req.body||{};
    if(typeof financeEntityId!=='string'||typeof correctionId!=='string'||!/^[a-f0-9]{32}$/.test(correctionId)) return res.status(400).json({error:'INVALID_PARAMETERS'});
    const {db,organizationId}=await resolveFinanceRequestContext(req,'finance.review');
    await db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId)
      .collection('intelligenceCorrections').doc(correctionId).delete();
    return res.status(200).json({correctionId,removed:true});
  }catch(error:any){
    const message=String(error?.message||'');
    if(message==='FORBIDDEN_FINANCE_ACCESS'||message==='Session not granted') return res.status(403).json({error:'FORBIDDEN'});
    if(error?.status) return res.status(error.status).json({error:error.error||'UNAUTHORIZED'});
    return res.status(500).json({error:'INTERNAL_SERVER_ERROR'});
  }
}
