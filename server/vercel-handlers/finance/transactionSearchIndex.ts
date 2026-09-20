import { createHash } from 'node:crypto';
import { FieldValue, type DocumentReference, type Firestore, type Transaction } from 'firebase-admin/firestore';
import {
  TRANSACTION_SEARCH_SCHEMA_VERSION,
  buildTransactionSearchKeys,
  type TransactionSearchDocument,
} from '../../../shared/finance/transactionSearch.js';

export const TRANSACTION_SEARCH_SCAN_MAX = 1000 as const;
export const TRANSACTION_SEARCH_BATCH_MAX = 100 as const;
export const TRANSACTION_SEARCH_LIVE_INDEXING_VERSION = 1 as const;

export function getTransactionSearchIndexRef(
  db: Firestore,
  organizationId: string,
  financeEntityId: string,
) {
  return db
    .collection('organizations')
    .doc(organizationId)
    .collection('financeEntities')
    .doc(financeEntityId)
    .collection('transactionSearchIndex');
}

export function buildTransactionSearchCoverageId(
  organizationId: string,
  financeEntityId: string,
) {
  const key = [
    organizationId.trim(),
    financeEntityId.trim(),
    `transaction-search-v${TRANSACTION_SEARCH_SCHEMA_VERSION}`,
  ].join(':');
  return `txsearchcov_${createHash('sha256').update(key).digest('hex')}`;
}

export function buildTransactionSearchRecord(
  transactionData: Record<string, any>,
  organizationId: string,
  financeEntityId: string,
  transactionId: string,
): TransactionSearchDocument {
  const sourceVersion = Number(transactionData.version);
  if (
    transactionData.organizationId !== organizationId ||
    transactionData.financeEntityId !== financeEntityId ||
    !Number.isInteger(sourceVersion) ||
    sourceVersion < 1
  ) {
    throw new Error('TRANSACTION_SEARCH_SOURCE_INVALID');
  }

  return {
    transactionId,
    organizationId,
    financeEntityId,
    sourceVersion,
    searchKeys: buildTransactionSearchKeys({
      ...transactionData,
      id: transactionId,
      transactionId,
    }),
    schemaVersion: TRANSACTION_SEARCH_SCHEMA_VERSION,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export function stageTransactionSearchIndex(
  transaction: Transaction,
  db: Firestore,
  args: {
    organizationId: string;
    financeEntityId: string;
    transactionId: string;
    transactionData: Record<string, any>;
  },
) {
  const ref = getTransactionSearchIndexRef(
    db,
    args.organizationId,
    args.financeEntityId,
  ).doc(args.transactionId);
  const record = buildTransactionSearchRecord(
    args.transactionData,
    args.organizationId,
    args.financeEntityId,
    args.transactionId,
  );
  transaction.set(ref, record);
  return ref;
}

export type TransactionSearchProjectionCandidate = {
  transactionId: string;
  transactionRef: string;
  indexRef: string;
  sourceVersion: number;
  expectedSearchKeys: string[];
};

export async function inspectTransactionSearchProjection(
  db: Firestore,
  organizationId: string,
  financeEntityId: string,
) {
  const transactionsRef = db
    .collection('organizations')
    .doc(organizationId)
    .collection('financeTransactions');

  const snapshot = await transactionsRef
    .where('financeEntityId', '==', financeEntityId)
    .limit(TRANSACTION_SEARCH_SCAN_MAX + 1)
    .get();

  const truncated = snapshot.size > TRANSACTION_SEARCH_SCAN_MAX;
  const sourceDocs = snapshot.docs.slice(0, TRANSACTION_SEARCH_SCAN_MAX);
  const indexCollection = getTransactionSearchIndexRef(
    db,
    organizationId,
    financeEntityId,
  );

  const candidates: TransactionSearchProjectionCandidate[] = [];
  for (const doc of sourceDocs) {
    const data = doc.data() || {};
    const sourceVersion = Number(data.version);
    if (!Number.isInteger(sourceVersion) || sourceVersion < 1) continue;
    candidates.push({
      transactionId: doc.id,
      transactionRef: doc.ref.path,
      indexRef: indexCollection.doc(doc.id).path,
      sourceVersion,
      expectedSearchKeys: buildTransactionSearchKeys({
        ...data,
        id: doc.id,
        transactionId: doc.id,
      }),
    });
  }

  const refs = candidates.map((candidate) => db.doc(candidate.indexRef));
  const indexDocs = refs.length > 0 ? await db.getAll(...refs) : [];
  const missingOrStale: TransactionSearchProjectionCandidate[] = [];
  const verifiedExisting: TransactionSearchProjectionCandidate[] = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const snapshot = indexDocs[index];
    const data = snapshot?.data?.() || {};
    const verified =
      Boolean(snapshot?.exists) &&
      data.organizationId === organizationId &&
      data.financeEntityId === financeEntityId &&
      data.transactionId === candidate.transactionId &&
      data.sourceVersion === candidate.sourceVersion &&
      data.schemaVersion === TRANSACTION_SEARCH_SCHEMA_VERSION &&
      Array.isArray(data.searchKeys) &&
      JSON.stringify([...data.searchKeys].sort()) ===
        JSON.stringify(candidate.expectedSearchKeys);

    if (verified) verifiedExisting.push(candidate);
    else missingOrStale.push(candidate);
  }

  return {
    candidates,
    missingOrStale,
    verifiedExisting,
    truncated,
  };
}

export function buildTransactionSearchCoverageRecord(args: {
  coverageId: string;
  organizationId: string;
  financeEntityId: string;
  expectedTransactionCount: number;
  verifiedIndexCount: number;
  missingOrStaleCount: number;
  truncated: boolean;
  checkedBy: string;
  certified: boolean;
}) {
  return {
    coverageId: args.coverageId,
    organizationId: args.organizationId,
    financeEntityId: args.financeEntityId,
    coverageKind: 'transaction_search_index',
    status: args.certified ? 'certified' : 'incomplete',
    searchSchemaVersion: TRANSACTION_SEARCH_SCHEMA_VERSION,
    liveIndexingVersion: TRANSACTION_SEARCH_LIVE_INDEXING_VERSION,
    expectedTransactionCount: args.expectedTransactionCount,
    verifiedIndexCount: args.verifiedIndexCount,
    missingOrStaleCount: args.missingOrStaleCount,
    truncated: args.truncated,
    checkedBy: args.checkedBy,
    checkedAt: FieldValue.serverTimestamp(),
    certifiedAt: args.certified ? FieldValue.serverTimestamp() : null,
    financialMutation: false,
    auditMutation: false,
  };
}
