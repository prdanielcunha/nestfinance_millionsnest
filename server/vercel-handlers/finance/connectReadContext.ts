import type { VercelRequest } from '@vercel/node';
import { getFirebaseAdmin } from '../../../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../../../api/_lib/ecosystemSessionResolver.js';
import { hasFinanceCapability, requireFinanceTransactionAccess, resolveHandoffBinding } from './accessHelpers.js';

const safeId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 180 && value === value.trim() && !['.', '..'].includes(value) && !/[\\/\u0000-\u001f]/.test(value);
const denied = (status: number) => ({ status, error: 'FINANCE_CONTEXT_UNAVAILABLE' });

/** Read-only bridge, never imported by financial mutations. No tokens/claims are minted or rewritten. */
async function readIdentity(req: VercelRequest) {
  const forwarded = req.headers['x-connect-user-authorization'];
  const authorization = forwarded === undefined ? req.headers.authorization : forwarded;
  if (typeof authorization !== 'string' || authorization.length > 8192 || !/^Bearer\s+\S+$/i.test(authorization)) throw denied(401);
  const admin = getFirebaseAdmin();
  let decoded;
  try { decoded = await admin.auth.verifyIdToken(authorization.replace(/^Bearer\s+/i, ''), true); }
  catch { throw denied(401); }
  if (!safeId(decoded.uid)) throw denied(401);
  // Connect-bound identity is explicitly admitted ONLY at this read entry.
  // The existing Finance handoff parser and every mutation stay unchanged.
  let binding;
  if (decoded.mn_app_id === 'connect') {
    if (decoded.mn_handoff_version !== 1 || !safeId(decoded.mn_organization_id) || !Number.isSafeInteger(decoded.mn_session_version) || decoded.mn_session_version < 1) throw denied(401);
    binding = { bound: true, organizationId: decoded.mn_organization_id as string, sessionVersion: decoded.mn_session_version as number };
  } else binding = resolveHandoffBinding(decoded);
  const header = req.headers['x-organization-id'];
  if (header !== undefined && !safeId(header)) throw denied(400);
  if (binding.bound && header !== undefined && binding.organizationId !== header) throw denied(403);
  const organizationId = binding.organizationId ?? header;
  if (!safeId(organizationId)) throw denied(400);
  const session = await resolveEcosystemSession(decoded.uid, organizationId, binding.bound ? {
    requireSessionVersion: true, expectedSessionVersion: binding.sessionVersion!,
  } : {});
  if (!session.granted) throw denied(session.denialReason === 'SESSION_VERSION_MISMATCH' ? 401 : 403);
  if (!hasFinanceCapability(session, 'finance.view')) throw denied(403);
  return { admin, db: admin.firestore, uid: decoded.uid, actorLabel: decoded.uid, organizationId, sessionList: session, session };
}

export async function resolveConnectFinanceReadIdentity(req: VercelRequest) {
  try { return await readIdentity(req); }
  catch (error: any) { throw denied([400, 401, 403].includes(error?.status) ? error.status : 503); }
}

export async function resolveConnectFinanceReadContext(req: VercelRequest) {
  const identity = await resolveConnectFinanceReadIdentity(req);
  const financeEntityId = req.body?.financeEntityId;
  if (!safeId(financeEntityId)) throw denied(400);
  let context;
  try { context = await requireFinanceTransactionAccess({ ...identity, financeEntityId, capability: 'finance.view' }); }
  catch (error: any) {
    const status = error?.message === 'FINANCE_ENTITY_NOT_FOUND' ? 404 : error?.message === 'FINANCE_ENTITY_NOT_ACTIVE' ? 409 : error?.message === 'FORBIDDEN_FINANCE_ACCESS' ? 403 : 503;
    throw denied(status);
  }
  return { ...identity, financeEntityId, context };
}
