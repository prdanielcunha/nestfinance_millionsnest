import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import reconciliationConfirm from '../server/vercel-handlers/finance/reconciliationConfirm.js';

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
  process.env.FIREBASE_PROJECT_ID || 'nestfinance-reconciliation-confirm-emulator';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Reconciliation confirmation test requires Firestore Emulator');
}

resetFirebaseAdminForTests();
const admin = getFirebaseAdmin();
const db = admin.firestore;

const suffix = randomBytes(4).toString('hex');
const orgId = 'org_rec_confirm_' + suffix;
const entityA = 'ent_rec_a_' + suffix;
const entityB = 'ent_rec_b_' + suffix;
const entityCrowded = 'ent_rec_crowded_' + suffix;
const uid = 'usr_rec_' + suffix;
const accountA = 'acc_rec_a_' + suffix;
const accountB = 'acc_rec_b_' + suffix;
const accountCrowded = 'acc_rec_crowded_' + suffix;

await db.collection('organizations').doc(orgId).set({ name: 'Confirm Org', status: 'active' });
await db.collection('users').doc(uid).set({ systemRole: 'ceo' });
await db.collection('user_profiles').doc(uid).set({ name: 'Revisor Teste' });

for (const entityId of [entityA, entityB, entityCrowded]) {
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityId).set({
    name: entityId,
    active: true,
  });
}

async function seedAccount(id: string, entityId: string, name: string) {
  await db.collection('organizations').doc(orgId).collection('financeAccounts').doc(id).set({
    organizationId: orgId,
    financeEntityId: entityId,
    name,
    type: 'bank_checking',
    nature: 'asset',
    configurationStatus: 'complete',
    institutionName: 'Banco Teste',
    accountLast4: id.slice(-4),
    active: true,
  });
}
await seedAccount(accountA, entityA, 'Conta principal');
await seedAccount(accountB, entityB, 'Conta outra entidade');
await seedAccount(accountCrowded, entityCrowded, 'Conta cheia');

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

async function seedEvidence(entityId: string, text: string) {
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

  return { evidenceId, pdf, path };
}

const source = await seedEvidence(entityA, '02/09/2026 PIX RECEBIDO 100,00 C');
const crowdedSource = await seedEvidence(entityCrowded, '02/09/2026 PIX RECEBIDO 100,00 C');

async function seedTx(
  entityId: string,
  accountId: string,
  id: string,
  overrides: Record<string, unknown> = {},
) {
  const data: Record<string, unknown> = {
    id,
    organizationId: orgId,
    financeEntityId: entityId,
    transactionKind: 'income',
    direction: 'income',
    cashFlowDirection: 'inflow',
    status: 'posted',
    reconciliationStatus: 'unreconciled',
    amountCents: 10000,
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
  };
  if (data.reconciliationStatus === undefined) delete data.reconciliationStatus;

  await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(id).set(data);
}

const selectedTxId = txId();
const alternateTxId = txId();
const draftTxId = txId();
const legacyTxId = txId();
const wrongAmountTxId = txId();

await seedTx(entityA, accountA, selectedTxId);
await seedTx(entityA, accountA, alternateTxId, { occurredAt: '2026-09-03T12:00:00.000Z' });
await seedTx(entityA, accountA, draftTxId, { status: 'draft' });
await seedTx(entityA, accountA, legacyTxId, { reconciliationStatus: undefined });
await seedTx(entityA, accountA, wrongAmountTxId, { amountCents: 9999 });

const crossEntityTxId = txId();
await seedTx(entityB, accountB, crossEntityTxId);

for (let index = 0; index < 6; index += 1) {
  await seedTx(entityCrowded, accountCrowded, txId(), {
    description: 'crowded-' + index,
  });
}

const originalVerify = admin.auth.verifyIdToken;
admin.auth.verifyIdToken = async () => ({ uid, mn_organization_id: orgId }) as any;

const call = async (body: any, headerOrg = orgId) => {
  const req = {
    method: 'POST',
    headers: {
      authorization: 'Bearer reconciliation-confirm-test',
      'x-organization-id': headerOrg,
    },
    body,
    query: {},
  };
  const res = new MockRes();
  await reconciliationConfirm(req as any, res as any);
  return res;
};

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log('✅ ' + message);
};

const baseBody = {
  financeEntityId: entityA,
  evidenceId: source.evidenceId,
  accountId: accountA,
  lineNumber: 1,
};

try {
  const draftAttempt = await call({
    ...baseBody,
    transactionId: draftTxId,
    idempotencyKey: 'idem_draft_' + suffix,
    requestId: 'req_draft_' + suffix,
  });
  verify(
    draftAttempt.statusCode === 409 &&
      draftAttempt.body.error === 'RECONCILIATION_MATCH_NO_LONGER_VALID',
    'non-posted transaction cannot be confirmed even when amount/date/account look similar',
  );

  const legacyAttempt = await call({
    ...baseBody,
    transactionId: legacyTxId,
    idempotencyKey: 'idem_legacy_' + suffix,
    requestId: 'req_legacy_' + suffix,
  });
  verify(
    legacyAttempt.statusCode === 409 &&
      legacyAttempt.body.error === 'RECONCILIATION_MATCH_NO_LONGER_VALID',
    'legacy transaction without explicit unreconciled state cannot be confirmed',
  );

  const wrongAmountAttempt = await call({
    ...baseBody,
    transactionId: wrongAmountTxId,
    idempotencyKey: 'idem_amount_' + suffix,
    requestId: 'req_amount_' + suffix,
  });
  verify(
    wrongAmountAttempt.statusCode === 409 &&
      wrongAmountAttempt.body.error === 'RECONCILIATION_MATCH_NO_LONGER_VALID',
    'wrong amount cannot be confirmed',
  );

  const crossEntity = await call({
    ...baseBody,
    accountId: accountB,
    transactionId: crossEntityTxId,
    idempotencyKey: 'idem_cross_' + suffix,
    requestId: 'req_cross_' + suffix,
  });
  verify(crossEntity.statusCode === 403, 'cross-entity account/transaction confirmation fails closed');

  const crowded = await call({
    financeEntityId: entityCrowded,
    evidenceId: crowdedSource.evidenceId,
    accountId: accountCrowded,
    transactionId: (
      await db.collection('organizations').doc(orgId).collection('financeTransactions')
        .where('financeEntityId', '==', entityCrowded).limit(1).get()
    ).docs[0].id,
    lineNumber: 1,
    idempotencyKey: 'idem_crowded_' + suffix,
    requestId: 'req_crowded_' + suffix,
  });
  verify(
    crowded.statusCode === 409 &&
      crowded.body.error === 'RECONCILIATION_TOO_MANY_CANDIDATES',
    'confirmation is blocked when more candidates exist than the UI can safely show',
  );

  const before = (
    await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(selectedTxId).get()
  ).data()!;

  const successBody = {
    ...baseBody,
    transactionId: selectedTxId,
    idempotencyKey: 'idem_success_' + suffix,
    requestId: 'req_success_' + suffix,
  };

  const confirmed = await call(successBody);
  verify(
    confirmed.statusCode === 200 &&
      confirmed.body.reconciliationStatus === 'reconciled' &&
      confirmed.body.transactionVersion === 8 &&
      confirmed.body.balanceChanged === false &&
      confirmed.body.journalChanged === false &&
      confirmed.body.auditRecorded === true &&
      confirmed.body.factRecorded === true,
    'eligible posted transaction is confirmed with explicit non-balance authority',
  );

  const txAfter = (
    await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(selectedTxId).get()
  ).data()!;
  verify(
    txAfter.status === 'posted' &&
      txAfter.reconciliationStatus === 'reconciled' &&
      txAfter.version === 8 &&
      txAfter.amountCents === before.amountCents &&
      txAfter.accountId === before.accountId &&
      txAfter.currency === before.currency &&
      txAfter.contentVersion === before.contentVersion,
    'confirmation changes reconciliation metadata/version only, not financial content or posting status',
  );
  verify(
    txAfter.reconciliationId === confirmed.body.reconciliationId &&
      txAfter.reconciliationEvidenceId === source.evidenceId &&
      typeof txAfter.reconciliationLineFingerprint === 'string' &&
      txAfter.reconciliationLineFingerprint.startsWith('line_') &&
      typeof txAfter.reconciliationLineLockId === 'string' &&
      txAfter.reconciliationLineLockId.startsWith('rlock_') &&
      txAfter.reconciledByUid === uid &&
      txAfter.reconciledAt,
    'transaction stores accountant-grade reconciliation trace metadata',
  );

  const recSnapshot = await db
    .collection('organizations')
    .doc(orgId)
    .collection('financeReconciliations')
    .doc(confirmed.body.reconciliationId)
    .get();
  const rec = recSnapshot.data()!;
  verify(
    recSnapshot.exists &&
      rec.organizationId === orgId &&
      rec.financeEntityId === entityA &&
      rec.accountId === accountA &&
      rec.transactionId === selectedTxId &&
      rec.lineLockId === txAfter.reconciliationLineLockId &&
      rec.evidenceId === source.evidenceId &&
      rec.evidenceVersion === 4 &&
      rec.statementLineNumber === 1 &&
      rec.statementDate === '2026-09-02' &&
      rec.statementAmountCents === 10000 &&
      rec.statementDirection === 'inflow' &&
      rec.status === 'confirmed' &&
      rec.confirmedByUid === uid &&
      rec.balanceChanged === false &&
      rec.journalChanged === false &&
      rec.schemaVersion === 2,
    'immutable reconciliation attempt preserves line lock, source, actor and non-balance semantics',
  );

  const lineLockSnapshot = await db
    .collection('organizations')
    .doc(orgId)
    .collection('financeReconciliationLineLocks')
    .doc(txAfter.reconciliationLineLockId)
    .get();
  const lineLock = lineLockSnapshot.data()!;
  verify(
    lineLockSnapshot.exists &&
      lineLock.status === 'active' &&
      lineLock.activeReconciliationId === confirmed.body.reconciliationId &&
      lineLock.activeTransactionId === selectedTxId &&
      lineLock.statementLineFingerprint === txAfter.reconciliationLineFingerprint,
    'statement line has one separate active lock pointing to the immutable confirmation attempt',
  );
  verify(
    rec.matchEvidence?.amount === 'exact' &&
      rec.matchEvidence?.account === 'exact' &&
      rec.matchEvidence?.direction === 'compatible' &&
      rec.matchEvidence?.date === 'exact',
    'reconciliation record preserves objective match evidence for accountants',
  );

  const audits = await db
    .collection('organizations')
    .doc(orgId)
    .collection('financeAuditLogs')
    .where('action', '==', 'transaction.reconciled')
    .get();
  verify(
    audits.size === 1 &&
      audits.docs[0].data().transactionId === selectedTxId &&
      audits.docs[0].data().metadata?.balanceChanged === false,
    'human confirmation creates one dedicated audit record',
  );

  const facts = await db
    .collection('intelligenceFacts')
    .where('organizationId', '==', orgId)
    .where('eventType', '==', 'RECONCILIATION_MATCHED')
    .get();
  verify(
    facts.size === 1 &&
      facts.docs[0].data().entityId === confirmed.body.reconciliationId &&
      facts.docs[0].data().actorUserId === uid &&
      facts.docs[0].data().payload?.transactionId === selectedTxId &&
      facts.docs[0].data().payload?.balanceChanged === false &&
      facts.docs[0].data().sourceRefs?.length === 5,
    'canonical RECONCILIATION_MATCHED fact is source-backed by confirmation, active lock, transaction, evidence and audit',
  );

  const events = await db
    .collection('organizations')
    .doc(orgId)
    .collection('financeEntities')
    .doc(entityA)
    .collection('events')
    .where('transactionId', '==', selectedTxId)
    .get();
  verify(
    events.docs.some((doc) => doc.data().eventType === 'reconciled' && doc.data().actorUid === uid),
    'transaction history receives a human-readable reconciled event',
  );

  const retry = await call(successBody);
  const txAfterRetry = (
    await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(selectedTxId).get()
  ).data()!;
  const auditsAfterRetry = await db
    .collection('organizations')
    .doc(orgId)
    .collection('financeAuditLogs')
    .where('action', '==', 'transaction.reconciled')
    .get();
  const factsAfterRetry = await db
    .collection('intelligenceFacts')
    .where('organizationId', '==', orgId)
    .where('eventType', '==', 'RECONCILIATION_MATCHED')
    .get();
  verify(
    retry.statusCode === 200 &&
      retry.body.reconciliationId === confirmed.body.reconciliationId &&
      txAfterRetry.version === 8 &&
      auditsAfterRetry.size === 1 &&
      factsAfterRetry.size === 1,
    'same idempotency key replays completed confirmation without duplicate writes or version increments',
  );

  await db
    .collection('organizations')
    .doc(orgId)
    .collection('financeEntities')
    .doc(entityA)
    .collection('universalEvidence')
    .doc(source.evidenceId)
    .update({ version: 5 });

  const secondChoice = await call({
    ...baseBody,
    transactionId: alternateTxId,
    idempotencyKey: 'idem_second_' + suffix,
    requestId: 'req_second_' + suffix,
  });
  verify(
    secondChoice.statusCode === 409 &&
      secondChoice.body.error === 'RECONCILIATION_LINE_ALREADY_CONFIRMED',
    'same immutable bank-statement line cannot be confirmed again after metadata version increments',
  );

  const [journals, balances, aggregates] = await Promise.all([
    db.collection('organizations').doc(orgId).collection('financeJournalEntries').get(),
    db.collection('organizations').doc(orgId).collection('financeBalances').get(),
    db.collection('organizations').doc(orgId).collection('financeAggregates').get(),
  ]);
  verify(
    journals.empty && balances.empty && aggregates.empty,
    'confirmation creates no journal, balance or aggregate side effects',
  );

  console.log('\nReconciliation Confirmation Emulator totals: ' + passed + ' Passed');
} finally {
  admin.auth.verifyIdToken = originalVerify;
  delete (globalThis as any)[Symbol.for('TEST_UNIVERSAL_EVIDENCE_STORAGE')];
}
