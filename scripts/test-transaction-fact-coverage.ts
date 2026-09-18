import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { NESTFINANCE_FACT_EVENT_TYPES } from '../shared/intelligence/canonicalFact.js';

const root = process.cwd();
const read = (path: string) => readFile(join(root, path), 'utf8');

const files = {
  createDraft: 'server/vercel-handlers/finance/transactionsCreateDraft.ts',
  createAndSubmit: 'server/vercel-handlers/finance/transactionsCreateAndSubmit.ts',
  submit: 'server/vercel-handlers/finance/transactionsSubmitForReview.ts',
  returned: 'server/vercel-handlers/finance/transactionsReturnToDraft.ts',
  approved: 'server/vercel-handlers/finance/transactionsApproveForPosting.ts',
  invalidated: 'server/vercel-handlers/finance/transactionsInvalidateApproval.ts',
};

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await read(path)]),
  ),
) as Record<keyof typeof files, string>;

let passed = 0;
const verify = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  passed++;
  console.log(`✅ ${message}`);
};

for (const eventType of [
  'TRANSACTION_CREATED',
  'TRANSACTION_SUBMITTED',
  'TRANSACTION_APPROVED',
  'TRANSACTION_RETURNED',
  'TRANSACTION_POSTED',
] as const) {
  verify(
    NESTFINANCE_FACT_EVENT_TYPES.includes(eventType),
    `${eventType} is part of the canonical taxonomy`,
  );
}

verify(
  sources.createDraft.includes("eventType: 'TRANSACTION_CREATED'"),
  'draft creation emits TRANSACTION_CREATED',
);
verify(
  sources.createAndSubmit.includes("eventType: 'TRANSACTION_CREATED'") &&
    sources.createAndSubmit.includes("eventType: 'TRANSACTION_SUBMITTED'"),
  'create-and-submit emits CREATED and SUBMITTED atomically',
);
verify(
  sources.submit.includes("eventType: 'TRANSACTION_SUBMITTED'"),
  'submit/resubmit emits TRANSACTION_SUBMITTED',
);
verify(
  sources.returned.includes("eventType: 'TRANSACTION_RETURNED'") &&
    sources.returned.includes("returnKind: 'review_return'"),
  'review return emits structured TRANSACTION_RETURNED',
);
verify(
  sources.approved.includes("eventType: 'TRANSACTION_APPROVED'") &&
    sources.approved.includes('postingExecuted: false'),
  'approval emits TRANSACTION_APPROVED and explicitly states posting was not executed',
);
verify(
  sources.invalidated.includes("eventType: 'TRANSACTION_RETURNED'") &&
    sources.invalidated.includes("returnKind: 'approval_invalidated'"),
  'approval invalidation is modeled as a structured return',
);

for (const [key, source] of Object.entries(sources)) {
  verify(source.includes('stageFinanceFact('), `${key} stages a canonical fact`);
  const hasInlineRefs =
    source.includes("{ kind: 'record', ref: txRef.path") &&
    source.includes("{ kind: 'audit', ref: auditRef.path");
  const hasSharedRefs =
    (source.includes('const factSourceRefs = [') || source.includes('const sourceRefs = [')) &&
    source.includes("kind: 'record' as const") &&
    source.includes("kind: 'audit' as const");
  verify(
    hasInlineRefs || hasSharedRefs,
    `${key} fact is source-backed by record and audit refs`,
  );
}

const transactionHandlers = (await readdir(join(root, 'server/vercel-handlers/finance')))
  .filter((name) => /^transactions.*\.ts$/.test(name));
for (const name of transactionHandlers) {
  const source = await read(`server/vercel-handlers/finance/${name}`);
  verify(
    !source.includes("eventType: 'TRANSACTION_POSTED'"),
    `${name} does not claim posting before a real posting mutation exists`,
  );
}

const returnFactStart = sources.returned.indexOf('stageFinanceFact(');
const returnFactEnd = sources.returned.indexOf('\n      });', returnFactStart);
const returnFactBlock = sources.returned.slice(returnFactStart, returnFactEnd);
verify(
  !returnFactBlock.includes('comment'),
  'free-form return comments are not copied into canonical fact payloads',
);

const invalidateFactStart = sources.invalidated.indexOf('stageFinanceFact(');
const invalidateFactEnd = sources.invalidated.indexOf('\n      });', invalidateFactStart);
const invalidateFactBlock = sources.invalidated.slice(invalidateFactStart, invalidateFactEnd);
verify(
  !invalidateFactBlock.includes('comment') && !invalidateFactBlock.includes('sourceHash'),
  'approval invalidation fact excludes free-form comments and approval hashes',
);

console.log(`\nTransaction Fact Coverage totals: ${passed} Passed`);
