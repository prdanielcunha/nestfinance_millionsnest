import assert from 'node:assert/strict';
import {
  validateCountV3ReceiptLines,
  compareCountV3ReceiptLines,
  inspectLegacyCountV3Classification,
} from '../shared/finance/countV3PurposeReceipt.js';

const first = [
  { purpose: 'tithe', receiptMethod: 'cash', amountCents: 30000, classificationSource: 'explicit' },
  { purpose: 'tithe', receiptMethod: 'pix', amountCents: 20000, classificationSource: 'explicit' },
  { purpose: 'offering', receiptMethod: 'cash', amountCents: 10000, classificationSource: 'explicit' },
  { purpose: 'offering', receiptMethod: 'pix', amountCents: 15000, classificationSource: 'explicit' },
];
const verified = validateCountV3ReceiptLines(first, 75000);
assert.equal(verified.totalCents, 75000);
assert.equal(verified.controlTotalMatches, true);
assert.equal(verified.byPurpose.tithe, 50000);
assert.equal(verified.byPurpose.offering, 25000);
assert.equal(verified.byReceiptMethod.cash, 40000);
assert.equal(verified.byReceiptMethod.pix, 35000);
assert.deepEqual(compareCountV3ReceiptLines(first, [...first].reverse()).differences, []);
assert.equal(compareCountV3ReceiptLines(first, [...first].reverse()).matched, true);

const shifted = first.map(line => line.purpose === 'tithe' && line.receiptMethod === 'pix'
  ? { ...line, amountCents: 15000 }
  : line.purpose === 'offering' && line.receiptMethod === 'pix'
    ? { ...line, amountCents: 20000 } : line);
const diff = compareCountV3ReceiptLines(first, shifted);
assert.equal(diff.matched, false, 'Same total with switched purpose must diverge');
assert.equal(diff.firstTotalCents, diff.secondTotalCents);
assert.equal(diff.differences.length, 2);
assert.deepEqual(diff.differences.map(row => row.receiptMethod), ['pix','pix']);

assert.throws(() => validateCountV3ReceiptLines(first, 74000), /COUNT_V3_CONTROL_TOTAL_MISMATCH/);
assert.throws(() => validateCountV3ReceiptLines([]), /COUNT_V3_RECEIPTS_EMPTY/);
assert.throws(() => validateCountV3ReceiptLines([{...first[0],purpose:'unclassified'}]), /COUNT_V3_PURPOSE_REQUIRED/);
assert.throws(() => validateCountV3ReceiptLines([{...first[0],purpose:'other',classificationSource:'legacy_unclassified'}]),
  /CONTRIBUTION_LEGACY_PURPOSE_NOT_VERIFIED/);
assert.throws(() => validateCountV3ReceiptLines([{...first[0],amountCents:-1}]), /CONTRIBUTION_INVALID_AMOUNT/);
assert.throws(() => validateCountV3ReceiptLines(first, '75000'), /COUNT_V3_CONTROL_TOTAL_INVALID/);
const zero = validateCountV3ReceiptLines([{...first[0],amountCents:0}],0);
assert.equal(zero.totalCents,0);
assert.equal(zero.controlTotalMatches,true,'Explicit zero must remain valid');

const legacy = inspectLegacyCountV3Classification([
  { type:'tithe',channel:'cash',method:'total',totalCents:20000,denominations:{} },
  { type:'pix',channel:'pix',method:'total',totalCents:15000,denominations:{} },
]);
assert.equal(legacy.unclassifiedCents,15000);
assert.equal(legacy.requiresHumanClassification,true);
assert.equal(legacy.allocations.find(item=>item.receiptMethod==='pix')?.purpose,'unclassified');
assert.throws(() => validateCountV3ReceiptLines(legacy.allocations), /COUNT_V3_PURPOSE_REQUIRED/);

const many = Array.from({length:5},(_,i)=>({
  purpose:'tithe',receiptMethod:'cash',amountCents:10000,classificationSource:'explicit',extraRecord:i,
}));
assert.equal(validateCountV3ReceiptLines(many).totalCents,50000,
  'Multiple tithe envelopes in one method may be tallied without duplicating purpose');
assert.equal(compareCountV3ReceiptLines(many,[{...first[0],amountCents:50000}]).matched,true,
  'Independent counters may group denominations differently if purpose and receipt method agree');

console.log('✅ Count v3 purpose x method: zero, control totals, Pix classification, equal-grand-total divergence and legacy review');
