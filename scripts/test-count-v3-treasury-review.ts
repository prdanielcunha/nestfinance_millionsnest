import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildCountV3TreasuryReviewPacket,
} from '../shared/finance/countV3TreasuryReview.js';
import type { CountVerificationEvidence } from '../shared/finance/countVerificationPolicy.js';

const policy={ policyVersion:3, minimumIndependentConfirmations:2, maximumParticipants:20,
  allowAssisted:false, singleCounterRequiresTreasuryReview:true } as const;
const record=(uid:string):CountVerificationEvidence=>({
  verificationId:'verification_'+uid,
  mode:'independent',operatorUid:uid,independentCounterUid:uid,
  lines:[
    {purpose:'tithe',receiptMethod:'cash',amountCents:12000,classificationSource:'explicit'},
    {purpose:'offering',receiptMethod:'pix',amountCents:5000,classificationSource:'explicit'},
  ],controlTotalCents:17000,
});
const session={
  id:'cnt_0123456789abcdef01234567',serviceLabel:'Culto de domingo',
  serviceDate:'2026-10-16',status:'matched',version:3,recountCycle:0,
  policySnapshot:policy, confirmations:[record('first'),record('second')],
};
const preview=buildCountV3TreasuryReviewPacket(session);
assert.equal(preview.countedTotalCents,17000);
assert.equal(preview.summary.byPurpose.tithe,12000);
assert.equal(preview.summary.byPurpose.offering,5000);
assert.equal(preview.summary.byReceiptMethod.pix,5000);
assert.equal(preview.independentConfirmed,2);
assert.equal(preview.draftCreationAvailable,false);
assert.equal(preview.requiresExplicitTreasuryReview,false);
assert.equal(preview.requiresPurposeClassification,false);
assert.deepEqual(preview.allocations.map(x=>x.receiptMethod),['cash','pix']);
assert.throws(()=>buildCountV3TreasuryReviewPacket({...session,status:'pending'}),/COUNT_REVIEW_NOT_READY/);
assert.throws(()=>buildCountV3TreasuryReviewPacket({...session,status:'divergent'}),/COUNT_REVIEW_NOT_READY/);
assert.throws(()=>buildCountV3TreasuryReviewPacket({...session,status:'requires_treasury_review'}),/COUNT_REVIEW_STATUS_MISMATCH/);
assert.throws(()=>buildCountV3TreasuryReviewPacket({...session,version:0}),/COUNT_REVIEW_INVALID_SESSION/);
assert.throws(()=>buildCountV3TreasuryReviewPacket({...session,recountCycle:11}),/COUNT_REVIEW_INVALID_CYCLE/);
assert.throws(()=>buildCountV3TreasuryReviewPacket({...session,confirmations:[record('first'),
  {...record('second'),lines:[{purpose:'tithe',receiptMethod:'cash',amountCents:17000,classificationSource:'explicit'}],controlTotalCents:17000}]}),
  /COUNT_REVIEW_STATUS_MISMATCH/);

const legacyPix=(uid:string):CountVerificationEvidence=>({
  verificationId:'verification_'+uid,mode:'independent',operatorUid:uid,
  independentCounterUid:uid,entries:[
    {type:'tithe',method:'total',totalCents:3000},
    {type:'pix',method:'total',totalCents:4000},
  ],
});
const legacy=buildCountV3TreasuryReviewPacket({
  ...session,status:'requires_treasury_review',
  confirmations:[legacyPix('first'),legacyPix('second')],
});
assert.equal(legacy.countedTotalCents,7000);
assert.equal(legacy.summary.unclassifiedCents,4000);
assert.equal(legacy.summary.byReceiptMethod.pix,4000);
assert.equal(legacy.requiresPurposeClassification,true);
assert.equal(legacy.requiresExplicitTreasuryReview,true);
assert.equal(legacy.draftCreationAvailable,false);
assert.equal(legacy.allocations.find(x=>x.receiptMethod==='pix')?.purpose,'unclassified');

const lone=buildCountV3TreasuryReviewPacket({
  ...session,status:'requires_treasury_review',
  policySnapshot:{...policy,minimumIndependentConfirmations:1,maximumParticipants:1},
  confirmations:[record('first')],
});
assert.equal(lone.independentConfirmed,1);
assert.equal(lone.requiresExplicitTreasuryReview,true);
assert.equal(lone.requiresPurposeClassification,false);
assert.equal(lone.draftCreationAvailable,false);

const api=readFileSync('api/finance-gateway.ts','utf8');
const handler=readFileSync('server/vercel-handlers/finance/countVerificationsTreasuryPreview.ts','utf8');
const access=readFileSync('server/vercel-handlers/finance/accessHelpers.ts','utf8');
const page=readFileSync('src/pages/finance/count/CountVerificationV3Page.tsx','utf8');
const service=readFileSync('src/services/countV3Service.ts','utf8');
const routes=readFileSync('src/app/router/index.tsx','utf8');
assert.ok(api.includes("case 'count-verifications-treasury-preview':"));
assert.ok(handler.includes('assertCountV3Enabled()'), 'Review must be off by default');
assert.ok(handler.includes("resolveFinanceRequestContext(req, 'finance.review')"),
  'Count-only users must not read treasury packet');
assert.ok(handler.includes('assertV3Session(session, organizationId, financeEntityId)'), 'Tenant scope required');
assert.ok(handler.includes('buildCountV3TreasuryReviewPacket(session)'), 'Packet must derive from sealed source');
for(const forbidden of ['transaction.update(', 'transaction.create(', 'getAccountsRef()', 'getTransactionsRef()','financeJournalEntries']) {
  assert.ok(!handler.includes(forbidden), 'Review must never mutate finance: '+forbidden);
}
assert.ok(access.includes("hasEffectiveCapability(sessionList, 'finance.review')"),
  'Canonical finance reviewer can inspect Count details but cannot execute them');
assert.ok(routes.includes("'finance.review'] as const"), 'Reviewer must reach read-only Count screen');
assert.ok(page.includes('canReview = hasEffectiveCapability(accessState, \'finance.review\')'),
  'Count UI must show review only to canonical financial reviewers');
assert.ok(page.includes('treasuryPacket.snapshotVersion === session.version'),'Prevent stale packet visualization');
assert.ok(service.includes("'count-verifications-treasury-preview'"));
for(const label of [
  'Conferência para a tesouraria',
  'Count for treasury review',
  'Conteo para tesorería',
]) assert.ok(page.includes(label),'Must localize treasury read-only preview');
console.log('✅ Count v3 treasury preview: authenticated reviewer, no posting, source-backed allocations, unknown Pix and one-person review');
