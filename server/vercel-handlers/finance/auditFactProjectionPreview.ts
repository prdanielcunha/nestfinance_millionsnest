import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hasEffectiveCapability, resolveFinanceRequestContext } from './accessHelpers.js';
import {
  AUDIT_FACT_PROJECTION_VERSION,
  inspectAuditFactProjection,
} from './auditFactProjection.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    const { db, organizationId, financeEntityId, sessionList } =
      await resolveFinanceRequestContext(req, 'finance.view');
    if (!hasEffectiveCapability(sessionList, 'finance.manage')) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const inspection = await inspectAuditFactProjection(
      db,
      organizationId,
      financeEntityId,
    );
    return res.status(200).json({
      projectionVersion: AUDIT_FACT_PROJECTION_VERSION,
      financeEntityId,
      totalAuditEvents: inspection.candidates.length,
      alreadyProjected: inspection.verifiedExisting.length,
      missingProjection: inspection.missing.length,
      unresolvedLegacyScopeCount: inspection.unresolvedLegacyScopeCount,
      organizationScopedCount: inspection.organizationScopedCount,
      truncated: inspection.truncated,
      safeToVerify:
        !inspection.truncated &&
        inspection.unresolvedLegacyScopeCount === 0 &&
        inspection.missing.length === 0,
      financialMutation: false,
      auditMutation: false,
    });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (error?.status) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (message === 'FINANCE_ENTITY_NOT_FOUND') return res.status(404).json({ error: message });
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') return res.status(409).json({ error: message });
    console.error('Audit fact projection preview error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
