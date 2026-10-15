import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';
import { hasFinanceEntityScope } from './accessHelpers.js';

export function canUseFinanceEntitySelector(session: any): boolean {
  if (!session?.granted) return false;
  if (session.isGlobalAccess === true) return true;

  const organizationRole = String(session.organizationRole || '').trim().toLowerCase();
  if (organizationRole === 'owner' || organizationRole === 'admin') return true;

  const permissions = Array.isArray(session.permissions)
    ? session.permissions
    : Array.isArray(session.capabilities)
      ? session.capabilities
      : [];

  return (
    permissions.includes('*') ||
    permissions.includes('organization.manage_entities') ||
    permissions.some((permission: unknown) =>
      typeof permission === 'string' && permission.startsWith('finance.'),
    )
  );
}

type SelectorIdentity = { admin: ReturnType<typeof getFirebaseAdmin>; uid: string; organizationId: string; session: any };
export function createEntitiesAccessibleHandler(resolveIdentity?: (req: VercelRequest) => Promise<SelectorIdentity>) {
return async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Pragma', 'no-cache');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const authorization = req.headers.authorization;
  if (!authorization || typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  try {
    const identity = resolveIdentity ? await resolveIdentity(req) : null;
    const admin = identity?.admin ?? getFirebaseAdmin();
    const decoded = identity ? null : await admin.auth.verifyIdToken(authorization.slice(7), true);
    const uid = identity?.uid ?? (typeof decoded?.uid === 'string' ? decoded.uid : '');
    const organizationId = identity?.organizationId ?? (typeof decoded?.mn_organization_id === 'string' ? decoded.mn_organization_id : '');

    if (!uid || !organizationId) {
      return res.status(403).json({ error: 'FORBIDDEN_MISSING_ORG' });
    }

    const session = identity?.session ?? await resolveEcosystemSession(uid, organizationId);
    if (!session.granted) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (!canUseFinanceEntitySelector(session)) {
      return res.status(200).json({ organizationId, entities: [] });
    }

    const snapshot = await admin.firestore
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .orderBy('displayName', 'asc')
      .limit(200)
      .get();

    const entities = snapshot.docs
      .filter((document: any) => {
        const data = document.data() || {};
        return data.active !== false && hasFinanceEntityScope(session, document.id);
      })
      .map((document: any) => {
        const data = document.data() || {};
        const displayName =
          typeof data.displayName === 'string' && data.displayName.trim()
            ? data.displayName.trim()
            : typeof data.tradeName === 'string' && data.tradeName.trim()
              ? data.tradeName.trim()
              : typeof data.legalName === 'string' && data.legalName.trim()
                ? data.legalName.trim()
                : document.id;

        return {
          id: document.id,
          displayName: displayName.slice(0, 120),
        };
      });

    return res.status(200).json({
      organizationId,
      entities,
      ...(resolveIdentity ? { candidateLimitReached: snapshot.docs.length === 200 } : {}),
    });
  } catch (error: any) {
    if (resolveIdentity) return res.status([400, 401, 403].includes(error?.status) ? error.status : 503).json({ error: 'FINANCE_CONTEXT_UNAVAILABLE' });
    if (
      error?.code === 'auth/id-token-expired' ||
      error?.code === 'auth/id-token-revoked' ||
      error?.code === 'auth/invalid-id-token' ||
      error?.code === 'auth/argument-error'
    ) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    console.error('Accessible finance entities error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
};
}
export default createEntitiesAccessibleHandler();
