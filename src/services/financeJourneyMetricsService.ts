import { firebaseAuth } from '@/src/lib/firebase';

export type FinanceJourneyMetric =
  | 'login'
  | 'entity_selection'
  | 'flow_start'
  | 'flow_complete';

type RecordOptions = {
  organizationId: string;
  flow?: string;
  dedupeKey?: string;
};

type MetricQueue = Record<string, number>;
type ScopedMetricQueue = Record<string, MetricQueue>;

const QUEUE_KEY = 'nestfinance_journey_metrics_v1';
const DEDUPE_PREFIX = 'nestfinance_journey_metric_seen:';
let flushTimer: number | null = null;
let flushing = false;

function safeReadQueue(): ScopedMetricQueue {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const scopedQueue: ScopedMetricQueue = {};
    for (const [organizationId, rawCounts] of Object.entries(parsed)) {
      if (!rawCounts || typeof rawCounts !== 'object' || Array.isArray(rawCounts)) continue;
      const counts: MetricQueue = {};
      for (const [key, value] of Object.entries(rawCounts)) {
        if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
          counts[key] = value;
        }
      }
      if (Object.keys(counts).length > 0) scopedQueue[organizationId] = counts;
    }
    return scopedQueue;
  } catch {
    return {};
  }
}

function safeWriteQueue(queue: ScopedMetricQueue) {
  try {
    if (Object.keys(queue).length === 0) {
      localStorage.removeItem(QUEUE_KEY);
    } else {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    }
  } catch {
    // Telemetry must never block a financial workflow.
  }
}

function normalizeFlow(flow?: string) {
  if (!flow) return undefined;
  const normalized = flow.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 40);
  return normalized || undefined;
}

function buildMetricKey(metric: FinanceJourneyMetric, flow?: string) {
  const normalizedFlow = normalizeFlow(flow);
  return normalizedFlow ? `${metric}:${normalizedFlow}` : metric;
}

function hasSeenDedupeKey(key: string) {
  try {
    return sessionStorage.getItem(`${DEDUPE_PREFIX}${key}`) === '1';
  } catch {
    return false;
  }
}

function markDedupeKey(key: string) {
  try {
    sessionStorage.setItem(`${DEDUPE_PREFIX}${key}`, '1');
  } catch {
    // Session-level dedupe is best effort only.
  }
}

function scheduleFlush() {
  if (typeof window === 'undefined' || flushTimer !== null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushFinanceJourneyMetrics();
  }, 1500);
}

export function recordFinanceJourneyMetric(
  metric: FinanceJourneyMetric,
  options: RecordOptions,
) {
  const organizationId = options.organizationId.trim();
  if (!organizationId) return;

  const dedupeKey = options.dedupeKey
    ? `${organizationId}:${options.dedupeKey}`
    : undefined;
  if (dedupeKey && hasSeenDedupeKey(dedupeKey)) return;

  const key = buildMetricKey(metric, options.flow);
  const queue = safeReadQueue();
  const organizationQueue = queue[organizationId] || {};
  organizationQueue[key] = Math.min((organizationQueue[key] || 0) + 1, 100);
  queue[organizationId] = organizationQueue;
  safeWriteQueue(queue);

  if (dedupeKey) markDedupeKey(dedupeKey);
  scheduleFlush();
}

export async function flushFinanceJourneyMetrics() {
  if (flushing) return;
  const user = firebaseAuth.currentUser;
  if (!user) return;

  flushing = true;
  try {
    const tokenResult = await user.getIdTokenResult();
    const organizationId =
      typeof tokenResult.claims.mn_organization_id === 'string'
        ? tokenResult.claims.mn_organization_id
        : '';
    if (!organizationId) return;

    const queue = safeReadQueue();
    const snapshot = queue[organizationId];
    if (!snapshot || Object.keys(snapshot).length === 0) return;

    const response = await fetch('/api/finance/metrics/record', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenResult.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ counts: snapshot }),
      cache: 'no-store',
      keepalive: true,
    });

    if (!response.ok) return;

    const current = safeReadQueue();
    const currentOrganizationQueue = current[organizationId] || {};
    for (const [key, sentCount] of Object.entries(snapshot)) {
      const remaining = (currentOrganizationQueue[key] || 0) - sentCount;
      if (remaining > 0) currentOrganizationQueue[key] = remaining;
      else delete currentOrganizationQueue[key];
    }

    if (Object.keys(currentOrganizationQueue).length > 0) {
      current[organizationId] = currentOrganizationQueue;
    } else {
      delete current[organizationId];
    }
    safeWriteQueue(current);
  } catch {
    // Offline or transient failures stay queued locally for a later attempt.
  } finally {
    flushing = false;
  }
}
