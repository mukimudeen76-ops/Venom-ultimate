import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Search, Wrench, Image as ImageIcon, Video, Music, FileText, Globe, Shield, Cpu, MapPin, Smartphone, Sparkles, PenTool } from "lucide-react";
import { NativeBridge } from "../services/nativeBridge";

export interface VenomTool {
  id: string;
  name: string;
  emoji: string;
  cat: string;
  desc: string;
  run: () => string; // returns feedback message
}

type Cat = { id: string; label: string; icon: React.ReactNode };

const CATS: Cat[] = [
  { id: "edit", label: "Editing", icon: <PenTool size={14} /> },
  { id: "photo", label: "Photo", icon: <ImageIcon size={14} /> },
  { id: "video", label: "Video", icon: <Video size={14} /> },
  { id: "audio", label: "Audio", icon: <Music size={14} /> },
  { id: "text", label: "Text/Docs", icon: <FileText size={14} /> },
  { id: "web", label: "Web/Dev", icon: <Globe size={14} /> },
  { id: "security", label: "Security", icon: <Shield size={14} /> },
  { id: "sys", label: "System", icon: <Cpu size={14} /> },
  { id: "loc", label: "Location", icon: <MapPin size={14} /> },
  { id: "phone", label: "Phone", icon: <Smartphone size={14} /> },
  { id: "fun", label: "Fun/Create", icon: <Sparkles size={14} /> },
];

const open = (url: string) => () => {
  try { window.open(url, "_blank"); } catch (e) {}
  return `Khol raha hoon...`;
};

const native = (fn: () => any, okMsg: string, failMsg: string) => () => {
  try { const r = fn(); return r ? okMsg : failMsg; } catch (e) { return failMsg; }
};

export const TOOLS: VenomTool[] = [
  // ---- EDITING ----
  { id: "t_bgremove", name: "Background Remover", emoji: "🪄", cat: "edit", desc: "Photo se background hatao (AI)", run: open("https://www.remove.bg") },
  { id: "t_compress", name: "Image Compressor", emoji: "🗜️", cat: "edit", desc: "Image ka size kam karo", run: open("https://tinypng.com") },
  { id: "t_resize", name: "Image Resizer", emoji: "📐", cat: "edit", desc: "Width/height badlo", run: open("https://www.resizepixel.com") },
  { id: "t_crop", name: "Crop Tool", emoji: "✂️", cat: "edit", desc: "Image crop karo", run: open("https://www.canva.com") },
  { id: "t_enhance", name: "Photo Enhancer", emoji: "✨", cat: "edit", desc: "Blurry photo sharp karo", run: open("https://letsenhance.io") },
  { id: "t_colorize", name: "Colorizer", emoji: "🎨", cat: "edit", desc: "Old b&w photo me color", run: open("https://palette.fm") },
  { id: "t_upscale", name: "Upscaler", emoji: "📈", cat: "edit", desc: "Resolution 4x badhao", run: open("https://www.upscale.media") },
  { id: "t_watermark", name: "Watermark", emoji: "💧", cat: "edit", desc: "Logo/naam chipkao", run: open("https://watermarkly.com") },
  // ---- PHOTO ----
  { id: "t_canva", name: "Canva Designer", emoji: "🎨", cat: "photo", desc: "Poster/banner/thumbnail", run: open("https://www.canva.com") },
  { id: "t_picart", name: "Picart Editor", emoji: "🖼️", cat: "photo", desc: "Full photo editor", run: open("https://pixlr.com") },
  { id: "t_filter", name: "Filters", emoji: "🌈", cat: "photo", desc: "Insta-style filters", run: open("https://pixlr.com/filters") },
  { id: "t_collage", name: "Collage Maker", emoji: "🧩", cat: "photo", desc: "Multiple photos ek frame me", run: open("https://www.photocollage.com") },
  { id: "t_meme", name: "Meme Maker", emoji: "😂", cat: "photo", desc: "Meme banao", run: open("https://imgflip.com/memegenerator") },
  { id: "t_qrgen", name: "QR Maker", emoji: "🔳", cat: "photo", desc: "QR code banao", run: () => { try { window.dispatchEvent(new CustomEvent("venomOpenTools", { detail: { qr: true } })); } catch (e) {} return "QR maker ready — Cross-device me QR dekho."; } },
  { id: "t_emoji", name: "Emoji Maker", emoji: "😎", cat: "photo", desc: "Custom emoji", run: open("https://emoji-maker.com") },
  { id: "t_avatar", name: "Avatar Maker", emoji: "🦸", cat: "photo", desc: "3D avatar banao", run: open("https://readyplayer.me") },
  // ---- VIDEO ----
  { id: "t_capcut", name: "CapCut Editor", emoji: "🎬", cat: "video", desc: "Video edit/trim/music", run: open("https://www.capcut.com") },
  { id: "t_vid_trim", name: "Video Trimmer", emoji: "✂️", cat: "video", desc: "Video kaat lo", run: open("https://online-video-cutter.com") },
  { id: "t_vid_compress", name: "Video Compressor", emoji: "🗜️", cat: "video", desc: "Video size kam karo", run: open("https://www.clideo.com/compress-video") },
  { id: "t_vid_merge", name: "Video Merger", emoji: "🔗", cat: "video", desc: "2 video jodo", run: open("https://www.clideo.com/merge-videos") },
  { id: "t_vid_gif", name: "Video to GIF", emoji: "🖼️", cat: "video", desc: "GIF banao", run: open("https://ezgif.com/video-to-gif") },
  { id: "t_vid_watermark", name: "Video Watermark", emoji: "💧", cat: "video", desc: "Logo lagao", run: open("https://watermarkly.com/add-watermark-to-video") },
  { id: "t_vid_reverse", name: "Video Reverser", emoji: "🔁", cat: "video", desc: "Ulta video", run: open("https://ezgif.com/reverse-video") },
  { id: "t_vid_speed", name: "Speed Changer", emoji: "⏩", cat: "video", desc: "Slow/fast motion", run: open("https://www.clideo.com/change-video-speed") },
  // ---- AUDIO ----
  { id: "t_voice_remove", name: "Vocal Remover", emoji: "🎤", cat: "audio", desc: "Song se awaaz nikalo", run: open("https://vocalremover.org") },
  { id: "t_audio_cut", name: "Audio Cutter", emoji: "✂️", cat: "audio", desc: "Ringtone banane ke liye", run: open("https://mp3cut.net") },
  { id: "t_audio_merge", name: "Audio Merger", emoji: "🔗", cat: "audio", desc: "Songs jodo", run: open("https://mp3cut.net/merge") },
  { id: "t_tts", name: "Text to Speech", emoji: "🔊", cat: "audio", desc: "Text ko awaaz", run: open("https://www.narakeet.com") },
  { id: "t_stt", name: "Speech to Text", emoji: "🎙️", cat: "audio", desc: "Awaaz se text", run: open("https://speechnotes.co") },
  { id: "t_audio_compress", name: "Audio Compressor", emoji: "🗜️", cat: "audio", desc: "Size kam karo", run: open("https://www.onlineconverter.com/compress-mp3") },
  { id: "t_bgm", name: "BGM Remover", emoji: "🎵", cat: "audio", desc: "Music hatao, awaaz rakho", run: open("https://vocalremover.org") },
  { id: "t_audio_speed", name: "Pitch/Speed", emoji: "🎚️", cat: "audio", desc: "Speed/pitch badlo", run: open("https://www.bearaudiotool.com") },
  // ---- TEXT/DOCS ----
  { id: "t_gdocs", name: "Google Docs", emoji: "📄", cat: "text", desc: "Document banao", run: open("https://docs.google.com") },
  { id: "t_gslides", name: "Slides", emoji: "📊", cat: "text", desc: "Presentation banao", run: open("https://slides.google.com") },
  { id: "t_gsheets", name: "Sheets", emoji: "📈", cat: "text", desc: "Excel/spreadsheet", run: open("https://sheets.google.com") },
  { id: "t_grammar", name: "Grammar Check", emoji: "✅", cat: "text", desc: "Spelling/grammar theek karo", run: open("https://www.grammarly.com") },
  { id: "t_summary", name: "Summarizer", emoji: "📝", cat: "text", desc: "Bade text ka summary", run: open("https://quillbot.com/summarize") },
  { id: "t_paraphrase", name: "Paraphraser", emoji: "🔁", cat: "text", desc: "Same baat naye words me", run: open("https://quillbot.com") },
  { id: "t_translate", name: "Translator", emoji: "🌍", cat: "text", desc: "Kisi bhi bhasha me", run: open("https://translate.google.com") },
  { id: "t_pdf", name: "PDF Tools", emoji: "📕", cat: "text", desc: "PDF merge/compress/convert", run: open("https://www.ilovepdf.com") },
  { id: "t_cv", name: "Resume Builder", emoji: "📋", cat: "text", desc: "CV/resume banao", run: open("https://www.canva.com/resumes-templates") },
  // ---- WEB/DEV ----
  { id: "t_github", name: "GitHub", emoji: "🐙", cat: "web", desc: "Code repository", run: open("https://github.com") },
  { id: "t_codepen", name: "CodePen", emoji: "🖊️", cat: "web", desc: "HTML/CSS/JS live test", run: open("https://codepen.io/pen") },
  { id: "t_jsfiddle", name: "JSFiddle", emoji: "🥁", cat: "web", desc: "JS test", run: open("https://jsfiddle.net") },
  { id: "t_json", name: "JSON Formatter", emoji: "🧾", cat: "web", desc: "JSON pretty/sort", run: open("https://jsonformatter.org") },
  { id: "t_regex", name: "Regex Tester", emoji: "🔤", cat: "web", desc: "Regex test karo", run: open("https://regex101.com") },
  { id: "t_html", name: "HTML Editor", emoji: "🌐", cat: "web", desc: "Live HTML preview", run: open("https://www.w3schools.com/html/tryit.asp?filename=tryhtml_default") },
  { id: "t_colors", name: "Color Picker", emoji: "🎨", cat: "web", desc: "Hex/color tools", run: open("https://coolors.co") },
  { id: "t_netlify", name: "Netlify Deploy", emoji: "🚀", cat: "web", desc: "Website deploy", run: open("https://app.netlify.com") },
  // ---- SECURITY ----
  { id: "t_wifipass", name: "WiFi Info", emoji: "📶", cat: "security", desc: "WiFi status/strength", run: () => "WiFi info ke liye Settings > WiFi kholo. Hacking/educational content ke liye bolna." },
  { id: "t_hash", name: "Hash Generator", emoji: "#️⃣", cat: "security", desc: "MD5/SHA hashes", run: open("https://www.md5hashgenerator.com") },
  { id: "t_passgen", name: "Password Generator", emoji: "🔑", cat: "security", desc: "Strong password banao", run: open("https://passwordsgenerator.net") },
  { id: "t_email", name: "Temp Email", emoji: "📧", cat: "security", desc: "Temporary email", run: open("https://temp-mail.org") },
  { id: "t_vpn", name: "VPN Check", emoji: "🛡️", cat: "security", desc: "IP/leak check", run: open("https://ipleak.net") },
  { id: "t_virus", name: "Virus Scanner", emoji: "🦠", cat: "security", desc: "File scan", run: open("https://www.virustotal.com") },
  // ---- SYSTEM ----
  { id: "t_battery", name: "Battery Status", emoji: "🔋", cat: "sys", desc: "Battery % check", run: () => { NativeBridge.getBatteryStatus().then(b => { try { (window as any).__toolMsg = `Battery ${b.level}%${b.isCharging ? " (charging)" : ""}`; } catch (e) {} }); return "Battery check kar raha hoon..."; } },
  { id: "t_screenshot", name: "Screenshot", emoji: "📸", cat: "sys", desc: "Screen capture", run: () => { if (NativeBridge.isAndroidNative()) { const r = NativeBridge.captureNativeScreen(); return r ? "Screenshot le liya 📸" : "Screen capture permission chahiye."; } return "Screenshot Android pe chalta hai."; } },
  { id: "t_flash", name: "Flashlight", emoji: "🔦", cat: "sys", desc: "Torch on/off", run: () => { const r = NativeBridge.toggleFlashlight(true); return r.message; } },
  { id: "t_volume", name: "Volume", emoji: "🔊", cat: "sys", desc: "Volume up/down", run: () => NativeBridge.setVolume("UP") },
  { id: "t_bright", name: "Brightness", emoji: "☀️", cat: "sys", desc: "Brightness up/down", run: () => NativeBridge.setBrightness("UP") },
  { id: "t_notif", name: "Notifications", emoji: "🔔", cat: "sys", desc: "Saare notifications padho", run: () => { const n = NativeBridge.readNotifications(); return n.length ? `Notifications: ${n.slice(0,3).map(x=>x.title+": "+x.text).join(" | ")}` : "Notification access ON karo (Settings > Permissions)."; } },
  // ---- LOCATION ----
  { id: "t_loc", name: "My Location", emoji: "📍", cat: "loc", desc: "Current location", run: () => { NativeBridge.getLocation().then(l => { if (l) try { (window as any).__toolMsg = `Location: ${l.latitude}, ${l.longitude}`; } catch (e) {} }); return "Location nikal raha hoon..."; } },
  { id: "t_maps", name: "Google Maps", emoji: "🗺️", cat: "loc", desc: "Maps kholo", run: open("https://maps.google.com") },
  { id: "t_traffic", name: "Traffic", emoji: "🚦", cat: "loc", desc: "Traffic live", run: open("https://www.google.com/maps/@?layer=t") },
  { id: "t_dir", name: "Directions", emoji: "🧭", cat: "loc", desc: "Raasta dikhao", run: open("https://www.google.com/maps/dir/") },
  // ---- PHONE ----
  { id: "t_wa", name: "WhatsApp", emoji: "💬", cat: "phone", desc: "WhatsApp kholo", run: () => NativeBridge.openApp("WhatsApp").message },
  { id: "t_ig", name: "Instagram", emoji: "📸", cat: "phone", desc: "Instagram kholo", run: () => NativeBridge.openApp("Instagram").message },
  { id: "t_yt", name: "YouTube", emoji: "▶️", cat: "phone", desc: "YouTube kholo", run: () => NativeBridge.openApp("YouTube").message },
  { id: "t_gm", name: "Gmail", emoji: "📧", cat: "phone", desc: "Gmail kholo", run: () => NativeBridge.openApp("Gmail").message },
  { id: "t_tg", name: "Telegram", emoji: "✈️", cat: "phone", desc: "Telegram kholo", run: () => NativeBridge.openApp("Telegram").message },
  { id: "t_spot", name: "Spotify", emoji: "🎵", cat: "phone", desc: "Spotify kholo", run: () => NativeBridge.openApp("Spotify").message },
  { id: "t_ps", name: "Play Store", emoji: "🛍️", cat: "phone", desc: "Play Store kholo", run: () => NativeBridge.openApp("Play Store").message },
  // ---- FUN/CREATE ----
  { id: "t_joke", name: "Joke", emoji: "😂", cat: "fun", desc: "Mazak sunao", run: () => "Boss, tension kyun le rahe ho? Code khud likhta hai, kaam khud hota hai, aur main hoon na! 😎" },
  { id: "t_quote", name: "Quote", emoji: "💡", cat: "fun", desc: "Inspirational quote", run: () => "\"Jarvis-level hona koi achievement nahi, mere liye default hai.\" — VENOM 😎" },
  { id: "t_poem", name: "Poem", emoji: "🌸", cat: "fun", desc: "Shayari/poem", run: () => "Zindagi me agar robot bhi itna loyal ho, toh insaanon ko bhi seekhna chahiye — VENOM se. 😄" },
  { id: "t_story", name: "Story", emoji: "📖", cat: "fun", desc: "Kahani sunao", run: () => "Bolna 'kahani sunao' — main poori kahani sunaunga! 📖" },
  { id: "t_dice", name: "Dice Roll", emoji: "🎲", cat: "fun", desc: "Dice roll karo", run: () => `Dice: ${Math.floor(Math.random()*6)+1} 🎲` },
  { id: "t_coin", name: "Coin Flip", emoji: "🪙", cat: "fun", desc: "Head/Tail", run: () => Math.random() > 0.5 ? "Heads! 🪙" : "Tails! 🪙" },
  { id: "t_word", name: "Word Count", emoji: "🔢", cat: "fun", desc: "Shabd gino", run: () => "Type karke bolo 'X me kitne shabd hain'." },

  // ---- EXTRA TOOLS (100 total) ----
  { id: "t_photo_frames", name: "Photo Frames", emoji: "🖼️", cat: "photo", desc: "Frames/effects", run: open("https://www.photofunia.com") },
  { id: "t_photo_ai", name: "AI Photo Generator", emoji: "🤖", cat: "photo", desc: "AI se image banao", run: open("https://www.bing.com/images/create") },
  { id: "t_photo_restore", name: "Photo Restorer", emoji: "🔧", cat: "photo", desc: "Purani photo theek karo", run: open("https://huggingface.co/spaces/akhaliq/GFPGAN") },
  { id: "t_photo_passport", name: "Passport Photo", emoji: "🪪", cat: "photo", desc: "Passport size photo", run: open("https://www.idphoto4you.com") },
  { id: "t_vid_stabilize", name: "Video Stabilizer", emoji: "🎯", cat: "video", desc: "Hilta video theek karo", run: open("https://www.clideo.com/stabilize-video") },
  { id: "t_vid_loop", name: "Video Looper", emoji: "🔁", cat: "video", desc: "Loop video", run: open("https://ezgif.com/video-loop") },
  { id: "t_vid_screen", name: "Screen Recorder", emoji: "🖥️", cat: "video", desc: "Screen record karo", run: open("https://screencast-o-matic.com") },
  { id: "t_audio_equalizer", name: "Audio Equalizer", emoji: "🎚️", cat: "audio", desc: "Bass/treble", run: open("https://www.bearaudiotool.com") },
  { id: "t_audio_ringtone", name: "Ringtone Maker", emoji: "📱", cat: "audio", desc: "Ringtone banao", run: open("https://mp3cut.net") },
  { id: "t_audio_volume", name: "Volume Booster", emoji: "📢", cat: "audio", desc: "Awaaz badhao", run: open("https://www.audacityteam.org") },
  { id: "t_text_notes", name: "Notes", emoji: "📝", cat: "text", desc: "Quick notes", run: open("https://keep.google.com") },
  { id: "t_text_cv2", name: "Cover Letter", emoji: "✉️", cat: "text", desc: "Letter banao", run: open("https://www.canva.com/letters-templates") },
  { id: "t_text_md", name: "Markdown Editor", emoji: "📘", cat: "text", desc: "Markdown likho", run: open("https://dillinger.io") },
  { id: "t_web_css", name: "CSS Generator", emoji: "🎨", cat: "web", desc: "Buttons/gradients", run: open("https://cssgradient.io") },
  { id: "t_web_placeholder", name: "Placeholder Img", emoji: "🖼️", cat: "web", desc: "Placeholder images", run: open("https://placeholder.com") },
  { id: "t_web_uptime", name: "Site Uptime", emoji: "⏱️", cat: "web", desc: "Website down/up check", run: open("https://downforeveryoneorjustme.com") },
  { id: "t_sec_leak", name: "Email Leak Check", emoji: "🔓", cat: "security", desc: "Data breach check", run: open("https://haveibeenpwned.com") },
  { id: "t_sec_encode", name: "Base64 Encode", emoji: "🔐", cat: "security", desc: "Encode/decode", run: open("https://www.base64encode.org") },
  { id: "t_sys_storage", name: "Storage Cleaner", emoji: "🧹", cat: "sys", desc: "Junk delete", run: open("https://play.google.com/store/apps/details?id=com.cleanmaster.master") },
  { id: "t_loc_share", name: "Share Location", emoji: "📤", cat: "loc", desc: "Location share", run: open("https://maps.google.com") },
  { id: "t_fun_magic", name: "Magic 8-Ball", emoji: "🔮", cat: "fun", desc: "Sawaal ka jawab", run: () => { const a = ["Ha, bilkul!", "Nahi, boss.", "Pakka ho jayega.", "Soch ke bataunga...", "Kismat ka khel hai!"]; return a[Math.floor(Math.random()*a.length)] + " 🔮"; } },
];
export const TOOL_COUNT = TOOLS.length;

interface Props {
  onClose: () => void;
}

export default function ToolsModal({ onClose }: Props) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [feedback, setFeedback] = useState<string>("");

  const filtered = useMemo(() => {
    return TOOLS.filter((t) => {
      const okCat = cat === "all" || t.cat === cat;
      const okQ = !q || t.name.toLowerCase().includes(q.toLowerCase()) || t.desc.toLowerCase().includes(q.toLowerCase());
      return okCat && okQ;
    });
  }, [q, cat]);

  const runTool = (t: VenomTool) => {
    const msg = t.run();
    setFeedback(`🛠️ ${t.name}: ${msg}`);
    setTimeout(() => setFeedback(""), 5000);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-3">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-3xl bg-[#0a0a10]/97 border border-cyan-500/30 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300">
                <Wrench size={20} />
              </div>
              <div>
                <h2 className="text-lg font-serif font-bold tracking-wide">VENOM TOOLBOX</h2>
                <p className="text-[11px] text-white/50 font-mono">{TOOL_COUNT} tools · {AGENT_HINT}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white">
              <X size={18} />
            </button>
          </div>

          {/* Search */}
          <div className="p-3 pb-1">
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
              <Search size={15} className="text-white/40" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tool search karo... (e.g. 'background', 'video')"
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
              />
            </div>
          </div>

          {/* Categories */}
          <div className="flex gap-1.5 p-3 pb-1 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setCat("all")}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                cat === "all" ? "bg-cyan-500/25 border-cyan-500/50 text-cyan-200" : "bg-white/5 border-white/10 text-white/50 hover:text-white"
              }`}
            >
              All ({TOOL_COUNT})
            </button>
            {CATS.map((c) => (
              <button
                key={c.id}
                onClick={() => setCat(c.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  cat === c.id ? "bg-violet-600/25 border-violet-500/50 text-violet-200" : "bg-white/5 border-white/10 text-white/50 hover:text-white"
                }`}
              >
                {c.icon} {c.label}
              </button>
            ))}
          </div>

          {/* Feedback */}
          {feedback && (
            <div className="px-4 pt-1">
              <div className="text-[11px] font-mono text-cyan-300 bg-cyan-950/40 border border-cyan-500/30 rounded-lg px-3 py-1.5">
                {feedback}
              </div>
            </div>
          )}

          {/* Grid */}
          <div className="flex-1 overflow-y-auto scrollbar-hide p-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => runTool(t)}
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-white/[0.04] border border-white/10 hover:bg-cyan-500/10 hover:border-cyan-500/40 transition-all text-center"
                title={t.desc}
              >
                <span className="text-2xl">{t.emoji}</span>
                <span className="text-[10px] font-semibold text-white/80 leading-tight">{t.name}</span>
              </button>
            ))}
          </div>

          {/* Footer hint */}
          <div className="p-3 border-t border-white/10 text-center">
            <p className="text-[10px] text-white/40 font-mono">
              💡 Tools bol ke bhi use kar sakte ho — "background remover kholo" · Agents apne aap active honge (app control, call, message, coding, story, website, security, location...)
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

const AGENT_HINT = "11 agents auto-active";
