import { getFirebaseAdmin } from '../api/_lib/firebaseAdmin.js';

async function main() {
    const admin = getFirebaseAdmin();
    const db = admin.firestore;
    
    const orgId = 'JPrzMnxJu77hTLJtu7FT';
    const mcId = 'fent_b813f062431581b136f98a9dd1432dcc';
    const jdId = 'fent_a0bd282f802e53dc4eeb6e7665ed2ba4';
    
    const accounts = await db.collection(`organizations/${orgId}/financeAccounts`).get();
    const funds = await db.collection(`organizations/${orgId}/financeFunds`).get();
    const categories = await db.collection(`organizations/${orgId}/financeCategories`).get();
    
    console.log(`Accounts total: ${accounts.size}`);
    accounts.docs.forEach(d => {
        const data = d.data();
        if (data.financeEntityId === mcId || data.financeEntityId === jdId || d.id === 'acc_4553b15748bb83e1') {
            console.log(`Account ${d.id}: entity=${data.financeEntityId}, active=${data.active}, isActive=${data.isActive}, name="${data.name}"`);
        }
    });

    console.log(`\nFunds total: ${funds.size}`);
    funds.docs.forEach(d => {
        const data = d.data();
        if (data.financeEntityId === mcId || data.financeEntityId === jdId || ['fund_196bab2a741ed8f1', 'fund_1e79d128afce3faa', 'fund_1da9e0335e2316ba'].includes(d.id)) {
            console.log(`Fund ${d.id}: entity=${data.financeEntityId}, active=${data.active}, isActive=${data.isActive}, name="${data.name}"`);
        }
    });

    console.log(`\nCategories total: ${categories.size}`);
    categories.docs.forEach(d => {
        const data = d.data();
        if (data.financeEntityId === mcId || data.financeEntityId === jdId || ['cat_e8397c1d8e9043ee', 'cat_559788b1d2e9dfa7'].includes(d.id)) {
            console.log(`Category ${d.id}: entity=${data.financeEntityId}, active=${data.active}, isActive=${data.isActive}, name="${data.name}"`);
        }
    });
}

main().catch(console.error);
