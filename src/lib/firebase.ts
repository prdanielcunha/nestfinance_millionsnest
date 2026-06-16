import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
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

// Analytics is purposely NOT initialized or called automatically.
// App Check is purposely NOT initialized or enforced here.
