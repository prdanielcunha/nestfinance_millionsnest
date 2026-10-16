import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const handler=readFileSync('server/vercel-handlers/finance/countVerificationsCreateProposedDrafts.ts','utf8');
const preview=readFileSync('server/vercel-handlers/finance/countVerificationsProposalPreview.ts','utf8');
const gateway=readFileSync('api/finance-gateway.ts','utf8');
const contracts=readFileSync('scripts/check-api-contracts.mjs','utf8');
const client=readFileSync('src/services/countV3Service.ts','utf8');
const page=readFileSync('src/pages/finance/count/CountVerificationDraftsPage.tsx','utf8');
const source=readFileSync('src/pages/finance/count/CountVerificationV3Page.tsx','utf8');
const routes=readFileSync('src/app/router/index.tsx','utf8');

for(const op of ['create-proposed-drafts','proposal-preview']){
  assert.ok(gateway.includes(`case 'count-verifications-${op}':`), 'Missing gateway '+op);
  assert.ok(contracts.includes(`operation: 'count-verifications-${op}'`), 'Uncertified API '+op);
  assert.ok(client.includes(`'count-verifications-${op}'`), 'Missing typed frontend call '+op);
}
for(const part of [handler,preview]){
  assert.ok(part.includes('assertCountV3Enabled()'), 'Count v3 must fail closed by default');
  assert.ok(part.includes("resolveFinanceRequestContext(req, 'finance.review')"),
    'Count-only workers cannot access ledger targets or create financial drafts');
  assert.ok(part.includes(".collection('countVerificationSessions').doc(countSessionId)"),
    'v3 path is separate from historical countSessions');
  assert.ok(part.includes("'private, no-store'"), 'financial drafts are never shared-cacheable');
}
assert.ok(preview.includes("session.treasuryReview?.status !== 'accepted'"),
  'No ledger account choices without accepted source review');
assert.ok(preview.includes('getAccountsQuery()') && preview.includes('getCategoriesQuery()') && preview.includes('getFundsQuery()'),
  'Ledger targets must come from live tenant/entity-scoped account catalog');
assert.ok(!preview.includes('transaction.set(') && !preview.includes('transaction.create('),
  'Preview may not write any financial or count records');
assert.ok(preview.includes('COUNT_PROPOSAL_SOURCE_VERSION_STALE'));
assert.ok(handler.includes('buildCountV3DraftPlan(session, rawSelections)'),
  'Drafts must use reviewed source and exact explicit purpose-method mapping');
assert.ok(handler.includes('Number(session.version) !== expectedVersion'));
assert.ok(handler.includes('Number(session.countProposal?.sourceVersion) !== expectedVersion'));
assert.ok(handler.includes('const selectionHash = hashPayload(rawSelections)'),
  'A Count-to-ledger selection intent must be fingerprinted independently of request key');
assert.ok(handler.includes('session.countProposal?.selectionHash !== selectionHash'),
  'A new idempotency key must not falsely report saving different financial mapping');
assert.ok(handler.includes('selectionHash,\n            createdByUid: uid'),
  'Persist exact accepted mapping fingerprint atomically with generated transaction IDs');
assert.ok(handler.includes("return res.status(409).json({ error: message });"),
  'Conflicting financial mapping must have a recoverable conflict response');
for (const term of [
  'getAccountsRef().doc(', 'getCategoriesRef().doc(', 'getFundsRef().doc(',
  'FINANCE_ACCOUNT_MISMATCH', 'FINANCE_CATEGORY_MISMATCH', 'FINANCE_FUND_MISMATCH',
  'validateAccountMetadata(', 'validateCategoryMetadata(', 'validateFundMetadata(',
  'getCompatibility(', 'validateAllocation(', 'validateTransactionCore(',
  'executeWithIdempotency(', 'stageCanonicalAuditRecord(', 'stageFinanceFact(',
  'stageTransactionSearchIndex(', 'sanitizeFirestoreObject(', "status: 'ready_for_review'",
]) {
  assert.ok(handler.includes(term),'Missing atomic review-draft safeguard: '+term);
}
for(const forbidden of ["status: 'posted'",'financeJournalEntries','financeBalances',
  'buildCountProposalLines(', 'resolveCanonicalCountEntries(']){
  assert.ok(!handler.includes(forbidden),'Must never auto-post or use v1 count: '+forbidden);
}

assert.ok(handler.includes("getCompatibility(accountMeta.type, line.ledgerPaymentMethod, 'income')"),
  'Finance account compatibility must use precise credit/debit card method');
assert.ok(handler.includes('paymentMethod: line.ledgerPaymentMethod,'),
  'Posted-method candidate must not reuse ambiguous card label');
assert.ok(page.includes("line.receiptMethod==='card'") && page.includes('cardSettlementMethod'),
  'Card entry requires explicit debit or credit choice');
assert.ok(handler.includes("compatibility.level === 'guided_flow'"),
  'Cash-to-bank deposit and withdrawals need their own verified flow');
assert.ok(handler.includes("error?.status === 404 && error?.error === 'COUNT_V3_NOT_ENABLED'"),
  'Feature-disabled draft endpoint must return 404 instead of a server error');
assert.ok(handler.includes('countReceiptMethod: line.receiptMethod'), 'Drafts retain receipt method');
assert.ok(handler.includes('countEntryType: line.purpose'), 'Drafts retain classified purpose');
assert.ok(handler.includes('countSchemaVersion: 3'), 'Source must be traceable to new Count schema');
assert.ok(handler.includes('countProposal: {') && handler.includes('transaction.update(sessionRef'),
  'Created drafts must atomically mark source Count with transaction IDs');
assert.ok(routes.includes('APP_ROUTES.countVerificationV3Drafts') && routes.includes("['finance.review']"),
  'Protected route may only be reached by treasury reviewer');
assert.ok(page.includes('countV3Service.proposalPreview(') && page.includes('countV3Service.createProposedDrafts('));
assert.ok(page.includes('compatibleAccounts.map(') && page.includes('preview.categoryOptions.map('),
  'Only eligible accounts should be presented, never all accounts');
assert.ok(page.includes("getCompatibility(option.type,receiptInstrument,'income')"),
  'UI must reflect the same account-instrument compatibility as canonical backend');
assert.ok(page.includes("field==='cardSettlementMethod'?{accountId:''}"),
  'Changing debit/credit must clear stale account selection');
assert.ok(page.includes('COUNT_PROPOSAL_ALREADY_CREATED_WITH_DIFFERENT_SELECTIONS'),
  'Different financial selections must show an explicit conflict, not a misleading source-version error');
for(const label of ['Não há conta compatível','No compatible account','No hay una cuenta compatible']){
  assert.ok(page.includes(label),'PT/EN/ES must explain missing configured account');
}
assert.ok(page.includes('preview.fundOptions.map(') && page.includes('!choice?.accountId || !choice?.categoryId'));
assert.ok(page.includes('fingerprint') && page.includes('idcountv3draft_'),
  'Mobile retry should reuse its idempotency key');
assert.ok(source.includes('treasuryPacket.treasuryAccepted') && source.includes('APP_ROUTES.countVerificationV3Drafts'));
for(const str of [
  'Preparar lançamentos da contagem', 'Prepare count financial entries', 'Preparar movimientos del conteo',
]) assert.ok(page.includes(str),'PT/EN/ES feature parity required');

console.log('✅ Count v3 reviewed financial drafts: exact source, no posting, permission, scope, idempotency, catalogs and PT/EN/ES');
