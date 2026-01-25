/*
    Author: Lukas (thelstv)
    Copyright: (c) https://lstv.space

    Last modified: 2026
    License: GPL-3.0
    Version: 5.2.9
    See: https://github.com/thelstv/LS
*/

(exports => {
    const instance = exports();

    if(typeof module !== "undefined"){
        module.exports = instance
    }

    console.log("Hi, this is a test (don't forget to remove this)!");

    if(instance.isWeb){
        const global = typeof window !== 'undefined'? window : globalThis;
        global.LS = instance;

        instance._events.prepareEvent("ready", { deopt: true });
        instance._events.alias("ready", "body-available"); // backward compatibility

        if(!window.LS_DEFER_INIT){
            instance.init({
                globalizeTiny: window.LS_DONT_GLOBALIZE_TINY !== true,
                globalPrototype: window.ls_do_not_prototype !== true,
                ...(window.LS_INIT_OPTIONS || null)
            });
            delete window.LS_INIT_OPTIONS;
        }
        delete window.LS_DEFER_INIT;

        function bodyAvailable(){
            instance._events.completed("ready", [document.body]);
        }

        if(document.body) bodyAvailable(); else window.addEventListener("DOMContentLoaded", bodyAvailable);
    }

    // Ensure this event is deoptimized
    instance._events.prepareEvent("component-loaded", { deopt: true });

    return instance;
})(() => {
    const CONTEXT_FIELDS = ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "fetch", "XMLHttpRequest", "requestAnimationFrame", "EventSource", "WebSocket", "queueMicrotask", "EventTarget", "MessageChannel", "MessagePort", "Worker"];

    /**
     * Event handling system with some advanced features used across LS.
     * 
     * Supports compiled mode for maximum performance (still experimental).
     * It is one of the fastest JS event emitters according to my benchmarks;
     * Only slightly behind Tseep (current fastest) in compiled mode, but faster than TseepSafe (2-3x) in loop mode.
     * 
     * When to use compiled mode (LS.EventEmitter.optimize = true, or deopt = false in per-event options):
     * - When you need absolute performance (eg. hot loops), have lots of listeners, and emit often.
     * 
     * When NOT to use compiled mode:
     * - If you expect listeners to be added/removed frequently, this will add recompilation overhead and may be even slower.
     * - In environments where eval() is disabled or restricted
     */
    class EventEmitter {
        static REMOVE_LISTENER = Symbol("event-remove");
        static optimize = true;

        static EventObject = class EventObject {
            listeners = [];
            free = []; // Still keeping freelist because listener order needs to be preserved
            compiled = null; // Compild function
            aliases = null;
            completed = false;
            warned = false;
            
            break = false;
            results = false;
            async = false;
            await = false;
            deopt = false;
            data = null; // Data used for completed events

            _isEvent = true;

            remove(index) {
                const listeners = this.listeners;
                if (listeners[index] == null) return;
                this.compiled = null;

                if(listeners.length === 1 || listeners.length === this.free.length + 1) { listeners.length = 0; this.free.length = 0; return; }

                listeners[index] = null;
                this.free.push(index);
            }

            emit(data) {
                return EventEmitter.emit(this, data);
            }

            /**
             * Recompile the event's internal emit function for performance.
             * Compilation may get skipped in which case the normal emit loop is used.
             */
            recompile() {
                const listeners = this.listeners;
                const listenersCount = listeners.length;

                // TODO: Unroll for large amounts of listeners
                if (listenersCount < 2 || listenersCount >= 950 || EventEmitter.optimize === false || this.deopt === true) return;

                const collectResults = this.results === true;
                const breakOnFalse = this.break === true;

                // if(this.last_compile_count === listenersCount && this.factory) {
                //     this.compiled = this.factory(EventHandler.REMOVE_LISTENER, listeners, this);
                //     return;
                // }

                const parts = [];
                parts.push("(function(RL,listeners,event){var l=listeners;");
                for (let i = 0; i < listenersCount; i++) {
                    const li = listeners[i];
                    if (li === null) continue;
                    parts.push("var f", i, "=l[", i, "].callback;");
                }

                if(this.await === true) {
                    parts.push("l=undefined;return(async function(a,b,c,d,e){var v");
                } else {
                    parts.push("l=undefined;return(function(a,b,c,d,e){var v");
                }

                if (collectResults) parts.push(",r=[]");
                parts.push(";");

                // Main call loop
                for (let i = 0; i < listenersCount; i++) {
                    const li = listeners[i];
                    if (li === null) continue;

                    parts.push("v=");

                    if(this.await === true) {
                        parts.push("await f");
                    } else {
                        parts.push("f");
                    }

                    parts.push(i, "(a,b,c,d,e);");

                    // Optional break behavior
                    if (breakOnFalse) {
                        parts.push("if(v===false)return", collectResults ? " r" : "", ";");
                    }

                    if (li.once) {
                        if (collectResults) {
                            parts.push("if(v!==RL)r.push(v);");
                        }
                        parts.push("event.remove(", i, ");");
                    } else {
                        if (collectResults) {
                            parts.push("if(v===RL){event.remove(", i, ")}else{r.push(v)};");
                        } else {
                            parts.push("if(v===RL){event.remove(", i, ")};");
                        }
                    }
                }

                if (collectResults) parts.push("return r;");
                parts.push("})})");

                const factory = eval(parts.join(""));
                this.compiled = factory(EventEmitter.REMOVE_LISTENER, listeners, this);
            }
        }

        /**
         * @param {object} target Possibly deprecated; Binds the event handler methods to a target object.
         * @param {object} options Event handler options.
         */
        constructor(target, options = undefined) {
            EventEmitter.prepareHandler(this, options);
            if(target){
                target._events = this;

                ["emit", "quickEmit", "on", "once", "off"].forEach(method => {
                    if (!target.hasOwnProperty(method)) target[method] = this[method].bind(this);
                });
            }
        }

        static prepareHandler(target, options = undefined){
            target.events = new Map();
            if(typeof options === "object") target.eventOptions = options;
        }

        /**
         * Prepare or update an event object with given name and options.
         * @param {string|symbol} name Name of the event.
         * @param {object} options Event options.
         * @returns {EventObject} Prepared event object.
         * 
         * @warning If you are going to use the event reference, remember to dispose of it properly to avoid memory leaks.
         */
        prepareEvent(name, options = undefined){
            let event = this.events.get(name);

            if(!event) {
                event = new EventEmitter.EventObject();
                this.events.set(name, event);
            }

            if(options){
                if(options.completed !== undefined) {
                    event.completed = options.completed;
                    if(!event.completed) event.data = null;
                }

                if(options.break !== undefined) event.break = !!options.break;
                if(options.results !== undefined) event.results = !!options.results;
                if(options.async !== undefined) event.async = !!options.async;
                if(options.await !== undefined) {
                    event.await = !!options.await;
                    event.compiled = null; // Need to recompile
                }
                if(options.deopt !== undefined) {
                    event.deopt = !!options.deopt;
                    event.compiled = null; // Remove compiled function
                }

                if(options.data !== undefined) event.data = options.data;
            }

            return event;
        }

        on(name, callback, options){
            const event = name._isEvent? name: (this.events.get(name) || this.prepareEvent(name));
            if(event.completed) {
                if(event.data) Array.isArray(event.data) ? callback.apply(null, event.data) : callback(event.data); else callback();
                if(options && options.once) return;
            }

            options ||= {};
            options.callback = callback;

            const free = event.free;
            if (free.length > 0) {
                event.listeners[free.pop()] = options;
            } else {
                const amount = event.listeners.push(options);
                if(amount > (this.eventOptions?.maxListeners || 1000) && !event.warned) {
                    console.warn(`EventHandler: Possible memory leak detected. ${event.listeners.length} listeners added for event '${name.toString()}'.`);
                    event.warned = true;
                }
            }

            event.compiled = null; // Invalidate compiled function
        }

        off(name, callback){
            const event = (name._isEvent? name: this.events.get(name));
            if(!event) return;

            const listeners = event.listeners;

            for(let i = 0; i < listeners.length; i++){
                const listener = listeners[i];
                if(!listener) continue;

                if(listener.callback === callback){
                    event.remove(i);
                }
            }
        }

        once(name, callback, options){
            options ??= {};
            options.once = true;
            return this.on(name, callback, options);
        }

        /**
         * Emit an event with the given name and data.
         * @param {string|object} name Name of the event to emit or it's reference
         * @param {Array} data Array of values to pass
         * @param {object} event Optional emit options override
         * @returns {null|Array|Promise<null|Array>} Array of results (if options.results is true) or null. If event.await is true, returns a Promise.
         */
        emit(name, data) {
            const event = name._isEvent ? name : this.events?.get(name);
            if (!event || event.listeners.length === 0) return event && event.await ? Promise.resolve(null) : null;

            const listeners = event.listeners;
            const listenerCount = listeners.length;

            const collectResults = event.results === true;

            const isArray = data && Array.isArray(data);
            if(!isArray) data = [data];
            const dataLen = isArray ? data.length : 0;

            let a = undefined, b = undefined, c = undefined, d = undefined, e = undefined;

            if (dataLen > 0) a = data[0];
            if (dataLen > 1) b = data[1];
            if (dataLen > 2) c = data[2];
            if (dataLen > 3) d = data[3];
            if (dataLen > 4) e = data[4];

            // Awaiting path
            if (event.await === true) {
                if(!event.compiled) {
                    event.recompile();
                }

                if(event.compiled) {
                    return event.compiled(a, b, c, d, e);
                }

                const breakOnFalse = event.break === true;
                const returnData = collectResults ? [] : null;

                return (async () => {
                    for (let i = 0; i < listeners.length; i++) {
                        const listener = listeners[i];
                        if (listener === null) continue;

                        let result = (dataLen < 6)? listener.callback(a, b, c, d, e): listener.callback.apply(null, data);
                        if (result && typeof result.then === 'function') {
                            result = await result;
                        }

                        if (collectResults) returnData.push(result);

                        if (listener.once || result === EventEmitter.REMOVE_LISTENER) {
                            event.remove(i);
                        }

                        if (breakOnFalse && result === false) break;
                    }
                    return returnData;
                })();
            }

            if(listenerCount === 1) {
                const listener = listeners[0];
                if (listener === null) return null;

                let result = listener.callback(a, b, c, d, e);

                if (listener.once || result === EventEmitter.REMOVE_LISTENER) {
                    event.remove(0);
                }

                return collectResults? [result]: null;
            }

            if(!event.compiled) {
                event.recompile();
            }

            if(event.compiled) {
                return event.compiled(a, b, c, d, e);
            }

            const breakOnFalse = event.break === true;
            const returnData = collectResults ? [] : null;

            if(dataLen < 6){
                for (let i = 0; i < listeners.length; i++) {
                    const listener = listeners[i];
                    if (listener === null) continue;

                    let result = listener.callback(a, b, c, d, e);
                    if (collectResults) returnData.push(result);

                    if (listener.once || result === EventEmitter.REMOVE_LISTENER) {
                        event.remove(i);
                    }

                    if (breakOnFalse && result === false) break;
                }
            } else {
                for (let i = 0; i < listeners.length; i++) {
                    const listener = listeners[i];
                    if (listener === null) continue;

                    let result = listener.callback.apply(null, data);
                    if (collectResults) returnData.push(result);

                    if (listener.once || result === EventEmitter.REMOVE_LISTENER) {
                        event.remove(i);
                    }

                    if (breakOnFalse && result === false) break;
                }
            }

            return returnData;
        }

        /**
         * Faster emit, without checking or collecting return values. Limited to 5 arguments.
         * @warning This does not guarantee EventHandler.REMOVE_LISTENER or any other return value functionality. Async events are not supported with quickEmit.
         * @param {string|object} event Event name or reference.
         * @param {*} a First argument.
         * @param {*} b Second argument.
         * @param {*} c Third argument.
         * @param {*} d Fourth argument.
         * @param {*} e Fifth argument.
         */
        quickEmit(name, a, b, c, d, e){
            const event = name._isEvent ? name : this.events.get(name);
            if (!event || event.listeners.length === 0) return false;

            if(event.await === true) {
                throw new Error("quickEmit cannot be used with async/await events.");
            }

            if(event.listeners.length === 1) {
                const listener = event.listeners[0];
                listener.callback(a, b, c, d, e);
                if (listener.once) {
                    event.remove(0);
                }
                return;
            }

            if(!event.compiled) {
                event.recompile();
            }

            if(event.compiled) {
                event.compiled(a, b, c, d, e);
                return;
            }

            const listeners = event.listeners;
            for(let i = 0, len = listeners.length; i < len; i++){
                const listener = listeners[i];
                if(listener === null) continue;

                if(listener.once) {
                    event.remove(i);
                }

                listener.callback(a, b, c, d, e);
            }
        }

        flush(){
            this.events.clear();
        }

        destroy(){
            this.events.clear();
            this.eventOptions = null;
            this.events = null;
        }

        /**
         * Create an alias for an existing event.
         * They will become identical and share listeners.
         * @param {*} name Original event name.
         * @param {*} alias Alias name.
         */
        alias(name, alias){
            const event = (name._isEvent? name: this.events.get(name)) || this.prepareEvent(name);
            event.aliases ??= [];

            if(!event.aliases.includes(alias)) event.aliases.push(alias);
            this.events.set(alias, event);
        }

        completed(name, data = undefined, options = null){
            this.emit(name, data);

            options ??= {};
            options.completed = true;
            options.data = data;

            this.prepareEvent(name, options);
        }
    }

    /**
     * @concept
     * @experimental Direction undecided, so far an abstract concept - don't use in production code.
     * 
     * "Best-effort" based destroy container.
     * It destroys explicitly added destroyables and tries to recursively destroy itself.
     * Supports various destroyable types, timers, and external events.
     */
    class Context extends EventEmitter {
        #destroyables = new Set();
        #timers = new Set();
        #rAF = [];
        #externalEvents = [];

        constructor() {
            super();
            this.destroyed = false;

            // Prepare destroy event.
            this.prepareEvent("destroy", { deopt: true });
            this.alias("destroy", "destroyed");
        }

        createElement(tagName, content) {
            return this.addDestroyable(LS.Create(tagName, content));
        }

        /**
         * Element selector that searches within own container.
         */
        selectElement(selector, one = false) {
            if(!this.container) return null;
            return LS.Tiny.Q(this.container, selector, one);
        }

        addDestroyable(...destroyables) {
            for(const item of destroyables) {
                if (!item || this.destroyed) continue;
                if(item instanceof LS.Component) {
                    Context.bind(item, this);
                }

                this.#destroyables.add(item);
                if(destroyables.length === 1) return item;
            }
        }

        removeDestroyable(destroyable, destroy = false) {
            this.#destroyables.delete(destroyable);
            if (destroy) this.destroyOne(destroyable, false);
        }

        setTimeout(callback, delay, ...args) {
            const timer = Context.setTimeout(() => {
                this.#timers.delete(ref);
                callback(...args);
            }, delay);
            const ref = [timer, 0];
            this.#timers.add(ref);
            return timer;
        }

        setInterval(callback, interval, ...args) {
            const timer = Context.setInterval(() => {
                callback(...args);
            }, interval);
            this.#timers.add([timer, 1]);
            return timer;
        }

        clearTimeout(timeout) {
            for(const timer of this.#timers) {
                const [id, type] = timer;
                if(type === 0 && id === timeout) {
                    Context.clearTimeout(id);
                    this.#timers.delete(timer);
                    return;
                }
            }
        }

        clearInterval(interval) {
            for(const timer of this.#timers) {
                const [id, type] = timer;
                if(type === 1 && id === interval) {
                    Context.clearInterval(id);
                    this.#timers.delete(timer);
                    return;
                }
            }
        }

        clearIntervals() {
            for(const timer of this.#timers) {
                const [id, type] = timer;
                if(type === 1) {
                    Context.clearInterval(id);
                    this.#timers.delete(timer);
                }
            }
        }

        clearTimeouts() {
            for(const timer of this.#timers) {
                const [id, type] = timer;
                if(type === 0) {
                    Context.clearTimeout(id);
                    this.#timers.delete(timer);
                }
            }
        }

        clearRAF() {
            for(const id of this.#rAF) {
                cancelAnimationFrame(id);
            }
            this.#rAF.length = 0;
        }

        createComponent(component, ...options) {
            if (this.destroyed) return null;
            const instance = new component(...options);
            this.addDestroyable(instance);
            LS.Context.bind(instance, this);
            return instance;
        }

        requestAnimationFrame(callback) {
            if (this.destroyed) return null;
            const id = LS.Context.requestAnimationFrame(callback);
            this.#rAF.push(id);
            return id;
        }

        destroyOne(destroyable, _remove = true, _explicit = true) {
            try {
                if (_remove) this.#destroyables.delete(destroyable);

                if(typeof destroyable === "function") {
                    if(!_explicit) return;

                    const isClass = LS.Util.isClass(destroyable);
                    if(!isClass) {
                        destroyable();
                    }
                    return;
                }

                if(destroyable === null || destroyable === undefined || (typeof destroyable !== "object" && typeof destroyable !== "function")) return;

                if(typeof Element !== "undefined" && destroyable instanceof Element) {
                    destroyable.remove();
                    return;
                }

                if(typeof NodeList !== "undefined" && (destroyable instanceof NodeList || Array.isArray(destroyable))) {
                    destroyable.forEach(item => this.destroyOne(item, false, _explicit));
                    destroyable.length = 0;
                    return;
                }

                if(typeof AbortController !== "undefined" && destroyable instanceof AbortController) {
                    destroyable.abort();
                    return;
                }

                if(LS.isWeb) {
                    if(destroyable instanceof ResizeObserver || destroyable instanceof MutationObserver || destroyable instanceof IntersectionObserver || destroyable instanceof AudioContext) {
                        destroyable.disconnect();
                        return;
                    }
                }

                if(destroyable instanceof EventEmitter) {
                    destroyable.events?.clear?.();
                }

                if (typeof destroyable.destroy === "function") destroyable.destroy();
            } catch (error) {
                console.error("Error destroying:", error);
            }
        }

        addExternalEventListener(target, event, callback, options) {
            const cap = typeof options === "boolean" ? options : !!options?.capture;
            const addListener = (target.addEventListener || target.on);
            if (typeof addListener === "function") addListener.call(target, event, callback, cap);
            this.#externalEvents.push([target, event, callback, cap]);
        }

        removeExternalEventListener(target, event, callback, options) {
            const cap = typeof options === "boolean" ? options : !!options?.capture;
            const index = this.#externalEvents.findIndex(([t, e, c, o]) => t === target && e === event && c === callback && o === cap);
            if (index !== -1) {
                const removeListener = (target.removeEventListener || target.off);
                if (typeof removeListener === "function") removeListener.call(target, event, callback, cap);
                this.#externalEvents.splice(index, 1);
            }
        }

        destroy() {
            if (this.destroyed) return;
            this.destroyed = true;

            this.quickEmit("destroy");
            if (this.events) this.events.clear(); // It should never happen that this.events is null, yet it somehow did

            for(const timer of this.#timers) {
                const [id, type] = timer;
                if(type === 0) Context.clearTimeout(id); else Context.clearInterval(id);
            }

            this.#timers.clear();
            this.#timers = null;

            this.clearRAF();
            this.#rAF = null;

            for(const [target, event, callback, options] of this.#externalEvents) {
                const removeListener = (target.removeEventListener || target.off);
                if (typeof removeListener === "function") removeListener.call(target, event, callback, options);
            }

            this.#externalEvents = null;
            super.destroy(); // Clear events

            if(this.ctx && this.hasOwnProperty("ctx")) {
                try { this.ctx = null; } catch {}
            }

            /**
             * Clears up everything from the object, detaches any set elements etc.
             * Warning: Do not rely on this. It is only to provide a best-effort cleanup, but you should still set destroyables explicitly.
            */
            for(const key of Object.keys(this)) {
                if(key === "destroyed") continue;

                const value = this[key];
                if(this.#destroyables.has(value)) {
                    this.destroyOne(value, true);
                } else {
                    this.destroyOne(value, false, false);
                }
                delete this[key];
            }

            for(const destroyable of this.#destroyables) {
                this.destroyOne(destroyable, false);
            }

            this.#destroyables.clear();
            this.#destroyables = null;

            if(this.container && this.container instanceof Element) {
                this.container.remove();
                this.container = null;
            }
        }

        static #ctxBinds = new WeakMap();
        static get(item) {
            return this.#ctxBinds.get(item) || null;
        }

        static bind(item, context) {
            this.#ctxBinds.set(item, context);
        }
    }

    let initialized = false;
    const LS = {
        isWeb: typeof window !== 'undefined',
        version: "5.2.9-beta",
        v: 5,

        REMOVE_LISTENER: EventEmitter.REMOVE_LISTENER,

        init(options) {
            if(!this.isWeb) return;
            if(initialized) {
                console.warn("LS has already been initialized, attempt has been ignored.");
                return;
            }

            initialized = true;

            options = LS.Util.defaults({
                globalPrototype: true,
                theme: null,
                accent: null,
                autoScheme: true,
                adaptiveTheme: false,
                globalizeTiny: false
            }, options);

            if(options.globalPrototype) LS.prototypeTiny();

            if(options.theme || options.accent || options.autoScheme || options.autoAccent) {
                LS.__colorInitOptions = {
                    theme: options.theme,
                    accent: options.accent,
                    autoAccent: options.autoAccent,
                    autoScheme: options.autoScheme,
                    adaptiveTheme: options.adaptiveTheme
                };
            }

            // Enable or disable event optimization (compiles events to a function to avoid loops)
            if(options.optimizeEvents !== undefined) this.EventEmitter.optimize = !!options.optimizeEvents;

            if(options.globalizeTiny) {
                /**
                 * @deprecated
                 */
                for (let key in this.Tiny){
                    window[key] = this.Tiny[key];
                }
            }

            /**
             * Advanced option to help memory safety by disabling access to certain global functions/constructors that could cause issues.
             * It helps enforce that all such calls are made through a scoped context that is able to .destroy() them.
             * This is useful to prevent accidental memory leaks, but you should not use it or rely on it if you don't fully understand it's implications.
             */
            if(options.enforceContextSafety === true) {
                const er = (field) => `[Memory Safety Violation] Global access to ${field} is disabled by the site settings. Remember to only use scoped context.${field} in contexts (or LS.Context.global for global access)!`;

                const deny = (field) => ({
                    get() { throw new Error(er(field)); },
                    set() { throw new Error(er(field)); }
                });

                for(const field of options.contextSafetyFields || CONTEXT_FIELDS) {
                    if(window[field]) {
                        try { Object.defineProperty(window, field, deny(field)); } catch(e) { console.warn(`LS.init: Could not enforce memory safety for ${field}:`, e); }
                    }
                }
            }

            this._topLayer = this.Create({ id: "ls-top-layer", style: "position: fixed" });

            LS.once("ready", () => {
                document.body.append(this._topLayer);
            });

            LS._events.quickEmit("init");
        },

        EventEmitter,
        EventHandler: EventEmitter, // Backward compatibility

        Create(tagName = "div", content){
            if(typeof tagName !== "string"){
                content = tagName;
                if(content) {
                    tagName = content.tag || content.tagName || "div";
                    delete content.tag;
                    delete content.tagName;
                } else if(content === null) return null;
            }

            if(!content) return document.createElement(tagName);

            content =
                typeof content === "string"
                    ? { html: content }
                    : Array.isArray(content)
                        ? { inner: content }
                        : content || {};

            if(tagName === "svg" && !content.hasOwnProperty("ns")) {
                content.ns = "http://www.w3.org/2000/svg";
            }

            const { class: className, tooltip, ns, inner, content: innerContent, html, text, accent, style, reactive, attr, options, attributes, ...rest } = content;

            const element = Object.assign(
                ns ? document.createElementNS(ns, tagName) : document.createElement(tagName),
                rest
            );

            // Special case for ls-select
            if(tagName.toLowerCase() === "ls-select" && options){
                element._lsSelectOptions = options;
            }

            // Handle attributes
            if (accent) element.setAttribute("ls-accent", accent);
            if (attr || attributes) LS.TinyFactory.attrAssign.call(element, attr || attributes);

            // Handle tooltips
            if (tooltip) {
                if (!LS.Tooltips) {
                    element.setAttribute("title", tooltip);
                } else {
                    element.setAttribute("ls-tooltip", tooltip);
                    LS.Tooltips.updateElement(element);
                }
            }

            // Handle reactive bindings
            if (reactive) {
                if (!LS.Reactive) {
                    console.warn("Reactive bindings are not available, please include the Reactive module to use this feature.");
                    LS.on("component-loaded", (component) => {
                        if (component.name.toLowerCase() === "reactive") {
                            LS.Reactive.bindElement(element, reactive);
                            return LS.EventEmitter.REMOVE_LISTENER;
                        }
                    });
                } else {
                    LS.Reactive.bindElement(element, reactive);
                }
            }

            if (className) {
                element.className = Array.isArray(className)? className.filter(Boolean).join(" ") : className;
            }

            if (typeof style === "object") LS.TinyFactory.applyStyle.call(element, style); else if (typeof style === "string") element.style.cssText = style;

            // Append children or content
            const contentToAdd = inner || innerContent;
            if (contentToAdd) {
                element.append(...LS.Util.resolveElements(contentToAdd));
            }

            if (html) {
                if(contentToAdd) {
                    console.warn("LS.Create: 'html' is being overriden by inner content. Only use one of: inner, html, or text.");
                } else {
                    element.innerHTML = html;
                }
            }

            if (text) {
                if(contentToAdd || html) {
                    console.warn("LS.Create: 'text' is being overriden by inner content or html. Only use one of: inner, html, or text.");
                } else {
                    element.textContent = text;
                }
            }

            return element;
        },

        Util: {
            /**
             * https://stackoverflow.com/a/66120819/14541617
             */
            isClass(func) {
                // Class constructor is also a function
                if (!(func && func.constructor === Function) || func.prototype === undefined)
                    return false;

                // This is a class that extends other class
                if (Function.prototype !== Object.getPrototypeOf(func))
                    return true;

                // Usually a function will only have 'constructor' in the prototype
                return Object.getOwnPropertyNames(func.prototype).length > 1;
            },

            /**
             * Gets URL parameters as an object or a specific parameter by name.
             * From my testing, this is 8x faster than URLSearchParams for all parameters and 11x faster to get a single parameter.
             * Meaning that for 99% of use cases where duplicate keys are not a concern, this is almost always faster (and imho cleaner).
             * https://jsbm.dev/XMZyoeowQqoPm
             * 
             * @param {string|null} getOne Name of the parameter to get, or null to get all parameters as an object.
             * @param {string} baseUrl URL or search string to parse, defaults to current location's search string.
             * @returns {object|string|null} Object with all parameters, specific parameter value, or null if not found.
             */
            parseURLParams(baseUrl = typeof location !== "undefined" ? location.search : "", getOne = null){
                const index = baseUrl.indexOf('?');
                const url = baseUrl.slice(index + 1);
                if(!url.length){
                    return getOne? null : {};
                }

                let i = 0, vi = 0, cparam = null, result = getOne ? null : {};
                for(; i < url.length; i++){
                    const char = url.charCodeAt(i);
                    const atEnd = i === url.length - 1;
                    const isDelimiter = char === 61 || char === 38 || char === 35; // =, &, #

                    if(isDelimiter || atEnd){
                        const sliceEnd = (atEnd && !isDelimiter) ? i + 1 : i;
                        const param = url.slice(vi, sliceEnd);

                        if((char === 38 || (atEnd && !isDelimiter) || char === 35) && cparam !== null){ // &, end, #
                            const value = decodeURIComponent(param);
                            if(getOne && cparam === getOne) return value;
                            if(!getOne) result[cparam] = value;
                            cparam = null;
                            vi = i + 1;
                            if(char === 35) break;
                            continue;
                        }

                        if(param.length !== 0) {
                            if(!getOne) result[param] = "";
                            cparam = param;
                            vi = i + 1;
                        }

                        if(char === 35){ // #
                            break;
                        }
                    }
                }

                return getOne? null : result;
            },

            /**
             * The same as LS.Util.parseURLParams but with parameters reversed for backward compatibility.
             * @deprecated
             */
            params(get = null, baseUrl = typeof location !== "undefined" ? location.search : ""){
                return LS.Util.parseURLParams(baseUrl, get);
            },

            /**
             * Iterates over an iterable object and builds an array with the results of the provided function.
             * Equivalent to Array.prototype.map but works on anything that is iterable.
             * @deprecated
             */
            map(it, fn){
                const r = [];
                for(let i = 0; i < it.length; i++) {
                    r.push(fn(it[i], i));
                }
                return r;
            },

            resolveElements(...array){
                return array.flat().filter(Boolean).map(element => {
                    return typeof element === "string" ? document.createTextNode(element) : typeof element === "object" && !(element instanceof Node) ? LS.Create(element) : element;
                });
            },

            /**
             * Simply deep-clones an Object/Set/Map/Array with filtering support, faster than structuredClone and apparently even klona.
             * Very experimental - may not always be reliable for complex objects and as of now ignores functions and prototypes (maybe I'll expand it later).
             * Use only on relatively simple/predictable objects.
             * https://jsbm.dev/wFkz6UCGJevxw
             * @param {*} obj Object to clone
             * @returns Cloned object
             * @experimental
             */
            clone(obj, filter) {
                // If item is a primitive, we don't need to clone
                // TODO: Handle typeof function
                if (typeof obj !== "object") return obj;

                if (obj === null) return null;
                if (obj === undefined) return undefined;

                if (Array.isArray(obj)) {
                    if (obj.length === 0) return [];
                    if (obj.length === 1) return [LS.Util.clone(obj[0], filter)];
                    const a = [];
                    for (let i = 0; i < obj.length; i++) {
                        a.push(LS.Util.clone(obj[i], filter));
                    }
                    return a;
                }

                if(obj.constructor === Map) {
                    const m = new Map();
                    for(const [key, value] of obj) {
                        m.set(key, LS.Util.clone(value, filter));
                    }
                    return m;
                }

                if(obj.constructor === Set) {
                    const s = new Set();
                    for(const value of obj) {
                        s.add(LS.Util.clone(value, filter));
                    }
                    return s;
                }

                if (obj.constructor === DataView) return new obj.constructor(LS.Util.clone(obj.buffer, filter), obj.byteOffset, obj.byteLength);
                if (obj.constructor === ArrayBuffer) return obj.slice(0);
                if (obj.constructor === Date) return new Date(obj);
                if (obj.constructor === RegExp) return new RegExp(obj);

                const c = {};
                const keys = Object.getOwnPropertyNames(obj);
                if(keys.length === 0) return c;
 
                // Note: Filter is branched this way for performance reasons
                if(typeof filter === "function") {
                    for (const k of keys) {
                        if(filter(k, obj[k]) === undefined) continue;
                        c[k] = LS.Util.clone(obj[k], filter);
                    }
                } else {
                    for (const k of keys) {
                        c[k] = LS.Util.clone(obj[k], filter);
                    }
                }
                return c;
            },

            TouchHandle: class TouchHandle extends EventEmitter {
                constructor(element, options = {}) {
                    super();

                    this.options = {
                        buttons: [0, 1, 2],
                        disablePointerEvents: true,
                        frameTimed: false,
                        legacyEvents: false,
                        ...options
                    };

                    this.targets = new Set();
                    this.activeTarget = null;

                    if(element) this.addTarget(element && LS.Tiny.O(element));
                    if (Array.isArray(this.options.targets)) {
                        for (const t of this.options.targets) this.addTarget(t);
                    }

                    this._cursor = this.options.cursor || null;
                    this.seeking = false;
                    this.attached = false;
                    this.pointerLockSet = false;
                    this.pointerLockActive = false;
                    this.pointerLockPreviousX = 0;
                    this.pointerLockPreviousY = 0;
                    this.dragTarget = null;
                    this.frameQueued = false;
                    this.latestMoveEvent = null;
                    this.activePointerId = null;

                    this._moveEventRef = this.prepareEvent("move");
                    this.prepareEvent("start", { deopt: true });
                    this.prepareEvent("end", { deopt: true });

                    this.onStart = this.onStart.bind(this);
                    this.onMove = this.onMove.bind(this);
                    this.onRelease = this.onRelease.bind(this);
                    this.cancel = this.cancel.bind(this);
                    this.onPointerLockChange = this.onPointerLockChange.bind(this);
                    this.frameHandler = this.frameHandler.bind(this);

                    this._eventData = {
                        x: 0,
                        y: 0,
                        dx: 0,
                        dy: 0,
                        offsetX: 0,
                        offsetY: 0,
                        startX: 0,
                        startY: 0,
                        cancel: this.cancel,
                        isTouch: false,
                        cancelled: false,
                        domEvent: null
                    };

                    this.attach();
                }

                addTarget(target) {
                    if (!target || this.targets.has(target)) return;
                    this.targets.add(target);
                    if (this.attached) this.#attachTargetListeners(target);
                }

                removeTarget(target) {
                    if (!target || !this.targets.has(target)) return;
                    this.targets.delete(target);
                    this.#detachTargetListeners(target);
                    if (this.activeTarget === target) this.activeTarget = null;
                }

                clearTargets() {
                    for (const el of this.targets) this.#detachTargetListeners(el);
                    this.targets.clear();
                    this.activeTarget = null;
                }

                #attachTargetListeners(target) {
                    target.addEventListener("pointerdown", this.onStart, { passive: false });
                    target.style.touchAction = "none";
                    target.style.userSelect = "none";
                    target.classList.add("ls-draggable");

                    if (this.options.startEvents) {
                        for (const evt of this.options.startEvents) {
                            target.addEventListener(evt, this.onStart);
                        }
                    }
                }

                #detachTargetListeners(target) {
                    target.removeEventListener("pointerdown", this.onStart);
                    target.style.touchAction = "";
                    target.style.userSelect = "";
                    target.classList.remove("ls-draggable");

                    if (this.options.startEvents) {
                        for (const evt of this.options.startEvents) {
                            target.removeEventListener(evt, this.onStart);
                        }
                    }
                }

                attach() {
                    if(this.attached) return;

                    // Attach initial listeners
                    for (const target of this.targets) this.#attachTargetListeners(target);
                    document.addEventListener("pointercancel", this.onRelease);

                    if (this.options.pointerLock) {
                        document.addEventListener('pointerlockchange', this.onPointerLockChange);
                        this.pointerLockSet = true;
                    }

                    this.attached = true;
                }

                detach(destroying = false) {
                    if (this.attached) {
                        this.onRelease(destroying? { type: "destroy" } : {});
                        document.removeEventListener("pointercancel", this.onRelease);

                        for (const target of this.targets) {
                            this.#detachTargetListeners(target);
                        }

                        if (this.options.pointerLock) {
                            document.removeEventListener('pointerlockchange', this.onPointerLockChange);
                        }

                        this.attached = false;
                    }
                }

                get cursor() {
                    return this._cursor;
                }

                set cursor(value) {
                    this._cursor = value;
                    if (this.seeking) {
                        document.documentElement.style.cursor = value || "";
                    }
                }

                onStart(event) {
                    if (this.options.exclude) {
                        if (typeof this.options.exclude === "string") {
                            if (event.target.matches(this.options.exclude)) return;
                        } else if (event.target !== event.currentTarget) {
                            return;
                        }
                    }

                    if (event.pointerType === 'mouse' && !this.options.buttons.includes(event.button)) return;

                    const target = event.currentTarget;
                    this.activeTarget = target;

                    this.seeking = true;
                    this._eventData.cancelled = false;

                    const isTouch = event.pointerType === "touch";
                    const x = event.clientX;
                    const y = event.clientY;

                    this.activePointerId = event.pointerId;

                    if (this.options.legacyEvents) {
                        this.emit("start", [event, this.cancel, x, y]);
                        if (this.options.onStart) this.options.onStart(event, this.cancel, x, y);
                    } else {
                        this._eventData.x = x;
                        this._eventData.y = y;
                        this._eventData.dx = 0;
                        this._eventData.dy = 0;
                        this._eventData.offsetX = 0;
                        this._eventData.offsetY = 0;
                        this._eventData.startX = x;
                        this._eventData.startY = y;
                        this._eventData.domEvent = event;
                        this._eventData.isTouch = isTouch;
                        this.emit("start", [this._eventData]);
                        if (this.options.onStart) this.options.onStart(this._eventData);
                    }

                    if (this._eventData.cancelled) {
                        this.seeking = false;
                        return;
                    }

                    // Prevent default to stop text selection, etc.
                    if (event.cancelable) event.preventDefault();

                    target.classList.add("is-dragging");
                    target.setPointerCapture(event.pointerId);

                    if (this.options.pointerLock) {
                        if(!this.pointerLockSet) {
                            document.addEventListener('pointerlockchange', this.onPointerLockChange);
                            this.pointerLockSet = true;
                        }

                        if(!isTouch) {
                            this.pointerLockPreviousX = event.clientX;
                            this.pointerLockPreviousY = event.clientY;
                            target.requestPointerLock();
                        }
                    } else if (this.pointerLockSet) {
                        document.removeEventListener('pointerlockchange', this.onPointerLockChange);
                        this.pointerLockSet = false;
                    }

                    this.dragTarget = event.target;
                    this.dragTarget.classList.add("ls-drag-target");

                    const docEl = document.documentElement;
                    docEl.classList.add("ls-dragging");
                    if (this.options.disablePointerEvents) docEl.style.pointerEvents = "none";

                    if (!docEl.style.cursor) docEl.style.cursor = this._cursor || "grab";

                    // Attach move/up listeners to document
                    document.addEventListener("pointermove", this.onMove);
                    document.addEventListener("pointerup", this.onRelease);
                }

                onMove(event) {
                    if (this._eventData.cancelled || event.pointerId !== this.activePointerId) return;

                    if (this.options.frameTimed) {
                        this.latestMoveEvent = event;
                        if (!this.frameQueued) {
                            this.frameQueued = true;
                            LS.Context.requestAnimationFrame(this.frameHandler);
                        }
                        return;
                    }

                    this.processMove(event);
                }

                frameHandler() {
                    this.frameQueued = false;
                    if (this.latestMoveEvent) {
                        this.processMove(this.latestMoveEvent);
                        this.latestMoveEvent = null;
                    }
                }

                processMove(event) {
                    const isTouch = event.pointerType === "touch";
                    if (!isTouch && event.cancelable) event.preventDefault();

                    let x, y;
                    const prevX = this._eventData.x;
                    const prevY = this._eventData.y;

                    if (!this.pointerLockActive) {
                        x = event.clientX;
                        y = event.clientY;
                    }

                    if (this.options.pointerLock) {
                        if (this.pointerLockActive) {
                            x = this.pointerLockPreviousX += !isNaN(event.movementX) ? event.movementX : 0;
                            y = this.pointerLockPreviousY += !isNaN(event.movementY) ? event.movementY : 0;
                        } else if (isTouch) {
                            // Emulate movementX/Y for touch
                            event.movementX = Math.round(x - this.pointerLockPreviousX);
                            event.movementY = Math.round(y - this.pointerLockPreviousY);
                            this.pointerLockPreviousX = x;
                            this.pointerLockPreviousY = y;
                        }
                    }

                    if (this.options.legacyEvents) {
                        if (this.options.onMove) this.options.onMove(x, y, event, this.cancel);
                        this.quickEmit(this._moveEventRef, x, y, event, this.cancel);
                    } else {
                        this._eventData.dx = x - prevX;
                        this._eventData.dy = y - prevY;
                        this._eventData.offsetX = x - this._eventData.startX;
                        this._eventData.offsetY = y - this._eventData.startY;
                        this._eventData.x = x;
                        this._eventData.y = y;
                        this._eventData.domEvent = event;
                        this._eventData.isTouch = isTouch;
                        if (this.options.onMove) this.options.onMove(this._eventData);
                        this.quickEmit(this._moveEventRef, this._eventData);
                    }
                }

                onRelease(event) {
                    this.cleanupDragState();

                    const isDestroy = event.type === "destroy";

                    if (this.options.legacyEvents) {
                        this.emit(isDestroy ? "destroy" : "end", [event]);
                    } else {
                        this._eventData.domEvent = event;
                        this.emit(isDestroy ? "destroy" : "end", [this._eventData]);
                    }

                    if (this.pointerLockActive) {
                        document.exitPointerLock();
                    }

                    if (isDestroy) {
                        if (this.options.onDestroy) {
                            if (this.options.legacyEvents) {
                                this.options.onDestroy(event);
                            } else {
                                this.options.onDestroy(this._eventData);
                            }
                        }
                    } else if (this.options.onEnd) {
                        if (this.options.legacyEvents) {
                            this.options.onEnd(event);
                        } else {
                            this.options.onEnd(this._eventData);
                        }
                    }

                    const captureTarget = this.activeTarget;
                    if (captureTarget && typeof event.pointerId === "number" && captureTarget.hasPointerCapture(event.pointerId)) {
                        captureTarget.releasePointerCapture(event.pointerId);
                    }
                    this._eventData.domEvent = null;
                }

                onPointerLockChange() {
                    const lockEl = document.pointerLockElement;
                    this.pointerLockActive = !!lockEl && lockEl === this.activeTarget;
                }

                cancel() {
                    this._eventData.cancelled = true;
                }

                cleanupDragState() {
                    this.seeking = false;
                    this._eventData.cancelled = false;
                    this.frameQueued = false;
                    this.latestMoveEvent = null;

                    if (this.activeTarget) {
                        this.activeTarget.classList.remove("is-dragging");
                    }

                    if (this.dragTarget) {
                        this.dragTarget.classList.remove("ls-drag-target");
                        this.dragTarget = null;
                    }

                    const docEl = document.documentElement;
                    docEl.classList.remove("ls-dragging");
                    docEl.style.pointerEvents = "";
                    docEl.style.cursor = "";
                    this.activeTarget = null;

                    document.removeEventListener("pointermove", this.onMove);
                    document.removeEventListener("pointerup", this.onRelease);
                }

                destroy() {
                    if (this.destroyed) return false;

                    this.detach(true);
                    this.clearTargets();
                    this._moveEventRef = null;
                    super.destroy();
                    this.options = null;
                    this._eventData = null;
                    this.destroyed = true;
                    return true;
                }
            },

            touchHandle(element, options) {
                if(options.legacyEvents === undefined) {
                    console.warn("Use of deprecated LS.Util.touchHandle() with legacy events enabled. Please consider migrating to the LS.Util.TouchHandle class with an upgraded event object.");
                    options.legacyEvents = true;
                }

                return new LS.Util.TouchHandle(element, options);
            },

            defaults(defaults, target = {}) {
                if(typeof target !== "object") throw "The target must be an object";

                for (const [key, value] of Object.entries(defaults)) {
                    if (!(key in target)) {
                        Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(defaults, key));
                    }
                }
                return target
            },

            copy(text) {
                return new Promise(resolve => {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(text)
                            .then(() => {
                                resolve()
                            })
                            .catch(error => {
                                resolve(error)
                            })
                    } else {
                        let temp = LS.Tiny.N('textarea', {value: text})

                        document.body.appendChild(temp)
                        temp.select()
                        document.execCommand('copy')
                        
                        document.body.removeChild(temp)
                        resolve()
                    }
                })
            },

            // Allow only harmless tags: i, b, strong, kbd, code, pre, em, u, s, mark, small, sub, sup, br, span (with no attributes)
            allowedTags: ['I', 'B', 'STRONG', 'KBD', 'CODE', 'PRE', 'EM', 'U', 'S', 'MARK', 'SMALL', 'SUB', 'SUP', 'BR', 'SPAN'],

            sanitize(node) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (!LS.Util.allowedTags.includes(node.tagName)) {
                        // Replace the node with its children, if parent exists
                        const fragment = document.createDocumentFragment();
                        while (node.firstChild) {
                            fragment.appendChild(node.firstChild);
                        }

                        if (node.parentNode) {
                            node.parentNode.replaceChild(fragment, node);
                        }
                        return;
                    }
                }

                // Remove all attributes
                while (node.attributes && node.attributes.length > 0) {
                    node.removeAttribute(node.attributes[0].name);
                }

                // Recursively sanitize child nodes
                let child = node.firstChild;
                while (child) {
                    const next = child.nextSibling;
                    this.sanitize(child);
                    child = next;
                }
            },

            normalize(string) {
                return string.toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^a-z0-9\s]/g, "")
                    .replace(/\s+/g, " ")
                    .trim();
            },

            /**
             * A simple switch that triggers a callback when its value changes, but does nothing if it doesn't.
             */
            Switch: class Switch {
                constructor(onSet) {
                    this.value = false;
                    this.onSet = onSet;
                }

                set(value) {
                    if(this.value === value) return;
                    this.value = value;
                    this.onSet(this.value);
                }

                on() {
                    this.set(true);
                }

                off() {
                    this.set(false);
                }

                toggle() {
                    this.set(!this.value);
                }

                destroy() {
                    this.onSet = null;
                    this.value = null;
                }
            },

            /**
             * A switch between two elements, showing one and hiding the other.
             * Useful for loading indicators for example
             */
            ElementSwitch: class ElementSwitch {
                constructor(element1 = null, element2 = null, options = null) {
                    this.elements = Array.isArray(element1)? element1: (element1 instanceof NodeList) ? Array.from(element1) : [element1, element2];

                    this.options = LS.Util.defaults({
                        initial: 0,
                        mode: "display",
                        parent: null,
                        onSet: null
                    }, options || {});

                    if(this.options.mode === "dom" && !this.options.parent) {
                        throw new Error("ElementSwitch in 'dom' mode requires a parent element in options.parent");
                    }

                    this.value = -1;
                    if(this.options.initial > -1) this.set(this.options.initial);
                }

                front() {
                    this.set(this.elements.length - 1);
                }

                back() {
                    this.set(0);
                }

                get frontElement() {
                    return this.elements[this.elements.length - 1];
                }

                get backElement() {
                    return this.elements[0];
                }

                toggle() {
                    this.set(this.value === 0 ? 1 : 0);
                }

                set(index) {
                    if(this.value === index) return;
                    this.value = index;

                    if(this.options.mode === "dom" && this.options.parent) {
                        for(let i = 0; i < this.elements.length; i++) {
                            if(!this.elements[i]) continue;

                            if(i === index) {
                                this.options.parent.appendChild(this.elements[i]);
                            } else {
                                this.elements[i].remove();
                            }
                        }
                    } else {
                        for(let i = 0; i < this.elements.length; i++) {
                            if(this.elements[i]) this.elements[i].style[this.options.mode === "display"? "display" : "visibility"] = i === index ? "" : (this.options.mode === "display"? "none" : "hidden");
                        }
                    }

                    if(this.options.onSet) this.options.onSet(this.value);
                }

                destroy() {
                    for(let i = 0; i < this.elements.length; i++) {
                        this.elements[i]?.remove();
                        this.elements[i] = null;
                    }
                    this.elements = null;
                    this.value = null;
                    this.options = null;
                }
            },

            /**
             * Schedules a callback to run on the next animation frame, avoiding multiple calls within the same frame.
             * Also has an "active" mode and FPS limit and time sync options.
             * 
             * In passive mode (default), you call schedule() whenever.
             * In active mode (start/stop methods), it works like a ticker.
             */
            FrameScheduler: class FrameScheduler {
                /**
                 * @param {Function} callback - The function to call on each frame.
                 * @param {Object} [options] - Optional settings.
                 * @param {number} [options.limiter] - Minimum ms between frames (rate limit).
                 * @param {boolean} [options.deltaTime] - If true, pass delta time to callback.
                 * @param {number} [options.speed] - Playback speed multiplier (default: 1).
                 */
                constructor(callback, options = {}) {
                    this.callback = callback;
                    this.queued = false;
                    this.running = false;
                    this.limiter = options.limiter || null;
                    this.deltaTime = options.deltaTime || false;
                    this.speed = options.speed ?? 1;
                    this._lastFrame = 0;
                    this._rafId = null;
                    if (this.deltaTime) this._prevTimestamp = null;
                }

                #frame = (timestamp) => {
                    if (this.limiter) {
                        if (timestamp - this._lastFrame < this.limiter) {
                            // Not enough time passed, reschedule
                            this._rafId = LS.Context.requestAnimationFrame(this.#frame);
                            return;
                        }
                        this._lastFrame = timestamp;
                    }

                    this.queued = false;

                    if (this.callback) {
                        if (this.running && this.deltaTime) {
                            const delta = this._prevTimestamp !== null ? (timestamp - this._prevTimestamp) * this.speed : 0;
                            this._prevTimestamp = timestamp;
                            this.callback(delta, timestamp);
                        } else if(this.deltaTime) {
                            this.callback(0, timestamp);
                        } else {
                            this.callback(timestamp);
                        }
                    }

                    if (this.running) this.schedule();
                }

                limitFPS(fps) {
                    this.limiter = fps > 0 ? 1000 / fps : null;
                }

                removeLimiter() {
                    this.limiter = null;
                }

                setSpeed(multiplier) {
                    this.speed = multiplier;
                }

                start() {
                    if (this.running) return;
                    this.running = true;
                    if (this.deltaTime) this._prevTimestamp = null;
                    this.schedule();
                }

                stop() {
                    this.running = false;
                    this.cancel();
                }

                schedule() {
                    if (this.queued) return;
                    this.queued = true;

                    this._rafId = LS.Context.requestAnimationFrame(this.#frame);
                }

                cancel() {
                    this.queued = false;
                    if (this._rafId) {
                        cancelAnimationFrame(this._rafId);
                        this._rafId = null;
                    }
                }

                destroy() {
                    this.cancel();
                    this.callback = null;
                    if (this.deltaTime) this._prevTimestamp = null;
                }
            },

            /**
             * Ensures a callback is only run once.
             * Top 5 useless abstractions
             */
            RunOnce: class RunOnce {
                constructor(callback, runNow = false) {
                    this.callback = callback;
                    this.hasRun = false;

                    if(runNow) return this.run();
                }

                run() {
                    if(this.hasRun) return false;
                    this.hasRun = true;
                    this.callback(...arguments);
                    this.callback = null;
                    return true;
                }

                bind(context) {
                    return this.run.bind(context || this);
                }
            }
        },

        /**
         * Note: Tiny is deprecated since 5.3.0
         * It is not going to be removed as of now, but there are now more modern approaches in LS.
         * @deprecated
         */
        Tiny: {
            /**
             * Element selector utility
             */
            Q(selector, subSelector, one = false) {
                if(!selector) return LS.TinyWrap(one? null: []);

                const isElement = selector instanceof Element;
                const target = (isElement? selector : document);

                if(isElement && !subSelector) return one? selector: [selector]; // LS.TinyWrap();

                const actualSelector = isElement? subSelector || "*" : selector || '*';

                let elements = one? target.querySelector(actualSelector): target.querySelectorAll(actualSelector);
                return elements; // LS.Tiny._prototyped? elements: LS.TinyWrap(one? elements: [...elements]);
            },

            /**
             * Single element selector
             */
            O(selector, subSelector){
                if(!selector) selector = document.body;
                return LS.Tiny.Q(selector, subSelector, true)
            },

            /**
             * Element builder utility
             * Replaced by LS.Create
             */
            N: null, // Defined later by LS.Create for backward compatibility

            /**
             * @deprecated
             */
            M: {
                _GlobalID: {
                    count: 0,
                    prefix: Math.round(Math.random() * 1e3).toString(36) + Math.round(Math.random() * 1e3).toString(36)
                },

                ShiftDown: false,
                ControlDown: false,
                lastKey: null,

                on(...events){
                    let fn = events.find(event => typeof event === "function");

                    for(const event of events){
                        if(typeof event !== "string") continue;
                        window.addEventListener(event, fn)
                    }
                    return LS.Tiny.M
                },

                get GlobalID(){
                    // return M.GlobalIndex.toString(36)

                    LS.Tiny.M._GlobalID.count++;

                    return `${Date.now().toString(36)}-${(LS.Tiny.M._GlobalID.count).toString(36)}-${LS.Tiny.M._GlobalID.prefix}`
                },

                uid(){
                    return LS.Tiny.M.GlobalID + "-" + crypto.getRandomValues(new Uint32Array(1))[0].toString(36)
                }
            },

            _prototyped: false
        },

        /**
         * @deprecated
         */
        TinyWrap(elements){
            if(!elements) return null;

            // No need to wrap anything, if prototypes are global
            if(LS.Tiny._prototyped) return elements;

            function wrap(element){
                return element._lsWrapped || (element._lsWrapped = new Proxy(element, {
                    get(target, key){
                        return LS.TinyFactory[key] || target[key]
                    },

                    set(target, key, value){
                        return target[key] = value
                    }
                }))
            }

            return Array.isArray(elements)? elements.map(wrap): wrap(elements);
        },

        /**
         * TinyFactory (utilities for HTML elements)
         * @deprecated
         */
        TinyFactory: {
            isElement: true,

            /**
             * Get, set or get all attributes of the element.
             * @param {*} get Attribute name to get
             * @param {*} set Value to set
             * @returns {string|Object|HTMLElement}
             * @deprecated
             */
            attr(get = false, set = false) {
                if (set) {
                    this.setAttribute(get, set);
                    return this;
                }
            
                if (get) {
                    return this.getAttribute(get);
                }
            
                const attributes = {};
                for (const { name, value } of this.attributes) {
                    attributes[name] = value;
                }
            
                return attributes;
            },

            /**
             * Assign multiple attributes to the element.
             * @param {Object|string|string[]} attributes Attributes to assign
             * @return {HTMLElement} The element itself for chaining
             * @deprecated
             */
            attrAssign(attributes){
                if (typeof attributes === "string") {
                    this.setAttribute(attributes, "");
                    return this;
                } else if (Array.isArray(attributes)) {
                    for (const attr of attributes) {
                        if (typeof attr === "object") {
                            this.attrAssign(attr);
                        } else if (attr) {
                            this.setAttribute(attr, "");
                        }
                    }
                    return this;
                }
            
                for (const [key, value] of Object.entries(attributes)) {
                    this.setAttribute(key, value || "");
                }

                return this;
            },

            /**
             * Removes one or more attributes from the element.
             * @deprecated
             */
            delAttr(...attributes){
                attributes = attributes.flat(2);
                attributes.forEach(attribute => this.removeAttribute(attribute))

                return this
            },

            /**
             * Adds, removes or toggles class name/s on the element.
             * @param {string|string[]} names Class name/s to add, remove or toggle
             * @param {number|string} [action=1] Action to perform: 1 or "add" to add, 0 or "remove" to remove, 2 or "toggle" to toggle
             * @return {HTMLElement} The element itself for chaining
             * @deprecated
             */
            class(names, action = 1){
                if(typeof names == "undefined") return this;

                action = (action == "add" || (!!action && action !== "remove"))? (action == 2 || action == "toggle")? "toggle": "add": "remove";

                for(let className of typeof names === "string"? names.split(" "): names){
                    if(typeof className !== "string" || className.length < 1) continue;
                    this.classList[action](className)
                }

                return this
            },

            /**
             * Checks if the element has the specified class name/s.
             * @param  {...any} names Class names to check
             * @returns 
             */
            hasClass(...names){
                if(names.length === 0) return false;
                if(names.length === 1) return this.classList.contains(names[0]);

                for(const name of names.flat()) {
                    if(!this.classList.contains(name)) return false;
                }

                return true;
            },

            /**
             * Selects a single matching element within this element.
             * @param {*} selector
             * @deprecated
             */
            get(selector = '*'){
                return LS.Tiny.O(this, selector)
            },

            /**
             * Selects all matching elements within this element.
             * @param {*} selector
             * @deprecated
             */
            getAll(selector = '*'){
                return LS.Tiny.Q(this, selector)
            },

            /**
             * Adds elements to this element with the element DSL.
             * @param  {...any} elements Elements to add
             * @deprecated
             */
            add(...elements){
                this.append(...LS.Util.resolveElements(...elements));
                return this
            },

            /**
             * Adds element(s) before this element and returns itself.
             */
            addBefore(target){
                LS.Util.resolveElements(target).forEach(element => this.parentNode.insertBefore(element, this))
                return this
            },

            /**
             * Adds element(s) after this element and returns itself.
             */
            addAfter(target){
                LS.Util.resolveElements(target).forEach(element => this.parentNode.insertBefore(element, this.nextSibling))
                return this
            },

            /**
             * Adds element to another element and returns itself.
             * Useful shorthand eg. when you are defaulting to a new element (eg. existingElement || LS.Create().addTo(parent))
             * @param {*} element
             * @returns this
             */
            addTo(element){
                LS.Tiny.O(element).add(this)
                return this
            },

            /**
             * Wraps this element inside another element and returns the wrapper.
             * @deprecated
             */
            wrapIn(element){
                this.addAfter(LS.Tiny.O(element));
                element.appendChild(this);
                return this
            },

            /**
             * Checks if the element is currently in the viewport.
             * @returns {boolean}
             * @deprecated
             */
            isInView(){
                var rect = this.getBoundingClientRect();
                return rect.top < (window.innerHeight || document.documentElement.clientHeight) && rect.left < (window.innerWidth || document.documentElement.clientWidth) && rect.bottom > 0 && rect.right > 0
            },

            /**
             * Checks if the entire element is currently in the viewport.
             * @returns {boolean}
             * @deprecated
             */
            isEntirelyInView(){
                var rect = this.getBoundingClientRect();

                return (
                    rect.top >= 0 &&
                    rect.left >= 0 &&
                    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
                );
            },

            /**
             * Adds any number of event listeners to the element.
             * @param  {...any} events Event names followed by the callback function
             * @deprecated
             */
            on(...events){
                let func = events.find(e => typeof e == "function");
                for (const evt of events) {
                    if (typeof evt != "string") continue;
                    this.addEventListener(evt, func);
                }

                return this
            },

            /**
             * Removes event listeners from the element.
             * @deprecated
             */
            off(...events){
                let func = events.find(e => typeof e == "function");
                for (const evt of events) {
                    if (typeof evt != "string") continue;
                    this.removeEventListener(evt, func);
                }

                return this
            },

            applyStyle(rules){
                if(typeof rules !== "object") throw new Error("First attribute of \"applyStyle\" must be an object");

                for(let rule in rules){
                    if(!rules.hasOwnProperty(rule)) continue;

                    let value = rules[rule];

                    if(!rule.startsWith("--")) rule = rule.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

                    this.style.setProperty(rule, value);
                }
            },

            /**
             * @deprecated
             */
            clear(){
                // Tracking usage before removal
                console.error("Warning: TinyFactory.clear() is deprecated, please avoid it.");
                this.innerHTML = '';
                return this
            }
        },

        prototypeTiny(){
            if(LS.Tiny._prototyped) return;
            LS.Tiny._prototyped = true;

            console.debug("Warning: TinyFactory has been prototyped globally to all HTML elements. You can now use all its featuers seamlessly. Beware that this may conflict with other libraries or future changes or cause confusion, please use with caution!");
            Object.assign(HTMLElement.prototype, LS.TinyFactory);
        },

        /**
         * A global modal escape stack.
         * @experimental New
         */
        Stack: class Stack {
            static {
                this.items = [];
            }

            static _init() {
                if(this.container) return;
                window.addEventListener("keydown", (event) => {
                    if (event.key === "Escape") {
                        this.pop();
                    }
                });

                this.container = LS.Create({
                    class: "ls-modal-layer level-1"
                });

                this.container.addEventListener("click", (event) => {
                    if (event.target === this.container && LS.Stack.length > 0 && LS.Stack.top.canClickAway !== false) {
                        LS.Stack.pop();
                    }
                });

                LS.once("ready", () => {
                    LS._topLayer.add(this.container);
                });
            }

            static push(item) {
                if(this.items.indexOf(item) !== -1) {
                    this.remove(item);
                }

                if(item.hasShade) {
                    this.container.classList.add("is-open");
                }

                this.items.push(item);
                return item;
            }

            static pop() {
                if(this.items.length === 0) return null;

                const item = this.top;
                if (item && item.isCloseable !== false) {
                    item.close?.();
                }
                return item;
            }

            static remove(item) {
                const index = this.items.indexOf(item);
                if (index > -1) {
                    this.items.splice(index, 1);
                }

                if(this.items.length === 0 || !this.items.some(i => i.hasShade)) {
                    this.container.classList.remove("is-open");
                }
            }

            static indexOf(item) {
                return this.items.indexOf(item);
            }

            static get length() {
                return this.items.length;
            }

            static get top() {
                return this.items[this.items.length - 1] || null;
            }
        },

        StackItem: class StackItem {
            constructor(modal) {
                this.ref = modal;
            }

            get zIndex() {
                return LS.Stack.indexOf(this);
            }

            close() {
                LS.Stack.remove(this);
                if(this.ref && this.ref.close) {
                    this.ref.close();
                }
            }
        },

        /**
         * @concept
         * @experimental Direction undecided, so far an abstract concept
         */
        Context,

        __dynamicInnerToNode(expr) {
            if (typeof expr === "string") {
                return document.createTextNode(expr);
            }

            if (!expr) {
                return null;
            }

            if(expr instanceof Node) {
                return expr;
            }

            return LS.Create(expr);
        },

        components: new Map,

        Component: class Component extends EventEmitter {
            constructor(){
                super();
                this.__check();
            }

            /**
             * Memory safety feature;
             * Allows components to be bound to a context
             */
            get ctx(){
                return LS.Context.get(this) || LS.Context.global;
            }

            __check(){
                if(!this._component || !LS.components.has(this._component.name)){
                    throw new Error("This class has to be extended and loaded as a component with LS.LoadComponent.");
                }

                if(this.init) this.init();
            }

            destroy(){
                console.warn(`[LS] Component ${this._component.name} does not implement destroy method!`);
                this.events.clear();
                return false;
            }
        },

        DestroyableComponent: class DestroyableComponent extends Context {
            constructor(){
                super();
                LS.Component.prototype.__check.call(this);
            }

            get ctx(){
                return this;
            }

            destroy() {
                super.destroy();
                if(this._component.singular){
                    this._component.instance.destroyed = true;
                    LS.UnregisterComponent(this._component.name);
                }
            }
        },

        LoadComponent(componentClass, options = {}){
            const name = (options.name || componentClass.name).toLowerCase();

            if(LS.components.has(name)) {
                console.warn(`[LS] Duplicate component name ${name}, ignored!`);
                return
            }

            const component = {
                isConstructor: typeof componentClass === "function",
                class: componentClass,
                metadata: options.metadata,
                global: !!options.global,
                hasEvents: options.events !== false,
                singular: !!options.singular,
                name
            }

            if (!component.isConstructor) {
                Object.setPrototypeOf(componentClass, LS.Component.prototype);
                componentClass._component = component;

                if(component.hasEvents) {
                    LS.EventEmitter.prepareHandler(componentClass);
                }
            } else {
                componentClass.prototype._component = component;
            }

            LS.components.set(name, component);

            if(component.global){
                LS[options.name] = options.singular && component.isConstructor? (component.instance = new componentClass): componentClass;
            }

            LS.emit("component-loaded", [component]);
            return component;
        },

        GetComponent(name){
            return LS.components.get(name.toLowerCase())
        },

        UnregisterComponent(name){
            name = name.toLowerCase();
            const component = LS.components.get(name);
            if(!component) return false;

            if(component.instance && !component.instance.destroyed){
                const destroyMethod = component.isConstructor ? component.instance.destroy : component.class.destroy;
                if(typeof destroyMethod === "function"){
                    destroyMethod.call(component.instance);
                } else {
                    console.warn(`[LS] Component ${name} does not implement destroy method!`);
                }
            }

            if(component.global){
                delete LS[name];
            }

            LS.components.delete(name);
            LS.emit("component-unloaded", [component]);
            return true;
        }
    }

    // Reuse global context for global events
    LS.Context.global = new LS.Context();
    LS._events = LS.Context.global;

    ["emit", "quickEmit", "on", "once", "off"].forEach(method => {
        LS[method] = LS.Context.global[method].bind(LS.Context.global);
    });

    if(LS.isWeb){
        for(const field of CONTEXT_FIELDS) {
            const ref = window[field];
            if(LS.Util.isClass(ref)) {
                Context[field] = function() { return new ref(...arguments) };
            } else {
                Context[field] = function() { return ref(...arguments) };
            }
        }

        LS.SelectAll = LS.Tiny.Q;
        LS.Select = LS.Tiny.O;
        LS.Misc = LS.Tiny.M;

        // Backward compatibility
        LS.Tiny.N = LS.Create;

        LS.Stack._init();

        // Deprecated!
        window.addEventListener("keydown", event => {
            LS.Tiny.M.lastKey = event.key;
            if(event.key == "Shift") LS.Tiny.M.ShiftDown = true;
            if(event.key == "Control") LS.Tiny.M.ControlDown = true;
        });

        window.addEventListener("keyup", event => {
            LS.Tiny.M.lastKey = event.key;
            if(event.key == "Shift") LS.Tiny.M.ShiftDown = false;
            if(event.key == "Control") LS.Tiny.M.ControlDown = false;
        });

        window.addEventListener("mousedown", () => LS.Tiny.M.mouseDown = true);
        window.addEventListener("mouseup", () => LS.Tiny.M.mouseDown = false);
    }

    return LS;
});