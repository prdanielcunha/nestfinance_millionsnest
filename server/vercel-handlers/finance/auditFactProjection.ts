import { createHash } from 'node:crypto';
import type { DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';
import {
  buildFinanceFactEventId,
  stageFinanceFact,
  type FinanceFactInput,
} from './factStream.js';

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
  unresolvedLegacyScopeCount: number;
  organizationScopedCount: number;
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

export function buildAuditFactCorrelationId(auditEventId: string) {
  return `audit-event-v${AUDIT_FACT_PROJECTION_VERSION}:${auditEventId.trim()}`;
}

export function buildAuditFactInput(args: {
  organizationId: string;
  financeEntityId: string;
  auditEventId: string;
  auditRef: string;
  auditData: Record<string, any>;
}): FinanceFactInput {
  const { organizationId, financeEntityId, auditEventId, auditRef, auditData } = args;
  const action = boundedString(auditData.action, 120) || 'unknown';
  const resource =
    boundedString(auditData.resource, 80) ||
    boundedString(auditData.entityType, 80) ||
    'unknown';
  const resourceId =
    boundedString(auditData.resourceId, 180) ||
    boundedString(auditData.transactionId, 180) ||
    boundedString(auditData.reconciliationId, 180) ||
    boundedString(auditData.entityId, 180) ||
    null;
  const requestId = boundedString(auditData.requestId, 180);
  const rawActor = boundedString(auditData.actor ?? auditData.actorUid, 180);

  return {
    organizationId,
    eventType: 'AUDIT_EVENT_RECORDED',
    entityType: 'finance_audit_event',
    entityId: auditEventId,
    actorUserId: rawActor && rawActor !== 'system' ? rawActor : null,
    correlationId: buildAuditFactCorrelationId(auditEventId),
    occurredAt: auditData.createdAt || undefined,
    payload: {
      financeEntityId,
      auditEventId,
      action,
      resource,
      resourceId,
      requestId,
      metadata: buildCrossAppAuditMetadata(auditData),
      projectionKind: 'canonical_audit_projection',
      historicalEventInferred: false,
      financialMutation: false,
      auditMutation: false,
    },
    sourceRefs: [{ kind: 'audit', ref: auditRef }],
    confidence: 'verified',
  };
}

export function stageCanonicalAuditFact(
  transaction: Transaction,
  db: Firestore,
  args: {
    organizationId: string;
    financeEntityId: string;
    auditEventId: string;
    auditRef: string;
    auditData: Record<string, any>;
  },
) {
  return stageFinanceFact(
    transaction,
    db,
    buildAuditFactInput(args),
  );
}

export function stageCanonicalAuditRecord(
  transaction: Transaction,
  db: Firestore,
  auditRef: DocumentReference,
  auditData: Record<string, any>,
  writeMode: 'set' | 'create' = 'set',
) {
  const organizationId =
    typeof auditData.organizationId === 'string' ? auditData.organizationId : '';
  const financeEntityId =
    typeof auditData.financeEntityId === 'string' ? auditData.financeEntityId : '';
  const auditEventId =
    typeof auditData.eventId === 'string' && auditData.eventId
      ? auditData.eventId
      : auditRef.id;

  if (!organizationId || !financeEntityId || !auditEventId) {
    throw new Error('AUDIT_FACT_SOURCE_INVALID');
  }

  if (writeMode === 'create') transaction.create(auditRef, auditData);
  else transaction.set(auditRef, auditData);

  return stageCanonicalAuditFact(transaction, db, {
    organizationId,
    financeEntityId,
    auditEventId,
    auditRef: auditRef.path,
    auditData,
  });
}

export function stageCanonicalAuditCreate(
  transaction: Transaction,
  db: Firestore,
  auditRef: DocumentReference,
  auditData: Record<string, any>,
) {
  return stageCanonicalAuditRecord(transaction, db, auditRef, auditData, 'create');
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
  resolvedFinanceEntityId?: string | null,
): AuditFactProjectionCandidate | null {
  const data = doc.data() || {};
  const effectiveFinanceEntityId =
    typeof data.financeEntityId === 'string' && data.financeEntityId
      ? data.financeEntityId
      : resolvedFinanceEntityId || null;
  if (
    data.organizationId !== organizationId ||
    effectiveFinanceEntityId !== financeEntityId
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
  const rawActor = boundedString(data.actor ?? data.actorUid, 180);
  const actorUserId = rawActor && rawActor !== 'system' ? rawActor : null;
  const correlationId = buildAuditFactCorrelationId(doc.id);

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

function isOrganizationScopedAudit(data: Record<string, any>) {
  return (
    data.entityType === 'financeSettings' ||
    data.resource === 'finance_settings' ||
    data.action === 'finance.setup.initialized'
  );
}

function legacyAuditTargetRef(
  orgRef: FirebaseFirestore.DocumentReference,
  data: Record<string, any>,
): FirebaseFirestore.DocumentReference | null {
  const entityId =
    typeof data.entityId === 'string' && data.entityId ? data.entityId : null;
  if (!entityId) return null;

  if (data.entityType === 'financeAccount') {
    return orgRef.collection('financeAccounts').doc(entityId);
  }
  if (data.entityType === 'financeCategory') {
    return orgRef.collection('financeCategories').doc(entityId);
  }
  if (data.entityType === 'financeFund') {
    return orgRef.collection('financeFunds').doc(entityId);
  }
  return null;
}

export async function scanAuditFactProjectionCandidates(
  db: Firestore,
  organizationId: string,
  financeEntityId: string,
) {
  const orgRef = db.collection('organizations').doc(organizationId);
  const snapshot = await orgRef
    .collection('financeAuditLogs')
    .limit(AUDIT_FACT_PROJECTION_SCAN_MAX + 1)
    .get();

  const truncated = snapshot.size > AUDIT_FACT_PROJECTION_SCAN_MAX;
  const selected = snapshot.docs.slice(0, AUDIT_FACT_PROJECTION_SCAN_MAX);
  const targetRefs = new Map<string, FirebaseFirestore.DocumentReference>();

  for (const doc of selected) {
    const data = doc.data() || {};
    if (typeof data.financeEntityId === 'string' && data.financeEntityId) continue;
    if (data.entityType === 'financeEntity' && typeof data.entityId === 'string') continue;
    if (isOrganizationScopedAudit(data)) continue;
    const ref = legacyAuditTargetRef(orgRef, data);
    if (ref) targetRefs.set(ref.path, ref);
  }

  const resolvedTargetScopes = new Map<string, string | null>();
  const refs = [...targetRefs.values()];
  for (let index = 0; index < refs.length; index += 200) {
    const chunk = refs.slice(index, index + 200);
    if (chunk.length === 0) continue;
    const docs = await db.getAll(...chunk);
    for (const doc of docs) {
      const data = doc.data() || {};
      resolvedTargetScopes.set(
        doc.ref.path,
        typeof data.financeEntityId === 'string' && data.financeEntityId
          ? data.financeEntityId
          : null,
      );
    }
  }

  let unresolvedLegacyScopeCount = 0;
  let organizationScopedCount = 0;
  const candidates: AuditFactProjectionCandidate[] = [];

  for (const doc of selected) {
    const data = doc.data() || {};
    if (data.organizationId !== organizationId) continue;

    if (isOrganizationScopedAudit(data)) {
      organizationScopedCount += 1;
      continue;
    }

    let resolvedFinanceEntityId =
      typeof data.financeEntityId === 'string' && data.financeEntityId
        ? data.financeEntityId
        : null;

    if (
      !resolvedFinanceEntityId &&
      data.entityType === 'financeEntity' &&
      typeof data.entityId === 'string' &&
      data.entityId
    ) {
      resolvedFinanceEntityId = data.entityId;
    }

    if (!resolvedFinanceEntityId) {
      const targetRef = legacyAuditTargetRef(orgRef, data);
      if (targetRef) {
        resolvedFinanceEntityId =
          resolvedTargetScopes.get(targetRef.path) || null;
      }
    }

    if (!resolvedFinanceEntityId) {
      unresolvedLegacyScopeCount += 1;
      continue;
    }

    const candidate = candidateFromAuditDoc(
      organizationId,
      financeEntityId,
      doc,
      resolvedFinanceEntityId,
    );
    if (candidate) candidates.push(candidate);
  }

  candidates.sort((a, b) => a.auditEventId.localeCompare(b.auditEventId));
  return {
    candidates,
    unresolvedLegacyScopeCount,
    organizationScopedCount,
    truncated,
  };
}

export async function inspectAuditFactProjection(
  db: Firestore,
  organizationId: string,
  financeEntityId: string,
): Promise<AuditFactProjectionInspection> {
  const {
    candidates,
    unresolvedLegacyScopeCount,
    organizationScopedCount,
    truncated,
  } = await scanAuditFactProjectionCandidates(
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

  return {
    candidates,
    missing,
    verifiedExisting,
    unresolvedLegacyScopeCount,
    organizationScopedCount,
    truncated,
  };
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
