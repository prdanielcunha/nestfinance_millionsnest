import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [summarySource, detailSource, serviceSource, indexSource] = await Promise.all([
  readFile('server/vercel-handlers/finance/intelligenceSignalsSummary.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/intelligenceSignalsDetail.ts', 'utf8'),
  readFile('src/services/needsAttentionService.ts', 'utf8'),
  readFile('firestore.indexes.json', 'utf8'),
]);

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log(`✅ ${message}`);
};

verify(
  summarySource.includes("mode: 'partial_projection'") &&
    summarySource.includes('canDeclareAllClear: false') &&
    summarySource.includes("reason: 'PRE_P5_BACKFILL_NOT_CERTIFIED'"),
  'summary refuses false all-clear claims before certified backfill',
);

verify(
  summarySource.includes("where('organizationId', '==', organizationId)") &&
    summarySource.includes("where('financeEntityId', '==', financeEntityId)") &&
    summarySource.includes("where('status', '==', 'open')"),
  'summary query is tenant, finance-entity and open-status scoped',
);

verify(
  summarySource.includes('hasFinanceCapability') &&
    summarySource.includes("requiredCapability === 'finance.review'") &&
    summarySource.includes("requiredCapability === 'finance.create_drafts'"),
  'summary is permission-scoped by the signal capability',
);

verify(
  detailSource.includes('signal.organizationId !== organizationId') &&
    detailSource.includes('signal.financeEntityId !== financeEntityId') &&
    detailSource.includes('fact.payload?.financeEntityId !== financeEntityId'),
  'detail verifies both signal and fact finance-entity isolation',
);

verify(
  detailSource.includes("return res.status(409).json({ error: 'SIGNAL_SOURCE_UNAVAILABLE' })"),
  'detail fails closed when canonical fact evidence is unavailable',
);

for (const forbidden of ['amountCents', 'comment', 'sourceHash', 'description']) {
  verify(
    !detailSource.match(new RegExp(`SAFE_REASON_KEYS[\\s\\S]{0,900}['"]${forbidden}['"]`)),
    `detail whitelist excludes ${forbidden}`,
  );
}

verify(
  !summarySource.includes('generateContent') &&
    !detailSource.includes('generateContent') &&
    !summarySource.includes('OpenAI') &&
    !detailSource.includes('OpenAI'),
  'Needs Attention reads contain no LLM dependency',
);

for (const source of [summarySource, detailSource]) {
  verify(
    !source.includes('financeJournalEntries') &&
      !source.includes('financeBalances') &&
      !source.includes('financeAggregates') &&
      !source.includes('postingPlans'),
    'read model handlers contain no financial posting or balance mutation path',
  );
}

verify(
  serviceSource.includes("'intelligence-signals-summary'") &&
    serviceSource.includes("'intelligence-signals-detail'"),
  'web client calls only the certified finance gateway operations',
);

const indexes = JSON.parse(indexSource);
const signalIndex = indexes.indexes.find(
  (index: any) =>
    index.collectionGroup === 'intelligenceSignals' &&
    index.queryScope === 'COLLECTION',
);
verify(Boolean(signalIndex), 'intelligenceSignals has a production Firestore composite index');
verify(
  JSON.stringify(signalIndex?.fields) ===
    JSON.stringify([
      { fieldPath: 'organizationId', order: 'ASCENDING' },
      { fieldPath: 'financeEntityId', order: 'ASCENDING' },
      { fieldPath: 'status', order: 'ASCENDING' },
    ]),
  'signal index matches the exact summary query shape',
);

console.log(`\nNeeds Attention contract totals: ${passed} Passed`);
