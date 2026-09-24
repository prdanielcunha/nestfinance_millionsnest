import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  getFirebaseAdmin,
  resetFirebaseAdminForTests,
} from '../api/_lib/firebaseAdmin.js';
import transactionsCreateDraft from '../server/vercel-handlers/finance/transactionsCreateDraft.js';
import transactionsSubmitForReview from '../server/vercel-handlers/finance/transactionsSubmitForReview.js';
import periodCloseReadiness from '../server/vercel-handlers/finance/periodCloseReadiness.js';
import accountantPackageExport from '../server/vercel-handlers/finance/accountantPackageExport.js';

process.env.NODE_ENV = 'test';

class MockRes {
  statusCode = 200;
  body: any = null;
  setHeader(_name: string, _value: string) { return this; }
  status(code: number) { this.statusCode = code; return this; }
  json(body: any) { this.body = body; return this; }
}

async function call(
  handler: any,
  organizationId: string,
  body: Record<string, unknown>,
) {
  const req: any = {
    method: 'POST',
    headers: {
      authorization: 'Bearer cycle10-e2e-token',
      'x-organization-id': organizationId,
    },
    query: {},
    body,
  };
  const res = new MockRes();
  await handler(req, res as any);
  return res;
}

async function run() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST is required');
  }

  resetFirebaseAdminForTests();
  const admin = getFirebaseAdmin();
  const db = admin.firestore;
  const suffix = crypto.randomBytes(4).toString('hex');
  const organizationId = 'org_cycle10_e2e_' + suffix;
  const financeEntityId = 'entity_cycle10_e2e_' + suffix;
  const uid = 'user_cycle10_e2e_' + suffix;
  const accountId = 'acc_cycle10_e2e_' + suffix;
  const categoryId = 'cat_cycle10_e2e_' + suffix;

  await db.collection('organizations').doc(organizationId).set({
    name: 'Cycle 10 Synthetic E2E',
  });
  await db.collection('users').doc(uid).set({
    displayName: 'Cycle 10 E2E User',
    systemRole: 'ceo',
  });
  await db.collection('organizations').doc(organizationId)
    .collection('financeEntities').doc(financeEntityId).set({
      name: 'Synthetic Church',
      active: true,
    });
  await db.collection('organizations').doc(organizationId)
    .collection('financeAccounts').doc(accountId).set({
      financeEntityId,
      name: 'Conta Banco',
      active: true,
      type: 'asset:bank',
      nature: 'asset',
      configurationStatus: 'complete',
      supportedPaymentInstruments: ['pix'],
      openingBalanceCents: 0,
    });
  await db.collection('organizations').doc(organizationId)
    .collection('financeCategories').doc(categoryId).set({
      financeEntityId,
      name: 'Ofertas',
      kind: 'income',
      active: true,
    });

  const originalVerify = admin.auth.verifyIdToken;
  admin.auth.verifyIdToken = async () => ({
    uid,
    email: uid + '@example.test',
    name: 'Cycle 10 E2E User',
    mn_app_id: 'nestfinance',
    mn_handoff_version: 1,
    mn_organization_id: organizationId,
    mn_session_version: 1,
  }) as any;

  try {
    const create = await call(transactionsCreateDraft, organizationId, {
      financeEntityId,
      idempotencyKey: 'idsm_' + crypto.randomBytes(8).toString('hex'),
      requestId: 'req_' + crypto.randomBytes(8).toString('hex'),
      payload: {
        direction: 'income',
        amountCents: 12500,
        occurredAt: '2026-09-18T15:00:00.000Z',
        accountId,
        paymentMethod: 'pix',
        counterparty: 'Doador sintético',
        description: 'Oferta sintética do E2E',
        evidenceJustification: 'Cenário sintético autenticado sem comprovante real',
        allocations: [
          {
            categoryId,
            amountCents: 12500,
            description: 'Oferta',
          },
        ],
      },
    });

    assert.equal(create.statusCode, 200, JSON.stringify(create.body));
    assert.ok(create.body.transactionId);
    assert.equal(create.body.version, 1);
    const transactionId = String(create.body.transactionId);

    const submit = await call(transactionsSubmitForReview, organizationId, {
      financeEntityId,
      transactionId,
      expectedVersion: 1,
      idempotencyKey: 'idsm_' + crypto.randomBytes(8).toString('hex'),
      requestId: 'req_' + crypto.randomBytes(8).toString('hex'),
    });
    assert.equal(submit.statusCode, 200, JSON.stringify(submit.body));
    assert.equal(submit.body.version, 2);

    const stored = await db.collection('organizations').doc(organizationId)
      .collection('financeTransactions').doc(transactionId).get();
    assert.equal(stored.data()?.status, 'ready_for_review');

    const readiness = await call(periodCloseReadiness, organizationId, {
      financeEntityId,
      period: '2026-09',
    });
    assert.equal(readiness.statusCode, 200, JSON.stringify(readiness.body));
    assert.equal(readiness.body.readiness.state, 'attention_required');
    assert.ok(readiness.body.readiness.blockerCount >= 1);
    assert.equal(readiness.body.authority.canClosePeriod, false);

    const accountant = await call(accountantPackageExport, organizationId, {
      financeEntityId,
      period: '2026-09',
      layout: {
        transactionColumns: [
          'transactionId',
          'occurredAt',
          'transactionKind',
          'status',
          'amount',
          'counterparty',
          'reconciliationStatus',
        ],
      },
    });
    assert.equal(accountant.statusCode, 200, JSON.stringify(accountant.body));
    assert.equal(accountant.body.financialMutation, false);
    assert.equal(accountant.body.postingCertificationSeparate, true);
    assert.equal(accountant.body.manifest.authority.officialAccountingStatement, false);
    assert.equal(accountant.body.manifest.authority.postingCertificationSeparate, true);

    const transactionCsv = accountant.body.files.find(
      (file: any) => String(file.filename).endsWith('-transactions.csv'),
    );
    const pendingCsv = accountant.body.files.find(
      (file: any) => String(file.filename).includes('pending-justifications-reconciliation'),
    );
    assert.ok(transactionCsv?.content.includes(transactionId));
    assert.ok(transactionCsv?.content.includes('"125.00"'));
    assert.ok(pendingCsv?.content.includes(transactionId));

    const [journals, balances, aggregates] = await Promise.all([
      db.collection('organizations').doc(organizationId).collection('financeJournalEntries').get(),
      db.collection('organizations').doc(organizationId).collection('financeBalances').get(),
      db.collection('organizations').doc(organizationId).collection('financeAggregates').get(),
    ]);
    assert.equal(journals.empty, true);
    assert.equal(balances.empty, true);
    assert.equal(aggregates.empty, true);

    console.log('✅ Cycle 10 authenticated synthetic E2E reaches review and accountant package without posting');
  } finally {
    admin.auth.verifyIdToken = originalVerify;
  }
}

run().catch((error) => {
  console.error('❌ Cycle 10 authenticated synthetic E2E failed', error);
  process.exit(1);
});
