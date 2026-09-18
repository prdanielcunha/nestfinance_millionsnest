import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import reconciliationStatementPrepare from '../server/vercel-handlers/finance/reconciliationStatementPrepare.js';

class MockRes {
  statusCode = 200;
  body: any = null;
  headers = new Map<string, string>();
  status(code: number) { this.statusCode = code; return this; }
  json(body: any) { this.body = body; return this; }
  setHeader(name: string, value: string) { this.headers.set(name.toLowerCase(), String(value)); return this; }
}

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

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
      'xref\n0 6\n' + rows.join('\n') + '\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF\n',
      'latin1',
    ),
  );
  return Buffer.concat(chunks);
}

process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || 'nestfinance-reconciliation-prepare-emulator';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Statement preparation test requires Firestore Emulator');
}

resetFirebaseAdminForTests();
const admin = getFirebaseAdmin();
const db = admin.firestore;
const suffix = randomBytes(4).toString('hex');
const orgId = 'org_stmt_' + suffix;
const entityA = 'ent_stmt_a_' + suffix;
const entityB = 'ent_stmt_b_' + suffix;
const uid = 'usr_stmt_' + suffix;
const accountA = 'acc_stmt_a_' + suffix;
const cashA = 'acc_cash_' + suffix;
const accountB = 'acc_stmt_b_' + suffix;
const evidenceId = 'evd_' + randomBytes(16).toString('hex');
const pendingId = 'evd_' + randomBytes(16).toString('hex');
const pdf = buildPdf('02/09/2026 PIX RECEBIDO 1.250,00 C');
const path = 'organizations/' + orgId + '/financeEntities/' + entityA + '/evidence/' + evidenceId + '/original.pdf';

const objects = new Map<string, { bytes: Buffer; contentType: string }>();
objects.set(path, { bytes: pdf, contentType: 'application/pdf' });
(globalThis as any)[Symbol.for('TEST_UNIVERSAL_EVIDENCE_STORAGE')] = {
  async createUploadUrl(storagePath: string) {
    return { url: 'memory://' + storagePath, requiredHeaders: { 'x-goog-if-generation-match': '0' } };
  },
  async inspectAndHash(storagePath: string) {
    const object = objects.get(storagePath);
    if (!object) throw new Error('EVIDENCE_UPLOAD_MISSING');
    return {
      path: storagePath,
      contentType: object.contentType,
      size: object.bytes.length,
      sha256: sha(object.bytes),
      headerBytes: object.bytes.subarray(0, 65536),
    };
  },
  async readPreview(storagePath: string) {
    const object = objects.get(storagePath);
    if (!object) throw new Error('EVIDENCE_UPLOAD_MISSING');
    return {
      bytes: object.bytes,
      contentType: object.contentType,
      size: object.bytes.length,
      sha256: sha(object.bytes),
    };
  },
};

await db.collection('organizations').doc(orgId).set({ name: 'Statement Org', status: 'active' });
await db.collection('users').doc(uid).set({ systemRole: 'ceo' });
for (const entity of [entityA, entityB]) {
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entity).set({
    name: entity,
    active: true,
  });
}

await db.collection('organizations').doc(orgId).collection('financeAccounts').doc(accountA).set({
  organizationId: orgId,
  financeEntityId: entityA,
  name: 'Conta principal',
  type: 'bank_checking',
  nature: 'asset',
  configurationStatus: 'complete',
  institutionName: 'Banco Teste',
  accountLast4: '1234',
  active: true,
});
await db.collection('organizations').doc(orgId).collection('financeAccounts').doc(cashA).set({
  organizationId: orgId,
  financeEntityId: entityA,
  name: 'Caixa',
  type: 'cash',
  nature: 'asset',
  configurationStatus: 'complete',
  active: true,
});
await db.collection('organizations').doc(orgId).collection('financeAccounts').doc(accountB).set({
  organizationId: orgId,
  financeEntityId: entityB,
  name: 'Outra entidade',
  type: 'bank_checking',
  nature: 'asset',
  configurationStatus: 'complete',
  active: true,
});

const evidenceRef = db
  .collection('organizations')
  .doc(orgId)
  .collection('financeEntities')
  .doc(entityA)
  .collection('universalEvidence');

await evidenceRef.doc(evidenceId).set({
  evidenceId,
  organizationId: orgId,
  financeEntityId: entityA,
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
await evidenceRef.doc(pendingId).set({
  evidenceId: pendingId,
  organizationId: orgId,
  financeEntityId: entityA,
  verifiedMimeType: 'application/pdf',
  processingState: 'accepted',
  duplicate: false,
  classification: {
    documentType: 'bank_statement',
    source: 'human',
  },
  review: { status: 'pending' },
  version: 3,
});

const originalVerify = admin.auth.verifyIdToken;
admin.auth.verifyIdToken = async () => ({ uid, mn_organization_id: orgId }) as any;

const call = async (body: any, headerOrg = orgId) => {
  const req = {
    method: 'POST',
    headers: {
      authorization: 'Bearer statement-test',
      'x-organization-id': headerOrg,
    },
    body,
    query: {},
  };
  const res = new MockRes();
  await reconciliationStatementPrepare(req as any, res as any);
  return res;
};

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log('✅ ' + message);
};

try {
  const prepared = await call({
    financeEntityId: entityA,
    evidenceId,
    accountId: accountA,
  });
  verify(
    prepared.statusCode === 200 &&
      prepared.body.state === 'prepared' &&
      prepared.body.source.evidenceVersion === 4,
    'human-reviewed version 4 statement remains eligible for native preparation',
  );
  verify(
    prepared.body.preparation.candidateLines === 1 &&
      prepared.body.preparation.lines[0]?.selectedDate === '2026-09-02' &&
      prepared.body.preparation.lines[0]?.selectedAmountCents === 125000 &&
      prepared.body.preparation.lines[0]?.selectedDirection === 'inflow',
    'verified PDF native text produces a source-backed prepared statement line',
  );
  verify(
    prepared.body.source.accountId === accountA &&
      prepared.body.source.association === 'request_context_only' &&
      prepared.body.source.sourceBacked === true,
    'account selection is explicit request context and not presented as persisted reconciliation',
  );
  verify(
    prepared.body.authority.deterministic === true &&
      prepared.body.authority.aiUsed === false &&
      prepared.body.authority.ocrUsed === false &&
      prepared.body.authority.financialMutation === false &&
      prepared.body.authority.reconciliationMutation === false &&
      prepared.body.authority.financialRecognition === false &&
      prepared.body.authority.requiresHumanConfirmation === true,
    'response explicitly denies AI, OCR, financial and reconciliation authority',
  );
  verify(
    prepared.headers.get('cache-control') === 'private, no-store',
    'statement preparation response is private and non-cacheable',
  );
  verify(
    !Object.prototype.hasOwnProperty.call(prepared.body.extraction, 'text') &&
      !JSON.stringify(prepared.body).includes(path) &&
      !JSON.stringify(prepared.body).includes(sha(pdf)),
    'preparation response does not expose full extracted text, Storage path or content hash',
  );

  const cash = await call({ financeEntityId: entityA, evidenceId, accountId: cashA });
  verify(
    cash.statusCode === 409 && cash.body.error === 'RECONCILIATION_ACCOUNT_NOT_READY',
    'cash account cannot be used as a bank-statement reconciliation context',
  );

  const cross = await call({ financeEntityId: entityA, evidenceId, accountId: accountB });
  verify(
    cross.statusCode === 403,
    'bank account from another finance entity fails closed',
  );

  const pending = await call({
    financeEntityId: entityA,
    evidenceId: pendingId,
    accountId: accountA,
  });
  verify(
    pending.statusCode === 409 &&
      pending.body.error === 'RECONCILIATION_STATEMENT_NOT_READY',
    'unreviewed bank statement cannot be prepared',
  );

  const spoof = await call(
    { financeEntityId: entityA, evidenceId, accountId: accountA },
    'another-org',
  );
  verify(spoof.statusCode === 403, 'conflicting organization header cannot retarget preparation');

  const liveEvidence = (await evidenceRef.doc(evidenceId).get()).data();
  verify(
    liveEvidence?.version === 4 &&
      liveEvidence?.reconciliationStatus === undefined &&
      liveEvidence?.accountId === undefined,
    'preparation does not persist account association or reconciliation state on the evidence',
  );

  const [facts, signals, transactions, journals, balances, aggregates] = await Promise.all([
    db.collection('intelligenceFacts').where('organizationId', '==', orgId).get(),
    db.collection('intelligenceSignals').where('organizationId', '==', orgId).get(),
    db.collection('organizations').doc(orgId).collection('financeTransactions').get(),
    db.collection('organizations').doc(orgId).collection('financeJournalEntries').get(),
    db.collection('organizations').doc(orgId).collection('financeBalances').get(),
    db.collection('organizations').doc(orgId).collection('financeAggregates').get(),
  ]);
  verify(
    facts.empty &&
      signals.empty &&
      transactions.empty &&
      journals.empty &&
      balances.empty &&
      aggregates.empty,
    'statement preparation creates no intelligence or financial side effects',
  );

  console.log('\nReconciliation Statement Prepare Emulator totals: ' + passed + ' Passed');
} finally {
  admin.auth.verifyIdToken = originalVerify;
  delete (globalThis as any)[Symbol.for('TEST_UNIVERSAL_EVIDENCE_STORAGE')];
}
