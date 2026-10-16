import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const handler=readFileSync('server/vercel-handlers/finance/accountsOpeningHistory.ts','utf8');
const gateway=readFileSync('api/finance-gateway.ts','utf8');
const contracts=readFileSync('scripts/check-api-contracts.mjs','utf8');
const service=readFileSync('src/services/accountOpeningHistoryService.ts','utf8');
const edit=readFileSync('src/components/finance/AccountEditModal.tsx','utf8');
const workflow=readFileSync('.github/workflows/nestfinance-p06b-firestore-emulator.yml','utf8');
for(const [text,term] of [
  [handler,"resolveFinanceRequestContext(req, 'finance.review')"],
  [handler,"isValidAccountId(accountId)"],
  [handler,"context.repository.getAccountsRef().doc(accountId)"],
  [handler,'context.repository.assertEntityIsolation(account)'],
  [handler,".collection('openingBalanceHistory')"],
  [handler,".orderBy('revision', 'desc')"],
  [handler,".limit(26).get()"],
  [handler,'nextCursor'],
  [handler,"postingPerformed:false"],
  [handler,"'private, no-store, max-age=0'"],
  [gateway,"case 'accounts-opening-history': return accountsOpeningHistory(req, res);"],
  [contracts,"operation: 'accounts-opening-history', exposure: 'gateway'"],
  [service,'beforeRevision?: number'],
  [service,"'x-organization-id':args.organizationId"],
  [service,"FINANCE_GATEWAY_PATH"],
  [edit,'HISTORY_COPY[language]'],
  [edit,'fetchAccountOpeningHistory('],
  [edit,'historyHasMore'],
  [edit,'historyCursor'],
  [edit,'aria-expanded={historyOpen}'],
  [edit,"canViewOpeningHistory = hasEffectiveCapability(accessState,'finance.review')"],
  [workflow,'scripts/test-account-opening-history-emulator.ts'],
]) assert.ok(text.includes(term),'Missing history security/UX/pagination gate: '+term);
for(const forbidden of ['financeJournalEntries','financeAggregates','financeBalances','transaction.create(', 'transaction.set(', 'transaction.update(']){
  assert.ok(!handler.includes(forbidden),'Read-only history endpoint has write risk: '+forbidden);
}
for(const term of ['Ver histórico da abertura','View opening history','Ver historial de apertura'])
  assert.ok(edit.includes(term),'Missing localized opening history affordance');
assert.ok(handler.includes("actorRecorded:"),'Authorship presence, not internal identity, must be preserved');
assert.ok(!handler.includes('actorUid:data.actorUid'),'Never expose raw actor UID');
assert.ok(handler.includes('beforeRevision') && handler.includes('snapshot.docs.slice(0,25)'),
  'Historical revision listing must paginate without silent truncation');
console.log('✅ Opening history: secured server endpoint, page cursors, tenant isolation, PT/EN/ES and read-only');
