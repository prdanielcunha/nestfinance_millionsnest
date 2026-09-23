import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext } from './accessHelpers.js';

const toIso=(value:any)=>value?.toDate instanceof Function ? value.toDate().toISOString() : null;
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error:'METHOD_NOT_ALLOWED' });
  try {
    const { financeEntityId }=req.body||{};
    if (typeof financeEntityId !== 'string') return res.status(400).json({ error:'INVALID_PARAMETERS' });
    const { db, organizationId }=await resolveFinanceRequestContext(req,'finance.manage');
    const snap=await db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId)
      .collection('intelligenceCorrections').orderBy('updatedAt','desc').limit(100).get();
    return res.status(200).json({ items:snap.docs.map(doc=>({ id:doc.id, ...doc.data(), updatedAt:toIso(doc.data().updatedAt) })) });
  } catch(error:any) {
    const message=String(error?.message||'');
    if(message==='FORBIDDEN_FINANCE_ACCESS'||message==='Session not granted') return res.status(403).json({error:'FORBIDDEN'});
    if(error?.status) return res.status(error.status).json({error:error.error||'UNAUTHORIZED'});
    return res.status(500).json({error:'INTERNAL_SERVER_ERROR'});
  }
}
