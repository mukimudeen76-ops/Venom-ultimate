package com.novax.venom

import android.util.Log

enum class MicState {
    WAKE_LISTENING,
    TRIGGERED,
    LIVE_SESSION_ACTIVE
}

object MicManager {
    private const val TAG = "MicManager"
    @Volatile
    var currentState: MicState = MicState.WAKE_LISTENING
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
        Log.d(TAG, "MicState transition: $currentState -> $newState")
        currentState = newState
        synchronized(stateListeners) {
            for (listener in stateListeners) {
                listener(newState)
            }
        }
    }

    fun isWakeListeningAllowed(): Boolean {
        return currentState == MicState.WAKE_LISTENING
    }
}
