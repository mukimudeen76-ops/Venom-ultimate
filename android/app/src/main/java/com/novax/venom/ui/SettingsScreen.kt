package com.novax.venom.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.novax.venom.SettingsManager
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.*
import java.io.IOException

@Composable
fun SettingsScreen(settingsManager: SettingsManager, onClose: () -> Unit, onApiKeySaved: (String) -> Unit) {
    var apiKey by remember { mutableStateOf(settingsManager.getApiKey() ?: "") }
    var saved by remember { mutableStateOf(false) }
    var isTesting by remember { mutableStateOf(false) }
    var testResult by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Settings", style = MaterialTheme.typography.headlineMedium)
        Spacer(modifier = Modifier.height(16.dp))
        
        OutlinedTextField(
            value = apiKey,
            onValueChange = { 
                apiKey = it
                saved = false
                testResult = null
            },
            label = { Text("Gemini API Key") },
            modifier = Modifier.fillMaxWidth()
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Row {
            Button(onClick = {
                isTesting = true
                testResult = null
                scope.launch {
                    val result = testGeminiApiKey(apiKey)
                    isTesting = false
                    if (result) {
                        testResult = "Success!"
                        settingsManager.setApiKey(apiKey)
                        onApiKeySaved(apiKey)
                        saved = true
                        onClose() // Auto close after saving successfully
                    } else {
                        testResult = "Invalid API Key"
                    }
                }
            }, enabled = !isTesting && apiKey.isNotBlank()) {
                if (isTesting) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Text("Test & Save")
                }
            }
            Spacer(modifier = Modifier.width(8.dp))
            Button(onClick = onClose, colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary)) {
                Text("Close")
            }
        }
        
        if (testResult != null) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(testResult!!, color = if (testResult == "Success!") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
        } else if (saved) {
            Spacer(modifier = Modifier.height(8.dp))
            Text("Saved!", color = MaterialTheme.colorScheme.primary)
        }
    }
}

suspend fun testGeminiApiKey(apiKey: String): Boolean {
    return suspendCancellableCoroutine { continuation ->
        val client = OkHttpClient()
        val url = "https://generativelanguage.googleapis.com/v1beta/models?key=$apiKey"
        val request = Request.Builder().url(url).build()
        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                if (continuation.isActive) continuation.resume(false, null)
            }
            override fun onResponse(call: Call, response: Response) {
                if (continuation.isActive) continuation.resume(response.isSuccessful, null)
            }
        })
    }
}
