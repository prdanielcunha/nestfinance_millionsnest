
import * as admin from 'firebase-admin';

let defaultApp: admin.app.App | undefined;

export function getFirebaseAdmin() {
  if (!defaultApp) {
    if (admin.apps.length > 0) {
      defaultApp = admin.app();
    } else {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY || '';
      // Remove surrounding quotes if they exist and replace escaped newlines
      const privateKey = privateKeyRaw.replace(/^"|"$/g, '').replace(/\\n/g, '\n');

      if (!projectId || !clientEmail || !privateKey) {
        throw new Error('MISSING_FIREBASE_CREDENTIALS');
      }

      defaultApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    }
  }

  return {
    auth: admin.auth(),
    firestore: admin.firestore()
  };
}
    