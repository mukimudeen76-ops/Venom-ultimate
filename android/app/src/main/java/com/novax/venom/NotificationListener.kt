package com.novax.venom

import android.app.Notification
import android.app.RemoteInput
import android.content.Intent
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

data class ActiveNotificationData(
    val id: String,
    val packageName: String,
    val title: String,
    val text: String,
    val timestamp: Long,
    val sbn: StatusBarNotification
)

class NotificationListener : NotificationListenerService() {
    companion object {
        private const val TAG = "NotificationListener"
        private val activeNotificationsMap = mutableMapOf<String, ActiveNotificationData>()

        fun getNotificationsJson(): String {
            val jsonArray = JSONArray()
            synchronized(activeNotificationsMap) {
                activeNotificationsMap.values.forEach { item ->
                    val obj = JSONObject()
                    obj.put("id", item.id)
                    obj.put("packageName", item.packageName)
                    obj.put("title", item.title)
                    obj.put("text", item.text)
                    obj.put("timestamp", item.timestamp)
                    jsonArray.put(obj)
                }
            }
            return jsonArray.toString()
        }

        fun replyNotification(id: String, messageText: String): Boolean {
            synchronized(activeNotificationsMap) {
                val item = activeNotificationsMap[id] ?: return false
                val notification = item.sbn.notification ?: return false
                val actions = notification.actions ?: return false

                for (action in actions) {
                    val remoteInputs = action.remoteInputs ?: continue
                    for (remoteInput in remoteInputs) {
                        if (action.actionIntent != null) {
                            val intent = Intent()
                            val bundle = Bundle()
                            bundle.putCharSequence(remoteInput.resultKey, messageText)
                            RemoteInput.addResultsToIntent(remoteInputs, intent, bundle)
                            try {
                                action.actionIntent.send(item.sbn.notification.contentIntent?.creatorUserHandle?.let { null }, 0, intent)
                                Log.d(TAG, "Sent reply via RemoteInput to $id")
                                return true
                            } catch (e: Exception) {
                                Log.e(TAG, "Failed to send RemoteInput reply", e)
                            }
                        }
                    }
                }
            }
            return false
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        sbn ?: return
        val extras = sbn.notification.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""

        if (title.isNotEmpty() || text.isNotEmpty()) {
            val id = sbn.key
            synchronized(activeNotificationsMap) {
                activeNotificationsMap[id] = ActiveNotificationData(
                    id = id,
                    packageName = sbn.packageName,
                    title = title,
                    text = text,
                    timestamp = sbn.postTime,
                    sbn = sbn
                )
            }
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        sbn ?: return
        synchronized(activeNotificationsMap) {
            activeNotificationsMap.remove(sbn.key)
        }
    }
}
