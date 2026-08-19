package br.com.travessiadocanarinho.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.PointerIcon
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.window.OnBackInvokedDispatcher
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader

class MainActivity : Activity() {
    private lateinit var webView: TvGameWebView
    private lateinit var hostBridge: AndroidTvHostBridge
    private var pageReady = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setBackgroundDrawableResource(R.color.game_background)
        hideSystemUi()

        hostBridge = AndroidTvHostBridge(this)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT
            ) {
                handleSystemBack()
            }
        }
        webView = TvGameWebView(this).apply {
            setBackgroundColor(Color.rgb(4, 17, 11))
            isFocusable = true
            isFocusableInTouchMode = true
            isHorizontalScrollBarEnabled = false
            isVerticalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
            setOnLongClickListener { true }

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                allowFileAccess = false
                allowContentAccess = false
                javaScriptCanOpenWindowsAutomatically = false
                setSupportMultipleWindows(false)
                builtInZoomControls = false
                displayZoomControls = false
                loadWithOverviewMode = false
                useWideViewPort = true
                cacheMode = WebSettings.LOAD_NO_CACHE
                blockNetworkLoads = true
            }

            addJavascriptInterface(hostBridge, "AndroidTvHost")
            webChromeClient = WebChromeClient()
            setDownloadListener { _, _, _, _, _ -> }
        }

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            @Suppress("DEPRECATION")
            override fun shouldInterceptRequest(view: WebView, url: String): WebResourceResponse? =
                assetLoader.shouldInterceptRequest(android.net.Uri.parse(url))

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                !isLocalGameUrl(request.url)

            @Suppress("DEPRECATION")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean =
                !isLocalGameUrl(android.net.Uri.parse(url))

            override fun onPageFinished(view: WebView, url: String) {
                pageReady = isLocalGameUrl(android.net.Uri.parse(url))
                if (pageReady) {
                    webView.hidePointer()
                    webView.requestFocus()
                }
            }
        }

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        setContentView(webView)
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        webView.loadUrl(GAME_URL)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val action = TvKeyMapper.actionFor(event.keyCode) ?: return super.dispatchKeyEvent(event)
        if (pageReady) {
            val pressed = event.action == KeyEvent.ACTION_DOWN
            val repeat = pressed && event.repeatCount > 0
            dispatchGameKey(action, pressed, repeat)
        }
        return true
    }

    @SuppressLint("GestureBackNavigation")
    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun onBackPressed() {
        handleSystemBack()
    }

    override fun onPause() {
        dispatchLifecycle("pause")
        webView.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        hideSystemUi()
        if (::webView.isInitialized) {
            webView.onResume()
            webView.hidePointer()
            dispatchLifecycle("resume")
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            hideSystemUi()
            if (::webView.isInitialized) webView.hidePointer()
        }
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean =
        if (event.isFromPointerDevice()) true else super.dispatchTouchEvent(event)

    override fun dispatchGenericMotionEvent(event: MotionEvent): Boolean =
        if (event.isFromPointerDevice()) true else super.dispatchGenericMotionEvent(event)

    override fun onDestroy() {
        if (::webView.isInitialized) {
            dispatchLifecycle("destroy")
            webView.removeJavascriptInterface("AndroidTvHost")
            webView.stopLoading()
            webView.loadUrl("about:blank")
            webView.clearHistory()
            webView.removeAllViews()
            webView.destroy()
        }
        if (::hostBridge.isInitialized) hostBridge.release()
        super.onDestroy()
    }

    private fun dispatchGameKey(action: String, pressed: Boolean, repeat: Boolean) {
        val script = "window.androidTvHandleKey && " +
            "window.androidTvHandleKey('$action', $pressed, $repeat);"
        webView.evaluateJavascript(script, null)
    }

    private fun handleSystemBack() {
        if (!pageReady) {
            finishAndRemoveTask()
            return
        }
        dispatchGameKey("back", pressed = true, repeat = false)
        dispatchGameKey("back", pressed = false, repeat = false)
    }

    private fun dispatchLifecycle(event: String) {
        if (!::webView.isInitialized || !pageReady) return
        webView.evaluateJavascript(
            "window.androidTvLifecycle && window.androidTvLifecycle('$event');",
            null
        )
    }

    private fun isLocalGameUrl(uri: android.net.Uri): Boolean =
        uri.scheme == "https" &&
            uri.host == WebViewAssetLoader.DEFAULT_DOMAIN &&
            uri.path == "/assets/index.html"

    @Suppress("DEPRECATION")
    private fun hideSystemUi() {
        window.decorView.pointerIcon =
            PointerIcon.getSystemIcon(this, PointerIcon.TYPE_NULL)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.apply {
                hide(WindowInsets.Type.systemBars())
                systemBarsBehavior =
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            window.decorView.systemUiVisibility =
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        }
    }

    companion object {
        private const val GAME_URL =
            "https://${WebViewAssetLoader.DEFAULT_DOMAIN}/assets/index.html?tv=1&app=androidtv"
    }
}

private fun MotionEvent.isFromPointerDevice(): Boolean =
    isFromSource(InputDevice.SOURCE_MOUSE) ||
        isFromSource(InputDevice.SOURCE_MOUSE_RELATIVE) ||
        isFromSource(InputDevice.SOURCE_TOUCHPAD)

internal object TvKeyMapper {
    fun actionFor(keyCode: Int): String? = when (keyCode) {
        KeyEvent.KEYCODE_DPAD_UP -> "up"
        KeyEvent.KEYCODE_DPAD_DOWN -> "down"
        KeyEvent.KEYCODE_DPAD_LEFT -> "left"
        KeyEvent.KEYCODE_DPAD_RIGHT -> "right"
        KeyEvent.KEYCODE_ENTER,
        KeyEvent.KEYCODE_NUMPAD_ENTER,
        KeyEvent.KEYCODE_DPAD_CENTER,
        KeyEvent.KEYCODE_BUTTON_A -> "confirm"
        KeyEvent.KEYCODE_BACK,
        KeyEvent.KEYCODE_BUTTON_B -> "back"
        KeyEvent.KEYCODE_BUTTON_START,
        KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> "start"
        else -> null
    }
}

class TvGameWebView(context: Context) : WebView(context) {
    private val hiddenPointer: PointerIcon =
        PointerIcon.getSystemIcon(context, PointerIcon.TYPE_NULL)

    init {
        pointerIcon = hiddenPointer
    }

    fun hidePointer() {
        pointerIcon = hiddenPointer
    }

    override fun onResolvePointerIcon(event: MotionEvent, pointerIndex: Int): PointerIcon =
        hiddenPointer

    override fun dispatchTouchEvent(event: MotionEvent): Boolean = true

    override fun onHoverEvent(event: MotionEvent): Boolean = true

    override fun onGenericMotionEvent(event: MotionEvent): Boolean {
        return if (event.isFromPointerDevice()) true else super.onGenericMotionEvent(event)
    }
}

class AndroidTvHostBridge(private val activity: Activity) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val audio = NativeToneAudio()

    @JavascriptInterface
    fun setPlaying(active: Boolean) {
        mainHandler.post {
            if (active) {
                activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else {
                activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
    }

    @JavascriptInterface
    fun playSound(name: String) {
        audio.play(name)
    }

    @JavascriptInterface
    fun exitApp() {
        mainHandler.post {
            activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            activity.finishAndRemoveTask()
        }
    }

    fun release() {
        audio.release()
    }
}

class NativeToneAudio {
    private val handler = Handler(Looper.getMainLooper())
    private val toneGenerator = ToneGenerator(AudioManager.STREAM_MUSIC, 72)

    fun play(name: String) {
        val (tone, duration) = when (name) {
            "step" -> ToneGenerator.TONE_DTMF_8 to 45
            "start" -> ToneGenerator.TONE_DTMF_6 to 120
            "confirm" -> ToneGenerator.TONE_DTMF_5 to 70
            "hit" -> ToneGenerator.TONE_DTMF_1 to 180
            "score" -> ToneGenerator.TONE_DTMF_9 to 190
            "over" -> ToneGenerator.TONE_DTMF_0 to 300
            else -> ToneGenerator.TONE_DTMF_5 to 70
        }
        handler.post {
            toneGenerator.stopTone()
            toneGenerator.startTone(tone, duration)
        }
    }

    fun release() {
        handler.post {
            toneGenerator.stopTone()
            toneGenerator.release()
        }
    }
}
