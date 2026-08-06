package com.novax.venom.memory

import android.util.Log
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await
import java.util.UUID

class CloudMemorySync(private val db: VenomDatabase) {
    private val firestore = FirebaseFirestore.getInstance()

    suspend fun syncFactsDown(userId: String) {
        try {
            val snapshot = firestore.collection("users").document(userId)
                .collection("memory_vault")
                .get()
                .await()

            val facts = snapshot.documents.mapNotNull { doc ->
                val fact = doc.getString("fact") ?: return@mapNotNull null
                val timestamp = doc.getLong("timestamp") ?: System.currentTimeMillis()
                val category = doc.getString("category") ?: "general"
                MemoryFact(doc.id, userId, fact, timestamp, category)
            }
            
            // Sync down to local Room DB
            facts.forEach { db.memoryDao().insertFact(it) }
        } catch (e: Exception) {
            Log.e("CloudMemorySync", "Failed to sync facts down", e)
        }
    }

    suspend fun saveFact(userId: String, factText: String, category: String = "general") {
        val factId = UUID.randomUUID().toString()
        val timestamp = System.currentTimeMillis()
        val memoryFact = MemoryFact(factId, userId, factText, timestamp, category)

        // Save local
        db.memoryDao().insertFact(memoryFact)

        // Save to cloud
        try {
            val factMap = hashMapOf(
                "fact" to factText,
                "timestamp" to timestamp,
                "category" to category
            )
            firestore.collection("users").document(userId)
                .collection("memory_vault").document(factId)
                .set(factMap)
                .await()
        } catch (e: Exception) {
            Log.e("CloudMemorySync", "Failed to sync fact to cloud", e)
        }
    }

    suspend fun saveRawLog(userId: String, role: String, message: String) {
        try {
            val logMap = hashMapOf(
                "role" to role,
                "message" to message,
                "timestamp" to System.currentTimeMillis()
            )
            firestore.collection("users").document(userId)
                .collection("raw_logs").document()
                .set(logMap)
                .await()
        } catch (e: Exception) {
            Log.e("CloudMemorySync", "Failed to save raw log", e)
        }
    }

    suspend fun saveApiKey(userId: String, apiKey: String) {
        try {
            val settingsMap = hashMapOf("gemini_api_key" to apiKey)
            firestore.collection("users").document(userId)
                .collection("settings").document("preferences")
                .set(settingsMap)
                .await()
        } catch (e: Exception) {
            Log.e("CloudMemorySync", "Failed to save API key to cloud", e)
        }
    }

    suspend fun getApiKey(userId: String): String? {
        return try {
            val snapshot = firestore.collection("users").document(userId)
                .collection("settings").document("preferences")
                .get()
                .await()
            snapshot.getString("gemini_api_key")
        } catch (e: Exception) {
            Log.e("CloudMemorySync", "Failed to fetch API key from cloud", e)
            null
        }
    }
}
