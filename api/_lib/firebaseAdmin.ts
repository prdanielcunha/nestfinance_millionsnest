
import admin from 'firebase-admin';

let defaultApp: admin.app.App | undefined;

export function getFirebaseAdmin() {
  const firebaseAdmin = (admin as any).default || admin;

  if (!defaultApp) {
    if (firebaseAdmin.apps?.length > 0) {
      defaultApp = firebaseAdmin.app();
    } else {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY || '';
      // Remove surrounding quotes if they exist and replace escaped newlines
      const privateKey = privateKeyRaw.replace(/^"|"$/g, '').replace(/\\n/g, '\n');

      if (!projectId || !clientEmail || !privateKey) {
        throw new Error('MISSING_FIREBASE_CREDENTIALS');
      }

      defaultApp = firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    }
  }

  return {
    auth: firebaseAdmin.auth(),
    firestore: firebaseAdmin.firestore()
  };
}
    