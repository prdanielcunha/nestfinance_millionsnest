import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  AUDIT_READ_LIMIT,
  buildAuditTimelineItem,
  type AuditActorKind,
  type AuditListResponse,
} from '../../../shared/finance/auditReadModel.js';
import { resolveFinanceRequestContext } from './accessHelpers.js';

function toIso(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

async function loadActorNames(db: any, actorIds: string[]) {
  const names = new Map<string, string>();
  await Promise.all(
    actorIds.map(async (uid) => {
      try {
        const profile = await db.collection('user_profiles').doc(uid).get();
        const data = profile.exists ? profile.data() || {} : {};
        const value =
          typeof data.name === 'string' && data.name.trim()
            ? data.name.trim()
            : typeof data.displayName === 'string' && data.displayName.trim()
              ? data.displayName.trim()
              : null;
        if (value) names.set(uid, value.slice(0, 120));
      } catch {
        // Actor labels are enrichment only. Audit integrity never depends on profile lookup.
      }
    }),
  );
  return names;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { financeEntityId, cursor, pageSize = AUDIT_READ_LIMIT } = req.body || {};
    if (typeof financeEntityId !== 'string' || !financeEntityId.trim()) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }
    if (cursor !== undefined && cursor !== null && (typeof cursor !== 'string' || !cursor.trim() || cursor.length > 180)) {
      return res.status(400).json({ error: 'INVALID_CURSOR' });
    }
    const requestedPageSize = Number(pageSize);
    if (!Number.isInteger(requestedPageSize) || requestedPageSize < 1) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }
    const limit = Math.min(requestedPageSize, AUDIT_READ_LIMIT);

    const { db, organizationId, context } =
      await resolveFinanceRequestContext(req, 'finance.view');

    const auditRef = context.repository.getAuditRef();
    let query: any = auditRef
      .where('financeEntityId', '==', financeEntityId)
      .orderBy('createdAt', 'desc')
      .limit(limit + 1);

    if (cursor) {
      const cursorDoc = await auditRef.doc(cursor).get();
      const cursorData = cursorDoc.data() || {};
      if (
        !cursorDoc.exists ||
        cursorData.organizationId !== organizationId ||
        cursorData.financeEntityId !== financeEntityId
      ) {
        return res.status(400).json({ error: 'INVALID_CURSOR' });
      }
      query = query.startAfter(cursorDoc);
    }

    const snapshot = await query.get();
    const selected = snapshot.docs.slice(0, limit);
    const hasMore = snapshot.docs.length > limit;
    const nextCursor = hasMore && selected.length ? selected[selected.length - 1].id : undefined;
    const actorIds = Array.from(
      new Set(
        selected
          .map((doc: any) => doc.data()?.actor)
          .filter((actor: unknown): actor is string =>
            typeof actor === 'string' && actor.length > 0 && actor !== 'system',
          ),
      ),
    );
    const actorNames = await loadActorNames(db, actorIds);

    const items = selected.map((doc: any) => {
      const data = doc.data() || {};
      context.repository.assertEntityIsolation(data);
      if (data.organizationId !== organizationId) {
        throw new Error('AUDIT_ORGANIZATION_MISMATCH');
      }

      const rawActor = typeof data.actor === 'string' ? data.actor : '';
      const actorKind: AuditActorKind =
        rawActor === 'system' ? 'system' : rawActor ? 'user' : 'unknown';

      return buildAuditTimelineItem({
        eventId: doc.id,
        occurredAt: toIso(data.createdAt),
        actorKind,
        actorDisplayName: rawActor ? actorNames.get(rawActor) || null : null,
        data,
      });
    });

    const response: AuditListResponse = {
      scope: 'current_finance_entity',
      source: 'canonical_finance_audit_log',
      readOnly: true,
      financialMutation: false,
      auditMutation: false,
      limit,
      truncated: hasMore,
      hasMore,
      nextCursor,
      items,
    };

    return res.status(200).json(response);
  } catch (error: any) {
    const message = String(error?.message || '');

    if (error?.status) {
      return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    }
    if (
      message === 'FORBIDDEN_FINANCE_ACCESS' ||
      message === 'FINANCE_ENTITY_MISMATCH' ||
      message === 'AUDIT_ORGANIZATION_MISMATCH' ||
      message === 'Session not granted'
    ) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (message === 'FINANCE_ENTITY_NOT_FOUND') {
      return res.status(404).json({ error: message });
    }
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') {
      return res.status(409).json({ error: message });
    }

    console.error('Audit list error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
