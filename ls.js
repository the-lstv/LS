/*
    Author: Lukas (thelstv)
    Copyright: (c) https://lstv.space

    Last modified: 2025
    License: GPL-3.0
    Version: 5.0.0
    See: https://github.com/thelstv/LS
*/

(exports => {

    const global = typeof window !== 'undefined'? window : globalThis;
    const instance = exports();

    if(typeof module !== "undefined"){
        module.exports = instance
    } else {
        global.LS = instance
    }

    if(instance.isWeb){
        for (let key in instance.Tiny){
            global[key] = instance.Tiny[key]
        }

        LS.prototypeTiny();

        LS._topLayer = LS.Create({id: "ls-top-layer", style: {
            position: "fixed"
        }});

        LS._topLayerInherit = function () { console.error("LS._topLayerInherit is deprecated and no longer serves any purpose, you can safely remove it from your code.") }

        function bodyAvailable(){
            document.body.append(LS._topLayer)
            LS._events.completed("body-available")
        }

        if(document.body) bodyAvailable(); else window.addEventListener("load", bodyAvailable);
    }

})(() => {

    const LS = {
        isWeb: typeof window !== 'undefined',
        version: "5.0.0",
        v: 5,

        components: new Map,

        EventHandler: class EventHandler {
            constructor(target, options = {}){
                this.events = new Map;
                this.options = options;

                if(target){
                    target._events = this;

                    ["emit", "on", "once", "off", "invoke"].forEach(method => {
                        if (!target.hasOwnProperty(method)) target[method] = this[method].bind(this);
                    });

                    this.target = target;
                }
            }

            prepare(name, options){
                if(!this.events.has(name)){
                    this.events.set(name, { listeners: [], empty: [], ...options, _isEvent: true })
                } else if(options){
                    Object.assign(this.events.get(name), options)
                }

                return this.events.get(name)
            }

            on(name, callback, options){
                const event = (name._isEvent? name: this.events.get(name)) || this.prepare(name);
                if(event.completed) return callback();

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
                    } catch (error) {
                        console.error(`Error in listener for event '${name}':`, listener, error);
                    }

                    if(listener.once) {
                        event.empty.push(listener.index);
                        event.listeners[listener.index] = null;
                        listener = null;
                    }
                }

                return returnData
            }

            rapidFire(event, data){
                if(!event._isEvent) throw new Error("Event must be a valid event object when using rapidFire");

                for(let i = 0; i < event.listeners.length; i++){
                    event.listeners[i].callback(data);
                }
            }

            flush() {
                this.events.clear();
            }

            alias(name, alias){
                this.events.set(alias, this.prepare(name))
            }

            completed(name){
                this.emit(name)

                this.prepare(name, {
                    completed: true
                })
            }
        },

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
             * @description Element selector utility
             */
            Q(selector, subSelector, one = false) {
                if(!selector) return LS.TinyWrap(one? null: []);

                const isElement = selector instanceof HTMLElement;
                const target = (isElement? selector : document);

                if(isElement && !subSelector) return LS.TinyWrap(one? selector: [selector]);

                const actualSelector = isElement? subSelector || "*" : selector || '*';

                let elements = one? target.querySelector(actualSelector): target.querySelectorAll(actualSelector);
                
                return LS.TinyWrap(one? elements: [...elements]);
            },

            /**
             * @description Single element selector
             */
            O(selector, subSelector){
                if(!selector) return LS.TinyWrap(document.body);
                return LS.Tiny.Q(selector, subSelector, true)
            },

            /**
             * @description Element builder utility
             */
            N(tagName = "div", content){
                if(typeof tagName !== "string"){
                    content = tagName;
                    tagName = "div";
                }

                content =
                    typeof content === "string" 
                        ? { innerHTML: content } 
                        : Array.isArray(content) 
                            ? { inner: content } 
                            : content || {};


                const { class: className, tooltip, ns, accent, attr, style, inner, content: innerContent, ...rest } = content;

                const element = Object.assign(
                    ns ? document.createElementNS(ns, tagName) : document.createElement(tagName),
                    rest
                );

                // Handle attributes
                if (accent) LS.TinyFactory.attrAssign.call(element, { "ls-accent": accent });
                if (attr) LS.TinyFactory.attrAssign.call(element, attr);

                // Handle tooltips
                if (tooltip) {
                    if (!LS.Tooltips) {
                        element.attrAssign({ title: tooltip });
                    } else {
                        element.attrAssign({ "ls-tooltip": tooltip });
                        LS.Tooltips.addElements([{ target: element, attributeName: "ls-tooltip" }]);
                    }
                }

                if (className && element.class) LS.TinyFactory.class.call(element, className);
                if (typeof style === "object") LS.TinyFactory.applyStyle.call(element, style);

                // Append children or content
                const contentToAdd = inner || innerContent;
                if (contentToAdd) LS.TinyFactory.add.call(element, contentToAdd);

                return element;
            },

            /**
             * @description Color utilities
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

                Style(url, callback) {
                    return new Promise((resolve, reject) => {
                        const linkElement = N("link", {
                            rel: "stylesheet",
                            href: url,
                            onload() {
                                if (callback) callback(null);
                                resolve();
                            },
                            onerror(error) {
                                const errorMsg = error.toString();
                                if (callback) callback(errorMsg);
                                reject(errorMsg);
                            }
                        });
                
                        O("head").add(linkElement);
                    });
                },

                Script(url, callback) {
                    return new Promise((resolve, reject) => {
                        const scriptElement = N("script", {
                            src: url,
                            onload() {
                                if (callback) callback(null);
                                resolve();
                            },
                            onerror(error) {
                                const errorMsg = error.toString();
                                if (callback) callback(errorMsg);
                                reject(errorMsg);
                            }
                        });
                
                        O("head").add(scriptElement);
                    });
                },

                async Document(url, callback) {
                    try {
                        const response = await fetch(url);
                        if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
                        const text = await response.text();
                        const data = N("div", { innerHTML: text });

                        if (callback) callback(null, data);
                        return await data;
                    } catch (error) {
                        const errorMsg = error.toString();
                        if (callback) callback(errorMsg);
                        throw errorMsg;
                    }
                }
            },

            _prototyped: false
        },


        /**
         * @description TinyFactory (utilities for HTML elements)
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

            class(names, action = 1){
                if(typeof names == "undefined") return this;

                action = (action == "add" || (!!action && action !== "remove"))? (action == 2 || action == "toggle")? "toggle": "add": "remove";

                for(let className of typeof names === "string"? names.split(" "): names){
                    if(typeof className !== "string" || className.length < 1) continue;
                    this.classList[action](className)
                }

                return this
            },

            hasClass(...names){
                if(names.length === 0) return false;
                if(names.length === 1) return this.classList.contains(names[0]);

                let has = true;

                names = names.flatMap(className => {
                    if(!this.classList.contains(className)) has = false
                })

                return has
            },

            get(selector = '*'){
                return LS.Tiny.O(this, selector)
            },

            getAll(selector = '*'){
                return LS.Tiny.Q(this, selector)
            },

            add(...elements){
                this.append(...LS.Util.resolveElements(...elements));
                return this
            },

            addBefore(a){
                LS.Util.resolveElements(a).forEach(e=>this.parentNode.insertBefore(e,this))
                return this
            },

            addAfter(a){
                LS.Util.resolveElements(a).forEach(e=>this.parentNode.insertBefore(e,this.nextSibling))
                return this
            },

            addTo(a){
                O(a).add(this)
                return this
            },

            setTo(a){
                O(a).set(this)
                return this
            },

            wrapIn(e){
                this.addAfter(O(e));
                e.appendChild(this);
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

            console.warn("Warning: TinyFactory has been prototyped globally to all HTML elements. You can now use all its featuers seamlessly. Beware that this may conflict with other libraries or future changes or cause confusion, please use with caution!");
            Object.assign(HTMLElement.prototype, LS.TinyFactory);
        },

        Util: {
            resolveElements(...array){
                return array.flat(Infinity).map(element => {
                    if(element && element.tagName) return element;

                    return [...N("div", element).childNodes];
                }).flat();
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

            touchHandle(element, options = {}){
                element = LS.Tiny.O(element);

                if(!element) throw "Invalid handle!";

                let events = new LS.EventHandler, cancelled = false;

                options = {
                    buttons: [0, 1, 2],
                    ...options
                }

                if(options.cursor) events.cursor = options.cursor;
                
                events.target = element // The target will change based on the event target!

                let [pointerLockPreviousX, pointerLockPreviousY] = [0, 0];

                function move(event) {
                    if(cancelled) return;

                    let x, y, isTouchEvent = event.type == "touchmove";

                    if(!isTouchEvent) event.preventDefault()

                    if(!events.pointerLockActive) {
                        x = isTouchEvent? event.touches[0].clientX : event.clientX
                        y = isTouchEvent? event.touches[0].clientY : event.clientY
                    }

                    if(options.pointerLock){
                        // The following adds seamles fallback for pointerlock on touch devices and emulates absolute mouse position for pointerlock!
                        // This allows you to easily enable/disable pointerlock without losing any functionality or having to write custom fallbacks, on both touch and mouse devices!

                        if(events.pointerLockActive){
                            x = pointerLockPreviousX += !isNaN(event.movementX)? event.movementX: 0
                            y = pointerLockPreviousY += !isNaN(event.movementY)? event.movementY: 0
                        } else if(isTouchEvent){
                            event.movementX = Math.round(x - pointerLockPreviousX)
                            event.movementY = Math.round(y - pointerLockPreviousY)
                            pointerLockPreviousX = x
                            pointerLockPreviousY = y
                        }
                    }

                    if(options.onMove) options.onMove(x, y, event, cancel)

                    events.emit("move", [x, y, event, cancel])
                }

                function cancel() {
                    cancelled = true
                }

                function pointerLockChangeWatch(){
                    events.pointerLockActive = document.pointerLockElement === element;
                }

                document.addEventListener('pointerlockchange',  pointerLockChangeWatch);
    
                function release(evt) {
                    events.seeking = false;
                    cancelled = false;
    
                    element.class("is-dragging", 0)
                    events.target.class("ls-drag-target", 0)
                    document.documentElement.class("ls-dragging",0)
                    document.removeEventListener("mousemove", move);
                    document.removeEventListener("mouseup", release);
                    document.removeEventListener("touchmove", move);
                    document.removeEventListener("touchend", release);
                    document.documentElement.style.cursor = "";
    
                    events.emit(evt.type == "destroy"? "destroy" : "end", [evt])

                    if(events.pointerLockActive){
                        document.exitPointerLock();
                    }

                    if(evt.type == "destroy")
                        if(options.onDestroy) options.onDestroy(evt);
                    else 
                        if(options.onEnd) options.onEnd(evt);
                }

                function start(event){
                    if(typeof options.exclude == "string" && event.target.matches(options.exclude)) return;
                    if(!options.exclude && event.target !== element) return;

                    event.preventDefault()

                    if(event.type == "mousedown" && !options.buttons.includes(event.button)) return;
                    
                    events.seeking = true;

                    let x = event.type == "touchstart"? event.touches[0].clientX : event.clientX, y = event.type == "touchstart"? event.touches[0].clientY : event.clientY;

                    events.emit("start", [event, cancel, x, y])
                    if(options.onStart) options.onStart(event, cancel, x, y)

                    if(cancelled) return events.seeking = false;

                    if(options.pointerLock && event.type !== "touchstart") {

                        pointerLockPreviousX = event.clientX
                        pointerLockPreviousY = event.clientY

                        if (event.type !== "touchstart") element.requestPointerLock();
                    }

                    events.target = LS.Tiny.O(event.target);
                    events.target.class("ls-drag-target")

                    element.class("is-dragging")
                    document.documentElement.class("ls-dragging")
                    document.addEventListener("mousemove", move);
                    document.addEventListener("mouseup", release);
                    document.addEventListener("touchmove", move);
                    document.addEventListener("touchend", release);
                    document.documentElement.style.cursor = events.cursor || "grab";
                }

                element.on("mousedown", "touchstart", ...(options.startEvents || []), start)

                events.destroy = function (){
                    release({type: "destroy"})
                    element.off("mousedown", "touchstart", start)
                    document.removeEventListener('pointerlockchange',  pointerLockChangeWatch);
                    cancelled = true;
                    events.destroy = () => false;
                    events.destroyed = true
                    return true
                }

                return events
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

                        LS.Tiny.O().add(temp)
                        temp.select()
                        document.execCommand('copy')
                        
                        LS.Tiny.O().removeChild(temp)
                        resolve()
                    }
                })
            },
        },

        Component: class {
            constructor(){
                if(!this._component || !LS.components.has(this._component.name)){
                    throw new Error("This class has to be extended and loaded as a component with LS.LoadComponent.");
                }

                this._events = new LS.EventHandler(this);
            }
        },

        LoadComponent(componentClass, options = {}){
            const name = options.name || componentClass.name;

            if(LS.components.has(name)) {
                console.warn(`[LS] Duplicate component name ${name}, ignored!`);
                return
            }

            const component = {
                class: componentClass,
                metadata: options.metadata,
                global: !!options.global,
                name
            }

            LS.components.set(name, component)
            componentClass.prototype._component = component;

            if(component.global){
                LS[name] = options.singular? new componentClass: componentClass;
            }

            return component
        },

        GetComponent(name){
            return LS.components.get(name)
        },
    }

    new LS.EventHandler(LS);
    LS.SelectAll = LS.Tiny.Q;
    LS.Select = LS.Tiny.O;
    LS.Create = LS.Tiny.N;

    /**
     * @description Color and theme utilities
     */
    LS.Color = class {
        constructor(r, g, b, a) {
            if (typeof r === "string") {
                let div = document.createElement('div');
                div.style.display = 'none';
                div.style.color = r;
                document.body.appendChild(div);
                let m = getComputedStyle(div).color.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
                document.body.removeChild(div);
    
                if (m) {
                    return new LS.Color(+m[1], +m[2], +m[3]);
                } else {
                    throw new Error("Colour " + r + " could not be parsed.");
                }
            }
    
            if (r === null || typeof r === "undefined") r = 255;
            if (g === null || typeof g === "undefined") g = 255;
            if (b === null || typeof b === "undefined") b = 255;
            if (a === null || typeof a === "undefined") a = 1;
    
            this.r = Math.round(Math.min(255, Math.max(0, r)));
            this.g = Math.round(Math.min(255, Math.max(0, g)));
            this.b = Math.round(Math.min(255, Math.max(0, b)));
            this.a = Math.min(1, Math.max(0, a));
        }
    
        get hex() {
            return "#" + (1 << 24 | this.r << 16 | this.g << 8 | this.b).toString(16).slice(1);
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
    
        static fromHSL(h, s, l) {
            s /= 100;
            l /= 100;
    
            let k = n => (n + h / 30) % 12,
                a = s * Math.min(l, 1 - l),
                f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    
            return new LS.Color(255 * f(0), 255 * f(8), 255 * f(4));
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
            return new LS.Color().fromHSL(h, s, l);
        }
    
        saturation(percent) {
            let [h, s, l] = this.hsl;
            s = Math.max(Math.min(percent, 100), 0);
            return new LS.Color().fromHSL(h, s, l);
        }
    
        lighten(percent) {
            let [h, s, l] = this.hsl;
            l = Math.max(Math.min(l + percent, 100), 0);
            return new LS.Color().fromHSL(h, s, l);
        }
    
        darken(percent) {
            let [h, s, l] = this.hsl;
            l = Math.max(Math.min(l - percent, 100), 0);
            return new LS.Color().fromHSL(h, s, l);
        }
    
        hueShift(deg) {
            let [h, s, l] = this.hsl;
            h = (h + deg) % 360;
            return new LS.Color().fromHSL(h, s, l);
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
    
        subtract(r2, g2, b2, a2) {
            let color = new LS.Color(r2, g2, b2, a2).color;
            return new LS.Color(this.r - color[0], this.g - color[1], this.b - color[2], this.a - color[3]);
        }
    
        alpha(v) {
            return new LS.Color(this.r, this.g, this.b, v);
        }
    
        static random() {
            return new LS.Color(Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256));
        }

        static {
            this._events = new LS.EventHandler(this);

            this.colors = null; // Will be set below
            this.themes = new Set(["light", "dark", "amoled"]);

            // Style tag to manage
            this.style = document.querySelector("#ls-colors");

            if(!this.style){
                LS.once("body-available", ()=>{
                    this.style = LS.Tiny.N("style", {id: "ls-colors"});
                    LS._topLayer.add(this.style)
                })
            }

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

        static add(name, r, g, b){
            if(this.colors.has(name)) return false;

            let color = new LS.Color(r, g, b), values = color.color;
            this.colors.set(name, color);

            this.style.add(`[ls-accent="${name}"]{--accent-raw:${values[0]},${values[1]},${values[2]};--accent-dark-raw:${color.darken(10).color.slice(0, 3).join(",")};--accent-background-raw:${color.darken(20).saturation(20).color.slice(0, 3).join(",")};--accent-light-raw:${color.lighten(10).color.slice(0, 3).join(",")};--color-bg:${color.hsl[2] > 50? "#222": "#eee"}}`)
            return color
        }

        static setAccent(accent){
            document.body.setAttribute("ls-accent", accent)
            return this
        }

        static setTheme(theme){
            document.body.setAttribute("ls-theme", theme)
            this.emit("theme-changed", [theme])
            return this
        }

        static setAdaptiveTheme(amoled){
            LS.Color.setTheme(this.lightModePreffered? "light": amoled? "amoled" : "dark")
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

        static getAverageRGB(image, sampleGap = 20){
            if(!(image instanceof HTMLImageElement)) {
                throw new TypeError("The first argument must be an image element");
            }

            let canvas = document.createElement("canvas"),
                context = canvas.getContext && canvas.getContext("2d"),
                index = -4,
                color = [0, 0, 0],
                sampleCount = 0
            ;

            if (!context) return new LS.Color(...color);

            canvas.height = image.naturalHeight || image.offsetHeight || image.height;
            canvas.width = image.naturalWidth || image.offsetWidth || image.width;
            
            context.drawImage(image, 0, 0);

            let imageData;
            try {
                imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            } catch (error) {
                console.error(error);
                return new LS.Color(...color);
            }

            for (let i = imageData.data.length; (index += sampleGap) < i; ) {
                ++sampleCount
                color[0] += imageData.data[index]
                color[1] += imageData.data[index + 1]
                color[2] += imageData.data[index + 2]
            }
        
            return (color[0] = ~~(color[0] / sampleCount)), (color[1] = ~~(color[1] / sampleCount)), (color[2] = ~~(color[2] / sampleCount)), new LS.Color(...color);
        }
    }

    LS.Color.colors = new Map([
        ['rich_black', new LS.Color(6, 0, 35)],
        ['navy', new LS.Color(40, 28, 108)],
        ['blue', new LS.Color(0, 133, 255)],
        ['pastel_indigo', new LS.Color(70, 118, 181)],
        ['lapis', new LS.Color(34, 114, 154)],
        ['teal', new LS.Color(0, 128, 128)],
        ['pastel_teal', new LS.Color(69, 195, 205)],
        ['aquamarine', new LS.Color(58, 160, 125)],
        ['mint', new LS.Color(106, 238, 189)],
        ['green', new LS.Color(25, 135, 84)],
        ['lime', new LS.Color(133, 210, 50)],
        ['neon', new LS.Color(173, 255, 110)],
        ['yellow', new LS.Color(255, 236, 32)],
        ['lstv_red', new LS.Color(237, 108, 48)],
        ['lstv_yellow', new LS.Color(252, 194, 27)],
        ['lstv_blue', new LS.Color(64, 192, 231)],
        ['orange', new LS.Color(255, 140, 32)],
        ['deep_orange', new LS.Color(255, 112, 52)],
        ['red', new LS.Color(245, 47, 47)],
        ['rusty_red', new LS.Color(220, 53, 69)],
        ['pink', new LS.Color(230, 52, 164)],
        ['hotpink', new LS.Color(245, 100, 169)],
        ['purple', new LS.Color(155, 77, 175)],
        ['soap', new LS.Color(210, 190, 235)],
        ['burple', new LS.Color(81, 101, 246)],
        ['gray', new LS.Color(73, 73, 73)],
        ['gray_light', new LS.Color(107, 107, 107)],
        ['white', new LS.Color(225, 225, 225)],
        ['black', new LS.Color(16, 16, 16)],
    ]);
      

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