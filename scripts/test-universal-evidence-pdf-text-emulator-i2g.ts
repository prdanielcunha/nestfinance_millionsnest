import { createHash, randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import universalEvidencePdfText from '../server/vercel-handlers/finance/universalEvidencePdfText.js';
import { PDF_TEXT_MAX_INPUT_BYTES } from '../server/vercel-handlers/finance/universalEvidencePdfTextExtractor.js';

class MockRes {
  statusCode = 200;
  body: any = null;
  headers = new Map<string, string>();
  status(code: number) { this.statusCode = code; return this; }
  json(body: any) { this.body = body; return this; }
  setHeader(name: string, value: string) { this.headers.set(name.toLowerCase(), value); return this; }
}

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

function escapePdfString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdf(text: string | null) {
  const payload = text === null
    ? Buffer.from('q Q', 'latin1')
    : Buffer.from(`BT /F1 12 Tf 72 720 Td (${escapePdfString(text)}) Tj ET`, 'latin1');
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'latin1'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>', 'latin1'),
    Buffer.concat([
      Buffer.from(`<< /Length ${payload.length} >>\nstream\n`, 'latin1'),
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
      Buffer.from(`${index + 1} 0 obj\n`, 'latin1'),
      objects[index],
      Buffer.from('\nendobj\n', 'latin1'),
    ]);
    chunks.push(object);
    length += object.length;
  }
  const xrefOffset = length;
  const rows = ['0000000000 65535 f ', ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `)];
  chunks.push(Buffer.from(`xref\n0 6\n${rows.join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(chunks);
}

const pdf = buildPdf('Hello protected I2G');
const noTextPdf = buildPdf(null);
const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,2,0,0,0,3]);

process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'nestfinance-inbox-i2g-emulator';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Inbox I2G native PDF text test requires Firestore Emulator');

resetFirebaseAdminForTests();
const admin = getFirebaseAdmin();
const db = admin.firestore;
const suffix = randomBytes(4).toString('hex');
const orgId = `org_i2g_${suffix}`;
const entityA = `ent_a_${suffix}`;
const entityB = `ent_b_${suffix}`;
const uid = `usr_i2g_${suffix}`;
const ownerUid = `usr_owner_${suffix}`;
const textId = `evd_${randomBytes(16).toString('hex')}`;
const noTextId = `evd_${randomBytes(16).toString('hex')}`;
const imageId = `evd_${randomBytes(16).toString('hex')}`;
const pendingId = `evd_${randomBytes(16).toString('hex')}`;
const crossId = `evd_${randomBytes(16).toString('hex')}`;
const corruptId = `evd_${randomBytes(16).toString('hex')}`;
const oversizedId = `evd_${randomBytes(16).toString('hex')}`;

const objects = new Map<string, { bytes: Buffer; contentType: string }>();
const readPaths: string[] = [];
(globalThis as any)[Symbol.for('TEST_UNIVERSAL_EVIDENCE_STORAGE')] = {
  async createUploadUrl(path: string) {
    return { url: `memory://${path}`, requiredHeaders: { 'x-goog-if-generation-match': '0' } };
  },
  async inspectAndHash(path: string) {
    const object = objects.get(path);
    if (!object) throw new Error('EVIDENCE_UPLOAD_MISSING');
    return { path, contentType: object.contentType, size: object.bytes.length, sha256: sha(object.bytes), headerBytes: object.bytes.subarray(0, 65536) };
  },
  async readPreview(path: string) {
    readPaths.push(path);
    const object = objects.get(path);
    if (!object) throw new Error('EVIDENCE_UPLOAD_MISSING');
    return { bytes: object.bytes, contentType: object.contentType, size: object.bytes.length, sha256: sha(object.bytes) };
  },
};

await db.collection('organizations').doc(orgId).set({ name: 'Inbox I2G Org', status: 'active' });
await db.collection('users').doc(uid).set({ systemRole: 'ceo' });
await db.collection('users').doc(ownerUid).set({ systemRole: 'owner' });
for (const id of [entityA, entityB]) {
  await db.collection('organizations').doc(orgId).collection('financeEntities').doc(id).set({ name: id, active: true });
}

const evidenceCollection = (entity: string) => db.collection('organizations').doc(orgId).collection('financeEntities').doc(entity).collection('universalEvidence');
const now = Timestamp.now();
function evidenceData(entity: string, evidenceId: string, path: string, bytes: Buffer, mime = 'application/pdf', overrides: Record<string, any> = {}) {
  return {
    evidenceId,
    organizationId: orgId,
    financeEntityId: entity,
    originalFilename: mime === 'application/pdf' ? 'document.pdf' : 'image.png',
    declaredMimeType: mime,
    verifiedMimeType: mime,
    byteSize: bytes.length,
    sourceKind: 'file',
    processingState: 'accepted',
    duplicate: false,
    originalSha256: sha(bytes),
    original: { path, immutable: true, verifiedMimeType: mime, verifiedByteSize: bytes.length, verifiedSha256: sha(bytes) },
    createdAt: now,
    validatedAt: now,
    version: 2,
    ...overrides,
  };
}

const textPath = `organizations/${orgId}/financeEntities/${entityA}/evidence/${textId}/original.pdf`;
const noTextPath = `organizations/${orgId}/financeEntities/${entityA}/evidence/${noTextId}/original.pdf`;
const imagePath = `organizations/${orgId}/financeEntities/${entityA}/evidence/${imageId}/original.png`;
const crossPath = `organizations/${orgId}/financeEntities/${entityB}/evidence/${crossId}/original.pdf`;
const corruptPath = `organizations/${orgId}/financeEntities/${entityA}/evidence/${corruptId}/original.pdf`;
objects.set(textPath, { bytes: pdf, contentType: 'application/pdf' });
objects.set(noTextPath, { bytes: noTextPdf, contentType: 'application/pdf' });
objects.set(imagePath, { bytes: png, contentType: 'image/png' });
objects.set(crossPath, { bytes: pdf, contentType: 'application/pdf' });
objects.set(corruptPath, { bytes: Buffer.concat([pdf, Buffer.from('drift')]), contentType: 'application/pdf' });

await evidenceCollection(entityA).doc(textId).set(evidenceData(entityA, textId, textPath, pdf));
await evidenceCollection(entityA).doc(noTextId).set(evidenceData(entityA, noTextId, noTextPath, noTextPdf));
await evidenceCollection(entityA).doc(imageId).set(evidenceData(entityA, imageId, imagePath, png, 'image/png'));
await evidenceCollection(entityB).doc(crossId).set(evidenceData(entityB, crossId, crossPath, pdf));
await evidenceCollection(entityA).doc(corruptId).set(evidenceData(entityA, corruptId, corruptPath, pdf));
await evidenceCollection(entityA).doc(oversizedId).set(evidenceData(entityA, oversizedId, `private/${oversizedId}.pdf`, pdf, 'application/pdf', {
  byteSize: PDF_TEXT_MAX_INPUT_BYTES + 1,
  original: {
    path: `private/${oversizedId}.pdf`,
    immutable: true,
    verifiedMimeType: 'application/pdf',
    verifiedByteSize: PDF_TEXT_MAX_INPUT_BYTES + 1,
    verifiedSha256: sha(pdf),
  },
}));
await evidenceCollection(entityA).doc(pendingId).set({
  evidenceId: pendingId,
  organizationId: orgId,
  financeEntityId: entityA,
  processingState: 'awaiting_upload',
  declaredMimeType: 'application/pdf',
  byteSize: 100,
  sourceKind: 'file',
  original: { path: `private/${pendingId}.pdf`, immutable: true },
  createdAt: now,
  version: 1,
});

const originalVerify = admin.auth.verifyIdToken;
let verifiedUid = uid;
admin.auth.verifyIdToken = async () => ({ uid: verifiedUid, mn_organization_id: orgId }) as any;
const call = async (body: any, headerOrg = orgId) => {
  const req = { method: 'POST', headers: { authorization: 'Bearer i2g_test', 'x-organization-id': headerOrg }, body, query: {} };
  const res = new MockRes();
  await universalEvidencePdfText(req as any, res as any);
  return res;
};

let passed = 0;
const verify = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`✅ ${message}`);
};

try {
  const extracted = await call({ financeEntityId: entityA, evidenceId: textId });
  verify(extracted.statusCode === 200 && extracted.body.extraction.state === 'extracted', 'same-entity verified PDF returns native text extraction');
  verify(extracted.body.extraction.text.includes('Hello protected I2G'), 'native text is returned only in the protected response');
  verify(extracted.body.extraction.deterministic === true && extracted.body.extraction.aiUsed === false && extracted.body.extraction.ocrUsed === false && extracted.body.extraction.financialRecognition === false, 'response explicitly reports deterministic zero-AI zero-OCR zero-recognition semantics');
  verify(extracted.headers.get('cache-control') === 'private, no-store', 'native PDF text responses are non-cacheable private data');
  verify(!JSON.stringify(extracted.body).includes(textPath) && !JSON.stringify(extracted.body).includes(sha(pdf)), 'response does not leak Storage path or content hash');
  verify(readPaths.at(-1) === textPath, 'Storage original is read only after authorization and tenant-scoped lookup');

  const noText = await call({ financeEntityId: entityA, evidenceId: noTextId });
  verify(noText.statusCode === 200 && noText.body.extraction.state === 'unavailable' && noText.body.extraction.reason === 'text_layer_not_detected', 'PDF without supported text remains unavailable with no OCR fallback');

  const beforeOversizedReads = readPaths.length;
  const oversized = await call({ financeEntityId: entityA, evidenceId: oversizedId });
  verify(oversized.statusCode === 413 && oversized.body.error === 'EVIDENCE_TEXT_EXTRACTION_TOO_LARGE', 'metadata over 4 MiB is rejected before parsing');
  verify(readPaths.length === beforeOversizedReads, 'oversized metadata is rejected before any Storage read');

  const bodySpoof = await call({ financeEntityId: entityA, evidenceId: textId, organizationId: 'body-org-must-not-win' });
  verify(bodySpoof.statusCode === 200, 'organizationId in body cannot retarget canonical tenant');
  const headerSpoof = await call({ financeEntityId: entityA, evidenceId: textId }, 'another-org');
  verify(headerSpoof.statusCode === 403, 'conflicting organization header fails closed');

  verifiedUid = ownerUid;
  const ownerDenied = await call({ financeEntityId: entityA, evidenceId: textId });
  verify(ownerDenied.statusCode === 403, 'organizational owner is not treated as a canonical global role');
  verifiedUid = uid;

  const cross = await call({ financeEntityId: entityA, evidenceId: crossId });
  verify(cross.statusCode === 404, 'Entity B evidence cannot be extracted through Entity A context');
  const ownEntityB = await call({ financeEntityId: entityB, evidenceId: crossId });
  verify(ownEntityB.statusCode === 200 && ownEntityB.body.extraction.state === 'extracted', 'Entity B can extract only its own verified PDF');

  const image = await call({ financeEntityId: entityA, evidenceId: imageId });
  verify(image.statusCode === 415 && image.body.error === 'EVIDENCE_NOT_PDF', 'non-PDF evidence is rejected before native extraction');
  const pending = await call({ financeEntityId: entityA, evidenceId: pendingId });
  verify(pending.statusCode === 409 && pending.body.error === 'EVIDENCE_ANALYSIS_NOT_READY', 'awaiting-upload evidence cannot be extracted');
  const corrupt = await call({ financeEntityId: entityA, evidenceId: corruptId });
  verify(corrupt.statusCode === 422 && corrupt.body.error === 'EVIDENCE_CORRUPT', 'post-validation byte or hash drift fails closed');

  const sideEffects = await Promise.all([
    'financeTransactions', 'financeJournalEntries', 'financeJournalLines', 'financeAggregates', 'financeBalances', 'postingPlans', 'countSessions',
  ].map((name) => db.collection('organizations').doc(orgId).collection(name).get()));
  verify(sideEffects.every((snapshot) => snapshot.empty), 'native text endpoint creates zero transaction, journal, aggregate, balance, PostingPlan or Count side effects');

  console.log(`\nUniversal Evidence Native PDF Text I2G Emulator totals: ${passed} Passed`);
} finally {
  admin.auth.verifyIdToken = originalVerify;
  delete (globalThis as any)[Symbol.for('TEST_UNIVERSAL_EVIDENCE_STORAGE')];
}
