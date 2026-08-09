package com.novax.venom

import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.sqrt

/**
 * VENOM lightweight speaker recognition ("har kisi ki awaaz pehchan").
 *
 * Captures a few seconds of mic audio, extracts simple acoustic features
 * (RMS energy, zero-crossing rate, dominant pitch via autocorrelation) and
 * stores them as a named "voice profile". Later, when the user speaks, the
 * same features are extracted and matched against saved profiles so Venom can
 * recognise WHO is talking.
 *
 * This is intentionally lightweight (runs fully on-device, no cloud) and works
 * best for 2-4 regular speakers.
 */
class VoiceProfileManager(private val context: Context) {

    companion object {
        private const val TAG = "VoiceProfile"
        private const val PREFS = "venom_voice_profiles"
        private const val SAMPLE_RATE = 16000
        private const val MATCH_THRESHOLD = 0.42 // lower = stricter
    }

    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    data class Features(val rms: Double, val zcr: Double, val pitch: Double)

    // ---------- profile storage ----------

    fun saveProfile(name: String, f: Features) {
        val list = loadAllJson()
        val arr = JSONArray()
        var found = false
        for (i in 0 until list.length()) {
            val obj = list.getJSONObject(i)
            if (obj.optString("name").equals(name, ignoreCase = true)) {
                arr.put(profileJson(name, f))
                found = true
            } else {
                arr.put(obj)
            }
        }
        if (!found) arr.put(profileJson(name, f))
        prefs.edit().putString("profiles", arr.toString()).apply()
        Log.d(TAG, "Voice profile saved for '$name'")
    }

    private fun profileJson(name: String, f: Features): JSONObject {
        return JSONObject()
            .put("name", name)
            .put("rms", f.rms)
            .put("zcr", f.zcr)
            .put("pitch", f.pitch)
    }

    fun deleteProfile(name: String) {
        val list = loadAllJson()
        val arr = JSONArray()
        for (i in 0 until list.length()) {
            val obj = list.getJSONObject(i)
            if (!obj.optString("name").equals(name, ignoreCase = true)) arr.put(obj)
        }
        prefs.edit().putString("profiles", arr.toString()).apply()
    }

    fun listProfiles(): List<String> {
        val out = mutableListOf<String>()
        val list = loadAllJson()
        for (i in 0 until list.length()) out.add(list.getJSONObject(i).optString("name"))
        return out
    }

    private fun loadAllJson(): JSONArray {
        val raw = prefs.getString("profiles", null) ?: return JSONArray()
        return try {
            JSONArray(raw)
        } catch (e: Exception) {
            JSONArray()
        }
    }

    // ---------- capture ----------

    /** Records `durationMs` from the mic and returns average features, or null on failure. */
    fun captureFeatures(durationMs: Int): Features? {
        val minBuf = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        val record = try {
            AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                Math.max(minBuf * 2, SAMPLE_RATE / 2)
            )
        } catch (e: Exception) {
            Log.e(TAG, "AudioRecord init failed", e)
            return null
        }

        if (record.state != AudioRecord.STATE_INITIALIZED) {
            record.release()
            return null
        }

        val totalSamples = (SAMPLE_RATE * durationMs / 1000)
        val buffer = ShortArray(4096)
        var collected = 0
        val windowFeatures = mutableListOf<Features>()
        val window = ShortArray(SAMPLE_RATE / 10) // 100ms analysis windows

        // Safety guards: never let this loop run forever (mic conflict / no data
        // can make read() return 0 repeatedly). Hard time budget = duration + 5s.
        val deadline = System.currentTimeMillis() + durationMs + 5000L
        var consecutiveEmpty = 0

        try {
            record.startRecording()
            var windowFill = 0
            while (collected < totalSamples && System.currentTimeMillis() < deadline) {
                val read = record.read(buffer, 0, buffer.size)
                if (read <= 0) {
                    consecutiveEmpty++
                    if (consecutiveEmpty > 50) break // ~2s of no data -> give up
                    try { Thread.sleep(10) } catch (e: InterruptedException) { break }
                    continue
                }
                consecutiveEmpty = 0
                collected += read
                var i = 0
                while (i < read) {
                    window[windowFill] = buffer[i]
                    windowFill++
                    if (windowFill == window.size) {
                        val f = analyze(window)
                        // keep only voiced (speech) windows
                        if (f.rms > 800 && f.zcr in 0.02..0.40) {
                            windowFeatures.add(f)
                        }
                        windowFill = 0
                    }
                    i++
                }
            }
            try { record.stop() } catch (e: Exception) {}
        } catch (e: Exception) {
            Log.e(TAG, "capture failed", e)
        } finally {
            try { record.release() } catch (e: Exception) {}
        }

        if (windowFeatures.isEmpty()) return null
        val avgRms = windowFeatures.map { it.rms }.average()
        val avgZcr = windowFeatures.map { it.zcr }.average()
        val avgPitch = windowFeatures.map { it.pitch }.average()
        return Features(avgRms, avgZcr, avgPitch)
    }

    /** True if at least one voice profile has been saved (avoids pointless captures). */
    fun hasProfiles(): Boolean = loadAllJson().length() > 0

    // ---------- analysis ----------

    private fun analyze(window: ShortArray): Features {
        var sumSq = 0.0
        var zc = 0
        for (i in window.indices) {
            val s = window[i].toDouble()
            sumSq += s * s
            if (i > 0 && ((window[i] >= 0 && window[i - 1] < 0) || (window[i] < 0 && window[i - 1] >= 0))) {
                zc++
            }
        }
        val rms = sqrt(sumSq / window.size)
        val zcr = zc.toDouble() / window.size
        val pitch = estimatePitch(window)
        return Features(rms, zcr, pitch)
    }

    /** Autocorrelation-based pitch estimation (returns Hz, 0 if unvoiced). */
    private fun estimatePitch(window: ShortArray): Double {
        // low-pass: skip windows with too little energy
        var sumSq = 0.0
        for (s in window) sumSq += s.toDouble() * s.toDouble()
        if (sumSq / window.size < 400.0) return 0.0

        val minLag = SAMPLE_RATE / 400 // 400 Hz max pitch
        val maxLag = SAMPLE_RATE / 70  // 70 Hz min pitch
        var bestLag = -1
        var bestCorr = Double.MIN_VALUE

        for (lag in minLag..maxLag) {
            var corr = 0.0
            var energy = 0.0
            for (i in 0 until (window.size - lag)) {
                corr += window[i].toDouble() * window[i + lag].toDouble()
                energy += window[i].toDouble() * window[i].toDouble()
            }
            if (energy <= 0) continue
            val norm = corr / energy
            if (norm > bestCorr) {
                bestCorr = norm
                bestLag = lag
            }
        }
        return if (bestLag > 0 && bestCorr > 0.25) SAMPLE_RATE.toDouble() / bestLag else 0.0
    }

    // ---------- matching ----------

    /** Matches captured features against saved profiles; returns name or null. */
    fun match(f: Features): String? {
        val list = loadAllJson()
        if (list.length() == 0) return null

        var bestName: String? = null
        var bestDist = Double.MAX_VALUE

        for (i in 0 until list.length()) {
            val obj = list.getJSONObject(i)
            val name = obj.optString("name")
            val pf = Features(
                obj.optDouble("rms", 0.0),
                obj.optDouble("zcr", 0.0),
                obj.optDouble("pitch", 0.0)
            )
            val dist = distance(f, pf)
            if (dist < bestDist) {
                bestDist = dist
                bestName = name
            }
        }

        return if (bestDist <= MATCH_THRESHOLD) bestName else null
    }

    private fun distance(a: Features, b: Features): Double {
        // normalize: rms in [0,32768], zcr in [0,1], pitch in [0,400]
        val drms = (a.rms - b.rms) / 32768.0
        val dzcr = (a.zcr - b.zcr)
        val dpitch = ((a.pitch - b.pitch) / 400.0)
        return sqrt(drms * drms + dzcr * dzcr + dpitch * dpitch)
    }
}
