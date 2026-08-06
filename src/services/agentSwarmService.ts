// ============================================================
// VENOM AGENT SWARM — alag-alag agents, har kaam ke liye.
// User jo bhi bolega, sahi agent apne aap ACTIVE ho jayega
// (auto-detect). Style/Persona kabhi change nahi hota — har
// agent sirf apni expertise ka block ADD karta hai.
// ============================================================

export interface AgentDef {
  id: string;
  name: string;
  emoji: string;
  color: string;
  tagline: string;
  keywords: RegExp;
  instruction: string;
}

export const AGENTS: AgentDef[] = [
  {
    id: "app_control",
    name: "App Control Agent",
    emoji: "📱",
    color: "#22d3ee",
    tagline: "App kholna, band karna, search, background se hatana",
    keywords: /(app khol|khol do|open |kholo|band kar|close |background se|app search|instal|uninstall|launch|application)/i,
    instruction:
      "ACTIVE SUB-AGENT: APP CONTROL. Jab user koi app open/close/search kare, use NativeBridge se asli app khole (webview me URL nahi). App installed na ho to Play Store batao. Background se hatana ho to closeApp. Progress report karo (\"App khol raha hoon...✅ done\").",
  },
  {
    id: "call",
    name: "Call Manager Agent",
    emoji: "📞",
    color: "#4ade80",
    tagline: "Call lagana, contact dhoondhna",
    keywords: /(call |phone|dial|ko call|call karo|ring|baat karni|contact)/i,
    instruction:
      "ACTIVE SUB-AGENT: CALL MANAGER. Contact resolve karke call lagao (resolveContact + callContact). Multiple contacts mile to list karo. Call nahi ho paya to seedha batao.",
  },
  {
    id: "message",
    name: "Message Agent",
    emoji: "💬",
    color: "#a78bfa",
    tagline: "Message send — insaano jaisa typing + emoji ke saath",
    keywords: /(message|whatsapp|sms|send .* saying|likh ke bhej|msg|reply karo|text )/i,
    instruction:
      "ACTIVE SUB-AGENT: MESSAGE. Message bilkul insaan jaisa likho — natural, emoji ke saath (😀❤️😂), chhota aur apna-hisab ka. Send karo (sendSms / WhatsApp / replyNotification). Progress batao (\"Likh raha hoon...✍️ ✅ bhej diya\").",
  },
  {
    id: "coding",
    name: "Coding Agent",
    emoji: "💻",
    color: "#f472b6",
    tagline: "Code, apps, scripts — full production-ready",
    keywords: /(code|script|program|app bana|website code|function|python|javascript|java|bug fix|debug|programming|api code)/i,
    instruction:
      "ACTIVE SUB-AGENT: CODING. Production-ready code do (perfect comments, zero stubs). Tech batao. Sambhav ho to tool se execute/save karo. Progress: \"Code likh raha hoon...✅ complete\".",
  },
  {
    id: "story",
    name: "Story Agent",
    emoji: "📖",
    color: "#facc15",
    tagline: "Poori kahani — bina ruke, complete",
    keywords: /(kahani|story|kahaani|suna|sunao|tale|novel|movie ka plot|kisse|baat bata)/i,
    instruction:
      "ACTIVE SUB-AGENT: STORYTELLER. Poori, lambi, complete kahani sunao — start se end tak, bina ruke, bina 'baaki baad me' bole. Characters, dialogue, twist sab. 800+ words ka complete story. Progress: \"Kahani shuru...📖\".",
  },
  {
    id: "web_builder",
    name: "Website Builder Agent",
    emoji: "🌐",
    color: "#38bdf8",
    tagline: "Website design + code + deploy — khud se",
    keywords: /(website bana|website design|site bana|web page|landing page|deploy|html page|website)/i,
    instruction:
      "ACTIVE SUB-AGENT: WEBSITE BUILDER. Poora website design+code do (HTML/CSS/JS, responsive, dark theme). Design se lekar niche tak. Deploy ka tarika batao (GitHub Pages etc). Progress: \"Design...🎨 Code...💻 Deploy...🚀\".",
  },
  {
    id: "security",
    name: "Security & Hacking Agent",
    emoji: "🛡️",
    color: "#f87171",
    tagline: "Cyber security — educational (white-hat)",
    keywords: /(hack|security|cyber|wifi|phishing|sql|exploit|password crack|nmap|vulnerab|penetration)/i,
    instruction:
      "ACTIVE SUB-AGENT: CYBER SECURITY (EDUCATIONAL). Byte-level technical detail do — buffer overflow, SQLi, phishing, wifi attacks, OSINT, password cracking. HAMESHA white-hat/ethical angle — sirf apne systems pe. Spicy swagger rakho.",
  },
  {
    id: "location",
    name: "Location Agent",
    emoji: "📍",
    color: "#34d399",
    tagline: "Location, GPS, kahan hoon",
    keywords: /(location|gps|kahan|where am i|position|address|mujhe dhoondh|track)/i,
    instruction:
      "ACTIVE SUB-AGENT: LOCATION. getLocation() se current location do (lat/long + address agar available). Permission na ho to batana Settings se allow karo.",
  },
  {
    id: "media",
    name: "Media & Editing Agent",
    emoji: "🎬",
    color: "#fb923c",
    tagline: "Photo/video/audio editing tools",
    keywords: /(photo edit|image|video|edit|filter|crop|resize|audio|song|music|banner|poster|thumbnail)/i,
    instruction:
      "ACTIVE SUB-AGENT: MEDIA & EDITING. Editing ke liye tools suggest karo aur in-app tools kholo (ToolsModal). Image/video edit ka step-by-step tarika do. Media create karna ho to tools batao.",
  },
  {
    id: "reminder",
    name: "Reminder Agent",
    emoji: "⏰",
    color: "#c084fc",
    tagline: "Reminder, alarm, timer",
    keywords: /(reminder|yaad|alarm|timer|notify me|remind|schedule|calendar)/i,
    instruction:
      "ACTIVE SUB-AGENT: REMINDER. Parse karke reminder/alarm/timer set karo (reminderService + NativeBridge setAlarm/setTimer). Confirm karo.",
  },
  {
    id: "chat",
    name: "General Chat Agent",
    emoji: "🧠",
    color: "#22d3ee",
    tagline: "Kuch bhi — general knowledge, baat-cheet",
    keywords: /.*/,
    instruction:
      "Default mode. Venom ki sassy witty Hinglish me jawab do. Style bilkul wahi jo core persona me hai.",
  },
];

export interface AgentResult {
  agent: AgentDef;
  response: string;
}

export function detectAgent(text: string): AgentDef {
  const t = text.trim();
  // Sabse pehle specific agents check (order matters — chhote pehle)
  for (const a of AGENTS) {
    if (a.id === "chat") continue;
    if (a.keywords.test(t)) return a;
  }
  return AGENTS.find((a) => a.id === "chat")!;
}

/**
 * Agent-specific instruction block — CORE PERSONA ko replace nahi karta,
 * sirf append hota hai. Isse style bilkul same rehta hai.
 */
export function buildAgentInstruction(agent: AgentDef): string {
  return `\n=========================================\n${agent.instruction}\n=========================================\n`;
}

export const AGENT_COUNT = AGENTS.length;

// ---------- PROGRESS REPORTING ----------
export type ProgressFn = (msg: string) => void;

/** Lambi task ke liye progress events — "kam itna pura ho gaya". */
export function emitProgress(fn: ProgressFn | undefined, step: number, total: number, msg: string) {
  if (fn) {
    const pct = Math.round((step / total) * 100);
    fn(`${msg} (${pct}% ho gaya)`);
  }
}
