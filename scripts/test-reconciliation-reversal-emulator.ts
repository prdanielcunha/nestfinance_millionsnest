import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import reconciliationConfirm from '../server/vercel-handlers/finance/reconciliationConfirm.js';
import reconciliationReverse from '../server/vercel-handlers/finance/reconciliationReverse.js';
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
  process.env.FIREBASE_PROJECT_ID || 'nestfinance-reconciliation-reversal-emulator';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Reconciliation reversal test requires Firestore Emulator');
}

resetFirebaseAdminForTests();
const admin = getFirebaseAdmin();
const db = admin.firestore;

const suffix = randomBytes(4).toString('hex');
const orgId = 'org_rec_reverse_' + suffix;
const entityId = 'ent_rec_reverse_' + suffix;
const uid = 'usr_rec_reverse_' + suffix;
const accountId = 'acc_rec_reverse_' + suffix;

await db.collection('organizations').doc(orgId).set({ name: 'Reverse Org', status: 'active' });
await db.collection('users').doc(uid).set({ systemRole: 'ceo' });
await db.collection('user_profiles').doc(uid).set({ name: 'Revisor Reversão' });
await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityId).set({
  name: 'Entidade',
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
      declaredMimeType: 'application/pdf',
      verifiedMimeType: 'application/pdf',
      byteSize: pdf.length,
      processingState: 'accepted',
      duplicate: false,
      classification: {
        documentType: 'bank_statement',
        source: 'human',
        confirmedAt: Timestamp.now(),
      },
      review: {
        status: 'reviewed',
        reviewedAt: Timestamp.now(),
        reviewedByUid: uid,
        note: null,
      },
      original: {
        path,
        immutable: true,
        verifiedMimeType: 'application/pdf',
        verifiedByteSize: pdf.length,
        verifiedSha256: sha(pdf),
      },
      createdAt: Timestamp.now(),
      validatedAt: Timestamp.now(),
      version: 4,
    });

  return { evidenceId, pdf, path, text };
}

async function seedTx(
  id: string,
  amountCents: number,
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
    occurredAt: '2026-09-02T12:00:00.000Z',
    recordedAt: '2026-09-02T12:05:00.000Z',
    paymentMethod: 'pix',
    sourceContext: 'manual',
    accountId,
    description: id,
    evidenceIds: [],
    createdBy: uid,
    updatedBy: uid,
    version: 7,
    contentVersion: 3,
    schemaVersion: 1,
    ...overrides,
  });
}

const source = await seedEvidence('02/09/2026 PIX RECEBIDO 100,00 C');
const txA = txId();
const txB = txId();
await seedTx(txA, 10000);
await seedTx(txB, 10000, { occurredAt: '2026-09-03T12:00:00.000Z' });

const legacySource = await seedEvidence('04/09/2026 OFERTA 200,00 C');
const legacyTx = txId();
const legacyReplacementTx = txId();
await seedTx(legacyTx, 20000, {
  occurredAt: '2026-09-04T12:00:00.000Z',
  reconciliationStatus: 'reconciled',
  version: 3,
});
await seedTx(legacyReplacementTx, 20000, {
  occurredAt: '2026-09-04T12:00:00.000Z',
  version: 2,
});

const legacyLine = prepareStatementLines(legacySource.text).lines[0];
assert.ok(legacyLine, 'legacy line must parse');
const legacyFingerprint = buildStatementLineFingerprint({
  organizationId: orgId,
  financeEntityId: entityId,
  evidenceId: legacySource.evidenceId,
  line: legacyLine,
});
const legacyReconciliationId = buildLegacyReconciliationId({
  organizationId: orgId,
  financeEntityId: entityId,
  evidenceId: legacySource.evidenceId,
  statementLineFingerprint: legacyFingerprint,
});
await db.collection('organizations').doc(orgId).collection('financeReconciliations').doc(legacyReconciliationId).set({
  reconciliationId: legacyReconciliationId,
  organizationId: orgId,
  financeEntityId: entityId,
  accountId,
  transactionId: legacyTx,
  transactionVersion: 2,
  evidenceId: legacySource.evidenceId,
  evidenceVersion: 4,
  statementLineFingerprint: legacyFingerprint,
  statementLineNumber: 1,
  statementDate: '2026-09-04',
  statementAmountCents: 20000,
  statementDirection: 'inflow',
  statementDescription: 'OFERTA',
  matchEvidence: {
    amount: 'exact',
    account: 'exact',
    direction: 'compatible',
    date: 'exact',
    dateDifferenceDays: 0,
  },
  status: 'confirmed',
  confirmedByUid: uid,
  confirmedAt: Timestamp.now(),
  requestId: 'req_legacy_seed_' + suffix,
  balanceChanged: false,
  journalChanged: false,
  schemaVersion: 1,
});
await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(legacyTx).update({
  reconciliationId: legacyReconciliationId,
  reconciliationEvidenceId: legacySource.evidenceId,
  reconciliationLineFingerprint: legacyFingerprint,
  reconciledAt: Timestamp.now(),
  reconciledByUid: uid,
});

const originalVerify = admin.auth.verifyIdToken;
admin.auth.verifyIdToken = async () => ({ uid, mn_organization_id: orgId }) as any;

const callConfirm = async (body: any) => {
  const req = {
    method: 'POST',
    headers: {
      authorization: 'Bearer reversal-test',
      'x-organization-id': orgId,
    },
    body,
    query: {},
  };
  const res = new MockRes();
  await reconciliationConfirm(req as any, res as any);
  return res;
};

const callReverse = async (body: any) => {
  const req = {
    method: 'POST',
    headers: {
      authorization: 'Bearer reversal-test',
      'x-organization-id': orgId,
    },
    body,
    query: {},
  };
  const res = new MockRes();
  await reconciliationReverse(req as any, res as any);
  return res;
};

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log('✅ ' + message);
};

try {
  const confirmA = await callConfirm({
    financeEntityId: entityId,
    evidenceId: source.evidenceId,
    accountId,
    transactionId: txA,
    lineNumber: 1,
    idempotencyKey: 'idem_confirm_a_' + suffix,
    requestId: 'req_confirm_a_' + suffix,
  });
  verify(
    confirmA.statusCode === 200 &&
      confirmA.body.reconciliationStatus === 'reconciled',
    'initial human confirmation succeeds before reversal',
  );

  const txAConfirmed = (
    await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(txA).get()
  ).data()!;
  const firstReconciliationId = confirmA.body.reconciliationId;
  const lineLockId = txAConfirmed.reconciliationLineLockId;
  verify(
    typeof lineLockId === 'string' && lineLockId.startsWith('rlock_'),
    'initial confirmation stores the separate active line lock',
  );

  const tooLongNote = await callReverse({
    financeEntityId: entityId,
    transactionId: txA,
    reconciliationId: firstReconciliationId,
    reasonCode: 'wrong_transaction',
    note: 'x'.repeat(301),
    idempotencyKey: 'idem_note_' + suffix,
    requestId: 'req_note_' + suffix,
  });
  verify(
    tooLongNote.statusCode === 400 &&
      tooLongNote.body.error === 'RECONCILIATION_INVALID_NOTE',
    'reversal note is bounded before any mutation',
  );

  const reverseBody = {
    financeEntityId: entityId,
    transactionId: txA,
    reconciliationId: firstReconciliationId,
    reasonCode: 'wrong_transaction',
    note: '  selecionei   o registro errado  ',
    idempotencyKey: 'idem_reverse_a_' + suffix,
    requestId: 'req_reverse_a_' + suffix,
  };
  const reversed = await callReverse(reverseBody);
  verify(
    reversed.statusCode === 200 &&
      reversed.body.reconciliationStatus === 'unreconciled' &&
      reversed.body.transactionVersion === 9 &&
      reversed.body.balanceChanged === false &&
      reversed.body.journalChanged === false,
    'reversal releases reconciliation without changing financial authority',
  );

  const txAReversed = (
    await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(txA).get()
  ).data()!;
  verify(
    txAReversed.status === 'posted' &&
      txAReversed.reconciliationStatus === 'unreconciled' &&
      txAReversed.version === 9 &&
      txAReversed.amountCents === 10000 &&
      txAReversed.contentVersion === 3 &&
      txAReversed.reconciliationId === undefined &&
      txAReversed.reconciliationEvidenceId === undefined &&
      txAReversed.lastReconciliationId === firstReconciliationId &&
      txAReversed.lastReconciliationEvidenceId === source.evidenceId &&
      txAReversed.lastReconciliationReversalId === reversed.body.reversalId &&
      txAReversed.lastReconciliationReversalReason === 'wrong_transaction',
    'transaction returns to unreconciled while preserving prior reconciliation history metadata',
  );

  const originalConfirmation = (
    await db.collection('organizations').doc(orgId).collection('financeReconciliations').doc(firstReconciliationId).get()
  ).data()!;
  verify(
    originalConfirmation.status === 'confirmed' &&
      originalConfirmation.transactionId === txA &&
      originalConfirmation.lineLockId === lineLockId,
    'original confirmation remains immutable after reversal',
  );

  const reversal = (
    await db.collection('organizations').doc(orgId).collection('financeReconciliationReversals').doc(reversed.body.reversalId).get()
  ).data()!;
  verify(
    reversal.reconciliationId === firstReconciliationId &&
      reversal.transactionId === txA &&
      reversal.reasonCode === 'wrong_transaction' &&
      reversal.note === 'selecionei o registro errado' &&
      reversal.reversedByUid === uid &&
      reversal.balanceChanged === false &&
      reversal.journalChanged === false,
    'append-only reversal preserves actor, reason, normalized note and prior confirmation reference',
  );

  const releasedLock = (
    await db.collection('organizations').doc(orgId).collection('financeReconciliationLineLocks').doc(lineLockId).get()
  ).data()!;
  verify(
    releasedLock.status === 'released' &&
      releasedLock.activeReconciliationId === null &&
      releasedLock.activeTransactionId === null &&
      releasedLock.releaseReversalId === reversed.body.reversalId,
    'active line lock is released instead of deleting reconciliation history',
  );

  const reverseAudits = await db
    .collection('organizations')
    .doc(orgId)
    .collection('financeAuditLogs')
    .where('action', '==', 'transaction.reconciliation_reversed')
    .get();
  const reverseFacts = await db
    .collection('intelligenceFacts')
    .where('organizationId', '==', orgId)
    .where('eventType', '==', 'RECONCILIATION_REVERSED')
    .get();
  verify(
    reverseAudits.size === 1 &&
      reverseFacts.size === 1 &&
      reverseFacts.docs[0].data().entityId === reversed.body.reversalId &&
      reverseFacts.docs[0].data().sourceRefs?.length === 5,
    'reversal records one audit and one source-backed canonical fact',
  );

  const reverseEvents = await db
    .collection('organizations')
    .doc(orgId)
    .collection('financeEntities')
    .doc(entityId)
    .collection('events')
    .where('transactionId', '==', txA)
    .get();
  verify(
    reverseEvents.docs.some(
      (doc) =>
        doc.data().eventType === 'reconciliation_reversed' &&
        doc.data().reasonCode === 'wrong_transaction',
    ),
    'transaction history receives a human-readable reconciliation reversal event',
  );

  const retry = await callReverse(reverseBody);
  const txAAfterRetry = (
    await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(txA).get()
  ).data()!;
  verify(
    retry.statusCode === 200 &&
      retry.body.reversalId === reversed.body.reversalId &&
      txAAfterRetry.version === 9 &&
      (
        await db.collection('organizations').doc(orgId).collection('financeReconciliationReversals').get()
      ).size === 1,
    'reversal retry is idempotent and does not increment version or duplicate history',
  );

  await db
    .collection('organizations')
    .doc(orgId)
    .collection('financeEntities')
    .doc(entityId)
    .collection('universalEvidence')
    .doc(source.evidenceId)
    .update({ version: 5 });

  const confirmB = await callConfirm({
    financeEntityId: entityId,
    evidenceId: source.evidenceId,
    accountId,
    transactionId: txB,
    lineNumber: 1,
    idempotencyKey: 'idem_confirm_b_' + suffix,
    requestId: 'req_confirm_b_' + suffix,
  });
  verify(
    confirmB.statusCode === 200 &&
      confirmB.body.reconciliationId !== firstReconciliationId,
    'released immutable statement line can be corrected with a new confirmation attempt',
  );

  const reactivatedLock = (
    await db.collection('organizations').doc(orgId).collection('financeReconciliationLineLocks').doc(lineLockId).get()
  ).data()!;
  verify(
    reactivatedLock.status === 'active' &&
      reactivatedLock.activeReconciliationId === confirmB.body.reconciliationId &&
      reactivatedLock.activeTransactionId === txB,
    'same stable line lock is reactivated for the corrected confirmation',
  );

  const oldTxAgain = await callConfirm({
    financeEntityId: entityId,
    evidenceId: source.evidenceId,
    accountId,
    transactionId: txA,
    lineNumber: 1,
    idempotencyKey: 'idem_confirm_old_again_' + suffix,
    requestId: 'req_confirm_old_again_' + suffix,
  });
  verify(
    oldTxAgain.statusCode === 409 &&
      oldTxAgain.body.error === 'RECONCILIATION_LINE_ALREADY_CONFIRMED',
    'active corrected confirmation prevents a second simultaneous link for the same statement line',
  );

  const legacyReverse = await callReverse({
    financeEntityId: entityId,
    transactionId: legacyTx,
    reconciliationId: legacyReconciliationId,
    reasonCode: 'wrong_transaction',
    note: null,
    idempotencyKey: 'idem_legacy_reverse_' + suffix,
    requestId: 'req_legacy_reverse_' + suffix,
  });
  verify(
    legacyReverse.statusCode === 200,
    'P9d legacy confirmation without a line-lock record can still be safely reversed',
  );

  const legacyLockId = buildReconciliationLineLockId({
    organizationId: orgId,
    financeEntityId: entityId,
    evidenceId: legacySource.evidenceId,
    statementLineFingerprint: legacyFingerprint,
  });
  const legacyReleasedLock = (
    await db.collection('organizations').doc(orgId).collection('financeReconciliationLineLocks').doc(legacyLockId).get()
  ).data()!;
  verify(
    legacyReleasedLock.status === 'released' &&
      legacyReleasedLock.releaseReversalId === legacyReverse.body.reversalId,
    'legacy reversal creates an explicit released lock as migration proof',
  );

  const legacyCorrection = await callConfirm({
    financeEntityId: entityId,
    evidenceId: legacySource.evidenceId,
    accountId,
    transactionId: legacyReplacementTx,
    lineNumber: 1,
    idempotencyKey: 'idem_legacy_correction_' + suffix,
    requestId: 'req_legacy_correction_' + suffix,
  });
  verify(
    legacyCorrection.statusCode === 200 &&
      legacyCorrection.body.reconciliationId !== legacyReconciliationId,
    'legacy line becomes correctable after its explicit reversal',
  );

  const [journals, balances, aggregates] = await Promise.all([
    db.collection('organizations').doc(orgId).collection('financeJournalEntries').get(),
    db.collection('organizations').doc(orgId).collection('financeBalances').get(),
    db.collection('organizations').doc(orgId).collection('financeAggregates').get(),
  ]);
  verify(
    journals.empty && balances.empty && aggregates.empty,
    'confirm-reverse-correct cycle creates no journal, balance or aggregate side effects',
  );

  console.log('\nReconciliation Reversal Emulator totals: ' + passed + ' Passed');
} finally {
  admin.auth.verifyIdToken = originalVerify;
  delete (globalThis as any)[Symbol.for('TEST_UNIVERSAL_EVIDENCE_STORAGE')];
}
