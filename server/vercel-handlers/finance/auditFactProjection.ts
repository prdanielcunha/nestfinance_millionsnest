import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { buildFinanceFactEventId } from './factStream.js';

export const AUDIT_FACT_PROJECTION_VERSION = 1 as const;
export const AUDIT_FACT_PROJECTION_SCAN_MAX = 1000 as const;
export const AUDIT_FACT_PROJECTION_BATCH_MAX = 100 as const;

export type CrossAppAuditMetadata = {
  status?: string;
  documentType?: string;
  reasonCode?: string;
  versionBefore?: number;
  versionAfter?: number;
  lineNumber?: number;
  periodKey?: string;
};

export type AuditFactProjectionCandidate = {
  auditEventId: string;
  factEventId: string;
  sourceRef: string;
  action: string;
  resource: string;
  resourceId: string | null;
  requestId: string | null;
  actorUserId: string | null;
  metadata: CrossAppAuditMetadata;
  occurredAt: any;
};

export type AuditFactProjectionInspection = {
  candidates: AuditFactProjectionCandidate[];
  missing: AuditFactProjectionCandidate[];
  verifiedExisting: AuditFactProjectionCandidate[];
  truncated: boolean;
};

function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/gu, ' ').trim();
  return normalized ? normalized.slice(0, max) : null;
}

function safeInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function buildCrossAppAuditMetadata(
  data: Record<string, any>,
): CrossAppAuditMetadata {
  const metadata =
    data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  const details =
    data.details && typeof data.details === 'object' ? data.details : {};

  const result: CrossAppAuditMetadata = {};
  const status = boundedString(metadata.status ?? details.status, 80);
  const documentType = boundedString(
    metadata.documentType ?? details.documentType,
    80,
  );
  const reasonCode = boundedString(metadata.reasonCode ?? details.reasonCode, 80);
  const periodKey = boundedString(metadata.periodKey ?? details.periodKey, 16);
  const versionBefore = safeInteger(
    metadata.versionBefore ?? details.versionBefore,
  );
  const versionAfter = safeInteger(metadata.versionAfter ?? details.versionAfter);
  const lineNumber = safeInteger(metadata.lineNumber ?? details.lineNumber);

  if (status) result.status = status;
  if (documentType) result.documentType = documentType;
  if (reasonCode) result.reasonCode = reasonCode;
  if (periodKey) result.periodKey = periodKey;
  if (versionBefore !== undefined) result.versionBefore = versionBefore;
  if (versionAfter !== undefined) result.versionAfter = versionAfter;
  if (lineNumber !== undefined) result.lineNumber = lineNumber;
  return result;
}

export function buildAuditProjectionCoverageId(
  organizationId: string,
  financeEntityId: string,
): string {
  const key = [
    organizationId.trim(),
    financeEntityId.trim(),
    `audit-projection-v${AUDIT_FACT_PROJECTION_VERSION}`,
  ].join(':');
  return `auditcov_${createHash('sha256').update(key).digest('hex')}`;
}

function candidateFromAuditDoc(
  organizationId: string,
  financeEntityId: string,
  doc: any,
): AuditFactProjectionCandidate | null {
  const data = doc.data() || {};
  if (
    data.organizationId !== organizationId ||
    data.financeEntityId !== financeEntityId
  ) {
    return null;
  }

  const action = boundedString(data.action, 120) || 'unknown';
  const resource =
    boundedString(data.resource, 80) ||
    boundedString(data.entityType, 80) ||
    'unknown';
  const resourceId =
    boundedString(data.resourceId, 180) ||
    boundedString(data.transactionId, 180) ||
    boundedString(data.reconciliationId, 180) ||
    boundedString(data.entityId, 180) ||
    null;
  const requestId = boundedString(data.requestId, 180);
  const rawActor = boundedString(data.actor, 180);
  const actorUserId = rawActor && rawActor !== 'system' ? rawActor : null;
  const correlationId =
    `audit-projection-v${AUDIT_FACT_PROJECTION_VERSION}`;

  return {
    auditEventId: doc.id,
    factEventId: buildFinanceFactEventId({
      organizationId,
      eventType: 'AUDIT_EVENT_RECORDED',
      entityType: 'finance_audit_event',
      entityId: doc.id,
      correlationId,
    }),
    sourceRef: doc.ref.path,
    action,
    resource,
    resourceId,
    requestId,
    actorUserId,
    metadata: buildCrossAppAuditMetadata(data),
    occurredAt: data.createdAt || null,
  };
}

export async function scanAuditFactProjectionCandidates(
  db: Firestore,
  organizationId: string,
  financeEntityId: string,
) {
  const orgRef = db.collection('organizations').doc(organizationId);
  const snapshot = await orgRef
    .collection('financeAuditLogs')
    .where('financeEntityId', '==', financeEntityId)
    .limit(AUDIT_FACT_PROJECTION_SCAN_MAX + 1)
    .get();

  const truncated = snapshot.size > AUDIT_FACT_PROJECTION_SCAN_MAX;
  const candidates = snapshot.docs
    .slice(0, AUDIT_FACT_PROJECTION_SCAN_MAX)
    .map((doc) => candidateFromAuditDoc(organizationId, financeEntityId, doc))
    .filter((item): item is AuditFactProjectionCandidate => Boolean(item))
    .sort((a, b) => a.auditEventId.localeCompare(b.auditEventId));

  return { candidates, truncated };
}

export async function inspectAuditFactProjection(
  db: Firestore,
  organizationId: string,
  financeEntityId: string,
): Promise<AuditFactProjectionInspection> {
  const { candidates, truncated } = await scanAuditFactProjectionCandidates(
    db,
    organizationId,
    financeEntityId,
  );
  const refs = candidates.map((item) =>
    db.collection('intelligenceFacts').doc(item.factEventId),
  );
  const facts = refs.length > 0 ? await db.getAll(...refs) : [];

  const missing: AuditFactProjectionCandidate[] = [];
  const verifiedExisting: AuditFactProjectionCandidate[] = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const snapshot = facts[index];
    const fact = snapshot?.data?.() || {};
    const verified =
      Boolean(snapshot?.exists) &&
      fact.organizationId === organizationId &&
      fact.sourceApp === 'NESTFINANCE' &&
      fact.eventType === 'AUDIT_EVENT_RECORDED' &&
      fact.entityType === 'finance_audit_event' &&
      fact.entityId === candidate.auditEventId &&
      fact.payload?.financeEntityId === financeEntityId &&
      fact.payload?.auditEventId === candidate.auditEventId &&
      fact.payload?.projectionKind === 'canonical_audit_projection' &&
      fact.payload?.historicalEventInferred === false &&
      Array.isArray(fact.sourceRefs) &&
      fact.sourceRefs.some(
        (source: any) =>
          source?.kind === 'audit' && source?.ref === candidate.sourceRef,
      );

    if (verified) verifiedExisting.push(candidate);
    else missing.push(candidate);
  }

  return { candidates, missing, verifiedExisting, truncated };
}

export function matchesAuditProjectionCandidate(
  candidate: AuditFactProjectionCandidate,
  data: Record<string, any>,
  organizationId: string,
  financeEntityId: string,
) {
  const currentAction = boundedString(data.action, 120) || 'unknown';
  const currentResource =
    boundedString(data.resource, 80) ||
    boundedString(data.entityType, 80) ||
    'unknown';
  const currentRequestId = boundedString(data.requestId, 180);

  return (
    data.organizationId === organizationId &&
    data.financeEntityId === financeEntityId &&
    candidate.auditEventId.length > 0 &&
    candidate.sourceRef.endsWith('/' + candidate.auditEventId) &&
    candidate.action === currentAction &&
    candidate.resource === currentResource &&
    candidate.requestId === currentRequestId
  );
}
