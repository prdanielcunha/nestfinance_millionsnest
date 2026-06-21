import { getFirebaseAdmin } from '../api/_lib/firebaseAdmin.js';

async function audit() {
  const admin = getFirebaseAdmin();
  const db = admin.firestore;
  
  const orgs = await db.collection('organizations').get();
  console.log(`Found ${orgs.size} organizations. Scanning...`);

  const industrialId = 'fent_a0bd282f802e53dc4eeb6e7665ed2ba4';
  const monteCasteloId = 'fent_b813f062431581b136f98a9dd1432dcc';
  
  const collections = ['financeAccounts', 'financeFunds', 'financeCategories'];
  
  for (const orgDoc of orgs.docs) {
      const orgId = orgDoc.id;
      let hasData = false;
      let orgReport = `\n=== Org ID: ${orgId} ===\n`;
      
      for (const coll of collections) {
         const snapshot = await db.collection('organizations').doc(orgId).collection(coll).get();
         if (snapshot.empty) continue;
         
         hasData = true;
         orgReport += `\n--- ${coll} ---\n`;
         
         let countInd = 0;
         let countMC = 0;
         let countOther = 0;
         let countNone = 0;
         
         snapshot.docs.forEach(doc => {
             const data = doc.data();
             if (doc.id === 'acc_4553b15748bb83e1') {
                 orgReport += `\n🚨 [SPECIFIC ACCOUNT acc_4553b15748bb83e1] -> name: "${data.name}", financeEntityId: "${data.financeEntityId}", active: ${data.active}\n`;
             }
             
             const feId = data.financeEntityId;
             if (feId === industrialId) countInd++;
             else if (feId === monteCasteloId) countMC++;
             else if (!feId) countNone++;
             else countOther++;
         });
         
         orgReport += `${coll} Quantities:\n`;
         orgReport += `- Industrial: ${countInd}\n`;
         orgReport += `- Monte Castelo: ${countMC}\n`;
         orgReport += `- Other: ${countOther}\n`;
         orgReport += `- Missing financeEntityId: ${countNone}\n`;
      }
      if (hasData) {
          console.log(orgReport);
      }
  }
}

audit().catch(console.error);
