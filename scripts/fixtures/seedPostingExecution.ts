import type { Firestore } from 'firebase-admin/firestore';
import type { postingExecutionFixture } from './postingExecutionFixture.js';
import { normalizeCountEntries, compareCountEntries } from '../../shared/finance/count.js';
import { validateLedgerCountSource } from '../../server/vercel-handlers/finance/ledgerCountSource.js';

/** Only synthetic fixtures; caller must enforce a loopback demo emulator. */
export async function seedPostingExecution(db: Firestore, input: ReturnType<typeof postingExecutionFixture>, configured = true) {
  const { organizationId, financeEntityId } = input.transaction;
  const org = db.collection('organizations').doc(organizationId); const entityRef = org.collection('financeEntities').doc(financeEntityId);
  const batch = db.batch(); batch.set(org, { status: 'active' }); batch.set(entityRef, { organizationId, active: true });
  batch.set(org.collection('financeSettings').doc('config'), { organizationId, timezone: 'America/Sao_Paulo' });
  if (configured) batch.set(org.collection('financeLedgerExecution').doc(financeEntityId), { organizationId, financeEntityId,
    state: 'ready', schemaVersion: 1, initializationMode: 'empty_posted_history', baselineTransactionCount: 0, revision: 1, effectiveStartDate: '2026-01-01' });
  for (const [collection, records] of [['financeAccounts', input.catalog.accounts], ['financeCategories', input.catalog.categories],
    ['financeFunds', input.catalog.funds], ['financeLedgerAccounts', configured ? input.catalog.ledgerAccounts : []]] as const) {
    for (const source of records) {
      const record: any = { ...source, name: ('name' in source ? source.name : null) || `Synthetic ${source.id}` };
      if (collection === 'financeAccounts') record.configurationStatus = 'complete';
      if (!configured) { delete record.ledgerMapping; delete record.ledgerConfigurationRevision; }
      batch.set(org.collection(collection).doc(source.id), record);
    }
  }
  const txRef = org.collection('financeTransactions').doc(input.transaction.id);
  batch.set(txRef, input.transaction); batch.set(txRef.collection('approvals').doc('latest'), input.approval);
  for (const allocation of input.allocations) batch.set(org.collection('financeAllocations').doc(allocation.id), allocation);
  if (input.transaction.countSource) {
    const source = input.transaction.countSource; const entries = normalizeCountEntries([{ type: 'tithe', method: 'total', totalCents: input.transaction.amountCents }]);
    batch.set(entityRef.collection('countSessions').doc(source.countSessionId), { organizationId, financeEntityId,
      id: source.countSessionId, serviceLabel: 'Synthetic service', serviceDate: source.serviceDate,
      version: source.countVersion + 1, status: 'matched', policySnapshot: { requireIndependentCounter: true },
      countA: { entries, totalCents: input.transaction.amountCents, countedByUid: 'synthetic_counter_a' },
      countB: { entries, totalCents: input.transaction.amountCents, countedByUid: 'synthetic_counter_b' },
      comparison: compareCountEntries(entries, entries), countProposal: { status: 'created', sourceVersion: source.countVersion, transactionIds: [input.transaction.id] } });
  }
  await batch.commit();
  if (input.transaction.countSource) {
    const proof = await db.runTransaction(reader => validateLedgerCountSource({ reader, db, organizationId, financeEntityId,
      transaction: input.transaction, timezone: 'America/Sao_Paulo' }));
    await txRef.update({ countSourceProofHash: proof }); await txRef.collection('approvals').doc('latest').update({ countSourceProofHash: proof });
  }
  return { org, txRef, entityRef };
}
