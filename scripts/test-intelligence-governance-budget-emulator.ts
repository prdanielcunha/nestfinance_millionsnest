import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  getFirebaseAdmin,
  resetFirebaseAdminForTests,
} from '../api/_lib/firebaseAdmin.js';
import {
  intelligenceDayKey,
  reserveIntelligenceCall,
} from '../server/vercel-handlers/finance/intelligenceGovernanceStore.js';

process.env.NODE_ENV = 'test';

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    assert.fail('Expected ' + code);
  } catch (error: any) {
    assert.equal(String(error?.message || ''), code);
  }
}

async function run() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST is required');
  }

  resetFirebaseAdminForTests();
  const admin = getFirebaseAdmin();
  const db = admin.firestore;
  const suffix = crypto.randomBytes(4).toString('hex');

  const orgBudget = 'org_ai_budget_' + suffix;
  const entityBudget = 'entity_ai_budget_' + suffix;

  process.env.NESTFINANCE_INTELLIGENCE_DAILY_CALL_LIMIT = '1';
  process.env.NESTFINANCE_INTELLIGENCE_EVIDENCE_ATTEMPT_LIMIT = '5';

  const first = await reserveIntelligenceCall({
    db,
    organizationId: orgBudget,
    financeEntityId: entityBudget,
    evidenceId: 'evd_' + 'a'.repeat(32),
    model: 'gemini-2.5-flash-lite',
  });
  assert.equal(first.dailyLimit, 1);

  await expectCode(
    reserveIntelligenceCall({
      db,
      organizationId: orgBudget,
      financeEntityId: entityBudget,
      evidenceId: 'evd_' + 'b'.repeat(32),
      model: 'gemini-2.5-flash-lite',
    }),
    'INTELLIGENCE_DAILY_BUDGET_EXHAUSTED',
  );

  const budgetUsage = await db.collection('organizations').doc(orgBudget)
    .collection('financeIntelligenceUsage').doc(intelligenceDayKey()).get();
  assert.equal(budgetUsage.data()?.providerCalls, 1);

  const orgRetry = 'org_ai_retry_' + suffix;
  const entityRetry = 'entity_ai_retry_' + suffix;
  const evidenceRetry = 'evd_' + 'c'.repeat(32);

  process.env.NESTFINANCE_INTELLIGENCE_DAILY_CALL_LIMIT = '10';
  process.env.NESTFINANCE_INTELLIGENCE_EVIDENCE_ATTEMPT_LIMIT = '1';

  const retryFirst = await reserveIntelligenceCall({
    db,
    organizationId: orgRetry,
    financeEntityId: entityRetry,
    evidenceId: evidenceRetry,
    model: 'gemini-2.5-flash-lite',
  });
  assert.equal(retryFirst.attemptLimit, 1);

  await expectCode(
    reserveIntelligenceCall({
      db,
      organizationId: orgRetry,
      financeEntityId: entityRetry,
      evidenceId: evidenceRetry,
      model: 'gemini-2.5-flash-lite',
    }),
    'INTELLIGENCE_RETRY_LIMIT_EXHAUSTED',
  );

  const retryUsage = await db.collection('organizations').doc(orgRetry)
    .collection('financeIntelligenceUsage').doc(intelligenceDayKey()).get();
  const retryAttempt = await db.collection('organizations').doc(orgRetry)
    .collection('financeEntities').doc(entityRetry)
    .collection('intelligenceAttempts').doc(evidenceRetry).get();

  assert.equal(retryUsage.data()?.providerCalls, 1);
  assert.equal(retryAttempt.data()?.attempts, 1);

  console.log('✅ Intelligence governance blocks daily-budget and per-evidence retry exhaustion before another provider call');
}

run().catch((error) => {
  console.error('❌ Intelligence governance budget emulator test failed', error);
  process.exit(1);
});
