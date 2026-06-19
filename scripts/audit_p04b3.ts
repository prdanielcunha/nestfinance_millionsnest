import { getFirebaseAdmin } from '../api/_lib/firebaseAdmin.js';

async function audit() {
  const admin = getFirebaseAdmin();
  const firestore = admin.firestore;
  
  const orgId = 'JPrzMnxJu77hTLJtu7FT';
  const entId1 = 'fent_b813f062431581b136f98a9dd1432dcc';
  const entId2 = 'fent_a0bd282f802e53dc4eeb6e7665ed2ba4';

  const orgRef = firestore.collection('organizations').doc(orgId);
  
  console.log('--- A. Monte Castelo ---');
  const ent1Doc = await orgRef.collection('financeEntities').doc(entId1).get();
  const ent1 = ent1Doc.data();
  console.log(`ID: ${ent1Doc.id}`);
  console.log(`displayName: ${ent1?.displayName}`);
  console.log(`taxIdType: ${ent1?.taxIdType}, Format: ${ent1?.taxIdFormat}`);
  console.log(`active: ${ent1?.active}`);
  console.log(`schemaVersion: ${ent1?.schemaVersion}`);
  
  console.log('--- B. Endereço cadastral ---');
  console.log(ent1?.registeredAddress);
  
  console.log('--- C. Endereço operacional ---');
  console.log(`sameAsRegistered: ${ent1?.operationalAddressSameAsRegistered}`);
  console.log(ent1?.operationalAddress);

  console.log('--- D. Campos imutáveis ---');
  console.log(`taxId starts with: ${ent1?.taxId?.substring(0, 4)}***`);
  console.log(`registrySource:`, ent1?.registrySource);
  console.log(`createdAt:`, ent1?.createdAt?.toDate());
  console.log(`updatedAt:`, ent1?.updatedAt?.toDate());
  console.log(`manualRevision:`, ent1?.manualRevision);
  
  console.log('--- E. Audit log ---');
  const logsSnap = await orgRef.collection('financeAuditLogs')
    .where('entityId', '==', entId1)
    .where('action', '==', 'finance.entity.updated')
    .get();
  
  if (!logsSnap.empty) {
    const docs = logsSnap.docs.map(d => ({ id: d.id, data: d.data() }));
    docs.sort((a, b) => b.data.createdAt?.toDate().getTime() - a.data.createdAt?.toDate().getTime());
    const logData = docs[0].data;
    console.log(`Log ID: ${docs[0].id}`);
    console.log(`requestId: ${logData.requestId}`);
    console.log(`changes:`, JSON.stringify(logData.changes));
    console.log(`createdAt:`, logData.createdAt?.toDate());
    console.log(`actorUid: ${logData.actorUid}`);
    console.log(`Total corresponding logs: ${docs.length}`);
  } else {
    console.log('No recent audit log found.');
  }

  console.log('--- F. Locks ---');
  const locksSnap = await orgRef.collection('financeUniqueKeys')
    .where('entityId', '==', entId1)
    .get();
  locksSnap.forEach(snap => {
    console.log(`Lock ID: ${snap.id}`);
    console.log(`keyType: ${snap.data().keyType}`);
    console.log(`value: ${snap.data().value}`);
  });

  console.log('--- G. Segunda entidade ---');
  const ent2Doc = await orgRef.collection('financeEntities').doc(entId2).get();
  const ent2 = ent2Doc.data();
  console.log(`ID: ${ent2Doc.id}`);
  console.log(`displayName: ${ent2?.displayName}`);
  console.log(`createdAt:`, ent2?.createdAt?.toDate());
  console.log(`cidade operacional: ${ent2?.operationalAddress?.city}`);
  console.log(`estado: ${ent2?.operationalAddress?.state}`);
  console.log(`active: ${ent2?.active}`);

  console.log('--- H. Integridade ---');
  // just verify counts
  const accs = await orgRef.collection('financeAccounts').count().get();
  const funds = await orgRef.collection('financeFunds').count().get();
  const cats = await orgRef.collection('financeCategories').count().get();
  const ex1 = await orgRef.collection('financeAccounts').doc('acc_4553b15748bb83e1').get();
  console.log(`Contas: ${accs.data().count}`);
  console.log(`Fundos: ${funds.data().count}`);
  console.log(`Categorias: ${cats.data().count}`);
  console.log(`Caixa Físico Monte Castelo active: ${ex1.data()?.active}, name: ${ex1.data()?.name}`);
}

audit().catch(console.error);
