import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import reconciliationMatchPreview from '../server/vercel-handlers/finance/reconciliationMatchPreview.js';

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
  process.env.FIREBASE_PROJECT_ID || 'nestfinance-reconciliation-match-emulator';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Reconciliation match preview test requires Firestore Emulator');
}

resetFirebaseAdminForTests();
const admin = getFirebaseAdmin();
const db = admin.firestore;

const suffix = randomBytes(4).toString('hex');
const orgId = 'org_match_' + suffix;
const entityA = 'ent_match_a_' + suffix;
const entityB = 'ent_match_b_' + suffix;
const uid = 'usr_match_' + suffix;
const accountA = 'acc_match_a_' + suffix;
const accountOther = 'acc_match_other_' + suffix;
const accountB = 'acc_match_b_' + suffix;
const evidenceId = 'evd_' + randomBytes(16).toString('hex');
const pdf = buildPdf('02/09/2026 PIX RECEBIDO 100,00 C');
const storagePath =
  'organizations/' + orgId + '/financeEntities/' + entityA + '/evidence/' + evidenceId + '/original.pdf';

const objects = new Map<string, { bytes: Buffer; contentType: string }>();
objects.set(storagePath, { bytes: pdf, contentType: 'application/pdf' });
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

await db.collection('organizations').doc(orgId).set({ name: 'Match Org', status: 'active' });
await db.collection('users').doc(uid).set({ systemRole: 'ceo' });
for (const entity of [entityA, entityB]) {
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(entity).set({
    name: entity,
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
await seedAccount(accountOther, entityA, 'Conta secundária');
await seedAccount(accountB, entityB, 'Conta outra entidade');

const evidenceRef = db
  .collection('organizations')
  .doc(orgId)
  .collection('financeEntities')
  .doc(entityA)
  .collection('universalEvidence')
  .doc(evidenceId);

await evidenceRef.set({
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
    path: storagePath,
    immutable: true,
    verifiedMimeType: 'application/pdf',
    verifiedByteSize: pdf.length,
    verifiedSha256: sha(pdf),
  },
  createdAt: Timestamp.now(),
  validatedAt: Timestamp.now(),
  version: 4,
});

const txRef = db.collection('organizations').doc(orgId).collection('financeTransactions');

async function seedTx(id: string, data: Record<string, unknown>) {
  const document: Record<string, unknown> = {
    organizationId: orgId,
    financeEntityId: entityA,
    transactionKind: 'income',
    direction: 'income',
    cashFlowDirection: 'inflow',
    status: 'posted',
    reconciliationStatus: 'unreconciled',
    amountCents: 10000,
    currency: 'BRL',
    occurredAt: '2026-09-02T12:00:00.000Z',
    accountId: accountA,
    description: id,
    version: 1,
    ...data,
  };
  if (document.reconciliationStatus === undefined) delete document.reconciliationStatus;
  await txRef.doc(id).set(document);
}

await seedTx('tx_exact_' + suffix, {});
await seedTx('tx_adjacent_' + suffix, {
  occurredAt: '2026-09-03T08:00:00.000Z',
});
await seedTx('tx_reconciled_' + suffix, {
  reconciliationStatus: 'reconciled',
});
await seedTx('tx_wrong_account_' + suffix, {
  accountId: accountOther,
});
await seedTx('tx_wrong_amount_' + suffix, {
  amountCents: 9999,
});
await seedTx('tx_legacy_' + suffix, {
  reconciliationStatus: undefined,
});
await seedTx('tx_draft_' + suffix, {
  status: 'draft',
});

const originalVerify = admin.auth.verifyIdToken;
admin.auth.verifyIdToken = async () =>
  ({ uid, mn_organization_id: orgId }) as any;

const call = async (body: any, headerOrg = orgId) => {
  const req = {
    method: 'POST',
    headers: {
      authorization: 'Bearer match-test',
      'x-organization-id': headerOrg,
    },
    body,
    query: {},
  };
  const res = new MockRes();
  await reconciliationMatchPreview(req as any, res as any);
  return res;
};

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log('✅ ' + message);
};

try {
  const preview = await call({
    financeEntityId: entityA,
    evidenceId,
    accountId: accountA,
  });

  verify(
    preview.statusCode === 200 &&
      preview.body.state === 'preview' &&
      preview.body.preview.autoSelected === false &&
      preview.body.preview.requiresHumanConfirmation === true,
    'reviewed source returns a non-automatic human-confirmed match preview',
  );

  const line = preview.body.preview.lines[0];
  verify(
    line?.state === 'multiple_candidates' &&
      line?.totalCandidates === 4,
    'multiple plausible records remain multiple possibilities after filtering invalid matches',
  );

  const ids = new Set(line?.candidates.map((candidate: any) => candidate.transactionId));
  verify(
    ids.has('tx_exact_' + suffix) &&
      ids.has('tx_adjacent_' + suffix) &&
      ids.has('tx_legacy_' + suffix) &&
      ids.has('tx_draft_' + suffix) &&
      !ids.has('tx_reconciled_' + suffix) &&
      !ids.has('tx_wrong_account_' + suffix) &&
      !ids.has('tx_wrong_amount_' + suffix),
    'preview includes only exact value/account/direction and same-or-adjacent-date possibilities',
  );

  const exact = line.candidates.find(
    (candidate: any) => candidate.transactionId === 'tx_exact_' + suffix,
  );
  verify(
    exact?.evidence?.amount === 'exact' &&
      exact?.evidence?.account === 'exact' &&
      exact?.evidence?.direction === 'compatible' &&
      exact?.evidence?.date === 'exact' &&
      exact?.reconciliationEligible === true,
    'candidate explains why it appears and only posted unreconciled record is eligible for future reconciliation',
  );

  const legacy = line.candidates.find(
    (candidate: any) => candidate.transactionId === 'tx_legacy_' + suffix,
  );
  verify(
    legacy?.reconciliationStatus === 'unknown' &&
      legacy?.reconciliationEligible === false,
    'missing legacy reconciliation status is surfaced as unknown rather than inferred',
  );

  const draft = line.candidates.find(
    (candidate: any) => candidate.transactionId === 'tx_draft_' + suffix,
  );
  verify(
    draft?.postingState === 'not_posted' &&
      draft?.reconciliationEligible === false,
    'draft record can aid investigation but is not presented as reconciliation-ready',
  );

  verify(
    preview.body.authority.deterministic === true &&
      preview.body.authority.aiUsed === false &&
      preview.body.authority.ocrUsed === false &&
      preview.body.authority.financialMutation === false &&
      preview.body.authority.reconciliationMutation === false &&
      preview.body.authority.autoMatched === false &&
      preview.body.authority.requiresHumanConfirmation === true,
    'endpoint explicitly denies AI, OCR, mutation and automatic matching authority',
  );

  verify(
    preview.headers.get('cache-control') === 'private, no-store' &&
      !JSON.stringify(preview.body).includes(storagePath) &&
      !JSON.stringify(preview.body).includes(sha(pdf)) &&
      !Object.prototype.hasOwnProperty.call(preview.body, 'text'),
    'response is private and does not expose storage path, content hash or full extracted text',
  );

  const crossAccount = await call({
    financeEntityId: entityA,
    evidenceId,
    accountId: accountB,
  });
  verify(
    crossAccount.statusCode === 403,
    'account from another finance entity cannot retarget the comparison',
  );

  const spoof = await call(
    { financeEntityId: entityA, evidenceId, accountId: accountA },
    'other-org',
  );
  verify(spoof.statusCode === 403, 'conflicting organization header cannot retarget comparison');

  const evidenceAfter = (await evidenceRef.get()).data();
  const txAfter = (await txRef.doc('tx_exact_' + suffix).get()).data();
  verify(
    evidenceAfter?.version === 4 &&
      evidenceAfter?.accountId === undefined &&
      evidenceAfter?.reconciliationStatus === undefined &&
      txAfter?.reconciliationStatus === 'unreconciled',
    'match preview persists neither account association nor reconciliation decision',
  );

  const [facts, signals, journals, balances, aggregates] = await Promise.all([
    db.collection('intelligenceFacts').where('organizationId', '==', orgId).get(),
    db.collection('intelligenceSignals').where('organizationId', '==', orgId).get(),
    db.collection('organizations').doc(orgId).collection('financeJournalEntries').get(),
    db.collection('organizations').doc(orgId).collection('financeBalances').get(),
    db.collection('organizations').doc(orgId).collection('financeAggregates').get(),
  ]);

  verify(
    facts.empty && signals.empty && journals.empty && balances.empty && aggregates.empty,
    'match preview creates no intelligence, journal, balance or aggregate side effects',
  );

  console.log('\nReconciliation Match Preview Emulator totals: ' + passed + ' Passed');
} finally {
  admin.auth.verifyIdToken = originalVerify;
  delete (globalThis as any)[Symbol.for('TEST_UNIVERSAL_EVIDENCE_STORAGE')];
}
