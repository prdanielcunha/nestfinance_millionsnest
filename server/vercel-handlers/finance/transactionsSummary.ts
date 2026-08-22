import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext } from './accessHelpers.js';

type SupportedSummaryStatus = 'draft' | 'ready_for_review' | 'approved_for_posting';

function statusBounds(financeEntityId: string, status: SupportedSummaryStatus) {
  const prefix = `${financeEntityId}|${status}|`;
  return { lower: prefix, upper: `${prefix}\uf8ff` };
}

function statusQuery(repository: any, financeEntityId: string, status: SupportedSummaryStatus) {
  const bounds = statusBounds(financeEntityId, status);
  return repository
    .getTransactionsQuery()
    .where('listQueryKeys.status', '>=', bounds.lower)
    .where('listQueryKeys.status', '<', bounds.upper);
}

async function countQuery(query: any): Promise<number> {
  const aggregate = await query.count().get();
  const count = aggregate.data()?.count;
  return typeof count === 'number' ? count : 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { financeEntityId } = req.body || {};
    if (!financeEntityId || typeof financeEntityId !== 'string') {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const { context } = await resolveFinanceRequestContext(req, 'finance.view');

    const draftQuery = statusQuery(context.repository, financeEntityId, 'draft');
    const readyQuery = statusQuery(context.repository, financeEntityId, 'ready_for_review');
    const approvedQuery = statusQuery(context.repository, financeEntityId, 'approved_for_posting');

    const [draftSnapshot, readyForReview, approvedForPosting] = await Promise.all([
      draftQuery.select('returnedToDraftAt', 'returnedToDraftReason', 'returnedToDraftComment').get(),
      countQuery(readyQuery),
      countQuery(approvedQuery),
    ]);

    const returnedCorrections = draftSnapshot.docs.reduce((total: number, snapshot: any) => {
      const data = snapshot.data() || {};
      const wasReturned = Boolean(
        data.returnedToDraftAt ||
        data.returnedToDraftReason ||
        data.returnedToDraftComment,
      );
      return total + (wasReturned ? 1 : 0);
    }, 0);

    const draftTotal = draftSnapshot.size;
    const simpleDrafts = Math.max(0, draftTotal - returnedCorrections);
    const totalOpen = draftTotal + readyForReview + approvedForPosting;

    return res.status(200).json({
      summary: {
        returnedCorrections,
        simpleDrafts,
        readyForReview,
        approvedForPosting,
        totalOpen,
      },
      requestId: req.body?.requestId || 'unknown',
    });
  } catch (error: any) {
    console.error('Transactions Summary Error:', error);

    if (error.status === 401 || error.status === 403) {
      return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    }
    if (error.message === 'FORBIDDEN_FINANCE_ACCESS') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (
      error.code === 'auth/id-token-revoked' ||
      error.code === 'auth/id-token-expired' ||
      error.code === 'auth/invalid-id-token'
    ) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
