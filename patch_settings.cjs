const fs = require('fs');

let code = fs.readFileSync('src/components/SettingsModal.tsx', 'utf8');

// Add user prop and db imports
code = code.replace(
  'import { NativeBridge } from "../services/nativeBridge";',
  'import { NativeBridge } from "../services/nativeBridge";\nimport { db } from "../lib/firebase";\nimport { doc, getDoc, setDoc } from "firebase/firestore";\nimport { Loader2 } from "lucide-react";'
);

code = code.replace(
  'interface SettingsModalProps {\n  onClose: () => void;\n}',
  'interface SettingsModalProps {\n  user: any;\n  onClose: () => void;\n}'
);

code = code.replace(
  'export default function SettingsModal({ onClose }: SettingsModalProps) {',
  'export default function SettingsModal({ user, onClose }: SettingsModalProps) {'
);

// Add loading state
code = code.replace(
  'const [apiKey, setApiKey] = useState("");',
  'const [apiKey, setApiKey] = useState("");\n  const [loading, setLoading] = useState(true);'
);

// Update useEffect to fetch from Firestore
code = code.replace(
  '  useEffect(() => {\n    setApiKey(NativeBridge.getApiKey());\n    setSelectedVoice(NativeBridge.getVoiceName());\n    setWakeWordEnabled(NativeBridge.isWakeWordEnabled());\n    setClapWakeEnabled(NativeBridge.isClapWakeEnabled());\n    NativeBridge.getBatteryStatus().then((info) => setBatteryInfo(info));\n  }, []);',
  `  useEffect(() => {
    const init = async () => {
      setSelectedVoice(NativeBridge.getVoiceName());
      setWakeWordEnabled(NativeBridge.isWakeWordEnabled());
      setClapWakeEnabled(NativeBridge.isClapWakeEnabled());
      NativeBridge.getBatteryStatus().then((info) => setBatteryInfo(info));
      
      try {
        if (user) {
          const docRef = doc(db, 'users', user.uid, 'settings', 'preferences');
          const snap = await getDoc(docRef);
          if (snap.exists() && snap.data().gemini_api_key) {
            setApiKey(snap.data().gemini_api_key);
            NativeBridge.setApiKey(snap.data().gemini_api_key);
          } else {
            setApiKey(NativeBridge.getApiKey());
          }
        } else {
          setApiKey(NativeBridge.getApiKey());
        }
      } catch(err) {
        setApiKey(NativeBridge.getApiKey());
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [user]);`
);

// Update handleSaveKey
code = code.replace(
  '  const handleSaveKey = () => {\n    NativeBridge.setApiKey(apiKey);\n    setSavedKeySuccess(true);\n    setTimeout(() => setSavedKeySuccess(false), 2000);\n  };',
  `  const handleSaveKey = async () => {
    NativeBridge.setApiKey(apiKey);
    
    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid, 'settings', 'preferences'), {
          gemini_api_key: apiKey
        }, { merge: true });
      } catch (err) {
        console.error("Failed to save to cloud", err);
      }
    }
    
    setSavedKeySuccess(true);
    setTimeout(() => setSavedKeySuccess(false), 2000);
  };`
);

fs.writeFileSync('src/components/SettingsModal.tsx', code);
