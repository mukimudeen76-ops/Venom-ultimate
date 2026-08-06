import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Key, Volume2, Mic, Bell, Zap, X, Check, Eye, EyeOff, Shield, Flashlight, Battery, Smartphone, Trash2, Play, AlertCircle, Loader2, User } from "lucide-react";
import { NativeBridge } from "../services/nativeBridge";
import { testApiKey } from "../services/geminiService";
import { memoryService } from "../services/memoryService";

interface SettingsModalProps {
  user: any;
  onUpdateUser?: (updatedUser: any) => void;
  onClose: () => void;
}

export default function SettingsModal({ user, onUpdateUser, onClose }: SettingsModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [savedKeySuccess, setSavedKeySuccess] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [selectedVoice, setSelectedVoice] = useState("Puck");
  const [wakeWordEnabled, setWakeWordEnabled] = useState(true);
  const [clapWakeEnabled, setClapWakeEnabled] = useState(false);
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = useState(true);
  const [batteryInfo, setBatteryInfo] = useState<{ level: number; isCharging: boolean } | null>(null);
  const [displayName, setDisplayName] = useState(user?.displayName || "Guest");
  const [savedProfileSuccess, setSavedProfileSuccess] = useState(false);

  useEffect(() => {
    setApiKey(NativeBridge.getApiKey());
    setSelectedVoice(NativeBridge.getVoiceName());
    setWakeWordEnabled(NativeBridge.isWakeWordEnabled());
    setClapWakeEnabled(NativeBridge.isClapWakeEnabled());
    setNoiseSuppressionEnabled(NativeBridge.isNoiseSuppressionEnabled());

    NativeBridge.getBatteryStatus().then((info) => setBatteryInfo(info));
  }, []);

  const handleSaveKey = async () => {
    NativeBridge.setApiKey(apiKey);
    
    setSavedKeySuccess(true);
    setTimeout(() => setSavedKeySuccess(false), 2000);
  };

  const handleTestKey = async () => {
    if (!apiKey.trim()) {
      setTestResult({ success: false, message: "Please enter an API Key first." });
      return;
    }
    setTestingKey(true);
    setTestResult(null);
    const res = await testApiKey(apiKey);
    setTestingKey(false);
    setTestResult(res);
  };

  const handleRemoveKey = async () => {
    setApiKey("");
    NativeBridge.setApiKey("");
    setTestResult({ success: false, message: "API Key removed." });
  };

  const handleVoiceChange = (voice: string) => {
    setSelectedVoice(voice);
    NativeBridge.setVoiceName(voice);
  };

  const handleWakeWordToggle = () => {
    const next = !wakeWordEnabled;
    setWakeWordEnabled(next);
    NativeBridge.setWakeWordEnabled(next);
  };

  const handleClapWakeToggle = () => {
    const next = !clapWakeEnabled;
    setClapWakeEnabled(next);
    NativeBridge.setClapWakeEnabled(next);
  };

  const handleNoiseSuppressionToggle = () => {
    const next = !noiseSuppressionEnabled;
    setNoiseSuppressionEnabled(next);
    NativeBridge.setNoiseSuppressionEnabled(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-lg bg-[#0a0a10]/95 border border-white/15 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl flex flex-col gap-4 sm:gap-5 relative text-white max-h-[88vh] overflow-y-auto scrollbar-thin scrollbar-thumb-violet-500/40 my-auto"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3 sm:pb-4 sticky top-0 bg-[#0a0a10]/90 backdrop-blur-md z-20 pt-1">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-400 shrink-0">
              <Zap size={18} className="sm:hidden" />
              <Zap size={20} className="hidden sm:block" />
            </div>
            <div>
              <h2 className="text-base sm:text-xl font-serif font-medium tracking-wide">VENOM Settings</h2>
              <p className="text-[10px] sm:text-xs text-white/50">Assistant & Device Config (Scrollable)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10 text-white/70 hover:text-white shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* 1. Gemini API Key Section */}
        <div className="flex flex-col gap-3 bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-white/90 flex items-center gap-2">
              <Key size={16} className="text-violet-400" />
              Gemini API Key
            </label>
            <div className="flex items-center gap-2">
              {savedKeySuccess && (
                <span className="text-xs text-emerald-400 flex items-center gap-1 font-mono">
                  <Check size={12} /> Saved!
                </span>
              )}
              {apiKey ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                  Key Configured
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                  Key Missing
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-0.5">
            <div className="relative flex-1">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTestResult(null);
                }}
                placeholder="AIzaSy..."
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 pr-10 text-xs font-mono text-white placeholder:text-white/30 focus:outline-none focus:border-violet-500/50"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            <button
              onClick={handleSaveKey}
              className="px-3.5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded-xl transition-colors shadow-lg shadow-violet-600/20 shrink-0 flex items-center gap-1.5"
            >
              <Check size={13} />
              Save
            </button>
          </div>

          {/* Action Buttons: Test & Remove */}
          <div className="flex items-center justify-between pt-1 gap-2">
            <button
              onClick={handleTestKey}
              disabled={testingKey || !apiKey.trim()}
              className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {testingKey ? (
                <>
                  <Loader2 size={13} className="animate-spin text-emerald-400" />
                  Testing...
                </>
              ) : (
                <>
                  <Play size={13} className="text-emerald-400" />
                  Test API Key
                </>
              )}
            </button>

            {apiKey && (
              <button
                onClick={handleRemoveKey}
                className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Trash2 size={13} className="text-rose-400" />
                Remove Key
              </button>
            )}
          </div>

          {/* Test Result Message Banner */}
          {testResult && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
                testResult.success
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-300"
              }`}
            >
              {testResult.success ? (
                <Check size={15} className="shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle size={15} className="shrink-0 text-rose-400" />
              )}
              <span className="leading-tight">{testResult.message}</span>
            </motion.div>
          )}

          <p className="text-[11px] text-white/40 leading-relaxed">
            Keys are saved in your device's secure storage and encrypted session. Required for Live Voice, Thinking Mode & Chat.
          </p>
        </div>

        {/* User Profile & Boss Identity Section */}
        <div className="flex flex-col gap-3 bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-white/90 flex items-center gap-2">
              <User size={16} className="text-violet-400" />
              Boss Identity & Speaker Profile
            </label>
            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30 font-mono font-bold">
              BOSS RECOGNIZED
            </span>
          </div>

          <div className="flex items-center gap-2 mt-0.5">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your name (e.g. Boss / Farhan)"
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-violet-500/50"
            />
            <button
              onClick={() => {
                const trimmed = displayName.trim() || "Boss";
                localStorage.setItem("venom_user_display_name", trimmed);
                localStorage.setItem("venom_boss_profile", JSON.stringify({ bossName: trimmed, isBossDefault: true }));
                // Save it as a permanent memory fact so VENOM recalls it
                memoryService.saveFact("User Name", trimmed, "profile");
                memoryService.saveFact("Boss Identity", `Master / Owner is ${trimmed}`, "profile");
                if (onUpdateUser) {
                  onUpdateUser({ ...user, displayName: trimmed });
                }
                setSavedProfileSuccess(true);
                setTimeout(() => setSavedProfileSuccess(false), 2000);
              }}
              className="px-3.5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded-xl transition-colors shadow-lg shadow-violet-600/20 shrink-0 flex items-center gap-1.5"
            >
              <Check size={13} />
              Confirm Boss
            </button>
          </div>
          <p className="text-[11px] text-white/40 leading-relaxed">
            VENOM treats you as <span className="text-cyan-300 font-semibold">Boss</span> by default on this device. Voice recognition will address you as Master/Boss without calling you a stranger.
          </p>
        </div>


        {/* 2. Voice Selection Section */}
        <div className="flex flex-col gap-3 bg-white/5 border border-white/10 rounded-2xl p-4">
          <label className="text-sm font-medium text-white/90 flex items-center gap-2">
            <Volume2 size={16} className="text-pink-400" />
            Voice Model
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: "Puck", label: "Puck (Male - Energetic)", desc: "Default witty male voice" },
              { id: "Fenrir", label: "Fenrir (Male - Deep)", desc: "Authoritative deep voice" },
              { id: "Aoede", label: "Aoede (Female - Bright)", desc: "Bright expressive voice" },
              { id: "Kore", label: "Kore (Female - Calm)", desc: "Calm measured voice" },
            ].map((v) => (
              <button
                key={v.id}
                onClick={() => handleVoiceChange(v.id)}
                className={`flex flex-col text-left p-3 rounded-xl border transition-all ${
                  selectedVoice === v.id
                    ? "bg-violet-500/20 border-violet-500/60 text-white"
                    : "bg-black/30 border-white/5 text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="text-xs font-medium">{v.label}</span>
                <span className="text-[10px] opacity-60 mt-0.5">{v.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 3. Voice & Audio Optimization */}
        <div className="flex flex-col gap-3 bg-white/5 border border-white/10 rounded-2xl p-4">
          <label className="text-sm font-medium text-white/90 flex items-center gap-2">
            <Mic size={16} className="text-sky-400" />
            Voice & Audio Optimization
          </label>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between p-3 rounded-xl bg-black/30 border border-white/5">
              <div>
                <div className="text-xs font-medium">Voice Wake Word ("Wake up Venom")</div>
                <div className="text-[11px] text-white/40">Local on-device keyword spotter</div>
              </div>
              <button
                onClick={handleWakeWordToggle}
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                  wakeWordEnabled ? "bg-violet-600" : "bg-white/10"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    wakeWordEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-black/30 border border-white/5">
              <div>
                <div className="text-xs font-medium">Clap-to-Wake (Double Clap)</div>
                <div className="text-[11px] text-white/40">Low-power transient amplitude trigger</div>
              </div>
              <button
                onClick={handleClapWakeToggle}
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                  clapWakeEnabled ? "bg-violet-600" : "bg-white/10"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    clapWakeEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-black/30 border border-white/5">
              <div>
                <div className="text-xs font-medium">Vocal Focus & Noise Filtering</div>
                <div className="text-[11px] text-white/40">Isolates 85Hz - 3200Hz to ignore background noise</div>
              </div>
              <button
                onClick={handleNoiseSuppressionToggle}
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                  noiseSuppressionEnabled ? "bg-violet-600" : "bg-white/10"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    noiseSuppressionEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* 4. Native Android Capabilities */}
        <div className="flex flex-col gap-3 bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-white/90 flex items-center gap-2">
              <Smartphone size={16} className="text-emerald-400" />
              Native Phone Controls
            </label>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
              {NativeBridge.isAndroidNative() ? "Android APK Active" : "Web Bridge Sandbox"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              onClick={() => NativeBridge.openSettingsPermission("NOTIFICATION")}
              className="p-2.5 rounded-xl bg-black/30 border border-white/5 hover:border-white/20 flex items-center gap-2 text-white/80 transition-colors"
            >
              <Bell size={14} className="text-violet-400" />
              Notification Access
            </button>
            <button
              onClick={() => NativeBridge.openSettingsPermission("ACCESSIBILITY")}
              className="p-2.5 rounded-xl bg-black/30 border border-white/5 hover:border-white/20 flex items-center gap-2 text-white/80 transition-colors"
            >
              <Shield size={14} className="text-sky-400" />
              Accessibility Service
            </button>
            <button
              onClick={() => NativeBridge.toggleFlashlight(true)}
              className="p-2.5 rounded-xl bg-black/30 border border-white/5 hover:border-white/20 flex items-center gap-2 text-white/80 transition-colors"
            >
              <Flashlight size={14} className="text-amber-400" />
              Test Flashlight
            </button>
            <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 flex items-center gap-2 text-white/80">
              <Battery size={14} className="text-emerald-400" />
              Battery: {batteryInfo ? `${batteryInfo.level}%` : "--"}
            </div>
          </div>
        </div>

        {/* 5. App Assets & Build Configuration Status */}
        <div className="flex flex-col gap-3 bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-white/90 flex items-center gap-2">
              <Shield size={16} className="text-cyan-400" />
              App Assets & Build Config
            </label>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
              Ready & Configured
            </span>
          </div>

          <div className="flex flex-col gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between text-white/80">
              <span className="flex items-center gap-2">
                <Check size={14} className="text-emerald-400" />
                <span>PNG Launcher Icons (ic_launcher.png / ic_launcher_round.png)</span>
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">Loaded in Mipmap</span>
            </div>

            <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between text-white/80">
              <span className="flex items-center gap-2">
                <Check size={14} className="text-emerald-400" />
                <span>Google Services Config (google-services.json)</span>
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">Bundled in APK</span>
            </div>

            <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between text-white/80">
              <span className="flex items-center gap-2">
                <Smartphone size={14} className="text-violet-400" />
                <span>Responsive Screen Fit (Viewport & Auto-Scale)</span>
              </span>
              <span className="text-[10px] text-violet-300 font-mono">Full Mobile Fit</span>
            </div>
          </div>
        </div>

        {/* 6. Creator & Owner Credit Card */}
        <div className="flex flex-col gap-2.5 bg-gradient-to-r from-violet-900/40 via-purple-900/30 to-black/60 border border-violet-500/30 rounded-2xl p-4 relative overflow-hidden">
          <div className="flex items-center justify-between z-10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-violet-500/20 border border-violet-400/40 flex items-center justify-center font-bold text-violet-300 text-xs">
                VT
              </div>
              <div>
                <div className="text-xs font-bold text-white tracking-wide">Owner & Creator</div>
                <div className="text-[11px] text-violet-300 font-medium">Boss Tehzeeb</div>
              </div>
            </div>
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 font-mono">
              Mastermind
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 z-10 font-mono">
            <a
              href="https://instagram.com/xtehzeeb.x"
              target="_blank"
              rel="noreferrer"
              className="p-2 rounded-xl bg-black/40 border border-violet-500/20 hover:border-violet-400/50 flex items-center gap-2 text-violet-200 transition-colors"
            >
              <span className="text-pink-400 font-bold">IG:</span>
              <span className="truncate">@xtehzeeb.x</span>
            </a>
            <a
              href="mailto:xtehzeeb.x7@gmail.com"
              className="p-2 rounded-xl bg-black/40 border border-violet-500/20 hover:border-violet-400/50 flex items-center gap-2 text-violet-200 transition-colors"
            >
              <span className="text-sky-400 font-bold">Mail:</span>
              <span className="truncate">xtehzeeb.x7@gmail.com</span>
            </a>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-xl transition-colors border border-white/10"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}
