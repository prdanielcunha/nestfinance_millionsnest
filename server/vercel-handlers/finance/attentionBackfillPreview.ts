import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hasEffectiveCapability, resolveFinanceRequestContext } from './accessHelpers.js';
import {
  ATTENTION_BACKFILL_VERSION,
  inspectAttentionBackfill,
} from './attentionBackfill.js';
import { NESTFINANCE_SIGNAL_TYPES } from '../../../shared/intelligence/canonicalSignal.js';

function counts(items: Array<{ signalType: string }>) {
  return Object.fromEntries(
    NESTFINANCE_SIGNAL_TYPES.map((type) => [
      type,
      items.filter((item) => item.signalType === type).length,
    ]),
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { db, organizationId, financeEntityId, sessionList } =
      await resolveFinanceRequestContext(req, 'finance.view');

    if (!hasEffectiveCapability(sessionList, 'finance.manage')) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const inspection = await inspectAttentionBackfill(
      db,
      organizationId,
      financeEntityId,
    );

    return res.status(200).json({
      backfillVersion: ATTENTION_BACKFILL_VERSION,
      financeEntityId,
      totalActionable: inspection.candidates.length,
      alreadyProjected: inspection.verifiedExisting.length,
      missingProjection: inspection.missing.length,
      byType: {
        actionable: counts(inspection.candidates),
        missing: counts(inspection.missing),
      },
      safeToVerify: inspection.missing.length === 0,
      financialMutation: false,
    });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (error?.status) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (message === 'FINANCE_ENTITY_NOT_FOUND') return res.status(404).json({ error: message });
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') return res.status(409).json({ error: message });
    console.error('Attention backfill preview error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
