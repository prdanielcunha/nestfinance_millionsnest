import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOpeningBalanceDeclaration } from '../shared/finance/openingBalanceDeclaration.js';

const valid = {status:'declared', amountCents:123456, asOf:'2026-10-15', source:'bank_statement'};
assert.deepEqual(parseOpeningBalanceDeclaration(undefined), {status:'not_informed'});
assert.deepEqual(parseOpeningBalanceDeclaration(null), {status:'not_informed'});
assert.deepEqual(parseOpeningBalanceDeclaration({status:'not_informed'}), {status:'not_informed'});
assert.deepEqual(parseOpeningBalanceDeclaration(valid), {...valid,status:'pending_review',sourceNote:''});
const zero = parseOpeningBalanceDeclaration({...valid,amountCents:0});
assert.ok('amountCents' in zero);
assert.equal(zero.amountCents, 0);
const negative = parseOpeningBalanceDeclaration({...valid,amountCents:-120});
assert.ok('amountCents' in negative);
assert.equal(negative.amountCents, -120);
assert.equal(parseOpeningBalanceDeclaration({...valid,asOf:'2024-02-29'}).status, 'pending_review');
const other = parseOpeningBalanceDeclaration({...valid,source:'other',sourceNote:'signed handover'});
assert.ok('sourceNote' in other);
assert.equal(other.sourceNote, 'signed handover');
for(const invalid of [
  {status:'declared'},
  {status:'not_informed',amountCents:0},
  {...valid,status:'posted'},
  {...valid,amountCents:1.5},
  {...valid,amountCents:NaN},
  {...valid,amountCents:Infinity},
  {...valid,amountCents:9999999999999},
  {...valid,amountCents:'1234'},
  {...valid,asOf:'2026-02-29'},
  {...valid,asOf:'2026-13-01'},
  {...valid,asOf:'2026-10-32'},
  {...valid,asOf:'16/10/2026'},
  {...valid,asOf:'1899-12-31'},
  {...valid,source:'unknown'},
  {...valid,source:'other'},
  {...valid,sourceNote:'x'.repeat(241)},
  {...valid,sourceNote:'line' + String.fromCharCode(0) + 'break'},
  {...valid,extra:'unsafe'},
  [],
  '0',
]) assert.throws(()=>parseOpeningBalanceDeclaration(invalid),undefined,'Failed to reject '+JSON.stringify(invalid));

const server=readFileSync('server/vercel-handlers/finance/accountsCreate.ts','utf8');
const list=readFileSync('server/vercel-handlers/finance/accountsList.ts','utf8');
const form=readFileSync('src/components/finance/AccountFormModal.tsx','utf8');
const screen=readFileSync('src/pages/finance/settings/FinanceAccountsPage.tsx','utf8');
for (const term of [
  'parseOpeningBalanceDeclaration(openingBalanceDeclaration)',
  'openingBalanceDeclaration: openingDeclaration',
  'openingBalanceDeclarationStatus: openingDeclaration.status',
  'hasEffectiveCapability(sessionList',
  'hasFinanceEntityScope(sessionList, financeEntityId)',
  'stageCanonicalAuditCreate(',
]) assert.ok(server.includes(term),'Missing provenance/security guard: '+term);
for (const forbidden of ['financeJournalEntries','financeAggregates','financeBalances','openingBalanceCents: openingDeclaration']) {
  assert.ok(!server.includes(forbidden),'Creation must not perform opening posting: '+forbidden);
}
assert.ok(list.includes('openingBalanceDeclaration: data.openingBalanceDeclaration ?? null'));
assert.ok(form.includes("openingMode === 'declared'")&&form.includes("openingBalanceDeclaration = { status: 'not_informed' }"));
assert.ok(form.includes('source: openingSource')&&form.includes('asOf: openingDate'));
assert.ok(form.includes('No balance will change automatically'));
assert.ok(screen.includes('Saldo inicial pendente de conferência'));
assert.ok(screen.includes("typeof account.openingBalanceCents === 'number'"),'Legacy value must be flagged as unverified');
for(const word of ['OPENING_COPY[language]','OPENING_STATUS_COPY[language]']) assert.ok(form.includes(word)||screen.includes(word));
console.log('✅ Opening balance declarations: exact cents, source/date, fail closed, legacy unknown, PT/EN/ES, no posting');
