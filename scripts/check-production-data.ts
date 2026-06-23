import { getFirebaseAdmin } from '../api/_lib/firebaseAdmin.js';

async function check() {
  const admin = getFirebaseAdmin();
  const adminDb = admin.firestore;
  const snapshot = await adminDb.collectionGroup('financeTransactions').limit(1).get();
  if (!snapshot.empty) {
    const doc = snapshot.docs[0];
    if (!doc.data().listQueryKeys) {
       console.log('REAL_DATA_EXISTS_WITHOUT_KEYS');
       process.exit(0);
    }
  }
  console.log('CLEAN');
}

check().catch(console.error);
