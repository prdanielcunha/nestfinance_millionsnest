import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCountV3TreasuryReviewPacket } from '../shared/finance/countV3TreasuryReview.js';
import type { CountVerificationEvidence } from '../shared/finance/countVerificationPolicy.js';

const handler=readFileSync('server/vercel-handlers/finance/countVerificationsAcceptTreasuryReview.ts','utf8');
const gateway=readFileSync('api/finance-gateway.ts','utf8');
const apiContracts=readFileSync('scripts/check-api-contracts.mjs','utf8');
const service=readFileSync('src/services/countV3Service.ts','utf8');
const page=readFileSync('src/pages/finance/count/CountVerificationV3Page.tsx','utf8');
const packet=readFileSync('shared/finance/countV3TreasuryReview.ts','utf8');
assert.ok(gateway.includes("case 'count-verifications-accept-treasury-review':"));
assert.ok(apiContracts.includes("operation: 'count-verifications-accept-treasury-review'"));
assert.ok(handler.includes('assertCountV3Enabled()'));
assert.ok(handler.includes("resolveFinanceRequestContext(req, 'finance.review')"));
assert.ok(handler.includes('Number(session.version) !== expectedVersion'), 'Optimistic CAS must be atomic');
assert.ok(handler.includes('buildCountV3TreasuryReviewPacket(session)'), 'Review derives from sealed evidence');
assert.ok(handler.includes('preview.requiresPurposeClassification'), 'Unknown Pix must block signoff');
assert.ok(handler.includes('preview.requiresExplicitTreasuryReview && normalizedNote.length < 10'),
  'Single-person signoff must include a human explanation');
assert.ok(handler.includes("session.treasuryReview?.status === 'accepted'"),
  'Cannot accept twice with a different idempotency key');
assert.ok(handler.includes('stageCanonicalAuditRecord') && handler.includes('stageFinanceFact'));
assert.ok(handler.includes('financeEntityId') && handler.includes('COUNT_VERSION_CONFLICT'));
for(const forbidden of ['getTransactionsRef()', 'getAccountsRef()', 'getJournal', 'getAllocationsRef()']) {
  assert.ok(!handler.includes(forbidden), 'Acceptance must never change a balance: '+forbidden);
}
assert.ok(packet.includes('treasuryAccepted: session.treasuryReview?.status === \'accepted\''));
assert.ok(service.includes("'count-verifications-accept-treasury-review'"));
assert.ok(page.includes('treasuryPacket.requiresPurposeClassification ? null'));
assert.ok(page.includes('treasuryPacket.requiresExplicitTreasuryReview && reviewNote.trim().length < 10'));
assert.ok(page.includes('countV3Service.acceptTreasuryReview('));
assert.ok(page.includes('setMessage(w.reviewAccepted)'), 'Affirm success only after backend accepts');
for(const label of ['Confirmar revisão da tesouraria','Confirm treasury review','Confirmar revisión de tesorería']){
  assert.ok(page.includes(label), 'Review approval must be PT/EN/ES');
}

const e=(uid:string):CountVerificationEvidence=>({
  verificationId:'verification_'+uid, mode:'independent',
  operatorUid:uid, independentCounterUid:uid,
  lines:[{purpose:'tithe',receiptMethod:'cash',amountCents:24000,classificationSource:'explicit'}],
});
const baseline={
  id:'cnt_0123456789abcdef01234567',serviceLabel:'Culto',serviceDate:'2026-10-16',
  version:4,status:'matched',
  policySnapshot:{minimumIndependentConfirmations:2,maximumParticipants:20},
  confirmations:[e('first'),e('second')],
};
assert.equal(buildCountV3TreasuryReviewPacket(baseline).treasuryAccepted,false);
const accepted=buildCountV3TreasuryReviewPacket({...baseline,version:5,treasuryReview:{
  status:'accepted', sourceVersion:4, reviewedByUid:'finance-manager',
}});
assert.equal(accepted.treasuryAccepted,true);
assert.equal(accepted.draftCreationAvailable,false,'Approving Count NEVER posts income by itself');
assert.equal(accepted.countedTotalCents,24000);

console.log('✅ Count v3 finance review is signed, tenant-restricted, no Pix guesses and never posts money');
