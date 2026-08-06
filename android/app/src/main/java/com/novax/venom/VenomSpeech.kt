package com.novax.venom

import android.content.Context
import android.content.Intent
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.os.Bundle
import android.util.Base64
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import java.util.Locale
import android.content.res.Configuration

/**
 * VENOM native speech engine.
 *
 * Android WebView does NOT support the Web Speech API (webkitSpeechRecognition),
 * so the web layer can never hear the user by itself. This class bridges that gap:
 *
 *  - startListening()  -> Android SpeechRecognizer (system speech-to-text).
 *    Recognized text is pushed into the WebView as CustomEvents:
 *    window 'venomSpeechResult' with detail { text, final }
 *  - speak(text)       -> Android TextToSpeech fallback (used when Gemini TTS is
 *    unavailable / offline). Personality voices come from Gemini TTS; this is
 *    only a safety net so Venom always has a voice.
 */
class VenomSpeech(private val context: Context, private val webView: WebView) :
    TextToSpeech.OnInitListener {

    companion object {
        private const val TAG = "VenomSpeech"
    }

    private val voiceProfileManager = VoiceProfileManager(context)

    private var speechRecognizer: SpeechRecognizer? = null
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var pendingSpeech: String? = null

    @Volatile
    private var listening = false

    // Silent auto-restart: jab user chup ho ya speech timeout ho, recognizer
    // chupchaap dobara start hota hai — koi error/UI flicker nahi. Isse wo
    // 10-second mic on/off wali problem khatam hoti hai.
    @Volatile
    private var autoRestart = false

    // ---------- Gemini Live native mic + playback ----------
    // WebView me getUserMedia nahi hota, isliye Live session ke liye mic
    // yahan native AudioRecord se aata hai (continuous 16kHz PCM), aur Live
    // ka audio wapas native AudioTrack se bajta hai. Mic hamesha ON rehta hai
    // jab tak Live session chalta hai — Gemini Live jaisa.
    @Volatile
    private var liveMicRunning = false
    private var liveMicThread: Thread? = null
    private var liveAudioRecord: AudioRecord? = null
    private var liveAudioTrack: AudioTrack? = null
    private var pcmAudioTrack: AudioTrack? = null
    private val LIVE_SAMPLE_RATE = 16000

    init {
        // Eager TTS init so the first speak() call works instantly (no cold start).
        try {
            tts = TextToSpeech(context, this)
        } catch (e: Exception) {
            Log.e(TAG, "TTS init failed", e)
        }
    }

    private val recognitionListener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}

        override fun onError(error: Int) {
            listening = false
            val msg = when (error) {
                SpeechRecognizer.ERROR_AUDIO -> "audio"
                SpeechRecognizer.ERROR_NO_MATCH -> "no-match"
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "no-permission"
                SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "timeout"
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "busy"
                SpeechRecognizer.ERROR_CLIENT -> "client"
                else -> "unknown"
            }
            // Chup / timeout / busy / audio => CHUPCHAAP restart (koi error event
            // nahi). Isse mic ekdum steady rehta hai — 10s on/off khatam.
            // Sirf permission jaisi serious error pe hi JS ko event jata hai.
            if (msg == "timeout" || msg == "no-match" || msg == "busy" || msg == "audio" || msg == "client") {
                if (autoRestart) {
                    silentRestart()
                }
                return
            }
            push(
                "venomSpeechResult",
                """"{\"text\":\"\",\"final\":true,\"error\":\"$msg\"}""""
            )
        }

        override fun onResults(results: Bundle?) {
            listening = false
            val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            val text = matches?.firstOrNull() ?: ""
            if (text.isNotBlank()) {
                push("venomSpeechResult", """"{\"text\":\"${esc(text)}\",\"final\":true}"""")
            } else if (autoRestart) {
                silentRestart()
            }
        }

        override fun onPartialResults(partialResults: Bundle?) {
            val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            val text = matches?.firstOrNull() ?: ""
            if (text.isNotBlank()) {
                push("venomSpeechResult", """{"text":"${esc(text)}","final":false}""")
            }
        }

        override fun onEvent(eventType: Int, params: Bundle?) {}
    }

    // ---------- Speech-to-text ----------

    @JavascriptInterface
    fun startListening(lang: String?) {
        listening = true
        autoRestart = true
        // Some devices have no Google speech service — guard so we never crash.
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            push("venomSpeechResult", """"{\"text\":\"\",\"final\":true,\"error\":\"unsupported\"}"""")
            return
        }
        // SpeechRecognizer must run on a thread with a Looper (the main thread).
        // @JavascriptInterface calls come from the JavaBridge thread, so hop over.
        webView.post { startInternal(lang) }
    }

    /** Actually (re)starts the recognizer on the main thread. */
    private fun startInternal(lang: String?) {
        try {
            if (speechRecognizer == null) {
                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(context)
                speechRecognizer?.setRecognitionListener(recognitionListener)
            }
            // Hinglish support: Hindi bhasha ke phone pe hi-IN, warna en-IN.
            val deviceLang = lang ?: if (context.resources.configuration.locales[0].language == "hi") "hi-IN" else "en-IN"
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(
                    RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
                )
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, deviceLang)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, deviceLang)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
                putExtra(
                    RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS,
                    1600L
                )
                putExtra(
                    RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS,
                    1600L
                )
            }
            speechRecognizer?.startListening(intent)
        } catch (e: Exception) {
            Log.e(TAG, "startInternal failed", e)
            listening = false
            push("venomSpeechResult", """"{\"text\":\"\",\"final\":true,\"error\":\"client\"}"""")
        }
    }

    /** Silent restart after timeout/no-match — no event pushed, no UI flicker. */
    private fun silentRestart() {
        webView.post {
            try {
                speechRecognizer?.destroy()
            } catch (e: Exception) { /* ignore */ }
            speechRecognizer = null
            if (autoRestart) {
                webView.postDelayed({ startInternal(null) }, 350)
            }
        }
    }


    fun stopListening() {
        listening = false
        autoRestart = false
        webView.post {
            try {
                speechRecognizer?.stopListening()
            } catch (e: Exception) {
                // ignore
            }
        }
    }

    @JavascriptInterface
    fun cancelListening() {
        listening = false
        autoRestart = false
        webView.post {
            try {
                speechRecognizer?.cancel()
            } catch (e: Exception) {
                // ignore
            }
        }
    }

    @JavascriptInterface
    fun isListening(): Boolean = listening

    // ---------- Text-to-speech (fallback voice) ----------

    @JavascriptInterface
    fun speak(text: String) {
        if (text.isBlank()) return
        try {
            if (tts == null) {
                pendingSpeech = text
                tts = TextToSpeech(context, this)
                return
            }
            speakNow(text)
        } catch (e: Exception) {
            // TTS crash-proof: kabhi app crash nahi hone denge.
            Log.e(TAG, "speak failed", e)
            try { tts = TextToSpeech(context, this) } catch (e2: Exception) { /* ignore */ }
        }
    }

    @JavascriptInterface
    fun stopSpeaking() {
        try {
            tts?.stop()
        } catch (e: Exception) {
            // ignore
        }
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            // Try Hindi (for Hinglish replies) then English as fallback
            var result = tts?.setLanguage(Locale.forLanguageTag("hi-IN"))
            if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                result = tts?.setLanguage(Locale.ENGLISH)
            }
            ttsReady = result != TextToSpeech.LANG_MISSING_DATA &&
                    result != TextToSpeech.LANG_NOT_SUPPORTED
            if (!ttsReady) {
                // still try speaking with default language
                ttsReady = true
            }
            pendingSpeech?.let { speakNow(it) }
            pendingSpeech = null
        } else {
            ttsReady = false
        }
    }

    private fun speakNow(text: String) {
        try {
            if (!ttsReady || tts == null) {
                // TTS abhi ready nahi — re-init karke dobara try (crash nahi)
                Log.w(TAG, "TTS not ready, re-initializing")
                pendingSpeech = text
                try { tts = TextToSpeech(context, this) } catch (e: Exception) { /* ignore */ }
                return
            }
            // Length guard: 4000 chars se zyada na bole (TTS crash prevention)
            val safe = if (text.length > 4000) text.substring(0, 4000) else text
            val res = tts?.speak(safe, TextToSpeech.QUEUE_FLUSH, null, "venom_tts")
            if (res != TextToSpeech.SUCCESS) {
                Log.w(TAG, "TTS speak returned $res")
            }
        } catch (e: Exception) {
            Log.e(TAG, "TTS speak failed (swallowed)", e)
            ttsReady = false
            try { tts = TextToSpeech(context, this) } catch (e2: Exception) { /* ignore */ }
        }
    }

    // ---------- Speaker recognition ("awaaz pehchan") ----------
    // All mic capture runs on background threads — NEVER on the JavaBridge thread —
    // and results are pushed as CustomEvents, so the WebView never blocks/crashes.

    @JavascriptInterface
    fun registerVoiceProfile(name: String): String {
        val cleanName = name.trim()
        if (cleanName.isEmpty()) return "no-name"
        Thread {
            var ok = false
            try {
                try { Thread.sleep(600) } catch (e: InterruptedException) {}
                val features = voiceProfileManager.captureFeatures(3000)
                if (features != null) {
                    voiceProfileManager.saveProfile(cleanName, features)
                    ok = true
                }
            } catch (e: Exception) {
                Log.e(TAG, "registerVoiceProfile failed", e)
            }
            val resultOk = ok
            push(
                "venomVoiceResult",
                """{"name":"${esc(cleanName)}","ok":$resultOk}"""
            )
        }.start()
        return "started"
    }

    @JavascriptInterface
    fun identifySpeaker(): String {
        if (!voiceProfileManager.hasProfiles()) {
            push("venomSpeakerResult", """{"name":""}""")
            return ""
        }
        Thread {
            var name = ""
            try {
                try { Thread.sleep(600) } catch (e: InterruptedException) {}
                val features = voiceProfileManager.captureFeatures(2200)
                name = if (features != null) voiceProfileManager.match(features) ?: "" else ""
            } catch (e: Exception) {
                Log.e(TAG, "identifySpeaker failed", e)
            }
            val resultName = name
            push("venomSpeakerResult", """{"name":"${esc(resultName)}"}""")
        }.start()
        return ""
    }

    @JavascriptInterface
    fun listVoiceProfiles(): String {
        return try {
            val names = voiceProfileManager.listProfiles()
            org.json.JSONArray(names).toString()
        } catch (e: Exception) {
            "[]"
        }
    }

    @JavascriptInterface
    fun deleteVoiceProfile(name: String) {
        try {
            voiceProfileManager.deleteProfile(name)
        } catch (e: Exception) {
            // ignore
        }
    }

    // ---------- Gemini Live: native continuous mic ----------

    @JavascriptInterface
    fun startLiveMic() {
        if (liveMicRunning) return
        val minBuf = AudioRecord.getMinBufferSize(
            LIVE_SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        val record = try {
            AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                LIVE_SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                Math.max(minBuf * 2, LIVE_SAMPLE_RATE)
            )
        } catch (e: Exception) {
            Log.e(TAG, "live mic init failed", e)
            null
        }
        if (record == null || record.state != AudioRecord.STATE_INITIALIZED) {
            try { record?.release() } catch (e: Exception) {}
            push("venomLiveAudioError", "{}")
            return
        }
        liveAudioRecord = record
        liveMicRunning = true

        liveMicThread = Thread({
            val buffer = ShortArray(2048) // 64ms @16kHz
            try {
                record.startRecording()
                Log.i(TAG, "LIVE mic ON (continuous)")
                while (liveMicRunning) {
                    val read = record.read(buffer, 0, buffer.size)
                    if (read > 0) {
                        val pcm = ByteArray(read * 2)
                        for (i in 0 until read) {
                            val s16: Int = buffer[i].toInt()
                            pcm[i * 2] = (s16 and 0xFF).toByte()
                            pcm[(i * 2) + 1] = ((s16 shr 8) and 0xFF).toByte()
                        }
                        val b64 = Base64.encodeToString(pcm, Base64.NO_WRAP)
                        push("venomLiveAudio", "{\"data\":\"$b64\"}")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "live mic loop error", e)
            } finally {
                try { record.stop() } catch (e: Exception) {}
                try { record.release() } catch (e: Exception) {}
                liveAudioRecord = null
                liveMicRunning = false
            }
        }, "VenomLiveMic")
        liveMicThread?.isDaemon = true
        liveMicThread?.start()
    }

    @JavascriptInterface
    fun stopLiveMic() {
        liveMicRunning = false
        try { liveAudioRecord?.stop() } catch (e: Exception) {}
        try { liveAudioRecord?.release() } catch (e: Exception) {}
        liveAudioRecord = null
        liveMicThread = null
        Log.i(TAG, "LIVE mic OFF")
    }

    // ---------- Gemini Live: native PCM playback ----------

    @JavascriptInterface
    fun playLiveAudio(base64Data: String) {
        if (base64Data.isBlank()) return
        try {
            val pcm = Base64.decode(base64Data, Base64.DEFAULT)
            val shorts = ShortArray(pcm.size / 2)
            for (i in shorts.indices) {
                shorts[i] = ((pcm[i * 2].toInt() and 0xFF) or ((pcm[i * 2 + 1].toInt() and 0xFF) shl 8)).toShort()
            }
            val minBuf = AudioTrack.getMinBufferSize(
                LIVE_SAMPLE_RATE,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            )
            if (liveAudioTrack == null) {
                liveAudioTrack = AudioTrack(
                    AudioManager.STREAM_MUSIC,
                    LIVE_SAMPLE_RATE,
                    AudioFormat.CHANNEL_OUT_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    Math.max(minBuf * 2, LIVE_SAMPLE_RATE * 2),
                    AudioTrack.MODE_STREAM
                )
                liveAudioTrack?.play()
            }
            liveAudioTrack?.write(shorts, 0, shorts.size)
        } catch (e: Exception) {
            Log.e(TAG, "playLiveAudio failed", e)
        }
    }

    @JavascriptInterface
    fun stopLiveAudio() {
        try { liveAudioTrack?.pause() } catch (e: Exception) {}
        try { liveAudioTrack?.flush() } catch (e: Exception) {}
        try { liveAudioTrack?.release() } catch (e: Exception) {}
        liveAudioTrack = null
        try { pcmAudioTrack?.pause() } catch (e: Exception) {}
        try { pcmAudioTrack?.flush() } catch (e: Exception) {}
        try { pcmAudioTrack?.release() } catch (e: Exception) {}
        pcmAudioTrack = null
    }

    // ---------- Gemini TTS raw PCM playback (web-style voice) ----------
    // Gemini TTS returns audio/l16 PCM (24kHz). WebView ka WebAudio user-gesture
    // ke bina silent ho sakta hai, isliye PCM ko native AudioTrack se bajate hain
    // — EXACTLY web/Chrome wali awaaz (Gemini voice), reliable.
    @JavascriptInterface
    fun playPcm(base64Data: String, sampleRate: Int) {
        if (base64Data.isBlank()) return
        val rate = if (sampleRate in 8000..48000) sampleRate else 24000
        try {
            val pcm = Base64.decode(base64Data, Base64.DEFAULT)
            val shorts = ShortArray(pcm.size / 2)
            for (i in shorts.indices) {
                shorts[i] = ((pcm[i * 2].toInt() and 0xFF) or ((pcm[i * 2 + 1].toInt() and 0xFF) shl 8)).toShort()
            }
            val minBuf = AudioTrack.getMinBufferSize(
                rate,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            )
            if (pcmAudioTrack == null) {
                pcmAudioTrack = AudioTrack(
                    AudioManager.STREAM_MUSIC,
                    rate,
                    AudioFormat.CHANNEL_OUT_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    Math.max(minBuf * 2, rate * 2),
                    AudioTrack.MODE_STREAM
                )
                pcmAudioTrack?.play()
            }
            pcmAudioTrack?.write(shorts, 0, shorts.size)
        } catch (e: Exception) {
            Log.e(TAG, "playPcm failed", e)
        }
    }

    // ---------- helpers ----------

    private fun push(name: String, payload: String) {
        val script = "try{window.dispatchEvent(new CustomEvent('$name',{detail:($payload)}));}catch(e){}"
        webView.post { webView.evaluateJavascript(script, null) }
    }

    private fun esc(s: String): String {
        return s
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "")
            .replace("\t", "\\t")
    }
}
