import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { NESTFINANCE_SIGNAL_TYPES } from '../../../shared/intelligence/canonicalSignal.js';
import type { NeedsAttentionSignalDetail } from '../../../shared/intelligence/needsAttention.js';

const validSignalId = (value: unknown): value is string =>
  typeof value === 'string' && /^signal_[a-f0-9]{64}$/.test(value);

function toIso(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  return null;
}

const SAFE_REASON_KEYS = new Set([
  'status',
  'transactionKind',
  'version',
  'submissionKind',
  'returnKind',
  'reasonCode',
  'previousStatus',
  'approvedVersion',
  'postingExecuted',
  'processingState',
  'duplicate',
  'verifiedMimeType',
  'financialRecognition',
  'documentType',
  'classificationSource',
  'reviewStatus',
  'resolution',
  'notePresent',
  'stage',
  'matched',
  'divergenceCount',
  'attemptNumber',
  'resolvedBy',
]);

function safeStructuredReason(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (SAFE_REASON_KEYS.has(key)) result[key] = value;
  }
  return result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { financeEntityId, signalId } = req.body || {};
    if (
      typeof financeEntityId !== 'string' ||
      !financeEntityId.trim() ||
      !validSignalId(signalId)
    ) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const { db, organizationId } =
      await resolveFinanceRequestContext(req, 'finance.view');

    const signalSnapshot = await db.collection('intelligenceSignals').doc(signalId).get();
    const signal = signalSnapshot.data() || {};
    if (
      !signalSnapshot.exists ||
      signal.organizationId !== organizationId ||
      signal.financeEntityId !== financeEntityId ||
      signal.sourceApp !== 'NESTFINANCE' ||
      signal.version !== 1 ||
      !NESTFINANCE_SIGNAL_TYPES.includes(signal.signalType)
    ) {
      return res.status(404).json({ error: 'SIGNAL_NOT_FOUND' });
    }

    const factId = String(signal.lastFactId || '');
    if (!/^fact_[a-f0-9]{64}$/.test(factId)) {
      return res.status(409).json({ error: 'SIGNAL_SOURCE_UNAVAILABLE' });
    }

    const factSnapshot = await db.collection('intelligenceFacts').doc(factId).get();
    const fact = factSnapshot.data() || {};
    if (
      !factSnapshot.exists ||
      fact.organizationId !== organizationId ||
      fact.entityId !== signal.entityId ||
      fact.sourceApp !== 'NESTFINANCE'
    ) {
      return res.status(409).json({ error: 'SIGNAL_SOURCE_UNAVAILABLE' });
    }

    const result: NeedsAttentionSignalDetail = {
      signal: {
        signalId,
        signalType: signal.signalType,
        entityType: String(signal.entityType || ''),
        entityId: String(signal.entityId || ''),
        attentionLevel: signal.attentionLevel,
        requiredCapability: String(signal.requiredCapability || ''),
        actionCode: signal.actionCode,
        openedAt: toIso(signal.openedAt),
        updatedAt: toIso(signal.updatedAt),
        explainable: true,
        status: signal.status === 'resolved' ? 'resolved' : 'open',
        resolvedAt: toIso(signal.resolvedAt),
      },
      explanation: {
        factId,
        eventType: String(fact.eventType || ''),
        occurredAt: toIso(fact.occurredAt),
        recordedAt: toIso(fact.recordedAt),
        structuredReason: safeStructuredReason(fact.payload),
        sourceRefs: Array.isArray(fact.sourceRefs) ? fact.sourceRefs : [],
      },
    };

    return res.status(200).json(result);
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message === 'FINANCE_ENTITY_NOT_FOUND') return res.status(404).json({ error: message });
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') return res.status(409).json({ error: message });
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (error?.status) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });

    console.error('Intelligence Signals Detail Error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
