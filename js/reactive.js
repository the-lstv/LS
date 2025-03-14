LS.LoadComponent(class Reactive extends LS.Component {
    constructor(options = {}){
        super()

        this.bindCache = new Map();
        this.global = this.wrap(null, options.global || {});

        window.addEventListener("load", () => {
            this.scan();
            this.renderAll();
        })
    }

    split_path(path){
        const lastIndex = path.lastIndexOf(".");
        const prefix = lastIndex === -1? "": path.slice(0, path.lastIndexOf(".") +1);
        if(prefix) path = path.slice(lastIndex + 1);

        return [prefix, path];
    }

    scan(scanTarget = document.body){
        const scan = scanTarget.querySelectorAll(`[data-reactive]`);

        for(let target of scan) {
            const [prefix, key] = this.split_path(target.getAttribute("data-reactive"));
            if(!key) continue;

            let binding = this.bindCache.get(prefix);

            if(!binding) {
                binding = { object: null, updated: false, keys: new Map };
                this.bindCache.set(prefix, binding);
            }

            const cache = binding.keys.get(key);
            if(cache) cache.add(target); else binding.keys.set(key, new Set([target]));

            this.render(binding);
        }
    }

    /**
     * Wraps an object with a reactive proxy
     * @param {string} prefix The prefix to bind to
     * @param {object} object The object to wrap
     * @param {boolean} recursive Whether to recursively bind all objects
     */

    wrap(prefix, object, recursive = false){
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
                this.render(binding);
            },

            get: (target, key) => key === "__isProxy"? true: key === "__binding"? binding: target[key],

            deleteProperty: (target, key) => {
                delete target[key];
                this.render(binding);
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
                this.render(binding);
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
     */

    render(binding){
        if(!binding) return this.renderAll();
        if(!binding.object) return;

        binding.updated = false;

        for(let [key, cache] of binding.keys) {
            for(let target of cache) {
                target.textContent = binding.object[key];
                console.log("Rendering: ", target, binding.object[key]);
            }
        }
    }
}, { name: "Reactive", singular: true, global: true })