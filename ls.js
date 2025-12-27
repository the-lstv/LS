/*
    Author: Lukas (thelstv)
    Copyright: (c) https://lstv.space

    Last modified: 2025
    License: GPL-3.0
    Version: 5.2.7
    See: https://github.com/thelstv/LS
*/

(exports => {

    const global = typeof window !== 'undefined'? window : globalThis;
    const instance = exports();

    // --- Polyfills ---
    if(!Array.prototype.flat){
        Array.prototype.flat = function(depth = 1) {
            return this.reduce((acc, val) => {
                if(Array.isArray(val) && depth > 0){
                    acc.push(...val.flat(depth - 1));
                } else {
                    acc.push(val);
                }
                return acc;
            }, []);
        }
    }

    if(typeof module !== "undefined"){
        module.exports = instance
    }

    if(instance.isWeb){
        global.LS = instance

        if(window.LS_DONT_GLOBALIZE_TINY !== true)
        for (let key in instance.Tiny){
            global[key] = instance.Tiny[key];
        }

        if(!window.ls_do_not_prototype) instance.prototypeTiny();

        instance._topLayer = instance.Create({id: "ls-top-layer", style: {
            position: "fixed"
        }});

        function bodyAvailable(){
            document.body.append(instance._topLayer)
            instance._events.completed("body-available", [document.body]);
        }

        if(document.body) bodyAvailable(); else window.addEventListener("load", bodyAvailable);
    }

    return instance

})(() => {

    class EventHandler {
        /**
         * @param {object} target Possibly deprecated; Binds the event handler methods to a target object.
         */
        constructor(target){
            LS.EventHandler.prepareHandler(this);
            if(target){
                target._events = this;

                ["emit", "on", "once", "off", "invoke"].forEach(method => {
                    if (!target.hasOwnProperty(method)) target[method] = this[method].bind(this);
                });

                this.target = target;
            }
        }

        static prepareHandler(target){
            target.events = new Map;
        }

        prepareEvent(name, options){
            if(options && options.completed === false) {
                // Clear data once uncompleted
                options.data = null;
            }

            if(!this.events.has(name)){
                this.events.set(name, { listeners: [], empty: [], ...options, _isEvent: true })
            } else if(options){ 
                Object.assign(this.events.get(name), options)
            }

            return this.events.get(name)
        }

        on(name, callback, options){
            const event = (name._isEvent? name: this.events.get(name)) || this.prepareEvent(name);
            if(event.completed) {
                if(event.data) callback(...event.data); else callback();
                if(options && options.once) return this;
            }

            const index = event.empty.length > 0 ? event.empty.pop() : event.listeners.length;

            event.listeners[index] = { callback, index, ...options }
            return this
        }

        off(name, callback){
            const event = name._isEvent? name: this.events.get(name);
            if(!event) return;

            for(let i = 0; i < event.listeners.length; i++){
                if(event.listeners[i].callback === callback) {
                    event.empty.push(i)
                    event.listeners[i] = null
                }
            }

            return this
        }

        once(name, callback, options){
            return this.on(name, callback, Object.assign(options || {}, { once: true }))
        }

        /**
         * @deprecated
        */
        invoke(name, ...data){
            return this.emit(name, data, { results: true })
        }

        /**
         * Emit an event with the given name and data.
         * @param {string|object} name Name of the event or an event object.
         * @param {Array} data Data to pass to the event listeners.
         * @param {object} options Options for the event emission.
         * @returns {Array|null} Returns an array of results or null.
         */

        emit(name, data, options = {}){
            if(!name) return;

            const event = name._isEvent? name: this.events.get(name);

            const returnData = options.results? []: null;
            if(!event) return returnData;

            const hasData = Array.isArray(data) && data.length > 0;

            for(let listener of event.listeners){
                if(!listener || typeof listener.callback !== "function") continue;

                try {
                    const result = hasData? listener.callback(...data): listener.callback();

                    if(options.break && result === false) break;
                    if(options.results) returnData.push(result);

                    if(result === LS.REMOVE_LISTENER) {
                        event.empty.push(listener.index);
                        event.listeners[listener.index] = null;
                        listener = null;
                        continue;
                    }
                } catch (error) {
                    console.error(`Error in listener for event '${name}':`, listener, error);
                }

                if(listener && listener.once) {
                    event.empty.push(listener.index);
                    event.listeners[listener.index] = null;
                    listener = null;
                }
            }

            return returnData
        }

        /**
         * Quickly emit an event without checks - to be used only in specific scenarios.
         * @param {*} event Event object.
         * @param {*} data Data array.
         */

        quickEmit(event, data){
            if(!event._isEvent) throw new Error("Event must be a valid event object when using quickEmit");

            for(let i = 0, len = event.listeners.length; i < len; i++){
                const listener = event.listeners[i];
                if(!listener || typeof listener.callback !== "function") continue;

                if(listener.once) {
                    event.empty.push(listener.index);
                    event.listeners[listener.index] = null;
                }

                listener.callback(...data);
            }
        }

        flush(){
            this.events.clear();
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

        completed(name, data = [], options = {}){
            this.emit(name, data);

            this.prepareEvent(name, {
                ...options,
                completed: true,
                data
            })
        }
    }

    const LS = {
        isWeb: typeof window !== 'undefined',
        version: "5.2.7",
        v: 5,

        REMOVE_LISTENER: Symbol("event-remove"),

        init(options = {}) {
            if(!this.isWeb) return;

            options = LS.Util.defaults({
                globalPrototype: true,
                theme: null,
                accent: null,
                autoScheme: true,
                adaptiveTheme: false
            }, options);

            if(options.globalPrototype) LS.prototypeTiny();
            if(options.theme) this.Color.setTheme(options.theme);
            if(options.accent) this.Color.setAccent(options.accent);
            if(options.autoScheme) this.Color.autoScheme(options.adaptiveTheme);

            LS._events.completed("init")
        },

        components: new Map,

        EventHandler,

        TinyWrap(elements){
            if(!elements) return null;
            
            // No need to wrap anything, prototypes are global
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

        Tiny: {
            /**
             * Element selector utility
             */
            Q(selector, subSelector, one = false) {
                if(!selector) return LS.TinyWrap(one? null: []);

                const isElement = selector instanceof Element;
                const target = (isElement? selector : document);

                if(isElement && !subSelector) return LS.TinyWrap(one? selector: [selector]);

                const actualSelector = isElement? subSelector || "*" : selector || '*';

                let elements = one? target.querySelector(actualSelector): target.querySelectorAll(actualSelector);

                return LS.Tiny._prototyped? elements: LS.TinyWrap(one? elements: [...elements]);
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
             */
            N(tagName = "div", content){
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
                        ? { innerHTML: content }
                        : Array.isArray(content)
                            ? { inner: content }
                            : content || {};

                if(tagName === "svg" && !content.hasOwnProperty("ns")) {
                    content.ns = "http://www.w3.org/2000/svg";
                }

                const { class: className, tooltip, ns, accent, style, inner, content: innerContent, reactive, attr, attributes, ...rest } = content;

                const element = Object.assign(
                    ns ? document.createElementNS(ns, tagName) : document.createElement(tagName),
                    rest
                );

                // Handle attributes
                if (accent) element.setAttribute("ls-accent", accent);
                if (attr || attributes) LS.TinyFactory.attrAssign.call(element, attr || attributes);

                // Handle tooltips
                if (tooltip) {
                    if (!LS.Tooltips) {
                        element.setAttribute("title", tooltip);
                    } else {
                        element.setAttribute("ls-tooltip", tooltip);
                        LS.Tooltips.addElements([{ target: element, attributeName: "ls-tooltip" }]);
                    }
                }

                // Handle reactive bindings
                if (reactive) {
                    if (!LS.Reactive) {
                        console.warn("Reactive bindings are not available, please include the Reactive module to use this feature.");
                    }

                    LS.Reactive.bindElement(element, reactive);
                }

                if (typeof className === "string") {
                    element.className = className;
                } else if(className) {
                    LS.TinyFactory.class.call(element, className);
                }

                if (typeof style === "object") LS.TinyFactory.applyStyle.call(element, style); else if (typeof style === "string") element.style.cssText = style;

                // Append children or content
                const contentToAdd = inner || innerContent;
                if (contentToAdd) LS.TinyFactory.add.call(element, contentToAdd);

                return element;
            },

            /**
             * Color utilities
             */
            C(r, g, b, a = 1){
                return new LS.Color(r, g, b, a)
            },

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
                },

                LoadStyle(href, callback) {
                    return new Promise((resolve, reject) => {
                        const linkElement = N("link", {
                            rel: "stylesheet",
                            href,

                            onload() {
                                if (typeof callback === "function") callback(null);
                                resolve();
                            },

                            onerror(error) {
                                const errorMsg = error.toString();
                                if (typeof callback === "function") callback(errorMsg);
                                reject(errorMsg);
                            }
                        });
                
                        document.head.appendChild(linkElement);
                    });
                },

                LoadScript(src, callback) {
                    return new Promise((resolve, reject) => {
                        const scriptElement = N("script", {
                            src,

                            onload() {
                                if (typeof callback === "function") callback(null);
                                resolve();
                            },

                            onerror(error) {
                                const errorMsg = error.toString();
                                if (typeof callback === "function") callback(errorMsg);
                                reject(errorMsg);
                            }
                        });
                
                        document.head.appendChild(scriptElement);
                    });
                },

                async LoadDocument(url, callback, targetElement = null) {
                    let data;

                    try {
                        const response = await fetch(url);
                        if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
                        const text = await response.text();

                        if (targetElement instanceof Element) {
                            targetElement.innerHTML = text;
                            data = targetElement;
                        } else if (typeof targetElement === "string") {
                            data = LS.Tiny.N(targetElement, { innerHTML: text });
                        } else {
                            const template = document.createElement("template");
                            template.innerHTML = text;
                            data = template.content.childNodes;
                        }

                        if (typeof callback === "function") callback(null, data);
                        return data;
                    } catch (error) {
                        if (typeof callback === "function") callback(error.toString());
                        throw error;
                    }
                }
            },

            _prototyped: false
        },


        /**
         * TinyFactory (utilities for HTML elements)
         */
        TinyFactory: {
            isElement: true,

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

            attrAssign(attributes){
                if (typeof attributes === "string") {
                    attributes = { Array: [attributes] };
                } else if (Array.isArray(attributes)) {
                    attributes = { Array: attributes };
                }
            
                for (const [key, value] of Object.entries(attributes)) {
                    if (key === "Array") {
                        for (const attr of value) {
                            if (typeof attr === "object") {
                                this.attrAssign(attr);
                            } else if (attr) {
                                this.setAttribute(attr, "");
                            }
                        }
                    } else if (key) {
                        this.setAttribute(key, value || "");
                    }
                }

                return this;
            },

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

            toggleClass(name){
                this.classList.toggle(name);
                return this;
            },

            /**
             * Selects a single matching element within this element.
             * @param {*} selector
             * @returns
             */
            get(selector = '*'){
                return LS.Tiny.O(this, selector)
            },

            /**
             * Selects all matching elements within this element.
             * @param {*} selector 
             * @returns 
             */
            getAll(selector = '*'){
                return LS.Tiny.Q(this, selector)
            },

            /**
             * Adds elements to this element.
             * @param  {...any} elements Elements to add
             * @returns 
             */
            add(...elements){
                this.append(...LS.Util.resolveElements(...elements));
                return this
            },

            addBefore(target){
                LS.Util.resolveElements(target).forEach(element => this.parentNode.insertBefore(element, this))
                return this
            },

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

            wrapIn(element){
                this.addAfter(LS.Tiny.O(element));
                element.appendChild(this);
                return this
            },

            isInView(){
                var rect = this.getBoundingClientRect();
                return rect.top < (window.innerHeight || document.documentElement.clientHeight) && rect.left < (window.innerWidth || document.documentElement.clientWidth) && rect.bottom > 0 && rect.right > 0
            },

            isEntirelyInView(){
                var rect = this.getBoundingClientRect();

                return (
                    rect.top >= 0 &&
                    rect.left >= 0 &&
                    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
                );
            },

            on(...events){
                let func = events.find(e => typeof e == "function");
                for (const evt of events) {
                    if (typeof evt != "string") continue;
                    this.addEventListener(evt, func);
                }

                return this
            },

            off(...events){
                let func = events.find(e => typeof e == "function");
                for (const evt of events) {
                    if (typeof evt != "string") continue;
                    this.removeEventListener(evt, func);
                }

                return this
            },

            hide(){
                let current = getComputedStyle(this).display;
                this._display = current;

                this.style.display = "none";
                return this
            },

            show(displayOverride){
                this.style.display = displayOverride || this._display || "inherit";
                return this
            },

            applyStyle(rules){
                if(typeof rules !== "object") throw new Error("First attribute of \"applyStyle\" must be an object");

                for(let rule in rules){
                    if(!rules.hasOwnProperty(rule)) continue;

                    let value = rules[rule];

                    if(!rule.startsWith("--")) rule = rule.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

                    this.style.setProperty(rule, value)
                }
            },

            set(...elements){
                this.innerHTML = '';
                return this.add(...elements)
            },

            clear(){
                this.innerHTML = '';
                return this
            },

            has(...elements){
                return !!elements.find(element => this.get(element))
            }
        },

        prototypeTiny(){
            if(LS.Tiny._prototyped) return;
            LS.Tiny._prototyped = true;

            console.debug("Warning: TinyFactory has been prototyped globally to all HTML elements. You can now use all its featuers seamlessly. Beware that this may conflict with other libraries or future changes or cause confusion, please use with caution!");
            Object.assign(HTMLElement.prototype, LS.TinyFactory);
        },

        Util: {
            resolveElements(...array){
                return array.flat().filter(Boolean).map(element => {
                    return typeof element === "string" ? document.createTextNode(element) : typeof element === "object" && !(element instanceof Node) ? N(element) : element;
                });
            },

            map(it, fn){
                const r = [];
                for(let i = 0; i < it.length; i++) {
                    r.push(fn(it[i], i));
                }
                return r;
            },

            params(get = null){
                let url = location.href;

                if(!url.includes('?')){
                    return get? null : {}
                }

                let result = {},
                    params = url.replaceAll(/(.*?)\?/gi, '').split('&')
                ;
                
                for(let param of params){
                    param = param.split("=");
                    result[param[0]] = decodeURIComponent(param[1] || "").replace(/#(.*)/g,"")
                }

                return get? result[get] : result
            },

            TouchHandle: class TouchHandle extends EventHandler {
                constructor(element, options = {}) {
                    super();
                    
                    this.element = LS.Tiny.O(element);
                    if (!this.element) throw "Invalid handle!";

                    this.options = {
                        buttons: [0, 1, 2],
                        disablePointerEvents: true,
                        ...options
                    };

                    this._cursor = this.options.cursor || null;
                    this.cancelled = false;
                    this.seeking = false;
                    this.pointerLockActive = false;
                    this.pointerLockPreviousX = 0;
                    this.pointerLockPreviousY = 0;
                    this.dragTarget = null;

                    this.onStart = this.onStart.bind(this);
                    this.onMove = this.onMove.bind(this);
                    this.onRelease = this.onRelease.bind(this);
                    this.cancel = this.cancel.bind(this);
                    this.onPointerLockChange = this.onPointerLockChange.bind(this);

                    // Attach initial listeners
                    this.element.addEventListener("mousedown", this.onStart);
                    this.element.addEventListener("touchstart", this.onStart, { passive: false });
                    
                    if (this.options.startEvents) {
                        for (const evt of this.options.startEvents) {
                            this.element.addEventListener(evt, this.onStart);
                        }
                    }

                    if (this.options.pointerLock) {
                        document.addEventListener('pointerlockchange', this.onPointerLockChange);
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
                        } else if (event.target !== this.element) {
                            return;
                        }
                    }

                    // Prevent default to stop text selection, etc.
                    if (event.cancelable && event.type !== "touchstart") event.preventDefault();

                    if (event.type === "mousedown" && !this.options.buttons.includes(event.button)) return;

                    this.seeking = true;
                    this.cancelled = false;

                    const isTouch = event.type === "touchstart";
                    const x = isTouch ? event.touches[0].clientX : event.clientX;
                    const y = isTouch ? event.touches[0].clientY : event.clientY;

                    this.emit("start", [event, this.cancel, x, y]);
                    if (this.options.onStart) this.options.onStart(event, this.cancel, x, y);

                    if (this.cancelled) {
                        this.seeking = false;
                        return;
                    }

                    if (this.options.pointerLock) {
                        if(!this.pointerLockSet) {
                            document.addEventListener('pointerlockchange', this.onPointerLockChange);
                            this.pointerLockSet = true;
                        }

                        if(!isTouch) {
                            this.pointerLockPreviousX = event.clientX;
                            this.pointerLockPreviousY = event.clientY;
                            this.element.requestPointerLock();
                        }
                    }

                    this.dragTarget = LS.Tiny.O(event.target);
                    this.dragTarget.classList.add("ls-drag-target");
                    this.element.classList.add("is-dragging");
                    
                    const docEl = document.documentElement;
                    docEl.classList.add("ls-dragging");
                    if (this.options.disablePointerEvents) docEl.style.pointerEvents = "none";
                    
                    if (!docEl.style.cursor) docEl.style.cursor = this._cursor || "grab";

                    // Attach move/up listeners to document
                    document.addEventListener("mousemove", this.onMove);
                    document.addEventListener("mouseup", this.onRelease);
                    document.addEventListener("touchmove", this.onMove, { passive: false });
                    document.addEventListener("touchend", this.onRelease);
                }

                onMove(event) {
                    if (this.cancelled) return;

                    const isTouch = event.type === "touchmove";
                    if (!isTouch && event.cancelable) event.preventDefault();

                    let x, y;

                    if (!this.pointerLockActive) {
                        x = isTouch ? event.touches[0].clientX : event.clientX;
                        y = isTouch ? event.touches[0].clientY : event.clientY;
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

                    if (this.options.onMove) this.options.onMove(x, y, event, this.cancel);
                    this.emit("move", [x, y, event, this.cancel]);
                }

                onRelease(event) {
                    this.cleanupDragState();

                    const isDestroy = event.type === "destroy";
                    this.emit(isDestroy ? "destroy" : "end", [event]);

                    if (this.pointerLockActive) {
                        document.exitPointerLock();
                    }

                    if (isDestroy) {
                        if (this.options.onDestroy) this.options.onDestroy(event);
                    } else if (this.options.onEnd) {
                        this.options.onEnd(event);
                    }
                }

                cancel() {
                    this.cancelled = true;
                }

                onPointerLockChange() {
                    this.pointerLockActive = document.pointerLockElement === this.element;
                }

                cleanupDragState() {
                    this.seeking = false;
                    this.cancelled = false;

                    if (this.element) this.element.classList.remove("is-dragging");
                    if (this.dragTarget) {
                        this.dragTarget.classList.remove("ls-drag-target");
                        this.dragTarget = null;
                    }

                    const docEl = document.documentElement;
                    docEl.classList.remove("ls-dragging");
                    docEl.style.pointerEvents = "";
                    docEl.style.cursor = "";

                    document.removeEventListener("mousemove", this.onMove);
                    document.removeEventListener("mouseup", this.onRelease);
                    document.removeEventListener("touchmove", this.onMove);
                    document.removeEventListener("touchend", this.onRelease);
                }

                destroy() {
                    if (this.destroyed) return false;

                    // Trigger release logic with destroy type
                    this.onRelease({ type: "destroy" });

                    // Remove initial listeners
                    if (this.element) {
                        this.element.removeEventListener("mousedown", this.onStart);
                        this.element.removeEventListener("touchstart", this.onStart);
                        if (this.options.startEvents) {
                            for (const evt of this.options.startEvents) {
                                this.element.removeEventListener(evt, this.onStart);
                            }
                        }
                    }

                    document.removeEventListener('pointerlockchange', this.onPointerLockChange);

                    this.flush();
                    this.element = null;
                    this.options = null;
                    this.destroyed = true;
                    return true;
                }
            },

            touchHandle(element, options) {
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
                 * @param {boolean} [options.timeSync] - If true, pass delta time to callback.
                 * @param {number} [options.speed] - Playback speed multiplier (default: 1).
                 */
                constructor(callback, options = {}) {
                    this.callback = callback;
                    this.queued = false;
                    this.running = false;
                    this.limiter = options.limiter || null;
                    this.timeSync = options.timeSync || false;
                    this.speed = options.speed ?? 1;
                    this._lastFrame = 0;
                    this._rafId = null;
                    if (this.timeSync) this._prevTimestamp = null;
                }

                #frame = (timestamp) => {
                    if (this.limiter) {
                        if (timestamp - this._lastFrame < this.limiter) {
                            // Not enough time passed, reschedule
                            this._rafId = requestAnimationFrame(this.#frame);
                            return;
                        }
                        this._lastFrame = timestamp;
                    }

                    this.queued = false;
                    
                    if (this.callback) {
                        if (this.running && this.timeSync) {
                            const delta = this._prevTimestamp !== null ? (timestamp - this._prevTimestamp) * this.speed : 0;
                            this._prevTimestamp = timestamp;
                            this.callback(delta, timestamp);
                        } else {
                            this.callback();
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
                    if (this.timeSync) this._prevTimestamp = null;
                    this.schedule();
                }

                stop() {
                    this.running = false;
                    this.cancel();
                }

                schedule() {
                    if (this.queued) return;
                    this.queued = true;

                    this._rafId = requestAnimationFrame(this.#frame);
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
                    if (this.timeSync) this._prevTimestamp = null;
                }
            },

            /**
             * Ensures a callback is only run once.
             */
            RunOnce: class RunOnce {
                constructor(callback) {
                    this.callback = callback;
                    this.hasRun = false;
                }

                run() {
                    if(this.hasRun) return;
                    this.hasRun = true;
                    this.callback();
                    this.callback = null;
                }
            }
        },

        Component: class Component extends EventHandler {
            constructor(){
                super();

                if(!this._component || !LS.components.has(this._component.name)){
                    throw new Error("This class has to be extended and loaded as a component with LS.LoadComponent.");
                }

                if(this.init) {
                    LS.once("init", () => this.init())
                }

                // if(this._component.hasEvents) {
                //     this._events = new LS.EventHandler(this);
                // }
            }

            destroy(){
                console.warn(`[LS] Component ${this._component.name} does not implement destroy method!`);
                return false;
            }
        },

        LoadComponent(componentClass, options = {}){
            const name = options.name || componentClass.name;

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
                name
            }

            if (!component.isConstructor) {
                Object.setPrototypeOf(componentClass, LS.Component.prototype);
                componentClass._component = component;

                if(component.hasEvents) {
                    LS.EventHandler.prepareHandler(componentClass);
                }
            } else {
                componentClass.prototype._component = component;
            }

            LS.components.set(name, component);

            if(component.global){
                LS[name] = options.singular && component.isConstructor? new componentClass: componentClass;
            }

            LS.emit("component-loaded", [component]);
            return component
        },

        GetComponent(name){
            return LS.components.get(name)
        },

        /**
         * Global shortcut manager API (not finalized)
         * @experimental May completely change in future versions, use carefully
         */
        ShortcutManager: class ShortcutManager extends EventHandler {
            constructor({ target = document, signal = null, shortcuts = {} } = {}){
                super();

                this.shortcuts = new Map();
                this.mappings = new Map();

                this.handler = this.#handleKeyDown.bind(this);
                this.target = target;
                this.target.addEventListener('keydown', this.handler, signal ? { signal } : undefined);

                if(shortcuts) for(const [shortcut, handler] of Object.entries(shortcuts)){
                    this.register(shortcut, handler);
                }
            }

            /**
             * Registers a keyboard shortcut.
             * @param {string|array<string>} shortcut Shortcut (eg. "Ctrl+S" or ["Ctrl+S", "Cmd+S"])
             * @param {*} handler Callback
             * @returns 
             */
            register(shortcut, handler = null){
                if(Array.isArray(shortcut)){
                    for(const item of shortcut){
                        this.register(item, handler);
                    }
                    return this;
                }

                const parts = shortcut.toLowerCase().split('+');
                this.shortcuts.set(shortcut, {
                    key: parts.pop(),
                    ctrl: parts.includes('ctrl') || parts.includes('control'),
                    shift: parts.includes('shift'),
                    alt: parts.includes('alt'),
                    meta: parts.includes('super') || parts.includes('meta') || parts.includes('cmd') || parts.includes('command'),
                    handler
                });
                return this;
            }

            unregister(shortcut){
                if(Array.isArray(shortcut)){
                    for(const item of shortcut){
                        this.unregister(item);
                    }
                    return this;
                }
                this.shortcuts.delete(shortcut);
                return this;
            }

            /**
             * Applies a map of keys to shortcuts.
             * @param {Object} mapping Mapping of shortcut to handler OR 
             * 
             * FIXME: Complexity is O(n^2)
             * 
             * @example
             * shortcutManager.map({
             *    "SAVE": "Ctrl+S"
             * });
             * 
             * shortcutManager.assign("SAVE", () => { ... });
             * 
             * // Later, you may want to customize the mapping:
             * shortcutManager.map({
             *    "SAVE": "Shift+S" // <= updates the previous mapping
             * });
             */
            map(mapping) {
                for(const [key, shortcut] of Object.entries(mapping)){
                    for(const [existingShortcut, data] of this.shortcuts.entries()){
                        if(data.handler === key){
                            this.unregister(existingShortcut);
                        }
                    }

                    this.register(shortcut, key);
                }
                return this;
            }

            /**
             * Assigns a handler for a key to later be mapped.
             * This is different from register() as it maps to a key instead of a hard-coded shortcut.
             * @param {string} key Key
             * @param {*} handler Callback
             */
            assign(key, handler) {
                this.mappings.set(key, handler);
                return this;
            }

            unassign(key) {
                this.mappings.delete(key);
                return this;
            }

            reset(){
                this.shortcuts.clear();
                this.mappings.clear();
                return this;
            }

            destroy(){
                this.reset();
                this.events.clear();
                this.target.removeEventListener('keydown', this.handler);
            }

            #handleKeyDown(event) {
                // Skip if user is typing in an input element
                const target = event.target;
                if (target && (
                    target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.tagName === 'SELECT' ||
                    target.isContentEditable
                )) {
                    return;
                }

                for (const shortcut of this.shortcuts.values()) {
                    if (this.#matchesShortcut(event, shortcut)) {
                        event.preventDefault();

                        this.emit('activated', [shortcut, event]);

                        const handler = (typeof shortcut.handler === 'function')? shortcut.handler: this.mappings.get(shortcut.handler);
                        if(typeof handler === 'function') {
                            handler(event, shortcut);
                            return;
                        }
                    }
                }
            }

            #matchesShortcut(event, shortcut) {
                if (shortcut.ctrl !== event.ctrlKey) return false;
                if (shortcut.shift !== event.shiftKey) return false;
                if (shortcut.alt !== event.altKey) return false;
                if (shortcut.meta !== event.metaKey) return false;

                const eventKey = event.key.toLowerCase();
                if (eventKey === shortcut.key) return true;

                if (shortcut.key === 'space' && event.code === 'Space') return true;
                if (shortcut.key === 'enter' && eventKey === 'enter') return true;
                if (shortcut.key === 'esc' && eventKey === 'escape') return true;
                if (shortcut.key === 'escape' && eventKey === 'escape') return true;

                return false;
            }
        }
    }

    new LS.EventHandler(LS);
    LS.SelectAll = LS.Tiny.Q;
    LS.Select = LS.Tiny.O;
    LS.Create = LS.Tiny.N;
    LS.Misc = LS.Tiny.M;

    /**
     * Color and theme utilities
     */
    LS.Color = class {
        constructor(r, g, b, a) {
            if (typeof r === "string") {

                // Hex
                if(r.charCodeAt(0) === 35) {
                    [r, g, b] = LS.Color.parseHex(r);
                }

                // RGB
                else if(r.startsWith("rgb(") || r.startsWith("rgba(")) {
                    let match = r.match(/rgba?\((\d+)\s*,?\s*(\d+)\s*,?\s*(\d+)(?:\s*,?\s*([0-9.]+))?\)/);

                    if(match) {
                        [r, g, b, a] = match.slice(1).map(Number);
                    } else {
                        throw new Error("Colour " + r + " could not be parsed.");
                    }
                }

                else {
                    if(!LS.Color.context) {
                        LS.Color._createProcessingCanvas();
                    }
                    
                    // canvas.width = canvas.height = 1;
                    LS.Color.context.fillStyle = r;

                    [r, g, b] = LS.Color.parseHex(LS.Color.context.fillStyle);
                }
            } else if (r instanceof LS.Color) {
                [r, g, b, a] = r.color;
            } else if (Array.isArray(r)) {
                [r, g, b, a] = r;
            }

            if (r === null || typeof r === "undefined" || isNaN(r)) r = 255;
            if (g === null || typeof g === "undefined" || isNaN(g)) g = 255;
            if (b === null || typeof b === "undefined" || isNaN(b)) b = 255;
            if (a === null || typeof a === "undefined" || isNaN(a)) a = 1;
    
            this.r = Math.round(Math.min(255, Math.max(0, r)));
            this.g = Math.round(Math.min(255, Math.max(0, g)));
            this.b = Math.round(Math.min(255, Math.max(0, b)));
            this.a = Math.min(1, Math.max(0, a));
        }

        static {
            this._events = new LS.EventHandler(this);

            this.colors = new Map;
            this.themes = new Set(["light", "dark", "amoled"]);

            // Style tag to manage
            this.style = LS.Tiny.N("style", {id: "ls-colors"});

            LS.once("body-available", ()=>{
                document.head.appendChild(this.style)
            })

            Object.defineProperties(this, {
                lightModePreffered: {
                    get(){
                        return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
                    }
                }
            })

            if(window.matchMedia) {
                window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', thing => {
                    this.emit("scheme-changed", [thing.matches])
                })
            }
        }

        get int(){
            return (this.r << 16) | (this.g << 8) | this.b;
        }

        get hexInt() {
            return 1 << 24 | this.r << 16 | this.g << 8 | this.b
        }

        get hex() {
            return "#" + this.hexInt.toString(16).slice(1);
        }
    
        get rgb() {
            return `rgb(${this.r}, ${this.g}, ${this.b})`;
        }
    
        get rgba() {
            return `rgba(${this.r}, ${this.g}, ${this.b}, ${this.a})`;
        }
    
        get hsl() {
            let r = this.r / 255;
            let g = this.g / 255;
            let b = this.b / 255;
    
            let max = Math.max(r, g, b);
            let min = Math.min(r, g, b);
    
            let l = (max + min) / 2;
            let h, s;
    
            if (max === min) {
                h = s = 0;
            } else {
                let delta = max - min;
                s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    
                switch (max) {
                    case r:
                        h = (g - b) / delta + (g < b ? 6 : 0);
                        break;
                    case g:
                        h = (b - r) / delta + 2;
                        break;
                    case b:
                        h = (r - g) / delta + 4;
                        break;
                }
                h /= 6;
            }
    
            h = Math.round(h * 360);
            s = Math.round(s * 100);
            l = Math.round(l * 100);
    
            return [h, s, l];
        }
    
        get color() {
            return [this.r, this.g, this.b, this.a];
        }
    
        get pixel() {
            return [this.r, this.g, this.b, this.a * 255];
        }
    
        get brightness() {
            return Math.sqrt(
                0.299 * (this.r * this.r) +
                0.587 * (this.g * this.g) +
                0.114 * (this.b * this.b)
            );
        }
    
        get isDark() {
            return this.brightness < 127.5;
        }
    
        hue(hue) {
            let [h, s, l] = this.hsl;
            l = Math.max(Math.min(hue, 360), 0);
            return LS.Color.fromHSL(h, s, l);
        }
    
        saturation(percent) {
            let [h, s, l] = this.hsl;
            s = Math.max(Math.min(percent, 100), 0);
            return LS.Color.fromHSL(h, s, l);
        }

        lightness(percent) {
            let [h, s, l] = this.hsl;
            l = Math.max(Math.min(percent, 100), 0);
            return LS.Color.fromHSL(h, s, l);
        }

        tone(hue, saturation, lightness) {
            let [h, s, l] = this.hsl;
            return LS.Color.fromHSL(hue || h, (s / 100) * saturation, lightness);
        }

        lighten(percent) {
            let [h, s, l] = this.hsl;
            l = Math.max(Math.min(l + percent, 100), 0);
            return LS.Color.fromHSL(h, s, l);
        }

        saturate(percent) {
            let [h, s, l] = this.hsl;
            s = Math.max(Math.min(s + percent, 100), 0);
            return LS.Color.fromHSL(h, s, l);
        }

        darken(percent) {
            let [h, s, l] = this.hsl;
            l = Math.max(Math.min(l - percent, 100), 0);
            return LS.Color.fromHSL(h, s, l);
        }

        hueShift(deg) {
            let [h, s, l] = this.hsl;
            h = (h + deg) % 360;
            return LS.Color.fromHSL(h, s, l);
        }

        multiply(r2, g2, b2, a2) {
            let color = new LS.Color(r2, g2, b2, a2).color;
            return new LS.Color(this.r * color[0], this.g * color[1], this.b * color[2], this.a * color[3]);
        }

        divide(r2, g2, b2, a2) {
            let color = new LS.Color(r2, g2, b2, a2).color;
            return new LS.Color(this.r / color[0], this.g / color[1], this.b / color[2], this.a / color[3]);
        }

        add(r2, g2, b2, a2) {
            let color = new LS.Color(r2, g2, b2, a2).color;
            return new LS.Color(this.r + color[0], this.g + color[1], this.b + color[2], this.a + color[3]);
        }

        mix(anotherColor, weight = 0.5) {
            let r = Math.round(this.r * (1 - weight) + anotherColor.r * weight);
            let g = Math.round(this.g * (1 - weight) + anotherColor.g * weight);
            let b = Math.round(this.b * (1 - weight) + anotherColor.b * weight);
            let a = this.a * (1 - weight) + anotherColor.a * weight;
            return new LS.Color(r, g, b, a);
        }

        subtract(r2, g2, b2, a2) {
            let color = new LS.Color(r2, g2, b2, a2).color;
            return new LS.Color(this.r - color[0], this.g - color[1], this.b - color[2], this.a - color[3]);
        }

        alpha(v) {
            return new LS.Color(this.r, this.g, this.b, v);
        }

        static parseHex(hex) {
            if(hex.length < 4 || hex.length > 9) {
                throw new Error("Invalid hex string");
            }

            if (hex.length <= 5) {
                return [ parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16), parseInt(hex[3] + hex[3], 16), hex.length === 5? parseInt(hex[4] + hex[4], 16) / 255: 1 ];
            } else {
                return [ parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), hex.length === 9? parseInt(hex.slice(7, 9), 16) / 255: 1 ];
            }
        }

        static fromHSL(h, s, l) {
            s /= 100;
            l /= 100;
    
            let k = n => (n + h / 30) % 12,
                a = s * Math.min(l, 1 - l),
                f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    
            return new LS.Color(255 * f(0), 255 * f(8), 255 * f(4));
        }

        static random() {
            return new LS.Color(Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256));
        }

        static trueRandom() {
            return new LS.Color([...crypto.getRandomValues(new Uint8Array(3))]);
        }

        static get theme(){
            return document.body.getAttribute("ls-theme")
        }

        static set theme(theme){
            this.setTheme(theme)
        }

        static get accent(){
            return document.body.getAttribute("ls-accent")
        }

        static set accent(color){
            this.setAccent(color)
        }

        static generate(r, g, b) {
            let color = (r instanceof LS.Color)? r: new LS.Color(r, g, b), style = "";

            for(let i of [10, 20, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90, 95]){
                style += `--accent-${i}:${color.lightness(i).hex};`;
            }

            for(let i of [6, 8, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 98]){
                style += `--base-${i}:${color.tone(null, 12, i).hex};`; 
            }

            return style
        }

        static add(name, r, g, b){
            if(this.colors.has(name)) return false;
            return this.update(name, r, g, b);
        }

        static update(name, r, g, b){
            let accent = this.colors.get(name);
            const color = (r instanceof LS.Color)? r: new LS.Color(r, g, b);

            if(!accent) {
                accent = {}
                this.colors.set(name, accent);
            }

            let style = `[ls-accent="${name}"]{${this.generate(color)}}`;

            accent.color = color;

            if(!accent.style){
                accent.style = document.createTextNode(style);
                this.style.appendChild(accent.style);
            } else {
                accent.style.textContent = style;
            }

            return accent
        }

        static apply(element, r, g, b){
            let color = (r instanceof LS.Color)? r: new LS.Color(r, g, b);
            element.style = (element.style? element.style: "") + this.generate(color);
            element.setAttribute("ls-accent", "");
        }

        static remove(name){
            let color = this.colors.get(name);

            if(!color) return false;

            this.style.removeChild(color.style);
            this.colors.delete(name);
        }

        static setAccent(accent){
            document.body.setAttribute("ls-accent", accent);
            return this
        }

        static setTheme(theme){
            document.body.setAttribute("ls-theme", theme);
            document.body.classList.add("no-transitions");
            this.emit("theme-changed", [theme]);
            setTimeout(() => {
                document.body.classList.remove("no-transitions");
            }, 0);
            return this
        }

        static setAdaptiveTheme(amoled){
            LS.Color.setTheme(localStorage.getItem("ls-theme") || (this.lightModePreffered? "light": amoled? "amoled" : "dark"));
            return this
        }

        static autoScheme(amoled){
            LS.once("body-available", () => {
                this.setAdaptiveTheme(amoled);
                this.on("scheme-changed", () => this.setAdaptiveTheme())
            })
            return this
        }

        static all(){
            return this.colors.keys()
        }

        static random(){
            return new LS.Color(Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256))
        }

        static andomAccent(){
            let colors = this.all();
            return colors[Math.floor(Math.random() * colors.length)];
        }

        static fromImage(image, sampleGap = 16, maxResolution = 200){
            if(!(image instanceof HTMLImageElement)) {
                throw new TypeError("The first argument must be an image element");
            }

            sampleGap += sampleGap % 4;

            let pixelIndex = -4,
                sum = [0, 0, 0],
                sampleCount = 0
            ;

            if(!LS.Color.canvas) {
                LS.Color._createProcessingCanvas();
            }

            // Set willReadFrequently for better performance on some browsers
            if (LS.Color.context && LS.Color.context.getImageData) {
                LS.Color.context.willReadFrequently = true;
            }

            if (!LS.Color.context) return new LS.Color(0, 0, 0);

            const scale = Math.min(1, maxResolution / Math.max(image.naturalWidth, image.naturalHeight));

            LS.Color.canvas.width = Math.ceil(image.naturalWidth * scale);
            LS.Color.canvas.height = Math.ceil(image.naturalHeight * scale);

            LS.Color.context.drawImage(image, 0, 0, LS.Color.canvas.width, LS.Color.canvas.height);

            let imageData;
            try {
                imageData = LS.Color.context.getImageData(0, 0, LS.Color.canvas.width, LS.Color.canvas.height);
            } catch (error) {
                console.error(error);
                return new LS.Color(0, 0, 0);
            }

            for (let i = imageData.data.length; (pixelIndex += sampleGap) < i; ) {
                ++sampleCount
                sum[0] += imageData.data[pixelIndex]
                sum[1] += imageData.data[pixelIndex + 1]
                sum[2] += imageData.data[pixelIndex + 2]
            }
        
            return new LS.Color((sum[0] = ~~(sum[0] / sampleCount)), (sum[1] = ~~(sum[1] / sampleCount)), (sum[2] = ~~(sum[2] / sampleCount)));
        }

        static _createProcessingCanvas() {
            if(!LS.Color.canvas) {
                const canvas = document.createElement('canvas');
                LS.Color.canvas = canvas;
                LS.Color.context = canvas.getContext('2d');
            }
        }
    }

    if(LS.isWeb){
        LS.Tiny.M.on("keydown", event => {
            M.lastKey = event.key;
            if(event.key == "Shift") LS.Tiny.M.ShiftDown = true;
            if(event.key == "Control") LS.Tiny.M.ControlDown = true;
        })

        LS.Tiny.M.on("keyup", event => {
            LS.Tiny.M.lastKey = event.key;
            if(event.key == "Shift") LS.Tiny.M.ShiftDown = false;
            if(event.key == "Control") LS.Tiny.M.ControlDown = false;
        })

        LS.Tiny.M.on("mousedown", () => LS.Tiny.M.mouseDown = true)
        LS.Tiny.M.on("mouseup", () => LS.Tiny.M.mouseDown = false)
    }

    return LS

});