/**
 * A simple yet powerful, fast and lightweight reactive library for LS
 * @version 1.0.0
 */

LS.LoadComponent(class Reactive extends LS.Component {
    constructor(){
        super()

        this.bindCache = new Map();

        this.global = this.wrap(null, {}, true);

        window.addEventListener("DOMContentLoaded", () => {
            this.scan();
        })
    }

    /**
     * Scans the document or specific element for elements with the data-reactive attribute and caches them
     * @param {HTMLElement} scanTarget The target element to scan
     */

    scan(scanTarget = document.body){
        const scan = scanTarget.querySelectorAll(`[data-reactive]`);

        for(let target of scan) {
            this.bindElement(target);
        }
    }

    /**
     * Parses the data-reactive attribute of an element and caches it for lookup
     * @param {HTMLElement} target The target element to bind
     */

    bindElement(target, defaultBind = null){
        const attribute = defaultBind || target.getAttribute("data-reactive");
        if(!attribute || target.__last_bind === attribute) return;

        if(target.__last_bind) this.unbindElement(target, true);

        target.__last_bind = attribute;

        const [prefix, raw_key] = this.split_path(attribute);
        if(!raw_key) return;

        const key = this.constructor.parseKey(prefix, raw_key);

        target.__reactive = key;

        let binding = this.bindCache.get(prefix);

        if(!binding) {
            binding = { object: null, updated: false, keys: new Map };
            this.bindCache.set(prefix, binding);
        }

        const cache = binding.keys.get(key.name);
        if(cache) cache.add(target); else binding.keys.set(key.name, new Set([target]));

        if(binding.object) this.renderValue(target, binding.object[key.name]);
    }

    /**
     * Removes a binding from an element
     * @param {HTMLElement} target The target element to unbind
     */

    unbindElement(target, keepAttribute = false){
        if(!keepAttribute) target.removeAttribute("data-reactive");
        if(!target.__last_bind) return;

        const [prefix, raw_key] = this.split_path(target.__last_bind);

        delete target.__last_bind;
        delete target.__reactive;

        if(!raw_key) return;

        let binding = this.bindCache.get(prefix);
        if(!binding) return;

        const key = this.constructor.parseKey(prefix, raw_key);

        const cache = binding.keys.get(key.name);
        if(cache) cache.delete(target);
    }


    /**
     * A fast, light parser to expand a key to an object with dynamic properties, eg. "username || anonymous".
     * @param {string} key The key string to parse
    */

    static parseKey(prefix, key){
        let i = 0, v_start = 0, v_propety = null, state = 0, string_char = null;

        const result = {
            prefix, name: null
        };

        while(++i < key.length) {
            const char = key.charCodeAt(i);
            const isLast = i === key.length - 1;

            if(!result.name) {
                if(!this.matchKeyword(char) || isLast) {
                    if(char === 58){
                        result.type = this.types.get(key.slice(v_start, i).toLowerCase());
                        v_start = i + 1;
                        continue;
                    }

                    if(isLast && this.matchKeyword(char)) i++;
                    result.name = key.slice(v_start, i);
                }

                if(!isLast && this.matchKeyword(char)) continue;
            }

            if(state === 2) {
                if(char === string_char) {
                    result[v_propety] = key.slice(v_start, i);
                    state = 0;
                }
                continue;
            }

            if(this.matchWhitespace(char)) continue;

            if(state === 1) {
                if(this.matchStringChar(char)) {
                    string_char = char;
                    v_start = i + 1;
                    state = 2;
                }
                continue;
            }

            switch(char) {
                case 124: // | - Or
                    if(key.charCodeAt(i + 1) === 124) {
                        i++;
                        v_propety = "or";
                        state = 1;
                        break;
                    }
                    console.warn("You have a syntax error in key: " + key);
                    return result; // Invalid
                
                case 63: // ? - Default
                    if(key.charCodeAt(i + 1) === 63) {
                        i++;
                        v_propety = "default";
                        state = 1;
                        break;
                    }
                    console.warn("You have a syntax error in key: " + key);
                    return result; // Invalid
                
                case 33: // ! - Raw HTML
                    result.raw = true;
                    break;
            }
        }

        return result;
    }

    static matchKeyword(char){
        return (
            (char >= 48 && char <= 57) || // 0-9
            (char >= 65 && char <= 90) || // A-Z
            (char >= 97 && char <= 122) || // a-z
            char === 95 || // _
            char === 45    // -
        )
    }

    static matchWhitespace(char){
        return char === 32 || char === 9 || char === 10 || char === 13;
    }

    static matchStringChar(char){
        return char === 34 || char === 39 || char === 96;
    }

    static types = new Map([
        ["string", String],
        ["number", Number],
        ["boolean", Boolean],
        ["array", Array],
        ["object", Object],
        ["function", Function]
    ]);

    split_path(path){
        const lastIndex = path.lastIndexOf(".");
        const prefix = lastIndex === -1? "": path.slice(0, path.lastIndexOf(".") +1);
        if(prefix) path = path.slice(lastIndex + 1);

        return [prefix, path];
    }


    /**
     * Wraps an object with a reactive proxy
     * @param {string} prefix The prefix to bind to
     * @param {object} object The object to wrap
     * @param {boolean} recursive Whether to recursively bind all objects
     */

    wrap(prefix, object = {}, recursive = false){
        if(typeof prefix === "string") prefix += "."; else prefix = "";

        if(recursive) for(let key in object) {
            if(typeof object[key] === "object" && object[key] !== null && object[key].__isProxy === undefined && Object.getPrototypeOf(object[key]) === Object.prototype) {
                object[key] = this.wrap(prefix + key, object[key], true);
            }
        }

        if(object.__isProxy) return object;

        let binding = this.bindCache.get(prefix);

        if(!binding) {
            binding = { object, updated: true, keys: new Map };
            this.bindCache.set(prefix, binding);
        } else {
            binding.object = object;
        }

        this.render(binding);

        return new Proxy(object, {
            set: (target, key, value) => {
                // Wrap new nested objects dynamically
                if(recursive && typeof value === "object" && value !== null && !value.__isProxy) {
                    value = this.wrap(prefix + key, value, true);
                    target[key] = value;
                    return;
                }

                target[key] = value;
                binding.updated = true;
                this.renderKey(key, target, binding.keys.get(key));
            },

            get: (target, key) => key === "__isProxy"? true: key === "__binding"? binding: target[key],

            deleteProperty: (target, key) => {
                delete target[key];
                this.renderKey(key, target, binding.keys.get(key));
            }
        })
    }

    /**
     * Binds an existing object property without wrapping
     * @param {string} path The path and key to bind to
     * @param {object} object The object with the property to bind
     */

    bind(path, object){
        const [prefix, key] = this.split_path(path);

        let binding = this.bindCache.get(prefix);
        if (!binding) {
            binding = { object: object, updated: true, keys: new Map() };
            this.bindCache.set(prefix, binding);
        }

        Object.defineProperty(object, key, {
            get: () => binding.object[key],
            set: (value) => {
                binding.object[key] = value;
                binding.updated = true;
                this.renderKey(key, binding.object, binding.keys.get(key));
            },

            configurable: true
        });

        return object;
    }

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
        if(!binding.object) return;

        binding.updated = false;

        for(let [key, cache] of binding.keys) {
            this.renderKey(key, binding.object, cache);
        }
    }

    renderKey(key, source, cache){
        if(!cache || cache.size === 0) return;

        const value = source[key];
        for(let target of cache) {
            this.renderValue(target, value);
        }
    }

    renderValue(target, value){
        if(typeof value === "function") value = value();

        if(!value && target.__reactive.or) {
            value = target.__reactive.or;
        }

        if(target.__reactive.default && (typeof value === "undefined" || value === null)) {
            value = target.__reactive.default
        }

        if(typeof target.__reactive.type === "function") {
            value = target.__reactive.type(value);
        }

        if(target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {

            if(target.type === "checkbox") target.checked = Boolean(value);
            else target.value = value;

        } else {

            if(target.__reactive.raw) target.innerHTML = value; else target.textContent = value;

        }
    }
}, { name: "Reactive", singular: true, global: true })
