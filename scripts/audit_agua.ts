import { getFirebaseAdmin } from '../api/_lib/firebaseAdmin';

async function main() {
  const { firestore: adminDb } = getFirebaseAdmin();
  const orgId = 'JPrzMnxJu77hTLJtu7FT';
  
  const cats = await adminDb.collection(`organizations/${orgId}/financeCategories`).get();
  cats.forEach(doc => {
    console.log(doc.data().name, doc.data().active);
  });
}

main();
