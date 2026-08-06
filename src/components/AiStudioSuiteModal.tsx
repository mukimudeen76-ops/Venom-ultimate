import React, { useState } from "react";
import { X, Brain, Search, MapPin, Eye, Image as ImageIcon, Music, Loader2, Sparkles, Download, Play, Pause } from "lucide-react";
import {
  getVenomThinkingResponse,
  getVenomSearchResponse,
  getVenomMapsResponse,
  analyzeImageWithVenom,
  generateImageWithVenom,
  generateMusicWithVenom
} from "../services/geminiService";

interface AiStudioSuiteModalProps {
  onClose: () => void;
}

type TabType = "thinking" | "search" | "maps" | "vision" | "imageGen" | "musicGen";

export default function AiStudioSuiteModal({ onClose }: AiStudioSuiteModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("thinking");
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [resultText, setResultText] = useState("");
  const [sources, setSources] = useState<{ title?: string; uri?: string }[]>([]);
  
  // Vision state
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  // Image Gen state
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "16:9" | "9:16" | "4:3" | "3:4">("1:1");
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);

  // Music state
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [lyrics, setLyrics] = useState<string>("");
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const handleRun = async () => {
    if (!prompt.trim() && activeTab !== "vision") return;
    setLoading(true);
    setResultText("");
    setSources([]);
    setGeneratedImageUrl(null);
    setGeneratedAudioUrl(null);

    try {
      if (activeTab === "thinking") {
        const res = await getVenomThinkingResponse(prompt);
        setResultText(res);
      } else if (activeTab === "search") {
        const res = await getVenomSearchResponse(prompt);
        setResultText(res.text);
        setSources(res.sources);
      } else if (activeTab === "maps") {
        const res = await getVenomMapsResponse(prompt);
        setResultText(res.text);
        setSources(res.sources);
      } else if (activeTab === "vision") {
        if (!selectedImage) {
          setResultText("Please select or upload an image first.");
        } else {
          const res = await analyzeImageWithVenom(selectedImage, prompt || "Analyze this image");
          setResultText(res);
        }
      } else if (activeTab === "imageGen") {
        const res = await generateImageWithVenom(prompt, aspectRatio);
        if (res.imageUrl) {
          setGeneratedImageUrl(res.imageUrl);
          setResultText(res.message);
        } else {
          setResultText(res.message);
        }
      } else if (activeTab === "musicGen") {
        const res = await generateMusicWithVenom(prompt);
        if (res.audioUrl) {
          setGeneratedAudioUrl(res.audioUrl);
          if (res.lyrics) setLyrics(res.lyrics);
          setResultText(res.message);
        } else {
          setResultText(res.message);
        }
      }
    } catch (e) {
      setResultText("An error occurred during execution.");
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleAudio = () => {
    if (!audioRef.current || !generatedAudioUrl) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play();
      setIsPlayingAudio(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
      <div className="bg-[#0e0e17] border border-cyan-500/30 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-gradient-to-r from-cyan-950/40 via-violet-950/40 to-cyan-950/40">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-cyan-500/20 text-cyan-400 rounded-lg border border-cyan-500/30">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">VENOM AI Studio Suite</h2>
              <p className="text-xs text-gray-400">High Reasoning, Grounded Search, Vision, Image & Music Studio</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex overflow-x-auto border-b border-white/10 bg-black/40 p-2 gap-1 text-xs font-medium">
          <button
            onClick={() => setActiveTab("thinking")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === "thinking"
                ? "bg-violet-600 text-white shadow-lg shadow-violet-600/30"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Brain size={15} />
            Deep Thinking
          </button>
          <button
            onClick={() => setActiveTab("search")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === "search"
                ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/30"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Search size={15} />
            Web Search
          </button>
          <button
            onClick={() => setActiveTab("maps")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === "maps"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <MapPin size={15} />
            Maps Search
          </button>
          <button
            onClick={() => setActiveTab("vision")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === "vision"
                ? "bg-amber-600 text-white shadow-lg shadow-amber-600/30"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Eye size={15} />
            Image Vision
          </button>
          <button
            onClick={() => setActiveTab("imageGen")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === "imageGen"
                ? "bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-600/30"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <ImageIcon size={15} />
            Image Gen
          </button>
          <button
            onClick={() => setActiveTab("musicGen")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === "musicGen"
                ? "bg-rose-600 text-white shadow-lg shadow-rose-600/30"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Music size={15} />
            Music Studio
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          
          {/* Controls per Tab */}
          {activeTab === "thinking" && (
            <div className="bg-violet-950/20 border border-violet-500/20 p-3 rounded-xl text-xs text-violet-300">
              ⚡ <strong>High Reasoning Mode</strong>: Uses Gemini Pro with high thinking levels to solve complex logic, coding, or math problems.
            </div>
          )}

          {activeTab === "search" && (
            <div className="bg-cyan-950/20 border border-cyan-500/20 p-3 rounded-xl text-xs text-cyan-300">
              🌐 <strong>Google Search Grounding</strong>: Queries live web search data with grounded source links.
            </div>
          )}

          {activeTab === "maps" && (
            <div className="bg-emerald-950/20 border border-emerald-500/20 p-3 rounded-xl text-xs text-emerald-300">
              📍 <strong>Google Maps Grounding</strong>: Get real-time geographical data and location details.
            </div>
          )}

          {activeTab === "vision" && (
            <div className="space-y-3">
              <div className="bg-amber-950/20 border border-amber-500/20 p-3 rounded-xl text-xs text-amber-300">
                👁️ <strong>Image Vision & Understanding</strong>: Upload a photo and ask Venom to analyze or extract insights from it.
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="text-xs text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-amber-500/20 file:text-amber-300 hover:file:bg-amber-500/30 cursor-pointer"
                />
                {selectedImage && (
                  <img src={selectedImage} alt="Preview" className="w-12 h-12 rounded-lg object-cover border border-amber-500/40" />
                )}
              </div>
            </div>
          )}

          {activeTab === "imageGen" && (
            <div className="space-y-3">
              <div className="bg-fuchsia-950/20 border border-fuchsia-500/20 p-3 rounded-xl text-xs text-fuchsia-300">
                🎨 <strong>Image Generation with Aspect Ratios</strong>: Create studio-grade images with explicit aspect ratio settings.
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 font-medium">Aspect Ratio:</span>
                {(["1:1", "16:9", "9:16", "4:3", "3:4"] as const).map((ratio) => (
                  <button
                    key={ratio}
                    onClick={() => setAspectRatio(ratio)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                      aspectRatio === ratio
                        ? "bg-fuchsia-600 border-fuchsia-400 text-white"
                        : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === "musicGen" && (
            <div className="bg-rose-950/20 border border-rose-500/20 p-3 rounded-xl text-xs text-rose-300">
              🎵 <strong>Lyria Music Studio</strong>: Describe a musical vibe, genre, or mood to generate a custom 30s audio track.
            </div>
          )}

          {/* Prompt Input */}
          <div className="space-y-2">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                activeTab === "thinking"
                  ? "Describe a complex math problem, strategy, or algorithm..."
                  : activeTab === "search"
                  ? "What are the latest tech news or weather updates?"
                  : activeTab === "maps"
                  ? "Where can I find top sushi restaurants in Tokyo?"
                  : activeTab === "vision"
                  ? "What is in this picture? Explain in detail..."
                  : activeTab === "imageGen"
                  ? "A futuristic cyberpunk city with neon lights..."
                  : "A synthwave 80s upbeat electronic track with heavy bass..."
              }
              rows={3}
              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors placeholder:text-gray-600"
            />
            <button
              onClick={handleRun}
              disabled={loading || (!prompt.trim() && activeTab !== "vision")}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-600 to-violet-600 hover:from-cyan-500 hover:to-violet-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  <span>Processing request...</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>Execute {activeTab.toUpperCase()} Task</span>
                </>
              )}
            </button>
          </div>

          {/* Results Output Section */}
          {(resultText || generatedImageUrl || generatedAudioUrl) && (
            <div className="bg-black/50 border border-white/10 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                <Sparkles size={14} /> Output Results
              </h3>

              {/* Generated Image Output */}
              {generatedImageUrl && (
                <div className="flex flex-col items-center gap-2">
                  <img
                    src={generatedImageUrl}
                    alt="Generated output"
                    className="max-h-64 rounded-xl border border-white/20 shadow-2xl object-contain"
                  />
                  <a
                    href={generatedImageUrl}
                    download="venom-generated.png"
                    className="flex items-center gap-1 text-xs text-fuchsia-400 hover:underline"
                  >
                    <Download size={12} /> Download High-Res Image
                  </a>
                </div>
              )}

              {/* Generated Audio Output */}
              {generatedAudioUrl && (
                <div className="p-3 bg-rose-950/30 border border-rose-500/30 rounded-xl flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-rose-300 font-medium flex items-center gap-2">
                      <Music size={16} /> Lyria Audio Clip Ready
                    </span>
                    <button
                      onClick={toggleAudio}
                      className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                    >
                      {isPlayingAudio ? <Pause size={14} /> : <Play size={14} />}
                      {isPlayingAudio ? "Pause" : "Play Music"}
                    </button>
                  </div>
                  <audio
                    ref={audioRef}
                    src={generatedAudioUrl}
                    onEnded={() => setIsPlayingAudio(false)}
                    className="hidden"
                  />
                  {lyrics && (
                    <div className="text-xs text-gray-300 italic border-t border-rose-500/20 pt-2">
                      <strong>Lyrics/Theme:</strong> {lyrics}
                    </div>
                  )}
                </div>
              )}

              {/* Text Output */}
              {resultText && (
                <div className="text-xs text-gray-200 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                  {resultText}
                </div>
              )}

              {/* Grounding Sources */}
              {sources.length > 0 && (
                <div className="border-t border-white/10 pt-2 space-y-1">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase">Grounded Sources:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {sources.map((s, idx) => (
                      <a
                        key={idx}
                        href={s.uri}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 px-2 py-0.5 rounded hover:bg-cyan-900/50 transition-colors truncate max-w-xs"
                      >
                        🔗 {s.title || s.uri}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
