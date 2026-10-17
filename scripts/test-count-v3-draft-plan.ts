import assert from 'node:assert/strict';
import {
  buildCountV3DraftPlan,
  type CountV3DraftSelection,
} from '../shared/finance/countV3DraftPlan.js';

const p={minimumIndependentConfirmations:2,maximumParticipants:20,allowAssisted:false};
const source=(uid:string)=>({
  verificationId:'verification_'+uid,operatorUid:uid,independentCounterUid:uid,
  mode:'independent' as const,
  lines:[
    {purpose:'tithe' as const,receiptMethod:'cash' as const,amountCents:10000,classificationSource:'explicit' as const},
    {purpose:'offering' as const,receiptMethod:'pix' as const,amountCents:5000,classificationSource:'explicit' as const},
  ],controlTotalCents:15000,
});
const session={
  id:'cnt_0123456789abcdef01234567',serviceLabel:'Culto',
  serviceDate:'2026-10-16',status:'matched',version:4,
  policySnapshot:p,confirmations:[source('first'),source('second')],
  treasuryReview:{status:'accepted',sourceVersion:3,reviewedByUid:'reviewer'},
};
const selections:CountV3DraftSelection[]=[
  {purpose:'offering',receiptMethod:'pix',accountId:'bank_1',categoryId:'offerings',receivedDate:'2026-10-15'},
  {purpose:'tithe',receiptMethod:'cash',accountId:'cash_1',categoryId:'tithes'},
];
const plan=buildCountV3DraftPlan(session,selections);
assert.equal(plan.countSessionId,session.id);
assert.equal(plan.sourceReviewTotalCents,15000);
assert.equal(plan.sourceSessionVersion,4);
assert.equal(plan.lines.length,2);
assert.deepEqual(plan.lines.map(line=>line.lineKey),['offering|pix','tithe|cash']);
assert.equal(plan.lines.find(line=>line.purpose==='tithe')?.accountId,'cash_1');
assert.equal(plan.lines.find(line=>line.purpose==='offering')?.receiptMethod,'pix');
assert.equal(plan.postingPerformed,false);
assert.equal(plan.treasuryReviewAccepted,true);
assert.throws(()=>buildCountV3DraftPlan({...session,version:7},selections),
  /COUNT_PROPOSAL_SOURCE_VERSION_STALE/,
  'Acceptance must refer to the exact sealed evidence revision');
assert.throws(()=>buildCountV3DraftPlan({...session,treasuryReview:null},selections),
  /COUNT_PROPOSAL_TREASURY_REVIEW_REQUIRED/);
assert.throws(()=>buildCountV3DraftPlan(session,selections.slice(0,1)),
  /COUNT_PROPOSAL_MISSING_REQUIRED_FIELD/);
assert.throws(()=>buildCountV3DraftPlan(session,[selections[0],selections[0]]),
  /COUNT_PROPOSAL_DUPLICATE_OR_UNKNOWN_SELECTION/);
assert.throws(()=>buildCountV3DraftPlan(session,[...selections,{purpose:'other',receiptMethod:'card',accountId:'a',categoryId:'c'}]),
  /COUNT_PROPOSAL_MISSING_REQUIRED_FIELD/);
assert.throws(()=>buildCountV3DraftPlan(session,[{...selections[0],accountId:'../../../unsafe'},selections[1]]),
  /COUNT_PROPOSAL_INVALID_ACCOUNT_ID/);
assert.throws(()=>buildCountV3DraftPlan(session,[{...selections[0],purpose:'tithe'},selections[1]]),
  /COUNT_PROPOSAL_DUPLICATE_OR_UNKNOWN_SELECTION/);
assert.throws(()=>buildCountV3DraftPlan({...session,status:'divergent'},selections),
  /COUNT_REVIEW_NOT_READY/);

const pixLegacy=(uid:string)=>({
  verificationId:'verification_'+uid,mode:'independent' as const,
  operatorUid:uid,independentCounterUid:uid,
  entries:[{type:'pix' as const,method:'total' as const,totalCents:1200}],
});
const unclassified={
  ...session,status:'requires_treasury_review',
  confirmations:[pixLegacy('first'),pixLegacy('second')],
};
assert.throws(()=>buildCountV3DraftPlan(unclassified,[{
  purpose:'offering',receiptMethod:'pix',accountId:'bank',categoryId:'offerings',
}]),/COUNT_PROPOSAL_PURPOSE_CLASSIFICATION_REQUIRED/,
  'Unknown-purpose Pix must NEVER be turned into offerings by a selected ledger category');

const one={
  ...session,status:'requires_treasury_review',
  policySnapshot:{minimumIndependentConfirmations:1,maximumParticipants:1},
  confirmations:[source('first')],
};
assert.equal(buildCountV3DraftPlan(one,selections).sourceReviewTotalCents,15000,
  'Single-person quorum can plan drafts only AFTER explicit treasury acceptance');

const zero={
  ...session,confirmations:[
    {...source('first'),lines:[{purpose:'tithe' as const,receiptMethod:'cash' as const,amountCents:0,classificationSource:'explicit' as const}],controlTotalCents:0},
    {...source('second'),lines:[{purpose:'tithe' as const,receiptMethod:'cash' as const,amountCents:0,classificationSource:'explicit' as const}],controlTotalCents:0},
  ],
};
assert.throws(()=>buildCountV3DraftPlan(zero,[selections[1]]),/COUNT_PROPOSAL_ZERO_TOTAL/,
  'A zero Count is valid evidence but must not create a zero-amount accounting entry');


const cardRecord=(uid:string)=>({
  verificationId:'verification_'+uid,operatorUid:uid,independentCounterUid:uid,
  mode:'independent' as const,
  lines:[{purpose:'offering' as const,receiptMethod:'card' as const,
    amountCents:6500,classificationSource:'explicit' as const}],
});
const cardSession={...session,confirmations:[cardRecord('first'),cardRecord('second')]};
assert.throws(()=>buildCountV3DraftPlan(cardSession,[{
  purpose:'offering',receiptMethod:'card',accountId:'card_receivable',categoryId:'offerings',
}]),/COUNT_PROPOSAL_CARD_DETAIL_REQUIRED/);
const cardPlan=buildCountV3DraftPlan(cardSession,[{
  purpose:'offering',receiptMethod:'card',accountId:'card_receivable',categoryId:'offerings',
  cardSettlementMethod:'debit_card',receivedDate:'2026-10-17',
}]);
assert.equal(cardPlan.lines[0].receiptMethod,'card','Source still says card');
assert.equal(cardPlan.lines[0].ledgerPaymentMethod,'debit_card','Ledger needs precise debit instrument');
assert.throws(()=>buildCountV3DraftPlan(session,[{
  ...selections[0],cardSettlementMethod:'credit_card',
},selections[1]]),/COUNT_PROPOSAL_CARD_DETAIL_INCONSISTENT/);

console.log('✅ Count v3 source-backed draft mapping blocks duplicate, guessed Pix, missing ledger targets and posting');
assert.equal(plan.lines.find(line=>line.receiptMethod==='pix')?.receivedDate,'2026-10-15');
assert.equal(plan.lines.find(line=>line.receiptMethod==='cash')?.receivedDate,session.serviceDate);
assert.throws(()=>buildCountV3DraftPlan(session,[{...selections[0],receivedDate:undefined},selections[1]]),/COUNT_PROPOSAL_RECEIVED_DATE_REQUIRED/);
assert.throws(()=>buildCountV3DraftPlan(session,[{...selections[0],receivedDate:'2026-02-30'},selections[1]]),/COUNT_PROPOSAL_RECEIVED_DATE_REQUIRED/);
