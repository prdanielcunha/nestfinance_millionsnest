import { hashPayload } from './idempotencyHelper.js';
import { sanitizeFirestoreObject } from './sanitizeFirestoreObject.js';
import { assertJournalBalanced } from '../../../shared/finance/ledger/journal.js';

/** Firestore assigns recordedAt at commit. Other immutable journal fields
 * belong to the evidence hash used before a financial correction. */
export function journalEvidenceHash(journal: Record<string, any>) {
  const { recordedAt: _recordedAt, executionProofHash: _proof, ...material } = journal;
  return 'sha256:' + hashPayload(sanitizeFirestoreObject(material));
}

export function assertExecutableJournalEvidence(journal: any, organizationId: string, financeEntityId: string, transactionId: string) {
  const fail = (): never => { throw Object.assign(new Error('FINANCE_JOURNAL_INTEGRITY'), { code: 'FINANCE_JOURNAL_INTEGRITY' }); };
  if (!journal || journal.organizationId !== organizationId || journal.financeEntityId !== financeEntityId ||
    journal.sourceTransactionId !== transactionId || journal.executionSchemaVersion !== 1 ||
    journal.executionProofHash !== journalEvidenceHash(journal)) fail();
  assertJournalBalanced(journal);
  for (const [field, idField] of [['accountDeltas', 'accountId'], ['fundDeltas', 'fundId']]) {
    const values = journal[field];
    if (!Array.isArray(values) || values.length > 100) fail();
    const ids = new Set<string>();
    for (const value of values) {
      if (!value || typeof value[idField] !== 'string' || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(value[idField]) ||
        ids.has(value[idField]) || !Number.isSafeInteger(value.deltaCents)) fail();
      ids.add(value[idField]);
    }
    if (field === 'accountDeltas' && values.length === 0) fail();
  }
}
