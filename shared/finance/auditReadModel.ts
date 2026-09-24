export const AUDIT_READ_LIMIT = 200;

export type AuditActorKind = 'user' | 'system' | 'unknown';

export type AuditSafeMetadata = {
  status?: string;
  documentType?: string;
  reason?: string;
  reasonCode?: string;
  versionBefore?: number;
  versionAfter?: number;
  lineNumber?: number;
  periodKey?: string;
};

export type AuditTimelineItem = {
  eventId: string;
  occurredAt: string | null;
  actorKind: AuditActorKind;
  actorDisplayName: string | null;
  resource: string;
  resourceId: string | null;
  action: string;
  requestId: string | null;
  metadata: AuditSafeMetadata;
};

export type AuditListResponse = {
  scope: 'current_finance_entity';
  source: 'canonical_finance_audit_log';
  readOnly: true;
  financialMutation: false;
  auditMutation: false;
  limit: number;
  truncated: boolean;
  hasMore: boolean;
  nextCursor?: string;
  items: AuditTimelineItem[];
};

const boundedString = (value: unknown, max = 160): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/\s+/gu, ' ').trim();
  return normalized ? normalized.slice(0, max) : undefined;
};

const safeInteger = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
};

export function buildSafeAuditMetadata(data: Record<string, unknown>): AuditSafeMetadata {
  const metadata =
    data.metadata && typeof data.metadata === 'object'
      ? (data.metadata as Record<string, unknown>)
      : {};
  const details =
    data.details && typeof data.details === 'object'
      ? (data.details as Record<string, unknown>)
      : {};

  const result: AuditSafeMetadata = {};
  const status = boundedString(metadata.status ?? details.status, 80);
  const documentType = boundedString(metadata.documentType ?? details.documentType, 80);
  const reason = boundedString(metadata.reason ?? details.reason, 160);
  const reasonCode = boundedString(metadata.reasonCode ?? details.reasonCode, 80);
  const versionBefore = safeInteger(metadata.versionBefore ?? details.versionBefore);
  const versionAfter = safeInteger(metadata.versionAfter ?? details.versionAfter);
  const lineNumber = safeInteger(metadata.lineNumber ?? details.lineNumber);
  const periodKey = boundedString(metadata.periodKey ?? details.periodKey, 16);

  if (status) result.status = status;
  if (documentType) result.documentType = documentType;
  if (reason) result.reason = reason;
  if (reasonCode) result.reasonCode = reasonCode;
  if (versionBefore !== undefined) result.versionBefore = versionBefore;
  if (versionAfter !== undefined) result.versionAfter = versionAfter;
  if (lineNumber !== undefined) result.lineNumber = lineNumber;
  if (periodKey) result.periodKey = periodKey;

  return result;
}

export function buildAuditTimelineItem(args: {
  eventId: string;
  occurredAt: string | null;
  actorKind: AuditActorKind;
  actorDisplayName: string | null;
  data: Record<string, unknown>;
}): AuditTimelineItem {
  const { eventId, occurredAt, actorKind, actorDisplayName, data } = args;
  const resource =
    boundedString(data.resource, 80) ??
    boundedString(data.entityType, 80) ??
    'unknown';

  const resourceId =
    boundedString(data.resourceId, 180) ??
    boundedString(data.transactionId, 180) ??
    boundedString(data.reconciliationId, 180) ??
    boundedString(data.entityId, 180) ??
    null;

  return {
    eventId,
    occurredAt,
    actorKind,
    actorDisplayName,
    resource,
    resourceId,
    action: boundedString(data.action, 120) ?? 'unknown',
    requestId: boundedString(data.requestId, 180) ?? null,
    metadata: buildSafeAuditMetadata(data),
  };
}
