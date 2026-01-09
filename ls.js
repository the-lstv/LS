/*
    Author: Lukas (thelstv)
    Copyright: (c) https://lstv.space

    Last modified: 2026
    License: GPL-3.0
    Version: 5.2.8
    See: https://github.com/thelstv/LS
*/

(exports => {
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
        const global = typeof window !== 'undefined'? window : globalThis;
        global.LS = instance;

        if(!window.LS_DEFER_INIT){
            instance.init({
                globalizeTiny: window.LS_DONT_GLOBALIZE_TINY !== true,
                globalPrototype: window.ls_do_not_prototype !== true
            });
        }

        function bodyAvailable(){
            instance._events.completed("body-available", [document.body]);
        }

        if(document.body) bodyAvailable(); else window.addEventListener("DOMContentLoaded", bodyAvailable);
    }

    return instance;
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

            let event = this.events.get(name);
            if(!event) {
                event = { listeners: [], empty: [], ...options, _isEvent: true };
                this.events.set(name, event);
            } else if(options){
                Object.assign(event, options);
            }

            return event;
        }

        on(name, callback, options){
            const event = (name._isEvent? name: this.events.get(name)) || this.prepareEvent(name);
            if(event.completed) {
                if(event.data) callback(...event.data); else callback();
                if(options && options.once) return this;
            }

            const index = event.empty.length > 0 ? event.empty.pop() : event.listeners.length;

            event.listeners[index] = { callback, index, ...options };
            return this;
        }

        off(name, callback){
            const event = name._isEvent? name: this.events.get(name);
            if(!event) return;

            for(let i = 0; i < event.listeners.length; i++){
                if(event.listeners[i].callback === callback) {
                    event.empty.push(i);
                    event.listeners[i] = null;
                }
            }

            return this;
        }

        once(name, callback, options){
            return this.on(name, callback, Object.assign(options || {}, { once: true }));
        }

        /**
         * @deprecated To be removed in 5.3.0
        */
        invoke(name, ...data){
            return this.emit(name, data, { results: true });
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

            return returnData;
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

    let initialized = false;
    const LS = {
        isWeb: typeof window !== 'undefined',
        version: "5.2.8-beta",
        v: 5,

        REMOVE_LISTENER: Symbol("event-remove"),

        init(options) {
            if(!this.isWeb) return;
            if(initialized) {
                console.warn("LS has already been initialized, this attempt has been ignored.");
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
            if(options.theme) this.Color.setTheme(options.theme);
            if(options.accent) this.Color.setAccent(options.accent);
            if(options.autoScheme) this.Color.autoScheme(options.adaptiveTheme);
            if(options.globalizeTiny) {
                /**
                 * @deprecated
                 */
                for (let key in this.Tiny){
                    window[key] = this.Tiny[key];
                }
            }

            this._topLayer = this.Create({id: "ls-top-layer", style: {
                position: "fixed"
            }});

            LS.once("body-available", () => {
                document.body.append(this._topLayer);
            });

            LS._events.completed("init");
        },

        EventHandler,

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
                    ? { innerHTML: content }
                    : Array.isArray(content)
                        ? { inner: content }
                        : content || {};

            if(tagName === "svg" && !content.hasOwnProperty("ns")) {
                content.ns = "http://www.w3.org/2000/svg";
            }

            const { class: className, tooltip, ns, accent, style, inner, content: innerContent, reactive, attr, options, attributes, ...rest } = content;

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
                            return LS.REMOVE_LISTENER;
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
            if (contentToAdd) element.append(...LS.Util.resolveElements(contentToAdd));

            return element;
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
             * Replaced by LS.Create
             */
            N: null, // Defined later by LS.Create for backward compatibility

            /**
             * Color utilities
             * @deprecated Use LS.Color instead
             */
            C(r, g, b, a = 1){
                return new LS.Color(r, g, b, a)
            },

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
                        const scriptElement = LS.Tiny.N("script", {
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

        Util: {
            resolveElements(...array){
                return array.flat().filter(Boolean).map(element => {
                    return typeof element === "string" ? document.createTextNode(element) : typeof element === "object" && !(element instanceof Node) ? LS.Create(element) : element;
                });
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

            /**
             * Gets URL parameters as an object or a specific parameter by name.
             * From my testing, this is 3.5x faster than URLSearchParams for all parameters and 11x faster to get a single parameter.
             * https://jsbm.dev/pNp6dNGXZY1j1
             * 
             * @param {string|null} get Name of the parameter to get, or null to get all parameters as an object.
             * @param {string} baseUrl URL or search string to parse, defaults to current location's search string.
             * @returns {object|string|null} Object with all parameters, specific parameter value, or null if not found.
             */
            params(get = null, baseUrl = typeof location !== "undefined" ? location.search : ""){
                const index = baseUrl.indexOf('?');
                const url = baseUrl.slice(index + 1);
                if(!url.length){
                    return get? null : {}
                }

                let i = 0, vi = 0, cparam = null, result = get ? null : {};
                for(; i < url.length; i++){
                    const char = url.charCodeAt(i);
                    const atEnd = i === url.length - 1;
                    const isDelimiter = char === 61 || char === 38 || char === 35; // =, &, #

                    if(isDelimiter || atEnd){
                        const sliceEnd = (atEnd && !isDelimiter) ? i + 1 : i;
                        const param = url.slice(vi, sliceEnd);

                        if((char === 38 || (atEnd && !isDelimiter) || char === 35) && cparam !== null){ // &, end, #
                            const value = decodeURIComponent(param);
                            if(get && cparam === get) return value;
                            if(!get) result[cparam] = value;
                            cparam = null;
                            vi = i + 1;
                            if(char === 35) break;
                            continue;
                        }

                        if(param.length !== 0) {
                            if(!get) result[param] = "";
                            cparam = param;
                            vi = i + 1;
                        }

                        if(char === 35){ // #
                            break;
                        }
                    }
                }

                return get? null : result;
            },

            TouchHandle: class TouchHandle extends EventHandler {
                constructor(element, options = {}) {
                    super();

                    this.element = LS.Tiny.O(element);
                    if (!this.element) throw "Invalid handle!";

                    this.options = {
                        buttons: [0, 1, 2],
                        disablePointerEvents: true,
                        frameTimed: false,
                        legacyEvents: false,
                        ...options
                    };

                    this._cursor = this.options.cursor || null;
                    this.seeking = false;
                    this.attached = false;
                    this.pointerLockActive = false;
                    this.pointerLockPreviousX = 0;
                    this.pointerLockPreviousY = 0;
                    this.dragTarget = null;
                    this.frameQueued = false;
                    this.latestMoveEvent = null;

                    this._moveEventRef = this.prepareEvent("move");

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

                attach() {
                    if(this.attached) return;

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

                    this.attached = true;
                }

                detach(destorying = false) {
                    if (this.attached) {
                        this.onRelease(destorying? { type: "destroy" } : {});

                        if (this.element) {
                            this.element.removeEventListener("mousedown", this.onStart);
                            this.element.removeEventListener("touchstart", this.onStart);
                            if (this.options.startEvents) {
                                for (const evt of this.options.startEvents) {
                                    this.element.removeEventListener(evt, this.onStart);
                                }
                            }
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
                        } else if (event.target !== this.element) {
                            return;
                        }
                    }

                    if (event.type === "mousedown" && !this.options.buttons.includes(event.button)) return;

                    this.seeking = true;
                    this._eventData.cancelled = false;

                    const isTouch = event.type === "touchstart";
                    const x = isTouch ? event.touches[0].clientX : event.clientX;
                    const y = isTouch ? event.touches[0].clientY : event.clientY;

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
                    if (event.cancelable && event.type !== "touchstart") event.preventDefault();

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
                    if (this._eventData.cancelled) return;

                    if (this.options.frameTimed) {
                        this.latestMoveEvent = event;
                        if (!this.frameQueued) {
                            this.frameQueued = true;
                            requestAnimationFrame(this.frameHandler);
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
                    const isTouch = event.type === "touchmove";
                    if (!isTouch && event.cancelable) event.preventDefault();

                    let x, y;
                    const prevX = this._eventData.x;
                    const prevY = this._eventData.y;

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

                    if (this.options.legacyEvents) {
                        if (this.options.onMove) this.options.onMove(x, y, event, this.cancel);
                        this.emit(this._moveEventRef, [x, y, event, this.cancel]);
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
                        this.emit(this._moveEventRef, [this._eventData]);
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

                    this._eventData.domEvent = null;
                }

                cancel() {
                    this._eventData.cancelled = true;
                }

                onPointerLockChange() {
                    this.pointerLockActive = document.pointerLockElement === this.element;
                }

                cleanupDragState() {
                    this.seeking = false;
                    this._eventData.cancelled = false;
                    this.frameQueued = false;
                    this.latestMoveEvent = null;

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

                    this.detach(true);
                    this._moveEventRef = null;
                    this.events.clear();
                    this.element = null;
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
                            this._rafId = requestAnimationFrame(this.#frame);
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
         * Similar behavior as LS.Create, but compiles into a direct optimized function for repeated use.
         * Useful if you have a medium/large structure you expect to create many times and want direct access to its elements.
         * **Not** useful if you intend to do this once ever, it will be slower than LS.Create.
         * @experimental Very experimental
         * 
         * @param {Function|Array|Object|string} templateBuilder A function that returns a template array/object/string or a template array/object/string directly.
         */
        CompileTemplate(templateBuilder, asString = false) {
            const symbolProxy = LS.CompileTemplate.SYMBOL_PROXY || (LS.CompileTemplate.SYMBOL_PROXY = new Proxy({}, {
                get(target, prop) {
                    return Symbol(prop);
                }
            }));

            const If = (condition, thenValue, elseValue) => {
                const node = {
                    __lsIf: true,
                    branches: [{ condition, value: thenValue }],
                    hasElse: typeof elseValue !== "undefined",
                    elseValue
                };

                node.elseIf = (cond, value) => {
                    node.branches.push({ condition: cond, value });
                    return node;
                };

                node.else = (value) => {
                    node.hasElse = true;
                    node.elseValue = value;
                    return node;
                };

                return node;
            };

            let template = typeof templateBuilder === "function" ? templateBuilder(symbolProxy, (name, input) => {
                input.__exportName = name;
                return input;
            }, If) : templateBuilder;

            if (!Array.isArray(template)) {
                template = [template];
            }

            const lines = [];
            let varCounter = 0;
            const exports = [];

            function stripWhitespace(value) {
                return (value ?? "").toString().replace(/\s+/g, "");
            }

            function dataRef(sym) {
                const key = stripWhitespace(sym && sym.description);
                return `d.${key.replace(/[^a-zA-Z0-9_$.]/g, "_").replace(/\.\.*/g, ".")}`;
            }

            function jsValue(value) {
                if (typeof value === "symbol") return dataRef(value);
                if (value === undefined) return "undefined";
                return JSON.stringify(value);
            }

            function isIfNode(value) {
                return !!(value && typeof value === "object" && value.__lsIf);
            }

            function containsConditional(value) {
                if (isIfNode(value)) return true;
                if (Array.isArray(value)) return value.some(containsConditional);
                return false;
            }

            function textNodeExpr(value) {
                return `document.createTextNode(${jsValue(value)})`;
            }

            function conditionExpr(condition) {
                return `!!(${jsValue(condition)})`;
            }

            function getVarName() {
                return `e${varCounter++}`;
            }

            function emitToArray(arrayVar, value) {
                if (value === null || value === undefined) return;

                if (isIfNode(value)) {
                    const branches = value.branches || [];
                    if (branches.length > 0) {
                        lines.push(`if(${conditionExpr(branches[0].condition)}){`);
                        emitToArray(arrayVar, branches[0].value);
                        for (let i = 1; i < branches.length; i++) {
                            lines.push(`}else if(${conditionExpr(branches[i].condition)}){`);
                            emitToArray(arrayVar, branches[i].value);
                        }
                        if (value.hasElse) {
                            lines.push(`}else{`);
                            emitToArray(arrayVar, value.elseValue);
                        }
                        lines.push(`}`);
                    } else if (value.hasElse) {
                        emitToArray(arrayVar, value.elseValue);
                    }
                    return;
                }

                if (Array.isArray(value)) {
                    // Nested array is treated as a div wrapper
                    const wrapperVar = getVarName();
                    lines.push(`var ${wrapperVar}=document.createElement("div");`);
                    for (const v of value) emitToElement(wrapperVar, v);
                    lines.push(`${arrayVar}.push(${wrapperVar});`);
                    return;
                }

                if (typeof value === "string" || typeof value === "symbol" || typeof value === "number" || typeof value === "boolean") {
                    lines.push(`${arrayVar}.push(${textNodeExpr(value)});`);
                    return;
                }

                if (typeof value !== "object") return;

                const nodeVar = processItem(value);
                if (nodeVar) lines.push(`${arrayVar}.push(${nodeVar});`);
            }

            function emitToElement(parentVar, value) {
                if (value === null || value === undefined) return;

                if (isIfNode(value)) {
                    const branches = value.branches || [];
                    if (branches.length > 0) {
                        lines.push(`if(${conditionExpr(branches[0].condition)}){`);
                        emitToElement(parentVar, branches[0].value);
                        for (let i = 1; i < branches.length; i++) {
                            lines.push(`}else if(${conditionExpr(branches[i].condition)}){`);
                            emitToElement(parentVar, branches[i].value);
                        }
                        if (value.hasElse) {
                            lines.push(`}else{`);
                            emitToElement(parentVar, value.elseValue);
                        }
                        lines.push(`}`);
                    } else if (value.hasElse) {
                        emitToElement(parentVar, value.elseValue);
                    }
                    return;
                }

                if (Array.isArray(value)) {
                    // Nested array is treated as a div wrapper
                    const wrapperVar = getVarName();
                    lines.push(`var ${wrapperVar}=document.createElement("div");`);
                    for (const v of value) emitToElement(wrapperVar, v);
                    lines.push(`${parentVar}.appendChild(${wrapperVar});`);
                    return;
                }

                if (typeof value === "string" || typeof value === "symbol" || typeof value === "number" || typeof value === "boolean") {
                    lines.push(`${parentVar}.appendChild(${textNodeExpr(value)});`);
                    return;
                }

                if (typeof value !== "object") return;

                const nodeVar = processItem(value);
                if (nodeVar) lines.push(`${parentVar}.appendChild(${nodeVar});`);
            }

            function processItem(item, assignTo = null) {
                // Text node
                if (typeof item === "symbol" || typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
                    if (assignTo) {
                        lines.push(`var ${assignTo}=document.createTextNode(${jsValue(item)});`);
                        return assignTo;
                    }
                    return `document.createTextNode(${jsValue(item)})`;
                }

                // Skip invalid items
                if (typeof item !== "object" || item === null) {
                    return null;
                }

                if (isIfNode(item)) {
                    throw new Error("CompileTemplate error: conditional nodes (If) must be used as children/root values, not as an element object.");
                }

                if (typeof Element !== "undefined" && item instanceof Element) {
                    throw new Error("CompileTemplate error: you can't pass a live Element to a template.");
                }

                const {
                    tag, tagName: tn, __exportName,
                    class: className, tooltip, ns, accent, style,
                    inner, content: innerContent, reactive,
                    attr, options, attributes,
                    ...rest
                } = item;

                const tagName = tag || tn || "div";
                const varName = assignTo || getVarName();
                const needsExport = !!__exportName;

                // Create element
                if (ns) {
                    lines.push(`var ${varName}=document.createElementNS(${JSON.stringify(ns)},${JSON.stringify(tagName)});`);
                } else {
                    lines.push(`var ${varName}=document.createElement(${JSON.stringify(tagName)});`);
                }

                // Track exports
                if (needsExport) {
                    exports.push({ name: __exportName, varName });
                }

                // Apply direct properties (innerHTML, textContent, id, etc.)
                for (const [key, value] of Object.entries(rest)) {
                    if (typeof value === "function") {
                        // Skip functions - they can't be serialized
                        console.warn(`CompileTemplate: function property "${key}" will be ignored`);
                    } else if (value !== null && value !== undefined) {
                        lines.push(`${varName}.${key}=${jsValue(value)};`);
                    }
                }

                // Handle accent attribute
                if (accent) {
                    lines.push(`${varName}.setAttribute("ls-accent",${jsValue(accent)});`);
                }

                // Handle tooltip
                if (tooltip) {
                    lines.push(`${varName}.setAttribute("ls-tooltip",${jsValue(tooltip)});`);
                }

                // Handle reactive bindings
                if (reactive) {
                    lines.push(`if(!LS.Reactive){LS.on&&LS.on("component-loaded",(c)=>{if(c&&c.name&&c.name.toLowerCase&&c.name.toLowerCase()==="reactive"){LS.Reactive.bindElement(${varName},${jsValue(reactive)});return LS.REMOVE_LISTENER;}});}else{LS.Reactive.bindElement(${varName},${jsValue(reactive)});}`);
                }

                // Handle attributes
                const attrs = attr || attributes;
                if (attrs) {
                    if (Array.isArray(attrs)) {
                        for (const a of attrs) {
                            if (typeof a === "string") {
                                lines.push(`${varName}.setAttribute(${JSON.stringify(a)},"");`);
                            } else if (typeof a === "object" && a !== null) {
                                for (const [aKey, aValue] of Object.entries(a)) {
                                    lines.push(`${varName}.setAttribute(${JSON.stringify(aKey)},${jsValue(aValue ?? "")});`);
                                }
                            }
                        }
                    } else if (typeof attrs === "object") {
                        for (const [aKey, aValue] of Object.entries(attrs)) {
                            lines.push(`${varName}.setAttribute(${JSON.stringify(aKey)},${jsValue(aValue ?? "")});`);
                        }
                    }
                }

                // Handle className
                if (className) {
                    if (Array.isArray(className)) {
                        lines.push(`${varName}.className=${JSON.stringify(className.filter(Boolean).join(" "))};`);
                    } else {
                        lines.push(`${varName}.className=${jsValue(className)};`);
                    }
                }

                // Handle style
                if (style) {
                    if (typeof style === "string") {
                        lines.push(`${varName}.style.cssText=${JSON.stringify(style)};`);
                    } else if (typeof style === "object") {
                        const styleEntries = Object.entries(style);
                        if (styleEntries.length > 0) {
                            const staticParts = [];
                            const dynamicParts = [];

                            for (const [rule, value] of styleEntries) {
                                const prop = rule.startsWith("--") ? rule : rule.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
                                if (typeof value === "symbol") {
                                    dynamicParts.push({ prop, value });
                                } else {
                                    staticParts.push(`${prop}:${value}`);
                                }
                            }

                            if (dynamicParts.length === 0) {
                                lines.push(`${varName}.style.cssText=${JSON.stringify(staticParts.join(";"))};`);
                            } else if (staticParts.length === 0) {
                                const parts = dynamicParts.map(d => `${JSON.stringify(d.prop + ":")}+${dataRef(d.value)}`);
                                lines.push(`${varName}.style.cssText=${parts.join('+";"+')};`);
                            } else {
                                const dynamicExprs = dynamicParts.map(d => `${JSON.stringify(";" + d.prop + ":")}+${dataRef(d.value)}`);
                                lines.push(`${varName}.style.cssText=${JSON.stringify(staticParts.join(";"))}+${dynamicExprs.join("+")};`);
                            }
                        }
                    }
                }

                // Handle ls-select options
                if (tagName.toLowerCase() === "ls-select" && options) {
                    lines.push(`${varName}._lsSelectOptions=${jsValue(options)};`);
                }

                // Handle children
                const contentToAdd = inner || innerContent;
                if (contentToAdd !== undefined && contentToAdd !== null) {
                    // Simple text content optimization
                    if (typeof contentToAdd === "symbol" || typeof contentToAdd === "string") {
                        lines.push(`${varName}.textContent=${jsValue(contentToAdd)};`);
                    } else if (typeof contentToAdd === "number") {
                        lines.push(`${varName}.textContent=${JSON.stringify(String(contentToAdd))};`);
                    } else {
                        const children = Array.isArray(contentToAdd) ? contentToAdd : [contentToAdd];
                        const validChildren = children.filter(c => c !== null && c !== undefined);
                        const hasConditional = validChildren.some(containsConditional);

                        if (hasConditional) {
                            for (const child of validChildren) {
                                emitToElement(varName, child);
                            }
                        } else {
                            if (validChildren.length === 1) {
                                const child = validChildren[0];
                                if (typeof child === "string" || typeof child === "symbol") {
                                    const childExpr = processItem(child);
                                    if (childExpr) {
                                        lines.push(`${varName}.appendChild(${childExpr});`);
                                    }
                                } else if (Array.isArray(child)) {
                                    // Nested array as child - treat as div wrapper
                                    emitToElement(varName, child);
                                } else {
                                    const childVar = processItem(child);
                                    if (childVar) {
                                        lines.push(`${varName}.appendChild(${childVar});`);
                                    }
                                }
                            } else if (validChildren.length > 1) {
                                const childRefs = [];
                                for (const child of validChildren) {
                                    if (typeof child === "string" || typeof child === "symbol") {
                                        const expr = processItem(child);
                                        if (expr) childRefs.push(expr);
                                    } else if (Array.isArray(child)) {
                                        // Nested array - create wrapper and add as variable
                                        const wrapperVar = getVarName();
                                        lines.push(`var ${wrapperVar}=document.createElement("div");`);
                                        for (const v of child) emitToElement(wrapperVar, v);
                                        childRefs.push(wrapperVar);
                                    } else {
                                        const childVar = processItem(child);
                                        if (childVar) childRefs.push(childVar);
                                    }
                                }
                                if (childRefs.length > 0) {
                                    lines.push(`${varName}.append(${childRefs.join(",")});`);
                                }
                            }
                        }
                    }
                }

                return varName;
            }

            // Check if root structure is known at compile time (no conditionals at root level)
            const rootHasConditional = template.some(containsConditional);

            if (rootHasConditional) {
                // Build root as a runtime array so conditionals can decide output
                lines.push(`var __root=[];`);
                for (const item of template) {
                    emitToArray(`__root`, item);
                }
                lines.push(`var __rootValue=__root.length===1?__root[0]:__root;`);
            } else {
                // Root is known at compile time
                if (template.length === 1) {
                    const item = template[0];
                    if (Array.isArray(item)) {
                        // Single nested array at root - wrap in div
                        const wrapperVar = getVarName();
                        lines.push(`var ${wrapperVar}=document.createElement("div");`);
                        for (const v of item) emitToElement(wrapperVar, v);
                        lines.push(`var __rootValue=${wrapperVar};`);
                    } else if (typeof item === "string" || typeof item === "symbol") {
                        lines.push(`var __rootValue=${textNodeExpr(item)};`);
                    } else {
                        const rootVar = processItem(item);
                        lines.push(`var __rootValue=${rootVar};`);
                    }
                } else if (template.length > 1) {
                    const rootRefs = [];
                    for (const item of template) {
                        if (Array.isArray(item)) {
                            const wrapperVar = getVarName();
                            lines.push(`var ${wrapperVar}=document.createElement("div");`);
                            for (const v of item) emitToElement(wrapperVar, v);
                            rootRefs.push(wrapperVar);
                        } else if (typeof item === "string" || typeof item === "symbol") {
                            const nodeVar = getVarName();
                            lines.push(`var ${nodeVar}=${textNodeExpr(item)};`);
                            rootRefs.push(nodeVar);
                        } else {
                            const nodeVar = processItem(item);
                            if (nodeVar) rootRefs.push(nodeVar);
                        }
                    }
                    lines.push(`var __rootValue=[${rootRefs.join(",")}];`);
                } else {
                    lines.push(`var __rootValue=null;`);
                }
            }

            // Build return object
            const retParts = [];
            for (const exp of exports) {
                retParts.push(`${JSON.stringify(exp.name)}:${exp.varName}`);
            }

            retParts.push(`root:__rootValue`);

            lines.push(`return{${retParts.join(",")}};`);

            const fnBody = `'use strict';${lines.join("")}`;

            // For static/inline compiling
            if (asString) return `function(d){${fnBody}}`;

            try {
                return new Function("d", fnBody);
            } catch (e) {
                console.error("CompileTemplate error:", e, "\nGenerated code:", fnBody);
                throw e;
            }
        },

        components: new Map,

        Component: class Component extends EventHandler {
            constructor(){
                super();

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
            return component;
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
                    key: parts.find(part => !['ctrl', 'control', 'shift', 'alt', 'super', 'meta', 'cmd', 'command'].includes(part)),
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

            triggerMapping(key) {
                const handler = this.mappings.get(key);
                if (typeof handler === 'function') {
                    handler();
                    return true;
                }
                return false;
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
                return false;
            }
        }
    }

    new LS.EventHandler(LS);

    LS.SelectAll = LS.Tiny.Q;
    LS.Select = LS.Tiny.O;
    LS.Misc = LS.Tiny.M;

    // Backward compatibility
    LS.Tiny.N = LS.Create;

    /**
     * Extensive color library and theme utilities
     */
    LS.Color = class Color {
        constructor(r, g, b, a) {
            if (r && (r instanceof Uint8Array || r instanceof Uint8ClampedArray || r instanceof ArrayBuffer)) {
                this.data = (r instanceof ArrayBuffer) ? new Uint8Array(r) : r;
                this.offset = (typeof g === "number") ? g : 0;
                return;
            }

            // this.data = new Uint8Array(4);
            // this.offset = 0;
            // this.data[3] = 255;
            this.data = [0, 0, 0, 255];
            this.offset = 0;

            if (typeof r !== "undefined") {
                LS.Color.parse(r, g, b, a, this.data, this.offset);
            }
        }

        static {
            this.events = new LS.EventHandler(this);

            this.colors = new Map;
            this.themes = new Set([ "light", "dark", "amoled" ]);

            if(LS.isWeb) {
                // Style tag to manage
                this.style = LS.Create("style", { id: "ls-colors" });

                LS.once("body-available", () => {
                    document.head.appendChild(this.style)
                });

                if(window.matchMedia) {
                    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', thing => {
                        this.emit("scheme-changed", [thing.matches]);
                    });
                }
            }
        }

        // Direct Buffer Access
        get r() { return this.data[this.offset] }
        set r(value) { this.data[this.offset] = value }

        get g() { return this.data[this.offset + 1] }
        set g(value) { this.data[this.offset + 1] = value }

        get b() { return this.data[this.offset + 2] }
        set b(value) { this.data[this.offset + 2] = value }

        get a() { return this.data[this.offset + 3] / 255 }
        set a(value) { this.data[this.offset + 3] = Math.round(value * 255) }

        get int(){
            return ((this.data[this.offset] << 16) | (this.data[this.offset + 1] << 8) | this.data[this.offset + 2]) >>> 0;
        }

        get hexInt() {
            return (this.data[this.offset] << 16) | (this.data[this.offset + 1] << 8) | this.data[this.offset + 2] | (1 << 24);
        }

        get hex() {
            return "#" + this.hexInt.toString(16).slice(1);
        }

        get rgb() {
            return `rgb(${this.data[this.offset]}, ${this.data[this.offset + 1]}, ${this.data[this.offset + 2]})`;
        }

        get rgba() {
            return `rgba(${this.data[this.offset]}, ${this.data[this.offset + 1]}, ${this.data[this.offset + 2]}, ${this.data[this.offset + 3] / 255})`;
        }

        get hsl() {
            let r = this.data[this.offset] / 255;
            let g = this.data[this.offset + 1] / 255;
            let b = this.data[this.offset + 2] / 255;

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

        get hsb() {
            let r = this.data[this.offset] / 255;
            let g = this.data[this.offset + 1] / 255;
            let b = this.data[this.offset + 2] / 255;

            let max = Math.max(r, g, b);
            let min = Math.min(r, g, b);

            let v = max;
            let h, s;

            let delta = max - min;
            s = max === 0 ? 0 : delta / max;

            if (max === min) {
                h = 0;
            } else {
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
            v = Math.round(v * 100);

            return [h, s, v];
        }

        get color() {
            return [this.data[this.offset], this.data[this.offset + 1], this.data[this.offset + 2], this.data[this.offset + 3] / 255];
        }

        get pixel() {
            return [this.data[this.offset], this.data[this.offset + 1], this.data[this.offset + 2], this.data[this.offset + 3]];
        }

        get brightness() {
            return Math.sqrt(
                0.299 * (this.data[this.offset] * this.data[this.offset]) +
                0.587 * (this.data[this.offset + 1] * this.data[this.offset + 1]) +
                0.114 * (this.data[this.offset + 2] * this.data[this.offset + 2])
            );
        }

        get isDark() {
            return this.brightness < 127.5;
        }

        hue(hue) {
            let [h, s, l] = this.hsl;
            h = Math.max(Math.min(hue, 360), 0);
            this.setHSL(h, s, l);
            return this;
        }

        saturation(percent) {
            let [h, s, l] = this.hsl;
            s = Math.max(Math.min(percent, 100), 0);
            this.setHSL(h, s, l);
            return this;
        }

        lightness(percent) {
            let [h, s, l] = this.hsl;
            l = Math.max(Math.min(percent, 100), 0);
            this.setHSL(h, s, l);
            return this;
        }

        tone(hue, saturation, lightness) {
            let [h, s, l] = this.hsl;
            this.setHSL(hue || h, (s / 100) * saturation, typeof lightness === "number" ? lightness : l);
            return this;
        }

        lighten(percent) {
            let [h, s, l] = this.hsl;
            l = Math.max(Math.min(l + percent, 100), 0);
            this.setHSL(h, s, l);
            return this;
        }

        saturate(percent) {
            let [h, s, l] = this.hsl;
            s = Math.max(Math.min(s + percent, 100), 0);
            this.setHSL(h, s, l);
            return this;
        }

        darken(percent) {
            let [h, s, l] = this.hsl;
            l = Math.max(Math.min(l - percent, 100), 0);
            this.setHSL(h, s, l);
            return this;
        }

        hueShift(deg) {
            let [h, s, l] = this.hsl;
            h = (h + deg) % 360;
            this.setHSL(h, s, l);
            return this;
        }

        /**
         * Multiplies each channel by the given factor
         * Provide null to skip a channel
         */
        multiply(factorR, factorG, factorB, factorA) {
            const d = this.data, o = this.offset;
            return this.setClamped(
                factorR === null ? null : Math.round(d[o] * factorR),
                factorG === null ? null : Math.round(d[o+1] * factorG),
                factorB === null ? null : Math.round(d[o+2] * factorB),
                factorA === null ? null : (d[o+3] / 255) * factorA
            );
        }

        /**
         * Divides each channel by the given factor
         * Provide null to skip a channel
         */
        divide(factorR, factorG, factorB, factorA) {
            const d = this.data, o = this.offset;
            return this.setClamped(
                factorR === null ? null : Math.round(d[o] / factorR),
                factorG === null ? null : Math.round(d[o+1] / factorG),
                factorB === null ? null : Math.round(d[o+2] / factorB),
                factorA === null ? null : (d[o+3] / 255) / factorA
            );
        }

        add(r2, g2, b2, a2) {
            let color = new LS.Color(r2, g2, b2, a2);
            const d = this.data, o = this.offset;
            return this.setClamped(
                d[o] + color.r,
                d[o+1] + color.g,
                d[o+2] + color.b,
                (d[o+3] / 255) + color.a
            );
        }

        subtract(r2, g2, b2, a2) {
            let color = new LS.Color(r2, g2, b2, a2);
            const d = this.data, o = this.offset;
            return this.setClamped(
                d[o] - color.r,
                d[o+1] - color.g,
                d[o+2] - color.b,
                (d[o+3] / 255) - color.a
            );
        }

        /**
         * Mixes this color with another one by the given weight (0 to 1)
         */
        mix(val, weight = 0.5) {
            let r2, g2, b2, a2;
            if (val instanceof LS.Color) {
               r2 = val.r; g2 = val.g; b2 = val.b; a2 = val.a;
            } else if (Array.isArray(val)) {
               r2 = val[0]; g2 = val[1]; b2 = val[2]; a2 = val[3] !== undefined ? (val[3] > 1 ? val[3]/255 : val[3]) : 1;
            } else {
               const c = new LS.Color(val);
               r2 = c.r; g2 = c.g; b2 = c.b; a2 = c.a;
            }

            const d = this.data, o = this.offset;
            
            d[o] = Math.round(d[o] * (1 - weight) + r2 * weight);
            d[o+1] = Math.round(d[o+1] * (1 - weight) + g2 * weight);
            d[o+2] = Math.round(d[o+2] * (1 - weight) + b2 * weight);
            
            let currentA = d[o+3] / 255;
            d[o+3] = Math.round((currentA * (1 - weight) + a2 * weight) * 255);
            
            return this;
        }

        /**
         * Sets the alpha channel to a value
         */
        alpha(v) {
            this.data[this.offset + 3] = Math.min(Math.max(v, 0), 1) * 255;
            return this;
        }

        setHSL(h, s, l, alpha) {
            let hsl; // Defer calculation if we don't need it
            if(h === null || typeof h === "undefined" || isNaN(h)) h = hsl? hsl[0]: (hsl = this.hsl)[0];
            if(s === null || typeof s === "undefined" || isNaN(s)) s = hsl? hsl[1]: (hsl = this.hsl)[1];
            if(l === null || typeof l === "undefined" || isNaN(l)) l = hsl? hsl[2]: (hsl = this.hsl)[2];

            s /= 100;
            l /= 100;

            let k = n => (n + h / 30) % 12,
                a = s * Math.min(l, 1 - l),
                f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

            this.data[this.offset] = Math.round(255 * f(0));
            this.data[this.offset+1] = Math.round(255 * f(8));
            this.data[this.offset+2] = Math.round(255 * f(4));

            if (typeof alpha === "number" && !isNaN(alpha)) {
                this.data[this.offset+3] = Math.round(Math.min(Math.max(alpha, 0), 1) * 255);
            }
            return this;
        }

        setHSB(h, s, b, alpha) {
            let hsb; // Defer calculation if we don't need it
            if(h === null || typeof h === "undefined" || isNaN(h)) h = hsb? hsb[0]: (hsb = this.hsb)[0];
            if(s === null || typeof s === "undefined" || isNaN(s)) s = hsb? hsb[1]: (hsb = this.hsb)[1];
            if(b === null || typeof b === "undefined" || isNaN(b)) b = hsb? hsb[2]: (hsb = this.hsb)[2];

            s /= 100;
            b /= 100;
            h = ((h % 360) + 360) % 360;

            let i = Math.floor(h / 60) % 6;
            let f = h / 60 - i;
            let p = b * (1 - s);
            let q = b * (1 - f * s);
            let t = b * (1 - (1 - f) * s);

            let r, g, b2;
            switch (i) {
                case 0:
                    r = b; g = t; b2 = p; break;
                case 1:
                    r = q; g = b; b2 = p; break;
                case 2:
                    r = p; g = b; b2 = t; break;
                case 3:
                    r = p; g = q; b2 = b; break;
                case 4:
                    r = t; g = p; b2 = b; break;
                case 5:
                    r = b; g = p; b2 = q; break;
            }

            this.data[this.offset] = Math.round(r * 255);
            this.data[this.offset+1] = Math.round(g * 255);
            this.data[this.offset+2] = Math.round(b2 * 255);

            if (typeof alpha === "number" && !isNaN(alpha)) {
                this.data[this.offset+3] = Math.round(Math.min(Math.max(alpha, 0), 1) * 255);
            }
            return this;
        }

        /**
         * Sets the color channels and clamps them to valid ranges
         */
        setClamped(r, g, b, a) {
            const d = this.data, o = this.offset;
            
            if (typeof r !== "number" || isNaN(r)) r = d[o];
            if (typeof g !== "number" || isNaN(g)) g = d[o+1];
            if (typeof b !== "number" || isNaN(b)) b = d[o+2];
            if (typeof a !== "number" || isNaN(a)) a = d[o+3] / 255;

            // Manual clamping before Uint8 wrapping happens
            d[o] = Math.max(0, Math.min(255, r));
            d[o+1] = Math.max(0, Math.min(255, g));
            d[o+2] = Math.max(0, Math.min(255, b));
            d[o+3] = Math.max(0, Math.min(1, a)) * 255;
            
            return this;
        }

        /**
         * Sets the color from any valid input
         */
        set(r, g, b, a) {
            LS.Color.parse(r, g, b, a, this.data, this.offset);
            return this;
        }

        /**
         * Creates a copy of this color
         */
        clone() {
            const c = new LS.Color();
            const d = this.data, o = this.offset;
            c.data[0] = d[o];
            c.data[1] = d[o+1];
            c.data[2] = d[o+2];
            c.data[3] = d[o+3];
            return c;
        }

        toString() {
            return this.rgba;
        }

        toArray() {
            return [this.data[this.offset], this.data[this.offset+1], this.data[this.offset+2], this.data[this.offset+3] / 255];
        }

        toJSON() {
            return {
                r: this.data[this.offset],
                g: this.data[this.offset+1],
                b: this.data[this.offset+2],
                a: this.data[this.offset+3] / 255
            };
        }

        *[Symbol.iterator]() {
            yield this.data[this.offset];
            yield this.data[this.offset+1];
            yield this.data[this.offset+2];
            yield this.data[this.offset+3] / 255;
        }

        [Symbol.toPrimitive](hint) {
            if (hint === "number") {
                return this.int;
            }
            return this.rgba;
        }

        get [Symbol.toStringTag]() {
            return 'Color';
        }

        valueOf() {
            return this.int;
        }

        /**
         * Creates a Uint8Array pixel with RGBA values
         * @returns {Uint8Array}
         */
        toUint8Array() {
            return new Uint8Array(this.data.slice(this.offset, this.offset + 4));
        }

        /**
         * Creates a WebGL texture with this color
         * @param {WebGLRenderingContext} gl WebGL context
         * @returns {WebGLTexture}
         */
        toTexture(gl) {
            const texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);

            gl.texImage2D(
                gl.TEXTURE_2D,
                0,                  // level
                gl.RGBA,            // internal format
                1, 1,               // width, height
                0,                  // border
                gl.RGBA,            // format
                gl.UNSIGNED_BYTE,   // type
                this.toUint8Array() // pixel data
            );

            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            return texture;
        }

        /**
         * Creates an ImageData object with this color
         * @returns {ImageData}
         */
        toImageData() {
            if(!LS.Color.context) LS.Color._createProcessingCanvas();
            const imageData = LS.Color.context.createImageData(1, 1);
            imageData.data[0] = this.data[this.offset];
            imageData.data[1] = this.data[this.offset+1];
            imageData.data[2] = this.data[this.offset+2];
            imageData.data[3] = this.data[this.offset+3];
            return imageData;
        }

        /**
         * Creates a div element with this color as background
         * @param {number|string} w Optional width
         * @param {number|string} h Optional height
         * @returns {Element}
         */
        toDiv(w, h) {
            const div = document.createElement('div');
            div.style.backgroundColor = this.rgba;
            if(w !== null && w !== undefined) div.style.width = typeof w === "number" ? w + 'px' : w;
            if(h !== null && h !== undefined) div.style.height = typeof h === "number" ? h + 'px' : h;
            return LS.Select(div);
        }

        // --- Special methods for multiple pixels

        /**
         * Set offset by pixel index
         */
        at(index) {
            this.offset = index * 4;
            return this;
        }

        /**
         * Set offset by raw index (snapped to pixel index)
         */
        setOffset(index) {
            this.at(Math.floor(index / 4));
            return this;
        }

        next(by = 1) {
            this.offset += by * 4;
            return this;
        }

        get pixelCount() {
            return this.data.length / 4;
        }

        get atEnd() {
            return this.offset +4 >= this.data.length;
        }

        fill(r, g, b, a, offset = 0, limit = 0) {
            LS.Color.parse(r, g, b, a, this.data, offset);

            const length = this.data.length;
            for (let i = offset + 4; i < (Math.min(limit * 4 || length, length)); i += 4) {
                this.data[i] = this.data[offset];
                this.data[i + 1] = this.data[offset + 1];
                this.data[i + 2] = this.data[offset + 2];
                this.data[i + 3] = this.data[offset + 3];
            }
            return this;
        }

        getAverage(offset = 0, limit = 0, sampleGap = 16) {}

        static parse(r, g, b, a, target, offset = 0) {
            if(!target) target = [0, 0, 0, 1];

            if (typeof r === "string") {
                r = r.trim().toLowerCase();

                if(r.length === 0) {
                    target[offset] = 0; target[offset + 1] = 0; target[offset + 2] = 0; target[offset + 3] = 255;
                    return target;
                }

                // Hex
                if(r.charCodeAt(0) === 35) {
                    [r, g, b, a] = LS.Color.parseHex(r);
                }

                // RGB
                else if(r.startsWith("rgb(") || r.startsWith("rgba(")) {
                    let match = r.match(/rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*([0-9.]+%?))?\s*\)/);

                    if(match) {
                        [r, g, b] = match.slice(1, 4).map(Number);
                        let alpha = match[4];
                        if (alpha) {
                            a = Math.max(0, Math.min(1, alpha.endsWith('%') ? parseFloat(alpha) / 100 : parseFloat(alpha)));
                        } else {
                            a = 1;
                        }
                    } else {
                        throw new Error("Colour " + r + " could not be parsed.");
                    }
                }

                // HSL
                else if (r.startsWith("hsl(") || r.startsWith("hsla(")) {
                    let match = r.match(/hsla?\(\s*([0-9.]+)(?:deg)?\s*[, ]\s*([0-9.]+)%?\s*[, ]\s*([0-9.]+)%?\s*(?:[,/]\s*([0-9.]+%?))?\s*\)/);

                    if(match) {
                        const temp = new LS.Color();
                        const alpha = match[4] ? (match[4].endsWith('%') ? parseFloat(match[4]) / 100 : parseFloat(match[4])) : 1;
                        temp.setHSL(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]), alpha);

                        target[offset] = temp.data[0];
                        target[offset + 1] = temp.data[1];
                        target[offset + 2] = temp.data[2];
                        target[offset + 3] = temp.data[3];
                        return target;
                    } else {
                        throw new Error("Colour " + r + " could not be parsed.");
                    }
                }

                // HSB
                // This is non-CSS-standard but is widely supported
                else if (r.startsWith("hsb(") || r.startsWith("hsba(")) {
                    let match = r.match(/hsba?\(\s*([0-9.]+)(?:deg)?\s*[, ]\s*([0-9.]+)%?\s*[, ]\s*([0-9.]+)%?\s*(?:[,/]\s*([0-9.]+%?))?\s*\)/);

                    if(match) {
                        const temp = new LS.Color();
                        const alpha = match[4] ? (match[4].endsWith('%') ? parseFloat(match[4]) / 100 : parseFloat(match[4])) : 1;
                        temp.setHSB(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]), alpha);
                        
                        target[offset] = temp.data[0];
                        target[offset + 1] = temp.data[1];
                        target[offset + 2] = temp.data[2];
                        target[offset + 3] = temp.data[3];
                        return target;
                    } else {
                        throw new Error("Colour " + r + " could not be parsed.");
                    }
                }

                else if(LS.Color.namedColors.has(r)) {
                    [r, g, b, a] = LS.Color.namedColors.get(r);
                    target[offset] = r;
                    target[offset + 1] = g;
                    target[offset + 2] = b;
                    target[offset + 3] = a !== undefined ? a : 255;
                    return target;
                }

                // As a last resort, we use fillStyle to let the browser parse any valid CSS color
                else {
                    if(!LS.Color.context) {
                        LS.Color._createProcessingCanvas();
                    }

                    LS.Color.context.fillStyle = "#000000";
                    LS.Color.context.fillStyle = r;
                    [r, g, b, a] = LS.Color.parseHex(LS.Color.context.fillStyle);
                }
            } else if (r instanceof LS.Color) {
               const d = r.data, o = r.offset;
               target[offset] = d[o];
               target[offset + 1] = d[o + 1];
               target[offset + 2] = d[o + 2];
               target[offset + 3] = d[o + 3];
               return target;
            } else if (Array.isArray(r)) {
                [r, g, b, a] = r;
            } else if (typeof r === "object" && r !== null) {
                ({ r = 255, g = 255, b = 255, a = 1 } = r);
            }

            target[offset] = (typeof r === "number" && !isNaN(r)) ? r : 0;
            target[offset + 1] = (typeof g === "number" && !isNaN(g)) ? g : 0;
            target[offset + 2] = (typeof b === "number" && !isNaN(b)) ? b : 0;

            let alpha = 255;
            if (typeof a === "number" && !isNaN(a)) {
                alpha = Math.round(a * 255);
            }

            target[offset + 3] = alpha;
            return target;
        }

        static clamp(target) {
            if (typeof target[0] !== "number" || isNaN(target[0])) target[0] = 0;
            if (typeof target[1] !== "number" || isNaN(target[1])) target[1] = 0;
            if (typeof target[2] !== "number" || isNaN(target[2])) target[2] = 0;
            if (typeof target[3] !== "number" || isNaN(target[3])) target[3] = 255;

            target[0] = Math.round(Math.min(255, Math.max(0, target[0])));
            target[1] = Math.round(Math.min(255, Math.max(0, target[1])));
            target[2] = Math.round(Math.min(255, Math.max(0, target[2])));
            target[3] = Math.round(Math.min(255, Math.max(0, target[3])));
            return target;
        }

        static parseHex(hex) {
            if(hex.length < 4 || hex.length > 9) {
                throw new Error("Invalid hex string: " + hex.slice(0, 10) + (hex.length > 10 ? "..." : ""));
            }

            if (hex.length <= 5) {
                return [ parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16), parseInt(hex[3] + hex[3], 16), hex.length === 5? parseInt(hex[4] + hex[4], 16) / 255: 1 ];
            } else {
                return [ parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), hex.length === 9? parseInt(hex.slice(7, 9), 16) / 255: 1 ];
            }
        }

        static fromHSL(h, s, l) {
            return new LS.Color().setHSL(h, s, l);
        }

        static fromHSB(h, s, b) {
            return new LS.Color().setHSB(h, s, b);
        }

        static fromHex(hex) {
            let [r, g, b, a] = LS.Color.parseHex(hex);
            return new LS.Color(r, g, b, a);
        }

        static fromInt(int) {
            let r = (int >> 16) & 0xFF;
            let g = (int >> 8) & 0xFF;
            let b = int & 0xFF;
            return new LS.Color(r, g, b);
        }

        static fromPixel(pixel) {
            return new LS.Color(pixel[0], pixel[1], pixel[2], pixel[3] / 255);
        }

        static fromUint8(data, offset = 0, alpha = true) {
            return new LS.Color(data[offset], data[offset + 1], data[offset + 2], alpha ? data[offset + 3] / 255 : 1);
        }

        static fromObject(obj) {
            return new LS.Color(obj.r, obj.g, obj.b, obj.a);
        }

        static fromArray(arr) {
            return new LS.Color(arr[0], arr[1], arr[2], arr[3]);
        }

        static fromBuffer(buffer, offset = 0, alpha = true) {
            const view = new Uint8Array(buffer, offset, alpha ? 4 : 3);
            return Object.setPrototypeOf(view, LS.Color.prototype);
        }

        static fromNamed(name) {
            if(LS.Color.namedColors.has(name)) {
                return LS.Color.fromArray(LS.Color.namedColors.get(name));
            }
            throw new Error("Unknown color name: " + name);
        }

        static fromCSS(colorString) {
            if(!LS.Color.context) {
                LS.Color._createProcessingCanvas();
            }

            LS.Color.context.fillStyle = "#000000";
            LS.Color.context.fillStyle = colorString;

            // fillStyle result is weirdly inconsistent; color names become hex, rgb/rgba stay as is, so we still parse it
            return new LS.Color(LS.Color.context.fillStyle);
        }

        static random() {
            return new LS.Color(Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256));
        }

        static trueRandom() {
            return new LS.Color([...crypto.getRandomValues(new Uint8Array(3))]);
        }

        static get lightModePreffered() {
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
        }

        static get theme(){
            return document.body.getAttribute("ls-theme");
        }

        static set theme(theme){
            this.setTheme(theme);
        }

        static get accent(){
            return document.body.getAttribute("ls-accent");
        }

        static set accent(color){
            this.setAccent(color);
        }

        static generate(r, g, b) {
            let color = (r instanceof LS.Color)? r: new LS.Color(r, g, b), style = "";

            for(let i of [10, 20, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90, 95]){
                style += `--accent-${i}:${color.clone().lightness(i).hex};`;
            }

            for(let i of [6, 8, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 98]){
                style += `--base-${i}:${color.clone().tone(null, 12, i).hex};`; 
            }

            return style;
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

            return accent;
        }

        static apply(element, r, g, b){
            let color = (r instanceof LS.Color)? r: new LS.Color(r, g, b);
            element.style.cssText += this.generate(color);
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

            return this;
        }

        static setAdaptiveTheme(amoled){
            LS.Color.setTheme(localStorage.getItem("ls-theme") || (this.lightModePreffered? "light": amoled? "amoled" : "dark"));
            return this;
        }

        static autoScheme(amoled){
            LS.once("body-available", () => {
                this.setAdaptiveTheme(amoled);
                this.on("scheme-changed", () => this.setAdaptiveTheme());
            })

            return this;
        }

        static all(){
            return [...this.colors.keys()];
        }

        static randomAccent(){
            let colors = this.all();
            return colors[Math.floor(Math.random() * colors.length)];
        }

        static fromBuffer(buffer, offset = 0) {
            return new LS.ColorView(buffer, offset);
        }

        static fromImage(image, sampleGap = 16, maxResolution = 200){
            if(!(image instanceof HTMLImageElement)) {
                throw new TypeError("The first argument must be an image element");
            }

            image.crossOrigin = "Anonymous";

            sampleGap += sampleGap % 4;

            let pixelIndex = -4,
                sum = [0, 0, 0],
                sampleCount = 0
            ;

            if(!LS.Color.canvas) {
                LS.Color._createProcessingCanvas();
            }

            // Set willReadFrequently for better performance on some browsers
            // This forces software rendering, and since we only process small amounts of data, read speeds are more important
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

        static namedColors = new Map([
            ["aliceblue", [240, 248, 255]],
            ["antiquewhite", [250, 235, 215]],
            ["aqua", [0, 255, 255]],
            ["aquamarine", [127, 255, 212]],
            ["azure", [240, 255, 255]],
            ["beige", [245, 245, 220]],
            ["bisque", [255, 228, 196]],
            ["black", [0, 0, 0]],
            ["blanchedalmond", [255, 235, 205]],
            ["blue", [0, 0, 255]],
            ["blueviolet", [138, 43, 226]],
            ["brown", [165, 42, 42]],
            ["burlywood", [222, 184, 135]],
            ["cadetblue", [95, 158, 160]],
            ["chartreuse", [127, 255, 0]],
            ["chocolate", [210, 105, 30]],
            ["coral", [255, 127, 80]],
            ["cornflowerblue", [100, 149, 237]],
            ["cornsilk", [255, 248, 220]],
            ["crimson", [220, 20, 60]],
            ["cyan", [0, 255, 255]],
            ["darkblue", [0, 0, 139]],
            ["darkcyan", [0, 139, 139]],
            ["darkgoldenrod", [184, 134, 11]],
            ["darkgray", [169, 169, 169]],
            ["darkgreen", [0, 100, 0]],
            ["darkgrey", [169, 169, 169]],
            ["darkkhaki", [189, 183, 107]],
            ["darkmagenta", [139, 0, 139]],
            ["darkolivegreen", [85, 107, 47]],
            ["darkorange", [255, 140, 0]],
            ["darkorchid", [153, 50, 204]],
            ["darkred", [139, 0, 0]],
            ["darksalmon", [233, 150, 122]],
            ["darkseagreen", [143, 188, 143]],
            ["darkslateblue", [72, 61, 139]],
            ["darkslategray", [47, 79, 79]],
            ["darkslategrey", [47, 79, 79]],
            ["darkturquoise", [0, 206, 209]],
            ["darkviolet", [148, 0, 211]],
            ["deeppink", [255, 20, 147]],
            ["deepskyblue", [0, 191, 255]],
            ["dimgray", [105, 105, 105]],
            ["dimgrey", [105, 105, 105]],
            ["dodgerblue", [30, 144, 255]],
            ["firebrick", [178, 34, 34]],
            ["floralwhite", [255, 250, 240]],
            ["forestgreen", [34, 139, 34]],
            ["fuchsia", [255, 0, 255]],
            ["gainsboro", [220, 220, 220]],
            ["ghostwhite", [248, 248, 255]],
            ["gold", [255, 215, 0]],
            ["goldenrod", [218, 165, 32]],
            ["gray", [128, 128, 128]],
            ["green", [0, 128, 0]],
            ["greenyellow", [173, 255, 47]],
            ["grey", [128, 128, 128]],
            ["honeydew", [240, 255, 240]],
            ["hotpink", [255, 105, 180]],
            ["indianred", [205, 92, 92]],
            ["indigo", [75, 0, 130]],
            ["ivory", [255, 255, 240]],
            ["khaki", [240, 230, 140]],
            ["lavender", [230, 230, 250]],
            ["lavenderblush", [255, 240, 245]],
            ["lawngreen", [124, 252, 0]],
            ["lemonchiffon", [255, 250, 205]],
            ["lightblue", [173, 216, 230]],
            ["lightcoral", [240, 128, 128]],
            ["lightcyan", [224, 255, 255]],
            ["lightgoldenrodyellow", [250, 250, 210]],
            ["lightgray", [211, 211, 211]],
            ["lightgreen", [144, 238, 144]],
            ["lightgrey", [211, 211, 211]],
            ["lightpink", [255, 182, 193]],
            ["lightsalmon", [255, 160, 122]],
            ["lightseagreen", [32, 178, 170]],
            ["lightskyblue", [135, 206, 250]],
            ["lightslategray", [119, 136, 153]],
            ["lightslategrey", [119, 136, 153]],
            ["lightsteelblue", [176, 196, 222]],
            ["lightyellow", [255, 255, 224]],
            ["lime", [0, 255, 0]],
            ["limegreen", [50, 205, 50]],
            ["linen", [250, 240, 230]],
            ["magenta", [255, 0, 255]],
            ["maroon", [128, 0, 0]],
            ["mediumaquamarine", [102, 205, 170]],
            ["mediumblue", [0, 0, 205]],
            ["mediumorchid", [186, 85, 211]],
            ["mediumpurple", [147, 112, 219]],
            ["mediumseagreen", [60, 179, 113]],
            ["mediumslateblue", [123, 104, 238]],
            ["mediumspringgreen", [0, 250, 154]],
            ["mediumturquoise", [72, 209, 204]],
            ["mediumvioletred", [199, 21, 133]],
            ["midnightblue", [25, 25, 112]],
            ["mintcream", [245, 255, 250]],
            ["mistyrose", [255, 228, 225]],
            ["moccasin", [255, 228, 181]],
            ["navajowhite", [255, 222, 173]],
            ["navy", [0, 0, 128]],
            ["oldlace", [253, 245, 230]],
            ["olive", [128, 128, 0]],
            ["olivedrab", [107, 142, 35]],
            ["orange", [255, 165, 0]],
            ["orangered", [255, 69, 0]],
            ["orchid", [218, 112, 214]],
            ["palegoldenrod", [238, 232, 170]],
            ["palegreen", [152, 251, 152]],
            ["paleturquoise", [175, 238, 238]],
            ["palevioletred", [219, 112, 147]],
            ["papayawhip", [255, 239, 213]],
            ["peachpuff", [255, 218, 185]],
            ["peru", [205, 133, 63]],
            ["pink", [255, 192, 203]],
            ["plum", [221, 160, 221]],
            ["powderblue", [176, 224, 230]],
            ["purple", [128, 0, 128]],
            ["rebeccapurple", [102, 51, 153]],
            ["red", [255, 0, 0]],
            ["rosybrown", [188, 143, 143]],
            ["royalblue", [65, 105, 225]],
            ["saddlebrown", [139, 69, 19]],
            ["salmon", [250, 128, 114]],
            ["sandybrown", [244, 164, 96]],
            ["seagreen", [46, 139, 87]],
            ["seashell", [255, 245, 238]],
            ["sienna", [160, 82, 45]],
            ["silver", [192, 192, 192]],
            ["skyblue", [135, 206, 235]],
            ["slateblue", [106, 90, 205]],
            ["slategray", [112, 128, 144]],
            ["slategrey", [112, 128, 144]],
            ["snow", [255, 250, 250]],
            ["springgreen", [0, 255, 127]],
            ["steelblue", [70, 130, 180]],
            ["tan", [210, 180, 140]],
            ["teal", [0, 128, 128]],
            ["thistle", [216, 191, 216]],
            ["tomato", [255, 99, 71]],
            ["turquoise", [64, 224, 208]],
            ["violet", [238, 130, 238]],
            ["wheat", [245, 222, 179]],
            ["white", [255, 255, 255]],
            ["whitesmoke", [245, 245, 245]],
            ["yellow", [255, 255, 0]],
            ["yellowgreen", [154, 205, 50]],
            ["transparent", [0, 0, 0, 0]]
        ]);
    }

    LS.ColorView = function(buffer, offset = 0){
        return LS.Color.fromBuffer(buffer, offset);
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