import assert from 'node:assert/strict';
import { preparePostingExecution } from '../shared/finance/ledger/postingExecution.js';
import { postingExecutionFixture as fixture } from './fixtures/postingExecutionFixture.js';

for(const kind of ['income','expense','transfer','liability_settlement'] as const){
  const input=fixture(kind),result=preparePostingExecution(input);
  assert.equal(result.journal.lines.length,2);assert.equal(result.effectiveDay,'2026-10-10');
  assert.equal(result.period,'2026-10');
  assert.equal(result.journal.lines.reduce((n,l)=>n+l.debitCents,0),12345);
  assert.equal(result.journal.lines.reduce((n,l)=>n+l.creditCents,0),12345);
  const expected=kind==='income'?[{accountId:'cash',deltaCents:12345}]:kind==='expense'?[{accountId:'cash',deltaCents:-12345}]:
    kind==='transfer'?[{accountId:'bank',deltaCents:12345},{accountId:'cash',deltaCents:-12345}]:
    [{accountId:'bank',deltaCents:-12345},{accountId:'liability',deltaCents:-12345}];
  assert.deepEqual(result.accountDeltas,expected);
  assert.equal(input.transaction.status,'approved_for_posting','pure planning cannot post a record');
}
const failures:[string,(input:ReturnType<typeof fixture>)=>void][]=[
  ['stale version',i=>{i.expectedVersion=3;}],
  ['fractional version',i=>{i.expectedVersion=4.5;i.transaction.version=4.5;}],
  ['draft',i=>{i.transaction.status='draft';}],
  ['closed period',i=>{i.periodOpen=false;}],
  ['unsupported currency',i=>{i.transaction.currency='USD';}],
  ['future receipt',i=>{i.transaction.occurredAt='2026-10-20';}],
  ['duplicate posting',i=>{i.transaction.journalEntryId='je_22222222222222222222';}],
  ['changed amount',i=>{i.transaction.amountCents=1;}],
  ['changed evidence',i=>{i.transaction.evidenceJustification='Changed';}],
  ['stale material',i=>{i.transaction.contentVersion=2;}],
  ['invalid material version',i=>{i.transaction.contentVersion=-1;}],
  ['invalid approval algorithm',i=>{i.approval.approvalAlgorithmVersion=1;}],
  ['invalidated approval',i=>{i.approval.status='invalidated';}],
  ['changed approver',i=>{i.approval.approvedBy='another';}],
  ['stale plan',i=>{i.approval.approvedPlanHash='sha256:wrong';}],
  ['catalog version changed',i=>{i.catalog.accounts[0].version=2;}],
  ['cross entity catalog',i=>{i.catalog.accounts[0].financeEntityId='other';}],
  ['cross org allocation',i=>{i.allocations[0].organizationId='other';}],
  ['cross transaction allocation',i=>{i.allocations[0].transactionId='tx_other';}],
  ['unpersisted default mapping',i=>{i.catalog.accounts[0].ledgerMapping='la_default_asset_cash';}],
  ['disabled ledger',i=>{i.catalog.ledgerAccounts[0].postingAllowed=false;}],
  ['archived account',i=>{i.catalog.accounts[0].active=false;}],
  ['malformed catalog version',i=>{i.catalog.accounts[0].version=0;}],
  ['wrong ledger type',i=>{i.catalog.ledgerAccounts[0].type='income';}],
  ['cross entity ledger',i=>{i.catalog.ledgerAccounts[0].financeEntityId='other';}],
  ['unresolved fund',i=>{i.allocations[0].fundId='unconfigured';}],
  ['unconfigured cost center',i=>{i.allocations[0].costCenterId='unconfigured';}],
  ['duplicate allocation',i=>{i.allocations.push({...i.allocations[0]});}],
  ['fractional amount',i=>{i.transaction.amountCents=123.45;}],
  ['overflow',i=>{i.transaction.amountCents=Number.MAX_SAFE_INTEGER+1;}],
  ['duplicate journal line identity',i=>{i.journalLineIds[1]=i.journalLineIds[0];}],
];
for(const [name,mutate]of failures){const input=fixture();mutate(input);assert.throws(()=>preparePostingExecution(input),undefined,name);}
const permuted=fixture();permuted.catalog.accounts.reverse();permuted.catalog.ledgerAccounts.reverse();
assert.equal(preparePostingExecution(permuted).plan.planHash,preparePostingExecution(fixture()).plan.planHash);
const wrongIncome=fixture();wrongIncome.transaction.accountId='liability';assert.throws(()=>preparePostingExecution(wrongIncome));
const sameAccount=fixture('transfer');sameAccount.transaction.destinationAccountId='cash';assert.throws(()=>preparePostingExecution(sameAccount));
console.log('Posting execution: 4 balanced flows, 33 rejection/integrity cases and deterministic reference order passed');
