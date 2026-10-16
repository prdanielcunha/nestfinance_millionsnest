import { createHash, createHmac } from 'node:crypto';

type PendingReviewSnapshot = {
  organizationId: string;
  financeEntityId: string;
  evidenceId: string;
  version: number;
  reviewStatus: string;
  occurredAt: Date;
};
export type FinanceConnectPendingEventOptions = {
  enabled: boolean;
  organizationId: string;
  financeEntityId: string;
  evidenceId: string;
  version: number;
  signingSecret?: string;
  operatorTargetsJson?: string;
  loadOfficialPendingReview: () => Promise<PendingReviewSnapshot | null>;
  now?: () => number;
  fetchImpl?: typeof fetch;
};
type Outcome = 'disabled' | 'not_configured' | 'not_pending' | 'accepted' | 'duplicate';
const safe = (v: unknown): v is string =>
  typeof v === 'string' && v.trim() === v && v.length > 0 && v.length <= 180 &&
  !/[\\/\u0000-\u001f\u007f]/.test(v);


export function parseFinanceOperatorTargets(operatorTargetsJson: string | undefined) {
  if (!operatorTargetsJson || operatorTargetsJson.length > 16000) return null;
  try {
    const parsed: unknown = JSON.parse(operatorTargetsJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const items = Object.entries(parsed);
    if (items.length > 100 || items.some(([org, candidate]) => {
      if (!safe(org) || !candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return true;
      const v = candidate as Record<string, unknown>;
      return Object.keys(v).length !== 2 ||
        !Object.keys(v).every(k => ['recipientUid', 'conversationId'].includes(k)) ||
        !safe(v.recipientUid) || !safe(v.conversationId);
    })) return null;
    return parsed as Record<string, { recipientUid: string; conversationId: string }>;
  } catch { return null; }


}

/** Connect receives only an opaque operator alert for a canonical finance signal.
 * It never receives documents, amounts, identity documents or tax records.
 * This bridge is not an alternative to finance.view/RBAC and never sends Meta. */
export async function publishCanonicalFinancePendingEvent(input: FinanceConnectPendingEventOptions): Promise<Outcome> {
  if (!input.enabled) return 'disabled';
  if (![input.organizationId, input.financeEntityId, input.evidenceId].every(safe) ||
    !Number.isSafeInteger(input.version) || input.version < 3)
    throw new Error('FINANCE_CONNECT_SOURCE_INVALID');

  if (!input.signingSecret || input.signingSecret.length < 32 || input.signingSecret.length > 4096 ||
      !input.operatorTargetsJson || input.operatorTargetsJson.length > 16000) return 'not_configured';
  const target = parseFinanceOperatorTargets(input.operatorTargetsJson)?.[input.organizationId];
  if (!target) return 'not_configured';

  const actual = await input.loadOfficialPendingReview();
  if (!actual || actual.organizationId !== input.organizationId ||
      actual.financeEntityId !== input.financeEntityId || actual.evidenceId !== input.evidenceId ||
      actual.version !== input.version || actual.reviewStatus !== 'pending' ||
      !(actual.occurredAt instanceof Date) || !Number.isFinite(+actual.occurredAt)) return 'not_pending';
  const now = (input.now ?? Date.now)();
  if (!Number.isSafeInteger(now) || now < +actual.occurredAt - 30000 ||
      now > +actual.occurredAt + 7 * 86400000) return 'not_pending';

  const eventId = createHash('sha256').update(JSON.stringify([
    'nestfinance', input.organizationId, input.financeEntityId, input.evidenceId, input.version,
  ])).digest('hex');
  const raw = JSON.stringify({
    schemaVersion: 1, sourceApp: 'nestfinance', eventId,
    organizationId: input.organizationId, conversationId: target.conversationId,
    occurredAt: actual.occurredAt.toISOString(),
    trigger: 'document.pending', recipientUid: target.recipientUid,
  });
  const timestamp = String(now);
  const signature = createHmac('sha256', input.signingSecret)
    .update('nestfinance\n' + timestamp + '\n' + raw).digest('hex');
  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(
      'https://connect.millionsnest.com/api/core/automations/events/nestfinance', {
        method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(2500),
        headers: { 'Content-Type': 'application/json', 'x-connect-timestamp': timestamp,
          'x-connect-signature': signature },
        body: raw,
      });
  } catch { throw new Error('FINANCE_CONNECT_TRANSPORT_UNCERTAIN'); }
  if (response.status !== 202) throw new Error('FINANCE_CONNECT_NOT_ACCEPTED');
  let answer: unknown;
  try { answer = await response.json(); } catch { throw new Error('FINANCE_CONNECT_RESPONSE_INVALID'); }
  const ack = answer as { accepted?: unknown; duplicate?: unknown } | null;
  if (!ack || ack.accepted !== true || typeof ack.duplicate !== 'boolean')
    throw new Error('FINANCE_CONNECT_RESPONSE_INVALID');
  return ack.duplicate ? 'duplicate' : 'accepted';
}
