import { createHash } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';

const DEFAULT_REDEEM_LIMIT = 30;
const DEFAULT_WINDOW_MS = 60_000;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function resolveAllowedRedeemOrigins(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const configured = String(env.NESTFINANCE_HANDOFF_ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  if (configured.length > 0) return new Set(configured);

  const defaults = ['https://nestfinance.millionsnest.com'];
  if (env.NODE_ENV !== 'production') {
    defaults.push('http://localhost:3000', 'http://localhost:5173');
  }
  return new Set(defaults);
}

export function validateRedeemOrigin(
  origin: unknown,
  env: NodeJS.ProcessEnv = process.env,
): { allowed: true; origin: string | null } | { allowed: false; origin: string } {
  if (origin === undefined || origin === null || origin === '') {
    return { allowed: true, origin: null };
  }
  if (typeof origin !== 'string') return { allowed: false, origin: '' };
  const clean = origin.trim();
  return resolveAllowedRedeemOrigins(env).has(clean)
    ? { allowed: true, origin: clean }
    : { allowed: false, origin: clean };
}

export function resolveRedeemNetworkFingerprint(headers: Record<string, unknown>): string {
  const forwarded = headers['x-forwarded-for'];
  const realIp = headers['x-real-ip'];

  const candidate = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === 'string'
      ? forwarded
      : Array.isArray(realIp)
        ? realIp[0]
        : typeof realIp === 'string'
          ? realIp
          : 'unknown';

  const normalized = String(candidate || 'unknown')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)[0] || 'unknown';

  return sha256(normalized);
}

export async function enforceRedeemRateLimit(params: {
  db: Firestore;
  networkFingerprint: string;
  nowMs: number;
  limit?: number;
  windowMs?: number;
}): Promise<{ allowed: true; remaining: number } | { allowed: false; retryAfterSeconds: number }> {
  const {
    db,
    networkFingerprint,
    nowMs,
    limit = DEFAULT_REDEEM_LIMIT,
    windowMs = DEFAULT_WINDOW_MS,
  } = params;

  const scope = 'nestfinance_handoff_redeem';
  const docId = sha256(scope + '|' + networkFingerprint);
  const ref = db.collection('ecosystemHandoffRateLimits').doc(docId);

  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const previous = snap.exists ? (snap.data() || {}) : {};
    const previousWindowStartMs =
      typeof previous.windowStartMs === 'number' && Number.isFinite(previous.windowStartMs)
        ? previous.windowStartMs
        : nowMs;
    const sameWindow = nowMs >= previousWindowStartMs && nowMs < previousWindowStartMs + windowMs;
    const windowStartMs = sameWindow ? previousWindowStartMs : nowMs;
    const current = sameWindow ? Number(previous.count || 0) : 0;

    if (current >= limit) {
      return {
        allowed: false as const,
        retryAfterSeconds: Math.max(1, Math.ceil((windowStartMs + windowMs - nowMs) / 1000)),
      };
    }

    tx.set(ref, {
      scope,
      networkFingerprint,
      windowStartMs,
      count: current + 1,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return {
      allowed: true as const,
      remaining: Math.max(0, limit - current - 1),
    };
  });
}

export function buildRedeemAuditEvent(params: {
  eventId: string;
  eventType: 'handoff.redeemed' | 'handoff.redeem_rejected' | 'handoff.rate_limited' | 'handoff.origin_rejected';
  codeHash?: string | null;
  networkFingerprint: string;
  uid?: string | null;
  organizationId?: string | null;
  reason?: string | null;
  sessionVersion?: number | null;
}) {
  return {
    eventId: params.eventId,
    eventType: params.eventType,
    appId: 'nestfinance',
    protocol: 'one_time_code',
    handoffRefHash: params.codeHash || null,
    networkFingerprint: params.networkFingerprint,
    uidHash: params.uid ? sha256(params.uid) : null,
    organizationId: params.organizationId || null,
    reason: params.reason || null,
    sessionVersion: params.sessionVersion ?? null,
    timestamp: FieldValue.serverTimestamp(),
  };
}
