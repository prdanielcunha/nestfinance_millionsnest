import { firebaseAuth } from '@/src/lib/firebase';

export type FinanceJourneyMetric =
  | 'login'
  | 'entity_selection'
  | 'flow_start'
  | 'flow_complete';

type RecordOptions = {
  flow?: string;
  dedupeKey?: string;
};

type MetricQueue = Record<string, number>;

const QUEUE_KEY = 'nestfinance_journey_metrics_v1';
const DEDUPE_PREFIX = 'nestfinance_journey_metric_seen:';
let flushTimer: number | null = null;
let flushing = false;

function safeReadQueue(): MetricQueue {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const queue: MetricQueue = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
        queue[key] = value;
      }
    }
    return queue;
  } catch {
    return {};
  }
}

function safeWriteQueue(queue: MetricQueue) {
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
  options: RecordOptions = {},
) {
  if (options.dedupeKey && hasSeenDedupeKey(options.dedupeKey)) return;

  const key = buildMetricKey(metric, options.flow);
  const queue = safeReadQueue();
  queue[key] = Math.min((queue[key] || 0) + 1, 100);
  safeWriteQueue(queue);

  if (options.dedupeKey) markDedupeKey(options.dedupeKey);
  scheduleFlush();
}

export async function flushFinanceJourneyMetrics() {
  if (flushing) return;
  const user = firebaseAuth.currentUser;
  if (!user) return;

  const snapshot = safeReadQueue();
  if (Object.keys(snapshot).length === 0) return;

  flushing = true;
  try {
    const token = await user.getIdToken();
    const response = await fetch('/api/finance/metrics/record', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ counts: snapshot }),
      cache: 'no-store',
      keepalive: true,
    });

    if (!response.ok) return;

    const current = safeReadQueue();
    for (const [key, sentCount] of Object.entries(snapshot)) {
      const remaining = (current[key] || 0) - sentCount;
      if (remaining > 0) current[key] = remaining;
      else delete current[key];
    }
    safeWriteQueue(current);
  } catch {
    // Offline or transient failures stay queued locally for a later attempt.
  } finally {
    flushing = false;
  }
}
