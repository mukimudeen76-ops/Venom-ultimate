package com.novax.venom

import android.util.Log

class ClapDetector(private val onClapDetected: () -> Unit) {
    companion object {
        private const val TAG = "ClapDetector"
        private const val CLAP_THRESHOLD = 18000
        private const val MAX_CLAP_INTERVAL_MS = 600L
        private const val MIN_CLAP_INTERVAL_MS = 120L
    }

    @Volatile
    var isEnabled: Boolean = false

    private var lastClapTime: Long = 0

    fun processBuffer(buffer: ShortArray, readSize: Int) {
        if (!isEnabled || !MicManager.isWakeListeningAllowed()) return

        var maxAmplitude = 0
        for (i in 0 until readSize) {
            val absVal = Math.abs(buffer[i].toInt())
            if (absVal > maxAmplitude) {
                maxAmplitude = absVal
            }
        }

        if (maxAmplitude > CLAP_THRESHOLD) {
            val currentTime = System.currentTimeMillis()
            val timeDiff = currentTime - lastClapTime

            if (timeDiff in MIN_CLAP_INTERVAL_MS..MAX_CLAP_INTERVAL_MS) {
                Log.d(TAG, "Double Clap Detected!")
                lastClapTime = 0
                onClapDetected()
            } else {
                lastClapTime = currentTime
            }
        }
    }
}
