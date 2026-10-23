import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transactionRemovalBlocker } from '../shared/finance/transactionPermanentRemoval.js';

const base = { status: 'approved_for_posting', sourceContext: 'manual', reconciliationStatus: 'unreconciled', version: 2, evidenceIds: [] };
assert.equal(transactionRemovalBlocker(base), null);
assert.equal(transactionRemovalBlocker({ ...base, status: 'ready_for_review' }), null);
assert.equal(transactionRemovalBlocker({ ...base, status: 'draft' }), null);

for (const unsafe of [
  { status: 'posted' }, { status: 'reversed' }, { sourceContext: 'count' },
  { countSource: { countSessionId: 'count_demo' } }, { evidenceIds: ['evidence_demo'] },
  { reconciliationStatus: 'reconciled' }, { reconciliationStatus: undefined },
  { journalEntryId: 'je_demo' }, { postingId: 'posting_demo' }, { postedAt: '2026-06-01' }, { version: undefined },
]) assert.notEqual(transactionRemovalBlocker({ ...base, ...unsafe }), null, JSON.stringify(unsafe));

const handler = readFileSync('server/vercel-handlers/finance/transactionsRemoveBatch.ts', 'utf8');
assert.match(handler, /resolveFinanceRequestContext\(req, 'finance.manage'\)/);
assert.match(handler, /role !== 'owner' && role !== 'admin'/);
assert.match(handler, /items\.length > MAX_ITEMS/);
assert.match(handler, /FINANCE_VERSION_CONFLICT/);
assert.match(handler, /stageCanonicalAuditRecord/);
assert.match(handler, /transaction\.get\(ref\.collection\('approvals'\)/);
assert.doesNotMatch(handler, /financeJournalEntries|financeJournalLines|ledger-post/);

const reviewPage = readFileSync('src/pages/finance/transactions/TransactionReviewDetailPage.tsx', 'utf8');
const reviewCopy = readFileSync('src/pages/finance/transactions/transactionReviewDetailCopy.ts', 'utf8');
assert.match(reviewPage, /hasEffectiveCapability\(accessState, 'finance.manage'\)/);
assert.match(reviewPage, /transactionRemovalBlocker\(transaction\)/);
assert.match(reviewPage, /transactionsService\.removeBatch\(/);
assert.match(reviewPage, /removalReason\.trim\(\)\.length < 5/);
assert.equal((reviewCopy.match(/removeButton: '/g) || []).length, 3);
assert.match(handler, /removalReason/);
assert.match(handler, /metadata: \{[^\n]*removalReason/);
console.log('✅ Review deletion offers authorized administrators a reasoned, auditable removal path for eligible records.');
