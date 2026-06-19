import { getFirebaseAdmin } from '../api/_lib/firebaseAdmin.js';
import { createHash } from 'crypto';

async function run() {
  const admin = getFirebaseAdmin();
  const db = admin.firestore;
  
  const usersSnapshot = await admin.auth.listUsers();
  const user = usersSnapshot.users.find(u => u.email === 'pastordanielpcunha@gmail.com');
  const uid = user ? user.uid : 'UNKNOWN_UID';

  const orgId = 'JPrzMnxJu77hTLJtu7FT';

  console.log('--- A. Organização ---');
  console.log(`organizationId: ${orgId}`);
  console.log(`uid: ${uid}`);

  const orgRef = db.collection('organizations').doc(orgId);
  const entitiesRef = orgRef.collection('financeEntities');
  const entitiesSnapshot = await entitiesRef.get();
  
  console.log(`Coleção de entidades possui: ${entitiesSnapshot.size} registros ativos e totais.`);

  const monteCastelo = entitiesSnapshot.docs.find(d => d.id === 'fent_b813f062431581b136f98a9dd1432dcc')?.data();
  const jdIndustrial = entitiesSnapshot.docs.find(d => d.id === 'fent_a0bd282f802e53dc4eeb6e7665ed2ba4')?.data();

  if (monteCastelo) {
      console.log('\n--- B. Monte Castelo ---');
      console.log(`ID: ${monteCastelo.id}`);
      console.log(`displayName: ${monteCastelo.displayName}`);
      const maskedTaxId = monteCastelo.taxId ? `**.*${monteCastelo.taxId.substring(2, 5)}.***/****-${monteCastelo.taxId.substring(12, 14)}` : 'UNKNOWN';
      console.log(`taxIdMasked: ${maskedTaxId}`);
      console.log(`cidade/UF cadastral: ${monteCastelo.registeredAddress?.city}/${monteCastelo.registeredAddress?.state}`);
      console.log(`cidade/UF operacional: ${monteCastelo.operationalAddress?.city}/${monteCastelo.operationalAddress?.state}`);
      console.log(`estado operacional: ${monteCastelo.operationalAddress?.state}`);
      console.log(`active: ${monteCastelo.active}`);
  }

  if (jdIndustrial) {
      console.log('\n--- C. Jd. Industrial ---');
      console.log(`ID: ${jdIndustrial.id}`);
      console.log(`displayName: ${jdIndustrial.displayName}`);
      const maskedTaxId2 = jdIndustrial.taxId ? `**.*${jdIndustrial.taxId.substring(2, 5)}.***/****-${jdIndustrial.taxId.substring(12, 14)}` : 'UNKNOWN';
      console.log(`taxIdMasked: ${maskedTaxId2}`);
      console.log(`taxIdFormat: ${jdIndustrial.taxIdFormat}`);
      console.log(`legalName: ${jdIndustrial.legalName}`);
      console.log(`tradeName: ${jdIndustrial.tradeName}`);
      console.log(`status: ${jdIndustrial.registration?.status}`);
      console.log(`cidade/UF cadastral: ${jdIndustrial.registeredAddress?.city}/${jdIndustrial.registeredAddress?.state}`);
      console.log(`cidade/UF operacional: ${jdIndustrial.operationalAddress?.city}/${jdIndustrial.operationalAddress?.state}`);
      console.log(`active: ${jdIndustrial.active}`);
      console.log(`logoPath: ${jdIndustrial.logoPath}`);
      console.log(`openingDate: ${jdIndustrial.registration?.openingDate}`);
      
      console.log(`provider: ${jdIndustrial.registrySource?.provider}`);
      console.log(`providerDataset: ${jdIndustrial.registrySource?.providerDataset}`);
      console.log(`queriedAt: ${jdIndustrial.registrySource?.queriedAt ? jdIndustrial.registrySource.queriedAt.toDate().toISOString() : 'null'}`);
      console.log(`confirmedAt: ${jdIndustrial.registrySource?.confirmedAt ? jdIndustrial.registrySource.confirmedAt.toDate().toISOString() : 'null'}`);
      console.log(`confirmedBy: ${jdIndustrial.registrySource?.confirmedBy}`);
      
      console.log('\n--- D. Separação ---');
      console.log(`IDs diferentes: ${monteCastelo?.id !== jdIndustrial.id}`);
      console.log(`CNPJs diferentes: ${monteCastelo?.taxId !== jdIndustrial.taxId}`);
      console.log(`Nomes normais diferentes: ${monteCastelo?.normalizedDisplayName !== jdIndustrial.normalizedDisplayName}`);

      console.log('\n--- E. Locks Jd. Industrial ---');
      const normTaxId = jdIndustrial.taxId;
      const normDisplayName = jdIndustrial.normalizedDisplayName;
      
      const taxIdHash = createHash('sha256').update(`financeEntity:taxId:${normTaxId}`).digest('hex');
      const nameHash = createHash('sha256').update(`financeEntity:displayName:${normDisplayName}`).digest('hex');
      
      const taxIdLock = await orgRef.collection('financeUniqueKeys').doc(`uniq_${taxIdHash}`).get();
      const nameLock = await orgRef.collection('financeUniqueKeys').doc(`uniq_${nameHash}`).get();
      
      console.table([
          { Tipo: 'taxId', LockID: `uniq_${taxIdHash.substring(0, 8)}...`, EntityID: taxIdLock.data()?.entityId, Válido: taxIdLock.exists },
          { Tipo: 'displayName', LockID: `uniq_${nameHash.substring(0, 8)}...`, EntityID: nameLock.data()?.entityId, Válido: nameLock.exists },
      ]);
      
      console.log('\n--- F. Audit log ---');
      const logs = await orgRef.collection('financeAuditLogs')
          .where('entityType', '==', 'financeEntity')
          .where('entityId', '==', jdIndustrial.id)
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
      
      console.log('\n--- Minimização ---');
      const discarded = ['qsa', 'socios', 'cpf', 'capitalSocial', 'capital_social', 'telefone', 'email', 'simplesNacional', 'mei', 'rawProviderResponse', 'providerPayload', 'brasilApiRaw', 'cnpjWsRaw'];
      const foundDiscarded = discarded.filter(d => jdIndustrial[d] !== undefined);
      if (foundDiscarded.length > 0) {
          console.log(`Foram encontrados campos indevidos: ${foundDiscarded.join(', ')}`);
      } else {
          console.log('OK - Nenhum dado extra ou sensível foi persistido.');
      }
      
  }

  console.log('\n--- G. Contagem ---');
  console.log(`Total: ${entitiesSnapshot.size}`);
  let active = 0;
  entitiesSnapshot.docs.forEach(doc => {
      if(doc.data().active) active++;
  });
  console.log(`Ativas: ${active}`);

  console.log('\n--- H. Integridade ---');
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
