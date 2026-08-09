package com.novax.venom

import android.util.Log

enum class MicState {
    WAKE_LISTENING,
    TRIGGERED,
    LIVE_SESSION_ACTIVE
}

/**
 * Central mic-state manager.
 *
 *  - WAKE_LISTENING       : the always-on on-device wake listener is allowed
 *                           to hold the mic (single continuous AudioRecord
 *                           stream — no on/off blinking).
 *  - TRIGGERED            : a session is starting — wake loop must release
 *                           the mic so the session recognizer can take over.
 *  - LIVE_SESSION_ACTIVE  : a live voice session holds the mic.
 *
 * Single-mic-owner rule: exactly one owner (wake loop OR session) at a time.
 * The wake loop is ALWAYS on (24/7) unless the user disables it or a session
 * is active — that's the "Hey Google" behaviour.
 */
object MicManager {
    private const val TAG = "MicManager"

    @Volatile
    var currentState: MicState = MicState.WAKE_LISTENING
        private set

    @Volatile
    var wakeEnabled: Boolean = true
        private set

    private val stateListeners = mutableListOf<(MicState) -> Unit>()

    fun addListener(listener: (MicState) -> Unit) {
        synchronized(stateListeners) {
            stateListeners.add(listener)
        }
    }

    fun removeListener(listener: (MicState) -> Unit) {
        synchronized(stateListeners) {
            stateListeners.remove(listener)
        }
    }

    @Synchronized
    fun transitionTo(newState: MicState) {
        if (currentState == newState) return
        Log.d(TAG, "MicState transition: $currentState -> $newState")
        currentState = newState
        synchronized(stateListeners) {
            for (listener in stateListeners) {
                listener(newState)
            }
        }
    }

    @Synchronized
    fun setWakeEnabled(enabled: Boolean) {
        Log.d(TAG, "wakeEnabled: $wakeEnabled -> $enabled")
        wakeEnabled = enabled
        if (enabled && currentState == MicState.TRIGGERED) {
            // return to always-on listening if no session is holding the mic
            transitionTo(MicState.WAKE_LISTENING)
        } else if (!enabled && currentState == MicState.WAKE_LISTENING) {
            transitionTo(MicState.TRIGGERED)
        }
    }

    /** Wake loop may hold the mic only when enabled and no session is active. */
    fun isWakeListeningAllowed(): Boolean {
        return wakeEnabled && currentState == MicState.WAKE_LISTENING
    }
}
