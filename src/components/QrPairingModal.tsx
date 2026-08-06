import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QrCode, Camera, Smartphone, Monitor, CheckCircle, RefreshCw, X, Shield, Send, SmartphoneCharging, ArrowRight } from "lucide-react";
import QRCode from "qrcode";
import { Html5QrcodeScanner } from "html5-qrcode";
import { qrPairingService, DevicePairInfo } from "../services/qrPairingService";
import { NativeBridge } from "../services/nativeBridge";

interface QrPairingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QrPairingModal: React.FC<QrPairingModalProps> = ({ isOpen, onClose }) => {
  const isAndroid = NativeBridge.isAndroidNative();
  const [activeTab, setActiveTab] = useState<"generate" | "scan">(isAndroid ? "scan" : "generate");
  const [qrCanvasUrl, setQrCanvasUrl] = useState<string>("");
  const [sessionPayloadStr, setSessionPayloadStr] = useState<string>("");
  const [pairSession, setPairSession] = useState<DevicePairInfo | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [scanInputText, setScanInputText] = useState<string>("");
  const [scanStatus, setScanStatus] = useState<string>("");
  const [remoteAppName, setRemoteAppName] = useState<string>("");
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    if (isOpen) {
      qrPairingService.setCallbacks((session) => {
        setPairSession(session);
      });

      if (!isAndroid || activeTab === "generate") {
        generateQrCode();
      }
    }

    return () => {
      if (scannerRef.current) {
        try {
          scannerRef.current.clear();
        } catch (e) {}
      }
    };
  }, [isOpen, activeTab]);

  const generateQrCode = async () => {
    setIsGenerating(true);
    try {
      const payloadStr = await qrPairingService.createPairingSession();
      setSessionPayloadStr(payloadStr);

      const url = await QRCode.toDataURL(payloadStr, {
        width: 320,
        margin: 2,
        color: {
          dark: "#22d3ee",
          light: "#0b0c10",
        },
      });
      setQrCanvasUrl(url);
    } catch (err) {
      console.error("QR Code generation error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const startScanner = () => {
    setScanStatus("Initializing camera scanner...");
    setTimeout(() => {
      try {
        const scanner = new Html5QrcodeScanner(
          "qr-reader-container",
          { fps: 10, qrbox: { width: 220, height: 220 } },
          /* verbose= */ false
        );
        scannerRef.current = scanner;

        scanner.render(
          async (decodedText) => {
            try {
              setScanStatus("QR Code detected! Connecting session...");
              await qrPairingService.pairWithSession(decodedText);
              setScanStatus("Successfully paired devices!");
              try {
                scanner.clear();
              } catch (e) {}
            } catch (err: any) {
              setScanStatus(err?.message || "Pairing failed. Try scanning again.");
            }
          },
          (errorMessage) => {
            // Ignore frame scan failures
          }
        );
      } catch (err: any) {
        setScanStatus("Camera access restricted. Use manual pairing string below.");
      }
    }, 300);
  };

  useEffect(() => {
    if (isOpen && activeTab === "scan" && isAndroid) {
      startScanner();
    } else {
      if (scannerRef.current) {
        try {
          scannerRef.current.clear();
        } catch (e) {}
      }
    }
  }, [activeTab, isOpen]);

  const handleManualPairSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanInputText.trim()) return;
    setScanStatus("Connecting session...");
    try {
      await qrPairingService.pairWithSession(scanInputText.trim());
      setScanStatus("Successfully connected!");
    } catch (err: any) {
      setScanStatus(err?.message || "Failed to pair.");
    }
  };

  const handleSendRemoteAction = async (action: string, payload: any) => {
    try {
      await qrPairingService.sendRemoteCommand(action, payload);
      setScanStatus(`Remote command '${action}' sent to connected device!`);
    } catch (err: any) {
      setScanStatus(err?.message || "Failed to dispatch command.");
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-cyan-500/30 bg-[#0c0d14] text-white shadow-2xl shadow-cyan-950/50"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-cyan-900/40 px-6 py-4 bg-gradient-to-r from-cyan-950/40 via-purple-950/20 to-transparent">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
                <QrCode className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-mono text-base font-bold text-cyan-300">VENOM CROSS-DEVICE LINK</h3>
                <p className="text-xs text-slate-400">QR-Based Phone & Desktop Remote Control</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Device Control Notice */}
          <div className="bg-cyan-950/30 border-b border-cyan-500/20 px-6 py-2.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-cyan-300">
              <Shield className="h-4 w-4 text-cyan-400" />
              <span>
                {isAndroid
                  ? "Android Client Mode: Scan QR on Desktop or another Phone to control it."
                  : "Desktop Host Mode: Displays QR Code for VENOM Android app scan."}
              </span>
            </div>
            {pairSession?.status === "connected" && (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-emerald-400 font-medium border border-emerald-500/30">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Linked
              </span>
            )}
          </div>

          {/* Navigation Tabs (Android can switch tabs, Desktop is display-only) */}
          {isAndroid && (
            <div className="flex border-b border-white/5 bg-black/40 px-6 pt-3 gap-4">
              <button
                onClick={() => setActiveTab("scan")}
                className={`flex items-center gap-2 border-b-2 pb-3 text-xs font-mono transition-all ${
                  activeTab === "scan"
                    ? "border-cyan-400 text-cyan-300 font-bold"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Camera className="h-4 w-4" />
                Scan QR Code
              </button>
              <button
                onClick={() => setActiveTab("generate")}
                className={`flex items-center gap-2 border-b-2 pb-3 text-xs font-mono transition-all ${
                  activeTab === "generate"
                    ? "border-cyan-400 text-cyan-300 font-bold"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <QrCode className="h-4 w-4" />
                Display My QR Code
              </button>
            </div>
          )}

          {/* Main Body */}
          <div className="p-6">
            {/* TAB: GENERATE QR CODE (Desktop Default or Android display) */}
            {activeTab === "generate" && (
              <div className="flex flex-col items-center justify-center text-center">
                <p className="text-xs text-slate-300 mb-4 max-w-sm">
                  Scan this QR code using the <span className="text-cyan-400 font-semibold">VENOM Android App</span> on your mobile device to establish a secure cross-device remote control bridge.
                </p>

                <div className="relative p-3 rounded-2xl border border-cyan-500/40 bg-[#08090f] shadow-lg shadow-cyan-900/30 mb-4">
                  {isGenerating ? (
                    <div className="flex h-56 w-56 items-center justify-center text-cyan-400">
                      <RefreshCw className="h-8 w-8 animate-spin" />
                    </div>
                  ) : qrCanvasUrl ? (
                    <img src={qrCanvasUrl} alt="VENOM QR Pair Code" className="h-56 w-56 rounded-xl" />
                  ) : (
                    <div className="flex h-56 w-56 items-center justify-center text-red-400 text-xs">
                      Failed to render QR Code
                    </div>
                  )}
                </div>

                <button
                  onClick={generateQrCode}
                  className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-4 py-2 text-xs font-mono text-cyan-300 hover:bg-white/10 transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Regenerate Secure Session Code
                </button>
              </div>
            )}

            {/* TAB: SCAN QR CODE (Android) */}
            {activeTab === "scan" && (
              <div className="flex flex-col items-center">
                <div
                  id="qr-reader-container"
                  className="w-full h-64 rounded-xl border border-cyan-500/30 overflow-hidden bg-black/60 flex items-center justify-center mb-4"
                />

                {scanStatus && (
                  <p className="text-xs text-cyan-300 font-mono mb-4 text-center bg-cyan-950/40 px-3 py-1.5 rounded-lg border border-cyan-500/20">
                    {scanStatus}
                  </p>
                )}

                <form onSubmit={handleManualPairSubmit} className="w-full">
                  <div className="text-xs text-slate-400 mb-1">Or paste pair token code directly:</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={scanInputText}
                      onChange={(e) => setScanInputText(e.target.value)}
                      placeholder='{"venomPair":true,"sessionId":"..."}'
                      className="flex-1 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs font-mono text-white focus:border-cyan-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-black hover:bg-cyan-400 transition-colors"
                    >
                      Pair Device
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* CONNECTED DEVICE REMOTE CONTROLLER PANEL */}
            {pairSession?.status === "connected" && (
              <div className="mt-6 border-t border-cyan-900/40 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono text-emerald-400 font-bold flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4" />
                    REMOTE LINK ACTIVE
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Host: {pairSession.hostDeviceName} ({pairSession.hostPlatform})
                  </span>
                </div>

                <div className="space-y-3 rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-3.5">
                  <div className="text-xs font-medium text-slate-300">Quick Remote Actions:</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={remoteAppName}
                      onChange={(e) => setRemoteAppName(e.target.value)}
                      placeholder="e.g. WhatsApp, Instagram, YouTube"
                      className="flex-1 rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                    />
                    <button
                      onClick={() => handleSendRemoteAction("openApp", { appName: remoteAppName })}
                      disabled={!remoteAppName.trim()}
                      className="flex items-center gap-1 rounded-lg bg-cyan-500/20 border border-cyan-500/40 px-3 py-1.5 text-xs font-mono text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-50"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                      Open App
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => handleSendRemoteAction("getDeviceTime", {})}
                      className="rounded-lg border border-white/10 bg-white/5 py-1.5 px-3 text-xs text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      Sync Device Time
                    </button>
                    <button
                      onClick={() => qrPairingService.disconnectSession()}
                      className="rounded-lg border border-red-500/30 bg-red-500/10 py-1.5 px-3 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                      Disconnect Pair
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
