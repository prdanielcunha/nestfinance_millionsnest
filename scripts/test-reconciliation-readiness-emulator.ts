import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import reconciliationReadiness from '../server/vercel-handlers/finance/reconciliationReadiness.js';

class MockRes {
  statusCode = 200;
  body: any = null;
  status(code: number) { this.statusCode = code; return this; }
  json(body: any) { this.body = body; return this; }
  setHeader() { return this; }
}

process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || 'nestfinance-reconciliation-readiness-emulator';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Reconciliation readiness tests require Firestore Emulator');
}

resetFirebaseAdminForTests();
const admin = getFirebaseAdmin();
const db = admin.firestore;
const suffix = randomBytes(4).toString('hex');
const orgId = `org_balance_${suffix}`;
const uid = `usr_balance_${suffix}`;
const now = Timestamp.now();

await db.collection('organizations').doc(orgId).set({ name: 'Balance Org', status: 'active' });
await db.collection('users').doc(uid).set({ systemRole: 'ceo' });

const entities = {
  noAccount: `ent_no_account_${suffix}`,
  noStatement: `ent_no_statement_${suffix}`,
  pending: `ent_pending_${suffix}`,
  unsupported: `ent_unsupported_${suffix}`,
  ready: `ent_ready_${suffix}`,
};

for (const entityId of Object.values(entities)) {
  await db
    .collection('organizations')
    .doc(orgId)
    .collection('financeEntities')
    .doc(entityId)
    .set({ name: entityId, active: true });
}

async function seedBankAccount(entityId: string, id: string) {
  await db
    .collection('organizations')
    .doc(orgId)
    .collection('financeAccounts')
    .doc(id)
    .set({
      organizationId: orgId,
      financeEntityId: entityId,
      name: 'Conta bancária',
      type: 'bank_checking',
      nature: 'asset',
      configurationStatus: 'complete',
      institutionName: 'Banco Teste',
      accountLast4: '1234',
      currency: 'BRL',
      active: true,
    });
}

for (const [key, entityId] of Object.entries(entities)) {
  if (key !== 'noAccount') await seedBankAccount(entityId, `acc_${key}_${suffix}`);
}

await db
  .collection('organizations')
  .doc(orgId)
  .collection('financeAccounts')
  .doc(`acc_cash_${suffix}`)
  .set({
    organizationId: orgId,
    financeEntityId: entities.ready,
    name: 'Caixa físico',
    type: 'cash',
    nature: 'asset',
    configurationStatus: 'complete',
    active: true,
  });

async function seedStatement(
  entityId: string,
  evidenceId: string,
  options: { reviewed: boolean; mime: string; duplicate?: boolean; documentType?: string },
) {
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
      originalFilename: `${evidenceId}.pdf`,
      processingState: 'accepted',
      duplicate: options.duplicate === true,
      verifiedMimeType: options.mime,
      byteSize: 2048,
      classification: {
        documentType: options.documentType || 'bank_statement',
        source: 'human',
        confirmedAt: now,
      },
      review: options.reviewed
        ? { status: 'reviewed', reviewedAt: now }
        : { status: 'pending', reviewedAt: null },
      createdAt: now,
      version: 3,
    });
}

await seedStatement(entities.pending, 'evd_' + '1'.repeat(32), {
  reviewed: false,
  mime: 'application/pdf',
});
await seedStatement(entities.unsupported, 'evd_' + '2'.repeat(32), {
  reviewed: true,
  mime: 'image/png',
});
await seedStatement(entities.ready, 'evd_' + '3'.repeat(32), {
  reviewed: true,
  mime: 'application/pdf',
});
await seedStatement(entities.ready, 'evd_' + '4'.repeat(32), {
  reviewed: false,
  mime: 'application/pdf',
});
await seedStatement(entities.ready, 'evd_' + '5'.repeat(32), {
  reviewed: true,
  mime: 'application/pdf',
  duplicate: true,
});
await seedStatement(entities.ready, 'evd_' + '6'.repeat(32), {
  reviewed: true,
  mime: 'application/pdf',
  documentType: 'receipt',
});

const originalVerify = admin.auth.verifyIdToken;
admin.auth.verifyIdToken = async () =>
  ({ uid, mn_organization_id: orgId }) as any;

const call = async (financeEntityId: string) => {
  const req = {
    method: 'POST',
    headers: {
      authorization: 'Bearer balance-test',
      'x-organization-id': orgId,
    },
    body: { financeEntityId },
    query: {},
  };
  const res = new MockRes();
  await reconciliationReadiness(req as any, res as any);
  return res;
};

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log(`✅ ${message}`);
};

try {
  const noAccount = await call(entities.noAccount);
  verify(
    noAccount.statusCode === 200 &&
      noAccount.body.state === 'no_bank_account' &&
      noAccount.body.summary.eligibleBankAccounts === 0,
    'entity without a configured bank account receives no_bank_account',
  );

  const noStatement = await call(entities.noStatement);
  verify(
    noStatement.statusCode === 200 &&
      noStatement.body.state === 'needs_statement' &&
      noStatement.body.summary.eligibleBankAccounts === 1 &&
      noStatement.body.summary.classifiedBankStatements === 0,
    'configured bank account without statement receives needs_statement',
  );

  const pending = await call(entities.pending);
  verify(
    pending.statusCode === 200 &&
      pending.body.state === 'needs_statement_review' &&
      pending.body.summary.pendingStatementReview === 1,
    'human-classified statement awaiting review receives needs_statement_review',
  );

  const unsupported = await call(entities.unsupported);
  verify(
    unsupported.statusCode === 200 &&
      unsupported.body.state === 'reviewed_source_not_supported' &&
      unsupported.body.summary.reviewedUnsupportedStatements === 1,
    'reviewed non-PDF statement remains source-backed but is not declared ready',
  );

  const ready = await call(entities.ready);
  verify(
    ready.statusCode === 200 &&
      ready.body.state === 'source_ready' &&
      ready.body.summary.eligibleBankAccounts === 1 &&
      ready.body.summary.classifiedBankStatements === 2 &&
      ready.body.summary.readyPdfStatements === 1 &&
      ready.body.summary.pendingStatementReview === 1,
    'reviewed PDF statement makes the source ready without hiding another pending statement',
  );
  verify(
    ready.body.accounts.some(
      (account: any) =>
        account.eligible === true &&
        account.institutionName === 'Banco Teste' &&
        account.accountLast4 === '1234',
    ) &&
      ready.body.accounts.some(
        (account: any) => account.type === 'cash' && account.eligible === false,
      ),
    'readiness distinguishes eligible bank accounts from non-bank accounts',
  );
  verify(
    ready.body.statements.every(
      (statement: any) =>
        statement.sourceBacked === true &&
        statement.evidenceId !== 'evd_' + '5'.repeat(32) &&
        statement.evidenceId !== 'evd_' + '6'.repeat(32),
    ),
    'duplicate and non-bank-statement evidence are excluded from reconciliation sources',
  );
  verify(
    ready.body.financialMutation === false &&
      ready.body.aiUsed === false &&
      ready.body.postingRequired === false,
    'readiness explicitly carries no AI, posting or financial mutation authority',
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
    'readiness is purely read-only and creates no facts, signals, journal, balance or aggregate writes',
  );

  console.log(`\nReconciliation Readiness Emulator totals: ${passed} Passed`);
} finally {
  admin.auth.verifyIdToken = originalVerify;
}
