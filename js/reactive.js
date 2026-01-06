/**
 * A simple yet powerful, fast and lightweight reactive library for LS
 * @version 2.0.0
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
        constructor(object, prefix, options = {}) {
            super();

            // TODO:
            const existing = LSReactive.objectCache.get(prefix);
            if(existing && !existing._destroyed) {
                return existing;
            }

            if(typeof prefix === "string") { if (!prefix.endsWith(".")) prefix += "."; } else prefix = "";

            this.prefix = prefix;
            this.key = prefix.slice(prefix.lastIndexOf(".", prefix.length - 2) + 1, prefix.length - 1);

            this.object = object;
            this.options = options;
            this.mappings = new Map();

            this.updated = true;
            this.mutated = false;
            
            this.children = new Map();
            this._parent = options.parent || LSReactive.getBinding(prefix.slice(0, prefix.length - this.key.length));
            if(this._parent) {
                this._parent.children.set(this.key, this);
            }

            LSReactive.objectCache.set(this.prefix, this);

            this._pending = new Set();
            this._renderScheduled = false;
            this._destroyed = false;

            this.proxy = new Proxy(this.object, {
                set: (target, key, value) => {
                    if(this.options.extends && this.mutated === false) {
                        this.emit("mutated");
                        this.mutated = true;
                    }

                    this.object[key] = value;
                    this.updated = true;
                    this.renderKey(key);
                    return true;
                },

                get: (_, key) => {
                    if (key === "__isProxy") return true;
                    if (key === "__binding") return this;
                    if (this.options.extends && key === "__reset") return () => this.reset();

                    const value = (this.options.extends && !this.object.hasOwnProperty(key)? this.options.extends[key]: this.object[key]);
                    if(typeof value === "object" && value !== null && !value.__isProxy) {
                        const wrap = this.children.get(key) || LSReactive.wrap(this.prefix + key, value, {
                            parent: this,
                            extends: this.options.extends ? this.options.extends[key] : null
                        });
                        return wrap;
                    }

                    return value;
                },

                deleteProperty: (_, key) => {
                    const value = this.object[key];
                    const binding = (typeof value === "object" && value !== null && value.__isProxy)? value.__binding: null;

                    delete this.object[key];
                    this.renderKey(key);

                    if(binding) {
                        binding?.destroy();
                    }
                    return true;
                }
            });
        }

        #processPending() {
            if (this._destroyed) return;
            const pendingTargets = LSReactive.pending.get(this.prefix);
            if (pendingTargets) {
                for (const target of pendingTargets) {
                    const cache = this.mappings.get(target.__reactive_binding.name);
                    if (cache) cache.add(target); else this.mappings.set(target.__reactive_binding.name, new Set([target]));
                    this.renderValue(target, target.__reactive_binding.name);
                }
                LSReactive.pending.delete(this.prefix);
            }
        }

        get parent() {
            // TODO: Traverse up the chain
            return this._parent;
        }

        /**
         * Renders all keys in the binding.
         * @returns {void}
         */
        render(){
            this.updated = false;

            for(let key of this.mappings.keys()) {
                this.renderKey(key);
            }
        }

        /**
         * Renders a specific key in the binding.
         * @param {*} key The key to render
         * @returns {void}
         */
        renderKey(key){
            if(this._destroyed) return;
            
            this._pending.add(key);

            if (this._renderScheduled) return;
            this._renderScheduled = true;

            queueMicrotask(() => {
                if (this._destroyed) return;
                this._renderScheduled = false;

                for (const key of this._pending) {
                    this.renderKeyImmediate(key);
                }
                this._pending.clear();
            });
        }

        /**
         * Renders a specific key in the binding immediately without batching.
         * @param {*} key The key to render
         * @returns {void}
         */
        renderKeyImmediate(key){
            if(this._destroyed) return;
            const cache = this.mappings.get(key);

            console.log("Rendered key", key, "for binding", this);

            if (this.parent && !this._bubbled) {
                this._bubbled = true;
                queueMicrotask(() => {
                    this._bubbled = false;
                    this.parent.renderKey(this.key);
                    console.log("Propagating to", this.parent, this.key);
                });
            }

            if(!cache || cache.size === 0) return;
            for(let target of cache) {
                this.renderValue(target, key);
            }
        }

        renderValue(target, key, source = this.proxy || this.object){
            let value = source[key];

            if(typeof value === "function") value = value();

            if(!value && target.__reactive_binding.or) {
                value = target.__reactive_binding.or;
            }

            if(target.__reactive_binding.default && (typeof value === "undefined" || value === null)) {
                value = target.__reactive_binding.default;
            }

            // Try getting the type again
            if(typeof target.__reactive_binding.type === "string") {
                target.__reactive_binding.type = LSReactive.types.get(target.__reactive_binding.type.toLowerCase()) || target.__reactive_binding.type;
            }

            if(typeof target.__reactive_binding.type === "function") {
                value = target.__reactive_binding.type(value, target.__reactive_binding.args || [], target, source, key);
            }

            if(target.__reactive_binding.value_prefix) {
                value = target.__reactive_binding.value_prefix + value;
            }

            if(value instanceof Element) {
                target.replaceChildren(value);
                return;
            }

            if(target.__reactive_binding.attribute) {
                target.setAttribute(target.__reactive_binding.attribute, value);
                return;
            }

            if(target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {

                if(target.type === "checkbox") target.checked = Boolean(value);
                else target.value = value;

            } else if(target.tagName === "IMG" || target.tagName === "VIDEO" || target.tagName === "AUDIO") {

                target.src = value;

            } else {

                if(target.__reactive_binding.raw) target.innerHTML = value; else target.textContent = value;

            }
        }

        /**
         * Resets the binding to its initial state by clearing values.
         * This is slower but keeps the original reference.
         * @returns {boolean} True if the reset was successful
         */
        reset() {
            for (const key of Object.keys(this.object)) {
                delete this.object[key];
            }

            this.render();
            this.mutated = false;
            this.emit("reset", [true]);
            return true;
        }

        /**
         * Drops all connected elements (does not unbind them!).
        */
        drop() {
            this.mappings.clear();
        }

        destroy() {
            LSReactive.objectCache.delete(this.prefix);

            this.object = null;
            if(this._parent) {
                this._parent.children.delete(this.prefix);
            }

            this._parent = null;

            this.options = null;
            this.mappings.clear();

            this.proxy = null;

            this._renderScheduled = false;
            this._pending.clear();
            this._pending = null;

            this.prefix = null;
            this._destroyed = true;

            for(let child of this.children.values()) {
                child.destroy();
            }

            this.children.clear();
            this.children = null;

            this.emit("destroy");
            this.events.clear();
            this.events = null;
        }
    }

    class ReactiveScope {
        constructor(parent = null) {
            // TODO:
        }
    }

    LS.LoadComponent(class Reactive extends LS.Component {
        EMPTY_PATH = Object.freeze([ null, null, null ]);

        types = new Map([
            ["string", String],
            ["number", Number],
            ["boolean", Boolean],
            ["array", Array],
            ["object", Object],
            ["function", Function],
            ["date", Date],
            ["regexp", RegExp]
        ]);

        registerType(name, func){
            if(typeof name !== "string" || !name.trim()) {
                throw new Error("Invalid type name: " + name);
            }

            if(typeof func !== "function") {
                throw new Error("Invalid type function: " + func);
            }

            this.types.set(name.toLowerCase(), func);
        }

        constructor() {
            super();
            this.objectCache = new Map();
            this.pending = new Map();

            // Marjor version
            // If this differs, compatibility is not guaranteed
            this.v = 2;
            LSReactive = this;

            window.addEventListener("DOMContentLoaded", () => {
                this.scan();
            });
        }

        /**
         * Wraps an object with a reactive proxy.
         * The proxy will get the following extra properties:
         * * `__isProxy` - A boolean indicating that this is a reactive proxy
         * * `__binding` - The binding instance
         * @param {string} prefix The prefix to bind to
         * @param {object} object The object to wrap
         * @param {object} options Options for the binding
         * @param {boolean} options.fallback Fallback object to use when the key is not found
         * @returns {Proxy} The reactive proxy object
         */
        wrap(prefix, object, options = {}) {
            if(typeof prefix === "string") { if (!prefix.endsWith(".")) prefix += "."; } else prefix = "";
            if (this.objectCache.has(prefix)) return this.objectCache.get(prefix);
            const binding = new ReactiveBinding(object, prefix, options);
            return binding.proxy;
        }

        /**
         * Forks an object into a new reactive proxy without mutating the original object.
         * Mutating this proxy will affect only the new object.
         * There will be an extra `__reset()` function to reset the binding back to the original object's state.
         * @param {*} prefix The prefix to bind to
         * @param {*} object The object to fork
         * @param {*} data New object to patch new values to, defaults to an empty object
         * @param {*} options Options for the binding (same as wrap())
         * @returns 
         */
        fork(prefix, object, data, options = {}) {
            options.fallback = object;
            return this.wrap(prefix, data || {}, options);
        }

        /**
         * TODO:
         * getter/setter binds
         * @param {*} value 
         */
        // ref(value) {}

        getBinding(prefix) {
            if(typeof prefix === "string") { if (!prefix.endsWith(".")) prefix += "."; } else prefix = "";
            return this.objectCache.get(prefix);
        }

        /**
         * Splits a path into prefix, key name and extras
         * Eg. "user.name extra stuff" => [ "user.", "name", " extra stuff" ]
         * Note that leading whitespace is trimmed so joining won't produce the exact original string
         * @param {*} path The path to split
         * @returns {Array} An array like [prefix, name, extra]
         */

        splitPath(path){
            if(!path) return this.EMPTY_PATH;

            let padding = true, start = 0, ld = path.length, end = null;
            for(let i = 0; i < path.length; i++) {
                const char = path.charCodeAt(i);

                // Trim initial whitespace
                if(padding && this.#matchWhitespace(char)) {
                    if(i === path.length - 1) {
                        return this.EMPTY_PATH;
                    }

                    if(!padding) {
                        end = i;
                        break;
                    }

                    start++;
                    continue;
                } else padding = false;

                if(char === 46) {
                    ld = i;
                    continue;
                }

                if(!this.#matchKeyword(char)) {
                    if(ld === path.length) ld = i;
                    end = i;
                    break;
                }
            }

            const dotFound = ld < path.length && path.charCodeAt(ld) === 46;
            return [ path.slice(start, dotFound ? (ld +1) : ld) + (dotFound ? "" : "."), dotFound ? path.slice(ld + 1, end || path.length) : null, end? path.slice(end) : null ];
        }

        /**
         * A light parser to parse extra properties, eg. "username || anonymous".
         * @param {string} expr The expression to parse
         * @param {Object} result An optional object to fill with results
         * @returns {Object} An object with parsed properties
        */
        parseExpression(expr, result = {}) {
            let i = -1, state = 0, v_start = 0, v_property = null, string_char = null, len = expr.length;

            while(++i < len) {
                const char = expr.charCodeAt(i);

                // Inside string
                if(state === 3) {
                    if(char === string_char) {
                        result[v_property] = expr.slice(v_start, i);
                        state = 0;
                    }
                    continue;
                }

                // Ignore whitespace
                if(this.#matchWhitespace(char)) continue;

                // Early check for ":", since it can only exist at the start
                if(state === 0) {
                    if(char === 58){ // :
                        v_start = i + 1;
                        state = 4;
                        continue;
                    }

                    state = 1;
                }

                if(state === 4) {
                    if(this.#matchKeyword(expr.charCodeAt(i + 1)) && i !== len - 1) continue;

                    const type = expr.slice(v_start, i + 1).toLowerCase();
                    result.type = this.types.get(type) || type;

                    if(expr.charCodeAt(i + 1) === 40) { // (
                        i++;
                        v_start = i + 1;
                        state = 5;
                        continue;
                    }

                    state = 1;
                }

                if (state === 5) {
                    let args = [];
                    while (i < len && expr.charCodeAt(i) !== 41) { // )
                        const startChar = expr.charCodeAt(i);
                        if (!this.#matchWhitespace(startChar)) {
                            let arg_start = i;

                            // Find end of argument (comma or closing parenthesis)
                            while (i < len) {
                                const char = expr.charCodeAt(i);
                                if (char === 44 || char === 41) break; // , or )
                                i++;
                            }

                            // Trim trailing whitespace manually to avoid allocation
                            let arg_end = i;
                            while (arg_end > arg_start && this.#matchWhitespace(expr.charCodeAt(arg_end - 1))) {
                                arg_end--;
                            }

                            args.push(expr.slice(arg_start, arg_end));

                            if (expr.charCodeAt(i) === 44) i++; // Skip comma
                        } else {
                            i++;
                        }
                    }
                    result.args = args;
                    state = 1;
                }

                if(state === 2) {
                    if(this.#matchStringChar(char)) {
                        string_char = char;
                        v_start = i + 1;
                        state = 3;
                    }
                    continue;
                }

                switch(char) {
                    case 124: // | - Or
                        if(expr.charCodeAt(i + 1) === 124) {
                            i++;
                            v_property = "or";
                            state = 2;
                            break;
                        }

                        console.warn("You have a syntax error in key: " + expr);
                        return result; // Invalid
                    
                    case 63: // ? - Default
                        if(expr.charCodeAt(i + 1) === 63) {
                            i++;
                            v_property = "default";
                            state = 2;
                            break;
                        }

                        console.warn("You have a syntax error in key: " + expr);
                        return result; // Invalid
                    
                    case 33: // ! - Raw HTML
                        result.raw = true;
                        break;
                }
            }

            return result;
        }

        #matchKeyword(char){
            return (
                (char >= 48 && char <= 57) || // 0-9
                (char >= 65 && char <= 90) || // A-Z
                (char >= 97 && char <= 122) || // a-z
                char === 95 || // _
                char === 45    // -
            )
        }

        #matchWhitespace(char){
            return char === 32 || char === 9 || char === 10 || char === 13;
        }

        #matchStringChar(char){
            return char === 34 || char === 39 || char === 96;
        }

        parseBindingString(bindingString, expression = {}) {
            let prependValue = null;
            if(this.#matchStringChar(bindingString.charCodeAt(0))) {
                const string_char = bindingString.charAt(0);
                const end = bindingString.indexOf(string_char, 1);
                if(end === -1) {
                    console.warn("Invalid reactive attribute: " + bindingString);
                    return null;
                }

                prependValue = bindingString.slice(1, end);
                bindingString = bindingString.slice(end + 1);
            }

            if(prependValue !== null) {
                expression.prependValue = prependValue;
            }

            const parts = this.splitPath(bindingString);
            
            expression.prefix = parts[0];
            expression.name = parts[1];
            if(parts[2] !== null) this.parseExpression(parts[2], expression);

            return expression;
        }

        #hash(string) {
            let hash = 0, i, chr;
            if (string.length === 0) return hash;
            for (i = 0; i < string.length; i++) {
                chr   = string.charCodeAt(i);
                hash  = ((hash << 5) - hash) + chr;
                hash |= 0; // Convert to 32bit integer
            }
            return hash;
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
         * Binds an element to the reactive system
         * @param {HTMLElement} target The target element to bind
         * @param {string} [override] Optional override for the binding string
         * @returns {void}
         */
        bindElement(target, override) {
            const bindingString = override || target.getAttribute("data-reactive");
            if(!bindingString || (target.__bindHash && target.__bindHash === this.#hash(bindingString))) return;

            if(target.__bindHash) this.unbindElement(target, true);
            target.__bindHash = this.#hash(bindingString);

            const parsed = this.parseBindingString(bindingString);
            if(!parsed || !parsed.prefix) return;

            target.__reactive_binding = parsed;

            const binding = this.objectCache.get(parsed.prefix);
            if(!binding) {
                // TODO: Walk up recursive bindings to see if target already exists
                const pending = this.pending.get(parsed.prefix);
                if(pending) pending.push(target); else this.pending.set(parsed.prefix, [target]);
                return;
            }

            const cache = binding.mappings.get(parsed.name);
            if(cache) cache.add(target); else binding.mappings.set(parsed.name, new Set([target]));
            binding.renderValue(target, parsed.name);
        }

        /**
         * Unbinds an element from the reactive system
         * @param {HTMLElement} target The target element to unbind
         * @param {boolean} keepAttribute Whether to keep the data-reactive attribute
         * @returns {void}
         */
        unbindElement(target, keepAttribute = false) {
            if(!keepAttribute) {
                target.removeAttribute("data-reactive");
            }

            if(!target.__bindHash) return;

            const binding = this.objectCache.get(target.__reactive_binding.prefix);
            if(binding) {
                const cache = binding.mappings.get(target.__reactive_binding.name);
                if(cache) cache.delete(target);
            }

            if(target.__reactive_binding) {
                target.__reactive_binding = null;
                delete target.__reactive_binding;
            }

            target.__bindHash = null;
            delete target.__bindHash;
        }

        /**
         * Renders all bindings in the cache (everything from any bound element)
         * @param {Array<ReactiveBinding>} bindings An array of bindings to render, defaults to all bindings in the cache
         */
        renderAll(bindings){
            for(let binding of Array.isArray(bindings)? bindings: this.objectCache.values()) {            
                if(binding && binding.object && binding.updated) binding.render();
            }
        }

        /**
         * Renders a binding object
         * @param {object} binding The binding object to render
         */
        render(binding){
            if(typeof binding === "undefined") return this.renderAll();
            if(binding.object && binding.updated) return binding.render();
            return null;
        }

    }, { name: "Reactive", singular: true, global: true });
})();