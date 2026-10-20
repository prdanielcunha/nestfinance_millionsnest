import type { VercelRequest,VercelResponse } from '@vercel/node';
import { hasEffectiveCapability,resolveFinanceRequestContext } from './accessHelpers.js';
import { isValidIdempotencyKey,isValidRequestId } from '../../../shared/finance/ledger/ids.js';
import { ledgerId } from '../../../shared/finance/ledger/certifiedConfiguration.js';
import { stageCertifiedPosting,stageCertifiedReversal } from './certifiedLedgerStore.js';
import { buildIdempotencyKeyHash,executeWithIdempotency,hashPayload } from './idempotencyHelper.js';

export default async function handler(req:VercelRequest,res:VercelResponse){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  if(!String(req.headers['content-type']||'').includes('application/json'))return res.status(415).json({error:'UNSUPPORTED_MEDIA_TYPE'});
  const b=req.body;
  if(!b||typeof b!=='object'||Array.isArray(b)||JSON.stringify(b).length>4096||!['post','reverse'].includes(b.action)||
    Object.keys(b).some(k=>!['financeEntityId','transactionId','expectedVersion','action','reversalDate','reason','idempotencyKey','requestId'].includes(k))||
    !ledgerId(b.financeEntityId)||!ledgerId(b.transactionId)||!Number.isSafeInteger(b.expectedVersion)||b.expectedVersion<1||
    !isValidIdempotencyKey(b.idempotencyKey)||!isValidRequestId(b.requestId)||
    b.action==='post'&&(b.reason!==undefined||b.reversalDate!==undefined))return res.status(400).json({error:'INVALID_PARAMETERS'});
  try{
    const a=await resolveFinanceRequestContext(req,'finance.view');
    if(!hasEffectiveCapability(a.sessionList,b.action==='post'?'finance.post_transactions':'finance.manage'))return res.status(403).json({error:'FORBIDDEN'});
    const {db,organizationId,financeEntityId,uid,actorLabel,context}=a;
    const key=buildIdempotencyKeyHash(organizationId,financeEntityId,uid,'certified_'+b.action,b.idempotencyKey);
    const {idempotencyKey:_,requestId:__,...payload}=b;
    const command={db,organizationId,financeEntityId,uid,actorLabel,requestId:b.requestId};
    const result=await executeWithIdempotency(db,context.repository.getIdempotencyRef(),key,hashPayload(payload),t=>b.action==='post'
      ?stageCertifiedPosting(t,command,b.transactionId,b.expectedVersion)
      :stageCertifiedReversal(t,command,b.transactionId,b.expectedVersion,b.reversalDate,b.reason));
    return res.status(200).json(result);
  }catch(e:any){
    // Preserve the shared atomic period-fence error at this HTTP boundary.
    if (e?.code === 'LEDGER_PERIOD_CLOSED' || String(e?.code || '').startsWith('LEDGER_PERIOD_FENCE_')) return res.status(409).json({ error: e.code });

    const code=String(e?.error||e?.code||e?.message||'');
    if(e?.status===401||code.startsWith('auth/'))return res.status(401).json({error:'UNAUTHORIZED'});
    if(e?.status===403||code.includes('FORBIDDEN'))return res.status(403).json({error:'FORBIDDEN'});
    if(code==='LEDGER_TRANSACTION_NOT_FOUND')return res.status(404).json({error:code});
    if(e?.status===409||code.startsWith('LEDGER_')||code.startsWith('FINANCE_IDEMPOTENCY_CONFLICT'))return res.status(409).json({error:code.split(':')[0]});
    console.error('Certified command failed',{code:code.slice(0,80)});return res.status(500).json({error:'LEDGER_COMMAND_UNAVAILABLE'});
  }
}
