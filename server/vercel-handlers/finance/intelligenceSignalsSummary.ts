import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveFinanceRequestContext, hasFinanceCapability } from './accessHelpers.js';
import {
  NESTFINANCE_SIGNAL_TYPES,
  type NestFinanceSignalType,
} from '../../../shared/intelligence/canonicalSignal.js';
import { isFinanceSignalCurrent } from './signalCurrentState.js';
import type {
  NeedsAttentionSignalSummary,
  NeedsAttentionSignalSummaryItem,
} from '../../../shared/intelligence/needsAttention.js';

function toIso(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  return null;
}

function canActOnSignal(sessionList: any, requiredCapability: unknown): boolean {
  if (requiredCapability === 'finance.review') {
    return hasFinanceCapability(sessionList, 'finance.review');
  }
  if (requiredCapability === 'finance.create_drafts') {
    return hasFinanceCapability(sessionList, 'finance.create_drafts');
  }
  return false;
}

function emptyCounts(): Record<NestFinanceSignalType, number> {
  return Object.fromEntries(
    NESTFINANCE_SIGNAL_TYPES.map((type) => [type, 0]),
  ) as Record<NestFinanceSignalType, number>;
}

export async function readVerifiedSignalSummary({
  db,
  organizationId,
  financeEntityId,
  sessionList,
}: {
  db: any;
  organizationId: string;
  financeEntityId: string;
  sessionList: any;
}): Promise<NeedsAttentionSignalSummary> {
  const snapshot = await db
    .collection('intelligenceSignals')
    .where('organizationId', '==', organizationId)
    .where('financeEntityId', '==', financeEntityId)
    .where('status', '==', 'open')
    .get();

  const byType = emptyCounts();
  const items: NeedsAttentionSignalSummaryItem[] = [];

  const candidates = snapshot.docs
    .map((doc: any) => ({ doc, data: doc.data() || {} }))
    .filter(
      ({ data }: any) =>
        data.sourceApp === 'NESTFINANCE' &&
        data.version === 1 &&
        NESTFINANCE_SIGNAL_TYPES.includes(data.signalType) &&
        canActOnSignal(sessionList, data.requiredCapability),
    );

  const verifiedCandidates = await Promise.all(
    candidates.map(async ({ doc, data }: any) => {
      const signalType = data.signalType as NestFinanceSignalType;
      const currentStateVerified = await isFinanceSignalCurrent({
        db,
        organizationId,
        financeEntityId,
        signalType,
        entityType: String(data.entityType || ''),
        entityId: String(data.entityId || ''),
      });
      return { doc, data, signalType, currentStateVerified };
    }),
  );

  for (const { doc, data, signalType, currentStateVerified } of verifiedCandidates) {
    if (!currentStateVerified) continue;

    byType[signalType] += 1;
    items.push({
      signalId: doc.id,
      signalType,
      entityType: String(data.entityType || ''),
      entityId: String(data.entityId || ''),
      attentionLevel: data.attentionLevel,
      requiredCapability: String(data.requiredCapability || ''),
      actionCode: data.actionCode,
      openedAt: toIso(data.openedAt),
      updatedAt: toIso(data.updatedAt),
      explainable: true,
      currentStateVerified: true,
    });
  }

  items.sort((a, b) => {
    const byOpened = String(a.openedAt || '').localeCompare(String(b.openedAt || ''));
    return byOpened !== 0 ? byOpened : a.signalId.localeCompare(b.signalId);
  });

  return {
    coverage: {
      mode: 'partial_projection',
      canDeclareAllClear: false,
      reason: 'PRE_P5_BACKFILL_NOT_CERTIFIED',
      signalSchemaVersion: 1,
    },
    actionableOpenTotal: items.length,
    byType,
    items,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { financeEntityId } = req.body || {};
    if (typeof financeEntityId !== 'string' || !financeEntityId.trim()) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const { db, organizationId, sessionList } =
      await resolveFinanceRequestContext(req, 'finance.view');

    const result = await readVerifiedSignalSummary({
      db,
      organizationId,
      financeEntityId,
      sessionList,
    });

    return res.status(200).json(result);
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message === 'FINANCE_ENTITY_NOT_FOUND') return res.status(404).json({ error: message });
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') return res.status(409).json({ error: message });
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (error?.status) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });

    console.error('Intelligence Signals Summary Error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
