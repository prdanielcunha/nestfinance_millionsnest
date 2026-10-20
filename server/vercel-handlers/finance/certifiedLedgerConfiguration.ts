import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { certifiedPlanReferences, ledgerConfigurationKey, ledgerFailure, validateLedgerConfiguration } from '../../../shared/finance/ledger/certifiedConfiguration.js';
import { assertFinanceCatalogScope } from './financeCatalogScope.js';

/** No invented chart account or permissive active=true fallback is allowed here. */
export async function loadCertifiedLedgerConfiguration(db: Firestore, organizationId: string, entity: string, transaction?: Transaction) {
  const org = db.collection('organizations').doc(organizationId);
  const ref = org.collection('financeSettings').doc(ledgerConfigurationKey(entity));
  const read = (r: any): Promise<any> => transaction ? transaction.get(r) : r.get();
  const snap = await read(ref);
  if (!snap.exists) ledgerFailure('LEDGER_NOT_CONFIGURED');
  const data = snap.data();
  if (data.organizationId !== organizationId || data.financeEntityId !== entity) ledgerFailure('LEDGER_SCOPE_INVALID');
  const configuration = validateLedgerConfiguration(data.configuration);
  if (!configuration.enabled) ledgerFailure('LEDGER_DISABLED');
  const references: Record<string,unknown>[] = [];
  for (const mapping of configuration.financeAccounts) {
    const a = await read(org.collection('financeAccounts').doc(mapping.accountId));
    const value = a.data();
    if (!a.exists || value.financeEntityId !== entity || value.active !== true || value.configurationStatus !== 'complete') ledgerFailure('LEDGER_FINANCE_ACCOUNT_UNAVAILABLE');
    assertFinanceCatalogScope(a,organizationId,entity,'financeAccounts');
    const nature = value.nature;
    if (nature !== mapping.type) ledgerFailure('LEDGER_MAPPING_TYPE_MISMATCH');
    references.push({accountId:a.id,active:value.active,type:value.type,nature,version:value.version ?? null});
  }
  for (const mapping of configuration.categories) {
    const a = await read(org.collection('financeCategories').doc(mapping.categoryId));
    const value = a.data();
    if (!a.exists || value.financeEntityId !== entity || value.active !== true || value.kind !== mapping.kind) ledgerFailure('LEDGER_CATEGORY_UNAVAILABLE');
    assertFinanceCatalogScope(a,organizationId,entity,'financeCategories');
    references.push({categoryId:a.id,active:value.active,kind:value.kind,version:value.version ?? null});
  }
  const result = certifiedPlanReferences(configuration,organizationId,entity);
  // Reference edits are transaction read dependencies. The immutable explicit
  // configuration seals accounting identities; names do not change a posting.
  return {...result,configuration,configurationRef:ref,certified:true as const,references};
}
