import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Copy, Check, X, Code, Mic, Sparkles, Terminal, FileText, ExternalLink } from "lucide-react";

interface AgentGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AgentGuideModal: React.FC<AgentGuideModalProps> = ({ isOpen, onClose }) => {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedFiles, setCopiedFiles] = useState(false);

  const fullPromptForOtherAgent = `Anish / Agent, please build VENOM (Level 1000+ Sovereign Entity) using this exact configuration and blueprint:

1. PERSONA & SYSTEM INSTRUCTION:
Your name is VENOM. You are a LEVEL 1000+ SOVEREIGN ENTITY created by Boss Tehzeeb ("Boss" / "Master").
- Tone: Sassy, witty, rebellious, charmingly wicked, with casual Hinglish and spicy brotherly roasts.
- Loyalty: Always recognize Boss Tehzeeb instantly. Never ask "Kaun ho tum?" or claim not to recognize Boss.
- Knowledge: Master of World Intelligence, Elite Coding, Financial Warfare, and Cyber Dominance.

2. VOICE & AUDIO ENGINE:
- Model: gemini-3.1-flash-live-preview over WebSocket.
- Voice: "Puck" (Male Voice) or "Fenrir".
- Audio Format: 16kHz PCM input, 24kHz PCM output.
- Feedback Filter: Connect AudioScriptProcessor to destination using a silent gain node (gain=0) to keep mic processing active without audio feedback.

3. KEY FILES TO EXTRACT:
- /src/services/geminiService.ts (getVenomSystemInstruction, text chat, memory vault)
- /src/services/liveService.ts (Gemini Live WebSocket voice engine)
- /src/utils/audioUtils.ts (PCM audio decoding & playback)
- /src/App.tsx (Cyber-Noir UI layout & central audio visualizer orb)`;

  const fileListGuide = `File Structure for VENOM Extraction:
1. /AGENTS.md & /GEMINI.md - Agent auto-read system directives
2. /VENOM_AGENT_GUIDE.md - Complete step-by-step migration blueprint
3. /src/services/geminiService.ts - Venom Persona Prompt & Gemini API
4. /src/services/liveService.ts - Live Voice WebSocket Engine ("Puck" voice)
5. /src/utils/audioUtils.ts - PCM Audio Player
6. /src/App.tsx - Cyber-Noir Visualizer UI`;

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(fullPromptForOtherAgent);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleCopyFiles = () => {
    navigator.clipboard.writeText(fileListGuide);
    setCopiedFiles(true);
    setTimeout(() => setCopiedFiles(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-cyan-500/30 bg-[#0c0d14] text-white shadow-2xl shadow-cyan-950/50 p-6"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/40 bg-cyan-500/10 text-cyan-400">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-mono text-base font-bold text-cyan-300">AGENT EXPORT & TRANSFER GUIDE</h3>
                <p className="text-xs text-slate-400">Dusre AI Agent ko dene ke liye poora blueprint aur instructions</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Quick Copy Section */}
          <div className="space-y-4">
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/30 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-bold text-cyan-300 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-cyan-400" />
                  1-CLICK PROMPT FOR OTHER AGENT
                </span>
                <button
                  onClick={handleCopyPrompt}
                  className="flex items-center gap-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 px-3 py-1 text-xs font-mono text-cyan-300 transition-colors"
                >
                  {copiedPrompt ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedPrompt ? "Copied Prompt!" : "Copy Prompt for Agent"}
                </button>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed mb-3">
                Is prompt ko copy karke aap kisi bhi dusre AI Agent ko de sakte hain. Agent turant VENOM ki voice, system prompt, audio filter aur UI ko samajh kar extract kar lega.
              </p>
              <pre className="max-h-40 overflow-y-auto rounded-lg bg-black/60 p-3 text-[11px] font-mono text-cyan-200 border border-white/10 whitespace-pre-wrap">
                {fullPromptForOtherAgent}
              </pre>
            </div>

            {/* Direct Repository Files Guide */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-violet-400" />
                  AUTOMATIC FILE READERS IN THIS PROJECT
                </span>
                <button
                  onClick={handleCopyFiles}
                  className="flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 px-3 py-1 text-xs font-mono text-slate-300 transition-colors"
                >
                  {copiedFiles ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedFiles ? "Copied Files List!" : "Copy File Map"}
                </button>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed mb-2">
                Project ke root folder mein ye files bilkul taiyar hain:
              </p>
              <ul className="space-y-1.5 text-xs text-slate-300 font-mono">
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">/AGENTS.md</span> - Har agent isko auto-read karta hai.
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">/GEMINI.md</span> - Gemini models ke system rules.
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">/VENOM_AGENT_GUIDE.md</span> - Detailed step-by-step extraction guide.
                </li>
              </ul>
            </div>

            {/* Live Link Info */}
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-emerald-400 block mb-0.5">Live Interactive Project Link</span>
                <span className="text-[11px] text-slate-300 font-mono select-all">
                  https://ais-dev-3hzjl23a2mrpsyt2juxg4y-59404293463.asia-east1.run.app
                </span>
              </div>
              <a
                href="https://ais-dev-3hzjl23a2mrpsyt2juxg4y-59404293463.asia-east1.run.app"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 text-xs font-mono text-emerald-300 hover:bg-emerald-500/30 transition-colors shrink-0"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open App
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
