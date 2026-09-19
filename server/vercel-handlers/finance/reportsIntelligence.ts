import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildReportsIntelligence, previousPeriodKey } from '../../../shared/finance/reportsIntelligence.js';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { loadPeriodCloseReadModel, parsePeriod } from './periodCloseReadModel.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const financeEntityId = req.body?.financeEntityId;
    const currentPeriod = parsePeriod(req.body?.period);
    if (typeof financeEntityId !== 'string' || !financeEntityId.trim() || !currentPeriod) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const comparisonPeriod = parsePeriod(previousPeriodKey(currentPeriod.key));
    if (!comparisonPeriod) return res.status(400).json({ error: 'INVALID_PARAMETERS' });

    const { db, organizationId, context } =
      await resolveFinanceRequestContext(req, 'finance.view');

    const [current, previous] = await Promise.all([
      loadPeriodCloseReadModel({
        db,
        organizationId,
        financeEntityId,
        context,
        period: currentPeriod,
      }),
      loadPeriodCloseReadModel({
        db,
        organizationId,
        financeEntityId,
        context,
        period: comparisonPeriod,
      }),
    ]);

    return res.status(200).json(buildReportsIntelligence({
      current: current.response,
      previous: previous.response,
    }));
  } catch (error: any) {
    const message = String(error?.message || '');
    if (error?.status) {
      return res.status(error.status).json({ error: message || error.error || 'READ_SCOPE_ERROR' });
    }
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (message === 'FINANCE_ENTITY_NOT_FOUND') return res.status(404).json({ error: message });
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') return res.status(409).json({ error: message });
    if (
      message === 'FINANCE_ENTITY_MISMATCH' ||
      message === 'PERIOD_CLOSE_REVIEW_INTEGRITY_MISMATCH'
    ) {
      return res.status(409).json({ error: message });
    }
    if (error?.code === 'auth/id-token-expired' || error?.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    console.error('Reports Intelligence Error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
