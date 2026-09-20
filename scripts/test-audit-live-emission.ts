import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migratedWriters = [
  'server/vercel-handlers/finance/transactionsCreateDraft.ts',
  'server/vercel-handlers/finance/transactionsUpdateDraft.ts',
  'server/vercel-handlers/finance/transactionsCreateAndSubmit.ts',
  'server/vercel-handlers/finance/transactionsSubmitForReview.ts',
  'server/vercel-handlers/finance/transactionsApproveForPosting.ts',
  'server/vercel-handlers/finance/transactionsReturnToDraft.ts',
  'server/vercel-handlers/finance/transactionsInvalidateApproval.ts',
  'server/vercel-handlers/finance/transactionsRepairApprovalVerification.ts',
  'server/vercel-handlers/finance/countSessionsCreate.ts',
  'server/vercel-handlers/finance/countSessionsSaveFirstCount.ts',
  'server/vercel-handlers/finance/countSessionsStartSecondCount.ts',
  'server/vercel-handlers/finance/countSessionsSubmitSecondCount.ts',
  'server/vercel-handlers/finance/countSessionsStartRecount.ts',
  'server/vercel-handlers/finance/countSessionsSubmitRecount.ts',
  'server/vercel-handlers/finance/countCapturesStart.ts',
  'server/vercel-handlers/finance/countCapturesFinalize.ts',
  'server/vercel-handlers/finance/countCapturesSaveReview.ts',
  'server/vercel-handlers/finance/countCapturesSaveDenominationReview.ts',
  'server/vercel-handlers/finance/countFreeFormCapturesStart.ts',
  'server/vercel-handlers/finance/countFreeFormCapturesFinalize.ts',
  'server/vercel-handlers/finance/countPaperFormsGenerate.ts',
  'server/vercel-handlers/finance/universalEvidenceStart.ts',
  'server/vercel-handlers/finance/universalEvidenceFinalize.ts',
  'server/vercel-handlers/finance/universalEvidenceClassify.ts',
  'server/vercel-handlers/finance/universalEvidenceReview.ts',
  'server/vercel-handlers/finance/reconciliationConfirm.ts',
  'server/vercel-handlers/finance/reconciliationReverse.ts',
  'server/vercel-handlers/finance/periodCloseReviewConfirm.ts',
] as const;

const helper = await readFile(
  'server/vercel-handlers/finance/auditFactProjection.ts',
  'utf8',
);
assert.ok(helper.includes('stageCanonicalAuditRecord('));
assert.ok(helper.includes('stageCanonicalAuditCreate('));
assert.ok(helper.includes("eventType: 'AUDIT_EVENT_RECORDED'"));
assert.ok(helper.includes("sourceRefs: [{ kind: 'audit', ref: auditRef }]"));
assert.ok(helper.includes('historicalEventInferred: false'));

for (const path of migratedWriters) {
  const source = await readFile(path, 'utf8');
  assert.ok(
    source.includes('stageCanonicalAuditRecord') ||
      source.includes('stageCanonicalAuditCreate'),
    path + ' must emit its audit fact atomically',
  );
  assert.ok(
    !source.includes('t.set(auditRef,') &&
      !source.includes('transaction.set(auditRef,') &&
      !source.includes('t.create(auditRef,') &&
      !source.includes('transaction.create(auditRef,') &&
      !source.includes('t.set(context.repository.getAuditRef().doc(auditId),') &&
      !source.includes('transaction.set(context.repository.getAuditRef().doc(auditId),') &&
      !source.includes('t.create(context.repository.getAuditRef().doc(auditId),') &&
      !source.includes('transaction.create(context.repository.getAuditRef().doc(auditId),'),
    path + ' must not bypass the canonical audit helper on migrated audit writes',
  );
}

const crossApp = await readFile(
  'shared/intelligence/financeCrossAppEvents.ts',
  'utf8',
);
assert.ok(
  crossApp.includes("AUDIT_EVENT_RECORDED: {") &&
    crossApp.includes("state: 'reserved'"),
  'AUDIT_EVENT_RECORDED stays reserved until legacy direct writers are migrated',
);

console.log(
  '✅ Live audit emission is atomic across ' +
    migratedWriters.length +
    ' transaction-backed writers',
);
