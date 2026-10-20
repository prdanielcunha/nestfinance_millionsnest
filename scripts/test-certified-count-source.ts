import assert from 'node:assert/strict';
import { validateLedgerCountSource } from '../server/vercel-handlers/finance/certifiedCountSource.js';
import { normalizeCountEntries, compareCountEntries } from '../shared/finance/count.js';
const organizationId = 'org_synthetic_count_book'; const financeEntityId = 'entity_synthetic_count_book';

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
console.log('✅ Certified Count origin: assigned source, independent evidence, exact amount/method/date/version and v3 treasury authority');
