import { getFirebaseAdmin } from '../api/_lib/firebaseAdmin.js';
import { createFinanceEntityScope } from '../server/vercel-handlers/finance/accessHelpers.js';

async function main() {
    const admin = getFirebaseAdmin();
    const db = admin.firestore;
    
    // Simulate what the handler does
    const financeEntityId = 'fent_b813f062431581b136f98a9dd1432dcc';
    const repository = createFinanceEntityScope({ db, organizationId: 'JPrzMnxJu77hTLJtu7FT', financeEntityId });
    
    const fundsSnapshot = await repository.getFundsQuery().get();
    
    const docs = fundsSnapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));

    const validColors = ['slate', 'blue', 'emerald', 'amber', 'violet', 'rose'];

    const funds = [];
    for (const doc of docs) {
      try {
        const data = doc.data;
        if (!data || typeof data.name !== 'string' || typeof data.restricted !== 'boolean') {
          console.log(`Fund ${doc.id} SKIPPED: structurally invalid`);
          continue; 
        }

        repository.assertEntityIsolation(data);

        const colorToken = typeof data.colorToken === 'string' && validColors.includes(data.colorToken)
          ? data.colorToken
          : 'slate';

        funds.push({
          id: doc.id,
          name: data.name,
          financeEntityId: data.financeEntityId,
          restricted: data.restricted,
          colorToken,
          active: typeof data.active === 'boolean' ? data.active : true,
        });
      } catch (err: any) {
        console.log(`Fund ${doc.id} exception: `, err.message);
      }
    }
    
    console.log(`Funds processed:`, funds.map(f => `${f.name} (active: ${f.active})`));
}

main().catch(console.error);
