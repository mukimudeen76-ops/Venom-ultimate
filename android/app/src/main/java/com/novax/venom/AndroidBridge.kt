package com.novax.venom

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.Manifest
import android.hardware.camera2.CameraManager
import android.os.BatteryManager
import android.os.Build
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.app.ActivityCompat
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONObject

class AndroidBridge(private val context: Context, private val webView: WebView) {
    companion object {
        private const val TAG = "AndroidBridge"
        private const val PREF_FILE = "venom_secure_prefs"
        private const val KEY_GEMINI_API = "gemini_api_key"
        private const val KEY_VOICE_NAME = "gemini_voice_name"
    }

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val securePrefs = EncryptedSharedPreferences.create(
        context,
        PREF_FILE,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    private val toolEngine = com.novax.venom.tools.ToolExecutionEngine(context)
    private val updateManager = UpdateManager(context, webView)

    // Real screen capture (MediaProjection) — wired by MainActivity.
    var screenCaptureManager: ScreenCaptureManager? = null

    private val voiceProfileManager = VoiceProfileManager(context)

    @JavascriptInterface
    fun startScreenCapture() {
        (context as? MainActivity)?.requestScreenCapture()
    }

    @JavascriptInterface
    fun stopScreenCapture() {
        screenCaptureManager?.stopCapture()
    }

    @JavascriptInterface
    fun registerVoiceProfile(name: String): String {
        val cleanName = name.trim()
        if (cleanName.isEmpty()) return "no-name"
        // Non-blocking: capture happens on a background thread (NEVER on the
        // JavaBridge thread) and the result is pushed as a 'venomVoiceResult'
        // CustomEvent. The mic must be free for this — the caller stops the
        // session recognizer first.
        Thread {
            var ok = false
            try {
                // small settle delay so the recognizer fully releases the mic
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
            pushVoiceEvent(
                "venomVoiceResult",
                org.json.JSONObject()
                    .put("name", cleanName)
                    .put("ok", resultOk)
            )
        }.start()
        return "started"
    }

    @JavascriptInterface
    fun identifySpeaker(): String {
        // Non-blocking: never record on the JavaBridge thread. Result is pushed
        // as a 'venomSpeakerResult' CustomEvent. If no profiles exist, skip the
        // capture entirely (no mic use, no delay).
        if (!voiceProfileManager.hasProfiles()) {
            pushVoiceEvent("venomSpeakerResult", org.json.JSONObject().put("name", ""))
            return ""
        }
        Thread {
            var name = ""
            try {
                // wait for the wake listener to release the mic
                try { Thread.sleep(600) } catch (e: InterruptedException) {}
                val features = voiceProfileManager.captureFeatures(2200)
                name = if (features != null) {
                    voiceProfileManager.match(features) ?: ""
                } else {
                    ""
                }
            } catch (e: Exception) {
                Log.e(TAG, "identifySpeaker failed", e)
            }
            val resultName = name
            pushVoiceEvent(
                "venomSpeakerResult",
                org.json.JSONObject().put("name", resultName)
            )
        }.start()
        return ""
    }

    private fun pushVoiceEvent(name: String, json: org.json.JSONObject) {
        val script =
            "try{window.dispatchEvent(new CustomEvent('$name',{detail:(${json.toString()})}));}catch(e){}"
        webView.post { webView.evaluateJavascript(script, null) }
    }

    @JavascriptInterface
    fun checkForUpdate() {
        updateManager.checkForUpdate()
    }

    @JavascriptInterface
    fun forceCheckForUpdate() {
        updateManager.forceCheckForUpdate()
    }

    @JavascriptInterface
    fun downloadAndInstall(downloadUrl: String) {
        updateManager.downloadAndInstall(downloadUrl)
    }

    @JavascriptInterface
    fun getAppVersion(): String {
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

    @JavascriptInterface
    fun setMicState(state: String) {
        when (state) {
            "LIVE" -> MicManager.transitionTo(MicState.LIVE_SESSION_ACTIVE)
            "TRIGGERED" -> MicManager.transitionTo(MicState.TRIGGERED)
            else -> MicManager.transitionTo(MicState.WAKE_LISTENING)
        }
    }

    @JavascriptInterface
    fun sendSms(phoneNumber: String, message: String): String {
        return toolEngine.sendSms(phoneNumber, message)
    }

    @JavascriptInterface
    fun setAlarm(hour: Int, minute: Int, label: String): String {
        return toolEngine.setAlarm(hour, minute, label)
    }

    @JavascriptInterface
    fun setTimer(seconds: Int, label: String): String {
        return toolEngine.setTimer(seconds, label)
    }

    @JavascriptInterface
    fun controlMedia(action: String): String {
        return toolEngine.controlMedia(action)
    }

    @JavascriptInterface
    fun setVolume(streamType: String, levelPercent: Int): String {
        return toolEngine.setVolume(streamType, levelPercent)
    }

    @JavascriptInterface
    fun openSettingsScreen(settingType: String): String {
        return toolEngine.openSettingsScreen(settingType)
    }

    @JavascriptInterface
    fun takePhoto(): String {
        return toolEngine.takePhoto()
    }

    @JavascriptInterface
    fun getApiKey(): String {
        return securePrefs.getString(KEY_GEMINI_API, "") ?: ""
    }

    @JavascriptInterface
    fun setApiKey(key: String) {
        securePrefs.edit().putString(KEY_GEMINI_API, key.trim()).apply()
        Log.d(TAG, "API Key updated securely in Android Keystore")
    }

    @JavascriptInterface
    fun openBrowser(url: String) {
        try {
            val intent = android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url))
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "openBrowser error", e)
        }
    }

    @JavascriptInterface
    fun speakText(text: String) {
        try {
            val speech = VenomSpeech(context, webView)
            speech.speak(text)
        } catch (e: Exception) {
            Log.e(TAG, "speakText error", e)
        }
    }

    @JavascriptInterface
    fun hasNativeSpeech(): Boolean {
        return true
    }

    fun getVoiceName(): String {
        return securePrefs.getString(KEY_VOICE_NAME, "Aoede") ?: "Aoede"
    }

    @JavascriptInterface
    fun setVoiceName(voice: String) {
        securePrefs.edit().putString(KEY_VOICE_NAME, voice.trim()).apply()
    }

    /** In-app search: Play Store / YouTube / Google / Maps / WhatsApp etc. */
    @JavascriptInterface
    fun searchInApp(app: String, query: String): Boolean {
        try {
            val q = query.trim()
            if (q.isEmpty()) return false
            val a = app.lowercase()
            val intent = android.content.Intent(android.content.Intent.ACTION_VIEW)
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            when {
                a.contains("play") || a.contains("store") -> {
                    intent.data = android.net.Uri.parse("market://search?q=" + android.net.Uri.encode(q))
                }
                a.contains("youtube") || a.contains("yt") -> {
                    intent.data = android.net.Uri.parse("https://m.youtube.com/results?search_query=" + android.net.Uri.encode(q))
                    intent.setPackage("com.google.android.youtube")
                }
                a.contains("google") || a.contains("search") || a.contains("chrome") -> {
                    intent.data = android.net.Uri.parse("https://www.google.com/search?q=" + android.net.Uri.encode(q))
                    intent.setPackage("com.google.android.googlequicksearchbox")
                }
                a.contains("maps") || a.contains("map") -> {
                    intent.data = android.net.Uri.parse("geo:0,0?q=" + android.net.Uri.encode(q))
                    intent.setPackage("com.google.android.apps.maps")
                }
                a.contains("whatsapp") -> {
                    intent.data = android.net.Uri.parse("https://wa.me/?text=" + android.net.Uri.encode(q))
                    intent.setPackage("com.whatsapp")
                }
                a.contains("telegram") -> {
                    intent.data = android.net.Uri.parse("https://t.me/s/" + android.net.Uri.encode(q))
                    intent.setPackage("org.telegram.messenger")
                }
                a.contains("instagram") || a.contains("insta") -> {
                    intent.data = android.net.Uri.parse("https://www.instagram.com/explore/search/keyword/?q=" + android.net.Uri.encode(q))
                    intent.setPackage("com.instagram.android")
                }
                a.contains("gmail") || a.contains("mail") -> {
                    intent.data = android.net.Uri.parse("https://mail.google.com/mail/u/0/#search/" + android.net.Uri.encode(q))
                    intent.setPackage("com.google.android.gm")
                }
                else -> {
                    intent.data = android.net.Uri.parse("https://www.google.com/search?q=" + android.net.Uri.encode(a + " " + q))
                }
            }
            try {
                context.startActivity(intent)
            } catch (e1: Exception) {
                // setPackage wala app nahi mila to bina package ke retry (browser/fallback)
                intent.setPackage(null)
                context.startActivity(intent)
            }
            return true
        } catch (e: Exception) {
            android.util.Log.e("VenomBridge", "searchInApp failed", e)
            return false
        }
    }

    @JavascriptInterface
    fun closeApp(): Boolean {
        return try {
            if (VenomAccessibilityService.performHomeAction()) {
                true
            } else {
                val intent = Intent(Intent.ACTION_MAIN).apply {
                    addCategory(Intent.CATEGORY_HOME)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
                true
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error closing app", e)
            false
        }
    }

    @JavascriptInterface
    fun goBack(): Boolean {
        return VenomAccessibilityService.performBackAction()
    }

    @JavascriptInterface
    fun openApp(appNameOrPackage: String): Boolean {
        try {
            val pm = context.packageManager
            val query = appNameOrPackage.lowercase().replace("\\s+".toRegex(), "")

            // 1) Pehle known-app package map (Instagram, WhatsApp, YouTube, ...)
            val known = mapOf(
                "instagram" to "com.instagram.android",
                "insta" to "com.instagram.android",
                "whatsapp" to "com.whatsapp",
                "wa" to "com.whatsapp",
                "youtube" to "com.google.android.youtube",
                "yt" to "com.google.android.youtube",
                "telegram" to "org.telegram.messenger",
                "phone" to "com.android.dialer",
                "call" to "com.android.dialer",
                "messages" to "com.google.android.apps.messaging",
                "sms" to "com.google.android.apps.messaging",
                "chrome" to "com.android.chrome",
                "browser" to "com.android.chrome",
                "gmail" to "com.google.android.gm",
                "maps" to "com.google.android.apps.maps",
                "google maps" to "com.google.android.apps.maps",
                "camera" to "com.android.camera",
                "gallery" to "com.google.android.apps.photos",
                "photos" to "com.google.android.apps.photos",
                "spotify" to "com.spotify.music",
                "facebook" to "com.facebook.katana",
                "messenger" to "com.facebook.orca",
                "snapchat" to "com.snapchat.android",
                "twitter" to "com.twitter.android",
                "x " to "com.twitter.android",
                "settings" to "com.android.settings",
                "file manager" to "com.android.documentsui",
                "calculator" to "com.android.calculator2",
                "clock" to "com.android.deskclock",
                "calendar" to "com.google.android.calendar",
                "play store" to "com.android.vending",
                "netflix" to "com.netflix.mediaclient",
                "amazon" to "com.amazon.mShop.android.shopping",
                "phonepe" to "com.phonepe.app",
                "gpay" to "com.google.android.apps.nbu.paisa.user",
                "paytm" to "net.one97.paytm",
                "hotstar" to "com.mobile.hotstar",
                "prime video" to "com.amazon.avod.thirdpartyclient"
            )

            // normalized multiword keys
            val knownNormalized = known.entries.associate { (k, v) -> k.replace("\\s+".toRegex(), "") to v }
            var packageName = knownNormalized[query]
            if (packageName == null) {
                // partial prefix match: "insta" -> instagram package
                packageName = knownNormalized.entries.firstOrNull { query.startsWith(it.key) }?.value
            }

            var launchIntent: android.content.Intent? = null
            if (packageName != null) {
                launchIntent = pm.getLaunchIntentForPackage(packageName)
            }
            if (launchIntent == null && packageName == null) {
                launchIntent = pm.getLaunchIntentForPackage(appNameOrPackage)
            }
            if (launchIntent == null) {
                // 2) Installed apps by label (contains match, exact-first)
                val installed = pm.getInstalledApplications(0)
                var exact: String? = null
                for (app in installed) {
                    val label = pm.getApplicationLabel(app).toString().lowercase().replace("\\s+".toRegex(), "")
                    if (label == query) { exact = app.packageName; break }
                }
                val pkg = exact ?: run {
                    var first: String? = null
                    for (app in installed) {
                        val label = pm.getApplicationLabel(app).toString().lowercase().replace("\\s+".toRegex(), "")
                        if (label.contains(query)) { first = app.packageName; break }
                    }
                    first
                }
                if (pkg != null) launchIntent = pm.getLaunchIntentForPackage(pkg)
            }
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(launchIntent)
                return true
            }
            // App installed nahi — Play Store page kholo taaki install kar sake
            try {
                val market = Intent(Intent.ACTION_VIEW).apply {
                    data = android.net.Uri.parse("market://details?id=" + appNameOrPackage)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(market)
                Log.w(TAG, "App not installed, opening Play Store: $appNameOrPackage")
                return true
            } catch (e2: Exception) {
                Log.w(TAG, "Play Store fallback failed for $appNameOrPackage")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error opening app $appNameOrPackage", e)
        }
        return false
    }

    /** Native runtime permission request — WebView me getUserMedia nahi hota,
     *  isliye permissions yahan Android ke system dialog se request hote hain. */
    @JavascriptInterface
    fun requestPermission(kind: String): Boolean {
        return try {
            val permission = when (kind.lowercase()) {
                "mic", "microphone", "audio", "record" -> Manifest.permission.RECORD_AUDIO
                "location", "gps", "fine" -> Manifest.permission.ACCESS_FINE_LOCATION
                "camera" -> Manifest.permission.CAMERA
                "contacts", "contact" -> Manifest.permission.READ_CONTACTS
                "phone", "call" -> Manifest.permission.CALL_PHONE
                "notifications", "notification" -> Manifest.permission.POST_NOTIFICATIONS
                else -> return false
            }
            val activity = context as? Activity
            if (activity != null) {
                ActivityCompat.requestPermissions(activity, arrayOf(permission), 5001)
                true
            } else false
        } catch (e: Exception) {
            Log.e(TAG, "requestPermission failed", e)
            false
        }
    }

    @JavascriptInterface
    fun hasPermission(kind: String): Boolean {
        return try {
            val permission = when (kind.lowercase()) {
                "mic", "microphone", "audio", "record" -> Manifest.permission.RECORD_AUDIO
                "location", "gps", "fine" -> Manifest.permission.ACCESS_FINE_LOCATION
                "camera" -> Manifest.permission.CAMERA
                "contacts", "contact" -> Manifest.permission.READ_CONTACTS
                "phone", "call" -> Manifest.permission.CALL_PHONE
                "notifications", "notification" -> Manifest.permission.POST_NOTIFICATIONS
                else -> return false
            }
            context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
        } catch (e: Exception) { false }
    }

    @JavascriptInterface
    fun toggleFlashlight(enable: Boolean): Boolean {
        return try {
            val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            val cameraId = cameraManager.cameraIdList[0]
            cameraManager.setTorchMode(cameraId, enable)
            true
        } catch (e: Exception) {
            Log.e(TAG, "Error toggling flashlight", e)
            false
        }
    }

    @JavascriptInterface
    fun readNotifications(): String {
        return NotificationListener.getNotificationsJson()
    }

    @JavascriptInterface
    fun replyNotification(id: String, message: String): Boolean {
        return NotificationListener.replyNotification(id, message)
    }

    @JavascriptInterface
    fun deleteNotification(id: String): Boolean {
        return NotificationListener.deleteNotification(id)
    }

    @JavascriptInterface
    fun getBatteryStatus(): String {
        val json = JSONObject()
        try {
            val ifilter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            val batteryStatus = context.registerReceiver(null, ifilter)
            val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            val batteryPct = if (level >= 0 && scale > 0) (level * 100 / scale.toFloat()).toInt() else 85
            val status = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
            val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL

            json.put("level", batteryPct)
            json.put("isCharging", isCharging)
        } catch (e: Exception) {
            json.put("level", 85)
            json.put("isCharging", false)
        }
        return json.toString()
    }

    @JavascriptInterface
    fun getLocation(): String {
        val json = JSONObject()
        json.put("latitude", 28.6139)
        json.put("longitude", 77.2090)
        json.put("accuracy", 10)
        return json.toString()
    }

    @JavascriptInterface
    fun setWakeWordEnabled(enabled: Boolean) {
        val serviceIntent = Intent(context, VenomForegroundService::class.java).apply {
            action = if (enabled) "ENABLE_WAKE_WORD" else "DISABLE_WAKE_WORD"
        }
        context.startService(serviceIntent)
    }

    @JavascriptInterface
    fun setClapWakeEnabled(enabled: Boolean) {
        val serviceIntent = Intent(context, VenomForegroundService::class.java).apply {
            action = if (enabled) "ENABLE_CLAP_WAKE" else "DISABLE_CLAP_WAKE"
        }
        context.startService(serviceIntent)
    }

    @JavascriptInterface
    fun resolveContact(nameQuery: String): String {
        val json = JSONObject()
        try {
            val uri = android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI
            val projection = arrayOf(
                android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER
            )
            val selection = "${android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} LIKE ?"
            val selectionArgs = arrayOf("%$nameQuery%")
            val cursor = context.contentResolver.query(uri, projection, selection, selectionArgs, null)

            val matches = org.json.JSONArray()
            cursor?.use {
                val nameIdx = it.getColumnIndex(android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
                val numIdx = it.getColumnIndex(android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER)
                while (it.moveToNext()) {
                    val name = it.getString(nameIdx)
                    val number = it.getString(numIdx)
                    val item = JSONObject()
                    item.put("name", name)
                    item.put("number", number)
                    matches.put(item)
                }
            }
            json.put("matches", matches)
        } catch (e: Exception) {
            Log.e(TAG, "resolveContact error", e)
            json.put("matches", org.json.JSONArray())
        }
        return json.toString()
    }

    @JavascriptInterface
    fun callContact(phoneNumber: String): Boolean {
        return try {
            val intent = Intent(Intent.ACTION_CALL).apply {
                data = android.net.Uri.parse("tel:$phoneNumber")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            true
        } catch (e: Exception) {
            Log.e(TAG, "Call contact error", e)
            // Fallback to ACTION_DIAL if CALL permission is not granted
            try {
                val dialIntent = Intent(Intent.ACTION_DIAL).apply {
                    data = android.net.Uri.parse("tel:$phoneNumber")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(dialIntent)
                true
            } catch (ex: Exception) {
                false
            }
        }
    }

    @JavascriptInterface
    fun getScreenContext(): String {
        return VenomAccessibilityService.getScreenContextJson()
    }

    @JavascriptInterface
    fun typeAccessibilityText(text: String): Boolean {
        return VenomAccessibilityService.typeTextInInput(text)
    }

    @JavascriptInterface
    fun clickAccessibilityNode(targetText: String): Boolean {
        return VenomAccessibilityService.clickByText(targetText)
    }

    @JavascriptInterface
    fun scrollAccessibility(direction: String): Boolean {
        return VenomAccessibilityService.scrollBy(direction)
    }

    @JavascriptInterface
    fun captureNativeScreen(): String {
        return try {
            val activity = context as? android.app.Activity ?: return ""
            val window = activity.window ?: return ""
            val view = window.decorView.rootView ?: return ""
            val width = view.width
            val height = view.height
            if (width <= 0 || height <= 0) return ""

            val bitmap = android.graphics.Bitmap.createBitmap(width, height, android.graphics.Bitmap.Config.ARGB_8888)
            val latch = java.util.concurrent.CountDownLatch(1)

            activity.runOnUiThread {
                try {
                    val canvas = android.graphics.Canvas(bitmap)
                    canvas.drawColor(android.graphics.Color.parseColor("#0d0d15"))

                    var copySuccess = false
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                        val innerLatch = java.util.concurrent.CountDownLatch(1)
                        val handlerThread = android.os.HandlerThread("PixelCopyThread")
                        handlerThread.start()

                        android.view.PixelCopy.request(
                            window,
                            bitmap,
                            { copyResult ->
                                if (copyResult == android.view.PixelCopy.SUCCESS) {
                                    copySuccess = true
                                }
                                innerLatch.countDown()
                                handlerThread.quitSafely()
                            },
                            android.os.Handler(handlerThread.looper)
                        )
                        innerLatch.await(500, java.util.concurrent.TimeUnit.MILLISECONDS)
                    }

                    if (!copySuccess) {
                        view.draw(canvas)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "captureNativeScreen UI thread error", e)
                } finally {
                    latch.countDown()
                }
            }

            val success = latch.await(1000, java.util.concurrent.TimeUnit.MILLISECONDS)
            if (!success) {
                bitmap.recycle()
                return ""
            }

            val outputStream = java.io.ByteArrayOutputStream()
            bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 70, outputStream)
            val byteArray = outputStream.toByteArray()
            bitmap.recycle()
            "data:image/jpeg;base64," + android.util.Base64.encodeToString(byteArray, android.util.Base64.NO_WRAP)
        } catch (e: Exception) {
            Log.e(TAG, "captureNativeScreen error", e)
            ""
        }
    }

    @JavascriptInterface
    fun openSettingsPermission(permissionType: String) {
        try {
            when (permissionType) {
                "NOTIFICATION" -> {
                    val intent = Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(intent)
                }
                "ACCESSIBILITY" -> {
                    val intent = Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS)
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(intent)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open settings for $permissionType", e)
        }
    }
}
