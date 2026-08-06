package com.novax.venom

import android.Manifest
import android.util.Log
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.novax.venom.auth.AuthManager
import com.novax.venom.memory.CloudMemorySync
import com.novax.venom.memory.VenomDatabase
import com.novax.venom.ui.SettingsScreen
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    companion object {
        private const val PERMISSIONS_REQUEST_CODE = 101
    }

    private lateinit var authManager: AuthManager
    private lateinit var settingsManager: SettingsManager
    private lateinit var cloudMemorySync: CloudMemorySync

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        authManager = AuthManager(this)
        settingsManager = SettingsManager(this)
        cloudMemorySync = CloudMemorySync(VenomDatabase.getDatabase(this))
        
        requestPermissionsIfNeeded()
        startForegroundService()

        setContent {
            VenomTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Color(0xFF050505)
                ) {
                    var isLoggedIn by remember { mutableStateOf(authManager.currentUser != null) }
                    
                    if (isLoggedIn) {
                        var showSettings by remember { mutableStateOf(settingsManager.getApiKey().isNullOrEmpty()) }
                        val coroutineScope = rememberCoroutineScope()
                        
                        // Sync settings down from cloud on login
                        LaunchedEffect(Unit) {
                            authManager.currentUser?.uid?.let { uid ->
                                val cloudApiKey = cloudMemorySync.getApiKey(uid)
                                if (!cloudApiKey.isNullOrEmpty()) {
                                    settingsManager.setApiKey(cloudApiKey)
                                    showSettings = false
                                }
                                // Also sync facts down
                                cloudMemorySync.syncFactsDown(uid)
                            }
                        }
                        
                        if (showSettings) {
                            SettingsScreen(
                                settingsManager = settingsManager,
                                onClose = { showSettings = false },
                                onApiKeySaved = { apiKey -> 
                                    authManager.currentUser?.uid?.let { uid ->
                                        coroutineScope.launch {
                                            cloudMemorySync.saveApiKey(uid, apiKey)
                                        }
                                    }
                                }
                            )
                        } else {
                            VenomOrbScreen(
                                onSignOut = {
                                    coroutineScope.launch {
                                        authManager.signOut()
                                        isLoggedIn = false
                                    }
                                },
                                onSettings = { showSettings = true }
                            )
                        }
                    } else {
                        LoginScreen(
                            authManager = authManager,
                            onLoginSuccess = { isLoggedIn = true }
                        )
                    }
                }
            }
        }
    }

    private fun requestPermissionsIfNeeded() {
        val permissions = mutableListOf(
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.CAMERA,
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.CALL_PHONE
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }

        val missing = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (missing.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toTypedArray(), PERMISSIONS_REQUEST_CODE)
        }
    }

    private fun startForegroundService() {
        val serviceIntent = Intent(this, VenomForegroundService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent?.let {
            if (it.getBooleanExtra("TRIGGER_LIVE_SESSION", false)) {
                Log.d("MainActivity", "Live session trigger received from wake-word service")
            }
        }
    }
}

@Composable
fun VenomTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            background = Color(0xFF050505),
            surface = Color(0xFF0A0A0A),
            primary = Color(0xFF9D4EDD), // Neon Violet
            secondary = Color(0xFF00E5FF) // Cyan
        ),
        content = content
    )
}

@Composable
fun VenomOrbScreen(onSignOut: () -> Unit = {}, onSettings: () -> Unit = {}) {
    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Button(onClick = onSettings) {
                Text("Settings & Memory")
            }
            Button(onClick = onSignOut) {
                Text("Sign Out")
            }
        }
        
        Spacer(modifier = Modifier.weight(1f))
        
        // Placeholder for the Animated Orb
        Box(
            modifier = Modifier
                .size(200.dp)
                .background(Color(0xFF1A1A1A), shape = androidx.compose.foundation.shape.CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "VENOM",
                color = Color(0xFF9D4EDD),
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold
            )
        }
        
        Spacer(modifier = Modifier.height(32.dp))
        
        Text(
            text = "Listening for 'Venom'...",
            color = Color.Gray,
            fontSize = 16.sp
        )
        
        Spacer(modifier = Modifier.weight(1f))
    }
}

@Composable
fun LoginScreen(authManager: AuthManager, onLoginSuccess: () -> Unit) {
    val coroutineScope = rememberCoroutineScope()
    var isLoggingIn by remember { mutableStateOf(false) }
    
    // Automatically trigger sign-in when the screen is shown
    LaunchedEffect(Unit) {
        if (!isLoggingIn) {
            isLoggingIn = true
            val success = authManager.signInWithGoogle()
            if (success) {
                onLoginSuccess()
            } else {
                isLoggingIn = false
            }
        }
    }
    
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "Welcome to VENOM",
            color = Color(0xFF9D4EDD),
            fontSize = 32.sp,
            fontWeight = FontWeight.Bold
        )
        
        Spacer(modifier = Modifier.height(48.dp))
        
        Button(
            onClick = {
                isLoggingIn = true
                coroutineScope.launch {
                    val success = authManager.signInWithGoogle()
                    if (success) {
                        onLoginSuccess()
                    } else {
                        isLoggingIn = false
                    }
                }
            },
            enabled = !isLoggingIn
        ) {
            if (isLoggingIn) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
            } else {
                Text("Sign in with Google")
            }
        }
    }
}
