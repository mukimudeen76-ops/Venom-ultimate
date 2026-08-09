package com.novax.venom

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.util.Base64
import android.util.Log
import android.webkit.WebView
import java.io.ByteArrayOutputStream

/**
 * VENOM REAL screen capture (Android).
 *
 * Uses the Android MediaProjection API to capture the ACTUAL device screen —
 * every app, not just the WebView — and streams JPEG frames into the web layer
 * as 'venomScreenFrame' CustomEvents. This is how Venom truly SEES the phone:
 * "yah har chij ko dekh sakta hai".
 *
 * Requires the user to approve the system "Start recording/casting" dialog once
 * per capture session (standard Android privacy requirement).
 */
class ScreenCaptureManager(private val context: Context, private val webView: WebView) {

    companion object {
        private const val TAG = "VenomScreen"
        private const val MAX_WIDTH = 1280
    }

    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var handlerThread: HandlerThread? = null
    private var handler: Handler? = null

    @Volatile
    var capturing = false
        private set

    /** Called with the result of the MediaProjection permission dialog. */
    fun startCapture(resultCode: Int, data: Intent) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return
        stopCapture()

        try {
            val mpm = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            val mp = mpm.getMediaProjection(resultCode, data)
                ?: run {
                    Log.e(TAG, "MediaProjection was not granted")
                    return
                }
            mediaProjection = mp

            val metrics = context.resources.displayMetrics
            val width = metrics.widthPixels
            val height = metrics.heightPixels
            val density = metrics.densityDpi

            handlerThread = HandlerThread("VenomScreenCapture").apply { start() }
            handler = Handler(handlerThread!!.looper)

            imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
            imageReader?.setOnImageAvailableListener({ reader ->
                val image = reader.acquireLatestImage() ?: return@setOnImageAvailableListener
                try {
                    val plane = image.planes[0]
                    val buffer = plane.buffer
                    val pixelStride = plane.pixelStride
                    val rowStride = plane.rowStride
                    val rowPadding = rowStride - pixelStride * width

                    val bitmap = Bitmap.createBitmap(
                        width + rowPadding / pixelStride,
                        height,
                        Bitmap.Config.ARGB_8888
                    )
                    bitmap.copyPixelsFromBuffer(buffer)
                    val cropped = Bitmap.createBitmap(bitmap, 0, 0, width, height)

                    // Downscale to a Gemini-friendly size
                    val scale = if (width > MAX_WIDTH) MAX_WIDTH.toFloat() / width else 1f
                    val out = if (scale < 1f) {
                        Bitmap.createScaledBitmap(
                            cropped,
                            (width * scale).toInt(),
                            (height * scale).toInt(),
                            true
                        )
                    } else {
                        cropped
                    }

                    val baos = ByteArrayOutputStream()
                    out.compress(Bitmap.CompressFormat.JPEG, 70, baos)
                    val b64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)
                    pushFrame("data:image/jpeg;base64,$b64")

                    if (out !== cropped) out.recycle()
                    cropped.recycle()
                    bitmap.recycle()
                } catch (e: Exception) {
                    Log.e(TAG, "Frame processing error", e)
                } finally {
                    image.close()
                }
            }, handler)

            virtualDisplay = mediaProjection?.createVirtualDisplay(
                "VenomScreenCapture",
                width,
                height,
                density,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader?.surface,
                null,
                handler
            )

            if (virtualDisplay == null) {
                Log.e(TAG, "VirtualDisplay creation failed")
                stopCapture()
                return
            }
            capturing = true
            Log.d(TAG, "Real screen capture started (${width}x$height)")
        } catch (e: Exception) {
            Log.e(TAG, "startCapture failed", e)
            stopCapture()
        }
    }

    fun stopCapture() {
        capturing = false
        try { virtualDisplay?.release() } catch (e: Exception) {}
        virtualDisplay = null
        try { imageReader?.close() } catch (e: Exception) {}
        imageReader = null
        try { mediaProjection?.stop() } catch (e: Exception) {}
        mediaProjection = null
        try { handlerThread?.quitSafely() } catch (e: Exception) {}
        handlerThread = null
        handler = null
    }

    private fun pushFrame(frameUrl: String) {
        val script =
            "try{window.dispatchEvent(new CustomEvent('venomScreenFrame',{detail:{frame:'$frameUrl'}}));}catch(e){}"
        webView.post { webView.evaluateJavascript(script, null) }
    }
}
