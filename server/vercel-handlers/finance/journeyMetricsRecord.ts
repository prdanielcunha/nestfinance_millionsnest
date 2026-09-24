import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';

const METRICS = new Set(['login', 'entity_selection', 'flow_start', 'flow_complete']);
const FLOW_PATTERN = /^[a-z0-9_-]{1,40}$/;

type MetricUpdate = {
  metric: string;
  flow?: string;
  count: number;
};

export function parseJourneyMetricCounts(input: unknown): MetricUpdate[] | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 16) return null;

  const updates: MetricUpdate[] = [];
  let total = 0;

  for (const [key, value] of entries) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 100) return null;
    const [metric, flow, ...rest] = key.split(':');
    if (!METRICS.has(metric) || rest.length > 0) return null;
    if (flow !== undefined && !FLOW_PATTERN.test(flow)) return null;

    const count = value;
    total += count;
    if (total > 200) return null;
    updates.push({ metric, ...(flow ? { flow } : {}), count });
  }

  return updates;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const authorization = req.headers.authorization;
  if (!authorization || typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  const updates = parseJourneyMetricCounts(req.body?.counts);
  if (!updates) {
    return res.status(400).json({ error: 'INVALID_METRICS_PAYLOAD' });
  }

  try {
    const admin = getFirebaseAdmin();
    const decoded = await admin.auth.verifyIdToken(authorization.slice(7), true);
    const uid = typeof decoded?.uid === 'string' ? decoded.uid : '';
    const organizationId =
      typeof decoded?.mn_organization_id === 'string' ? decoded.mn_organization_id : '';

    if (!uid || !organizationId) {
      return res.status(403).json({ error: 'FORBIDDEN_MISSING_ORG' });
    }

    const session = await resolveEcosystemSession(uid, organizationId);
    if (!session.granted) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const eventTotals: Record<string, unknown> = {};
    const flows: Record<string, Record<string, unknown>> = {};

    for (const update of updates) {
      eventTotals[update.metric] = FieldValue.increment(update.count);
      if (update.flow) {
        flows[update.flow] ||= {};
        flows[update.flow][update.metric] = FieldValue.increment(update.count);
      }
    }

    const dateKey = new Date().toISOString().slice(0, 10);
    await admin.firestore
      .collection('organizations')
      .doc(organizationId)
      .collection('financeProductMetrics')
      .doc(dateKey)
      .set(
        {
          dateKey,
          eventTotals,
          ...(Object.keys(flows).length > 0 ? { flows } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    if (
      error?.code === 'auth/id-token-expired' ||
      error?.code === 'auth/id-token-revoked' ||
      error?.code === 'auth/invalid-id-token' ||
      error?.code === 'auth/argument-error'
    ) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    console.error('Finance journey metrics error:', {
      code: error?.code || 'UNKNOWN',
      message: error?.message || 'Unknown error',
    });
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
