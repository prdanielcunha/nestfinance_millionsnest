import { getFirebaseAdmin } from '../api/_lib/firebaseAdmin.js';
import { resolveEcosystemSession } from '../api/_lib/ecosystemSessionResolver.js';
import { createHash } from 'crypto';

async function run() {
  const admin = getFirebaseAdmin();
  const db = admin.firestore;
  
  // We need the UID. Let's find the user first.
  const usersSnapshot = await admin.auth.listUsers();
  const user = usersSnapshot.users.find(u => u.email === 'pastordanielpcunha@gmail.com');
  const uid = user ? user.uid : 'UNKNOWN_UID';

  const orgId = 'JPrzMnxJu77hTLJtu7FT';

  console.log('--- A. Organização ---');
  console.log(`organizationId: ${orgId}`);
  console.log(`uid: ${uid}`);

  const orgRef = db.collection('organizations').doc(orgId);
  
  console.log('\n--- B. Entidade ---');
  const entitiesRef = orgRef.collection('financeEntities');
  const entitiesSnapshot = await entitiesRef.get();
  
  console.log(`Coleção de entidades possui: ${entitiesSnapshot.size} registros ativos e totais.`);

  if (entitiesSnapshot.empty) {
      console.log('NO ENTITY FOUND');
  } else {
      const doc = entitiesSnapshot.docs[0];
      const data = doc.data();
      
      const maskedTaxId = data.taxId ? `**.*${data.taxId.substring(2, 5)}.***/****-${data.taxId.substring(12, 14)}` : 'UNKNOWN';

      console.log(`ID: ${data.id}`);
      console.log(`displayName: ${data.displayName}`);
      console.log(`taxIdMasked: ${maskedTaxId}`);
      console.log(`taxIdFormat: ${data.taxIdFormat}`);
      console.log(`legalName: ${data.legalName}`);
      console.log(`tradeName: ${data.tradeName}`);
      console.log(`status: ${data.registration?.status}`);
      console.log(`cidade/UF cadastral: ${data.registeredAddress?.city}/${data.registeredAddress?.state}`);
      console.log(`cidade/UF operacional: ${data.operationalAddress?.city}/${data.operationalAddress?.state}`);
      console.log(`active: ${data.active}`);
      console.log(`logoPath: ${data.logoPath}`);
      console.log(`openingDate: ${data.registration?.openingDate}`);
      
      console.log('\n--- C. Origem ---');
      console.log(`provider: ${data.registrySource?.provider}`);
      console.log(`providerDataset: ${data.registrySource?.providerDataset}`);
      console.log(`queriedAt: ${data.registrySource?.queriedAt ? data.registrySource.queriedAt.toDate().toISOString() : 'null'}`);
      console.log(`confirmedAt: ${data.registrySource?.confirmedAt ? data.registrySource.confirmedAt.toDate().toISOString() : 'null'}`);
      console.log(`confirmedBy: ${data.registrySource?.confirmedBy}`);
      
      console.log('\n--- D. Locks ---');
      const normTaxId = data.taxId;
      const normDisplayName = data.normalizedDisplayName;
      
      const taxIdHash = createHash('sha256').update(`financeEntity:taxId:${normTaxId}`).digest('hex');
      const nameHash = createHash('sha256').update(`financeEntity:displayName:${normDisplayName}`).digest('hex');
      
      const taxIdLock = await orgRef.collection('financeUniqueKeys').doc(`uniq_${taxIdHash}`).get();
      const nameLock = await orgRef.collection('financeUniqueKeys').doc(`uniq_${nameHash}`).get();
      
      console.table([
          { Tipo: 'taxId', LockID: `uniq_${taxIdHash.substring(0, 8)}...`, EntityID: taxIdLock.data()?.entityId, Válido: taxIdLock.exists },
          { Tipo: 'displayName', LockID: `uniq_${nameHash.substring(0, 8)}...`, EntityID: nameLock.data()?.entityId, Válido: nameLock.exists },
      ]);
      
      console.log('\n--- E. Audit log ---');
      const logs = await orgRef.collection('financeAuditLogs')
          .where('entityType', '==', 'financeEntity')
          .where('entityId', '==', data.id)
          .where('action', '==', 'finance.entity.created')
          .get();
          
      console.log(`quantidade: ${logs.size}`);
      logs.docs.forEach(l => {
          const lData = l.data();
          console.log(`log ID: ${l.id}`);
          console.log(`requestId: ${lData.requestId}`);
          console.log(`timestamp: ${lData.createdAt.toDate().toISOString()}`);
          
          const hasSensData = !!(lData.taxId || lData.legalName || lData.tradeName || lData.registration || lData.rawProviderResponse);
          console.log(`confirmação de ausência de dados sensíveis: ${hasSensData ? 'FALHA (contém dados)' : 'OK (ausentes)'}`);
      });
      
      console.log('\n--- F. Minimização ---');
      const discarded = ['qsa', 'socios', 'cpf', 'capitalSocial', 'capital_social', 'telefone', 'email', 'simplesNacional', 'mei', 'rawProviderResponse', 'providerPayload', 'brasilApiRaw'];
      const foundDiscarded = discarded.filter(d => data[d] !== undefined);
      if (foundDiscarded.length > 0) {
          console.log(`Foram encontrados campos indevidos: ${foundDiscarded.join(', ')}`);
      } else {
          console.log('OK - Nenhum dado extra ou sensível foi persistido.');
      }
      
  }

  console.log('\n--- G. Integridade ---');
  const accounts = await orgRef.collection('financeAccounts').get();
  console.log(`Total accounts: ${accounts.size}`);
  
  const funds = await orgRef.collection('financeFunds').get();
  console.log(`Total funds: ${funds.size}`);
  
  const categories = await orgRef.collection('financeCategories').get();
  console.log(`Total categories: ${categories.size}`);
  
  const catAgua = categories.docs.find(d => d.data().name === 'Água' && d.data().code === '1.1.2.01');
  if (catAgua) {
     console.log(`Água active: ${catAgua.data().active}`);
  }
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
