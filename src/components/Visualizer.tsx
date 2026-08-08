import { motion } from "motion/react";

type VisualizerState = "idle" | "listening" | "processing" | "speaking";

interface VisualizerProps {
  state: VisualizerState;
  activeAgent?: string;
}

export default function Visualizer({ state, activeAgent = "venom_core" }: VisualizerProps) {
  const getRingAnimation = (duration: number, reverse: boolean = false) => {
    const speedMultiplier = state === "listening" ? 0.6 : state === "processing" ? 0.4 : state === "speaking" ? 0.5 : 1;
    return {
      rotate: reverse ? [-360, 0] : [0, 360],
      transition: { duration: duration * speedMultiplier, repeat: Infinity, ease: "linear" }
    };
  };

  const getPulseAnimation = () => {
    if (state === "speaking") {
      return {
        scale: [1, 1.08, 0.96, 1.06, 1],
        opacity: [0.85, 1, 0.85, 1, 0.85],
        transition: { duration: 0.45, repeat: Infinity, ease: "easeInOut" }
      };
    }
    if (state === "listening") {
      return {
        scale: [1, 1.05, 0.98, 1.03, 1],
        opacity: [0.75, 1, 0.75],
        transition: { duration: 0.85, repeat: Infinity, ease: "easeInOut" }
      };
    }
    if (state === "processing") {
      return {
        scale: [0.97, 1.04, 0.97],
        opacity: [0.65, 0.95, 0.65],
        transition: { duration: 0.7, repeat: Infinity, ease: "linear" }
      };
    }
    return {
      scale: [1, 1.02, 1],
      opacity: [0.5, 0.7, 0.5],
      transition: { duration: 3.5, repeat: Infinity, ease: "easeInOut" }
    };
  };

  // Color theme palette with deep neon gradients customized per Agent Core
  const getTheme = () => {
    const isListening = state === "listening";
    const isProcessing = state === "processing";
    const isSpeaking = state === "speaking";

    // 1. Ghost Dev (Green / Cyan)
    if (activeAgent === "ghost_dev") {
      return {
        primary: isListening ? "rgba(16, 185, 129, 1)" : isProcessing ? "rgba(6, 182, 212, 1)" : isSpeaking ? "rgba(52, 211, 153, 1)" : "rgba(16, 185, 129, 0.9)",
        secondary: "rgba(6, 182, 212, 0.8)",
        glow: "shadow-emerald-500/70",
        border: "border-emerald-400/60",
        gradFrom: "#10b981",
        gradTo: "#06b6d4",
        label: isListening ? "DEV: LISTEN..." : isProcessing ? "DEV: COMPILING..." : isSpeaking ? "DEV: SPEAKING" : "GHOST DEV"
      };
    }
    // 2. Spectre (Red / Orange)
    if (activeAgent === "spectre") {
      return {
        primary: isListening ? "rgba(239, 68, 68, 1)" : isProcessing ? "rgba(249, 115, 22, 1)" : isSpeaking ? "rgba(248, 113, 113, 1)" : "rgba(239, 68, 68, 0.9)",
        secondary: "rgba(245, 158, 11, 0.8)",
        glow: "shadow-red-500/80",
        border: "border-red-500/60",
        gradFrom: "#ef4444",
        gradTo: "#f59e0b",
        label: isListening ? "AUDIT: LISTEN..." : isProcessing ? "AUDIT: TRACING..." : isSpeaking ? "AUDIT: WARNING" : "SPECTRE SEC"
      };
    }
    // 3. Oracle (Amber / Purple)
    if (activeAgent === "oracle") {
      return {
        primary: isListening ? "rgba(245, 158, 11, 1)" : isProcessing ? "rgba(168, 85, 247, 1)" : isSpeaking ? "rgba(251, 191, 36, 1)" : "rgba(245, 158, 11, 0.9)",
        secondary: "rgba(139, 92, 246, 0.8)",
        glow: "shadow-amber-500/70",
        border: "border-amber-400/60",
        gradFrom: "#f59e0b",
        gradTo: "#8b5cf6",
        label: isListening ? "RECALL: LISTEN..." : isProcessing ? "RECALL: INDEXING..." : isSpeaking ? "RECALL: SPEECH" : "ORACLE CORE"
      };
    }
    // 4. Aero (Blue / Teal)
    if (activeAgent === "aero") {
      return {
        primary: isListening ? "rgba(59, 130, 246, 1)" : isProcessing ? "rgba(20, 184, 166, 1)" : isSpeaking ? "rgba(96, 165, 250, 1)" : "rgba(59, 130, 246, 0.9)",
        secondary: "rgba(20, 184, 166, 0.8)",
        glow: "shadow-blue-500/70",
        border: "border-blue-400/60",
        gradFrom: "#3b82f6",
        gradTo: "#14b8a6",
        label: isListening ? "AERO: SCOUT..." : isProcessing ? "AERO: SEARCH..." : isSpeaking ? "AERO: GAB" : "AERO DRONE"
      };
    }
    // 5. Classic Venom Core (Cyan / Purple)
    return {
      primary: isListening ? "rgba(168, 85, 247, 1)" : isProcessing ? "rgba(34, 211, 238, 1)" : isSpeaking ? "rgba(236, 72, 153, 1)" : "rgba(34, 211, 238, 0.9)",
      secondary: "rgba(168, 85, 247, 0.8)",
      glow: "shadow-cyan-500/60",
      border: "border-cyan-400/60",
      gradFrom: "#22d3ee",
      gradTo: "#a855f7",
      label: isListening ? "LISTENING..." : isProcessing ? "THINKING..." : isSpeaking ? "SPEAKING..." : "VENOM AI"
    };
  };

  const theme = getTheme();

  // Equalizer spectrum bars array (24 radial bars)
  const spectrumBars = Array.from({ length: 24 });

  // Floating ambient cyber-dust particles for luxury aesthetic
  const particles = Array.from({ length: 16 }).map((_, i) => {
    const angle = (i * 360) / 16;
    const distance = 90 + (i % 3) * 35;
    const duration = 12 + (i % 4) * 5;
    return { angle, distance, duration, size: 2 + (i % 3) };
  });

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none perspective-[1000px]">
      {/* 3D Container with tilt */}
      <div className="relative w-full h-full flex items-center justify-center transform-gpu style-preserve-3d">

        {/* Ambient Depth Backdrop Glow */}
        <motion.div
          animate={getPulseAnimation()}
          className={`absolute w-[70vw] max-w-[450px] h-[70vw] max-h-[450px] rounded-full blur-[100px] ${theme.glow}`}
          style={{
            background: `radial-gradient(circle, ${theme.primary} 0%, ${theme.secondary} 40%, transparent 70%)`,
            opacity: 0.25
          }}
        />

        {/* Cosmic Cyber Dust Particles orbiting center */}
        <div className="absolute inset-0 flex items-center justify-center">
          {particles.map((p, idx) => (
            <motion.div
              key={idx}
              className="absolute rounded-full"
              style={{
                width: p.size,
                height: p.size,
                background: `radial-gradient(circle, #ffffff 0%, ${theme.primary} 80%)`,
                boxShadow: `0 0 10px ${theme.primary}, 0 0 20px ${theme.secondary}`,
                opacity: 0.65,
              }}
              animate={{
                rotate: [p.angle, p.angle + 360],
                x: [
                  Math.cos((p.angle * Math.PI) / 180) * p.distance,
                  Math.cos(((p.angle + 360) * Math.PI) / 180) * p.distance,
                ],
                y: [
                  Math.sin((p.angle * Math.PI) / 180) * p.distance,
                  Math.sin(((p.angle + 360) * Math.PI) / 180) * p.distance,
                ],
              }}
              transition={{
                duration: p.duration,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          ))}
        </div>

        {/* 3D Orbit Ring 1: Outer Perspective Orbit with inclination */}
        <motion.div
          animate={getRingAnimation(16, false)}
          className={`absolute w-[80vw] max-w-[380px] h-[80vw] max-h-[380px] rounded-full border-[1.5px] border-dashed ${theme.border} opacity-25`}
          style={{ transform: "rotateX(65deg) rotateY(15deg)" }}
        />

        {/* 3D Orbit Ring 2: Reverse Perspective Orbit */}
        <motion.div
          animate={getRingAnimation(12, true)}
          className={`absolute w-[70vw] max-w-[340px] h-[70vw] max-h-[340px] rounded-full border-[2px] border-dotted ${theme.border} opacity-40`}
          style={{ transform: "rotateX(-55deg) rotateY(-20deg)" }}
        />

        {/* 3D Orbit Ring 3: Center Flat HUD Scanner */}
        <motion.div
          animate={getRingAnimation(8, false)}
          className={`absolute w-[60vw] max-w-[290px] h-[60vw] max-h-[290px] rounded-full border-[2px] ${theme.border} border-t-transparent border-b-transparent opacity-60 shadow-[0_0_15px_rgba(34,211,238,0.3)]`}
        />

        {/* 3D Radial Equalizer Spectrum Bars */}
        <div className="absolute w-[50vw] max-w-[240px] h-[50vw] max-h-[240px] flex items-center justify-center">
          {spectrumBars.map((_, i) => {
            const angle = (i * 360) / spectrumBars.length;
            const isSpeaking = state === "speaking";
            const isListening = state === "listening";
            const delay = (i % 6) * 0.1;
            
            return (
              <motion.div
                key={i}
                className="absolute w-[3px] rounded-full origin-bottom"
                style={{
                  transform: `rotate(${angle}deg) translateY(-85px)`,
                  background: `linear-gradient(to top, ${theme.gradFrom}, ${theme.gradTo})`,
                  boxShadow: `0 0 8px ${theme.primary}`
                }}
                animate={
                  isSpeaking
                    ? { height: [8, 28, 10, 36, 12], opacity: [0.6, 1, 0.6] }
                    : isListening
                    ? { height: [6, 18, 6], opacity: [0.5, 0.9, 0.5] }
                    : { height: [4, 8, 4], opacity: [0.3, 0.5, 0.3] }
                }
                transition={{
                  duration: isSpeaking ? 0.35 : isListening ? 0.6 : 2,
                  repeat: Infinity,
                  repeatType: "reverse",
                  delay: delay,
                  ease: "easeInOut"
                }}
              />
            );
          })}
        </div>

        {/* Inner Cyber HUD Ring with Neon Dots */}
        <motion.div
          animate={getRingAnimation(5, true)}
          className={`absolute w-[42vw] max-w-[200px] h-[42vw] max-h-[200px] rounded-full border-[3px] border-dashed ${theme.border} opacity-80`}
        />

        {/* 3D Center Metallic Venom Core Orb */}
        <motion.div
          animate={getPulseAnimation()}
          className="relative w-[32vw] max-w-[150px] h-[32vw] max-h-[150px] rounded-full border border-white/20 bg-slate-950/80 backdrop-blur-xl flex flex-col items-center justify-center shadow-2xl overflow-hidden group cursor-pointer"
          style={{
            boxShadow: `0 0 50px ${theme.primary}, inset 0 0 35px ${theme.secondary}`
          }}
        >
          {/* Internal Shimmer Surface */}
          <div 
            className="absolute inset-0 opacity-40 mix-blend-overlay animate-pulse pointer-events-none"
            style={{
              background: `radial-gradient(circle at 30% 30%, ${theme.gradFrom}, transparent 70%)`
            }}
          />

          {/* Venom Metallic "V" Logo Symbol */}
          <div className="relative z-10 flex flex-col items-center justify-center">
            <svg className="w-10 h-10 md:w-12 md:h-12 drop-shadow-[0_0_12px_rgba(255,255,255,0.9)]" viewBox="0 0 24 24" fill="none">
              <path 
                d="M4 4L12 20L20 4M12 20L12 11" 
                stroke="url(#venomGrad)" 
                strokeWidth="3.5" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                id="venomPath"
              />
              {/* Eye Left (with subtle smile squint during speech) */}
              <motion.path
                d={state === "speaking" ? "M7.5 8.5 C8 7 10 7 10.5 8.5" : "M9 8 A0.1 0.1 0 1 1 9 8.1 Z"}
                stroke={theme.primary}
                strokeWidth={state === "speaking" ? "1.8" : "3"}
                strokeLinecap="round"
                fill="none"
                animate={state === "speaking" ? {
                  d: "M7.5 8.5 C8 6.5 10 6.5 10.5 8.5",
                  opacity: [0.8, 1, 0.8],
                } : {
                  d: "M9 8 A0.1 0.1 0 1 1 9 8.1 Z",
                  opacity: 1,
                }}
                transition={{ duration: 0.3 }}
              />
              {/* Eye Right (with subtle smile squint during speech) */}
              <motion.path
                d={state === "speaking" ? "M13.5 8.5 C14 7 16 7 16.5 8.5" : "M15 8 A0.1 0.1 0 1 1 15 8.1 Z"}
                stroke={theme.secondary}
                strokeWidth={state === "speaking" ? "1.8" : "3"}
                strokeLinecap="round"
                fill="none"
                animate={state === "speaking" ? {
                  d: "M13.5 8.5 C14 6.5 16 6.5 16.5 8.5",
                  opacity: [0.8, 1, 0.8],
                } : {
                  d: "M15 8 A0.1 0.1 0 1 1 15 8.1 Z",
                  opacity: 1,
                }}
                transition={{ duration: 0.3, delay: 0.05 }}
              />
              
              <defs>
                <linearGradient id="venomGrad" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
                  <stop stopColor={theme.gradFrom} />
                  <stop offset="1" stopColor={theme.gradTo} />
                </linearGradient>
              </defs>
            </svg>

            {/* Core Label */}
            <div 
              className="mt-1 font-black tracking-[0.25em] text-xs md:text-sm text-white font-mono"
              style={{ textShadow: `0 0 12px ${theme.primary}, 0 0 24px ${theme.secondary}` }}
              id="coreLabel"
            >
              VENOM
            </div>
          </div>

          {/* Sub-state Pill Badge */}
          <div className="absolute bottom-2.5 z-10" id="subStatePill">
            <span className="text-[9px] font-mono tracking-widest px-2 py-0.5 rounded-full bg-black/60 border border-white/20 text-white/90 shadow-md backdrop-blur-md">
              {theme.label}
            </span>
          </div>
        </motion.div>

      </div>
    </div>
  );
}

