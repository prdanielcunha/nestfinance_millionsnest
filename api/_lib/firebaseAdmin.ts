
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

export function getFirebaseAdmin(): { auth: Auth; firestore: Firestore } {
  if (getApps().length > 0) {
    return {
      auth: getAuth(),
      firestore: getFirestore(),
    };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('MISSING_FIREBASE_CREDENTIALS');
  }

  const app = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });

  return {
    auth: getAuth(app),
    firestore: getFirestore(app),
  };
}
    