import assert from 'node:assert/strict';
import { buildLedgerInitializationPlan } from '../server/vercel-handlers/finance/ledgerInitialization.js';
import { assertExecutableJournalEvidence, journalEvidenceHash } from '../server/vercel-handlers/finance/ledgerJournalEvidence.js';
import { validateLedgerCountSource } from '../server/vercel-handlers/finance/ledgerCountSource.js';
import { preparePostingExecution } from '../shared/finance/ledger/postingExecution.js';
import { postingExecutionFixture } from './fixtures/postingExecutionFixture.js';
import { normalizeCountEntries, compareCountEntries } from '../shared/finance/count.js';

const organizationId = 'org_synthetic_lifecycle'; const financeEntityId = 'entity_synthetic_lifecycle';
const scope = { organizationId, financeEntityId, active: true };
const account = { id: 'acc_synthetic_cash', data: { ...scope, name: 'Synthetic cash', nature: 'asset', currency: 'BRL', configurationStatus: 'complete' } };
const category = { id: 'cat_synthetic_tithe', data: { ...scope, name: 'Synthetic tithe', kind: 'income', version: 1 } };
const input = { ...scope, accounts: [account], categories: [category], funds: [] };
const plan = buildLedgerInitializationPlan(input);
assert.equal(plan.mappings.length, 2); assert.match(plan.fingerprint, /^sha256:[a-f0-9]{64}$/);
assert.equal(plan.mappings.find(value => value.sourceCollection === 'financeAccounts')?.ledgerAccount.normalBalance, 'debit');
assert.equal(plan.mappings.find(value => value.sourceCollection === 'financeCategories')?.ledgerAccount.normalBalance, 'credit');
assert.equal('openingBalanceCents' in plan, false);
assert.equal(buildLedgerInitializationPlan({ ...input, accounts: [account, { ...account, id: 'acc_synthetic_bank' }] }).fingerprint,
  buildLedgerInitializationPlan({ ...input, accounts: [{ ...account, id: 'acc_synthetic_bank' }, account] }).fingerprint);
for (const [patch, message] of [
  [{ organizationId: 'foreign' }, 'CROSS_ENTITY'], [{ currency: 'USD' }, 'CONFIGURATION_INCOMPLETE'],
  [{ nature: 'income' }, 'REFERENCE_INVALID'], [{ ledgerMapping: 'invented_mapping' }, 'ALREADY_EXISTS'],
] as const) assert.throws(() => buildLedgerInitializationPlan({ ...input, accounts: [{ ...account, data: { ...account.data, ...patch } }] }), new RegExp(message));
assert.throws(() => buildLedgerInitializationPlan({ ...input, accounts: Array(151).fill(account) }), /REFERENCE_LIMIT/);
const fixture = postingExecutionFixture(); const executed = preparePostingExecution(fixture);
const material = { ...executed.journal, effectiveDay: executed.effectiveDay, period: executed.period,
  accountDeltas: executed.accountDeltas, fundDeltas: [], sourceVersion: fixture.expectedVersion, executionSchemaVersion: 1 };
const journal = { ...material, executionProofHash: journalEvidenceHash(material) };
assertExecutableJournalEvidence(journal, journal.organizationId, journal.financeEntityId, journal.sourceTransactionId);
assert.equal(journalEvidenceHash({ ...journal, recordedAt: 'server-assigned-at-commit' }), journal.executionProofHash);
assert.throws(() => assertExecutableJournalEvidence({ ...journal, effectiveDay: '2026-10-11' }, journal.organizationId, journal.financeEntityId, journal.sourceTransactionId), /INTEGRITY/);
const duplicate = { ...material, accountDeltas: [...material.accountDeltas, material.accountDeltas[0]] };
assert.throws(() => assertExecutableJournalEvidence({ ...duplicate, executionProofHash: journalEvidenceHash(duplicate) }, journal.organizationId, journal.financeEntityId, journal.sourceTransactionId), /INTEGRITY/);
assert.throws(() => assertExecutableJournalEvidence(journal, 'foreign', journal.financeEntityId, journal.sourceTransactionId), /INTEGRITY/);

const countSessionId = 'cnt_' + '1'.repeat(24);
const entries = normalizeCountEntries([{ type: 'tithe', method: 'total', totalCents: 12345 }]);
const count = { id: countSessionId, organizationId, financeEntityId, status: 'matched', version: 4,
  serviceDate: '2026-10-10', serviceLabel: 'Synthetic service', policySnapshot: { requireIndependentCounter: true },
  countA: { entries, countedByUid: 'synthetic_a', totalCents: 12345 }, countB: { entries, countedByUid: 'synthetic_b', totalCents: 12345 },
  comparison: compareCountEntries(entries, entries), countProposal: { status: 'created', sourceVersion: 3, transactionIds: ['tx_synthetic_source'] } };
const tx = { id: 'tx_synthetic_source', transactionKind: 'income', sourceContext: 'count_session', amountCents: 12345,
  paymentMethod: 'cash', occurredAt: '2026-10-10T12:00:00Z', countSource: { countSessionId, countVersion: 3, countEntryType: 'tithe',
    serviceDate: '2026-10-10', receivedDate: '2026-10-10', sourceCaptureIds: [] } };
let loaded: any = count;
const chain: any = { collection() { return chain; }, doc() { return chain; } };
const read = (transaction: any) => validateLedgerCountSource({ organizationId, financeEntityId,
  db: chain, reader: { get: async () => ({ exists: true, id: countSessionId, data: () => loaded }) as any },
  transaction, timezone: 'America/Sao_Paulo' });
assert.match((await read(tx))!, /^sha256:[a-f0-9]{64}$/);
await assert.rejects(read({ ...tx, amountCents: 12346 }), /AMOUNT_MISMATCH/);
await assert.rejects(read({ ...tx, paymentMethod: 'pix' }), /SOURCE_INVALID/);
await assert.rejects(read({ ...tx, countSource: undefined }), /SOURCE_INVALID/);
loaded = { ...count, version: 5 }; await assert.rejects(read(tx), /SOURCE_INVALID/);
loaded = { ...count, countB: { ...count.countB, countedByUid: 'synthetic_a' } }; await assert.rejects(read(tx), /INDEPENDENCE_REQUIRED/);
loaded = { ...count, countProposal: { ...count.countProposal, transactionIds: ['different_transaction'] } }; await assert.rejects(read(tx), /SOURCE_INVALID/);
const verification = (uid: string) => ({ verificationId: 'verification_' + uid, mode: 'independent', operatorUid: uid, independentCounterUid: uid,
  lines: [{ purpose: 'tithe', receiptMethod: 'cash', amountCents: 12345, classificationSource: 'explicit' }], controlTotalCents: 12345 });
loaded = { ...count, policySnapshot: { minimumIndependentConfirmations: 2, maximumParticipants: 20 }, recountCycle: 0,
  confirmations: [verification('first'), verification('second')], treasuryReview: { status: 'accepted', sourceVersion: 2 } };
const v3Tx = { ...tx, countSource: { ...tx.countSource, countSchemaVersion: 3, countReceiptMethod: 'cash', recountCycle: 0 } };
assert.match((await read(v3Tx))!, /^sha256:[a-f0-9]{64}$/);
loaded = { ...loaded, treasuryReview: { status: 'pending', sourceVersion: 2 } }; await assert.rejects(read(v3Tx), /SOURCE_INVALID/);
console.log('✅ Ledger lifecycle: reviewed configuration, immutable journal evidence, independent Count origin, exact amount/method/date/version and v3 treasury authority');
