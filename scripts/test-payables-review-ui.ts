import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const gateway=readFileSync('api/finance-gateway.ts','utf8');
const server=readFileSync('server/vercel-handlers/finance/payablesReview.ts','utf8');
const list=readFileSync('server/vercel-handlers/finance/payablesList.ts','utf8');
const ui=readFileSync('src/pages/finance/PayablesPage.tsx','utf8');
const service=readFileSync('src/services/payablesService.ts','utf8');
const ci=readFileSync('.github/workflows/nestfinance-p06b-firestore-emulator.yml','utf8');
for (const [source,term] of [
  [gateway,"case 'payables-review': return payablesReview(req, res)"],
  [server,"NESTFINANCE_PAYABLES_REVIEW_ENABLED!=='true'"],
  [server,"resolveFinanceRequestContext(req,'finance.review')"],
  [server,"payable.status!=='awaiting_review'"],
  [server,"payable.version!==expectedVersion"],
  [server,"payable.remainingCents!==payable.amountCents"],
  [server,"executeWithIdempotency("],
  [server,"stageCanonicalAuditCreate("],
  [server,"finance.payable.reviewed_unpaid"],
  [server,"postingPerformed:false"],
  [list,"reviewEnabled:process.env.NESTFINANCE_PAYABLES_REVIEW_ENABLED==='true'"],
  [service,"'payables-review'"],
  [ui,"canReview=hasEffectiveCapability(accessState,'finance.review')"],
  [ui,"reviewEnabled===true"],
  [ui,"item.status==='awaiting_review'"],
  [ui,"copy.reviewExplanation"],
  [ui,"payablesService.review("],
  [ci,'test-payables-review-emulator.ts'],
]) assert.ok(source.includes(term),'Required review safeguard missing: '+term);
for(const word of ['Você conferiu esta conta?','Have you checked this bill?','¿Ha verificado esta factura?']){
  assert.ok(ui.includes(word),'Missing PT/EN/ES review confirmation: '+word);
}
for(const collection of ['financeTransactions','financeJournalEntries','financeAggregates',
  'financeJournalLines','financeAccountEffects']){
  assert.ok(!server.includes(collection),'Human review may not post or change balances: '+collection);
}
assert.ok(ui.includes('reviewTarget!==item.id'), 'Review must require explicit confirmation');
assert.ok(ui.includes('result.paidCents!==0'), 'UI must reject a claimed payment');
console.log('✅ T19 review: gated human confirmation, RBAC, version and idempotency, PT/EN/ES, no posting');
