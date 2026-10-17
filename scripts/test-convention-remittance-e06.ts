import assert from 'node:assert/strict';
import {
  previewConventionRemittance,type ConventionRule,type ConventionReceipt,
} from '../shared/finance/conventionRemittance.js';
const entity='fent_test';
const rule:ConventionRule={
  ruleId:'regra_convencao',revision:1,financeEntityId:entity,recipientId:'convention_pr',
  effectiveFrom:'2026-01-01',effectiveThrough:null,
  percentageBasisPoints:1000,eligiblePurposes:['tithe'],
  eligibleReceiptMethods:['cash','pix','card','bank_transfer','other'],
  dateBasis:'received_at',rounding:'half_up',
};
const source=(id:string,purpose:ConventionReceipt['purpose'],method:ConventionReceipt['receiptMethod'],amount:number,
  status:ConventionReceipt['status']='posted',date='2026-10-15'):ConventionReceipt=>({
  receiptId:id,financeEntityId:entity,receivedAt:date,status,transactionKind:'income',
  purpose,receiptMethod:method,
  classificationSource:purpose==='unclassified'?'legacy_unclassified':'explicit',
  amountCents:amount,
});
const receipts=[
  source('tx_tithe_cash','tithe','cash',35000),
  source('tx_offering_cash','offering','cash',12000),
  source('tx_tithe_pix','tithe','pix',20000),
  source('tx_draft','tithe','cash',90000,'draft'),
  source('tx_approved_only','tithe','pix',30000,'approved_for_posting'),
  source('tx_other_month','tithe','cash',99000,'posted','2026-09-01'),
];
const run=(items=receipts,rules=[rule],completeSourceCoverage=true)=>
  previewConventionRemittance({financeEntityId:entity,period:'2026-10',rules,receipts:items,completeSourceCoverage});
const output=run();
assert.equal(output.complete,true);
assert.equal(output.eligibleBaseCents,55000,'cash+Pix tithe, not offerings');
assert.equal(output.remittanceDueCents,5500,'10 percent of posted tithe only');
assert.equal(output.sourceCount,2);
assert.equal(output.excludedReceiptCount,4);
assert.deepEqual(output.segments[0].sourceReceiptIds,['tx_tithe_cash','tx_tithe_pix']);
assert.deepEqual(output.blockers,[]);
assert.equal(output.postingPerformed,false);

const unknown=run([...receipts,source('tx_unknown_pix','unclassified','pix',12345)]);
assert.equal(unknown.complete,false);
assert.ok(unknown.blockers.includes('CONVENTION_UNCLASSIFIED_POSTED_RECEIPT'));
assert.equal(unknown.remittanceDueCents,5500,'do not silently include or reclassify unknown Pix');

const incomplete=run(receipts,[rule],false);
assert.equal(incomplete.complete,false);
assert.ok(incomplete.blockers.includes('CONVENTION_SOURCE_COVERAGE_INCOMPLETE'));
assert.ok(run(receipts,[]).blockers.includes('CONVENTION_RULE_MISSING'));
assert.ok(run([], [{...rule,effectiveFrom:'2026-11-01'}]).blockers.includes('CONVENTION_RULE_PERIOD_GAP'), 'future policy cannot certify this month');
assert.ok(run([],[{...rule,effectiveThrough:'2026-10-14'}]).blockers.includes('CONVENTION_RULE_PERIOD_GAP'), 'partial-month policy gap must be visible');

const r1={...rule,effectiveThrough:'2026-10-14'};
const r2={...rule,revision:2,effectiveFrom:'2026-10-15',percentageBasisPoints:1250};
const split=run([
  source('tx_old','tithe','cash',8000,'posted','2026-10-12'),
  source('tx_new','tithe','pix',16000,'posted','2026-10-15'),
], [r1,r2]);
assert.equal(split.complete,true);
assert.equal(split.eligibleBaseCents,24000);
assert.equal(split.remittanceDueCents,2800,'800 old at 10%, 2000 new at 12.5%');
assert.deepEqual(split.segments.map(x=>x.remittanceDueCents),[800,2000]);
const overlap=run([source('tx_overlap','tithe','cash',10000)], [rule,{...rule,revision:2,effectiveFrom:'2026-10-10'}]);
assert.equal(overlap.complete,false);
assert.ok(overlap.blockers.includes('CONVENTION_OVERLAPPING_RULES'));
const penny=run([source('tx_cent','tithe','cash',1)], [{...rule,percentageBasisPoints:5000}]);
assert.equal(penny.remittanceDueCents,1,'half-cent rounding must be deterministic via bigint');
const around=run([source('tx_split_a','tithe','cash',1),source('tx_split_b','tithe','pix',1)], [{...rule,percentageBasisPoints:2500}]);
assert.equal(around.remittanceDueCents,1,'round base per policy version, not each receipt');

const fail=(f:()=>unknown,label:string)=>assert.throws(f,undefined,label);
fail(()=>run([...receipts,receipts[0]]),'duplicate transaction ids');
fail(()=>run([{...source('tx_foreign','tithe','pix',1000),financeEntityId:'other'}]),'cross church source');
fail(()=>run([source('tx_na','tithe','cash',NaN)]),'invalid amount');
fail(()=>run([source('tx_float','tithe','cash',25.1)]),'non-integer cents');
fail(()=>run([source('tx_minus','tithe','cash',-100)]),'negative amount');
fail(()=>run([{...source('tx_source','tithe','pix',1000),classificationSource:'legacy_unclassified'}]),
  'cannot trust legacy classification to label tithe');
fail(()=>run([], [{...rule,eligiblePurposes:['unclassified' as any]}]),'unclassified not a rule base');
fail(()=>run([],[{...rule,percentageBasisPoints:10001}]),'invalid percentage');
fail(()=>run([],[{...rule,effectiveFrom:'2026-02-30'}]),'invalid effective date');
fail(()=>run([],[{...rule,effectiveThrough:'2025-12-31'}]),'inverted policy period');
fail(()=>run([],[rule,rule]),'duplicate rule revision');
fail(()=>previewConventionRemittance({financeEntityId:entity,period:'2026-13',rules:[rule],receipts:[],completeSourceCoverage:true}), 'invalid month');
fail(()=>run([source('tx_over','tithe','cash',20_000_000_001)]),'excessive amount');
fail(()=>run([
  source('tx_big1','tithe','cash',20_000_000_000),
  source('tx_big2','tithe','pix',1),
]),'unsafe total');
console.log('✅ E06 repasse calculation: tithe-only Pix/cash, status, effective versions, rounding, overlap, unknown purpose, source coverage, no posting');
