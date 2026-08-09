import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";
// @ts-ignore

const env = (import.meta as any).env || {};

const defaultApiKey = "AIzaSyDummyKeyForDevelopment1234567";

const rawApiKey = (env.VITE_FIREBASE_API_KEY || "").trim();
const rawAuthDomain = (env.VITE_FIREBASE_AUTH_DOMAIN || "").trim();
const rawProjectId = (env.VITE_FIREBASE_PROJECT_ID || "").trim();

// Firebase optional hai — VITE_FIREBASE_* env vars configure karein to hi active
export const firebaseEnabled = Boolean(rawApiKey && rawProjectId);

const firebaseConfig = {
  apiKey: rawApiKey || defaultApiKey,
  authDomain: rawAuthDomain || "venom-app.firebaseapp.com",
  projectId: rawProjectId || "venom-app",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "venom-app.appspot.com",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "100000000000",
  appId: env.VITE_FIREBASE_APP_ID || "1:100000000000:web:abcdef123456"
};

export const app: any = firebaseEnabled ? initializeApp(firebaseConfig) : null;
export const auth: any = firebaseEnabled && app ? getAuth(app) : null;
export const db: any = firebaseEnabled && app ? getFirestore(app) : null;
export const googleProvider: any = firebaseEnabled && app ? new GoogleAuthProvider() : null;

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

