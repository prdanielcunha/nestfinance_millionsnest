import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { ledgerFailure } from '../../../shared/finance/ledger/certifiedConfiguration.js';

/** Historical bootstrap catalogs omitted the redundant organizationId field.
 * Only their exact server-read parent path may establish it. This exception
 * never applies to journals, transactions, configurations or user payloads. */
export function assertFinanceCatalogScope(
  snapshot: DocumentSnapshot,
  organizationId: string,
  financeEntityId: string,
  collection: 'financeAccounts' | 'financeCategories' | 'financeFunds',
) {
  const value = snapshot.data();
  if (!['financeAccounts','financeCategories','financeFunds'].includes(collection) ||
      !snapshot.exists || !value ||
      snapshot.ref.path !== `organizations/${organizationId}/${collection}/${snapshot.id}` ||
      value.financeEntityId !== financeEntityId ||
      (value.organizationId !== undefined && value.organizationId !== organizationId)) {
    ledgerFailure('LEDGER_SCOPE_INVALID');
  }
}
