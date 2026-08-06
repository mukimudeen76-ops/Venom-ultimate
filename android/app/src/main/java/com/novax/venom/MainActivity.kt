package com.novax.venom

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat

/**
 * VENOM — native Android shell.
 * Hosts the full Venom assistant web app (bundled in assets/www) inside a WebView,
 * wires the native AndroidBridge (device control + secure Gemini key storage) and
 * starts the in-app updater (checks GitHub Releases, downloads & installs in place).
 */
class MainActivity : AppCompatActivity() {
    companion object {
        private const val PERMISSIONS_REQUEST_CODE = 101

        // Live reference used by background services (wake-word, clap) to push
        // events into the loaded WebView (e.g. "venomWakeWord").
        @Volatile
        var activeWebView: WebView? = null

        fun pushEvent(name: String, payload: String) {
            val wv = activeWebView ?: return
            val script =
                "try{window.dispatchEvent(new CustomEvent('$name',{detail:($payload)}));}catch(e){}"
            wv.post { wv.evaluateJavascript(script, null) }
        }
    }

    private lateinit var webView: WebView
    private lateinit var updateManager: UpdateManager
    private lateinit var screenCaptureManager: ScreenCaptureManager
    private var triggeredByWake = false

    private val mediaProjectionLauncher =
        registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode == RESULT_OK && result.data != null) {
                screenCaptureManager.startCapture(result.resultCode, result.data!!)
            } else {
                // User denied the screen-capture dialog — tell the web layer
                MainActivity.pushEvent(
                    "venomScreenFrameError",
                    """{"error":"screen-capture-denied"}"""
                )
            }
        }

    /** Called from AndroidBridge.startScreenCapture() — shows the system consent dialog. */
    fun requestScreenCapture() {
        try {
            val mpm = getSystemService(MEDIA_PROJECTION_SERVICE) as android.media.projection.MediaProjectionManager
            mediaProjectionLauncher.launch(mpm.createScreenCaptureIntent())
        } catch (e: Exception) {
            MainActivity.pushEvent(
                "venomScreenFrameError",
                """{"error":"${e.message?.replace("\"", "'") ?: "unknown"}"}"""
            )
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.apply {
            clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS)
            addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
            statusBarColor = Color.parseColor("#050505")
            navigationBarColor = Color.parseColor("#050505")
        }

        triggeredByWake = intent?.getBooleanExtra("TRIGGER_LIVE_SESSION", false) == true

        webView = WebView(this)
        setContentView(webView)
        MainActivity.activeWebView = webView
        setupWebView()

        // Permissions first: mic, location, camera, contacts, call, notifications
        // are requested right when the app opens so the assistant can hear you.
        requestPermissionsIfNeeded()
        startForegroundService()

        // Keep the always-on wake mic alive: ask to ignore battery optimizations
        // (once), so the OS/Doze doesn't kill the background listening service.
        requestIgnoreBatteryOptimizations()

        // Load the bundled assistant UI from local assets (offline-first, no server needed)
        webView.loadUrl("https://appassets.androidplatform.net/assets/www/index.html")

        updateManager = UpdateManager(this, webView)
        updateManager.checkForUpdate()
        updateManager.startPeriodicCheck()
    }

    /** Ask the user (once) to exempt VENOM from battery optimization so the
     *  always-on wake mic keeps running 24/7 like Google Assistant. */
    private fun requestIgnoreBatteryOptimizations() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        val prefs = getSharedPreferences("venom_prefs", MODE_PRIVATE)
        if (prefs.getBoolean("battery_exempt_asked", false)) return
        prefs.edit().putBoolean("battery_exempt_asked", true).apply()
        try {
            val pm = getSystemService(POWER_SERVICE) as android.os.PowerManager
            if (pm.isIgnoringBatteryOptimizations(packageName)) return
            val intent = Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = android.net.Uri.parse("package:$packageName")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
        } catch (e: Exception) {
            try {
                val intent = Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                startActivity(intent)
            } catch (e2: Exception) {
                // ignore
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Re-check for updates every time the app comes back to the foreground,
        // so a freshly published release shows the update banner right away.
        try {
            updateManager?.checkForUpdate()
        } catch (e: Exception) {
            // ignore
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            javaScriptCanOpenWindowsAutomatically = true
        }
        webView.setBackgroundColor(Color.parseColor("#050505"))
        webView.overScrollMode = View.OVER_SCROLL_NEVER

        // Native device-control + secure key storage bridge (consumed by the web app)
        val bridge = AndroidBridge(this, webView)
        screenCaptureManager = ScreenCaptureManager(this, webView)
        bridge.screenCaptureManager = screenCaptureManager
        webView.addJavascriptInterface(bridge, "AndroidBridge")

        // Native speech-to-text + text-to-speech (Android WebView lacks Web Speech API)
        webView.addJavascriptInterface(VenomSpeech(this, webView), "VenomSpeech")

        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // If the app was launched by the wake word / clap, tell the UI to
                // start a listening session right away.
                if (triggeredByWake) {
                    triggeredByWake = false
                    webView.postDelayed({
                        MainActivity.pushEvent(
                            "venomWakeWord",
                            """{"source":"launch"}"""
                        )
                    }, 1200)
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest?) {
                request?.let { it.grant(it.resources) }
            }
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent?.getBooleanExtra("TRIGGER_LIVE_SESSION", false) == true) {
            webView.postDelayed({
                MainActivity.pushEvent("venomWakeWord", """{"source":"wake"}""")
            }, 600)
        }
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        if (MainActivity.activeWebView === webView) {
            MainActivity.activeWebView = null
        }
        screenCaptureManager.stopCapture()
        updateManager.cancel()
        // WAKE-ONCE FIX: app band karte hi mic wapas always-on wake pe le aao,
        // taaki "wake venom" DOBARA se kaam kare (session ka mic stuck na rahe).
        if (MicManager.wakeEnabled) {
            MicManager.transitionTo(MicState.WAKE_LISTENING)
        }
        super.onDestroy()
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

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != 5001 && requestCode != PERMISSIONS_REQUEST_CODE) return
        try {
            val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
            val kind = when (permissions.firstOrNull()) {
                Manifest.permission.RECORD_AUDIO -> "mic"
                Manifest.permission.ACCESS_FINE_LOCATION -> "location"
                Manifest.permission.CAMERA -> "camera"
                Manifest.permission.READ_CONTACTS -> "contacts"
                Manifest.permission.POST_NOTIFICATIONS -> "notifications"
                else -> ""
            }
            if (kind.isNotEmpty()) {
                MainActivity.pushEvent("venomPermissionResult", """{"kind":"$kind","granted":$granted}""")
            }
        } catch (e: Exception) {
            Log.e("VenomMain", "onRequestPermissionsResult error", e)
        }
    }
}
