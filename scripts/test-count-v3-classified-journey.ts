import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateCountVerifications, normalizeCountVerificationPolicy } from '../shared/finance/countVerificationPolicy.js';

const server = readFileSync('server/vercel-handlers/finance/countVerificationsSubmit.ts','utf8');
const client = readFileSync('src/services/countV3Service.ts','utf8');
const page = readFileSync('src/pages/finance/count/CountVerificationV3Page.tsx','utf8');
const serializer = readFileSync('server/vercel-handlers/finance/countVerificationV3Common.ts','utf8');
assert.ok(server.includes('validateCountV3ReceiptLines(lines, controlTotalCents ?? null)'));
assert.ok(server.includes('COUNT_VERIFICATION_MIXED_SCHEMA'));
assert.ok(server.includes('COUNT_V3_CONTROL_TOTAL_REQUIRES_CLASSIFIED_LINES'));
assert.ok(server.includes('evaluateCountVerifications(next, policySnapshot)'));
assert.ok(!server.includes('getTransactionsRef()') && !server.includes('getAccountsRef()'),
  'Counter submission must not post money or modify balances');
assert.ok(client.includes('lines?: CountV3ClassifiedReceipt[]'));
assert.ok(page.includes('makeClassifiedLines(values)') && !page.includes('makeEntries(values)'),
  'Default Count v3 interface must not confuse Pix with a contribution purpose');
for (const field of ['tithe','offering','other']) {
  assert.ok(page.includes(field), 'Purpose '+field);
}
for (const method of ['cash','pix','card','bank_transfer','other']) {
  assert.ok(page.includes('method_'+method), 'Receipt method '+method);
}
assert.ok(page.includes('classificationSource: \'explicit\''));
assert.ok(page.includes('controlTotalCents !== null && sum !== controlTotalCents'));
assert.ok(page.includes('aria-pressed={selected}'), 'Tabs must expose their state accessibly');
assert.ok(page.includes("classificationHint: 'PIX é a forma de recebimento"));
assert.ok(page.includes("classificationHint: 'PIX is a receipt method"));
assert.ok(page.includes("classificationHint: 'PIX es la forma"));
assert.ok(serializer.includes('lines: c.lines'), 'Own classified evidence should be recoverable after reconnect');
assert.ok(serializer.includes('const visible = blind ? mine : confirmed'),
  'Role overlap must never disclose someone else\'s blind verification');

const policy=normalizeCountVerificationPolicy({});
const entry=(uid:string, purpose:'tithe'|'offering', method:'cash'|'pix', amount:number)=>({
  verificationId:'verification_'+uid,
  operatorUid:uid,independentCounterUid:uid,
  mode:'independent' as const,
  lines:[{purpose,receiptMethod:method,amountCents:amount,classificationSource:'explicit' as const}],
  controlTotalCents:amount,
});
assert.equal(evaluateCountVerifications([
  entry('first','tithe','pix',3000),entry('second','tithe','pix',3000)
],policy).status,'matched');
const swapped=evaluateCountVerifications([
  entry('first','tithe','pix',3000),entry('second','offering','pix',3000)
],policy);
assert.equal(swapped.status,'divergent');
assert.equal(swapped.differencesFound,true);
assert.equal(swapped.totalCents,3000);
assert.equal(evaluateCountVerifications([
  entry('first','tithe','cash',0),entry('second','tithe','cash',0)
],policy).status,'matched');
console.log('✅ Count v3 purpose×receipt method form and independent server evaluation are consistent');
