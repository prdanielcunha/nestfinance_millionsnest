import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isValidAccountId } from '../../../api/_lib/financeIdentity.js';
import { resolveFinanceRequestContext } from './accessHelpers.js';

/**
 * Server-mediated opening provenance: one entity and account per request,
 * all finance history private. Neither the caller nor the browser can query
 * Firestore history directly. Only finance.review is allowed to inspect it.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  }
  if (typeof req.headers['content-type'] !== 'string' ||
      !req.headers['content-type'].includes('application/json')) {
    return res.status(415).json({error:'UNSUPPORTED_MEDIA_TYPE'});
  }
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['financeEntityId','accountId','beforeRevision'].includes(key))) {
    return res.status(400).json({error:'INVALID_PARAMETERS'});
  }
  const {financeEntityId,accountId,beforeRevision} = body;
  if (typeof financeEntityId !== 'string' || !/^[a-zA-Z0-9_.-]{1,128}$/.test(financeEntityId) ||
      typeof accountId !== 'string' || !isValidAccountId(accountId) ||
      (beforeRevision !== undefined &&
        (!Number.isSafeInteger(beforeRevision) || beforeRevision < 1 || beforeRevision > 1_000_000))) {
    return res.status(400).json({error:'INVALID_PARAMETERS'});
  }
  try {
    const {context} = await resolveFinanceRequestContext(req, 'finance.review');
    const accountRef = context.repository.getAccountsRef().doc(accountId);
    const accountSnap = await accountRef.get();
    if (!accountSnap.exists) return res.status(404).json({error:'ACCOUNT_NOT_FOUND'});
    const account = accountSnap.data() || {};
    context.repository.assertEntityIsolation(account);

    // Page by revision, never silently claim a truncated history is complete.
    let query = accountRef.collection('openingBalanceHistory')
      .orderBy('revision', 'desc');
    if (beforeRevision !== undefined) query = query.startAfter(beforeRevision);
    const snapshot = await query.limit(26).get();
    const page = snapshot.docs.slice(0,25);
    const items = page.map(doc => {
      const data = doc.data();
      const safeDeclaration = (raw:unknown) => {
        if (!raw || typeof raw !== 'object') return null;
        const value = raw as Record<string,unknown>;
        if (value.status === 'not_informed') return {status:'not_informed'};
        if (value.status !== 'pending_review' && value.status !== 'confirmed') return null;
        return {
          status:value.status,
          amountCents:Number.isSafeInteger(value.amountCents) ? value.amountCents : null,
          asOf:typeof value.asOf==='string' ? value.asOf : null,
          source:typeof value.source==='string' ? value.source : null,
          sourceNote:typeof value.sourceNote==='string' ? value.sourceNote : '',
        };
      };
      return {
        revision:Number(data.revision),
        previous:safeDeclaration(data.previous),
        current:safeDeclaration(data.current),
        reason:typeof data.reason==='string'?data.reason:'',
        createdAt:typeof data.createdAt?.toDate==='function'
          ? data.createdAt.toDate().toISOString() : null,
        // Do not expose internal actor UID or any raw document IDs to clients.
        actorRecorded:typeof data.actorUid==='string' && data.actorUid.length>0,
      };
    });
    const hasMore = snapshot.docs.length>25;
    const nextCursor = hasMore && items.length ? items[items.length-1].revision : null;
    return res.status(200).json({
      accountId,
      openingBalanceRevision:Number.isSafeInteger(account.openingBalanceRevision)
        ? account.openingBalanceRevision : 0,
      legacyUnverified:typeof account.openingBalanceCents==='number' &&
        account.openingBalanceDeclaration===undefined,
      items, hasMore, nextCursor,
      postingPerformed:false,
    });
  } catch(error:any) {
    const message = String(error?.message || '');
    if (message==='FINANCE_ENTITY_MISMATCH'||message==='FORBIDDEN_FINANCE_ACCESS'||
        message==='COUNT_TEAM_TREASURY_ACCESS_FORBIDDEN') {
      return res.status(403).json({error:'FORBIDDEN'});
    }
    if (message==='FINANCE_ENTITY_NOT_FOUND'||message==='FINANCE_ENTITY_NOT_ACTIVE') {
      return res.status(404).json({error:'FINANCE_ENTITY_NOT_FOUND'});
    }
    if ([401,403,404].includes(error?.status)) {
      return res.status(error.status).json({error:error.status===401?'UNAUTHORIZED':'FORBIDDEN'});
    }
    console.error('Opening history read unavailable', {type:message.slice(0,60)});
    return res.status(500).json({error:'INTERNAL_SERVER_ERROR'});
  }
}
