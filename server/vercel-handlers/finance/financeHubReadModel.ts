import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { loadPeriodCloseReadModel, parsePeriod } from './periodCloseReadModel.js';
import { buildFinanceHubReadModel } from '../../../shared/intelligence/financeHubReadModel.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const financeEntityId = req.body?.financeEntityId;
    const period = parsePeriod(req.body?.period);
    if (
      typeof financeEntityId !== 'string' ||
      !financeEntityId.trim() ||
      !period
    ) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const {
      db,
      organizationId,
      context,
    } = await resolveFinanceRequestContext(req, 'finance.view');

    const loaded = await loadPeriodCloseReadModel({
      db,
      organizationId,
      financeEntityId,
      context,
      period,
    });

    return res.status(200).json(
      buildFinanceHubReadModel({
        organizationId,
        readiness: loaded.response,
        generatedAt: new Date().toISOString(),
      }),
    );
  } catch (error: any) {
    const message = String(error?.message || '');

    if (error?.status) {
      return res.status(error.status).json({
        error: error.error || 'UNAUTHORIZED',
      });
    }
    if (
      message === 'FORBIDDEN_FINANCE_ACCESS' ||
      message === 'FINANCE_ENTITY_MISMATCH' ||
      message === 'Session not granted'
    ) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (message === 'FINANCE_ENTITY_NOT_FOUND') {
      return res.status(404).json({ error: message });
    }
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') {
      return res.status(409).json({ error: message });
    }
    if (
      message === 'PERIOD_CLOSE_REVIEW_INTEGRITY_MISMATCH' ||
      message.startsWith('PERIOD_CLOSE_')
    ) {
      return res.status(422).json({ error: message });
    }

    console.error('Finance Hub Read Model Error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
