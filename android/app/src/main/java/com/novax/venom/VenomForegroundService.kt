package com.novax.venom

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat

class VenomForegroundService : Service() {
    companion object {
        private const val TAG = "VenomService"
        private const val CHANNEL_ID = "venom_foreground_channel"
        private const val NOTIFICATION_ID = 1001
        private const val SAMPLE_RATE = 16000
    }

    private var audioRecord: AudioRecord? = null
    private var isRecordRunning = false
    private var recordThread: Thread? = null

    private val wakeWordDetector = WakeWordDetector(this) {
        triggerAssistantSession()
    }

    private val clapDetector = ClapDetector {
        triggerAssistantSession()
    }

    private fun triggerAssistantSession() {
        try {
            val intent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                putExtra("TRIGGER_LIVE_SESSION", true)
            }
            startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch MainActivity on wake word", e)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        startAudioLoop()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        intent?.action?.let { action ->
            when (action) {
                "ENABLE_WAKE_WORD" -> wakeWordDetector.isEnabled = true
                "DISABLE_WAKE_WORD" -> wakeWordDetector.isEnabled = false
                "ENABLE_CLAP_WAKE" -> clapDetector.isEnabled = true
                "DISABLE_CLAP_WAKE" -> clapDetector.isEnabled = false
            }
        }
        return START_STICKY
    }

    private fun startAudioLoop() {
        if (isRecordRunning) return
        isRecordRunning = true

        try {
            recordThread = Thread {
                val buffer = ShortArray(1024)
                while (isRecordRunning) {
                    if (MicManager.isWakeListeningAllowed()) {
                        if (audioRecord == null) {
                            try {
                                val bufferSize = AudioRecord.getMinBufferSize(
                                    SAMPLE_RATE,
                                    AudioFormat.CHANNEL_IN_MONO,
                                    AudioFormat.ENCODING_PCM_16BIT
                                )
                                audioRecord = AudioRecord(
                                    MediaRecorder.AudioSource.MIC,
                                    SAMPLE_RATE,
                                    AudioFormat.CHANNEL_IN_MONO,
                                    AudioFormat.ENCODING_PCM_16BIT,
                                    Math.max(bufferSize, 2048)
                                )
                                audioRecord?.startRecording()
                                Log.d(TAG, "AudioRecord started - listening for wake word.")
                            } catch (e: Exception) {
                                Log.e(TAG, "Failed to initialize/start AudioRecord", e)
                                Thread.sleep(1000)
                                continue
                            }
                        }

                        val read = audioRecord?.read(buffer, 0, buffer.size) ?: 0
                        if (read > 0) {
                            wakeWordDetector.processBuffer(buffer, read)
                            clapDetector.processBuffer(buffer, read)
                        }
                    } else {
                        if (audioRecord != null) {
                            try {
                                audioRecord?.stop()
                                audioRecord?.release()
                                audioRecord = null
                                Log.d(TAG, "AudioRecord released to allow other contexts (WebView) to use the mic.")
                            } catch (e: Exception) {
                                Log.e(TAG, "Error stopping/releasing AudioRecord", e)
                            }
                        }
                        Thread.sleep(300)
                    }
                }
            }.apply { start() }

        } catch (e: Exception) {
            Log.e(TAG, "Failed to start recording thread", e)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "VENOM Background Assistant",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "VENOM active wake-word and system control background service"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("VENOM AI Assistant Active")
            .setContentText("Listening for 'Wake Venom' & background commands")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    override fun onDestroy() {
        super.onDestroy()
        isRecordRunning = false
        try {
            audioRecord?.stop()
            audioRecord?.release()
        } catch (e: Exception) {
            // ignore
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
