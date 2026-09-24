import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { isValidCountSessionId } from '../../../shared/finance/count.js';
import { buildCountProposalPreview } from './countProposalHelpers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { financeEntityId, countSessionId } = req.body || {};
    if (typeof financeEntityId !== 'string' || !isValidCountSessionId(countSessionId)) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const { db, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.view');
    const entityRef = db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId);
    const sessionRef = entityRef.collection('countSessions').doc(countSessionId);

    const [sessionDoc, accountsSnapshot, categoriesSnapshot, fundsSnapshot] = await Promise.all([
      sessionRef.get(),
      context.repository.getAccountsQuery().limit(1000).get(),
      context.repository.getCategoriesQuery().limit(1000).get(),
      context.repository.getFundsQuery().limit(1000).get(),
    ]);

    if (!sessionDoc.exists) return res.status(404).json({ error: 'COUNT_SESSION_NOT_FOUND' });
    const session = sessionDoc.data() || {};
    if (session.organizationId !== organizationId || session.financeEntityId !== financeEntityId) {
      return res.status(404).json({ error: 'COUNT_SESSION_NOT_FOUND' });
    }

    const accounts = accountsSnapshot.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() }))
      .filter((account: any) => account.active !== false)
      .map((account: any) => ({
        id: account.id,
        name: String(account.name || account.id),
        type: String(account.type || 'other'),
        nature: account.nature || null,
        templateKey: account.templateKey || null,
      }));

    const categories = categoriesSnapshot.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() }))
      .filter((category: any) => category.active !== false && category.kind === 'income')
      .map((category: any) => ({
        id: category.id,
        name: String(category.name || category.id),
        kind: 'income' as const,
      }));

    const funds = fundsSnapshot.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() }))
      .filter((fund: any) => fund.active !== false)
      .map((fund: any) => ({ id: fund.id, name: String(fund.name || fund.id) }));

    const preview = buildCountProposalPreview({
      session: { id: sessionDoc.id, ...session },
      accounts,
      categories,
      funds,
    });

    return res.status(200).json({ preview, requestId: req.body?.requestId || 'unknown' });
  } catch (error: any) {
    const message = String(error?.message || '');
    console.error('Count Proposal Preview Error:', message.startsWith('COUNT_') ? message : 'UNEXPECTED_ERROR');
    if (message === 'COUNT_SESSION_NOT_FOUND') return res.status(404).json({ error: message });
    if (message.startsWith('COUNT_PROPOSAL_')) return res.status(409).json({ error: message });
    if (message === 'FORBIDDEN_FINANCE_ACCESS') return res.status(403).json({ error: 'FORBIDDEN' });
    if (error.status === 401 || error.status === 403) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
