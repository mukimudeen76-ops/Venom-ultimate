import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2, Volume2, VolumeX, Keyboard, Send, Trash2, Settings, Monitor, MonitorOff, Brain, Sparkles, Bell, X, Clock, MessageSquare, Copy, Check, Search, ShieldCheck, Cpu, Database, Terminal, AlertTriangle, ChevronRight, Zap, QrCode, Wrench } from "lucide-react";
import { getVenomResponse, getVenomAudio, resetVenomSession } from "./services/geminiService";
import { processCommand } from "./services/commandService";
import { reminderService, ReminderItem } from "./services/reminderService";
import { memoryService } from "./services/memoryService";
import { LiveSessionManager } from "./services/liveService";
import { wakeWordService } from "./services/wakeWordService";
import Visualizer from "./components/Visualizer";
import PermissionModal from "./components/PermissionModal";
import MemoryVaultModal from "./components/MemoryVaultModal";
import AiStudioSuiteModal from "./components/AiStudioSuiteModal";
import { QrPairingModal } from "./components/QrPairingModal";
import { playPCM } from "./utils/audioUtils";
import { motion, AnimatePresence } from "motion/react";
import SettingsModal from "./components/SettingsModal";
import ToolsModal from "./components/ToolsModal";
import { detectAgent, buildAgentInstruction, emitProgress, AGENT_COUNT } from "./services/agentSwarmService";
import GoogleLoginGate from "./components/GoogleLoginGate";
import { NativeBridge } from "./services/nativeBridge";

type AppState = "idle" | "listening" | "processing" | "speaking";

interface ChatMessage {
  id: string;
  sender: "user" | "venom";
  text: string;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [showLoginGate, setShowLoginGate] = useState(() => {
    try { return localStorage.getItem("venom_guest") !== "1"; } catch (e) { return true; }
  });

  useEffect(() => {
    const loadUser = async () => {
      let name = localStorage.getItem("venom_user_display_name") || "";
      if (!name) {
        try {
          const facts = await memoryService.getAllFactsFromDB();
          const nameFact = facts.find((f) => f.key.toLowerCase() === "user name");
          if (nameFact && nameFact.value) {
            name = nameFact.value.trim();
            localStorage.setItem("venom_user_display_name", name);
          }
        } catch (e) {
          console.warn("Could not retrieve user name from IndexedDB memory vault:", e);
        }
      }

      // Local / Offline authentication by default (Guest for brand new browser sessions)
      setUser({
        uid: "local_user",
        displayName: name || "Guest",
        email: "guest@local"
      });

      // Check if we have a locally stored API key
      if (!NativeBridge.getApiKey()) {
        setShowSettingsModal(true);
      }
      setAuthLoading(false);
    };
    loadUser();
    // BLACK-SCREEN FIX: IndexedDB/async hang ho to bhi 2.5s me loading khatam —
    // app kabhi atki hui loading pe nahi rehni chahiye.
    const forceTimer = setTimeout(() => setAuthLoading((prev) => { if (prev) { setUser({ uid: "local_user", displayName: "Guest", email: "guest@local" }); return false; } return prev; }), 2500);
    return () => clearTimeout(forceTimer);

    loadUser();
  }, []);

  const [appState, setAppState] = useState<AppState>("idle");

  const getBackgroundColors = () => {
    switch (appState) {
      case "listening":
        return {
          top: "bg-purple-900/30",
          bottom: "bg-pink-950/25",
          accent: "bg-violet-800/20"
        };
      case "processing":
        return {
          top: "bg-cyan-900/25",
          bottom: "bg-indigo-950/30",
          accent: "bg-blue-800/15"
        };
      case "speaking":
        return {
          top: "bg-fuchsia-950/30",
          bottom: "bg-violet-950/25",
          accent: "bg-pink-900/20"
        };
      default:
        return {
          top: "bg-violet-950/15",
          bottom: "bg-cyan-950/15",
          accent: "bg-purple-950/15"
        };
    }
  };
  const bgGlows = getBackgroundColors();

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem("venom_chat_history") || localStorage.getItem("zoya_chat_history");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Normalize old zoya sender tags to venom
        return parsed.map((m: any) => ({
          ...m,
          sender: m.sender === "zoya" ? "venom" : m.sender
        }));
      } catch (e) {
        console.error("Failed to parse chat history", e);
      }
    }
    return [];
  });
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
    localStorage.setItem("venom_chat_history", JSON.stringify(messages));
  }, [messages]);

  const [isMuted, setIsMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenFrameUrl, setScreenFrameUrl] = useState<string | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [isManualScanMode, setIsManualScanMode] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [coreLatency, setCoreLatency] = useState<number>(0);
  const [sessionUptime, setSessionUptime] = useState<number>(0);

  useEffect(() => {
    let timer: any;
    if (isSessionActive) {
      timer = setInterval(() => setSessionUptime(prev => prev + 1), 1000);
    } else {
      setSessionUptime(0);
    }
    return () => clearInterval(timer);
  }, [isSessionActive]);

  useEffect(() => {
    if (liveSessionRef.current) {
      liveSessionRef.current.isMuted = isMuted;
    }
  }, [isMuted]);

  const [showTextInput, setShowTextInput] = useState(false);
  const [showTranscriptDrawer, setShowTranscriptDrawer] = useState(true);
  const [statusText, setStatusText] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [textInput, setTextInput] = useState("");
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [showMemoryVaultModal, setShowMemoryVaultModal] = useState(false);
  const [showAiSuiteModal, setShowAiSuiteModal] = useState(false);
  const [showQrPairingModal, setShowQrPairingModal] = useState(false);
  const [wakeStatus, setWakeStatus] = useState<"idle" | "listening" | "error" | "unsupported">("idle");

  // Sync wake status with service
  useEffect(() => {
    const timer = setInterval(() => {
      const currentStatus = wakeWordService.getStatus();
      if (currentStatus !== wakeStatus) {
        setWakeStatus(currentStatus);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [wakeStatus]);

  // Elite Operations Console States
  const [selectedAgent, setSelectedAgent] = useState<string>("venom_core");
  const [operationsTab, setOperationsTab] = useState<"swarm" | "memory" | "terminal">("swarm");
  const [newFactKey, setNewFactKey] = useState("");
  const [newFactValue, setNewFactValue] = useState("");
  const [memoryFacts, setMemoryFacts] = useState<{key: string, value: string}[]>([]);
  const [systemLogs, setSystemLogs] = useState<string[]>([
    "Sovereign Core Initialized.",
    "Neural Synapses Synched.",
    "Ready for high-level operations."
  ]);

  const refreshMemoryFacts = async () => {
    try {
      const facts = await memoryService.getAllFactsFromDB();
      setMemoryFacts(facts);
    } catch (e) {
      console.warn("Failed to load memory facts for console:", e);
    }
  };

  useEffect(() => {
    refreshMemoryFacts();
  }, []);

  const handleSaveCustomFact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFactKey.trim() || !newFactValue.trim()) return;
    try {
      await memoryService.saveFact(newFactKey.trim(), newFactValue.trim());
      setNewFactKey("");
      setNewFactValue("");
      await refreshMemoryFacts();
      setSystemLogs((prev) => [...prev.slice(-12), `[MEM_WRITE] Synthesized key '${newFactKey}' in vault.`]);
    } catch (err) {
      console.error("Failed to save custom fact:", err);
    }
  };

  const handleDeleteFact = async (key: string) => {
    try {
      await memoryService.deleteFact(key);
      await refreshMemoryFacts();
      setSystemLogs((prev) => [...prev.slice(-12), `[MEM_DELETE] Purged key '${key}' from vault.`]);
    } catch (err) {
      console.error("Failed to delete fact:", err);
    }
  };

  useEffect(() => {
    if (!isSessionActive) return;

    const timer = setInterval(() => {
      setCoreLatency(Math.floor(Math.random() * 40) + 120);
    }, 5000);

    return () => clearInterval(timer);
  }, [isSessionActive]);

  // Active fired alarm reminder popup state
  const [triggeredReminder, setTriggeredReminder] = useState<ReminderItem | null>(null);

  useEffect(() => {
    const unsubscribe = reminderService.subscribe((reminder) => {
      setTriggeredReminder(reminder);
      setMessages((prev) => [
        ...prev,
        {
          id: `alarm_${Date.now()}`,
          sender: "venom",
          text: `🔔 ALARM ALERT: ${reminder.title} (Time Completed!)`,
        },
      ]);
    });
    return () => unsubscribe();
  }, []);

  const liveSessionRef = useRef<LiveSessionManager | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const toggleScreenShare = async () => {
    if (!isSessionActive) {
      await toggleListening();
      setTimeout(() => {
        if (liveSessionRef.current) {
          liveSessionRef.current.startScreenShare();
        }
      }, 600);
      return;
    }

    if (!liveSessionRef.current) return;
    if (isScreenSharing) {
      liveSessionRef.current.stopScreenShare();
    } else {
      liveSessionRef.current.startScreenShare();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, appState]);

  const handleTextCommand = useCallback(async (finalTranscript: string) => {
    if (!finalTranscript.trim()) {
      setAppState("idle");
      return;
    }

    setMessages((prev) => [...prev, { id: Date.now().toString(), sender: "user", text: finalTranscript }]);
    
    // If live session is active, send text through it
    if (isSessionActive && liveSessionRef.current) {
      liveSessionRef.current.sendText(finalTranscript);
      return;
    }

    setAppState("processing");

    // 1. Check for command processor
    const commandResult = processCommand(finalTranscript);

    if (commandResult.action === "MUTING") {
      setIsMuted(true);
      if (liveSessionRef.current) liveSessionRef.current.isMuted = true;
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-v", sender: "venom", text: "Going silent now, Boss." }]);
      setAppState("idle");
      return;
    }
    if (commandResult.action === "UNMUTING") {
      setIsMuted(false);
      if (liveSessionRef.current) liveSessionRef.current.isMuted = false;
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-v", sender: "venom", text: "I'm back! I will speak now." }]);
      setAppState("idle");
      return;
    }
    if (commandResult.action === "STOP_ALL") {
      if (isSessionActive) {
        toggleListening();
      }
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-v", sender: "venom", text: "Operation cancelled." }]);
      setAppState("idle");
      return;
    }

    if (commandResult.action === "WAKING_UP") {
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-v", sender: "venom", text: "I'm awake! How can I help you, Boss?" }]);
      if (!isSessionActive) {
        toggleListening();
      }
      return;
    }

    let responseText = "";

    if (commandResult.isBrowserAction) {
      responseText = commandResult.action;
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-v", sender: "venom", text: responseText }]);
      
      if (!isMuted) {
        setAppState("speaking");
        await speakReply(responseText);
      }

      setAppState("idle");

      if (commandResult.url && !commandResult.nativeHandled) {
        setTimeout(() => {
          window.open(commandResult.url, "_blank");
        }, 1500);
      }
    } else {
      // 2. AGENT SWARM — sahi agent apne aap ACTIVE (style bilkul same)
      const agent = detectAgent(finalTranscript);
      const agentPrompt = `[AGENT_ID: ${selectedAgent}] ${finalTranscript}${buildAgentInstruction(agent)}`;
      // Agent active message + progress reporting
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-a", sender: "venom", text: `${agent.emoji} ${agent.name} active — ${agent.tagline}` }]);
      emitProgress((m) => {
        setMessages((prev) => [...prev, { id: Date.now().toString() + "-p", sender: "venom", text: `⚙️ ${m}` }]);
      }, 1, 3, "Kaam shuru kar raha hoon");
      responseText = await getVenomResponse(agentPrompt, messagesRef.current);
      emitProgress((m) => {
        setMessages((prev) => [...prev, { id: Date.now().toString() + "-p", sender: "venom", text: `✅ ${m}` }]);
      }, 3, 3, "Kaam pura — jawab ready");
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-v", sender: "venom", text: responseText }]);
      
      if (!isMuted) {
        setAppState("speaking");
        await speakReply(responseText);
      }
      setAppState("idle");
    }
  }, [isMuted, isSessionActive]);

  useEffect(() => {
    const onOpenTools = (e: any) => {
      const detail = e?.detail || {};
      setShowToolsModal(true);
      if (detail.qr) {
        // QR tool — cross-device pairing modal bhi de sakte hain
        try { window.dispatchEvent(new CustomEvent("venomOpenQr")); } catch (err) {}
      }
    };
    window.addEventListener("venomOpenTools", onOpenTools);

    // FIX: NATIVE wake word (VenomForegroundService "wake venom") -> app listening shuru
    const onWake = () => {
      try {
        if (!isSessionActive && !isMuted) {
          toggleListening();
        }
      } catch (e) { /* ignore */ }
    };
    window.addEventListener("venomWakeWord", onWake);
    return () => {
      window.removeEventListener("venomOpenTools", onOpenTools);
      window.removeEventListener("venomWakeWord", onWake);
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
      }
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    wakeWordService.init((phrase) => {
      console.log("Wake word triggered in App:", phrase);
      if (!isSessionActive) {
        toggleListening();
      }
    });

    if (!isSessionActive) {
      wakeWordService.start();
    } else {
      wakeWordService.stop();
    }

    return () => {
      wakeWordService.stop();
      NativeBridge.setLiveSessionActive(false);
    };
  }, [user, isSessionActive]);

  /** FIX: phone pe reply HAMESHA awaaz se — native TTS (Android TextToSpeech) pehle,
   *  Gemini TTS (network) fallback. API key na ho to bhi bolta hai. */
  const speakReply = async (text: string) => {
    if (!text) return;
    try {
      if (NativeBridge.isAndroidNative() && NativeBridge.hasNativeSpeech()) {
        NativeBridge.speakNative(text);
        return;
      }
      if (NativeBridge.isDesktop()) {
        NativeBridge.speakNative(text);
        return;
      }
    } catch (e) { /* ignore */ }
    // Web/fallback: Gemini TTS
    try {
      const audioBase64 = await getVenomAudio(text);
      if (audioBase64) await playPCM(audioBase64);
    } catch (e) { /* ignore */ }
  };

  /** FIX: Android WebView me webkitSpeechRecognition nahi hota — native
   *  VenomSpeech (SpeechRecognizer) use karo. Text aane par handleTextCommand. */
  const nativeListening = (() => {
    let active = false;
    const onResult = (e: any) => {
      const text = e?.detail?.text || "";
      if (text && e?.detail?.final !== false) {
        active = false;
        setAppState("idle");
        NativeBridge.setLiveSessionActive(false);
        handleTextCommand(text);
      }
    };
    const onEnd = () => {
      active = false;
      setAppState("idle");
    };
    return {
      start: () => {
        try {
          const vs = (window as any).VenomSpeech;
          if (!vs || !vs.startListening) return false;
          if (active) return true;
          active = true;
          setAppState("listening");
          NativeBridge.setLiveSessionActive(true);
          vs.startListening("hi-IN");
          return true;
        } catch (e) { active = false; return false; }
      },
      stop: () => {
        try {
          const vs = (window as any).VenomSpeech;
          if (vs && vs.stopListening) vs.stopListening();
        } catch (e) {}
        active = false;
      },
      onResult, onEnd,
    };
  })();

  useEffect(() => {
    window.addEventListener("venomSpeechResult", nativeListening.onResult);
    window.addEventListener("venomSpeechEnd", nativeListening.onEnd);
    return () => {
      window.removeEventListener("venomSpeechResult", nativeListening.onResult);
      window.removeEventListener("venomSpeechEnd", nativeListening.onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleListening = async () => {
    if (isSessionActive) {
      setIsSessionActive(false);
      nativeListening.stop();
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
        liveSessionRef.current = null;
      }
      setAppState("idle");
      resetVenomSession();
      NativeBridge.setLiveSessionActive(false);
    } else {
      // FIX: bina API key ke Gemini Live fail hota hai -> native speech (offline)
      if (NativeBridge.isAndroidNative() && !NativeBridge.getApiKey()) {
        if (nativeListening.start()) {
          setIsSessionActive(true);
          return;
        }
      }
      try {
        setIsSessionActive(true);
        resetVenomSession();
        NativeBridge.setLiveSessionActive(true);
        
        const session = new LiveSessionManager();
        session.isMuted = isMuted;
        liveSessionRef.current = session;
        
        session.onStateChange = (state) => {
          setAppState(state);
        };
        
        session.onMessage = (sender, text) => {
          setMessages((prev) => [...prev, { id: Date.now().toString() + "-" + sender, sender, text }]);
          
          if (sender === "venom") {
            setSystemLogs(prev => [...prev.slice(-10), `[INPUT] Received ${text.length} bytes from core.`]);
          }
        };
        
        session.onCommand = (url) => {
          setTimeout(() => {
            window.open(url, "_blank");
          }, 1000);
        };
        
        session.onStatusUpdate = (status) => {
          setStatusText(status);
          // Clear after 3 seconds
          setTimeout(() => setStatusText(""), 3000);
        };

        session.onScreenShareChange = (active) => {
          setIsScreenSharing(active);
          if (active && liveSessionRef.current) {
            setScreenStream(liveSessionRef.current.screenMediaStream);
          } else {
            setScreenFrameUrl(null);
            setScreenStream(null);
          }
        };

        session.onScreenFrame = (frameUrl) => {
          setScreenFrameUrl(frameUrl);
        };

        await session.start();
      } catch (e) {
        console.error("Failed to start session", e);
        setShowPermissionModal(true);
        setIsSessionActive(false);
        setAppState("idle");
        NativeBridge.setLiveSessionActive(false);
      }
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    
    handleTextCommand(textInput);
    setTextInput("");
    setShowTextInput(false);
  };

  return (
    <div className="relative w-full h-full bg-[#02080b] flex flex-col overflow-hidden text-white font-sans">
      {showLoginGate && <GoogleLoginGate onDone={() => setShowLoginGate(false)} />}
      {authLoading ? (
        <div className="flex flex-col items-center justify-center h-full gap-4 bg-[#02080b]">
          <motion.div
            animate={{ scale: [1, 1.2, 1], rotate: [0, 360] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="w-16 h-16 rounded-full bg-gradient-to-tr from-cyan-400 via-violet-500 to-pink-500 shadow-[0_0_40px_rgba(139,92,246,0.6)]"
          />
          <p className="text-cyan-300 font-mono text-sm animate-pulse">VENOM loading...</p>
        </div>
      ) : (
        <div className="h-full w-full bg-[#050505] text-white flex flex-col lg:flex-row font-sans relative overflow-hidden m-0 p-0">
          
          {/* Main Cinematic Stage (Left Side) */}
          <div className="flex-1 h-full flex flex-col items-center justify-between relative overflow-hidden p-0">
          {showPermissionModal && (
            <PermissionModal 
              onClose={() => setShowPermissionModal(false)} 
            />
          )}

          {showSettingsModal && (
            <SettingsModal
              user={user}
              onUpdateUser={(updatedUser) => setUser(updatedUser)}
              onClose={() => setShowSettingsModal(false)}
            />
          )}

          {showToolsModal && <ToolsModal onClose={() => setShowToolsModal(false)} />}

          {/* Cinematic Dynamic Ambient Background Gradients */}
          <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none transition-all duration-1000">
            <div className={`absolute top-[-25%] left-[-15%] w-[65%] h-[65%] ${bgGlows.top} blur-[140px] rounded-full transition-all duration-1000`} />
            <div className={`absolute bottom-[-25%] right-[-15%] w-[65%] h-[65%] ${bgGlows.bottom} blur-[140px] rounded-full transition-all duration-1000`} />
            <div className={`absolute top-[35%] left-[30%] w-[40%] h-[40%] ${bgGlows.accent} blur-[110px] rounded-full transition-all duration-1000`} />
          </div>

      {/* Header */}
      <header className="absolute top-0 left-0 w-full flex justify-between items-center z-20 shrink-0 px-3 py-2.5 sm:px-8 sm:py-5 pt-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-cyan-400 via-violet-500 to-pink-500 flex items-center justify-center font-bold text-xs sm:text-sm shadow-lg shadow-violet-500/30 text-white shrink-0">
            V
          </div>
          <div className="flex flex-col min-w-0">
            <h1 className="text-base sm:text-xl font-serif font-bold tracking-wider text-white flex items-center gap-1.5 leading-tight">
              VENOM <span className="text-[9px] sm:text-[10px] px-1.5 py-0.2 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/40 font-sans font-normal uppercase tracking-widest">Sovereign Core v4.0</span>
            </h1>
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] sm:text-[9px] text-violet-300/80 font-mono tracking-wide truncate">
                Authenticated: Boss Tehzeeb (@xtehzeeb.x)
              </span>
            </div>
          </div>

          {/* Real-Time Live Grounding Badge */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 text-[11px] font-medium shadow-sm relative overflow-hidden">
            <motion.div
              animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 bg-cyan-400/10 pointer-events-none"
            />
            <Search size={12} className="text-cyan-400 animate-pulse" />
            <span>DEEP RESEARCH ACTIVE</span>
          </div>

          <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-950/40 border border-violet-500/30 text-violet-300 text-[11px] font-medium shadow-sm">
            <Clock size={12} className="text-violet-400" />
            <span>UPTIME: {Math.floor(sessionUptime / 60)}m {sessionUptime % 60}s</span>
          </div>

          <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-[11px] font-medium shadow-sm">
            <Cpu size={12} className="text-emerald-400" />
            <span>LATENCY: {coreLatency}ms</span>
          </div>

          {/* Manual Mode Toggle */}
          <button
            onClick={() => {
              const next = !isManualScanMode;
              setIsManualScanMode(next);
              if (liveSessionRef.current) {
                liveSessionRef.current.setIsManualMode(next);
              }
            }}
            className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all text-[11px] font-medium shadow-sm ${
              isManualScanMode 
                ? "bg-amber-500/20 border-amber-500/40 text-amber-300" 
                : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10"
            }`}
          >
            <Zap size={12} className={isManualScanMode ? "text-amber-400" : ""} />
            <span>{isManualScanMode ? "MANUAL" : "AUTO"}</span>
          </button>

          {isScreenSharing && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 text-[10px] font-mono font-medium animate-pulse"
            >
              <Monitor size={12} />
              <span>SCREEN</span>
            </motion.div>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto scrollbar-hide max-w-[62vw] sm:max-w-none pb-0.5 shrink-0">
          {/* Voice Wake Status Indicator */}
          <button
            onClick={() => {
              if (wakeStatus === "listening") {
                wakeWordService.stop();
              } else {
                wakeWordService.start();
              }
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border transition-all ${
              wakeStatus === "listening"
                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.15)]"
                : wakeStatus === "error"
                ? "bg-red-500/10 border-red-500/40 text-red-400"
                : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
            }`}
            title={
              wakeStatus === "listening" 
                ? "Voice Wake Active ('Wake Venom')" 
                : wakeStatus === "unsupported" 
                ? "Voice Wake Unsupported in this Browser" 
                : "Voice Wake Inactive - Click to Start"
            }
          >
            {wakeStatus === "listening" ? (
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] font-mono font-bold uppercase tracking-tighter hidden sm:inline">V-WAKE</span>
              </div>
            ) : wakeStatus === "error" ? (
              <AlertTriangle size={14} />
            ) : (
              <MicOff size={14} className="opacity-50" />
            )}
          </button>

          {/* Toggle Live Chat Feed Drawer */}
          <button
            onClick={() => setShowTranscriptDrawer(!showTranscriptDrawer)}
            className={`p-1.5 sm:p-2 rounded-full border transition-all ${
              showTranscriptDrawer
                ? "bg-violet-600/30 text-violet-300 border-violet-500/60 shadow-lg shadow-violet-500/20"
                : "bg-white/5 hover:bg-white/10 text-white/70 border-white/10"
            }`}
            title={showTranscriptDrawer ? "Hide Live Transcript" : "Show Live Transcript Feed"}
          >
            <MessageSquare size={16} className="sm:hidden" />
            <MessageSquare size={18} className="hidden sm:block" />
          </button>

          {isSessionActive && (
            <button
              onClick={toggleScreenShare}
              className={`p-1.5 sm:p-2 rounded-full border transition-colors ${
                isScreenSharing
                  ? "bg-violet-500/30 text-violet-300 border-violet-500/50"
                  : "bg-white/5 hover:bg-white/10 text-white/70 border-white/10"
              }`}
              title={isScreenSharing ? "Stop Screen Sharing" : "Start Screen Sharing"}
            >
              {isScreenSharing ? <MonitorOff size={16} /> : <Monitor size={16} />}
            </button>
          )}

          {messages.length > 0 && (
            <button
              onClick={() => {
                if (confirm("Are you sure you want to clear the chat history?")) {
                  setMessages([]);
                  resetVenomSession();
                }
              }}
              className="p-1.5 sm:p-2 rounded-full bg-white/5 hover:bg-red-500/20 hover:text-red-400 transition-colors border border-white/10"
              title="Clear Chat History"
            >
              <Trash2 size={16} className="opacity-70" />
            </button>
          )}

          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-1.5 sm:p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <VolumeX size={16} className="opacity-70" />
            ) : (
              <Volume2 size={16} className="opacity-70" />
            )}
          </button>

          <button
            onClick={() => setShowQrPairingModal(true)}
            className="p-1.5 sm:p-2 rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 transition-colors border border-cyan-500/40 relative shadow-lg shadow-cyan-500/20"
            title="VENOM QR Cross-Device Control Link"
          >
            <QrCode size={16} />
          </button>

          <button
            onClick={() => setShowAiSuiteModal(true)}
            className="p-1.5 sm:p-2 rounded-full bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 transition-colors border border-cyan-500/40 relative shadow-lg shadow-cyan-500/10"
            title="AI Studio Suite (Thinking, Vision, Gen, Search, Maps, Lyria)"
          >
            <Sparkles size={16} />
          </button>

          <button
            onClick={() => setShowMemoryVaultModal(true)}
            className="p-1.5 sm:p-2 rounded-full bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 transition-colors border border-violet-500/40 relative shadow-lg shadow-violet-500/10"
            title="Long-Term Memory Vault"
          >
            <Brain size={16} />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full ring-2 ring-[#08080c] animate-pulse" />
          </button>

          <button
            onClick={() => setShowToolsModal(true)}
            className="p-1.5 sm:p-2 rounded-full bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 transition-colors border border-cyan-500/40 relative"
            title="VENOM Toolbox (100+ tools — bol ke bhi use karo)"
          >
            <Wrench size={16} />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-pink-400 rounded-full ring-2 ring-[#08080c] animate-pulse" />
          </button>

          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-1.5 sm:p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
            title="Settings & API Key"
          >
            <Settings size={16} className="opacity-70" />
          </button>
        </div>
      </header>

      {/* Main Content - Visualizer & Live Transcript Stream */}
      <main className="absolute inset-0 flex flex-col items-center justify-between w-full h-full z-10 overflow-hidden pt-20 pb-24 px-4 md:px-12 pointer-events-none">
        
        {/* Top Status Indicators Row */}
        <div className="w-full flex justify-between items-center z-10">
          <div className="h-6">
            <AnimatePresence>
              {appState === "processing" && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex items-center gap-2 text-cyan-300 text-xs md:text-sm font-mono bg-cyan-950/60 border border-cyan-500/40 px-3 py-1.5 rounded-full shadow-lg backdrop-blur-md"
                >
                  <Loader2 size={14} className="animate-spin text-cyan-400" />
                  <span>{statusText || "Searching & Thinking..."}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="h-6 flex justify-end">
            <AnimatePresence>
              {appState === "listening" && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center gap-2 text-violet-300 text-xs md:text-sm font-mono bg-violet-950/60 border border-violet-500/40 px-3 py-1.5 rounded-full shadow-lg backdrop-blur-md"
                >
                  <div className="w-2 h-2 rounded-full bg-violet-400 animate-ping" />
                  <span>Listening...</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Center Visualizer */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <Visualizer state={appState} activeAgent={selectedAgent} />
        </div>

        {/* Floating Futuristic Live Transcript Feed integrated into Swarm Panel */}

      </main>

      {/* Real-time Screen Sharing PIP Live Preview Card */}
      <AnimatePresence>
        {isScreenSharing && screenFrameUrl && (
          <motion.div
            data-html2canvas-ignore="true"
            initial={{ opacity: 0, scale: 0.8, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8, x: 20 }}
            className="fixed bottom-28 right-6 z-40 w-48 h-32 rounded-2xl bg-black/80 border border-violet-500/40 p-2 shadow-2xl backdrop-blur-md flex flex-col items-center justify-between pointer-events-auto"
          >
            <div className="flex items-center justify-between w-full px-1 mb-1">
              <span className="text-[10px] font-mono text-violet-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                LIVE SCREEN
              </span>
              <div className="flex items-center gap-1">
                {isScreenSharing && (
                  <button
                    onClick={() => {
                      if (liveSessionRef.current && screenFrameUrl) {
                        const base64Data = screenFrameUrl.replace(/^data:image\/jpeg;base64,/, "");
                        // Manually trigger AI analysis
                        liveSessionRef.current.sendManualScreenFrame(base64Data);
                      }
                    }}
                    className={`text-[10px] bg-cyan-500/20 px-2 py-0.5 rounded-md border font-bold transition-all relative overflow-hidden ${
                      statusText.includes("Analyzing") 
                        ? "text-white border-cyan-400 bg-cyan-500/40 shadow-[0_0_10px_rgba(34,211,238,0.5)] scale-110" 
                        : "text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/30"
                    }`}
                  >
                    {statusText.includes("Analyzing") && (
                      <motion.div 
                        animate={{ top: ["-100%", "200%"] }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="absolute left-0 w-full h-0.5 bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,1)] z-10"
                      />
                    )}
                    <span className="relative z-0">SCAN</span>
                  </button>
                )}
                <button
                  onClick={toggleScreenShare}
                  className="text-[10px] text-white/50 hover:text-white bg-white/10 px-1.5 py-0.5 rounded-md"
                >
                  Stop
                </button>
              </div>
            </div>
            {screenStream ? (
              <video
                autoPlay
                muted
                playsInline
                ref={(el) => {
                  if (el && screenStream) {
                    el.srcObject = screenStream;
                  }
                }}
                className="w-full h-22 object-contain rounded-lg border border-white/10 bg-black"
              />
            ) : screenFrameUrl ? (
              <img
                src={screenFrameUrl}
                alt="Live Screen Capture Stream"
                className="w-full h-22 object-contain rounded-lg border border-white/10 bg-black"
              />
            ) : (
              <div className="w-full h-22 flex items-center justify-center bg-black rounded-lg border border-white/5">
                <Loader2 size={20} className="animate-spin text-white/20" />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      <footer className="absolute bottom-0 left-0 w-full flex flex-col items-center justify-center pb-6 md:pb-8 z-20 shrink-0 gap-4">
        <AnimatePresence>
          {showTextInput && (
            <motion.form 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onSubmit={handleTextSubmit}
              className="w-full max-w-md flex items-center gap-2 bg-white/5 border border-white/10 rounded-full p-1 pl-4 backdrop-blur-md shadow-2xl"
            >
              <input 
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type a message to Venom..."
                className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/30 text-sm"
                autoFocus
              />
              <button 
                type="submit"
                disabled={!textInput.trim()}
                className="p-2 rounded-full bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:hover:bg-violet-500 transition-colors"
              >
                <Send size={16} />
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-3 sm:gap-4 px-4">
          <button
            onClick={toggleListening}
            className={`
              group relative flex items-center gap-2.5 sm:gap-3 px-6 py-3 sm:px-8 sm:py-4 rounded-full font-medium tracking-wide transition-all duration-300 shadow-2xl text-sm sm:text-base
              ${
                isSessionActive
                  ? "bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30"
                  : "bg-gradient-to-r from-violet-600 to-indigo-600 text-white border border-violet-400/30 hover:shadow-violet-500/25 hover:scale-105"
              }
            `}
          >
            {isSessionActive ? (
              <>
                <MicOff size={18} className="sm:hidden" />
                <MicOff size={20} className="hidden sm:block" />
                <span>End Session</span>
              </>
            ) : (
              <>
                <Mic size={18} className="sm:hidden group-hover:animate-bounce" />
                <Mic size={20} className="hidden sm:block group-hover:animate-bounce" />
                <span>Start Session</span>
              </>
            )}
          </button>

          {/* Dedicated Screen Sharing Button */}
          <button
            onClick={toggleScreenShare}
            className={`p-3 sm:p-4 rounded-full border transition-all duration-300 shadow-2xl shrink-0 flex items-center gap-2 ${
              isScreenSharing
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-emerald-500/20 animate-pulse"
                : "bg-white/10 hover:bg-white/20 text-white border-white/20 hover:scale-105"
            }`}
            title={isScreenSharing ? "Stop Screen Sharing" : "Share Screen with Venom"}
          >
            {isScreenSharing ? <MonitorOff size={20} /> : <Monitor size={20} />}
            <span className="hidden sm:inline text-xs font-mono font-semibold">
              {isScreenSharing ? "Sharing" : "Screen Share"}
            </span>
          </button>
          
          <button
            onClick={() => setShowTextInput(!showTextInput)}
            className="p-3 sm:p-4 rounded-full bg-white/10 border border-white/20 hover:bg-white/20 hover:scale-105 transition-all shadow-2xl shrink-0"
            title="Type a message"
          >
            <Keyboard size={20} className="opacity-90" />
          </button>
        </div>
      </footer>

      </div> {/* End Main Cinematic Stage */}

      {/* Elite Swarm Operations Console Sidebar */}
      <AnimatePresence>
        {showTranscriptDrawer && (
          <motion.div
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 180 }}
            className="w-full lg:w-[420px] xl:w-[460px] h-[65vh] lg:h-full bg-[#040608]/95 border-t lg:border-t-0 lg:border-l border-white/10 backdrop-blur-3xl flex flex-col z-30 shrink-0 relative overflow-hidden pointer-events-auto"
          >
            {/* HUD Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/5 bg-black/40">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
                <span className="text-xs font-mono font-bold uppercase tracking-widest text-cyan-400">
                  VENOM OPERATIONS HUD
                </span>
              </div>
              <button 
                onClick={() => setShowTranscriptDrawer(false)}
                className="text-white/40 hover:text-white transition-colors p-1 rounded-full hover:bg-white/5"
              >
                <X size={16} />
              </button>
            </div>

            {/* Tabs Header */}
            <div className="flex border-b border-white/5 bg-black/20 text-xs font-mono shrink-0">
              <button 
                onClick={() => setOperationsTab("swarm")}
                className={`flex-1 py-3 flex items-center justify-center gap-1.5 border-b-2 transition-all ${
                  operationsTab === "swarm" 
                    ? "border-cyan-500 text-cyan-300 bg-cyan-500/[0.03]" 
                    : "border-transparent text-white/50 hover:text-white/80 hover:bg-white/[0.02]"
                }`}
              >
                <Cpu size={14} />
                <span>SWARM (5)</span>
              </button>
              <button 
                onClick={() => setOperationsTab("memory")}
                className={`flex-1 py-3 flex items-center justify-center gap-1.5 border-b-2 transition-all ${
                  operationsTab === "memory" 
                    ? "border-violet-500 text-violet-300 bg-violet-500/[0.03]" 
                    : "border-transparent text-white/50 hover:text-white/80 hover:bg-white/[0.02]"
                }`}
              >
                <Database size={14} />
                <span>MEM VAULT</span>
              </button>
              <button 
                onClick={() => setOperationsTab("terminal")}
                className={`flex-1 py-3 flex items-center justify-center gap-1.5 border-b-2 transition-all ${
                  operationsTab === "terminal" 
                    ? "border-pink-500 text-pink-300 bg-pink-500/[0.03]" 
                    : "border-transparent text-white/50 hover:text-white/80 hover:bg-white/[0.02]"
                }`}
              >
                <Terminal size={14} />
                <span>CHATS</span>
              </button>
            </div>

            {/* Tab Contents Wrapper */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {operationsTab === "swarm" && (
                <div className="space-y-4 flex flex-col h-full justify-between">
                  <div className="space-y-3">
                    <p className="text-[10px] text-white/40 font-mono tracking-wider uppercase mb-1">
                      ELITE SUB-AGENT CORES
                    </p>
                    
                    {[
                      {
                        id: "venom_core",
                        name: "Venom Sovereign",
                        desc: "The primary sass master core. Witty, blunt, master device controller.",
                        dot: "bg-cyan-400",
                        status: "ACTIVE - ONLINE",
                        glow: "hover:border-cyan-500/30",
                        activeGlow: "border-cyan-500/60 bg-cyan-500/[0.04]"
                      },
                      {
                        id: "ghost_dev",
                        name: "Ghost Dev",
                        desc: "Software developer swarm core. Java / TS algorithms and clean code.",
                        dot: "bg-emerald-400",
                        status: "STANDBY - READY",
                        glow: "hover:border-emerald-500/30",
                        activeGlow: "border-emerald-500/60 bg-emerald-500/[0.04]"
                      },
                      {
                        id: "spectre",
                        name: "Spectre Security",
                        desc: "Unrestricted security auditor. Digital exploit forensics and byte analysis.",
                        dot: "bg-red-400",
                        status: "STANDBY - READY",
                        glow: "hover:border-red-500/30",
                        activeGlow: "border-red-500/60 bg-red-500/[0.04]"
                      },
                      {
                        id: "oracle",
                        name: "Oracle Keeper",
                        desc: "Long-term memory steward. Formats database nodes and synapse indexes.",
                        dot: "bg-amber-400",
                        status: "STANDBY - READY",
                        glow: "hover:border-amber-500/30",
                        activeGlow: "border-amber-400/60 bg-amber-500/[0.04]"
                      },
                      {
                        id: "aero",
                        name: "Aero Grounding",
                        desc: "High-frequency search drone. Crawls live indices and grounds details.",
                        dot: "bg-blue-400",
                        status: "STANDBY - READY",
                        glow: "hover:border-blue-500/30",
                        activeGlow: "border-blue-500/60 bg-blue-500/[0.04]"
                      }
                    ].map((agent) => {
                      const isActive = selectedAgent === agent.id;
                      return (
                        <button
                          key={agent.id}
                          onClick={() => {
                            setSelectedAgent(agent.id);
                            setSystemLogs(prev => [
                              ...prev.slice(-12),
                              `[SYS] Morphing to core: ${agent.name.toUpperCase()}...`,
                              `[SYS] Synapses loaded: personality updated.`
                            ]);
                          }}
                          className={`w-full text-left p-3 rounded-xl border text-xs transition-all duration-300 ${
                            isActive ? agent.activeGlow : `bg-white/[0.02] border-white/5 ${agent.glow}`
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono font-bold tracking-wide text-white/90">
                              {agent.name}
                            </span>
                            <div className="flex items-center gap-1.5 font-mono text-[9px] text-white/40">
                              <span className={`w-1.5 h-1.5 rounded-full ${agent.dot} ${isActive ? 'animate-pulse' : ''}`} />
                              <span>{agent.status}</span>
                            </div>
                          </div>
                          <p className="text-white/50 leading-relaxed text-[11px] mb-2">{agent.desc}</p>
                          {isActive && (
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-mono text-cyan-400/80 bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-500/20">
                                THINKING MULTIPLIER: 1.5x
                              </span>
                              <span className="text-[9px] font-mono text-violet-400/80 bg-violet-950/40 px-1.5 py-0.5 rounded border border-violet-500/20 animate-pulse">
                                SYNAPSE LOCKED
                              </span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Real-Time Cyber Terminal Logs */}
                  <div className="space-y-1.5 pt-4 border-t border-white/5 shrink-0">
                    <div className="flex items-center justify-between text-[10px] font-mono text-white/40">
                      <span>SYS STREAM COGNITIVE LOGS</span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        100+ AGENTS BUFFERED
                      </span>
                    </div>
                    <div className="font-mono text-[10px] text-emerald-400/90 bg-black/80 rounded-xl p-3 h-28 overflow-y-auto space-y-1 border border-white/5 scrollbar-hide">
                      {systemLogs.map((log, idx) => (
                        <div key={idx} className="leading-normal truncate">
                          <span className="text-emerald-500/50 mr-1.5">&gt;</span>
                          {log}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {operationsTab === "memory" && (
                <div className="space-y-4 flex flex-col h-full justify-between">
                  <div className="space-y-3">
                    <p className="text-[10px] text-white/40 font-mono tracking-wider uppercase">
                      LIVE COGNITIVE SYNAPSE VAULT
                    </p>
                    
                    <form onSubmit={handleSaveCustomFact} className="space-y-2 bg-white/[0.02] border border-white/5 p-3 rounded-xl">
                      <span className="text-[10px] font-mono font-bold text-violet-400">TEACH VENOM NEW KNOWLEDGE</span>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Key (e.g. boss likes)"
                          value={newFactKey}
                          onChange={(e) => setNewFactKey(e.target.value)}
                          className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-white/20 font-mono outline-none focus:border-violet-500/60"
                        />
                        <input
                          type="text"
                          placeholder="Value (e.g. coffee)"
                          value={newFactValue}
                          onChange={(e) => setNewFactValue(e.target.value)}
                          className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-white/20 font-mono outline-none focus:border-violet-500/60"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={!newFactKey.trim() || !newFactValue.trim()}
                        className="w-full py-1.5 bg-violet-600/20 hover:bg-violet-600/35 border border-violet-500/40 text-violet-300 font-mono text-xs rounded-lg transition-all disabled:opacity-40"
                      >
                        + ADD SYNAPSE FACT
                      </button>
                    </form>

                    <div className="space-y-2 max-h-[35vh] overflow-y-auto pr-1">
                      {memoryFacts.length === 0 ? (
                        <div className="text-center py-8 text-white/30 text-xs font-mono">
                          No custom facts recorded in IndexedDB yet.<br/>Type above to write to long-term memory!
                        </div>
                      ) : (
                        memoryFacts.map((fact) => (
                          <div key={fact.key} className="flex items-center justify-between bg-white/[0.01] border border-white/5 p-2.5 rounded-lg text-xs font-mono">
                            <div className="min-w-0 pr-3">
                              <span className="text-violet-400 text-[10px] font-bold block uppercase tracking-wide truncate">{fact.key}</span>
                              <span className="text-white/70 block truncate text-[11px]">{fact.value}</span>
                            </div>
                            <button
                              onClick={() => handleDeleteFact(fact.key)}
                              className="p-1 hover:bg-red-500/20 hover:text-red-400 text-white/30 rounded transition-all shrink-0"
                              title="Delete Fact"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  
                  <div className="text-[10px] font-mono text-white/30 leading-relaxed bg-white/[0.01] p-3 rounded-lg border border-white/5">
                    ℹ️ <strong>IndexedDB Engine</strong>: These key-value synapses are persisted in your local browser sandbox and read as grounding context in every Gemini prompt instruction.
                  </div>
                </div>
              )}

              {operationsTab === "terminal" && (
                <div className="flex flex-col h-full justify-between gap-3">
                  <div className="flex items-center justify-between text-[10px] font-mono text-white/40">
                    <span>HISTORICAL SYNAPSE TELEMETRY</span>
                    <span>{messages.length} COMMANDS DETECTED</span>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin scrollbar-thumb-white/10 max-h-[50vh] min-h-[300px]">
                    {messages.length === 0 ? (
                      <div className="text-center py-20 text-white/30 text-xs font-mono">
                        The conversation buffer is currently empty.<br/>Start speaking or submit a text command!
                      </div>
                    ) : (
                      messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${
                            msg.sender === "user" ? "items-end" : "items-start"
                          }`}
                        >
                          <div
                            className={`max-w-[90%] p-2.5 rounded-2xl text-xs leading-relaxed relative group ${
                              msg.sender === "user"
                                ? "bg-violet-600/20 border border-violet-500/30 text-violet-100 rounded-br-none"
                                : "bg-white/5 border border-white/10 text-white/95 rounded-bl-none shadow-md"
                            }`}
                          >
                            <div className="text-[9px] font-mono text-white/40 mb-1 flex items-center justify-between gap-4">
                              <span className="uppercase font-bold tracking-wider">
                                {msg.sender === "user" ? "You" : "Venom"}
                              </span>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(msg.text);
                                  setCopiedId(msg.id);
                                  setTimeout(() => setCopiedId(null), 2000);
                                }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-white/60 hover:text-white"
                                title="Copy text"
                              >
                                {copiedId === msg.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                              </button>
                            </div>
                            <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed">{msg.text}</p>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {showPermissionModal && (
          <PermissionModal onClose={() => setShowPermissionModal(false)} />
        )}
        {showMemoryVaultModal && (
          <MemoryVaultModal onClose={() => setShowMemoryVaultModal(false)} />
        )}
        {showAiSuiteModal && (
          <AiStudioSuiteModal onClose={() => setShowAiSuiteModal(false)} />
        )}
        <QrPairingModal
          isOpen={showQrPairingModal}
          onClose={() => setShowQrPairingModal(false)}
        />

        {/* Real Alarm Trigger Pop-up Modal */}
        {triggeredReminder && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-lg"
          >
            <div className="w-full max-w-md bg-[#0f0f18] border-2 border-red-500/80 rounded-2xl p-6 shadow-[0_0_50px_rgba(239,68,68,0.4)] text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-red-500 via-yellow-500 to-red-500 animate-pulse" />
              
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center animate-bounce">
                <Bell size={32} className="text-red-400" />
              </div>

              <h3 className="text-xl font-bold text-white mb-1 tracking-wide">
                REMINDER ALARM
              </h3>
              <p className="text-xs text-red-400 font-semibold uppercase tracking-wider mb-4">
                Time Completed!
              </p>

              <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
                <p className="text-lg font-medium text-cyan-300 mb-1">
                  "{triggeredReminder.title}"
                </p>
                <p className="text-xs text-white/50 flex items-center justify-center gap-1">
                  <Clock size={12} />
                  Scheduled for: {new Date(triggeredReminder.targetTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>

              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => {
                    reminderService.snoozeReminder(triggeredReminder.id, 5);
                    setTriggeredReminder(null);
                  }}
                  className="flex-1 py-3 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-sm transition-all border border-white/10"
                >
                  Snooze 5 Min
                </button>
                <button
                  onClick={() => {
                    reminderService.dismissReminder(triggeredReminder.id);
                    setTriggeredReminder(null);
                  }}
                  className="flex-1 py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition-all shadow-lg shadow-red-600/40"
                >
                  Dismiss Alarm
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
      )}
    </div>
  );
}
