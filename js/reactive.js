/**
 * A simple yet powerful, fast and lightweight reactive library for LS
 * @version 1.0.0
 * 
 * TODO: Support attribute binding
 * TODO: Bind multiple values (eg. {{ user.displayname || user.username }})
 * 
 * TODO: Recursive bindings
 * TODO: Array bindings ("user.friends.0.name", "user.friends[0].name", "each user.friends { ... }")
 * TODO: Event bindings ("@click user.clicked()")
 */

(() => {
    let LSReactive;

    class ReactiveBinding extends LS.EventHandler {
        constructor(object = {}) {
            super();

            this.object = object;
            this.updated = true;
            this.keys = new Map();
            this._mutated = false;
        }

        /**
         * Renders all keys in the binding.
         * @returns {void}
         */
        render() {
            LSReactive.render(this);
        }

        /**
         * Renders a specific key in the binding.
         * @param {string} key The key to render
         * @returns {void}
         */
        renderKey(key) {
            LSReactive.renderKey(key, this);
        }

        /**
         * Render value on one element
         * @param {HTMLElement} element The element to render the value on
         * @param {any} key The key to render
         * @returns {void}
         */
        renderValue(element, key) {
            if(this.source || this.object) LSReactive.renderValue(element, key, this.source || this.object);
        }

        /**
         * Resets the binding to its initial state, clearing all keys and values.
         * 
         * Warning: This clears the object reference.
         * @returns {boolean} True if the reset was successful
         */
        reset() {
            this.object = {};
            this.updated = true;
            this.render();
            this._mutated = false;
            this.emit("reset", [false]);
            return true;
        }

        /**
         * Resets the binding to its initial state by clearing values.
         * This is slower but keeps the original reference.
         * @returns {boolean} True if the reset was successful
         */
        properReset() {
            for (const key of Object.keys(this.object)) {
                delete this.object[key];
            }

            this.updated = true;
            this.render();
            this._mutated = false;
            this.emit("reset", [true]);
            return true;
        }

        /**
         * Drops all connected elements.
        */
        drop() {
            this.keys.clear();
        }

        /**
         * Wraps an object and binds it to the binding.
         * @param {string} prefix The prefix to bind the object to
         * @param {object} object The object to wrap
         * @param {object} options Options for the binding
         * @param {boolean} options.recursive Whether to recursively bind all objects
         * @param {function} options.fallback Fallback function to use when the key is not found
         * @returns {Proxy} The proxy object
         */
        bindTo(prefix, object, options = {}){
            if(typeof prefix === "string") prefix += "."; else prefix = "";
            this.object = object;

            if(options.recursive) for(let key in object) {
                if(typeof object[key] === "object" && object[key] !== null && object[key].__isProxy === undefined && Object.getPrototypeOf(object[key]) === Object.prototype) {
                    object[key] = LS.Reactive.wrap(prefix + key, object[key], options);
                }
            }

            if(object.__isProxy) return object;

            if(options.fallback) {
                this.fallback = options.fallback;
            }

            const proxy = new Proxy(object, {
                set: (_, key, value) => {
                    if(this.fallback && this._mutated === false) {
                        this.emit("mutated");
                        this._mutated = true;
                    }

                    this.emit("set", [key, value]);

                    // Wrap new nested objects dynamically
                    if(options.recursive && typeof value === "object" && value !== null && !value.__isProxy) {
                        value = LS.Reactive.wrap(prefix + key, value, options);
                        this.object[key] = value;
                        return true;
                    }

                    this.object[key] = value;
                    this.updated = true;
                    this.renderKey(key);
                    return true;
                },

                get: (_, key) => {
                    if (key === "__isProxy") return true;
                    if (key === "__binding") return this;
                    if (key === "__reset" && this.fallback) return () => this.reset();
                    if (key === "__data" && this.fallback) return this.object;
                    if (key === "__parent" && this.fallback) return this.fallback;

                    if(this.fallback && !this.object.hasOwnProperty(key)) return this.fallback[key];
                    return this.object[key];
                },

                deleteProperty: (_, key) => {
                    delete this.object[key];
                    this.renderKey(key);
                }
            });

            this.source = proxy;
            this.render();

            return proxy;
        }

        /**
         * Destroys the binding, cleaning up all references and event listeners.
         * After calling this, the binding should not be used anymore.
         * @returns {void}
         */
        destroy() {
            // Clean up all bound elements
            for (const [key, elements] of this.keys) {
                for (const element of elements) {
                    delete element.__reactive;
                    delete element.__last_bind;
                }
            }

            this.keys.clear();
            this.object = null;
            this.source = null;
            this.fallback = null;
            this._destroyed = true;
            this.emit("destroy");
            this.events.clear();
        }
    }

    LS.LoadComponent(class Reactive extends LS.Component {
        constructor(){
            super();
            LSReactive = this;

            this.bindCache = new Map();

            // Initialize types Map as instance property
            this.types = new Map([
                ["string", String],
                ["number", Number],
                ["boolean", Boolean],
                ["array", Array],
                ["object", Object],
                ["function", Function]
            ]);

            this.global = this.wrap(null, {}, true);

            window.addEventListener("DOMContentLoaded", () => {
                this.scan();
            });
        }

        /**
         * Scans the document or specific element for elements with the data-reactive attribute and caches them
         * @param {HTMLElement} scanTarget The target element to scan
         */

        scan(scanTarget = document.body){
            for(let target of scanTarget.querySelectorAll(`[data-reactive]`)) {
                this.bindElement(target);
            }
        }

        /**
         * Parses the data-reactive attribute of an element and caches it for lookup
         * @param {HTMLElement} target The target element to bind
         * @param {string} defaultBind Binding string, defaults to the data-reactive attribute
         */

        bindElement(target, defaultBind = null){
            let rawBinding = (defaultBind || target.getAttribute("data-reactive")).trim();
            if(!rawBinding || target.__last_bind === rawBinding) return;

            if(target.__last_bind) this.unbindElement(target, true);

            target.__last_bind = rawBinding;

            // Match data prefix
            let value_prefix = null;
            if(this.matchStringChar(rawBinding.charCodeAt(0))) {
                const string_char = rawBinding.charAt(0);
                const end = rawBinding.indexOf(string_char, 1);
                if(end === -1) {
                    console.warn("Invalid reactive attribute: " + rawBinding);
                    return;
                }

                value_prefix = rawBinding.slice(1, end);
                rawBinding = rawBinding.slice(end + 1).trim();
            }

            const [prefix, name, extra] = this.splitPath(rawBinding);
            if(!name) return;

            const key = this.parseKey(prefix, name, extra);

            target.__reactive = key;

            if(value_prefix) {
                target.__reactive.value_prefix = value_prefix;
            }

            let binding = this.bindCache.get(prefix);

            if(!binding) {
                binding = new ReactiveBinding(null);
                binding.updated = false;
                this.bindCache.set(prefix, binding);
            }

            const cache = binding.keys.get(key.name);
            if(cache) cache.add(target); else binding.keys.set(key.name, new Set([target]));

            binding.renderValue(target, key.name);
        }

        /**
         * Removes a binding from an element
         * @param {HTMLElement} target The target element to unbind
         */

        unbindElement(target, keepAttribute = false){
            if(!keepAttribute) target.removeAttribute("data-reactive");
            if(!target.__last_bind) return;

            const [prefix, name] = this.splitPath(target.__last_bind);

            delete target.__last_bind;
            delete target.__reactive;

            if(!name) return;

            let binding = this.bindCache.get(prefix);
            if(!binding) return;

            const cache = binding.keys.get(name);
            if(cache) cache.delete(target);
        }


        /**
         * A fast, light parser to expand a key to an object with dynamic properties, eg. "username || anonymous".
         * @param {string} extra The key string to parse
        */

        parseKey(prefix, name, extra){
            let i = -1, v_start = 0, v_propety = null, state = 0, string_char = null;

            const result = {
                prefix, name
            };

            extra = extra? extra.trim(): null;
            if(!extra) return result;

            while(++i < extra.length) {
                const char = extra.charCodeAt(i);
                
                if(state === 0) {
                    if(char === 58){ // :
                        v_start = i + 1;
                        state = 4;
                        continue;
                    }

                    state = 1;
                }

                if(state === 4) {
                    if(this.matchKeyword(extra.charCodeAt(i + 1)) && i !== extra.length - 1) continue;
                    const type = extra.slice(v_start, i + 1).toLowerCase();
                    result.type = this.types.get(type) || type;

                    if(extra.charCodeAt(i + 1) === 40) { // (
                        i++;
                        v_start = i + 1;
                        state = 5;
                        continue;
                    }

                    state = 1;
                }

                if (state === 5) {
                    let args = [];
                    while (i < extra.length && extra.charCodeAt(i) !== 41) { // )
                        if (!this.matchWhitespace(extra.charCodeAt(i))) {
                            let arg_start = i;
                            while (i < extra.length && extra.charCodeAt(i) !== 44 && extra.charCodeAt(i) !== 41) { // , or )
                                i++;
                            }
                            args.push(extra.slice(arg_start, i).trim());
                            if (extra.charCodeAt(i) === 44) i++; // Skip comma
                        } else {
                            i++;
                        }
                    }
                    result.args = args;
                    state = 1;
                }

                if(state === 3) {
                    if(char === string_char) {
                        result[v_propety] = extra.slice(v_start, i);
                        state = 0;
                    }
                    continue;
                }

                if(this.matchWhitespace(char)) continue;

                if(state === 2) {
                    if(this.matchStringChar(char)) {
                        string_char = char;
                        v_start = i + 1;
                        state = 3;
                    }
                    continue;
                }

                switch(char) {
                    case 124: // | - Or
                        if(extra.charCodeAt(i + 1) === 124) {
                            i++;
                            v_propety = "or";
                            state = 2;
                            break;
                        }

                        console.warn("You have a syntax error in key: " + extra);
                        return result; // Invalid
                    
                    case 63: // ? - Default
                        if(extra.charCodeAt(i + 1) === 63) {
                            i++;
                            v_propety = "default";
                            state = 2;
                            break;
                        }

                        console.warn("You have a syntax error in key: " + extra);
                        return result; // Invalid
                    
                    case 33: // ! - Raw HTML
                        result.raw = true;
                        break;
                }
            }

            return result;
        }

        matchKeyword(char){
            return (
                (char >= 48 && char <= 57) || // 0-9
                (char >= 65 && char <= 90) || // A-Z
                (char >= 97 && char <= 122) || // a-z
                char === 95 || // _
                char === 45    // -
            )
        }

        matchWhitespace(char){
            return char === 32 || char === 9 || char === 10 || char === 13;
        }

        matchStringChar(char){
            return char === 34 || char === 39 || char === 96;
        }

        registerType(name, type){
            if(typeof name !== "string" || !name.trim()) {
                throw new Error("Invalid type name: " + name);
            }

            if(typeof type !== "function") {
                throw new Error("Invalid type: " + type);
            }

            this.types.set(name.toLowerCase(), type);
        }

        splitPath(path){
            if(!path) return [null, null, null];

            const match = path.match(/^([a-zA-Z0-9._-]+)(.*)/);

            if(!match) return [null, path, null];

            path = match[1];

            const lastIndex = path.lastIndexOf(".");
            const prefix = lastIndex === -1? "": path.slice(0, path.lastIndexOf(".") +1);
            if(prefix) path = path.slice(lastIndex + 1);

            return [prefix, path, match[2].trim()];
        }


        /**
         * Wraps an object with a reactive proxy.
         * The proxy will get the following extra properties:
         * * `__isProxy` - A boolean indicating that this is a reactive proxy
         * * `__binding` - The binding instance
         * @param {string} prefix The prefix to bind to
         * @param {object} object The object to wrap
         * @param {object} options Options for the binding
         * @param {boolean} options.recursive Whether to recursively bind nested objects
         * @param {boolean} options.fallback Fallback object to use when the key is not found
         * @returns {Proxy} The reactive proxy object
         */

        wrap(prefix, object = {}, options = {}){
            if(typeof prefix === "string") prefix += "."; else prefix = "";

            let binding = this.bindCache.get(prefix);
            if(!binding) {
                binding = new ReactiveBinding(object);
                this.bindCache.set(prefix, binding);
            } else {
                binding.object = object;
            }

            return binding.bindTo(prefix, object, options);
        }

        /**
         * Same as wrap(), but changes will not mutate the original object.
         * The proxy will also get the following properties:
         * * `__parent` - The original object
         * * `__data` - Forked object
         * * `__reset()` - A function to reset the binding (clears changes and reverts to the original object)
         * 
         * @param {string} prefix The prefix to bind to
         * @param {object} object The object to fork
         * @param {object} data New object, defaults to an empty object
         * @param {object} options Options for the binding (same as wrap())
         * @returns {Proxy} The reactive proxy object
         */

        fork(prefix, object, data = {}, options = {}){
            return this.wrap(prefix, data || {}, {
                ...options,
                fallback: object
            });
        }

        /**
         * Binds an existing object property and key without wrapping
         * @param {string} path The path and key to bind to
         * @param {object} object The object with the property to bind
         */

        bind(path, object){
            const [prefix, key] = this.splitPath(path);

            let binding = this.bindCache.get(prefix);
            if (!binding) {
                binding = new ReactiveBinding(object);
                this.bindCache.set(prefix, binding);
            }

            Object.defineProperty(object, key, {
                get: () => binding.object[key],
                set: (value) => {
                    binding.object[key] = value;
                    binding.updated = true;
                    this.renderKey(key, binding);
                },

                configurable: true
            });

            return object;
        }

        /**
         * Renders all bindings in the cache (everything from any bound element)
         * @param {Array<ReactiveBinding>} bindings An array of bindings to render, defaults to all bindings in the cache
         */

        renderAll(bindings){
            for(let binding of Array.isArray(bindings)? bindings: this.bindCache.values()) {            
                if(binding && binding.object && binding.updated) this.render(binding);
            }
        }

        /**
         * Renders a binding object
         * @param {object} binding The binding object to render
         * @param {string} specificKey A specific key to render
         */

        render(binding){
            if(!binding) return this.renderAll();
            if(!binding.source && !binding.object) return;

            binding.updated = false;

            for(let key of binding.keys.keys()) {
                this.renderKey(key, binding);
            }
        }

        renderKey(key, binding){
            const cache = binding.keys.get(key);
            if(!cache || cache.size === 0) return;

            const source = binding.source || binding.object;
            for(let target of cache) {
                this.renderValue(target, key, source);
            }
        }

        renderValue(target, key, source){
            let value = source[key];

            if(typeof value === "function") value = value();

            if(!value && target.__reactive.or) {
                value = target.__reactive.or;
            }

            if(target.__reactive.default && (typeof value === "undefined" || value === null)) {
                value = target.__reactive.default;
            }

            // Try getting the type again
            if(typeof target.__reactive.type === "string") {
                target.__reactive.type = this.types.get(target.__reactive.type.toLowerCase()) || target.__reactive.type;
            }

            if(typeof target.__reactive.type === "function") {
                value = target.__reactive.type(value, target.__reactive.args || [], target, source, key);
            }

            if(target.__reactive.value_prefix) {
                value = target.__reactive.value_prefix + value;
            }

            if(value instanceof Element) {
                target.replaceChildren(value);
                return;
            }

            if(target.__reactive.attribute) {
                target.setAttribute(target.__reactive.attribute, value);
                return;
            }

            if(target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {

                if(target.type === "checkbox") target.checked = Boolean(value);
                else target.value = value;

            } else if(target.tagName === "IMG" || target.tagName === "VIDEO" || target.tagName === "AUDIO") {

                target.src = value;

            } else {

                if(target.__reactive.raw) target.innerHTML = value; else target.textContent = value;

            }
        }
    }, { name: "Reactive", singular: true, global: true })
})();
