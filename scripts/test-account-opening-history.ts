import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOpeningBalanceDeclaration } from '../shared/finance/openingBalanceDeclaration.js';
const create=readFileSync('server/vercel-handlers/finance/accountsCreate.ts','utf8');
const update=readFileSync('server/vercel-handlers/finance/accountsUpdate.ts','utf8');
const list=readFileSync('server/vercel-handlers/finance/accountsList.ts','utf8');
const edit=readFileSync('src/components/finance/AccountEditModal.tsx','utf8');
const svc=readFileSync('src/services/accountsService.ts','utf8');
for(const [source,terms] of [
  [create,['openingBalanceRevision: 1', "t.create(accountRef.collection('openingBalanceHistory').doc()", "reason: 'initial_account_creation'"]],
  [update,['requireScopedFinanceAccount({','hasEffectiveCapability(sessionList,', 'expectedOpeningBalanceRevision !== openingRevision',
    'OPENING_BALANCE_VERSION_CONFLICT','OPENING_BALANCE_LEGACY_RECONCILIATION_REQUIRED','OPENING_BALANCE_LOCKED',
    't.create(openingHistoryRef, {','accountUpdateData.openingBalanceDeclaration = correctedOpening',
    'accountUpdateData.openingBalanceRevision = openingRevision + 1', 'reason: correctionReason',
    'stageCanonicalAuditCreate(t, firestore, auditRef, auditData)']],
  [list,['openingBalanceRevision: Number.isSafeInteger(data.openingBalanceRevision)']],
  [edit,['payload.expectedOpeningBalanceRevision = account.openingBalanceRevision ?? 0',
    'payload.openingBalanceReason = openingReason.trim()', "openingSource==='other'",
    'No balance will change automatically'.replace('No balance will change automatically','The previous version is kept')]],
  [svc,['expectedOpeningBalanceRevision?: number','openingBalanceReason?: string','openingBalanceDeclaration?: OpeningBalanceInput']],
] as const)for(const term of terms)assert.ok(source.includes(term),'Missing opening revision or audit safeguard: '+term);
for(const forbidden of ['financeJournalEntries', 'financeAggregates', 'financeBalances', 'accountUpdateData.openingBalanceCents =', 'openingBalanceCents: correctedOpening'])
  assert.ok(!update.includes(forbidden),'Correction may not post or change balance: '+forbidden);
assert.ok(edit.includes('OPENING_EDIT_COPY[language]'), 'Corrections must be localized');
assert.ok(edit.includes('minLength={10}') && edit.includes('openingReason.trim().length < 10'));
assert.deepEqual(parseOpeningBalanceDeclaration({status:'not_informed'}),{status:'not_informed'});
assert.equal(parseOpeningBalanceDeclaration({status:'declared',amountCents:0,asOf:'2026-10-16',source:'cash_count'}).status,'pending_review');
console.log('✅ Opening history: first revision, append-only correction, scoped role, conflict, legacy protection, PT/EN/ES, no posting');
