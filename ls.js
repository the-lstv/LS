/*
    Author: Lukas (thelstv)
    Copyright: (c) https://lstv.space

    Last modified: 2026
    License: GPL-3.0
    Version: 6.0.0-alpha.0
    See: https://github.com/thelstv/LS
*/


(() => {
    /**
     * Advanced & performant (and low-overhead) event handling system used across LS.
     * A very commonly extended base class for objects that need events.
     * 
     * It's one of the fastest JS event emmiters available (benchmarked against ~10 popular implementations)!
     */
    class EventEmitter {
        static REMOVE_LISTENER = Symbol("event-remove");
        static optimize = true;

        events = new Map();

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
         * @param {object} target Kept for compatibility; Binds the event handler methods to a target object.
         * @param {object} options Event handler options.
         */
        constructor(target, options = undefined) {
            if(options && typeof options === "object") this.eventOptions = options;

            // Bad legacy behavior (exposes event methods on any target object)
            if(target){
                if (target.emit === undefined) target.emit = this.emit.bind(this);
                if (target.quickEmit === undefined) target.quickEmit = this.quickEmit.bind(this);
                if (target.on === undefined) target.on = this.on.bind(this);
                if (target.once === undefined) target.once = this.once.bind(this);
            }
        }

        /**
         * Prepares a target object for event handling
         * @param {*} target Target object to prepare
         * @param {*} options Optional event options
         * @deprecated
         */
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

            // FIXME: Shouldn't be hard-coded, prevents this ocasional event from being optimized
            if(name === "destroy") {
                event.deopt = true;
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
            if(name === "destroyed") name = "destroy"; // FIXME: Temporary legacy support, likely not needed

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
                    console.warn(`EventEmitter: Possible memory leak detected. ${event.listeners.length} listeners added for event '${name.toString()}'.`);
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
         * @warning This does not guarantee EventEmitter.REMOVE_LISTENER or any other return value functionality. Async events are not supported with quickEmit.
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
         * 
         * TODO: There could be a way to do this without per-instance calls in extending classes
         */
        aliasEvent(name, alias){
            const event = (name._isEvent? name: this.events.get(name)) || this.prepareEvent(name);
            event.aliases ??= [];

            if(!event.aliases.includes(alias)) event.aliases.push(alias);
            this.events.set(alias, event);
        }

        alias(name, alias){
            console.warn("EventEmitter.alias is deprecated, use EventEmitter.aliasEvent");
            return this.aliasEvent(name, alias);
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
     * FIXME: Too many exposed, vaguely-named methods.
     * Sadly there are no proper "private" fields in JS so I am unsure how to do it cleanly.
     *
     * "Best-effort" based destroy container.
     * It destroys explicitly added destroyables and tries to recursively destroy itself.
     * Supports various destroyable types, timers, and external events.
     */
    class Context extends EventEmitter {
        #destroyables = null;
        #timeouts = null;
        #intervals = null;
        #rAF = null;
        #externalEvents = null;

        #aggressiveCleanup = false;
        #deleteProperties = true;

        destroyed = false;

        constructor(options) {
            super();

            if(options && typeof options === "object") {
                if (options.aggressiveCleanup) this.#aggressiveCleanup = true;
                if (options.deleteProperties === false) this.#deleteProperties = false;
            }
        }

        createElement(tagName, content) {
            return this.addDestroyable(LS.Create(tagName, content));
        }

        /**
         * Element selector that searches within own container.
         */
        selectElement(selector, one = false) {
            return this.container ? LS.Select(this.container, selector, one) : null;
        }

        addDestroyable(...destroyables) {
            const single = destroyables.length === 1 ? destroyables[0] : undefined;
            if (this.destroyed || destroyables.length === 0) return single;

            let set = this.#destroyables;
            if (!set) this.#destroyables = set = new Set();

            for (const item of destroyables) {
                if (!item) continue;

                if (item instanceof Component) {
                    Context.bind(item, this);
                }

                set.add(item);
            }

            return single;
        }

        removeDestroyable(destroyable, destroy = false) {
            const set = this.#destroyables;
            if (!set || !set.delete(destroyable)) return;

            if (set.size === 0) this.#destroyables = null;
            if (destroy) this.destroyOne(destroyable, false);
        }

        setTimeout(callback, delay) {
            if (this.destroyed) return null;

            let set = this.#timeouts;
            if (!set) this.#timeouts = set = new Set();

            const id = setTimeout(() => {
                set.delete(id);
                callback.call(this);
            }, delay);

            set.add(id);
            return id;
        }

        setInterval(callback, interval) {
            if (this.destroyed) return null;

            let set = this.#intervals;
            if (!set) this.#intervals = set = new Set();

            const id = setInterval(callback, interval);

            set.add(id);
            return id;
        }

        clearTimeout(timeout) {
            const set = this.#timeouts;
            if (!set || !set.delete(timeout)) return;

            clearTimeout(timeout);
            if (set.size === 0) this.#timeouts = null;
        }

        clearInterval(interval) {
            const set = this.#intervals;
            if (!set || !set.delete(interval)) return;

            clearInterval(interval);
            if (set.size === 0) this.#intervals = null;
        }

        clearTimeouts() {
            const set = this.#timeouts;
            if (!set) return;

            for (const id of set) {
                clearTimeout(id);
            }

            set.clear();
            this.#timeouts = null;
        }

        clearIntervals() {
            const set = this.#intervals;
            if (!set) return;

            for (const id of set) {
                clearInterval(id);
            }

            set.clear();
            this.#intervals = null;
        }

        clearRAF() {
            const raf = this.#rAF;
            if (!raf) return;

            for (const id of raf) {
                cancelAnimationFrame(id);
            }

            this.#rAF = null;
        }

        createComponent(component, ...options) {
            if (this.destroyed) return null;

            const instance = new component(...options);
            this.addDestroyable(instance);
            Context.bind(instance, this);

            return instance;
        }

        requestAnimationFrame(callback) {
            if (this.destroyed) return null;

            let raf = this.#rAF;
            if (!raf) this.#rAF = raf = [];

            const id = Context.requestAnimationFrame(callback);
            raf.push(id);
            return id;
        }

        destroyOne(destroyable, _remove = true, _explicit = true) {
            try {
                const destroyables = this.#destroyables;
                if (_remove && destroyables) destroyables.delete(destroyable);

                if (typeof destroyable === "function") {
                    if (!_explicit) return;
                    if (!LS.Util.isClass(destroyable)) destroyable();
                    return;
                }

                if(destroyable === null || destroyable === undefined || (typeof destroyable !== "object" && typeof destroyable !== "function")) return;

                if (typeof Element !== "undefined" && destroyable instanceof Element) {
                    destroyable.remove();
                    return;
                }

                if (Array.isArray(destroyable)) {
                    for (const item of destroyable) {
                        this.destroyOne(item, false, _explicit);
                    }
                    destroyable.length = 0;
                    return;
                }

                if (typeof NodeList !== "undefined" && destroyable instanceof NodeList) {
                    for (const item of destroyable) {
                        this.destroyOne(item, false, _explicit);
                    }
                    return;
                }

                if (typeof AbortController !== "undefined" && destroyable instanceof AbortController) {
                    destroyable.abort();
                    return;
                }

                if(LS.isWeb) {
                    if(destroyable instanceof ResizeObserver || destroyable instanceof MutationObserver || destroyable instanceof IntersectionObserver || destroyable instanceof PerformanceObserver) {
                        destroyable.disconnect();
                        return;
                    }

                    if (typeof AudioContext !== "undefined" && destroyable instanceof AudioContext) {
                        if (typeof destroyable.close === "function") destroyable.close();
                        return;
                    }
                }

                if (destroyable instanceof EventEmitter) {
                    destroyable.events?.clear?.();
                }

                if (typeof destroyable.destroy === "function") {
                    destroyable.destroy();
                }
            } catch (error) {
                console.error("Error destroying:", error);
            }
        }

        addExternalEventListener(target, event, callback, options) {
            if (!target || this.destroyed) return;

            const cap = typeof options === "boolean" ? options : !!options?.capture;
            const addListener = target.addEventListener || target.on;
            if (typeof addListener !== "function") return;

            addListener.call(target, event, callback, cap);

            let list = this.#externalEvents;
            if (!list) this.#externalEvents = list = [];
            list.push([target, event, callback, cap]);
        }

        removeExternalEventListener(target, event, callback, options) {
            const list = this.#externalEvents;
            if (!list) return;

            const cap = typeof options === "boolean" ? options : !!options?.capture;
            const index = list.findIndex(([t, e, c, o]) => t === target && e === event && c === callback && o === cap);

            if (index === -1) return;

            const removeListener = target.removeEventListener || target.off;
            if (typeof removeListener === "function") {
                removeListener.call(target, event, callback, cap);
            }

            list.splice(index, 1);
            if (list.length === 0) this.#externalEvents = null;
        }

        destroy() {
            if (this.destroyed) return;
            this.destroyed = true;

            this.quickEmit("destroy");
            this.events?.clear?.();

            const timeouts = this.#timeouts;
            if (timeouts) {
                for (const id of timeouts) {
                    clearTimeout(id);
                }
                timeouts.clear();
                this.#timeouts = null;
            }

            const intervals = this.#intervals;
            if (intervals) {
                for (const id of intervals) {
                    clearInterval(id);
                }
                intervals.clear();
                this.#intervals = null;
            }

            this.clearRAF();

            const externalEvents = this.#externalEvents;
            if (externalEvents) {
                for (const [target, event, callback, options] of externalEvents) {
                    const removeListener = target.removeEventListener || target.off;
                    if (typeof removeListener === "function") {
                        removeListener.call(target, event, callback, options);
                    }
                }

                externalEvents.length = 0;
                this.#externalEvents = null;
            }

            super.destroy(); // Clear events

            if (Object.prototype.hasOwnProperty.call(this, "ctx")) {
                try { this.ctx = null; } catch {}
            }

            const destroyables = this.#destroyables;
            const container = this.container;

            if (destroyables) {
                for (const destroyable of destroyables) {
                    this.destroyOne(destroyable, false);
                }
            }

            if (this.#deleteProperties) {
                const aggressive = this.#aggressiveCleanup;

                for (const key of Object.keys(this)) {
                    if (key === "destroyed") continue;

                    const value = this[key];

                    if (aggressive && (!destroyables || !destroyables.has(value))) {
                        this.destroyOne(value, false, false);
                    }

                    delete this[key];
                }
            }

            if (destroyables) {
                destroyables.clear();
                this.#destroyables = null;
            }

            if (typeof Element !== "undefined" && container instanceof Element) {
                container.remove();

                if (!this.#deleteProperties && this.container === container) {
                    this.container = null;
                }
            }
        }

        static #ctxBinds = new WeakMap();

        static get(item) {
            return this.#ctxBinds.get(item) || null;
        }

        static bind(item, context) {
            this.#ctxBinds.set(item, context);
        }


        // --- Legacy CONTEXT_FIELDS methods for memory safety. Should eventually be removed or redesigned.


        static CONTEXT_FIELDS = ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "fetch", "XMLHttpRequest", "requestAnimationFrame", "EventSource", "WebSocket", "queueMicrotask", "EventTarget", "MessageChannel", "MessagePort", "Worker"];

        /**
         * @dangerous
         * Enforce memory safety by preventing access to certain global fields that can cause leaks or unintended side effects if accessed directly.
         * This is a best-effort feature that should ONLY be used during development and when you know what you are doing, avoid in production.
         */
        static debugEnforceContextSafety() {
            const error = (field) => `[LS.Context Safety Violation] Global access to ${field} is disabled by the site settings. Use scoped "context.${field}" in contexts if available, remember to use addDestroyable, or use LS.Context.global for explicit global access!`;

            const deny = (field) => ({
                get() { throw new Error(error(field)); },
                set() { throw new Error(error(field)); }
            });

            for(const field of Context.CONTEXT_FIELDS) {
                if(window[field]) {
                    try { Object.defineProperty(window, field, deny(field)); } catch(e) { console.warn(`LS.init: Could not enforce memory safety for ${field}:`, e); }
                }
            }
        }

        /**
         * @dangerous
         * Log warnings when accessing certain global fields that can cause leaks or unintended side effects if accessed directly.
         * To be only used during development.
         */
        static debugWarnContextSafety() {
            for(const field of Context.CONTEXT_FIELDS) {
                if(window[field]) {
                    const original = window[field];
                    try { Object.defineProperty(window, field, { get() { console.warn(`[LS.Context Safety Warning] Global access to ${field} is discouraged by the site settings.`); return original; } }); } catch(e) { console.warn(`LS.init: Could not enforce memory safety for ${field}:`, e); }
                }
            }
        }

        static setTimeout(callback, delay) {
            return setTimeout(callback, delay);
        }

        static setInterval(callback, interval) {
            return setInterval(callback, interval);
        }

        static clearTimeout(timeout) {
            clearTimeout(timeout);
        }

        static clearInterval(interval) {
            clearInterval(interval);
        }

        static requestAnimationFrame(callback) {
            if (typeof globalThis.requestAnimationFrame === "function") {
                return globalThis.requestAnimationFrame(callback);
            }
            return globalThis.setTimeout(callback, 16);
        }

        static fetch(...args) {
            if (typeof globalThis.fetch === "function") {
                return globalThis.fetch(...args);
            }
            return Promise.reject(new Error("Fetch API is not supported in this environment."));
        }
        static queueMicrotask(callback) {
            if (typeof globalThis.queueMicrotask === "function") {
                return globalThis.queueMicrotask(callback);
            }
            throw new Error("queueMicrotask is not supported in this environment."); // Well, well.
        }

        static WebSocket = function(...args) {
            if (typeof globalThis.WebSocket === "function") {
                return new globalThis.WebSocket(...args);
            }
            throw new Error("WebSocket is not supported in this environment.");
        }
        
        static EventSource = function(...args) {
            if (typeof globalThis.EventSource === "function") {
                return new globalThis.EventSource(...args);
            }
            throw new Error("EventSource is not supported in this environment.");
        }

        static MessageChannel = function(...args) {
            if (typeof globalThis.MessageChannel === "function") {
                return new globalThis.MessageChannel(...args);
            }
            throw new Error("MessageChannel is not supported in this environment.");
        }

        static MessagePort = function(...args) {
            if (typeof globalThis.MessagePort === "function") {
                return new globalThis.MessagePort(...args);
            }
            throw new Error("MessagePort is not supported in this environment.");
        }
        
        static Worker = function(...args) {
            if (typeof globalThis.Worker === "function") {
                return new globalThis.Worker(...args);
            }
            throw new Error("Worker is not supported in this environment.");
        }
    }

    /**
     * To be refactored
     */
    class Component extends Context {
        constructor(){
            super();
            if(this.init) this.init();
        }

        /**
         * Memory safety feature;
         * Allows components to be bound to a context
         */
        get ctx(){
            return LS.Context.get(this) || LS.Context.global;
        }

        // Components should extend this method for cleanup
        destroy(){
            if(this.destroyed) return;
            super.destroy();
        }
    }

    /**
     * A global modal escape stack.
     * @experimental New
     */
    class Stack {
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

            this.container = document.createElement("div");
            this.container.className = "ls-modal-layer level-1";

            this.container.addEventListener("click", (event) => {
                if (event.target === this.container && LS.Stack.length > 0 && LS.Stack.top.canClickAway !== false) {
                    LS.Stack.pop();
                }
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
    }

    class StackItem {
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
    }

    let initialized = false, _prototyped = false;

    const LS = new class LSMain extends EventEmitter {
        // --- Metadata
        isWeb = typeof window !== 'undefined';
        version = "6.0.0-alpha.0";
        v = 6;

        components = new Map;

        /**
         * @concept
         * @experimental
         */
        Context = Context;
        EventEmitter = EventEmitter;
        Stack = Stack;
        StackItem = StackItem;

        Component = Component;
        get DestroyableComponent() {
            console.warn("LS.DestroyableComponent is deprecated since v6, use LS.Component instead.");
            return Component;
        }

        // --- Symbols
        REMOVE_LISTENER = EventEmitter.REMOVE_LISTENER;

        // --- Init
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
                optimizeEvents: true
            }, options);

            /**
             * @deprecated
             */
            if(options.globalPrototype) {
                if(_prototyped) return;
                _prototyped = true;

                console.debug("Warning: TinyFactory has been prototyped globally to all HTML elements. You can now use all featuers seamlessly. Beware that this may conflict with other libraries/future changes and cause confusion, please use with caution!");

                // Evil design, but so effective
                Object.assign(HTMLElement.prototype, LS.TinyFactory);
            }

            // TODO:
            if(options.theme || options.accent || options.autoScheme || options.autoAccent) {
                const colorOptions = {
                    theme: options.theme,
                    accent: options.accent,
                    autoAccent: options.autoAccent,
                    autoScheme: options.autoScheme
                };

                if(LS.Color) LS.Color.initOptions(colorOptions); else LS.__deferedColorOptions = colorOptions;
            }

            // Enable or disable event optimization (compiles events to a function to avoid loops)
            EventEmitter.optimize = !!options.optimizeEvents;

            if(options.enableV5Compat) {
                console.warn("LS v5 compatibility mode is enabled, it is recommended to update your application to v6 soon.");

                // Legacy TinyFramework aliases
                window.N = LS.Create;
                window.O = LS.SelectOne;
                window.Q = LS.Select;
                window.M = LS.Misc;
                LS.Tiny = { N, O, Q, M };
                LS.TinyWrap = (e) => e;
                LS.Misc.on = (event, callback) => window.addEventListener(event, callback);
            }

            LS.quickEmit("init");
        }

        // --- Component management (may get changed as v6.0 progresses)

        register(componentFactory, options = {}){
            const name = (options.name || componentFactory.name).toLowerCase();

            // Possible future behavior could be reloading supported components
            if(LS.components.has(name)) {
                console.warn(`[LS] Duplicate component name ${name}, ignored!`);
                return;
            }

            const component = {
                isConstructor: typeof componentFactory === "function",
                class: componentFactory,
                metadata: options.metadata,
                global: !!options.global,
                hasEvents: options.events !== false,
                singular: !!options.singular,
                name
            }

            if (!component.isConstructor) {
                Object.setPrototypeOf(componentFactory, Component.prototype);
                // componentClass.prototype.componentName = name; // (?)

                if(component.hasEvents) {
                    this.EventEmitter.prepareHandler(componentFactory);
                }
            } else {
                componentFactory.prototype.componentName = name;
            }

            this.components.set(name, component);

            // Meh API
            if(component.global){
                this[options.name] = options.singular && component.isConstructor? (component.instance = new componentFactory): componentFactory;
            }

            this.emit("component-loaded", [component]);
            return component;
        }

        getComponentByName(name) {
            return this.components.get(name.toLowerCase());
        }

        unregisterComponent(name) {
            name = name.toLowerCase();
            const component = this.components.get(name);
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
                delete this[name];
            }

            this.components.delete(name);
            this.emit("component-unloaded", [component]);
            return true;
        }

        /**
         * @deprecated In favor of register
         */
        LoadComponent(factory, options = {}) {
            return this.register(factory, options);
        }

        /**
         * @deprecated In favor of unregisterComponent
         */
        UnregisterComponent(name) {
            return this.unregisterComponent(name);
        }

        /**
         * @deprecated In favor of getComponentByName
         */
        GetComponent(name) {
            return this.getComponentByName(name);
        }

        /**
         * Dynamic utility for creating elements
         * @param {*} emmet Emmet abbreviation (or options object)
         * @param {Array|String|Object} content Content or options
         * @returns {Element} Created element
         */
        Create(emmet = "div", content){
            if(typeof emmet !== "string"){
                content = emmet;
                if(content) {
                    // Technically tag/tagName are compatible with emmet, but they should be separate at some point
                    emmet = content.emmet || content.tag || content.tagName || "div";
                    delete content.emmet;
                    delete content.tag;
                    delete content.tagName;
                } else if(content === null) return null;
            }

            // Default
            if(!content && !emmet) return document.createElement("div");

            // Simple element (fast path)
            if(!content) return LS.Util.parseEmmet(emmet, { singleNode: true });

            content =
                typeof content === "string"
                    ? { html: content }
                    : Array.isArray(content)
                        ? { inner: content }
                        : content || {};

            const { class: className, tooltip, ns, inner, content: innerContent, html, text, accent, style, reactive, attr, options, attributes, sanitize, state, ...rest } = content;
            const element = Object.assign(
                LS.Util.parseEmmet(emmet, { ns, singleNode: true }),
                rest
            );

            // Special case for ls-select
            if(element.tagName === "LS-SELECT" && options){
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

            if (typeof style === "string") element.style.cssText = style; else if (typeof style === "object") LS.TinyFactory.applyStyle.call(element, style);

            if (state) {
                element.setAttribute("data-ls-state", state);
            }

            // Append children or content
            const contentToAdd = inner || innerContent;
            if (contentToAdd) {
                element.append(...LS.Util.resolveElements(contentToAdd));
            }

            if (text) {
                if(contentToAdd || html) {
                    console.warn("LS.Create: 'text' is being overriden by inner content or html. Only use one of: inner, html, or text.");
                } else {
                    element.appendChild(document.createTextNode(text));
                }
            } else if (html) {
                if(contentToAdd) {
                    console.warn("LS.Create: 'html' is being overriden by inner content. Only use one of: inner, html, or text.");
                } else {
                    element.innerHTML = html;
                }
            }

            if(sanitize) {
                // Remove unsafe tags and attributes
                LS.Util.sanitize(element);
            }

            return element;
        }

        /**
         * Element selector utility.
         * The current implementation doesn't include wrapping as of now.
         */
        Select(selector, subSelector, one = false){
            if(!selector) return one? null: [];

            const isElement = selector instanceof Element;
            const target = (isElement? selector : document);

            if(isElement && !subSelector) return one? selector: [selector];

            const actualSelector = isElement? subSelector || "*" : selector || '*';
            return one? target.querySelector(actualSelector): target.querySelectorAll(actualSelector);
        }

        SelectOne(selector, subSelector){
            if(!selector) selector = document.body;
            return LS.Select(selector, subSelector, true);
        }

        Util = {
            /**
             * Gets URL parameters as an object or a specific parameter by name.
             * From my testing, this is 8x faster than URLSearchParams for all parameters and 11x faster to get a single parameter.
             * Meaning that for most usecases where duplicate keys are not a concern, this is almost always faster and likely cleaner.
             * https://jsbm.dev/XMZyoeowQqoPm
             * 
             * @param {string|null} getOne Name of the parameter to get, or null to get all parameters as an object.
             * @param {string} baseUrl URL or search string to parse, defaults to current location's search string.
             * @returns {object|string|null} Object with all parameters, specific parameter value, or null if not found.
             * 
             * @example LS.Util.parseURLParams(location.search, "q");
             * @example LS.Util.parseURLParams().q;
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
             * Relatively fast & light Emmet abbreviation parser
             * @experimental
             * 
             * @param {string} abbreviation Emmet abbreviation to parse.
             * @returns {DocumentFragment} Root element of the parsed structure.
             * @see https://docs.emmet.io/abbreviations/syntax/ for supported syntax
             * 
             * @note Limitations: Item numbering ($) is not supported yet.
             * 
             * @example LS.Util.parseEmmet("div#main>ul.list>li.item{Item}*3");
             */
            parseEmmet(abbreviation, options = {}, adaptor = document) {
                const len = abbreviation.length;
                const singleNode = options?.singleNode === true;
                const root = singleNode ? null : adaptor.createDocumentFragment();
                delete options.singleNode; // Todo: Handle this separately for groups

                let firstRoot = null;
                let li = 0, state = 0, previousElement = root, currentParent = root, braceCount = 0, inString = false;

                // Clones (for the multiply operator) are deferred until the end of the current element.
                // Reasons are so we can handle nested structures, and to make item numbering ($) possible.
                // Structure: [target, parent, count]
                const markipliers = [];

                for (let i = 0; i < len; i++) {
                    const char = abbreviation.charCodeAt(i);
                    const oldState = state;
                    const atEnd = i === len - 1;

                    if(state === 3) {
                        // Attribute state handling
                        if(inString || (char === /* " */ 34 || char === /* ' */ 39)) {
                            if(inString === char) {
                                inString = false;
                            } else if(!inString) {
                                inString = char;
                            }
                            continue;
                        } else if(char === /* ] */ 93) {
                            state = 0; // End of attribute block
                        } else if(char === /*   */ 32) {
                            state = 3; // Allow another attribute in the same block
                        } else continue;
                    } else if(state === 4) {
                        // Text state handling
                        if(char === /* { */ 123) {
                            braceCount++;
                            continue;
                        } else if(char === /* } */ 125) {
                            if(braceCount === 0 || atEnd) {
                                state = 0;
                            } else {
                                braceCount--;
                                continue;
                            }
                        } else continue;
                    } else if(state === 5) {
                        // Temporary group state handling
                        if(char === /* ( */ 40) {
                            braceCount++;
                            continue;
                        } else if(char === /* ) */ 41) {
                            if(braceCount === 0 || atEnd) {
                                state = 0;
                            } else {
                                braceCount--;
                                continue;
                            }
                        } else continue;
                    } else {
                        switch(char) {
                            case /* . */ 46:  state = 1;  break;                  // Class
                            case /* # */ 35:  state = 2;  break;                  // ID
                            case /* [ */ 91:  state = 3;  break;                  // Attribute
                            case /* { */ 123: state = 4;  braceCount = 0; break;  // Text
                            case /* ( */ 40:  state = 5;  braceCount = 0; break;  // Group
                            case /* > */ 62:  state = 6;  break;                  // Child
                            case /* + */ 43:  state = 7;  break;                  // Sibling
                            case /* * */ 42:  state = 8;  break;                  // Multiply
                            case /* ^ */ 94:  state = 9;  break;                  // Climb-up
                            case /* @ */ 64:  state = 10; break;                  // Changing numbering base and direction
                            default: if (!atEnd) continue;
                        }
                    }

                    // We have reached a state change or end
                    const value = abbreviation.slice(li, (atEnd && state === oldState)? i + 1 : i);
                    li = i + 1;

                    if((oldState >= 1 && oldState <= 4 || oldState === 8 || oldState === 6) && previousElement === root) {
                        // Implicit element creation
                        currentParent = previousElement = adaptor.createElement("div");

                        if(singleNode) {
                            firstRoot = previousElement;
                        } else {
                            root.appendChild(previousElement);
                        }
                    }

                    if (value || oldState === 9 || oldState === 6 || oldState === 7) {
                        switch(oldState) {
                            // Element / Child / Sibling / Climb-up
                            case 0: case 6: case 7: case 9: {
                                // Climb-up
                                if(oldState === 9) {
                                    if(currentParent && currentParent.parentNode) {
                                        currentParent = currentParent.parentNode;
                                    }
                                }

                                if(oldState === 6) {
                                    currentParent = previousElement;
                                }

                                LS.Util.___flushMarkipliers(markipliers, currentParent);

                                if(!value) {
                                    if(oldState === 7) previousElement = currentParent;
                                    continue;
                                }

                                // TODO: Snippets
                                const el = (value === "svg" || options.ns)? adaptor.createElementNS(options.ns || "http://www.w3.org/2000/svg", value) : adaptor.createElement(value);

                                if(currentParent) {
                                    currentParent.appendChild(el);
                                } else if(!firstRoot) {
                                    firstRoot = el;
                                }

                                previousElement = el;
                                continue;
                            }

                            // Class
                            case 1: {
                                previousElement.classList.add(value);
                                continue;
                            }
    
                            // ID
                            case 2: {
                                previousElement.id = value;
                                continue;
                            }
    
                            // Attribute
                            case 3: {
                                // Nonstandard behavior note: if attribute starts with %, it gets converted to a LS state. Eg. "button[%loading]" -> <button data-ls-state="loading"></button>
                                let [attrName, attrValue] = value.charCodeAt(0) === /* % */ 37 ? ["data-ls-state", value.slice(1)] : value.split('=');

                                if(attrValue && (attrValue.charCodeAt(0) === /* " */ 34 || attrValue.charCodeAt(0) === /* ' */ 39)) {
                                    attrValue = attrValue.slice(1, -1);
                                }

                                previousElement.setAttribute(attrName, attrValue || "");
                                continue;
                            }
    
                            // Text
                            case 4: {
                                previousElement.appendChild(adaptor.createTextNode(value));
                                continue;
                            }
    
                            // Group
                            // TODO: Make this single-pass via a stack
                            case 5: {
                                const group = LS.Util.parseEmmet(value, options, adaptor);

                                if(currentParent) {
                                    currentParent.appendChild(group);
                                } else if(!firstRoot) {
                                    firstRoot = group;
                                }

                                previousElement = group.lastElementChild || (currentParent && currentParent.lastChild) || group;
                                continue;
                            }
    
                            // Multiply
                            case 8: {
                                const count = parseInt(value, 10) || 1;
                                if (count > 1 && previousElement && previousElement.parentNode) {
                                    markipliers.push([previousElement, previousElement.parentNode, count]);
                                }
                                continue;
                            }

                            // Changing numbering base and direction
                            case 10: {

                            }
                        }
                    }
                }

                LS.Util.___flushMarkipliers(markipliers, currentParent, true);
                return singleNode ? firstRoot : root;
            },

            /**
             * Internal utility for flushing market pliers in the Emmet parser.
             * Montpelier cloning factory. It clones marketplaces.
             * 
             * I didn't want to make it a method, but i also couldn't find a clean way to embed it in the main loop
             * @internal
             */
            ___flushMarkipliers(markipliers, currentParent, force = false) {
                for (let m = markipliers.length - 1; m >= 0; m--) {
                    const markiplier = markipliers[m];
                    const element = markiplier[0];
                    
                    // I don't really know man
                    if (!force && ((!element || !currentParent)? false: element === currentParent? true: typeof element.contains === "function" && element.contains(currentParent))) continue;

                    if(typeof element.emmetClone === "function") {
                        element.emmetClone(markiplier[1], markiplier[2]);
                    } else {
                        const parent = markiplier[1];
                        if (parent) {
                            for (let j = 1; j < markiplier[2]; j++) {
                                parent.appendChild(element.cloneNode(true));
                            }
                        }
                    }

                    markipliers.splice(m, 1);
                }
            },

            /**
             * Returns true if the provided value is likely a class and not a plain function.
             * https://stackoverflow.com/a/66120819/14541617
             * 
             * @param {*} func Object to check.
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

            resolveElements(...array){
                return array.flat().filter(Boolean).map(element => {
                    return typeof element === "string" ? document.createTextNode(element) : typeof element === "object" && !(element instanceof Node) ? LS.Create(element) : element;
                });
            },

            /**
             * Deep-clones an Object/Set/Map/Array with filtering support, faster than structuredClone and apparently even the klona library.
             * Very experimental - may not always be reliable for complex objects and as of now ignores functions and prototypes (maybe I'll expand it later).
             * I recommend to use only on relatively simple/predictable objects.
             * https://jsbm.dev/wFkz6UCGJevxw
             * 
             * @param {*} obj Object to clone
             * @returns Cloned object
             * @experimental
             */
            clone(obj, filter) {
                // If item is a primitive, we don't need to clone
                // TODO: Handle typeof function
                if (typeof obj !== "object" || obj === null || obj === undefined) return obj;

                // Localized to reduce potential lookups
                const mkClone = LS.Util.clone;

                if (Array.isArray(obj)) {
                    const len = obj.length;
                    if (len === 0) return [];
                    if (len === 1) return [mkClone(obj[0], filter)];

                    const a = [];
                    for (let i = 0; i < len; i++) {
                        a.push(mkClone(obj[i], filter));
                    }

                    return a;
                }

                // TODO: maybe entries array could be faster(?)
                if(obj.constructor === Map) {
                    const m = new Map();
                    for(const [key, value] of obj) {
                        m.set(key, mkClone(value, filter));
                    }
                    return m;
                }
                
                // TODO: maybe array could be faster(?)
                if(obj.constructor === Set) {
                    const s = new Set();
                    for(const value of obj) {
                        s.add(mkClone(value, filter));
                    }
                    return s;
                }

                if (obj.constructor === DataView) return new obj.constructor(mkClone(obj.buffer, filter), obj.byteOffset, obj.byteLength);
                if (obj.constructor === ArrayBuffer) return obj.slice(0);
                if (obj.constructor === Date) return new Date(obj);
                if (obj.constructor === RegExp) return new RegExp(obj);

                // Finally clone objects
                const clone = {};
                const keys = Object.getOwnPropertyNames(obj);
                const klen = keys.length;
                if(klen === 0) return clone;

                // Note: Filter is branched this way for performance
                if(typeof filter === "function") {
                    for (let i = 0; i < klen; i++) {
                        const k = keys[i];
                        if(filter(k, obj[k]) === undefined) continue;
                        clone[k] = mkClone(obj[k], filter);
                    }
                } else {
                    for (let i = 0; i < klen; i++) {
                        const k = keys[i];
                        clone[k] = mkClone(obj[k], filter);
                    }
                }

                return clone;
            },

            /**
             * TouchHandle API; fast, powerful and very useful for any kind of UI where a mouse drag motion happens.
             * Compatible with any pointer type, pointerLock, and reliably handles browser setup.
             */
            TouchHandle: class TouchHandle extends EventEmitter {
                constructor(element, options = {}) {
                    super();

                    this.options = {
                        buttons: [0, 1, 2],
                        disablePointerEvents: true,
                        frameTimed: false,
                        ...options
                    };

                    this.targets = new Set();
                    this.activeTarget = null;

                    if(element) this.addTarget(element && LS.SelectOne(element));
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

                    if(!this.options.detached) this.attach();
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

                onRelease(event) {
                    this.cleanupDragState();

                    const isDestroy = event.type === "destroy";

                    this._eventData.domEvent = event;
                    this.emit(isDestroy ? "destroy" : "end", [this._eventData]);

                    if (this.pointerLockActive) {
                        document.exitPointerLock();
                    }

                    if (isDestroy) {
                        if (this.options.onDestroy) {
                            this.options.onDestroy(this._eventData);
                        }
                    } else if (this.options.onEnd) {
                        this.options.onEnd(this._eventData);
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

            // These methods are slow (~5x compared to spread), but primarily exist because the spread operator doesn't copy property descriptors & disconnects the original object.
            // Something like native template objects would be nice 🤔
            defaults(defaults, target = {}) {
                if(typeof target !== "object") throw "The target must be an object";

                for (const key of Object.keys(defaults)) {
                    if (!(key in target)) {
                        Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(defaults, key));
                    }
                }
                return target;
            },

            // Could be optimized further
            staticDefaults(defaults) {
                const cache = Object.keys(defaults).map(key => [
                    key,
                    Object.getOwnPropertyDescriptor(defaults, key)
                ]);

                return function(target) {
                    if(typeof target !== "object") throw "The target must be an object";

                    for (const [key, descriptor] of cache) {
                        if (!(key in target)) {
                            if(typeof descriptor.value === "object" && descriptor.value !== null) {
                                descriptor = { ...descriptor, value: LS.Util.clone(descriptor.value) };
                            }

                            Object.defineProperty(target, key, descriptor);
                        }
                    }

                    return target;
                }
            },

            /**
             * Copies text to the clipboard on any browser.
             * @param {*} text 
             * @returns {Promise}
             */
            copy(text) {
                return new Promise(resolve => {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(text)
                            .then(() => {
                                resolve()
                            })
                            .catch(error => {
                                resolve(error)
                            });
                    } else {
                        let temp = document.createElement('textarea');
                        temp.value = text;
                        document.body.appendChild(temp);
                        temp.select();
                        document.execCommand('copy');
                        document.body.removeChild(temp);
                        resolve();
                    }
                })
            },

            // Allowlist of harmless tags in sanitize(): i, b, strong, kbd, code, pre, em, u, s, mark, small, sub, sup, br, span
            allowedTags: ['I', 'B', 'STRONG', 'KBD', 'CODE', 'PRE', 'EM', 'U', 'S', 'MARK', 'SMALL', 'SUB', 'SUP', 'BR', 'SPAN'],

            /**
             * Sanitize a node, stripping all elements not on an allowlist, and removes all attributes.
             * @param {*} node
             * 
             * @example
             * const dangerous = LS.Create({ html: "<script>console.log('Unsafe HTML')</script>" });
             * LS.Util.sanitize(dangerous); // Removes <script>
             * 
             * @example
             * // This can also be done directly when creating:
             * LS.Create("span", { html: "..unsafe html..", sanitize: true })
             */
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

            /**
             * Normalize a string
             * @param {*} string String to normalize
             * @returns Normalized string
             */
            normalize(string, space = " ") {
                return string.toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^a-z0-9\s]/g, "")
                    .replace(/\s+/g, space)
                    .trim();
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
             * A simple switch that triggers a callback when its value changes, but does nothing if it doesn't.
             */
            Switch: class Switch {
                constructor(onSet) {
                    this.value = false;
                    this.onSet = onSet;
                }

                set(value) {
                    if(this.value === value) return value;
                    this.value = value;
                    this.onSet(this.value);
                    return value;
                }

                on() {
                    return this.set(true);
                }

                off() {
                    return this.set(false);
                }

                toggle() {
                    return this.set(!this.value);
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

                    this.options = {
                        initial: 0,
                        mode: "display",
                        parent: null,
                        onSet: null,
                        ...options
                    };

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
            },

            validateUUID(uuid) {
                // Fast uuidv4 validation, roughly 3.5x faster than Node.JS uuid.validate
                if(typeof uuid !== 'string' || uuid.length !== 36) return false;

                // Fixed length loop
                for (let i = 0; i < 36; i++) {
                    const c = uuid.charCodeAt(i);
                    if(i === 14) {
                        // Version check
                        if(c >= 48 && c <= 53) continue; // 0-5
                    } else if(i === 19) {
                        // Variant check
                        if(c === 56 || c === 57 || c === 97 || c === 98 || c === 65 || c === 66) continue; // 8, 9, a, b, A, B
                    } else if ((i === 8 || i === 13 || i === 18 || i === 23) ? c === 45 : ((c >= 48 && c <= 57) || // 0-9
                        (c >= 97 && c <= 102) || // a-f
                        (c >= 65 && c <= 70))) { // A-F
                        continue;
                    }
                    return false;
                }
                return true;
            },

            /**
             * Fast utilities for optimization
             * They must remain simple & best-case as much as possible as to be safely relied on
             */
            fast: {
                /**
                 * Convert a hexadecimal character to its integer value (0-15), or -1 if it's not a valid hex character.
                 * @param {*} h ASCII code of the character (e.g. from charCodeAt)
                 * @returns {number} Integer value of the hex character, or -1 if invalid
                 */
                // "(c > 57? c + 9: c) & 15" is technically faster (~20%) but doesn't handle invalid characters; it's not worth the tradeoff
                h2i: (c) => (c >= 48 && c <= 57)? c - 48: (c >= 97 && c <= 102)? c - 87: (c >= 65 && c <= 70)? c - 55: -1,
                twoh2i: (high, low) => (LS.Util.fast.h2i(high) << 4) | LS.Util.fast.h2i(low)
            }
        }

        /**
         * @deprecated
         */
        Misc = {
            _GlobalID: {
                count: 0,
                prefix: Math.round(Math.random() * 1e3).toString(36) + Math.round(Math.random() * 1e3).toString(36)
            },

            get GlobalID(){
                LS.Misc._GlobalID.count++;
                return `${Date.now().toString(36)}-${(LS.Misc._GlobalID.count).toString(36)}-${LS.Misc._GlobalID.prefix}`;
            },

            uid(){
                return LS.Misc.GlobalID + "-" + crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
            }
        }

        toNode(expr) {
            if (typeof expr === "string" || typeof expr === "number") {
                return document.createTextNode(expr);
            }

            if (!expr) {
                return null;
            }

            if(expr instanceof Node) {
                return expr;
            }

            return LS.Create(expr);
        }

        /**
         * TinyFactory (utilities for HTML elements)
         * @deprecated
         */
        TinyFactory = {
            isElement: true,

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
             * @deprecated
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
             * @deprecated
             */
            addBefore(target){
                LS.Util.resolveElements(target).forEach(element => this.parentNode.insertBefore(element, this))
                return this
            },

            /**
             * Adds element(s) after this element and returns itself.
             * @deprecated
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
            addTo(element, index = null){
                const parent = LS.SelectOne(element);
                if (index !== null) {
                    parent.insertBefore(this, parent.children[index]);
                } else {
                    parent.append(this);
                }
                return this;
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
        }
    }

    // --- Export & init

    if(typeof module !== "undefined"){
        module.exports = LS;
    }

    // Ensure this event is deoptimized
    LS.prepareEvent("component-loaded", { deopt: true });
    LS.prepareEvent("ready", { deopt: true });

    if(!LS.isWeb) {
        LS.completed("ready");
        return;
    }

    if(!window.LS_DEFER_INIT){
        LS.init({
            globalPrototype: window.ls_do_not_prototype !== true,
            ...(window.LS_INIT_OPTIONS || null)
        });

        delete window.LS_INIT_OPTIONS;
    }

    LS._topLayer = document.createElement("div");
    LS._topLayer.id = "ls-top-layer";
    LS._topLayer.style.position = "fixed";
    LS.Stack._init();
    LS._topLayer.add(LS.Stack.container);

    function onLoaded(){
        LS.body = document.body; // It can be scoped to a different element
        LS.ready = true;
        LS.completed("ready", [LS.body]);
        LS.body.append(LS._topLayer);
    }

    delete window.LS_DEFER_INIT;

    (typeof window !== 'undefined'? window : globalThis).LS = LS;
    if(document.body) onLoaded(); else window.addEventListener("DOMContentLoaded", onLoaded);

})();