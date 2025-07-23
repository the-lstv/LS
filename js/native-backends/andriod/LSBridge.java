package com.lstv.nativebridge;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class LSBridge {
    private final Context context;
    private WebView webView;
    private final DynamicColorBridge dynamicColorBridge;

    public LSBridge(Context activity) {
        this.context = activity;

        this.dynamicColorBridge = new DynamicColorBridge(activity);
    }

    @SuppressLint("SetJavaScriptEnabled")
    public void attach(WebView webView){
        this.webView = webView;

        webView.setWebViewClient(new WebViewClient());
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setDatabaseEnabled(true);
    }

    public void load(String file){
        webView.loadUrl("file:///android_asset/" + file);
        webView.addJavascriptInterface(this, "LSNative_Android_Proxy");
    }

    public void dispatch(String event, String data) {
        webView.evaluateJavascript("LS.Native.emit(`android." + event.replaceAll("`", "\\\\`") + "`, `[" + data + "]`);", null);
    }

    public void dispatch(String event) {
        webView.evaluateJavascript("LS.Native.emit(`android." + event.replaceAll("`", "\\\\`") + "`);", null);
    }

    // Syntax: handle_[input type]_[output type]

    @JavascriptInterface
    public void handle_void_void (String event){
        switch (event) {
            case "close":
                // Clear all activities from the back stack
                Intent intent = new Intent(this.context, this.context.getClass());
                intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                this.context.startActivity(intent);
                break;
        }
    }

    @JavascriptInterface
    public void handle_string_void(String event, String data){
        switch (event) {
            case "android.toast":
                Toast.makeText(this.context, data, Toast.LENGTH_SHORT).show();
                break;
        }
    }

    @JavascriptInterface
    public boolean handle_void_boolean(String event) {
        switch (event) {
            case "dynamicColors.isAvailable":
                return this.dynamicColorBridge.isDynamicColorAvailable();
            case "dynamicColors.isLight":
                return this.dynamicColorBridge.dayNightIsDay();
        }
        return false;
    }

    @JavascriptInterface
    public String handle_void_string(String event) {
        switch (event) {
            case "ping":
                return "pong";
            case "dynamicColors.isAvailable":
                return this.dynamicColorBridge.isDynamicColorAvailable()? "true" : "false";
            case "dynamicColors.isLight":
                return this.dynamicColorBridge.dayNightIsDay()? "true" : "false";
            case "dynamicColors.getColor":
                return this.dynamicColorBridge.getDynamicColor();
            case "dynamicColors.getPalette":
                return this.dynamicColorBridge.getDynamicPalette();
            case "dynamicColors.getMain":
                return this.dynamicColorBridge.getDynamicMainColor();
        }
        return null;
    }
}