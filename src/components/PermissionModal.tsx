import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Bell, Shield, MapPin, Camera, AlertTriangle, Check, ChevronRight, X, Lock } from 'lucide-react';
import { NativeBridge } from '../services/nativeBridge';

interface PermissionModalProps {
  onClose: () => void;
  initialPermission?: string;
}

interface PermissionItem {
  id: string;
  name: string;
  category: "Runtime" | "Special Settings" | "Sensitive Security";
  icon: React.ReactNode;
  description: string;
  isSpecial?: boolean;
  settingsType?: string;
  isDangerous?: boolean;
}

export default function PermissionModal({ onClose, initialPermission }: PermissionModalProps) {
  const [grantedState, setGrantedState] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem("venom_permission_states");
    return saved ? JSON.parse(saved) : {};
  });

  const [confirmDeviceAdmin, setConfirmDeviceAdmin] = useState(false);

  const permissions: PermissionItem[] = [
    {
      id: "mic",
      name: "Microphone Access (RECORD_AUDIO)",
      category: "Runtime",
      icon: <Mic size={20} className="text-violet-400" />,
      description: "Needed for voice chat, live audio streaming, and wake-word/clap detection.",
    },
    {
      id: "notifications",
      name: "Notification Access",
      category: "Special Settings",
      icon: <Bell size={20} className="text-pink-400" />,
      description: "Needed for reading, summarizing, and replying to incoming messages via voice.",
      isSpecial: true,
      settingsType: "NOTIFICATION",
    },
    {
      id: "accessibility",
      name: "Accessibility Service",
      category: "Special Settings",
      icon: <Shield size={20} className="text-sky-400" />,
      description: "Needed for deep phone actions like launching/closing apps and reading on-screen content.",
      isSpecial: true,
      settingsType: "ACCESSIBILITY",
    },
    {
      id: "location",
      name: "Location Access",
      category: "Runtime",
      icon: <MapPin size={20} className="text-emerald-400" />,
      description: "Needed for location-aware assistant commands and device anti-theft location logging.",
    },
    {
      id: "camera",
      name: "Camera Access",
      category: "Runtime",
      icon: <Camera size={20} className="text-amber-400" />,
      description: "Needed for visual analysis and camera commands.",
    },
    {
      id: "device_admin",
      name: "Device Admin (Anti-Theft Remote Wipe)",
      category: "Sensitive Security",
      icon: <AlertTriangle size={20} className="text-red-400" />,
      description: "Lets the app perform anti-theft remote wipe. Enable ONLY if you explicitly want this protection.",
      isDangerous: true,
    },
  ];

  const updatePermissionState = (id: string, status: boolean) => {
    const updated = { ...grantedState, [id]: status };
    setGrantedState(updated);
    localStorage.setItem("venom_permission_states", JSON.stringify(updated));
  };

  const handleGrant = async (item: PermissionItem) => {
    if (item.isDangerous) {
      setConfirmDeviceAdmin(true);
      return;
    }

    if (item.isSpecial && item.settingsType) {
      NativeBridge.openSettingsPermission(item.settingsType);
      updatePermissionState(item.id, true);
      return;
    }

    if (item.id === "mic") {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        updatePermissionState("mic", true);
      } catch (e) {
        console.error("Mic request rejected", e);
        updatePermissionState("mic", false);
      }
      return;
    }

    if (item.id === "location") {
      NativeBridge.getLocation().then((loc) => {
        if (loc) updatePermissionState("location", true);
      });
      return;
    }

    if (item.id === "camera") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach((t) => t.stop());
        updatePermissionState("camera", true);
      } catch (e) {
        updatePermissionState("camera", false);
      }
      return;
    }

    updatePermissionState(item.id, true);
  };

  const handleSkip = (id: string) => {
    updatePermissionState(id, false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-lg bg-[#0a0a10]/95 border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col gap-5 relative text-white max-h-[90vh] overflow-y-auto scrollbar-hide"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <Lock size={20} />
            </div>
            <div>
              <h2 className="text-xl font-serif font-medium tracking-wide">Permission Manager</h2>
              <p className="text-xs text-white/50">Contextual Explicit Onboarding & Access Control</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10 text-white/70 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-white/60 leading-relaxed bg-white/5 border border-white/10 p-3 rounded-2xl">
          VENOM respects your privacy. Every permission is requested explicitly when needed. You can grant or skip any item.
          Skipping simply disables that feature without blocking the core assistant.
        </p>

        {/* Permission List */}
        <div className="flex flex-col gap-3">
          {permissions.map((item) => {
            const isGranted = !!grantedState[item.id];
            return (
              <div
                key={item.id}
                className={`flex flex-col gap-2 p-4 rounded-2xl border transition-all ${
                  isGranted
                    ? "bg-violet-500/10 border-violet-500/30"
                    : item.isDangerous
                    ? "bg-red-500/10 border-red-500/30"
                    : "bg-white/5 border-white/10"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/10">
                      {item.icon}
                    </div>
                    <div>
                      <div className="text-sm font-medium flex items-center gap-2">
                        {item.name}
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/60 font-mono">
                          {item.category}
                        </span>
                      </div>
                      <p className="text-xs text-white/50 mt-1 leading-relaxed">{item.description}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-white/5">
                  {isGranted ? (
                    <span className="text-xs text-emerald-400 flex items-center gap-1 font-mono py-1 px-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                      <Check size={14} /> Granted / Active
                    </span>
                  ) : (
                    <>
                      <button
                        onClick={() => handleSkip(item.id)}
                        className="px-3 py-1.5 text-xs text-white/50 hover:text-white/80 rounded-xl transition-colors"
                      >
                        Skip
                      </button>
                      <button
                        onClick={() => handleGrant(item)}
                        className={`px-4 py-1.5 text-xs font-medium rounded-xl transition-all shadow-md flex items-center gap-1.5 ${
                          item.isDangerous
                            ? "bg-red-600 hover:bg-red-500 text-white shadow-red-600/20"
                            : "bg-violet-600 hover:bg-violet-500 text-white shadow-violet-600/20"
                        }`}
                      >
                        {item.isSpecial ? "Open Settings" : "Grant Access"}
                        <ChevronRight size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Confirmation Modal for Device Admin */}
        <AnimatePresence>
          {confirmDeviceAdmin && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed inset-0 z-60 bg-black/90 backdrop-blur-lg flex items-center justify-center p-6"
            >
              <div className="bg-[#120a0a] border border-red-500/40 rounded-3xl p-6 max-w-md text-center flex flex-col items-center gap-4 shadow-2xl">
                <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
                  <AlertTriangle size={24} />
                </div>
                <h3 className="text-lg font-serif font-medium text-red-200">
                  Enable Anti-Theft Device Admin?
                </h3>
                <p className="text-xs text-white/70 leading-relaxed">
                  This grants the app permission to perform a device wipe if an authorized anti-theft trigger is executed. Enable ONLY if you thoroughly understand and want this security feature.
                </p>
                <div className="flex gap-3 w-full mt-2">
                  <button
                    onClick={() => setConfirmDeviceAdmin(false)}
                    className="flex-1 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-xl transition-colors border border-white/10"
                  >
                    Cancel / Skip
                  </button>
                  <button
                    onClick={() => {
                      setConfirmDeviceAdmin(false);
                      updatePermissionState("device_admin", true);
                      NativeBridge.openSettingsPermission("ACCESSIBILITY");
                    }}
                    className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-xl transition-colors shadow-lg shadow-red-600/30"
                  >
                    I Understand, Enable
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
