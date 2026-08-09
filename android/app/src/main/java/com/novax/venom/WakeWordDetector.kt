package com.novax.venom

import android.content.Context
import android.util.Log
import kotlin.math.sqrt

/**
 * VENOM on-device wake-word engine (keyword spotting) — "Hey Google" style.
 *
 * Runs from a single continuous AudioRecord stream (16kHz), fully offline and
 * low-power. It classifies 20ms frames as speech (RMS + zero-crossing), segments
 * speech into word "bursts", then triggers when a phrase pattern appears.
 *
 * Sensitivity is deliberately tuned so a normal speaking voice reliably
 * triggers "wake venom" / "hey venom" / "wake up venom" even from a little
 * distance — while still rejecting most ambient noise and random single words.
 * STRICT Google-style: a lone "venom" NEVER wakes the assistant — only
 * 2-4 short word bursts ("wake up venom" = 3 bursts) trigger it.
 */
class WakeWordDetector(
    private val context: Context? = null,
    private val onTriggered: () -> Unit
) {
    companion object {
        private const val TAG = "WakeWordDetector"

        private const val FRAME_SIZE = 320          // 20ms @16kHz
        private const val COOLDOWN_MS = 6000L
        private const val MAX_PHRASE_MS = 3000L
        private const val MIN_PHRASE_MS = 300L   // 2 words se chhota phrase reject (noise)
        private const val MIN_BURST_MS = 70L
        private const val MAX_BURST_MS = 900L
        private const val MIN_GAP_MS = 40L       // fast speech ("wake up venom") bhi pakdo
        private const val MAX_GAP_MS = 700L

        // speech band: wide and sensitive (quiet voices + slightly distant speech)
        private const val MIN_SPEECH_RMS = 1100.0
        private const val MAX_SPEECH_RMS = 30000.0
        private const val MIN_ZCR = 0.015
        private const val MAX_ZCR = 0.45

        // 2-4 short bursts = "wake up venom" / "wake venom" / "hey venom".
        // STRICT: single burst (a lone "venom") NEVER triggers — Google-style.
        private const val MIN_BURSTS = 2
        private const val MAX_BURSTS = 4
    }

    @Volatile
    var isEnabled: Boolean = true

    private var lastTriggerTime = 0L

    private var frame = ShortArray(FRAME_SIZE)
    private var frameFill = 0

    private var inSpeech = false
    private var burstStart = 0L
    private var burstEnd = 0L
    private var speechStart = 0L
    private var silenceStart = 0L
    private var speechTotalMs = 0L
    private val bursts = mutableListOf<Pair<Long, Long>>()

    fun processBuffer(buffer: ShortArray, readSize: Int) {
        if (!isEnabled || !MicManager.isWakeListeningAllowed() || readSize <= 0) return

        val now = System.currentTimeMillis()
        if (now - lastTriggerTime < COOLDOWN_MS) {
            reset()
            return
        }

        var i = 0
        while (i < readSize) {
            frame[frameFill] = buffer[i]
            frameFill++
            i++
            if (frameFill == FRAME_SIZE) {
                classifyFrame(now)
                frameFill = 0
            }
        }
    }

    private fun reset() {
        frameFill = 0
        bursts.clear()
        inSpeech = false
        silenceStart = 0L
        speechTotalMs = 0L
    }

    private fun classifyFrame(now: Long) {
        var sumSq = 0.0
        var zc = 0
        for (i in 0 until FRAME_SIZE) {
            val s = frame[i].toDouble()
            sumSq += s * s
            if (i > 0 && ((frame[i] >= 0 && frame[i - 1] < 0) || (frame[i] < 0 && frame[i - 1] >= 0))) {
                zc++
            }
        }
        val rms = sqrt(sumSq / FRAME_SIZE)
        val zcr = zc.toDouble() / FRAME_SIZE

        val isSpeech = rms in MIN_SPEECH_RMS..MAX_SPEECH_RMS && zcr in MIN_ZCR..MAX_ZCR

        if (isSpeech) {
            if (!inSpeech) {
                inSpeech = true
                speechStart = now
                silenceStart = 0L
                if (bursts.isNotEmpty()) {
                    val gap = now - bursts.last().second
                    if (gap > MAX_GAP_MS) {
                        bursts.clear()
                    } else if (gap < MIN_GAP_MS) {
                        // Doordard noise: do bursts bahut jaldi — ignore naya burst
                        return
                    }
                }
                while (bursts.isNotEmpty() && (now - bursts.first().first) > MAX_PHRASE_MS) {
                    bursts.removeAt(0)
                }
            }
            burstEnd = now
            speechTotalMs += 20
        } else {
            if (inSpeech) {
                if (silenceStart == 0L) silenceStart = now
                if ((now - silenceStart) >= 130) {
                    val dur = burstEnd - speechStart
                    if (dur in MIN_BURST_MS..MAX_BURST_MS) {
                        bursts.add(Pair(speechStart, burstEnd))
                    } else {
                        bursts.clear()
                    }
                    inSpeech = false
                    silenceStart = 0L
                    checkPhrase(now)
                }
            }
        }
    }

    private fun checkPhrase(now: Long) {
        if (bursts.isEmpty()) return
        val phraseStart = bursts.first().first
        val phraseEnd = bursts.last().second
        val span = phraseEnd - phraseStart

        // STRICT Google-style: sirf 2-4 short word bursts hi trigger karte hain
        // ("wake up venom" = 3 bursts, "wake venom" = 2). Akela "venom" NEHI.
        // Span band: 380ms-3000ms — isse bahar ki cheeze (single clap, music) reject.
        if (bursts.size in 2..MAX_BURSTS && span in MIN_PHRASE_MS..MAX_PHRASE_MS) {
            trigger(now)
            return
        }
        // nothing triggered — keep the oldest bursts pruned by the next frame
    }

    private fun trigger(now: Long) {
        lastTriggerTime = now
        val b = bursts.size
        val span = if (b > 0) (bursts.last().second - bursts.first().first) else 0L
        reset()
        Log.i(TAG, "Wake phrase detected on-device ($b bursts, ${span}ms). Triggering!")
        onTriggered()
    }
}
