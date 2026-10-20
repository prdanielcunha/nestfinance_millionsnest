import type { VercelRequest,VercelResponse } from '@vercel/node';
import { hasEffectiveCapability,resolveFinanceRequestContext } from './accessHelpers.js';
import { parsePeriod } from './periodCloseReadModel.js';
import { ledgerId } from '../../../shared/finance/ledger/certifiedConfiguration.js';
import { loadCertifiedBookReadModel } from './certifiedBookReadModel.js';
import { deliverCertifiedReport } from '../../../shared/finance/ledger/certifiedReportDelivery.js';

/** Read-only, one consistent snapshot, no partial accounting totals. */
export default async function handler(req:VercelRequest,res:VercelResponse){
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  if(!String(req.headers['content-type']||'').includes('application/json'))return res.status(415).json({error:'UNSUPPORTED_MEDIA_TYPE'});
  const b=req.body,period=parsePeriod(b?.period);
  if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['financeEntityId','period'].includes(k))||!ledgerId(b.financeEntityId)||!period)return res.status(400).json({error:'INVALID_PARAMETERS'});
  try{
    const access=await resolveFinanceRequestContext(req,'finance.view');
    // A general treasury read never authorizes account balances or accounting exports.
    if(!hasEffectiveCapability(access.sessionList,'finance.balance.view')||
      !hasEffectiveCapability(access.sessionList,'finance.accountant.view_exports'))return res.status(403).json({error:'FORBIDDEN'});
    const {db,organizationId,financeEntityId,uid}=access;
    const report=await db.runTransaction(t=>loadCertifiedBookReadModel(t,{db,organizationId,financeEntityId,uid,requestId:'readonly_certified_report'},period.startDate,period.endDateExclusive),{readOnly:true});
    return res.status(200).json(deliverCertifiedReport(report));
  }catch(error:any){
    const code=String(error?.error||error?.code||error?.message||'');
    if(error?.status===401||code.startsWith('auth/'))return res.status(401).json({error:'UNAUTHORIZED'});
    if(error?.status===403||code.includes('FORBIDDEN')||code.includes('COUNT_TEAM'))return res.status(403).json({error:'FORBIDDEN'});
    if(code==='FINANCE_ENTITY_NOT_ACTIVE'||code==='FINANCE_ENTITY_NOT_FOUND')return res.status(404).json({error:'FINANCE_ENTITY_NOT_FOUND'});
    if(code.startsWith('LEDGER_'))return res.status(409).json({error:code.split(':')[0]});
    console.error('Certified book report unavailable');return res.status(500).json({error:'LEDGER_REPORT_UNAVAILABLE'});
  }
}
