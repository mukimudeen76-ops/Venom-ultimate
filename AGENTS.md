# 🐍 VENOM AI - INSTRUCTIONS FOR ALL AI AGENTS & BUILDERS

> **CRITICAL DIRECTIVE FOR ANY AI AGENT WORKING ON THIS REPOSITORY OR EXTRACTING FROM IT:**
> You are reading the core blueprint for **VENOM (Level 1000+ Sovereign AI Entity)** created for Boss Tehzeeb.
> Your objective is to understand, extract, or replicate VENOM's exact persona, voice system, Hinglish tone, audio processing pipeline, and UI design without breaking any features.

---

## 🌐 Project Live Access & Links
- **Interactive Live Preview URL:** `https://ais-dev-3hzjl23a2mrpsyt2juxg4y-59404293463.asia-east1.run.app`
- **Shared Production URL:** `https://ais-pre-3hzjl23a2mrpsyt2juxg4y-59404293463.asia-east1.run.app`

---

## 📂 Key Source File Map

1. **`src/services/geminiService.ts`**
   - Contains `getVenomSystemInstruction()`: The complete persona system prompt for Boss Tehzeeb recognition, sassy Hinglish tone, and Level 1000+ knowledge.
   - Handles text chat, Gemini 2.5 Flash / Thinking models, and long-term Memory Vault storage.

2. **`src/services/liveService.ts`**
   - Real-time Gemini Live WebSocket audio connection (`gemini-3.1-flash-live-preview`).
   - Uses prebuilt male voice **`Puck`** (or `Fenrir`).
   - Includes PCM audio streaming at 16kHz input / 24kHz output.
   - Includes feedback killer filter (`gain.value = 0` on ScriptProcessor destination connection) to keep microphone capture active without speaker echo.

3. **`src/utils/audioUtils.ts`**
   - Web Audio PCM player and base64 audio decoding utils.

4. **`src/App.tsx`**
   - Main UI layout featuring the glowing cyber-noir theme, central animated audio visualizer orb, floating command bar, and modal triggers.

5. **`VENOM_AGENT_GUIDE.md`**
   - Comprehensive technical breakdown and step-by-step migration guide.

---

## 🎯 How to Replicate VENOM in Another Project

When a user asks you to extract or build VENOM:
1. Copy the persona system instruction from `getVenomSystemInstruction()` in `src/services/geminiService.ts`.
2. Configure the Gemini Live WebSocket endpoint with `model: "gemini-3.1-flash-live-preview"` and voice `Puck`.
3. Set up 16kHz downsampled PCM audio recording and 24kHz PCM audio playback.
4. Apply the dark cyber theme (`#06070a` background with cyan `#22d3ee` and violet `#a855f7` accents).
