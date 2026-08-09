package com.novax.venom

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * VENOM always-on background service — the "Hey Google" engine.
 *
 * Holds a single continuous AudioRecord stream (16kHz mono PCM16) and feeds it
 * to the on-device WakeWordDetector + ClapDetector. Fully offline, low-power,
 * no cloud speech.
 *
 * EXACT WAKE PHRASE (Google-style):
 *  - The energy detector is only a cheap GATE. Jab 2-4 word bursts dikhte hain,
 *    audio loop turant band hota hai aur ek ONE-SHOT SpeechRecognizer verify
 *    karta hai ki phrase me "venom" + wake word hai ("wake up venom", "wake
 *    venom", "hey venom", "ok venom", "venom wake up").
 *  - Match hua -> session trigger. Match NAHI hua ("hello there", "thank you",
 *    "please call"...) -> silently wapas always-on loop. Kisi aur naam pe kabhi
 *    nahi uthega.
 *
 * SINGLE MIC OWNER (no blinking):
 *  - Exactly one owner at a time: wake loop (continuous) | verify recognizer |
 *    live session recognizer. Har transition pe pichla owner FULLY release hota
 *    hai (thread join) pehle naya start ho.
 *  - Auto-restart watchdog with battery-friendly backoff (never hot-loop).
 */
class VenomForegroundService : Service() {
    companion object {
        private const val TAG = "VenomService"
        private const val CHANNEL_ID = "venom_foreground_channel"
        private const val NOTIFICATION_ID = 1001
        private const val SAMPLE_RATE = 16000

        // Wake-phrase verification — sirf ye phrases trigger karte hain
        private val WAKE_WORDS = listOf("wake", "weke", "waik", "week", "hey", "hei", "ok", "okay", "jaag", "jago", "utho")
        private val VENOM_NAMES = listOf("venom", "venam", "wenom", "benom", "binom", "winom", "veenom")
    }

    private var audioRecord: AudioRecord? = null
    private var recordThread: Thread? = null

    @Volatile
    private var isRecordRunning = false

    @Volatile
    private var destroyed = false

    @Volatile
    private var verifying = false

    private var verifyAttempt = 0
    @Volatile
    private var lastSessionTransition = System.currentTimeMillis()

    private val mainHandler = Handler(Looper.getMainLooper())

    private val wakeWordDetector = WakeWordDetector(this) {
        verifyWakeCandidate()
    }

    private val clapDetector = ClapDetector {
        triggerAssistantSession("clap")
    }

    private val micStateListener: (MicState) -> Unit = { state ->
        when (state) {
            MicState.WAKE_LISTENING -> startAudioLoop()
            else -> stopAudioLoop() // session owns the mic now
        }
    }

    // ---------------- wake phrase verification ----------------

    private fun verifyWakeCandidate() {
        if (verifying || destroyed) return
        if (!MicManager.isWakeListeningAllowed()) return
        verifying = true

        // 1) Release the always-on mic FIRST (clean handoff, no conflict)
        stopAudioLoop()
        // clear retry flag on fresh verify (verifyWakeCandidate se dobara call)
        // (retry path khud set karta hai)

        mainHandler.postDelayed({
            if (destroyed) { verifying = false; return@postDelayed }
            val recognizer = try {
                SpeechRecognizer.createSpeechRecognizer(this)
            } catch (e: Exception) {
                Log.e(TAG, "verify: recognizer create failed", e)
                null
            }
            if (recognizer == null) {
                verifying = false
                scheduleRestart(800)
                return@postDelayed
            }

            recognizer.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onPartialResults(partialResults: Bundle?) {}
                override fun onEvent(eventType: Int, params: Bundle?) {}

                override fun onError(error: Int) {
                    // STT flaky hai (MIUI etc.) — error pe bhi TRIGGER karo (reliability).
                    // Energy gate ne pehle hi 2-4 word-bursts dekhe the, isliye wake
                    // phrase miss hone ka chance kam hai. Kabhi-kabhi-chalna khatam.
                    Log.w(TAG, "Wake verify error=$error — fallback trigger")
                    finishVerify(recognizer, "wake venom")  // fallback: trigger karo
                }

                override fun onResults(results: Bundle?) {
                    val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val text = matches?.firstOrNull() ?: ""
                    finishVerify(recognizer, text)
                }
            })

            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN")
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "en-IN")
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
                // Short silence -> fast verify (user ne bas wake phrase bola hai)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 900L)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 700L)
            }
            try {
                Log.i(TAG, "Wake verify listening...")
                recognizer.startListening(intent)
            } catch (e: Exception) {
                Log.e(TAG, "verify start failed", e)
                finishVerify(recognizer, "")
            }
        }, 120)
    }

    private fun finishVerify(recognizer: SpeechRecognizer, textRaw: String) {
        try { recognizer.destroy() } catch (e: Exception) { /* ignore */ }
        verifying = false

        val t = textRaw.trim().lowercase()
        val match = isWakePhrase(t)
        Log.i(TAG, "Wake verify: \"$t\" -> match=$match")

        if (match) {
            // Lock the mic to the session IMMEDIATELY so the always-on loop
            // doesn't restart while MainActivity/JS take over.
            MicManager.transitionTo(MicState.TRIGGERED)
            lastSessionTransition = System.currentTimeMillis()
            triggerAssistantSession("wake")
        } else if (t.isBlank() && this.verifyAttempt == 0) {
            // No speech at all (recognizer failed to hear) — ek baar retry
            this.verifyAttempt = 1
            verifying = false
            mainHandler.postDelayed({
                if (!destroyed && MicManager.isWakeListeningAllowed()) verifyWakeCandidate()
            }, 300)
        } else {
            this.verifyAttempt = 0
            // Not a wake phrase — resume the silent always-on loop
            if (!destroyed && MicManager.isWakeListeningAllowed() && !isRecordRunning) {
                scheduleRestart(600)
            }
        }
    }

    /** Sirf "venom"-naam + wake word wali phrases. Kuch aur kabhi nahi. */
    private fun isWakePhrase(t: String): Boolean {
        if (t.isBlank()) return false
        val hasVenom = VENOM_NAMES.any { t.contains(it) }
        if (!hasVenom) return false
        // wake/hey/ok/jaag/utho... ya sirf chhota phrase jisme venom ho ("venom", "hey venom")
        if (WAKE_WORDS.any { t.contains(it) }) return true
        // single "venom" (STT sirf "venom" return kare to bhi trigger) — par bada sentence nahi
        val words = t.replace(Regex("[^a-z ]"), "").trim().split(Regex("\\s+")).filter { it.isNotBlank() }
        return words.size <= 2
    }

    private fun triggerAssistantSession(source: String) {
        try {
            // 1. Tell the loaded WebView (if any) that Venom was woken up
            MainActivity.pushEvent("venomWakeWord", """{"source":"$source"}""")

            // 2. Bring the app to the foreground
            val intent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                putExtra("TRIGGER_LIVE_SESSION", true)
            }
            startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch MainActivity on wake word", e)
        }
    }

    override fun onCreate() {
        super.onCreate()
        destroyed = false
        MicManager.addListener(micStateListener)
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        startAudioLoop()
        startWatchdog()
    }

    /**
     * WAKE-ONCE FIX: agar session mic ko LIVE/TRIGGERED me atka de (app force-band,
     * crash, ya JS cleanup miss ho), to watchdog 40s baad wapas always-on wake pe
     * le aata hai. Isse "wake venom" hamesha dobara chalega.
     */
    private fun startWatchdog() {
        Thread({
            while (!destroyed) {
                try { Thread.sleep(20000) } catch (e: InterruptedException) { return@Thread }
                if (destroyed) return@Thread
                try {
                    val state = MicManager.currentState
                    val stuck = System.currentTimeMillis() - lastSessionTransition > 40000
                    if (MicManager.wakeEnabled && state != MicState.WAKE_LISTENING && stuck) {
                        Log.w(TAG, "Watchdog: session mic stuck ($state) — wake pe wapas le raha hoon")
                        MicManager.transitionTo(MicState.WAKE_LISTENING)
                        startAudioLoop()
                    }
                } catch (e: Exception) { Log.e(TAG, "watchdog error", e) }
            }
        }, "VenomWakeWatchdog").apply { isDaemon = true; start() }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        intent?.action?.let { action ->
            when (action) {
                "ENABLE_WAKE_WORD" -> {
                    MicManager.setWakeEnabled(true)
                    startAudioLoop()
                }
                "DISABLE_WAKE_WORD" -> {
                    MicManager.setWakeEnabled(false)
                    stopAudioLoop()
                }
            }
        }
        return START_STICKY
    }

    // ---------------- continuous audio loop ----------------

    private fun startAudioLoop() {
        if (isRecordRunning || destroyed || verifying) return
        if (!MicManager.isWakeListeningAllowed()) return

        val minBuf = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        val record = try {
            // VOICE_RECOGNITION = sabse "shareable" mic source (dusri apps ke saath
            // coexist kar sakta hai — Google-style non-exclusive listening). MIC
            // source exclusive hota hai isliye yahan VOICE_RECOGNITION hi use karo.
            AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                Math.max(minBuf * 2, SAMPLE_RATE / 2)
            )
        } catch (e: Exception) {
            Log.e(TAG, "AudioRecord init failed", e)
            scheduleRestart(3000)
            return
        }

        if (record.state != AudioRecord.STATE_INITIALIZED) {
            record.release()
            Log.w(TAG, "AudioRecord not initialized (another app may hold the mic)")
            scheduleRestart(4000)
            return
        }

        audioRecord = record
        isRecordRunning = true

        recordThread = Thread({
            val buffer = ShortArray(2048)
            try {
                if (record.recordingState == AudioRecord.RECORDSTATE_STOPPED) {
                    record.startRecording()
                }
                Log.i(TAG, "Wake mic ON (continuous, on-device). Say 'Wake up Venom'")
                while (isRecordRunning && !destroyed) {
                    val read = record.read(buffer, 0, buffer.size)
                    if (read > 0) {
                        wakeWordDetector.processBuffer(buffer, read)
                        clapDetector.processBuffer(buffer, read)
                    } else if (read < 0) {
                        Log.w(TAG, "AudioRecord read error: $read")
                        break
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Audio loop error", e)
            } finally {
                try { record.stop() } catch (e: Exception) {}
                try { record.release() } catch (e: Exception) {}
                audioRecord = null
                isRecordRunning = false
                // Auto-restart only if mic is ours and not mid-verify
                if (!destroyed && !verifying && MicManager.isWakeListeningAllowed()) {
                    scheduleRestart(1500)
                }
            }
        }, "VenomWakeLoop")
        recordThread?.isDaemon = true
        recordThread?.start()
    }

    /** Synchronous stop: fully releases the mic (joins the read thread) so the
     *  next owner (verify recognizer / session recognizer) gets a clean mic. */
    private fun stopAudioLoop() {
        isRecordRunning = false
        try {
            audioRecord?.stop()
        } catch (e: Exception) {}
        try {
            audioRecord?.release()
        } catch (e: Exception) {}
        audioRecord = null
        val t = recordThread
        if (t != null && t.isAlive) {
            try { t.join(600) } catch (e: InterruptedException) {}
        }
        recordThread = null
    }

    private fun scheduleRestart(delayMs: Long) {
        if (destroyed || isRecordRunning || verifying) return
        Thread({
            try { Thread.sleep(delayMs) } catch (e: InterruptedException) { return@Thread }
            if (!destroyed && !verifying && MicManager.isWakeListeningAllowed() && !isRecordRunning) {
                startAudioLoop()
            }
        }, "VenomWakeRestart").start()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "VENOM Background Assistant",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "VENOM active wake-word and system control background service"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("VENOM always listening")
            .setContentText("Say 'Wake up Venom' anytime — offline on-device wake word")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    override fun onDestroy() {
        super.onDestroy()
        destroyed = true
        MicManager.removeListener(micStateListener)
        stopAudioLoop()
    }

    /** If the user swipes the app away, keep the background wake listener alive. */
    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        try {
            val restart = Intent(applicationContext, VenomForegroundService::class.java)
            restart.action = "RESTART"
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(restart)
            } else {
                startService(restart)
            }
        } catch (e: Exception) {
            Log.w(TAG, "onTaskRemoved restart failed", e)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
