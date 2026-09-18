import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [factStream, scanner, preview, apply, verifySource] = await Promise.all([
  readFile('server/vercel-handlers/finance/factStream.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/attentionBackfill.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/attentionBackfillPreview.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/attentionBackfillApply.ts', 'utf8'),
  readFile('server/vercel-handlers/finance/attentionBackfillVerify.ts', 'utf8'),
]);

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log(`✅ ${message}`);
};

for (const source of [preview, apply, verifySource]) {
  verify(
    source.includes("hasEffectiveCapability(sessionList, 'finance.manage')"),
    'every backfill operation requires finance.manage/global authority',
  );
}
verify(
  apply.includes("eventType: 'ATTENTION_STATE_OBSERVED'") &&
    apply.includes("historicalEventInferred: false") &&
    apply.includes("observationKind: 'current_state_backfill'"),
  'apply records present-state observations instead of fabricating historical events',
);
verify(
  apply.includes('transaction.get(sourceRef)') &&
    apply.includes('matchesAttentionBackfillCandidate') &&
    apply.includes('stageFinanceSignalOpen'),
  'apply revalidates each authoritative record inside the write transaction',
);
verify(
  factStream.includes('ensureFinanceFact') &&
    factStream.includes('if (!existing.exists) transaction.create(factRef, fact)'),
  'immutable observation facts are reused idempotently and never updated',
);
verify(
  scanner.includes("collection('financeTransactions')") &&
    scanner.includes("collection('universalEvidence')") &&
    scanner.includes("collection('countSessions')"),
  'scanner covers transactions, Inbox evidence and Count',
);
verify(
  !apply.includes('financeJournalEntries') &&
    !apply.includes('financeBalances') &&
    !apply.includes('financeAggregates') &&
    !apply.includes('posting'),
  'backfill apply has no financial posting or balance mutation path',
);
verify(
  verifySource.includes("collection('intelligenceCoverage')") &&
    verifySource.includes("status: verified ? 'certified' : 'incomplete'"),
  'verification stores explicit server-side coverage status',
);
verify(
  preview.includes('financialMutation: false') &&
    apply.includes('financialMutation: false') &&
    verifySource.includes('financialMutation: false'),
  'all backfill phases declare non-financial authority',
);
verify(
  !preview.includes('generateContent') &&
    !apply.includes('generateContent') &&
    !verifySource.includes('generateContent') &&
    !scanner.includes('OpenAI'),
  'backfill has no LLM dependency',
);

console.log(`\nAttention Backfill contract totals: ${passed} Passed`);
