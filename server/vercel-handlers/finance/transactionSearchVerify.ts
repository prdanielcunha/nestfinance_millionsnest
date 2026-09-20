import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hasEffectiveCapability, resolveFinanceRequestContext } from './accessHelpers.js';
import {
  buildTransactionSearchCoverageId,
  buildTransactionSearchCoverageRecord,
  inspectTransactionSearchProjection,
} from './transactionSearchIndex.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { db, uid, organizationId, financeEntityId, sessionList } =
      await resolveFinanceRequestContext(req, 'finance.view');
    if (!hasEffectiveCapability(sessionList, 'finance.manage')) {
      return res.status(403).json({ error: 'FORBIDDEN_SEARCH_INDEX_MANAGEMENT' });
    }
    const inspection = await inspectTransactionSearchProjection(
      db,
      organizationId,
      financeEntityId,
    );
    const certified =
      !inspection.truncated && inspection.missingOrStale.length === 0;
    const coverageId = buildTransactionSearchCoverageId(
      organizationId,
      financeEntityId,
    );
    const coverageRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeSearchCoverage')
      .doc(coverageId);

    await coverageRef.set(
      buildTransactionSearchCoverageRecord({
        coverageId,
        organizationId,
        financeEntityId,
        expectedTransactionCount: inspection.candidates.length,
        verifiedIndexCount: inspection.verifiedExisting.length,
        missingOrStaleCount: inspection.missingOrStale.length,
        truncated: inspection.truncated,
        checkedBy: uid,
        certified,
      }),
      { merge: true },
    );

    return res.status(200).json({
      coverageId,
      financeEntityId,
      certified,
      status: certified ? 'certified' : 'incomplete',
      expectedTransactionCount: inspection.candidates.length,
      verifiedIndexCount: inspection.verifiedExisting.length,
      missingOrStaleCount: inspection.missingOrStale.length,
      truncated: inspection.truncated,
      financialMutation: false,
      auditMutation: false,
    });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (error?.status) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') return res.status(403).json({ error: 'FORBIDDEN' });
    if (message === 'FINANCE_ENTITY_NOT_FOUND') return res.status(404).json({ error: message });
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') return res.status(409).json({ error: message });
    console.error('Transaction search verify error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
