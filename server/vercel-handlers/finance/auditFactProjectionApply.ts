import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hasEffectiveCapability, resolveFinanceRequestContext } from './accessHelpers.js';
import {
  AUDIT_FACT_PROJECTION_BATCH_MAX,
  AUDIT_FACT_PROJECTION_VERSION,
  buildAuditFactInput,
  inspectAuditFactProjection,
  matchesAuditProjectionCandidate,
} from './auditFactProjection.js';
import { ensureFinanceFact } from './factStream.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    const { db, organizationId, financeEntityId, sessionList } =
      await resolveFinanceRequestContext(req, 'finance.view');
    if (!hasEffectiveCapability(sessionList, 'finance.manage')) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const batchSize = Number(req.body?.batchSize ?? 50);
    if (
      !Number.isInteger(batchSize) ||
      batchSize < 1 ||
      batchSize > AUDIT_FACT_PROJECTION_BATCH_MAX
    ) {
      return res.status(400).json({ error: 'INVALID_BATCH_SIZE' });
    }

    const before = await inspectAuditFactProjection(
      db,
      organizationId,
      financeEntityId,
    );
    const batch = before.missing.slice(0, batchSize);

    let applied = 0;
    let reusedFacts = 0;
    let skippedSourceChanged = 0;

    for (const candidate of batch) {
      const result = await db.runTransaction(async (transaction: any) => {
        const auditRef = db.doc(candidate.sourceRef);
        const auditSnapshot = await transaction.get(auditRef);
        const data = auditSnapshot.data() || {};

        if (
          !auditSnapshot.exists ||
          !matchesAuditProjectionCandidate(
            candidate,
            data,
            organizationId,
            financeEntityId,
          )
        ) {
          return { applied: false, reused: false };
        }

        const ensured = await ensureFinanceFact(
          transaction,
          db,
          buildAuditFactInput({
            organizationId,
            financeEntityId,
            auditEventId: candidate.auditEventId,
            auditRef: auditRef.path,
            auditData: data,
          }),
        );
        return { applied: true, reused: !ensured.created };
      });

      if (result.applied) {
        applied += 1;
        if (result.reused) reusedFacts += 1;
      } else {
        skippedSourceChanged += 1;
      }
    }

    const after = await inspectAuditFactProjection(
      db,
      organizationId,
      financeEntityId,
    );
    return res.status(200).json({
      projectionVersion: AUDIT_FACT_PROJECTION_VERSION,
      financeEntityId,
      attempted: batch.length,
      applied,
      reusedFacts,
      skippedSourceChanged,
      remaining: after.missing.length,
      unresolvedLegacyScopeCount: after.unresolvedLegacyScopeCount,
      organizationScopedCount: after.organizationScopedCount,
      truncated: after.truncated,
      complete:
        !after.truncated &&
        after.unresolvedLegacyScopeCount === 0 &&
        after.missing.length === 0,
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
    console.error('Audit fact projection apply error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
