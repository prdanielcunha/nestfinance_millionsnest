import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { intelligenceDayKey } from './intelligenceGovernanceStore.js';
import { getDocumentTransactionModelName, DOCUMENT_TRANSACTION_PROVIDER_REVISION } from './documentTransactionIntelligenceProvider.js';
import { DOCUMENT_INTELLIGENCE_PROMPT_REVISION } from '../../../shared/finance/intelligenceGovernance.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try {
    const { financeEntityId } = req.body || {};
    if (typeof financeEntityId !== 'string' || !financeEntityId.trim()) return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    const { db, organizationId } = await resolveFinanceRequestContext(req, 'finance.manage');
    const [usageSnap, correctionsSnap, benchmarkSnap] = await Promise.all([
      db.collection('organizations').doc(organizationId).collection('financeIntelligenceUsage').doc(intelligenceDayKey()).get(),
      db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId)
        .collection('intelligenceCorrections').where('enabled', '==', true).limit(501).get(),
      db.collection('organizations').doc(organizationId).collection('financeIntelligenceBenchmarks').doc('current').get(),
    ]);
    const usage = usageSnap.data() || {};
    const calls = Math.max(0, Number(usage.providerCalls || 0));
    const cacheHits = Math.max(0, Number(usage.cacheHits || 0));
    const successes = Math.max(0, Number(usage.successes || 0));
    const failures = Math.max(0, Number(usage.failures || 0));
    const totalLatencyMs = Math.max(0, Number(usage.totalLatencyMs || 0));
    const benchmark = benchmarkSnap.exists ? benchmarkSnap.data() || {} : null;
    return res.status(200).json({
      day: intelligenceDayKey(),
      model: getDocumentTransactionModelName(),
      providerRevision: DOCUMENT_TRANSACTION_PROVIDER_REVISION,
      promptRevision: DOCUMENT_INTELLIGENCE_PROMPT_REVISION,
      usage: {
        providerCalls: calls,
        cacheHits,
        successes,
        failures,
        averageLatencyMs: successes + failures > 0 ? Math.round(totalLatencyMs / (successes + failures)) : 0,
      },
      corrections: {
        active: Math.min(correctionsSnap.size, 500),
        truncated: correctionsSnap.size > 500,
        recordedToday: Math.max(0, Number(usage.corrections || 0)),
      },
      benchmark: benchmark ? {
        sampleCount: Math.max(0, Number(benchmark.sampleCount || 0)),
        fieldAccuracy: typeof benchmark.fieldAccuracy === 'number' ? benchmark.fieldAccuracy : null,
        correctionRate: typeof benchmark.correctionRate === 'number' ? benchmark.correctionRate : null,
        model: typeof benchmark.model === 'string' ? benchmark.model : null,
        measuredAt: benchmark.measuredAt?.toDate instanceof Function ? benchmark.measuredAt.toDate().toISOString() : null,
      } : null,
      financialEffect: false,
    });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') return res.status(403).json({ error: 'FORBIDDEN' });
    if (error?.status) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
