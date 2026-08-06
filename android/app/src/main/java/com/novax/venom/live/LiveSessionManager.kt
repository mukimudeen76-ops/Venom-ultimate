package com.novax.venom.live

import android.content.Context
import android.util.Log
import com.novax.venom.SettingsManager
import com.novax.venom.auth.AuthManager
import com.novax.venom.memory.CloudMemorySync
import com.novax.venom.memory.VenomDatabase
import kotlinx.coroutines.*
import okhttp3.*
import okio.ByteString
import okio.ByteString.Companion.toByteString
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class LiveSessionManager(private val context: Context) {
    private val settingsManager = SettingsManager(context)
    private val authManager = AuthManager(context)
    private val cloudMemory = CloudMemorySync(VenomDatabase.getDatabase(context))
    
    private var webSocket: WebSocket? = null
    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()
        
    private val scope = CoroutineScope(Dispatchers.IO + Job())

    fun startSession(systemInstruction: String) {
        val apiKey = settingsManager.getApiKey()
        if (apiKey.isNullOrEmpty()) {
            Log.e("LiveSessionManager", "API Key is missing")
            return
        }

        val url = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=$apiKey"
        val request = Request.Builder().url(url).build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d("LiveSessionManager", "WebSocket Opened")
                sendSetupMessage(webSocket, systemInstruction)
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleMessage(text)
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                // Usually messages are text JSON, even when containing base64 audio
                handleMessage(bytes.utf8())
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.d("LiveSessionManager", "WebSocket Closed: $reason")
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e("LiveSessionManager", "WebSocket Error", t)
            }
        })
    }

    private fun sendSetupMessage(webSocket: WebSocket, systemInstruction: String) {
        val setupMsg = JSONObject().apply {
            put("setup", JSONObject().apply {
                put("model", "models/gemini-2.0-flash-exp")
                put("systemInstruction", JSONObject().apply {
                    put("parts", JSONArray().put(JSONObject().apply {
                        put("text", systemInstruction)
                    }))
                })
                put("tools", JSONArray().apply {
                    put(JSONObject().apply {
                        put("functionDeclarations", JSONArray().apply {
                            put(JSONObject().apply {
                                put("name", "saveMemoryFact")
                                put("description", "Save an important fact or preference about the user to long-term memory.")
                                put("parameters", JSONObject().apply {
                                    put("type", "OBJECT")
                                    put("properties", JSONObject().apply {
                                        put("fact", JSONObject().apply {
                                            put("type", "STRING")
                                            put("description", "The fact to remember (e.g., 'User loves coffee')")
                                        })
                                        put("category", JSONObject().apply {
                                            put("type", "STRING")
                                            put("description", "Category of the fact")
                                        })
                                    })
                                    put("required", JSONArray().put("fact"))
                                })
                            })
                        })
                    })
                })
            })
        }
        webSocket.send(setupMsg.toString())
        
        // Also send initial client content to start
        val clientContent = JSONObject().apply {
            put("clientContent", JSONObject().apply {
                put("turns", JSONArray().put(JSONObject().apply {
                    put("role", "user")
                    put("parts", JSONArray().put(JSONObject().apply {
                        put("text", "Hello, Venom.")
                    }))
                }))
                put("turnComplete", true)
            })
        }
        webSocket.send(clientContent.toString())
    }

    private fun handleMessage(jsonString: String) {
        try {
            val json = JSONObject(jsonString)
            if (json.has("serverContent")) {
                val serverContent = json.getJSONObject("serverContent")
                if (serverContent.has("modelTurn")) {
                    val parts = serverContent.getJSONObject("modelTurn").getJSONArray("parts")
                    for (i in 0 until parts.length()) {
                        val part = parts.getJSONObject(i)
                        if (part.has("text")) {
                            val text = part.getString("text")
                            Log.d("LiveSessionManager", "Model text: $text")
                            // Save to raw log
                            authManager.currentUser?.uid?.let { uid ->
                                scope.launch {
                                    cloudMemory.saveRawLog(uid, "venom", text)
                                }
                            }
                        }
                        if (part.has("inlineData")) {
                            val inlineData = part.getJSONObject("inlineData")
                            val base64Audio = inlineData.getString("data")
                            // TODO: Play audio
                        }
                    }
                }
            } else if (json.has("toolCall")) {
                val toolCall = json.getJSONObject("toolCall")
                val functionCalls = toolCall.getJSONArray("functionCalls")
                val functionResponses = JSONArray()
                
                for (i in 0 until functionCalls.length()) {
                    val call = functionCalls.getJSONObject(i)
                    val name = call.getString("name")
                    val id = call.getString("id")
                    val args = call.getJSONObject("args")
                    
                    var resultStr = "Executed"
                    if (name == "saveMemoryFact") {
                        val fact = args.getString("fact")
                        val category = if (args.has("category")) args.getString("category") else "general"
                        authManager.currentUser?.uid?.let { uid ->
                            scope.launch {
                                cloudMemory.saveFact(uid, fact, category)
                            }
                        }
                        resultStr = "Fact saved: $fact"
                    }
                    
                    functionResponses.put(JSONObject().apply {
                        put("name", name)
                        put("id", id)
                        put("response", JSONObject().apply {
                            put("result", resultStr)
                        })
                    })
                }
                
                // Send response
                val responseMsg = JSONObject().apply {
                    put("toolResponse", JSONObject().apply {
                        put("functionResponses", functionResponses)
                    })
                }
                webSocket?.send(responseMsg.toString())
            }
        } catch (e: Exception) {
            Log.e("LiveSessionManager", "Error parsing message", e)
        }
    }

    fun stopSession() {
        webSocket?.close(1000, "User stopped session")
        webSocket = null
        scope.cancel()
    }

    fun onAudioDataReceived(pcmData: ByteArray) {
        val base64Audio = android.util.Base64.encodeToString(pcmData, android.util.Base64.NO_WRAP)
        val realtimeInput = JSONObject().apply {
            put("realtimeInput", JSONObject().apply {
                put("mediaChunks", JSONArray().put(JSONObject().apply {
                    put("mimeType", "audio/pcm;rate=16000")
                    put("data", base64Audio)
                }))
            })
        }
        webSocket?.send(realtimeInput.toString())
    }
}
