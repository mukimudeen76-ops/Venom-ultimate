package com.novax.venom

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import android.webkit.WebView
import androidx.core.content.FileProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * VENOM in-app updater.
 *
 * The app repo is PRIVATE (source code kabhi public nahi hota), isliye GitHub
 * releases API yahan use nahi hota. Update info ek PUBLIC manifest file se aati
 * hai jo website repo (GitHub Pages) pe host hai:
 *   https://mukimudeen76-ops.github.io/VENOM-Website/venom-update.json
 *   => { "latestVersion": "2.1.1", "releaseNotes": "...", "sizeBytes": 0 }
 *
 * Jab tak manifest ka version installed version se bada hai, app "update
 * available" dikhata hai aur user Instagram DM pe le jata hai (files private
 * hain — sirf verified payment/owner ko milti hain).
 *
 * RATE-LIMIT SAFE: last result device pe 1 hour cache hota hai; automatic
 * checks (onCreate/onResume/periodic) network hit nahi karte. Sirf Settings
 * ka "Check for Updates" button live refresh karta hai. 403/429/5xx pe cache
 * use hoti hai, warna friendly message (kabhi raw HTTP error nahi).
 *
 * Results are pushed into the web layer through window.onVenomUpdateResult(...).
 */
class UpdateManager(private val context: Context, private val webView: WebView) {

    companion object {
        private const val TAG = "VenomUpdate"

        // Update endpoint. Default = public manifest mirror that the PRIVATE repo
        // auto-generates (release-mirror.yml). Owner can override at build time
        // with -PupdateEndpoint="https://worker…" (Cloudflare Worker proxy).
        private const val MANIFEST_URL = BuildConfig.UPDATE_ENDPOINT

        // Automatic checks reuse the cached result for this long (no network hit)
        private const val CACHE_TTL_MS = 60 * 60 * 1000L // 1 hour
        private const val PERIODIC_MS = 60 * 60 * 1000L // 1 hour
        private const val PREFS = "venom_update_prefs"
        private const val CACHE_JSON = "last_payload"
        private const val CACHE_TS = "last_ts"

        private val client = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    data class SemVer(val major: Int, val minor: Int, val patch: Int) : Comparable<SemVer> {
        override fun compareTo(other: SemVer): Int =
            compareValuesBy(this, other, { it.major }, { it.minor }, { it.patch })
    }

    // Periodic re-check so a fresh release shows up even if the app stays open.
    // Runs at most once per hour (and always reuses cache when fresh).
    private val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private val periodicRunnable = object : Runnable {
        override fun run() {
            checkForUpdate()
            mainHandler.postDelayed(this, PERIODIC_MS)
        }
    }

    fun startPeriodicCheck() {
        mainHandler.removeCallbacks(periodicRunnable)
        mainHandler.postDelayed(periodicRunnable, PERIODIC_MS)
    }

    /**
     * Throttled check — the one used for background/periodic/resume checks.
     * If a successful result was cached less than CACHE_TTL_MS ago, it is
     * pushed again WITHOUT touching the network. Otherwise a live fetch runs.
     */
    fun checkForUpdate() {
        val cached = loadCache()
        val lastTs = prefs.getLong(CACHE_TS, 0L)
        if (cached != null && System.currentTimeMillis() - lastTs < CACHE_TTL_MS) {
            push(cached)
            return
        }
        fetchLatest()
    }

    /**
     * Forced live check — used by the Settings "Check for Updates" button.
     * Bypasses the cache but still never shows a raw HTTP error.
     */
    fun forceCheckForUpdate() {
        fetchLatest()
    }

    private fun fetchLatest() {
        scope.launch {
            try {
                val current = installedVersionName()
                val request = Request.Builder()
                    .url(MANIFEST_URL)
                    .header("User-Agent", "VENOM-Android")
                    .build()
                val response = client.newCall(request).execute()
                response.use {
                    if (!it.isSuccessful) {
                        val cached = loadCache()
                        if (cached != null) {
                            push(cached)
                        } else {
                            emitError("Update server abhi busy hai — thodi der baad try karo.")
                        }
                        return@launch
                    }
                    val body = it.body?.string() ?: return@launch

                    val manifest = JSONObject(body)
                    val latestTag = manifest.optString("latestVersion", "").trim()
                    val latestVersion = parseVersion(latestTag)
                    val currentVersion = parseVersion(current) ?: SemVer(0, 0, 0)

                    // --- OWNER CONTROL (Boss) ---
                    // killSwitch=true           -> sab users ke liye app block
                    // blockedVersions=[...]     -> in versions pe app block
                    // minVersion="2.1.4"        -> purane version wale FORCE update
                    // apkUrl / exeUrl           -> direct in-app download link
                    val killSwitch = manifest.optBoolean("killSwitch", false)
                    val blockedVersions = manifest.optJSONArray("blockedVersions")
                    val minTag = manifest.optString("minVersion", "").trim()
                    val minVersion = parseVersion(minTag)

                    val blocked = killSwitch || isVersionBlocked(current, blockedVersions)
                    val forced = minVersion != null && currentVersion < minVersion
                    val available = (latestVersion != null && latestVersion > currentVersion) || forced

                    val apkUrl = manifest.optString("apkUrl", "").trim()
                    val downloadUrl = if (available && apkUrl.isNotEmpty()) apkUrl else ""

                    val payload = JSONObject()
                        .put("checking", false)
                        .put("available", available)
                        .put("forced", forced)
                        .put("blocked", blocked)
                        .put("blockMessage", manifest.optString("blockMessage", "VENOM band kar diya gaya hai."))
                        .put("currentVersion", current)
                        .put("latestVersion", latestTag.removePrefix("v"))
                        .put("minVersion", minTag.removePrefix("v"))
                        .put("downloadUrl", downloadUrl)
                        .put("releaseNotes", manifest.optString("releaseNotes", ""))
                        .put("sizeBytes", manifest.optLong("sizeBytes", 0L))

                    saveCache(payload)
                    push(payload)
                }
            } catch (e: Exception) {
                Log.e(TAG, "checkForUpdate failed", e)
                val cached = loadCache()
                if (cached != null) {
                    push(cached)
                } else {
                    emitError("Update check abhi nahi ho paya — internet check karke dobara try karo.")
                }
            }
        }
    }

    fun downloadAndInstall(downloadUrl: String) {
        scope.launch {
            try {
                push(JSONObject().put("downloading", true).put("progress", 0))
                val request = Request.Builder()
                    .url(downloadUrl)
                    .header("User-Agent", "VENOM-Android")
                    .build()
                val response = client.newCall(request).execute()
                response.use {
                    if (!it.isSuccessful) {
                        emitError("Download failed (HTTP ${it.code})")
                        return@launch
                    }
                    val target = File(context.cacheDir, "venom-update.apk")
                    val total = it.body?.contentLength() ?: 0L
                    var done = 0L
                    it.body?.byteStream()?.use { input ->
                        target.outputStream().use { output ->
                            val buffer = ByteArray(8192)
                            while (true) {
                                val read = input.read(buffer)
                                if (read == -1) break
                                output.write(buffer, 0, read)
                                done += read
                                if (total > 0) {
                                    val pct = ((done * 100) / total).toInt()
                                    if (pct % 5 == 0) {
                                        push(JSONObject().put("downloading", true).put("progress", pct))
                                    }
                                }
                            }
                        }
                    }
                    push(JSONObject().put("downloading", false).put("progress", 100))
                    installApk(target)
                }
            } catch (e: Exception) {
                Log.e(TAG, "downloadAndInstall failed", e)
                emitError(e.message ?: "Update download failed")
            }
        }
    }

    fun cancel() {
        mainHandler.removeCallbacks(periodicRunnable)
        scope.cancel()
    }

    private fun installedVersionName(): String {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.packageManager
                    .getPackageInfo(context.packageName, PackageManager.PackageInfoFlags.of(0))
                    .versionName
            } else {
                @Suppress("DEPRECATION")
                context.packageManager.getPackageInfo(context.packageName, 0).versionName
            }
        } catch (e: Exception) {
            "0.0.0"
        }
    }

    private fun installApk(file: File) {
        try {
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "installApk failed", e)
            emitError(e.message ?: "Could not open the installer")
        }
    }

    private fun saveCache(payload: JSONObject) {
        prefs.edit()
            .putString(CACHE_JSON, payload.toString())
            .putLong(CACHE_TS, System.currentTimeMillis())
            .apply()
    }

    private fun loadCache(): JSONObject? {
        val raw = prefs.getString(CACHE_JSON, null) ?: return null
        return try {
            JSONObject(raw)
        } catch (e: Exception) {
            null
        }
    }

    private fun push(json: JSONObject) {
        val script =
            "window.onVenomUpdateResult && window.onVenomUpdateResult(${JSONObject.quote(json.toString())});"
        webView.post { webView.evaluateJavascript(script, null) }
    }

    private fun emitError(message: String) {
        push(
            JSONObject()
                .put("checking", false)
                .put("available", false)
                .put("downloading", false)
                .put("error", message)
        )
    }

    /** True when the installed version is in the owner's blocked list. */
    private fun isVersionBlocked(installed: String, blocked: JSONArray?): Boolean {
        if (blocked == null) return false
        val clean = installed.removePrefix("v").trim()
        for (i in 0 until blocked.length()) {
            val b = blocked.optString(i, "").removePrefix("v").trim()
            if (b.isNotEmpty() && b == clean) return true
        }
        return false
    }

    private fun parseVersion(tag: String): SemVer? {
        val clean = tag.removePrefix("v").trim()
        val parts = clean.split(".")
        if (parts.size < 3) return null
        val major = parts[0].toIntOrNull() ?: return null
        val minor = parts[1].toIntOrNull() ?: return null
        val patch = parts[2].toIntOrNull() ?: return null
        return SemVer(major, minor, patch)
    }
}
