import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import reconciliationProgress from '../server/vercel-handlers/finance/reconciliationProgress.js';
import { prepareStatementLines } from '../shared/finance/reconciliationStatementLines.js';
import {
  buildLegacyReconciliationId,
  buildReconciliationLineLockId,
  buildStatementLineFingerprint,
} from '../server/vercel-handlers/finance/reconciliationConfirmationIds.js';

class MockRes {
  statusCode = 200;
  body: any = null;
  headers = new Map<string, string>();
  status(code: number) { this.statusCode = code; return this; }
  json(body: any) { this.body = body; return this; }
  setHeader(name: string, value: string) {
    this.headers.set(name.toLowerCase(), String(value));
    return this;
  }
}

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const txId = () => 'tx_' + randomBytes(12).toString('hex');

function escapePdfString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdf(text: string) {
  const payload = Buffer.from(
    'BT /F1 12 Tf 72 720 Td (' + escapePdfString(text) + ') Tj ET',
    'latin1',
  );
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'latin1'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>', 'latin1'),
    Buffer.concat([
      Buffer.from('<< /Length ' + payload.length + ' >>\nstream\n', 'latin1'),
      payload,
      Buffer.from('\nendstream', 'latin1'),
    ]),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', 'latin1'),
  ];
  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets = [0];
  let length = chunks[0].length;
  for (let index = 0; index < objects.length; index += 1) {
    offsets[index + 1] = length;
    const object = Buffer.concat([
      Buffer.from(String(index + 1) + ' 0 obj\n', 'latin1'),
      objects[index],
      Buffer.from('\nendobj\n', 'latin1'),
    ]);
    chunks.push(object);
    length += object.length;
  }
  const xrefOffset = length;
  const rows = ['0000000000 65535 f '].concat(
    offsets.slice(1).map((offset) => String(offset).padStart(10, '0') + ' 00000 n '),
  );
  chunks.push(
    Buffer.from(
      'xref\n0 6\n' +
        rows.join('\n') +
        '\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' +
        xrefOffset +
        '\n%%EOF\n',
      'latin1',
    ),
  );
  return Buffer.concat(chunks);
}

process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || 'nestfinance-reconciliation-progress-emulator';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Reconciliation progress test requires Firestore Emulator');
}

resetFirebaseAdminForTests();
const admin = getFirebaseAdmin();
const db = admin.firestore;

const suffix = randomBytes(4).toString('hex');
const orgId = 'org_rec_progress_' + suffix;
const entityId = 'ent_rec_progress_' + suffix;
const otherEntityId = 'ent_rec_progress_other_' + suffix;
const uid = 'usr_rec_progress_' + suffix;
const accountId = 'acc_rec_progress_' + suffix;

await db.collection('organizations').doc(orgId).set({ name: 'Progress Org', status: 'active' });
await db.collection('users').doc(uid).set({ systemRole: 'ceo' });
await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityId).set({
  name: 'Progress Entity',
  active: true,
});
await db.collection('organizations').doc(orgId).collection('financeEntities').doc(otherEntityId).set({
  name: 'Other Entity',
  active: true,
});
await db.collection('organizations').doc(orgId).collection('financeAccounts').doc(accountId).set({
  organizationId: orgId,
  financeEntityId: entityId,
  name: 'Conta principal',
  type: 'bank_checking',
  nature: 'asset',
  configurationStatus: 'complete',
  institutionName: 'Banco Teste',
  accountLast4: '1234',
  active: true,
});

const objects = new Map<string, { bytes: Buffer; contentType: string }>();
(globalThis as any)[Symbol.for('TEST_UNIVERSAL_EVIDENCE_STORAGE')] = {
  async createUploadUrl(path: string) {
    return { url: 'memory://' + path, requiredHeaders: { 'x-goog-if-generation-match': '0' } };
  },
  async inspectAndHash(path: string) {
    const object = objects.get(path);
    if (!object) throw new Error('EVIDENCE_UPLOAD_MISSING');
    return {
      path,
      contentType: object.contentType,
      size: object.bytes.length,
      sha256: sha(object.bytes),
      headerBytes: object.bytes.subarray(0, 65536),
    };
  },
  async readPreview(path: string) {
    const object = objects.get(path);
    if (!object) throw new Error('EVIDENCE_UPLOAD_MISSING');
    return {
      bytes: object.bytes,
      contentType: object.contentType,
      size: object.bytes.length,
      sha256: sha(object.bytes),
    };
  },
};

async function seedEvidence(text: string) {
  const evidenceId = 'evd_' + randomBytes(16).toString('hex');
  const pdf = buildPdf(text);
  const path =
    'organizations/' + orgId + '/financeEntities/' + entityId + '/evidence/' + evidenceId + '/original.pdf';
  objects.set(path, { bytes: pdf, contentType: 'application/pdf' });

  await db
    .collection('organizations')
    .doc(orgId)
    .collection('financeEntities')
    .doc(entityId)
    .collection('universalEvidence')
    .doc(evidenceId)
    .set({
      evidenceId,
      organizationId: orgId,
      financeEntityId: entityId,
      originalFilename: 'extrato.pdf',
      verifiedMimeType: 'application/pdf',
      byteSize: pdf.length,
      processingState: 'accepted',
      duplicate: false,
      classification: { documentType: 'bank_statement', source: 'human' },
      review: { status: 'reviewed', reviewedAt: Timestamp.now() },
      original: {
        path,
        immutable: true,
        verifiedMimeType: 'application/pdf',
        verifiedByteSize: pdf.length,
        verifiedSha256: sha(pdf),
      },
      createdAt: Timestamp.now(),
      version: 4,
    });

  return { evidenceId, text };
}

async function seedTx(
  id: string,
  amountCents: number,
  occurredAt: string,
  overrides: Record<string, unknown> = {},
) {
  await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(id).set({
    id,
    organizationId: orgId,
    financeEntityId: entityId,
    transactionKind: 'income',
    direction: 'income',
    cashFlowDirection: 'inflow',
    status: 'posted',
    reconciliationStatus: 'unreconciled',
    amountCents,
    currency: 'BRL',
    occurredAt,
    accountId,
    description: id,
    version: 3,
    contentVersion: 1,
    ...overrides,
  });
}

function lineIdentity(evidenceId: string, text: string) {
  const line = prepareStatementLines(text).lines[0];
  assert.ok(line, 'seed statement line must parse');
  const fingerprint = buildStatementLineFingerprint({
    organizationId: orgId,
    financeEntityId: entityId,
    evidenceId,
    line,
  });
  return { line, fingerprint };
}

const activeSource = await seedEvidence('02/09/2026 PIX 100,00 C');
const releasedSource = await seedEvidence('03/09/2026 PIX 200,00 C');
const legacySource = await seedEvidence('04/09/2026 OFERTA 300,00 C');
const candidateSource = await seedEvidence('05/09/2026 TED 400,00 C');

const activeTx = txId();
const releasedCandidateTx = txId();
const legacyTx = txId();
const candidateTx = txId();

const activeIdentity = lineIdentity(activeSource.evidenceId, activeSource.text);
const releasedIdentity = lineIdentity(releasedSource.evidenceId, releasedSource.text);
const legacyIdentity = lineIdentity(legacySource.evidenceId, legacySource.text);

const activeRecId = 'rec_' + 'a'.repeat(64);
const activeLockId = buildReconciliationLineLockId({
  organizationId: orgId,
  financeEntityId: entityId,
  evidenceId: activeSource.evidenceId,
  statementLineFingerprint: activeIdentity.fingerprint,
});
await seedTx(activeTx, 10000, '2026-09-02T12:00:00.000Z', {
  reconciliationStatus: 'reconciled',
  reconciliationId: activeRecId,
  reconciliationLineLockId: activeLockId,
});
await db.collection('organizations').doc(orgId).collection('financeReconciliations').doc(activeRecId).set({
  reconciliationId: activeRecId,
  lineLockId: activeLockId,
  organizationId: orgId,
  financeEntityId: entityId,
  accountId,
  transactionId: activeTx,
  evidenceId: activeSource.evidenceId,
  statementLineFingerprint: activeIdentity.fingerprint,
  statementLineNumber: 1,
  status: 'confirmed',
  schemaVersion: 2,
});
await db.collection('organizations').doc(orgId).collection('financeReconciliationLineLocks').doc(activeLockId).set({
  lineLockId: activeLockId,
  organizationId: orgId,
  financeEntityId: entityId,
  evidenceId: activeSource.evidenceId,
  statementLineFingerprint: activeIdentity.fingerprint,
  status: 'active',
  activeReconciliationId: activeRecId,
  activeTransactionId: activeTx,
  schemaVersion: 1,
});

const releasedLockId = buildReconciliationLineLockId({
  organizationId: orgId,
  financeEntityId: entityId,
  evidenceId: releasedSource.evidenceId,
  statementLineFingerprint: releasedIdentity.fingerprint,
});
await seedTx(releasedCandidateTx, 20000, '2026-09-03T12:00:00.000Z');
await db.collection('organizations').doc(orgId).collection('financeReconciliationLineLocks').doc(releasedLockId).set({
  lineLockId: releasedLockId,
  organizationId: orgId,
  financeEntityId: entityId,
  evidenceId: releasedSource.evidenceId,
  statementLineFingerprint: releasedIdentity.fingerprint,
  status: 'released',
  activeReconciliationId: null,
  activeTransactionId: null,
  releaseReversalId: 'rrev_' + 'b'.repeat(64),
  schemaVersion: 1,
});

const legacyRecId = buildLegacyReconciliationId({
  organizationId: orgId,
  financeEntityId: entityId,
  evidenceId: legacySource.evidenceId,
  statementLineFingerprint: legacyIdentity.fingerprint,
});
await seedTx(legacyTx, 30000, '2026-09-04T12:00:00.000Z', {
  reconciliationStatus: 'reconciled',
  reconciliationId: legacyRecId,
});
await db.collection('organizations').doc(orgId).collection('financeReconciliations').doc(legacyRecId).set({
  reconciliationId: legacyRecId,
  organizationId: orgId,
  financeEntityId: entityId,
  accountId,
  transactionId: legacyTx,
  evidenceId: legacySource.evidenceId,
  statementLineFingerprint: legacyIdentity.fingerprint,
  statementLineNumber: 1,
  status: 'confirmed',
  schemaVersion: 1,
});

await seedTx(candidateTx, 40000, '2026-09-05T12:00:00.000Z');

const originalVerify = admin.auth.verifyIdToken;
admin.auth.verifyIdToken = async () => ({ uid, mn_app_id: 'nestfinance', mn_handoff_version: 1, mn_organization_id: orgId, mn_session_version: 1 }) as any;

const call = async (evidenceId: string, financeEntityId = entityId) => {
  const req = {
    method: 'POST',
    headers: {
      authorization: 'Bearer progress-test',
      'x-organization-id': orgId,
    },
    body: { financeEntityId, evidenceId, accountId },
    query: {},
  };
  const res = new MockRes();
  await reconciliationProgress(req as any, res as any);
  return res;
};

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log('✅ ' + message);
};

try {
  const active = await call(activeSource.evidenceId);
  verify(
    active.statusCode === 200 &&
      active.body.lines[0]?.state === 'confirmed' &&
      active.body.lines[0]?.activeTransactionId === activeTx &&
      active.body.summary.confirmedItems === 1 &&
      active.body.summary.remainingItems === 0,
    'verified v2 active line lock and current transaction produce confirmed progress',
  );

  const released = await call(releasedSource.evidenceId);
  verify(
    released.statusCode === 200 &&
      released.body.lines[0]?.state === 'needs_recheck' &&
      released.body.lines[0]?.candidateCount === 1 &&
      released.body.summary.needsRecheckItems === 1,
    'released line lock remains needs-recheck even when a new deterministic candidate exists',
  );

  const legacy = await call(legacySource.evidenceId);
  verify(
    legacy.statusCode === 200 &&
      legacy.body.lines[0]?.state === 'confirmed' &&
      legacy.body.lines[0]?.activeReconciliationId === legacyRecId,
    'P9d legacy confirmed reconciliation without line lock is still recognized as active',
  );

  const candidate = await call(candidateSource.evidenceId);
  verify(
    candidate.statusCode === 200 &&
      candidate.body.lines[0]?.state === 'one_possibility' &&
      candidate.body.lines[0]?.candidateCount === 1 &&
      candidate.body.summary.confirmedItems === 0 &&
      candidate.body.summary.remainingItems === 1,
    'unconfirmed source with one exact candidate is shown as one possibility, not confirmed',
  );

  verify(
    active.body.scope === 'recognized_native_text_items_only' &&
      active.body.canDeclareStatementFullyReconciled === false &&
      active.body.financialMutation === false &&
      active.body.reconciliationMutation === false &&
      active.body.aiUsed === false &&
      active.body.ocrUsed === false,
    'endpoint explicitly refuses full-statement reconciliation and mutation authority',
  );

  const activeTxBefore = (
    await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(activeTx).get()
  ).data()!;
  await call(activeSource.evidenceId);
  const activeTxAfter = (
    await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(activeTx).get()
  ).data()!;
  verify(
    activeTxAfter.version === activeTxBefore.version &&
      activeTxAfter.reconciliationStatus === activeTxBefore.reconciliationStatus &&
      activeTxAfter.amountCents === activeTxBefore.amountCents,
    'progress reads current reconciliation truth without mutating transaction version/status/amount',
  );

  const [facts, audits, journals, balances, aggregates] = await Promise.all([
    db.collection('intelligenceFacts').where('organizationId', '==', orgId).get(),
    db.collection('organizations').doc(orgId).collection('financeAuditLogs').get(),
    db.collection('organizations').doc(orgId).collection('financeJournalEntries').get(),
    db.collection('organizations').doc(orgId).collection('financeBalances').get(),
    db.collection('organizations').doc(orgId).collection('financeAggregates').get(),
  ]);
  verify(
    facts.empty && audits.empty && journals.empty && balances.empty && aggregates.empty,
    'progress creates no intelligence, audit, journal, balance or aggregate side effects',
  );

  const crossEntity = await call(candidateSource.evidenceId, otherEntityId);
  verify(
    crossEntity.statusCode === 403 || crossEntity.statusCode === 404,
    'different finance entity cannot read statement progress through the selected account context',
  );

  console.log('\nReconciliation Progress Emulator totals: ' + passed + ' Passed');
} finally {
  admin.auth.verifyIdToken = originalVerify;
  delete (globalThis as any)[Symbol.for('TEST_UNIVERSAL_EVIDENCE_STORAGE')];
}
