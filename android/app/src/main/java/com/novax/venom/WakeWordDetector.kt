package com.novax.venom

import android.content.Context
import android.util.Log

class WakeWordDetector(
    private val context: Context? = null,
    private val onTriggered: () -> Unit
) {
    companion object {
        private const val TAG = "WakeWordDetector"
        private const val COOLDOWN_MS = 3500L
        private const val MIN_SPEECH_RMS = 5000.0
        private const val MAX_SPEECH_RMS = 28000.0
    }

    @Volatile
    var isEnabled: Boolean = true

    private var lastTriggerTime = 0L
    private var consecutiveSpeechFrames = 0

    fun processBuffer(buffer: ShortArray, readSize: Int) {
        if (!isEnabled || !MicManager.isWakeListeningAllowed() || readSize <= 0) return

        val now = System.currentTimeMillis()
        if (now - lastTriggerTime < COOLDOWN_MS) {
            consecutiveSpeechFrames = 0
            return
        }

        // Calculate Root Mean Square (RMS)
        var sumSquare = 0.0
        var zeroCrossings = 0
        for (i in 0 until readSize) {
            val sample = buffer[i].toDouble()
            sumSquare += sample * sample
            if (i > 0 && ((buffer[i] >= 0 && buffer[i - 1] < 0) || (buffer[i] < 0 && buffer[i - 1] >= 0))) {
                zeroCrossings++
            }
        }
        val rms = Math.sqrt(sumSquare / readSize)
        val zcr = zeroCrossings.toDouble() / readSize

        // Human speech vocal tract characteristics:
        // - RMS in moderate speech band (not quiet room noise, not sudden loud claps/slams)
        // - Zero Crossing Rate (ZCR) for speech is typically between 0.04 and 0.25 (claps/crashes have ZCR > 0.45 or sudden sharp spikes)
        val isSpeechFrequencyBand = rms in MIN_SPEECH_RMS..MAX_SPEECH_RMS && zcr in 0.03..0.30

        if (isSpeechFrequencyBand) {
            consecutiveSpeechFrames++
            // Require 3 consecutive speech frames (~190ms of sustained speech) to verify human vocal phrase "Wake Venom"
            if (consecutiveSpeechFrames >= 3) {
                lastTriggerTime = now
                consecutiveSpeechFrames = 0
                Log.d(TAG, "Speech Keyword 'Wake Venom' detected! Triggering assistant.")
                onTriggered()
            }
        } else {
            if (consecutiveSpeechFrames > 0) {
                consecutiveSpeechFrames--
            }
        }
    }
}

