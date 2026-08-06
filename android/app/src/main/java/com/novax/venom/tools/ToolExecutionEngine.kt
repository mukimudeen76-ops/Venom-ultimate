package com.novax.venom.tools

import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.net.Uri
import android.provider.AlarmClock
import android.provider.ContactsContract
import android.provider.MediaStore
import android.provider.Settings
import android.util.Log
import android.view.KeyEvent
import org.json.JSONArray
import org.json.JSONObject

class ToolExecutionEngine(private val context: Context) {

    fun openApp(appName: String): String {
        val pm = context.packageManager
        try {
            var launchIntent = pm.getLaunchIntentForPackage(appName)
            if (launchIntent == null) {
                val packages = pm.getInstalledApplications(0)
                for (packageInfo in packages) {
                    val name = pm.getApplicationLabel(packageInfo).toString()
                    if (name.contains(appName, ignoreCase = true)) {
                        launchIntent = pm.getLaunchIntentForPackage(packageInfo.packageName)
                        if (launchIntent != null) break
                    }
                }
            }
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(launchIntent)
                return "Opened $appName successfully."
            }
        } catch (e: Exception) {
            Log.e("ToolExecutionEngine", "Error opening app $appName", e)
        }
        return "Could not find app named $appName on this device."
    }

    fun placePhoneCall(phoneNumber: String): String {
        try {
            val intent = Intent(Intent.ACTION_CALL).apply {
                data = Uri.parse("tel:$phoneNumber")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            return "Calling $phoneNumber."
        } catch (e: SecurityException) {
            // Fallback to dialer if CALL_PHONE permission is not directly granted
            try {
                val dialIntent = Intent(Intent.ACTION_DIAL).apply {
                    data = Uri.parse("tel:$phoneNumber")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(dialIntent)
                return "Opened dialer for $phoneNumber."
            } catch (ex: Exception) {
                return "Permission denied to place phone call."
            }
        } catch (e: Exception) {
            return "Failed to place call: ${e.message}"
        }
    }

    fun sendSms(phoneNumber: String, message: String): String {
        return try {
            val intent = Intent(Intent.ACTION_SENDTO).apply {
                data = Uri.parse("smsto:$phoneNumber")
                putExtra("sms_body", message)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            "Opened SMS messenger with recipient $phoneNumber."
        } catch (e: Exception) {
            "Failed to send SMS: ${e.message}"
        }
    }

    fun setAlarm(hour: Int, minute: Int, label: String): String {
        return try {
            val intent = Intent(AlarmClock.ACTION_SET_ALARM).apply {
                putExtra(AlarmClock.EXTRA_HOUR, hour)
                putExtra(AlarmClock.EXTRA_MINUTES, minute)
                putExtra(AlarmClock.EXTRA_MESSAGE, label)
                putExtra(AlarmClock.EXTRA_SKIP_UI, true)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            "Alarm set for %02d:%02d (%s).".format(hour, minute, label)
        } catch (e: Exception) {
            "Failed to set alarm: ${e.message}"
        }
    }

    fun setTimer(seconds: Int, label: String): String {
        return try {
            val intent = Intent(AlarmClock.ACTION_SET_TIMER).apply {
                putExtra(AlarmClock.EXTRA_LENGTH, seconds)
                putExtra(AlarmClock.EXTRA_MESSAGE, label)
                putExtra(AlarmClock.EXTRA_SKIP_UI, true)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            "Timer set for $seconds seconds ($label)."
        } catch (e: Exception) {
            "Failed to set timer: ${e.message}"
        }
    }

    fun controlMedia(action: String): String {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
            ?: return "Audio manager unavailable."

        val keyCode = when (action.lowercase()) {
            "play", "pause", "toggle" -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
            "next", "skip" -> KeyEvent.KEYCODE_MEDIA_NEXT
            "previous", "prev" -> KeyEvent.KEYCODE_MEDIA_PREVIOUS
            "stop" -> KeyEvent.KEYCODE_MEDIA_STOP
            else -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
        }

        return try {
            val downEvent = KeyEvent(KeyEvent.ACTION_DOWN, keyCode)
            val upEvent = KeyEvent(KeyEvent.ACTION_UP, keyCode)
            audioManager.dispatchMediaKeyEvent(downEvent)
            audioManager.dispatchMediaKeyEvent(upEvent)
            "Media control command '$action' executed."
        } catch (e: Exception) {
            "Failed to execute media control: ${e.message}"
        }
    }

    fun setVolume(streamType: String, levelPercent: Int): String {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
            ?: return "Audio manager unavailable."

        val stream = when (streamType.lowercase()) {
            "media", "music" -> AudioManager.STREAM_MUSIC
            "ring", "ringer" -> AudioManager.STREAM_RING
            "alarm" -> AudioManager.STREAM_ALARM
            "notification" -> AudioManager.STREAM_NOTIFICATION
            else -> AudioManager.STREAM_MUSIC
        }

        val maxVol = audioManager.getStreamMaxVolume(stream)
        val targetVol = (maxVol * (levelPercent.coerceIn(0, 100) / 100.0)).toInt()

        return try {
            audioManager.setStreamVolume(stream, targetVol, AudioManager.FLAG_SHOW_UI)
            "Volume for $streamType set to $levelPercent%."
        } catch (e: Exception) {
            "Failed to adjust volume: ${e.message}"
        }
    }

    fun openSettingsScreen(settingType: String): String {
        val action = when (settingType.uppercase()) {
            "WIFI" -> Settings.ACTION_WIFI_SETTINGS
            "BLUETOOTH" -> Settings.ACTION_BLUETOOTH_SETTINGS
            "DISPLAY" -> Settings.ACTION_DISPLAY_SETTINGS
            "SOUND", "VOLUME" -> Settings.ACTION_SOUND_SETTINGS
            "LOCATION" -> Settings.ACTION_LOCATION_SOURCE_SETTINGS
            "NOTIFICATION" -> "android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"
            "ACCESSIBILITY" -> Settings.ACTION_ACCESSIBILITY_SETTINGS
            else -> Settings.ACTION_SETTINGS
        }

        return try {
            val intent = Intent(action).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            "Opened $settingType settings screen."
        } catch (e: Exception) {
            "Failed to open settings: ${e.message}"
        }
    }

    fun takePhoto(): String {
        return try {
            val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            "Camera opened for photo capture."
        } catch (e: Exception) {
            "Failed to open camera: ${e.message}"
        }
    }

    fun searchContacts(query: String): String {
        val array = JSONArray()
        try {
            val uri = ContactsContract.CommonDataKinds.Phone.CONTENT_URI
            val projection = arrayOf(
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER
            )
            val selection = "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} LIKE ?"
            val selectionArgs = arrayOf("%$query%")
            val cursor = context.contentResolver.query(uri, projection, selection, selectionArgs, null)

            cursor?.use {
                val nameIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
                val numIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
                while (it.moveToNext()) {
                    val name = it.getString(nameIdx)
                    val number = it.getString(numIdx)
                    val obj = JSONObject()
                    obj.put("name", name)
                    obj.put("number", number)
                    array.put(obj)
                }
            }
        } catch (e: Exception) {
            Log.e("ToolExecutionEngine", "searchContacts error", e)
        }
        return array.toString()
    }
}

