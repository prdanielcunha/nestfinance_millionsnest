import { firestore } from 'firebase-admin';
import { createHash } from 'crypto';
import { readPostingCatalog } from './ledgerExecutionStore.js';
import { executionReferences } from '../../../shared/finance/ledger/postingExecution.js';
import { validateLedgerCountSource } from './ledgerCountSource.js';

export async function loadPostingConfiguration(
  db: firestore.Firestore,
  organizationId: string,
  financeEntityId: string,
  transaction: any,
  readTransaction?: firestore.Transaction
) {
  const org = db.collection('organizations').doc(organizationId);
  const configurationRef = org.collection('financeLedgerExecution').doc(financeEntityId);
  const configuration = readTransaction ? await readTransaction.get(configurationRef) : await configurationRef.get();
  if (configuration.exists) {
    const data = configuration.data();
    if (data?.organizationId !== organizationId || data.financeEntityId !== financeEntityId || data.state !== 'ready' || data.schemaVersion !== 1) {
      throw Object.assign(new Error('FINANCE_LEDGER_CONFIGURATION_INVALID'), { code: 'FINANCE_LEDGER_CONFIGURATION_INVALID' });
    }
    const query = org.collection('financeAllocations').where('financeEntityId', '==', financeEntityId).where('transactionId', '==', transaction.id).limit(101);
    const snapshot = readTransaction ? await readTransaction.get(query) : await query.get();
    if (snapshot.size > 100) throw Object.assign(new Error('FINANCE_EXECUTION_ALLOCATION_LIMIT'), { code: 'FINANCE_EXECUTION_ALLOCATION_LIMIT' });
    const allocations = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as any;
    const catalog = await readPostingCatalog(readTransaction || db, db, organizationId, financeEntityId, transaction, allocations);
    const settingsRef = org.collection('financeSettings').doc('config');
    const settings = transaction.countSource || transaction.sourceContext === 'count_session'
      ? (readTransaction ? await readTransaction.get(settingsRef) : await settingsRef.get()).data() : null;
    if (settings?.organizationId && settings.organizationId !== organizationId) throw Object.assign(new Error('FINANCE_CROSS_ENTITY_REFERENCE'), { code: 'FINANCE_CROSS_ENTITY_REFERENCE' });
    const countSourceProofHash = await validateLedgerCountSource({ reader: readTransaction || { get: ref => ref.get() },
      db, organizationId, financeEntityId, transaction, timezone: settings?.timezone || 'America/Sao_Paulo' });
    return { ...executionReferences(transaction, allocations, catalog), countSourceProofHash };
  }
  const accountsSnap = await db.collection('organizations').doc(organizationId)
    .collection('financeAccounts').where('financeEntityId', '==', financeEntityId).get();
  const categoriesSnap = await db.collection('organizations').doc(organizationId)
    .collection('financeCategories').where('financeEntityId', '==', financeEntityId).get();
  
  const financeAccounts: any[] = [];
  const ledgerAccounts: any[] = [];
  accountsSnap.forEach(doc => {
    const acc = doc.data();
    financeAccounts.push({
      accountId: doc.id,
      ledgerAccountId: acc.ledgerMapping || `la_default_asset_${doc.id}`,
      type: acc.type === 'credit_card' ? 'liability' : 'asset'
    });
    ledgerAccounts.push({
      id: acc.ledgerMapping || `la_default_asset_${doc.id}`,
      organizationId,
      financeEntityId,
      active: true,
      postingAllowed: true
    });
  });

  const categoriesMappings: any[] = [];
  categoriesSnap.forEach(doc => {
    const cat = doc.data();
    categoriesMappings.push({
      categoryId: doc.id,
      ledgerAccountId: cat.ledgerMapping || `la_default_${cat.kind}_${doc.id}`,
      kind: cat.kind
    });
    ledgerAccounts.push({
      id: cat.ledgerMapping || `la_default_${cat.kind}_${doc.id}`,
      organizationId,
      financeEntityId,
      active: true,
      postingAllowed: true
    });
  });

  // Reimbursements
  if (transaction.transactionKind === 'expense' && transaction.reimbursement) {
     const payableId = transaction.reimbursement.payableId;
     financeAccounts.push({
       accountId: payableId,
       ledgerAccountId: `la_reimbursement_${payableId}`,
       type: 'liability'
     });
     ledgerAccounts.push({
      id: `la_reimbursement_${payableId}`,
      organizationId,
      financeEntityId,
      active: true,
      postingAllowed: true
    });
  }
  
  if (transaction.transactionKind === 'liability_settlement') {
    const liabId = transaction.liabilityAccountId;
    if (!financeAccounts.find(fa => fa.accountId === liabId)) {
      financeAccounts.push({
        accountId: liabId,
        ledgerAccountId: `la_liability_${liabId}`,
        type: 'liability'
      });
      ledgerAccounts.push({
        id: `la_liability_${liabId}`,
        organizationId,
        financeEntityId,
        active: true,
        postingAllowed: true
      });
    }
  }

  // Deduplicate ledgerAccounts
  const uniqueLedgerAccounts = [];
  const seenIds = new Set();
  for (const acc of ledgerAccounts) {
    if (!seenIds.has(acc.id)) {
      seenIds.add(acc.id);
      uniqueLedgerAccounts.push(acc);
    }
  }

  const mappings = {
    financeAccounts,
    categories: categoriesMappings
  };

  const policy = {
    ledgerAccounts: uniqueLedgerAccounts
  };

  const hashContent = JSON.stringify({ mappings, policy });
  const referenceFingerprintHash = createHash('sha256').update(hashContent).digest('hex');

  return { mappings, policy, referenceFingerprintHash, countSourceProofHash: null as string | null };
}
