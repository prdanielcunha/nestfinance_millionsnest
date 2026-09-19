import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';

const MAX_ORGANIZATIONS = 50;

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isSafeOrganizationId(value: unknown): value is string {
  const text = cleanString(value);
  return Boolean(text) && text.length <= 256 && !text.includes('/') && !text.includes('\\');
}

function isInactive(value: any): boolean {
  return value?.disabled === true || ['inactive', 'suspended', 'disabled', 'removed', 'revoked', 'archived'].includes(cleanString(value?.status).toLowerCase());
}

function collectCandidateOrganizationIds(userData: Record<string, any>): string[] {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    if (isSafeOrganizationId(value)) ids.add(cleanString(value));
  };

  add(userData.activeOrganizationId);
  add(userData.primaryOrganizationId);
  add(userData.defaultOrganizationId);
  add(userData.organizationId);

  for (const value of Array.isArray(userData.organizationIds) ? userData.organizationIds : []) add(value);
  for (const value of Array.isArray(userData.organizations) ? userData.organizations : []) {
    if (typeof value === 'string') add(value);
    else if (value && typeof value === 'object') add((value as Record<string, unknown>).id || (value as Record<string, unknown>).organizationId);
  }
  for (const value of Array.isArray(userData.memberships) ? userData.memberships : []) {
    if (typeof value === 'string') add(value);
    else if (value && typeof value === 'object') add((value as Record<string, unknown>).organizationId);
  }

  return Array.from(ids).slice(0, MAX_ORGANIZATIONS);
}

async function issueScopedToken(auth: any, uid: string, organizationId: string, accessSource: string) {
  return auth.createCustomToken(uid, {
    mn_app_id: 'nestfinance',
    mn_organization_id: organizationId,
    mn_handoff_version: 1,
    mn_access_source: accessSource,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const authorization = req.headers.authorization;
  if (!authorization || typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const requestedOrganizationId = body.organizationId === undefined || body.organizationId === null || body.organizationId === ''
    ? null
    : body.organizationId;

  if (requestedOrganizationId !== null && !isSafeOrganizationId(requestedOrganizationId)) {
    return res.status(400).json({ error: 'INVALID_ORGANIZATION_ID' });
  }

  const admin = getFirebaseAdmin();
  let decoded: any;
  try {
    decoded = await admin.auth.verifyIdToken(authorization.slice(7), true);
  } catch {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  const uid = cleanString(decoded?.uid);
  if (!uid) return res.status(401).json({ error: 'UNAUTHORIZED' });

  const userDoc = await admin.firestore.collection('users').doc(uid).get();
  if (!userDoc.exists) return res.status(403).json({ error: 'NO_NESTFINANCE_ACCESS' });

  const userData = userDoc.data() || {};
  if (isInactive(userData)) return res.status(403).json({ error: 'NO_NESTFINANCE_ACCESS' });

  const candidateIds = new Set<string>(collectCandidateOrganizationIds(userData));

  // Candidate discovery is intentionally broader than authorization. This keeps
  // direct/PWA entry usable even when the user profile has no denormalized
  // organization hints. No organization is returned or token issued until the
  // canonical MillionsNest resolver grants access for that exact tenant.
  const organizationsSnapshot = await admin.firestore.collection('organizations').limit(MAX_ORGANIZATIONS).get();
  for (const doc of organizationsSnapshot.docs) {
    if (!isInactive(doc.data())) candidateIds.add(doc.id);
  }

  const eligible: Array<{ id: string; name: string; slug: string; accessSource: string }> = [];

  for (const organizationId of Array.from(candidateIds).slice(0, MAX_ORGANIZATIONS)) {
    try {
      const resolution = await resolveEcosystemSession(uid, organizationId);
      if (!resolution.granted) continue;
      eligible.push({
        id: organizationId,
        name: cleanString(resolution.organization?.name) || organizationId,
        slug: cleanString(resolution.organization?.slug),
        accessSource: resolution.accessSource,
      });
    } catch {
      // A single malformed/stale candidate must not make another valid organization unusable.
    }
  }

  eligible.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  if (requestedOrganizationId) {
    const selected = eligible.find((organization) => organization.id === cleanString(requestedOrganizationId));
    if (!selected) return res.status(403).json({ error: 'NO_NESTFINANCE_ACCESS' });

    const customToken = await issueScopedToken(admin.auth, uid, selected.id, selected.accessSource);
    return res.status(200).json({
      status: 'ready',
      customToken,
      organization: { id: selected.id, name: selected.name, slug: selected.slug },
    });
  }

  if (eligible.length === 0) {
    return res.status(403).json({ error: 'NO_NESTFINANCE_ACCESS' });
  }

  if (eligible.length === 1) {
    const selected = eligible[0];
    const customToken = await issueScopedToken(admin.auth, uid, selected.id, selected.accessSource);
    return res.status(200).json({
      status: 'ready',
      customToken,
      organization: { id: selected.id, name: selected.name, slug: selected.slug },
    });
  }

  return res.status(200).json({
    status: 'choose_organization',
    organizations: eligible.map(({ id, name, slug }) => ({ id, name, slug })),
  });
}
