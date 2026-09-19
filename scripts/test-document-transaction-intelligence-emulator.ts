import * as crypto from 'node:crypto';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import universalEvidenceAnalyzeTransaction from '../server/vercel-handlers/finance/universalEvidenceAnalyzeTransaction.js';
import transactionsCreateDraft from '../server/vercel-handlers/finance/transactionsCreateDraft.js';

class MockRes {
  statusCode = 200;
  body: any = null;
  headers: Record<string, string> = {};
  status(code: number) { this.statusCode = code; return this; }
  json(data: any) { this.body = data; return this; }
  setHeader(name: string, value: string) { this.headers[name] = value; return this; }
}

const sha = (bytes: Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');
const evidenceId = () => 'evd_' + crypto.randomBytes(16).toString('hex');

function providerResult(input?: {
  transactionKind?: 'expense' | 'income' | 'transfer' | 'non_transaction';
  documentType?: string;
  counterparty?: string;
  issuer?: string | null;
  recipient?: string | null;
  payer?: string | null;
  payee?: string | null;
  category?: string | null;
  multiplicity?: 'single' | 'multiple';
  amount?: string;
  currency?: string;
  settlement?: 'paid' | 'unpaid' | 'unknown';
  paymentMethod?: string;
  description?: string;
}) {
  const role = (value: string | null | undefined, fallback: string | null) => {
    const effective = value === undefined ? fallback : value;
    return effective === null
      ? { status: 'absent' as const, observation: '' }
      : { status: 'recognized' as const, observation: effective };
  };
  return {
    fields: [
      { key: 'document_type', status: 'recognized', observation: input?.documentType || 'fiscal_receipt' },
      { key: 'transaction_kind', status: 'recognized', observation: input?.transactionKind || 'expense' },
      { key: 'counterparty_name', status: 'recognized', observation: input?.counterparty || 'FORNECEDOR EXEMPLO LTDA' },
      { key: 'issuer_tax_id', ...role(input?.issuer, '11.444.777/0001-61') },
      { key: 'recipient_tax_id', ...role(input?.recipient, '04.252.011/0001-10') },
      { key: 'payer_tax_id', ...role(input?.payer, null) },
      { key: 'payee_tax_id', ...role(input?.payee, null) },
      { key: 'document_number', status: 'recognized', observation: 'DOC-12345' },
      { key: 'total_amount', status: 'recognized', observation: input?.amount || 'R$ 250,00' },
      { key: 'currency', status: 'recognized', observation: input?.currency || 'BRL' },
      { key: 'occurred_at', status: 'recognized', observation: '19/09/2026' },
      { key: 'due_date', status: 'absent', observation: '' },
      { key: 'settlement_state', status: 'recognized', observation: input?.settlement || 'paid' },
      { key: 'payment_method', status: 'recognized', observation: input?.paymentMethod || 'credit_card' },
      { key: 'description', status: 'recognized', observation: input?.description || 'Compra de materiais' },
      {
        key: 'category_id',
        status: input?.category === null ? 'absent' : 'recognized',
        observation: input?.category === null ? '' : input?.category || 'cat_fuel',
      },
      { key: 'document_multiplicity', status: 'recognized', observation: input?.multiplicity || 'single' },
    ],
  };
}

async function run() {
  process.env.NODE_ENV = 'test';
  process.env.FIREBASE_PROJECT_ID = 'nestfinance-p06b-emulator';
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Document intelligence emulator test requires FIRESTORE_EMULATOR_HOST');

  resetFirebaseAdminForTests();
  const admin = getFirebaseAdmin();
  const db = admin.firestore;
  const suffix = crypto.randomBytes(4).toString('hex');
  const orgId = 'org_docintel_' + suffix;
  const entityA = 'fent_doc_a_' + suffix;
  const entityB = 'fent_doc_b_' + suffix;
  const uid = 'usr_docintel_' + suffix;

  await db.collection('organizations').doc(orgId).set({ name: 'Document Intelligence Org', status: 'active' });
  await db.collection('users').doc(uid).set({ displayName: 'Document User', systemRole: 'ceo' });

  const entityARef = db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityA);
  const entityBRef = db.collection('organizations').doc(orgId).collection('financeEntities').doc(entityB);
  await entityARef.set({
    id: entityA,
    organizationId: orgId,
    displayName: 'Igreja A',
    legalName: 'Igreja A',
    taxId: '04252011000110',
    active: true,
  });
  await entityBRef.set({
    id: entityB,
    organizationId: orgId,
    displayName: 'Igreja B',
    legalName: 'Igreja B',
    taxId: '33000167000101',
    active: true,
  });
  const categoriesRef = db.collection('organizations').doc(orgId).collection('financeCategories');
  await categoriesRef.doc('cat_fuel').set({
    id: 'cat_fuel',
    organizationId: orgId,
    financeEntityId: entityA,
    name: 'Combustível',
    normalizedName: 'combustivel',
    kind: 'expense',
    active: true,
  });
  await categoriesRef.doc('cat_income').set({
    id: 'cat_income',
    organizationId: orgId,
    financeEntityId: entityA,
    name: 'Dízimos',
    normalizedName: 'dizimos',
    kind: 'income',
    active: true,
  });

  const objects = new Map<string, { bytes: Buffer; contentType: string }>();
  const STORAGE_SYMBOL = Symbol.for('TEST_UNIVERSAL_EVIDENCE_STORAGE');
  (globalThis as any)[STORAGE_SYMBOL] = {
    async createUploadUrl() { throw new Error('NOT_USED'); },
    async inspectAndHash() { throw new Error('NOT_USED'); },
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

  const PROVIDER_SYMBOL = Symbol.for('TEST_DOCUMENT_TRANSACTION_INTELLIGENCE_PROVIDER');
  const providerQueue: any[] = [];
  let providerCalls = 0;
  (globalThis as any)[PROVIDER_SYMBOL] = {
    async analyze() {
      providerCalls += 1;
      const next = providerQueue.shift();
      if (!next) throw new Error('NO_TEST_PROVIDER_RESPONSE');
      return {
        provider: 'test',
        model: 'test-document-vision',
        revision: 'document-to-draft-structured-v2',
        result: next,
      };
    },
  };

  const originalVerify = admin.auth.verifyIdToken;
  admin.auth.verifyIdToken = async () => ({
    uid,
    email: uid + '@test.com',
    mn_organization_id: orgId,
  }) as any;

  const call = async (handler: any, body: any) => {
    const req = {
      method: 'POST',
      headers: {
        authorization: 'Bearer doc_intel_test',
        'x-organization-id': orgId,
      },
      body,
      query: {},
    };
    const res = new MockRes();
    await handler(req as any, res as any);
    return res;
  };

  const key = () => 'iddocintel_' + crypto.randomBytes(12).toString('hex');
  const request = () => 'req_' + crypto.randomBytes(12).toString('hex');

  async function seedEvidence(entityRef: any, entityId: string, id: string, marker: string) {
    const bytes = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
      Buffer.from(marker),
    ]);
    const path = `organizations/${orgId}/financeEntities/${entityId}/universal-evidence/${id}/original.jpg`;
    objects.set(path, { bytes, contentType: 'image/jpeg' });
    await entityRef.collection('universalEvidence').doc(id).set({
      evidenceId: id,
      organizationId: orgId,
      financeEntityId: entityId,
      originalFilename: marker + '.jpg',
      declaredMimeType: 'image/jpeg',
      verifiedMimeType: 'image/jpeg',
      byteSize: bytes.length,
      sourceKind: 'camera',
      processingState: 'accepted',
      duplicate: false,
      version: 2,
      original: {
        path,
        immutable: true,
        verifiedMimeType: 'image/jpeg',
        verifiedByteSize: bytes.length,
        verifiedSha256: sha(bytes),
      },
    });
    return { bytes, path };
  }

  let passed = 0;
  const verify = (condition: unknown, message: string) => {
    if (!condition) throw new Error('Assertion failed: ' + message);
    passed += 1;
    console.log('✅ ' + message);
  };

  try {
    const evMatch = evidenceId();
    await seedEvidence(entityARef, entityA, evMatch, 'fuel-match');
    providerQueue.push(providerResult());

    const analyzeKey = key();
    const analyzed = await call(universalEvidenceAnalyzeTransaction, {
      financeEntityId: entityA,
      evidenceId: evMatch,
      expectedVersion: 2,
      locale: 'PT',
      idempotencyKey: analyzeKey,
      requestId: request(),
    });
    verify(analyzed.statusCode === 200 && analyzed.body.version === 3 && analyzed.body.replayed === false, 'accepted receipt receives a versioned AI-assisted analysis');
    verify(analyzed.body.analysis.entityTaxIdCheck === 'match', 'recipient CNPJ is matched to the active church on the server');
    verify(analyzed.body.analysis.transactionKind.value === 'expense', 'retail evidence is proposed as expense');
    verify(analyzed.body.analysis.totalAmountCents.value === 25000, 'document total is normalized to integer cents');
    verify(analyzed.body.analysis.suggestedCategoryName === 'Combustível', 'active same-direction category is suggested');
    verify(analyzed.body.analysis.authority.createsTransaction === false && analyzed.body.analysis.authority.changesBalance === false, 'analysis remains non-authoritative');

    const txBefore = await db.collection('organizations').doc(orgId).collection('financeTransactions').get();
    const journalBefore = await db.collection('organizations').doc(orgId).collection('financeJournalEntries').get();
    const aggregatesBefore = await db.collection('organizations').doc(orgId).collection('financeAggregates').get();
    verify(txBefore.empty && journalBefore.empty && aggregatesBefore.empty, 'analysis creates no transaction, journal or balance aggregate');

    const callsBeforeReplay = providerCalls;
    const replay = await call(universalEvidenceAnalyzeTransaction, {
      financeEntityId: entityA,
      evidenceId: evMatch,
      expectedVersion: 3,
      locale: 'PT',
      idempotencyKey: key(),
      requestId: request(),
    });
    verify(replay.statusCode === 200 && replay.body.replayed === true, 'matching stored analysis is reused safely');
    verify(providerCalls === callsBeforeReplay, 'analysis replay does not spend another model call');

    const storedEvidence = (await entityARef.collection('universalEvidence').doc(evMatch).get()).data() || {};
    verify(storedEvidence.transactionAnalysis?.analysis?.entityTaxIdCheck === 'match', 'analysis is source-bound to immutable evidence');
    verify(storedEvidence.transactionAnalysis?.analysis?.authority?.humanConfirmationRequired === true, 'stored analysis preserves human-confirmation requirement');

    const analysisAudits = await db.collection('organizations').doc(orgId).collection('financeAuditLogs')
      .where('action', '==', 'evidence.transaction_analysis_generated').get();
    verify(analysisAudits.size === 1, 'analysis generation is auditable exactly once');
    verify(
      analysisAudits.docs[0]?.data()?.metadata?.transactionCreated === false &&
      analysisAudits.docs[0]?.data()?.metadata?.balanceMutation === false,
      'analysis audit explicitly records no transaction/balance authority',
    );

    const factsBeforeDraft = await db.collection('intelligenceFacts').get();
    verify(
      !factsBeforeDraft.docs.some((doc: any) => doc.data()?.entityId === evMatch && doc.data()?.eventType === 'TRANSACTION_CREATED'),
      'AI proposal is not mislabeled as a canonical financial transaction fact',
    );

    const draft = await call(transactionsCreateDraft, {
      financeEntityId: entityA,
      payload: {
        direction: 'expense',
        amountCents: 25000,
        occurredAt: '2026-09-19',
        description: 'Combustível',
        counterparty: 'POSTO EXEMPLO LTDA',
        paymentMethod: 'credit_card',
        allocations: [{ categoryId: 'cat_fuel', amountCents: 25000 }],
        evidenceIds: [evMatch],
        sourceContext: 'document_intelligence',
      },
      idempotencyKey: key(),
      requestId: request(),
    });
    verify(draft.statusCode === 200 && /^tx_[a-f0-9]{16,64}$/.test(draft.body.transactionId), 'human-confirmed proposal creates a draft transaction');

    const draftDoc = (await entityARef.collection('transactions').doc(draft.body.transactionId).get()).data()
      || (await db.collection('organizations').doc(orgId).collection('financeTransactions').doc(draft.body.transactionId).get()).data()
      || {};
    verify(draftDoc.status === 'draft', 'document-generated transaction remains draft');
    verify(draftDoc.sourceContext === 'document_intelligence', 'draft preserves document-intelligence provenance');
    verify(Array.isArray(draftDoc.evidenceIds) && draftDoc.evidenceIds[0] === evMatch, 'immutable original evidence is attached to the draft');
    verify(draftDoc.description === 'Combustível' && draftDoc.counterparty === 'POSTO EXEMPLO LTDA', 'confirmed factual description and counterparty are preserved');

    const journalAfterDraft = await db.collection('organizations').doc(orgId).collection('financeJournalEntries').get();
    const aggregateAfterDraft = await db.collection('organizations').doc(orgId).collection('financeAggregates').get();
    verify(journalAfterDraft.empty && aggregateAfterDraft.empty, 'confirmed document creates only a draft, never posting or balance mutation');

    const crossEntityDraft = await call(transactionsCreateDraft, {
      financeEntityId: entityB,
      payload: {
        direction: 'expense',
        amountCents: 25000,
        occurredAt: '2026-09-19',
        evidenceIds: [evMatch],
        sourceContext: 'document_intelligence',
      },
      idempotencyKey: key(),
      requestId: request(),
    });
    verify(crossEntityDraft.statusCode === 400 && crossEntityDraft.body.error === 'FINANCE_EVIDENCE_MISMATCH', 'same evidence cannot be attached to another finance entity');

    const evAbsent = evidenceId();
    await seedEvidence(entityARef, entityA, evAbsent, 'fuel-absent-cnpj');
    providerQueue.push(providerResult({ recipient: null, payer: null }));
    const absent = await call(universalEvidenceAnalyzeTransaction, {
      financeEntityId: entityA,
      evidenceId: evAbsent,
      expectedVersion: 2,
      locale: 'PT',
      idempotencyKey: key(),
      requestId: request(),
    });
    verify(absent.statusCode === 200 && absent.body.analysis.entityTaxIdCheck === 'absent', 'receipt without consumer CNPJ remains explicitly absent');

    const evMismatch = evidenceId();
    await seedEvidence(entityARef, entityA, evMismatch, 'fuel-wrong-cnpj');
    providerQueue.push(providerResult({ recipient: '33.000.167/0001-01', payer: null }));
    const mismatch = await call(universalEvidenceAnalyzeTransaction, {
      financeEntityId: entityA,
      evidenceId: evMismatch,
      expectedVersion: 2,
      locale: 'PT',
      idempotencyKey: key(),
      requestId: request(),
    });
    verify(mismatch.statusCode === 200 && mismatch.body.analysis.analysisStatus === 'entity_mismatch', 'different consumer CNPJ is marked as wrong-entity evidence');

    const evMultiple = evidenceId();
    await seedEvidence(entityARef, entityA, evMultiple, 'two-receipts-one-photo');
    providerQueue.push(providerResult({ multiplicity: 'multiple' }));
    const multiple = await call(universalEvidenceAnalyzeTransaction, {
      financeEntityId: entityA,
      evidenceId: evMultiple,
      expectedVersion: 2,
      locale: 'PT',
      idempotencyKey: key(),
      requestId: request(),
    });
    verify(multiple.statusCode === 200 && multiple.body.analysis.analysisStatus === 'multiple_documents', 'one image with multiple receipts is not collapsed into one proposal');

    const evWrongCategory = evidenceId();
    await seedEvidence(entityARef, entityA, evWrongCategory, 'wrong-category');
    providerQueue.push(providerResult({ category: 'cat_income' }));
    const wrongCategory = await call(universalEvidenceAnalyzeTransaction, {
      financeEntityId: entityA,
      evidenceId: evWrongCategory,
      expectedVersion: 2,
      locale: 'PT',
      idempotencyKey: key(),
      requestId: request(),
    });
    verify(wrongCategory.statusCode === 200 && wrongCategory.body.analysis.categoryId.value === null, 'income category suggestion is rejected for expense evidence');

    const evIncome = evidenceId();
    await seedEvidence(entityARef, entityA, evIncome, 'pix-income');
    providerQueue.push(providerResult({
      transactionKind: 'income',
      documentType: 'pix_receipt',
      counterparty: 'DOADOR EXEMPLO',
      issuer: null,
      recipient: null,
      payer: '11.444.777/0001-61',
      payee: '04.252.011/0001-10',
      category: 'cat_income',
      amount: 'R$ 900,00',
      paymentMethod: 'pix',
      description: 'Entrada recebida via Pix',
    }));
    const income = await call(universalEvidenceAnalyzeTransaction, {
      financeEntityId: entityA,
      evidenceId: evIncome,
      expectedVersion: 2,
      locale: 'PT',
      idempotencyKey: key(),
      requestId: request(),
    });
    verify(income.statusCode === 200 && income.body.analysis.entityTaxIdRole === 'payee', 'income document can identify church as payment beneficiary');
    verify(income.body.analysis.transactionKind.value === 'income' && income.body.analysis.analysisStatus === 'ready_for_confirmation', 'completed Pix receipt can become an income proposal');

    const evUnpaid = evidenceId();
    await seedEvidence(entityARef, entityA, evUnpaid, 'utility-unpaid');
    providerQueue.push(providerResult({
      documentType: 'utility_bill',
      settlement: 'unpaid',
      paymentMethod: 'unknown',
      description: 'Energia elétrica',
    }));
    const unpaid = await call(universalEvidenceAnalyzeTransaction, {
      financeEntityId: entityA,
      evidenceId: evUnpaid,
      expectedVersion: 2,
      locale: 'PT',
      idempotencyKey: key(),
      requestId: request(),
    });
    verify(unpaid.statusCode === 200 && unpaid.body.analysis.analysisStatus === 'not_settled', 'unpaid bill is preserved but cannot masquerade as a cash outflow');

    const evUsd = evidenceId();
    await seedEvidence(entityARef, entityA, evUsd, 'foreign-currency');
    providerQueue.push(providerResult({
      amount: 'US$ 125.50',
      currency: 'USD',
    }));
    const foreign = await call(universalEvidenceAnalyzeTransaction, {
      financeEntityId: entityA,
      evidenceId: evUsd,
      expectedVersion: 2,
      locale: 'PT',
      idempotencyKey: key(),
      requestId: request(),
    });
    verify(foreign.statusCode === 200 && foreign.body.analysis.analysisStatus === 'unsupported_currency', 'foreign-currency evidence is never silently treated as BRL');

    const otherEntityAnalysis = await call(universalEvidenceAnalyzeTransaction, {
      financeEntityId: entityB,
      evidenceId: evMatch,
      expectedVersion: 3,
      locale: 'PT',
      idempotencyKey: key(),
      requestId: request(),
    });
    verify(otherEntityAnalysis.statusCode === 404, 'evidence analysis cannot cross finance entities');
  } finally {
    admin.auth.verifyIdToken = originalVerify;
    delete (globalThis as any)[STORAGE_SYMBOL];
    delete (globalThis as any)[PROVIDER_SYMBOL];
  }

  console.log('\nDocument Transaction Intelligence Firestore Emulator totals: ' + passed + ' Passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
