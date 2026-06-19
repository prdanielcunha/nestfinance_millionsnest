import { getFirebaseAdmin } from '../api/_lib/firebaseAdmin';
import { buildUniqueKeyLogicName, generateUniqueKeyId } from '../api/_lib/financeIdentity';

async function main() {
  const { auth: adminAuth, firestore: adminDb } = getFirebaseAdmin();
  const email = 'pastordanielpcunha@gmail.com';
  const user = await adminAuth.getUserByEmail(email);
  const uid = user.uid;
  console.log(`UID: ${uid}`);

  const orgId = 'JPrzMnxJu77hTLJtu7FT';
  
  const orgDoc = await adminDb.doc(`organizations/${orgId}`).get();
  console.log('Org:', orgDoc.data()?.name);

  // 2. Audit the account
  const accountId = 'acc_4553b15748bb83e1';
  const accDoc = await adminDb.doc(`organizations/${orgId}/financeAccounts/${accountId}`).get();
  if (accDoc.exists) {
    const data = accDoc.data();
    console.log('Account:');
    console.log({
      id: accDoc.id,
      name: data?.name,
      normalizedName: data?.normalizedName,
      type: data?.type,
      currency: data?.currency,
      active: data?.active,
      institutionName: data?.institutionName,
      accountLast4: data?.accountLast4,
      schemaVersion: data?.schemaVersion,
      createdAt: data?.createdAt?.toDate(),
      createdBy: data?.createdBy,
      updatedAt: data?.updatedAt?.toDate(),
      updatedBy: data?.updatedBy
    });
  }

  // Count accounts
  const allAccounts = await adminDb.collection(`organizations/${orgId}/financeAccounts`).get();
  let total = allAccounts.size;
  let actives = 0;
  let archived = 0;
  allAccounts.forEach(doc => {
    if (doc.data().active) actives++;
    else archived++;
  });
  console.log(`Total Accounts: ${total}, Actives: ${actives}, Archived: ${archived}`);

  // Query by old name just in case
  const oldNameAccounts = await adminDb.collection(`organizations/${orgId}/financeAccounts`).where('normalizedName', '==', 'caixa monte castelo').get();
  console.log(`Accounts with old name (caixa monte castelo): ${oldNameAccounts.size}`);

  const newNameAccounts = await adminDb.collection(`organizations/${orgId}/financeAccounts`).where('normalizedName', '==', 'caixa fisico monte castelo').get();
  console.log(`Accounts with new name (caixa fisico monte castelo): ${newNameAccounts.size}`);

  // 4. Locks
  const oldLogKey = buildUniqueKeyLogicName('account', 'caixa monte castelo');
  const oldLockId = generateUniqueKeyId(oldLogKey);
  const newLogKey = buildUniqueKeyLogicName('account', 'caixa fisico monte castelo');
  const newLockId = generateUniqueKeyId(newLogKey);

  const oldLockDoc = await adminDb.doc(`organizations/${orgId}/financeUniqueKeys/${oldLockId}`).get();
  console.log(`Old Lock ID: ${oldLockId}`);
  console.log(`Old Lock:`, oldLockDoc.exists ? oldLockDoc.data() : 'NOT FOUND');

  const newLockDoc = await adminDb.doc(`organizations/${orgId}/financeUniqueKeys/${newLockId}`).get();
  console.log(`New Lock ID: ${newLockId}`);
  console.log(`New Lock:`, newLockDoc.exists ? newLockDoc.data() : 'NOT FOUND');

  // 5. Audit logs
  const updatedLogs = await adminDb.collection(`organizations/${orgId}/financeAuditLogs`)
    .where('entityType', '==', 'financeAccount')
    .where('entityId', '==', accountId)
    .where('action', '==', 'finance.account.updated')
    .where('actorUid', '==', uid)
    .get();

  console.log(`Updated Logs count: ${updatedLogs.size}`);
  updatedLogs.forEach(doc => {
    const data = doc.data();
    console.log(`Log ID: ${doc.id}`);
    console.log(`Request ID: ${data.requestId}`);
    console.log(`Changes:`, JSON.stringify(data.changes));
    console.log(`CreatedAt: ${data.createdAt?.toDate()}`);
  });

  // check side effects
  const funds = await adminDb.collection(`organizations/${orgId}/financeFunds`).get();
  console.log(`Total funds: ${funds.size}`);

  const categories = await adminDb.collection(`organizations/${orgId}/financeCategories`).get();
  console.log(`Total categories: ${categories.size}`);

}

main().catch(console.error);
