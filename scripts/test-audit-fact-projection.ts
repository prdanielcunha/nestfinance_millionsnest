import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildCrossAppAuditMetadata,
  buildAuditProjectionCoverageId,
} from '../server/vercel-handlers/finance/auditFactProjection.js';

const safe = buildCrossAppAuditMetadata({
  metadata: {
    status: 'reviewed',
    documentType: 'receipt',
    reasonCode: 'wrong_transaction',
    reason: 'free form must not cross',
    amountCents: 999999,
    contributorName: 'Sensitive Person',
    versionBefore: 2,
    versionAfter: 3,
    lineNumber: 7,
    periodKey: '2026-09',
  },
});

assert.deepStrictEqual(safe, {
  status: 'reviewed',
  documentType: 'receipt',
  reasonCode: 'wrong_transaction',
  versionBefore: 2,
  versionAfter: 3,
  lineNumber: 7,
  periodKey: '2026-09',
});
assert.ok(!JSON.stringify(safe).includes('999999'));
assert.ok(!JSON.stringify(safe).includes('Sensitive Person'));
assert.ok(!JSON.stringify(safe).includes('free form'));

assert.equal(
  buildAuditProjectionCoverageId('org-a', 'entity-a'),
  buildAuditProjectionCoverageId('org-a', 'entity-a'),
);
assert.notEqual(
  buildAuditProjectionCoverageId('org-a', 'entity-a'),
  buildAuditProjectionCoverageId('org-a', 'entity-b'),
);

const [projection, apply, preview, verify, factStream, gateway, contracts, crossApp] =
  await Promise.all([
    readFile('server/vercel-handlers/finance/auditFactProjection.ts', 'utf8'),
    readFile('server/vercel-handlers/finance/auditFactProjectionApply.ts', 'utf8'),
    readFile('server/vercel-handlers/finance/auditFactProjectionPreview.ts', 'utf8'),
    readFile('server/vercel-handlers/finance/auditFactProjectionVerify.ts', 'utf8'),
    readFile('server/vercel-handlers/finance/factStream.ts', 'utf8'),
    readFile('api/finance-gateway.ts', 'utf8'),
    readFile('scripts/check-api-contracts.mjs', 'utf8'),
    readFile('shared/intelligence/financeCrossAppEvents.ts', 'utf8'),
  ]);

for (const source of [apply, preview, verify]) {
  assert.ok(source.includes("hasEffectiveCapability(sessionList, 'finance.manage')"));
  assert.ok(source.includes('financialMutation: false'));
}
assert.ok(projection.includes("eventType: 'AUDIT_EVENT_RECORDED'"));
assert.ok(projection.includes("projectionKind: 'canonical_audit_projection'"));
assert.ok(projection.includes('historicalEventInferred: false'));
assert.ok(projection.includes("sourceRefs: [{ kind: 'audit', ref: auditRef }]"));
assert.ok(projection.includes('occurredAt: auditData.createdAt || undefined'));
assert.ok(!projection.includes('amountCents'));
assert.ok(!projection.includes('note:'));
assert.ok(!projection.includes('amountCents'));
assert.ok(!projection.includes('contributorName'));
assert.ok(factStream.includes('occurredAt?: Timestamp | FieldValue'));
assert.ok(factStream.includes('const occurredAt = input.occurredAt || serverTimestamp'));
assert.ok(projection.includes('stageCanonicalAuditFact'));
assert.ok(projection.includes('buildAuditFactCorrelationId'));
assert.ok(apply.includes('buildAuditFactInput({'));
assert.ok(gateway.includes("case 'audit-fact-projection-preview'"));
assert.ok(gateway.includes("case 'audit-fact-projection-apply'"));
assert.ok(gateway.includes("case 'audit-fact-projection-verify'"));
assert.ok(contracts.includes("operation: 'audit-fact-projection-preview'"));
assert.ok(contracts.includes("operation: 'audit-fact-projection-apply'"));
assert.ok(contracts.includes("operation: 'audit-fact-projection-verify'"));
assert.ok(
  crossApp.includes("AUDIT_EVENT_RECORDED: {") &&
    crossApp.includes("state: 'emitted'"),
  'cross-app audit event is live while historical coverage remains independently certifiable',
);
assert.ok(
  verify.includes("coverageKind: 'audit_fact_projection'"),
  'historical audit completeness remains an explicit coverage certification',
);

console.log('✅ Audit fact projection is permissioned, idempotent-ready and privacy bounded');
