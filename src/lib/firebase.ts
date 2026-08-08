import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";
// @ts-ignore
import config from "../../firebase-applet-config.json";

const env = (import.meta as any).env || {};

const defaultApiKey = "AIzaSyDummyKeyForDevelopment1234567";

const rawApiKey = (env.VITE_FIREBASE_API_KEY || config.apiKey || "").trim();
const rawAuthDomain = (env.VITE_FIREBASE_AUTH_DOMAIN || config.authDomain || "").trim();
const rawProjectId = (env.VITE_FIREBASE_PROJECT_ID || config.projectId || "").trim();

const firebaseConfig = {
  apiKey: rawApiKey || defaultApiKey,
  authDomain: rawAuthDomain || "venom-app.firebaseapp.com",
  projectId: rawProjectId || "venom-app",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || config.storageBucket || "venom-app.appspot.com",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || config.messagingSenderId || "100000000000",
  appId: env.VITE_FIREBASE_APP_ID || config.appId || "1:100000000000:web:abcdef123456"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, config.firestoreDatabaseId || "(default)");
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  if (!rawApiKey) {
    console.log("Firebase API key not set. Local offline broadcast channel fallback active.");
    return;
  }
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    console.log("Firestore connection validated successfully.");
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

