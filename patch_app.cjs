const fs = require('fs');

let appCode = fs.readFileSync('src/App.tsx', 'utf8');

// Replace the basic useEffect for user with one that also fetches settings
const newAuthEffect = `
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const { doc, getDoc } = await import('firebase/firestore');
          const { db } = await import('./lib/firebase');
          const { NativeBridge } = await import('./services/nativeBridge');
          
          const docRef = doc(db, 'users', u.uid, 'settings', 'preferences');
          const snap = await getDoc(docRef);
          if (snap.exists() && snap.data().gemini_api_key) {
            NativeBridge.setApiKey(snap.data().gemini_api_key);
          } else {
            setShowSettingsModal(true);
          }
        } catch(e) {
          console.error(e);
        }
      }
      setAuthLoading(false);
    });
    return unsub;
  }, []);
`;

appCode = appCode.replace(/const \[user, setUser\] = useState<any>\(null\);[\s\S]*?\}, \[\]\);/m, newAuthEffect.trim());

// Fix onApiKeySaved
appCode = appCode.replace(/onApiKeySaved=\{\(\) => \{\s*\/\/\s*Settings saved logic\s*\}\}/m, `onApiKeySaved={(key) => {
                import('./services/nativeBridge').then(m => m.NativeBridge.setApiKey(key));
              }}`);

fs.writeFileSync('src/App.tsx', appCode);
