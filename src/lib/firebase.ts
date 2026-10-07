import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken as readAppCheckToken, type AppCheck } from 'firebase/app-check';

export const firebaseConfig = {
  apiKey: "AIzaSyDD2sE4WXDh6yAjXQIIdVZPUq1oSGN1d_s",
  authDomain: "millionsnest.firebaseapp.com",
  projectId: "millionsnest",
  storageBucket: "millionsnest.firebasestorage.app",
  messagingSenderId: "555464791734",
  appId: "1:555464791734:web:fb94f38b1a61e0ef767817",
  measurementId: "G-CC81L5JMKW"
};

// Singleton initialization
export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Typed exports
export const firebaseAuth = getAuth(firebaseApp);
export const firestoreDb = getFirestore(firebaseApp);
export const firebaseStorage = getStorage(firebaseApp);

const DEFAULT_APPCHECK_SITE_KEY = '6LcpY-EtAAAAAElqBbIL_K7nAkm2wpuF6fbhsggG';
let nestAiAppCheck: AppCheck | null = null;

export async function getNestFinanceAppCheckToken(): Promise<string> {
  const siteKey = String(import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY || DEFAULT_APPCHECK_SITE_KEY).trim();
  if (!siteKey) throw new Error('NESTFINANCE_APPCHECK_NOT_CONFIGURED');
  if (!nestAiAppCheck) {
    nestAiAppCheck = initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
  return (await readAppCheckToken(nestAiAppCheck, false)).token;
}

// Analytics remains intentionally opt-in. App Check is initialized lazily only
// when an AI request needs a NestAI identity token.
