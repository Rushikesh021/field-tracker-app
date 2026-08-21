import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: "AIzaSyBn6Cvn7-T8g2wOcnBL1GRtC4hLJMQHGN4",
  authDomain: "field-traker.firebaseapp.com",
  projectId: "field-traker",
  storageBucket: "field-traker.firebasestorage.app",
  messagingSenderId: "328644306481",
  appId: "1:328644306481:web:3772f011ebe9b1534b5710"
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('Error setting browserLocalPersistence on Auth:', err);
});

let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch {
  firestoreDb = getFirestore(app);
}

export const db = firestoreDb;
