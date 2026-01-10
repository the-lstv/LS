/**
 * A simple yet powerful, fast and lightweight reactive library for LS
 * @version 2.0.0
 * 
 * TODO: Support attribute binding
 * TODO: Bind multiple values (eg. {{ user.displayname || user.username }})
 *
 * TODO: Array bindings ("user.friends.0.name", "user.friends[0].name", "each user.friends { ... }")
 * TODO: Event bindings ("@click user.clicked()")
 * 
 * TODO: Optimize propagation and path walking
 */


(() => {
    let LSReactive;

    class ReactiveBinding extends LS.EventHandler {
        constructor(object, prefix, options = {}) {
            super();

            const existing = LSReactive.objectCache.get(prefix);
            if(existing && !existing.destroyed) {
                return existing;
            }

            if(typeof prefix === "string") { if (!prefix.endsWith(".")) prefix += "."; } else prefix = "";

            this.prefix = prefix;

            this.object = object;
            this.options = options;
            this.mappings = new Map();

            this.updated = true;
            this.mutated = false;
            this.mutatedKeys = new Set();

            LSReactive.objectCache.set(this.prefix, this);

            this._pending = new Set();
            this._renderScheduled = false;
            this.destroyed = false;

            this.proxyCache = new WeakMap();

            this.#processPending();
        }

        registerProperty(virtualKey, physicalKey = null, defaultValue = undefined) {
            if(physicalKey === null) physicalKey = "_" + virtualKey;
            if(!this.object.hasOwnProperty(physicalKey) && typeof defaultValue !== "undefined") {
                this.object[physicalKey] = defaultValue;
            }

            Object.defineProperty(this.object, virtualKey, {
                get: () => {
                    return this.#get(this.object, physicalKey, "", false);
                },

                set: (value) => {
                    this.#set(this.object, physicalKey, value);
                },

                enumerable: true,
                configurable: true
            });
        }

        get proxy () {
            if(this.destroyed) return null;
            return this.#createProxy(this.object);
        }

        #createProxy(object, objectPath = "") {
            if(this.proxyCache.has(object)) {
                return this.proxyCache.get(object);
            }

            if(objectPath && !objectPath.endsWith(".")) {
                objectPath += ".";
            }

            const proxy = new Proxy(object, {
                set: (target, key, value) => {
                    if(this.destroyed) throw new TypeError("Can't access a proxy of a destroyed ReactiveBinding");

                    return this.#set(target, key, value, objectPath);
                },

                get: (target, key) => {
                    if(this.destroyed) throw new TypeError("Can't access a proxy of a destroyed ReactiveBinding");

                    if (key === "__isProxy") return true;
                    if (key === "__bind") return this;
                    if (key === "hasOwnProperty") return target.hasOwnProperty.bind(target);

                    return this.#get(target, key, objectPath);
                },

                deleteProperty: (target, key) => {
                    if(this.destroyed) throw new TypeError("Can't access a proxy of a destroyed ReactiveBinding");

                    delete target[key];
                    this.renderKey(objectPath + key);
                    return true;
                }
            });

            this.proxyCache.set(object, proxy);
            object = null; // We can't use the object reference anymore
            return proxy;
        }

        #set(object, key, value, objectPath = "") {
            if(this.destroyed) return false;

            const fullPath = objectPath + key;
            if(this.options.extends) {
                if(!this.mutated) {
                    this.emit("mutated");
                    this.mutated = true;
                }

                this.mutatedKeys.add(fullPath);
            }

            object[key] = value;
            this.updated = true;
            this.renderKey(fullPath);
            return true;
        }

        #isDeepObject(value) {
            return (typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date) && !(value instanceof RegExp) && !(value instanceof Function) && !(value instanceof Element));
        }

        #get(object, key, objectPath = "", nest = true) {
            if(this.destroyed) return null;

            const hasOwn = object.hasOwnProperty(key);

            if(hasOwn && !this.options.extends) {
                if(!hasOwn) return undefined;

                const value = object[key];
                if(!nest || this.options.shallow) return value;

                // Nesting
                if(!this.#isDeepObject(value)) return value;

                const fullPath = objectPath + key;
                return this.#createProxy(value, fullPath);
            } else {
                // Fallback to extends
                const fullPath = objectPath + key;
                const value = this.walkObjectPath(fullPath, this.options.extends, false);
                if(!nest || this.options.shallow) return value;

                // Nesting
                if(!this.#isDeepObject(value)) return value;

                object[key] = {};
                return this.#createProxy(object[key], fullPath);
            }
        }

        #processPending() {
            if (this.destroyed) return;
            const pendingTargets = LSReactive.pending.get(this.prefix);

            if (pendingTargets) {
                for (const target of pendingTargets) {
                    this.addTarget(target.__reactive_binding.path, target);
                }
                LSReactive.pending.delete(this.prefix);
            }
        }

        addTarget(path, target) {
            if(this.options.collapseValue && path === null) path = "_value";

            const cache = this.mappings.get(path);
            if(cache) cache.add(target); else this.mappings.set(path, new Set([target]));
            this.renderValue(target, this.walkObjectPath(path), path);
        }

        removeTarget(path, target) {
            if(this.options.collapseValue && path === null) path = "_value";

            const cache = this.mappings.get(path);
            if(cache) {
                cache.delete(target);
                if(cache.size === 0) {
                    this.mappings.delete(path);
                }
            }
        }

        /**
         * Renders all or specific keys in the binding.
         * @param {array|Set<string>} [keys] An optional set of keys to render, defaults to all keys
         * @returns {void}
         */
        render(keys){
            this.updated = false;

            for(const key of keys || this.mappings.keys()) {
                this.renderKey(key);
            }
        }

        /**
         * Renders a specific key in the binding.
         * @param {*} key The key to render
         * @returns {void}
         */
        renderKey(key){
            if(this.destroyed || (this.options.propagate === false && !this.mappings.has(key))) return;
            this._pending.add(key);

            // TODO: This is just a quick implementation, needs to be optimized
            if(this.options.propagate !== false) {
                const parts = Array.isArray(key) ? key : key.split(".");
                for (let i = parts.length - 1; i > 0; i--) {
                    parts.pop();
                    const parentKey = parts.join(".");
                    this._pending.add(parentKey);
                }
            }
            
            if (this._renderScheduled) return;
            this._renderScheduled = true;
            
            queueMicrotask(() => {
                if (this.destroyed) return;
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
            if (this.destroyed) return;

            const cache = this.mappings.get(key);
            if (!cache || cache.size === 0) return;
            for (let target of cache) {
                this.renderValue(target, this.walkObjectPath(key), key);
            }
        }

        /**
         * This is currently a bottleneck and should be optimized ("obj.key" being fastest, "obj.a.b" being the slowest, especially with extends)
         * 
         * Though from my benchmarks, this is the fastest known way to walk a path.
         * 
         * @param {string|Array<string>} path The path to walk
         * @param {object} [object=this.object] The object to walk
         * @param {boolean} [fp=true] Whether to fallback to extends
         * @returns {*} The value at the path, or undefined if not found
         */
        walkObjectPath(path, object = this.object, fp = true) {
            if (object[path] !== undefined) return object[path];

            const ext = fp && this.options.extends;
            if (ext && ext[path] !== undefined) return ext[path];
            if (!path) return this.options.collapseValue ? object._value || ext._value : object;

            const parts = Array.isArray(path) ? path : path.split(".");

            let current = object;
            let fallback = ext;
            let usingFallback = false;

            for (const part of parts) {
                if (!part) continue;

                const next = (!usingFallback && current) ? current[part] : undefined;

                if (next !== undefined) {
                    current = next;

                    if (!usingFallback && fallback) {
                        const candidate = fallback[part];
                        fallback = candidate !== undefined ? candidate : undefined;
                    }

                    continue;
                }

                if (fallback) {
                    const fbNext = fallback[part];
                    if (fbNext === undefined) return undefined;

                    current = fbNext;
                    fallback = fbNext;
                    usingFallback = true;
                    continue;
                }

                return undefined;
            }

            return current;
        }

        renderValue(target, value, path = null) {
            if(this.destroyed || this.options.render === false) return;

            const config = target && target.__reactive_binding;
            if(!config) {
                this.removeTarget(path, target);
                return;
            }

            if(typeof this.options.render === "function") {
                try {
                    this.options.render.call(this, target, value);
                } catch (e) {
                    console.error("Error in custom render function for binding", this.prefix, e);
                }
                return;
            }

            try {
                if(typeof value === "function") value = value();

                // Try getting the type again
                if(typeof config.type === "string") {
                    config.type = LSReactive.types.get(config.type.toLowerCase()) || config.type;
                }

                if(typeof config.type === "function") {
                    value = config.type(value, config.args || [], target, this.proxy);
                }

                if(config.render === false) return;

                if(config.default && (typeof value === "undefined" || value === null)) {
                    value = config.default;
                }

                if(!value && config.or) {
                    value = config.or;
                }

                if(config.compare) {
                    value === config.compare;
                }

                if(config.prependValue) {
                    value = config.prependValue + value;
                }

                if(value instanceof Element) {
                    target.replaceChildren(value);
                    return;
                }

                if(config.attribute) {
                    target.setAttribute(config.attribute, value);
                    return;
                }

                if(target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {

                    if(target.type === "checkbox") target.checked = Boolean(value);
                    else target.value = value;

                } else if(target.tagName === "IMG" || target.tagName === "VIDEO" || target.tagName === "AUDIO") {

                    target.src = value;

                } else {

                    if(config.raw) target.innerHTML = value; else target.textContent = value;

                }
            } catch (e) {
                console.error("Error rendering target", target, "in binding", this.prefix, e);
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

            this.mutated = false;
            this.render(this.mutatedKeys);
            this.emit("reset", [this.mutatedKeys]);
            this.mutatedKeys.clear();
            return true;
        }

        /**
         * Applies mutated values to the original extended object and resets self.
         * Only works for forked bindings with an extends option set.
         * @returns {boolean} True if the sync was successful
         */
        sync() {
            if (!this.options.extends || !this.mutated) return false;

            const ext = this.options.extends;
            for (const key of this.mutatedKeys) {
                const value = this.walkObjectPath(key, this.object, false);
                if (value !== undefined) {
                    const parts = key.split(".");
                    let target = ext;
                    for (let i = 0; i < parts.length - 1; i++) {
                        if (target[parts[i]] === undefined) {
                            target[parts[i]] = {};
                        }
                        target = target[parts[i]];
                    }
                    target[parts[parts.length - 1]] = value;
                }
            }

            this.reset();
            this.emit("sync");
            return true;
        }

        /**
         * Drops and unbinds all connected elements to this binding.
         * @returns {void}
        */
        dropAll() {
            for (const cache of this.mappings.values()) {
                for (const element of cache) {
                    LSReactive.unbindElement(element);
                }
            }
            this.mappings.clear();
        }

        destroy() {
            LSReactive.objectCache.delete(this.prefix);

            this.object = null;

            this.options = null;
            this.dropAll();

            // Should drop all proxies, except some that somebody somehow stored a reference of, which we sadly can't revoke as its a weakmap
            this.proxyCache = null;

            this._renderScheduled = false;
            this._pending.clear();
            this._pending = null;

            this.prefix = null;

            this.destroyed = true;
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
            ["regexp", RegExp],
            ["json", (value) => {
                try {
                    return JSON.parse(value);
                } catch(e) {
                    console.warn("Reactive: Failed to parse JSON value:", value);
                    return null;
                }
            }],
            ["int", (value) => parseInt(value, 10)],
            ["float", (value) => parseFloat(value)],
            ["formatdate", (value, args) => {
                const date = new Date(value);
                if(args[0]) {
                    return date.toLocaleDateString(undefined, { dateStyle: args[0] });
                }
                return date.toLocaleDateString();
            }]
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

        createBinding(object, prefix, options = {}) {
            if(typeof prefix === "string") { if (!prefix.endsWith(".")) prefix += "."; } else prefix = "";

            if (this.objectCache.has(prefix)) {
                const existing = this.objectCache.get(prefix);
                if (!existing.destroyed) {
                    existing.destroy();
                }
            }
            return new ReactiveBinding(object, prefix, options);
        }

        /**
         * Wraps an object with a reactive proxy.
         * The proxy will get the following extra properties:
         * * `__isProxy` - A boolean indicating that this is a reactive proxy
         * * `__binding` - The binding instance
         * @param {string} prefix The prefix to bind to
         * @param {object} object The object to wrap
         * @param {object} options Options for the binding
         * @param {boolean} options.shallow Whether to only wrap the top-level object
         * @param {boolean|function} options.render Disables rendering if set to false, or replaces with a custom render function
         * @param {boolean} options.propagate Whether to propagate changes to parent bindings (eg. if user.data.name changes, user.data and user also update)
         * @param {boolean} options.extends Fallback object to use when the key is not found
         * @param {boolean} options.collapseValue Whether to collapse references to the object itself to its _value property (eg. if "test" is {_value: 5} and we bind {{ test }}, 5 will be used instead of the object)
         * @returns {Proxy} The reactive proxy object
         */
        wrap(prefix, object, options = {}) {
            const binding = this.createBinding(object, prefix, options);
            return binding.proxy;
        }

        /**
         * Forks an object into a new reactive proxy without mutating the original object.
         * Mutating this proxy will affect only the new object.
         * @param {*} prefix The prefix to bind to
         * @param {*} object The object to fork
         * @param {*} data New object to patch new values to, defaults to an empty object
         * @param {*} options Options for the binding (same as wrap())
         * @returns {Proxy} The reactive proxy object
         */
        fork(prefix, object, data, options = {}) {
            options.extends = object.__isProxy ? object.__bind?.object : object;
            return this.wrap(prefix, data || {}, options);
        }

        /**
         * Creates a shallow reactive reference object with a single "value" property.
         * @param {string} prefix The prefix to bind to
         * @param {*} value The initial value of the reference
         * @returns {object} The reference object with a "value" property
         * 
         * @example
         * const countRef = reactive.valueRef("count", 0);
         * countRef.value = 5;
         * 
         * // In HTML: {{ countRef }} <!-- This will update to 5 -->
         */
        valueRef(prefix, value) {
            const refObject = { value: value };
            const binding = this.createBinding(refObject, prefix, { shallow: true, propagate: false, collapseValue: true });
            binding.registerProperty("value", "_value", value);
            return refObject;
        }

        /**
         * Destroys a binding by its prefix.
         * @param {*} prefix The prefix of the binding to destroy
         * @returns {boolean} True if the binding was found and destroyed
         */
        destroyBinding(prefix) {
            const binding = this.objectCache.get(prefix);
            if(binding) {
                binding.destroy();
                return true;
            }
            return false;
        }

        /**
         * Destroys all bindings.
         * @returns {void}
         */
        destroyAll() {
            for(const binding of this.objectCache.values()) {
                binding.destroy();
            }
            this.objectCache.clear();
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

            let padding = true, start = 0, firstDot = -1, end = null;

            const strEnd = path.length - 1;
            for (let i = 0; i < path.length; i++) {
                const char = path.charCodeAt(i);

                // Trim initial whitespace
                if(padding && this.#matchWhitespace(char)) {
                    if(i === strEnd) {
                        return this.EMPTY_PATH;
                    }

                    if(!padding) {
                        end = i;
                        break;
                    }

                    start++;
                    continue;
                } else padding = false;

                if(char === 46) { // .
                    if (firstDot === -1) firstDot = i;
                    continue;
                }

                if (!this.#matchKeyword(char)) {
                    end = i;
                    break;
                }
            }

            const dotFound = firstDot !== -1;
            const identEnd = end === null ? path.length : end;

            return [
                dotFound? path.slice(start, firstDot + 1): path.slice(start, identEnd) + ".",
                dotFound? path.slice(firstDot + 1, identEnd): null,
                end ? path.slice(end) : null
            ];
        }

        /**
         * A light parser to parse extra properties, eg. "username || anonymous".
         * @param {string} expr The expression to parse
         * @param {Object} result An optional object to fill with results
         * @returns {Object} An object with parsed properties
        */
        parseExpression(expr, result = {}) {
            let i = 0, state = 0, v_start = 0, v_property = null, string_char = null, len = expr.length;

            for(; i < len; i++) {
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

                    case 61: // = - Compare
                        if(expr.charCodeAt(i + 1) === 61) {
                            i++;
                            v_property = "compare";
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
            expression.path = parts[1];
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

            let binding = this.objectCache.get(parsed.prefix);

            if(!binding) {
                // No binding route exists
                const pending = this.pending.get(parsed.prefix);
                if(pending) pending.push(target); else this.pending.set(parsed.prefix, [target]);
                return;
            }

            binding.addTarget(parsed.path, target);
        }

        /**
         * Unbinds an element from the reactive system
         * @param {HTMLElement} target The target element to unbind
         * @param {boolean} keepAttribute Whether to keep the data-reactive attribute
         * @returns {void}
         */
        unbindElement(target, keepAttribute = false) {
            if(!target) return;
            if(!keepAttribute) {
                target.removeAttribute("data-reactive");
            }

            if(!target.__bindHash) return;

            const binding = this.objectCache.get(target.__reactive_binding.prefix);
            if(binding) {
                binding.removeTarget(target.__reactive_binding.path, target);
            }

            if(target.__reactive_binding) {
                target.__reactive_binding = null;
                delete target.__reactive_binding;
            }

            target.__bindHash = null;
            delete target.__bindHash;
        }

        /**
         * Gets the value at a specific path in the reactive system
         * @param {string} fullPath The full path to get the value from
         * @returns {*} The value at the specified path, or undefined if not found
         */
        valueAt(fullPath) {
            const [prefix, path] = this.splitPath(fullPath);
            const binding = this.objectCache.get(prefix);
            if(!binding) return undefined;
            return binding.walkObjectPath(path);
        }

        /**
         * Renders all bindings in the cache (everything from any bound element)
         * @param {Array<ReactiveBinding>} bindings An array of bindings to render, defaults to all bindings in the cache
         */
        renderAll(bindings) {
            for(let binding of Array.isArray(bindings)? bindings: this.objectCache.values()) {            
                if(binding && binding.object && binding.updated) binding.render();
            }
        }

        /**
         * Renders a binding object
         * @param {object} binding The binding object to render
         */
        render(binding) {
            if(typeof binding === "undefined") return this.renderAll();
            if(binding.object && binding.updated) return binding.render();
            return null;
        }

    }, { name: "Reactive", singular: true, global: true });
})();