import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  evaluateCountVerifications,
  normalizeCountVerificationPolicy,
  type CountVerificationEvidence,
} from '../shared/finance/countVerificationPolicy.js';

const handler = readFileSync('server/vercel-handlers/finance/countVerificationsReopen.ts', 'utf8');
const serializer = readFileSync('server/vercel-handlers/finance/countVerificationV3Common.ts', 'utf8');
const api = readFileSync('api/finance-gateway.ts','utf8');
const contracts = readFileSync('scripts/check-api-contracts.mjs','utf8');
const client = readFileSync('src/services/countV3Service.ts','utf8');
const page = readFileSync('src/pages/finance/count/CountVerificationV3Page.tsx','utf8');

assert.ok(handler.includes('assertCountV3Enabled()'), 'Recount must remain default-off');
assert.ok(handler.includes("resolveFinanceRequestContext(req, 'finance.manage')"),
  'Only canonical finance management may reopen an unbalanced team count');
assert.ok(handler.includes("session.status !== 'divergent'"), 'Matched or pending counts cannot be reopened');
assert.ok(handler.includes('Number(session.version) !== expectedVersion'), 'Reopen is compare-and-swap');
assert.ok(handler.includes('MAX_RECOUNT_CYCLES'), 'Recount loops are bounded');
assert.ok(handler.includes('normalizedReason.length < 10') && handler.includes('normalizedReason.length > 500'),
  'Treasury disposition must have a meaningful bounded reason');
assert.ok(handler.includes('transaction.create(archiveRef') &&
  handler.includes('confirmations: previousConfirmations') &&
  handler.includes('evaluation: session.evaluation'),
  'Sealed original evidence and comparison must be durably archived');
assert.ok(handler.includes("status: 'pending'") && handler.includes('confirmations: []') &&
  handler.includes('evaluation: null'), 'The next independent stage begins empty');
assert.ok(handler.includes('transaction.delete(entityRef.collection(\'countVerificationInvites\')'),
  'Old join codes must be invalidated upon recount');
assert.ok(handler.includes('recountCycle: oldCycle + 1'), 'Cycle identity must advance');
assert.ok(handler.includes('stageCanonicalAuditRecord') && handler.includes('stageFinanceFact'),
  'Recounts require canonical audit and fact staging');
assert.ok(!handler.includes('getTransactionsRef()') && !handler.includes('getAccountsRef()') &&
  !handler.includes('getJournal') && !handler.includes('financeBalances'),
  'Recount cannot touch posted money');
assert.ok(serializer.includes('recountCycle: Number(session.recountCycle || 0)'));
assert.ok(api.includes("case 'count-verifications-reopen':"));
assert.ok(contracts.includes("operation: 'count-verifications-reopen'"));
assert.ok(client.includes("'count-verifications-reopen'"));
assert.ok(page.includes('canReopen = hasEffectiveCapability(accessState, \'finance.manage\')'));
assert.ok(page.includes("session.status === 'divergent' && canReopen"));
assert.ok(page.includes("setRecountReason('')") && page.includes("setMessage(w.reopened)"));
for(const text of [
  'Solicitar nova contagem',
  'Request a new count',
  'Solicitar un nuevo conteo',
]) assert.ok(page.includes(text), 'Recount action must be localized: '+text);

const policy=normalizeCountVerificationPolicy({});
const verification=(id:string,purpose:'tithe'|'offering',amountCents:number): CountVerificationEvidence=>({
  verificationId:'verification_'+id,mode:'independent',operatorUid:id,
  independentCounterUid:id,
  lines:[{purpose,receiptMethod:'cash',amountCents,classificationSource:'explicit'}],
  controlTotalCents: amountCents,
});
const original=evaluateCountVerifications([
  verification('first','tithe',12000),
  verification('second','offering',12000),
],policy);
assert.equal(original.status,'divergent');
const independentlyRecounted=evaluateCountVerifications([
  verification('first','tithe',12000),
  verification('second','tithe',12000),
],policy);
assert.equal(independentlyRecounted.status,'matched');
assert.equal(independentlyRecounted.totalCents,12000);
assert.equal(evaluateCountVerifications([],policy).status,'pending');
console.log('✅ Count v3 divergent re-count is manager-only, idempotent, audited, immutable by cycle and balance-safe');
