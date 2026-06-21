import { getFirebaseAdmin } from '../api/_lib/firebaseAdmin.js';

async function main() {
    const admin = getFirebaseAdmin();
    const db = admin.firestore;
    const orgId = 'JPrzMnxJu77hTLJtu7FT';
    const mcId = 'fent_b813f062431581b136f98a9dd1432dcc';
    
    console.log("--- FUNDS ---");
    const funds = await db.collection(`organizations/${orgId}/financeFunds`).where('financeEntityId', '==', mcId).get();
    funds.docs.forEach(d => {
        const data = d.data();
        console.log(`Fund ${d.id}: name="${data.name}", restricted=${data.restricted} (type: ${typeof data.restricted})`);
    });

    console.log("\n--- CATEGORIES ---");
    const cats = await db.collection(`organizations/${orgId}/financeCategories`).where('financeEntityId', '==', mcId).get();
    cats.docs.forEach(d => {
        const data = d.data();
        console.log(`Category ${d.id}: name="${data.name}", kind="${data.kind}"`);
    });
}
main().catch(console.error);
