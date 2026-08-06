const fs = require('fs');
let content = fs.readFileSync('src/lib/firebase.ts', 'utf8');
content = content.replace('import config from "../../firebase-applet-config.json";\n\nconst firebaseConfig = {\n  apiKey: config.apiKey,\n  authDomain: config.authDomain,\n  projectId: config.projectId,\n  storageBucket: config.storageBucket,\n  messagingSenderId: config.messagingSenderId,\n  appId: config.appId\n};', 
`const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};`);
content = content.replace('export const db = getFirestore(app, config.firestoreDatabaseId);', 'export const db = getFirestore(app);');
fs.writeFileSync('src/lib/firebase.ts', content);
