package com.novax.venom

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.camera2.CameraManager
import android.os.BatteryManager
import android.util.Log
import android.webkit.JavascriptInterface
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONObject

class AndroidBridge(private val context: Context) {
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
    fun getVoiceName(): String {
        return securePrefs.getString(KEY_VOICE_NAME, "Puck") ?: "Puck"
    }

    @JavascriptInterface
    fun setVoiceName(voice: String) {
        securePrefs.edit().putString(KEY_VOICE_NAME, voice.trim()).apply()
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
            var launchIntent = pm.getLaunchIntentForPackage(appNameOrPackage)
            if (launchIntent == null) {
                // Try searching installed apps by label
                val installed = pm.getInstalledApplications(0)
                for (app in installed) {
                    val label = pm.getApplicationLabel(app).toString().lowercase()
                    if (label.contains(appNameOrPackage.lowercase())) {
                        launchIntent = pm.getLaunchIntentForPackage(app.packageName)
                        if (launchIntent != null) break
                    }
                }
            }
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(launchIntent)
                return true
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error opening app $appNameOrPackage", e)
        }
        return false
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
    fun setLiveSessionActive(active: Boolean) {
        val newState = if (active) MicState.LIVE_SESSION_ACTIVE else MicState.WAKE_LISTENING
        MicManager.transitionTo(newState)
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
