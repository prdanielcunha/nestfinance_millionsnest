import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Timestamp } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';

const MAX_LOOKBACK_MS = 180 * 24 * 60 * 60 * 1000;
const PREVIEW_LIMIT = 3;

function parseSince(value: unknown) {
  if (typeof value !== 'string' || value.length > 40) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const now = Date.now();
  if (ms > now + 60_000 || ms < now - MAX_LOOKBACK_MS) return null;
  return { ms, iso: new Date(ms).toISOString() };
}

function toIso(value: any): string | null {
  if (typeof value?.toDate === 'function') {
    try { return value.toDate().toISOString(); } catch { return null; }
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const { financeEntityId, since } = req.body || {};
    const parsed = parseSince(since);
    if (typeof financeEntityId !== 'string' || !financeEntityId.trim() || !parsed) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const { context } = await resolveFinanceRequestContext(req, 'finance.view');
    const base = context.repository
      .getAuditRef()
      .where('financeEntityId', '==', financeEntityId)
      .where('createdAt', '>', Timestamp.fromMillis(parsed.ms));

    const [countSnapshot, latestSnapshot] = await Promise.all([
      base.count().get(),
      base.orderBy('createdAt', 'desc').limit(PREVIEW_LIMIT).get(),
    ]);

    const total = Number(countSnapshot.data()?.count || 0);
    const latest = latestSnapshot.docs.map((doc: any) => {
      const data = doc.data() || {};
      context.repository.assertEntityIsolation(data);
      return {
        eventId: doc.id,
        action: typeof data.action === 'string' ? data.action.slice(0, 120) : 'unknown',
        resource: typeof data.resource === 'string'
          ? data.resource.slice(0, 80)
          : typeof data.entityType === 'string'
            ? data.entityType.slice(0, 80)
            : 'unknown',
        occurredAt: toIso(data.createdAt),
      };
    });

    return res.status(200).json({
      since: parsed.iso,
      total,
      previewLimit: PREVIEW_LIMIT,
      hasMoreThanPreview: total > latest.length,
      latest,
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
    console.error('Since last visit summary error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
