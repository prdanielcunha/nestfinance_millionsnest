import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { hasEffectiveCapability, resolveFinanceRequestContext } from './accessHelpers.js';
import {
  ATTENTION_BACKFILL_VERSION,
  buildAttentionCoverageId,
  inspectAttentionBackfill,
} from './attentionBackfill.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { db, uid, organizationId, financeEntityId, sessionList } =
      await resolveFinanceRequestContext(req, 'finance.view');

    if (!hasEffectiveCapability(sessionList, 'finance.manage')) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const inspection = await inspectAttentionBackfill(db, organizationId, financeEntityId);
    const verified = inspection.missing.length === 0;
    const coverageId = buildAttentionCoverageId(organizationId, financeEntityId);
    const coverageRef = db.collection('intelligenceCoverage').doc(coverageId);

    await coverageRef.set(
      {
        coverageId,
        organizationId,
        financeEntityId,
        sourceApp: 'NESTFINANCE',
        coverageKind: 'needs_attention',
        status: verified ? 'certified' : 'incomplete',
        factSchemaVersion: 1,
        signalSchemaVersion: 1,
        backfillVersion: ATTENTION_BACKFILL_VERSION,
        expectedActionableCount: inspection.candidates.length,
        verifiedSignalCount: inspection.verifiedExisting.length,
        missingSignalCount: inspection.missing.length,
        checkedAt: FieldValue.serverTimestamp(),
        checkedBy: uid,
        verifiedAt: verified ? FieldValue.serverTimestamp() : null,
        financialMutation: false,
      },
      { merge: true },
    );

    return res.status(200).json({
      verified,
      coverageId,
      status: verified ? 'certified' : 'incomplete',
      expectedActionableCount: inspection.candidates.length,
      verifiedSignalCount: inspection.verifiedExisting.length,
      missingSignalCount: inspection.missing.length,
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
    console.error('Attention backfill verify error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
