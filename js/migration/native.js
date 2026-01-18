
/**
 * LS.Native is an (unfinished) attempt at making LS a cross-platform framework and bridinging features from any platform into one seamless API.
 * It aims at being small in size and easy to deploy in any environment without much extra setup.
 * 
 * It also has extensions made for seamless integration with platforms like Android (material v3) and GTK on Linux.
 * This includes the synchronisation of color schemes, dark/light themes, among other things.
 * 
 * Based on the original LSv3 implementation - still in *very* early development.
 * The code sucks.
 * 
 * @author lstv.space
 * @license GPL-3.0
 */

class DefaultHandler extends LS.EventEmitter {
    constructor(type) {
        super();
        this.type = type || "web";
    }

    connect() {
        return Promise.resolve(this);
    }

    close() {
        // This will fail if the window was not opened by a script
        return close();
    }

    showToast(text, options = {}) {
        if(LS.Toast) {
            LS.Toast.show(text, options);
        }
    }

    get preferredTheme() {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches? "light" : "dark";
    }

    applyTheme() {
        LS.Color.setAdaptiveTheme();
    }

    applyAccent() {
        if (localStorage.hasOwnProperty("ls-accent")) {
            const accent = localStorage.getItem("ls-accent");
            if (accent.startsWith("#")) {
                LS.Color.update("custom", accent);
                LS.Color.setAccent("custom");
            } else {
                LS.Color.setAccent(accent);
            }
        }
    }

    get window() {
        return null;
    }

    /**
     * Method for registering global (system-wide) shortcuts
     * For normal (in-app) shortcuts, use LS.ShortcutManager instead!
     * @param {string} shortcut - The global shortcut string (e.g., "Alt+Shift+S")
     * @param {function} callback - The callback function to execute when the shortcut is triggered
     */
    registerShortcut(shortcut, callback) {
        if(!this.shortcutManager) {
            this.shortcutManager = new LS.ShortcutManager();
        }

        this.shortcutManager.register(shortcut, callback);
    }

    toggleDevTools() {
        return false;
    }
}

class ArcHandler extends DefaultHandler {
    constructor(arc) {
        super("arc");
        this.arc = arc;
    }

    close(){
        return this.arc.window.close();
    }

    get window() {
        return this.arc.window;
    }

    registerShortcut(shortcut, callback) {
        return this.arc.registerShortcut(shortcut, callback);
    }

    toggleDevTools() {
        return this.arc.toggleDevTools();
    }
}

class AndroidHandler extends DefaultHandler {
    constructor(proxy){
        if(!proxy) throw new Error("Android proxy object is required to create LS.Native.Android instance.");
        super("android");
        this.proxy = proxy;
    }

    connect() {
        if(this.connected) return Promise.resolve(this);

        return this.__connectPromise || (this.__connectPromise = new Promise((resolve, reject) => {
            let timeout = 0;

            const check = () => {
                if(typeof window.LSNative_Android_Proxy !== "undefined"){
                    this.connected = true;
                    resolve(this);
                    clearInterval(connecting);
                    this.__connectPromise = null;
                } else {
                    timeout++
                    if(timeout > 10){
                        clearInterval(connecting);
                        reject(new Error("Could not estabilish communication with the Android backend. Make sure you have setup your WebView properly and are using the latest version of the proxy library!"));
                    }
                }
            }

            const connecting = setInterval(check, 50);
            check();
        }));
    }

    resolve(event, data, options = {}){
        if(typeof options == "string") options = { type: options };
        let method = ("handle_" + ((data === null || typeof data == "undefined")? "void" : typeof data) + "_" + (options.type || "void")).toLowerCase().trim();
        if(!LSNative_Android_Proxy[method]) throw `Unsupported method (${method}). Make sure you have types set right.`;
        return LSNative_Android_Proxy[method](event);
    }

    close(){
        return this.proxy.handle_void_void("close");
    }

    showToast(text){
        return this.resolve("android.toast", text)
    }

    get preferredTheme(){
        return this.resolve("dynamicColors.isLight", null, "boolean")? "light": "dark";
    }

    applyTheme(){
        LS.Color.setTheme(this.preferredTheme);
    }

    applyAccent(){
        // Override if ls-accent is set
        if(localStorage.hasOwnProperty("ls-accent")) {
            super.applyAccent();
            return;
        }

        let colors = JSON.parse(this.resolve("dynamicColors.getMain", null, "string"));
        LS.Color.add("dynamicColor", colors.primary);
        LS.Color.setAccent("dynamicColor");
    }

    get dynamicColorsIsAvailable() {
        return this.resolve("dynamicColors.isAvailable", null, "boolean");
    }

    getDynamicColor(){
        return JSON.parse(this.resolve("dynamicColors.getColor", null, "string"));
    }

    getDynamicPalette(){
        return JSON.parse(this.resolve("dynamicColors.getPalette", null, "string"));
    }

    getDynamicMain(){
        return JSON.parse(this.resolve("dynamicColors.getMain", null, "string"));
    }
}

class iOSHandler extends DefaultHandler {
    constructor() {
        super("ios");
    }
}

LS.LoadComponent(class Native extends LS.Component {
    constructor() {
        super();

        /**
         * @property {string} platform - The current platform the application is running on.
         * android - Running inside a WebView with LSNative_Android_Proxy available.
         * arc - Running inside an Arc launcher environment (desktop/electron).
         * web - Running in a standard web environment.
         */
        this.platform = window.LS_NATIVE_PLATFORM || ((typeof window.LSNative_Android_Proxy !== "undefined")? "android": (typeof window.arc !== "undefined")? "arc": "web");

        this.connected = false;
        switch(this.platform){
            case "android":
                Object.setPrototypeOf(this, AndroidHandler.prototype);
                this.connect();
                break;

            case "arc":
                Object.setPrototypeOf(this, ArcHandler.prototype);
                this.connected = true;
                break;

            case "web":
                Object.setPrototypeOf(this, DefaultHandler.prototype);
                this.connected = true;
                break;
        }
    }
}, { global: true, singular: true, name: "Native" });


/*

LS.Native.connect().then(native => {
    native.applyTheme();
    native.applyAccent();
}).catch(err => {
    console.error(err);
});

*/