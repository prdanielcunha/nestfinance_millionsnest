import { firestore } from 'firebase-admin';
import { createHash } from 'crypto';

export async function loadPostingConfiguration(
  db: firestore.Firestore,
  organizationId: string,
  financeEntityId: string,
  transaction: any
) {
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

  return { mappings, policy, referenceFingerprintHash };
}
