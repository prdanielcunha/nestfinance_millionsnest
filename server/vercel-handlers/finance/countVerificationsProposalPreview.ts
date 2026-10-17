import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildCountV3TreasuryReviewPacket } from '../../../shared/finance/countV3TreasuryReview.js';
import {
  assertCountV3Enabled, assertV3Session, sendCountV3Error, v3IsValidSessionId,
} from './countVerificationV3Common.js';

/**
 * Data-backed mapping choices for Count v3. Return NO guessed account,
 * category or fund and do not create entries on page load.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    assertCountV3Enabled();
    const { financeEntityId, countSessionId } = req.body || {};
    if (typeof financeEntityId !== 'string' || !financeEntityId || !v3IsValidSessionId(countSessionId)) {
      return res.status(400).json({ error: 'COUNT_PROPOSAL_INVALID_PARAMETERS' });
    }
    const { db, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.review');
    const sessionRef = db.collection('organizations').doc(organizationId)
      .collection('financeEntities').doc(financeEntityId)
      .collection('countVerificationSessions').doc(countSessionId);
    const [doc, accountsSnapshot, categoriesSnapshot, fundsSnapshot] = await Promise.all([
      sessionRef.get(),
      context.repository.getAccountsQuery().limit(1000).get(),
      context.repository.getCategoriesQuery().limit(1000).get(),
      context.repository.getFundsQuery().limit(1000).get(),
    ]);
    if (!doc.exists) return res.status(404).json({ error: 'COUNT_SESSION_NOT_FOUND' });
    const session = doc.data() || {};
    assertV3Session(session, organizationId, financeEntityId);
    const packet = buildCountV3TreasuryReviewPacket(session);
    if (session.treasuryReview?.status !== 'accepted') {
      return res.status(409).json({ error: 'COUNT_PROPOSAL_TREASURY_REVIEW_REQUIRED' });
    }
    if (packet.requiresPurposeClassification) {
      return res.status(409).json({ error: 'COUNT_PROPOSAL_PURPOSE_CLASSIFICATION_REQUIRED' });
    }
    const alreadyCreated = Array.isArray(session.countProposal?.transactionIds) &&
      session.countProposal.transactionIds.length > 0;
    if (!alreadyCreated && packet.snapshotVersion !== Number(session.treasuryReview.sourceVersion) + 1) {
      return res.status(409).json({ error: 'COUNT_PROPOSAL_SOURCE_VERSION_STALE' });
    }
    const grouped = new Map<string,{
      lineKey:string;purpose:string;receiptMethod:string;amountCents:number;
    }>();
    for (const line of packet.allocations) {
      if (line.amountCents === 0) continue;
      const lineKey = line.purpose + '|' + line.receiptMethod;
      const previous = grouped.get(lineKey);
      const newAmount = (previous?.amountCents || 0) + line.amountCents;
      if (!Number.isSafeInteger(newAmount) || newAmount > 20_000_000_000) {
        return res.status(409).json({ error: 'COUNT_PROPOSAL_TOTAL_OUT_OF_RANGE' });
      }
      grouped.set(lineKey,{
        lineKey,purpose:line.purpose,receiptMethod:line.receiptMethod,amountCents:newAmount,
      });
    }
    const lines = [...grouped.values()].sort((a,b)=>a.lineKey.localeCompare(b.lineKey));
    if (!lines.length && !alreadyCreated) {
      return res.status(409).json({ error: 'COUNT_PROPOSAL_ZERO_TOTAL' });
    }
    const accounts = accountsSnapshot.docs
      .map(doc=>({id:doc.id,...doc.data()}))
      .filter((item:any)=>item.active!==false)
      .map((item:any)=>({
        id:item.id,name:String(item.name||item.id),
        type:String(item.type||'other'),nature:item.nature||null,
      }));
    const categories = categoriesSnapshot.docs
      .map(doc=>({id:doc.id,...doc.data()}))
      .filter((item:any)=>item.active!==false && item.kind==='income')
      .map((item:any)=>({id:item.id,name:String(item.name||item.id)}));
    const funds = fundsSnapshot.docs
      .map(doc=>({id:doc.id,...doc.data()}))
      .filter((item:any)=>item.active!==false)
      .map((item:any)=>({id:item.id,name:String(item.name||item.id)}));
    return res.status(200).json({
      preview:{
        countSessionId, version:Number(session.version),
        serviceLabel:packet.serviceLabel,serviceDate:packet.serviceDate,
        sourceReviewTotalCents:packet.countedTotalCents,
        independentConfirmed:packet.independentConfirmed,
        lines,
        accountOptions:accounts,categoryOptions:categories,fundOptions:funds,
        alreadyCreated,
        transactionIds:alreadyCreated?session.countProposal.transactionIds:[],
        postingPerformed:false,
      },
      requestId:req.body?.requestId||'unknown',
    });
  } catch (error:any) {
    const message=String(error?.message||'');
    if(message.startsWith('COUNT_REVIEW_')||message.startsWith('COUNT_PROPOSAL_')) {
      return res.status(409).json({error:message});
    }
    sendCountV3Error(res,error);
  }
}
