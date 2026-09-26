/**
 * Global shortcut manager API (not finalized)
 * @experimental May completely change in future versions, use carefully
 */
LS.ShortcutManager = class ShortcutManager extends LS.EventEmitter {
    /**
     * Whether to block input.
     * @type {boolean}
     */
    blockInput = false;

    /**
     * Creates a new ShortcutManager instance.
     * @param {Object} options Options
     * @param {Element} [options.target=document] Target element to listen for keydown events on
     * @param {AbortSignal} [options.signal=null] AbortSignal to remove the event listener when aborted
     * @param {Object} [options.shortcuts={}] Initial shortcuts to register (eg. { "Ctrl+S": handler })
     * @param {Function} [options.filter=null] Optional global filter function to determine if a shortcut should be triggered (event, shortcut) => boolean
     * @param {Function} [options.flagGetter=null] Optional function to get the value of a flag when it is not set (key) => boolean
     * @param {boolean} [options.forceMappings=false] Whether to force use of mapped handlers instead of direct handlers
     */
    constructor({ target = document, signal = null, shortcuts = {}, filter = null, flagGetter = null, forceMappings = false } = {}){
        super();

        this.shortcuts = new Map();
        this.mappings = new Map();
        this.flags = new Set();
        this.flagGetter = flagGetter;
        this.forceMappings = forceMappings;

        this.handler = this.#handleKeyDown.bind(this);
        this.target = target;
        this.target.addEventListener('keydown', this.handler, signal ? { signal } : undefined);

        this.filterFunc = filter;

        if(shortcuts) for(const [shortcut, handler] of Object.entries(shortcuts)){
            this.register(shortcut, handler);
        }
    }

    /**
     * Registers a keyboard shortcut.
     * @param {string|object|array<string|object>} shortcut Shortcut or array of shortcuts (eg. "Ctrl+S" or ["Ctrl+S", "Cmd+S"] or { shortcut: "Ctrl+S", ... })
     * @param {Function|String} handler Callback or action ID
     * @param {Object} options Options
     * @returns {ShortcutManager}
     */
    register(shortcut, handler = null, options = null){
        if(this.destroyed) throw new Error('Cannot register a shortcut on a destroyed ShortcutManager');

        if(Array.isArray(shortcut)){
            for(const item of shortcut){
                this.register(item, handler, options);
            }
            return this;
        }

        if(this.forceMappings && typeof handler === 'function'){
            throw new Error('Cannot register a direct handler when forceMappings is enabled. Use assign() to assign a handler to a key instead.');
        }

        if(typeof shortcut === 'object' && shortcut !== null) {
            options = { ...shortcut, ...options };
            shortcut = options.shortcut;
            delete options.shortcut;
        }

        if(typeof shortcut !== 'string') throw new Error('Shortcut must be a string');

        const parts = shortcut.toLowerCase().split('+').map(part => {
            part = part.trim();
            if(part === 'cmd' || part === 'command' || part === 'super') part = 'meta';
            if(part === 'control') part = 'ctrl';
            if(part === 'esc') part = 'escape';
            if(part === 'up') part = 'arrowup';
            if(part === 'down') part = 'arrowdown';
            if(part === 'left') part = 'arrowleft';
            if(part === 'right') part = 'arrowright';
            if(part === 'space' || part === 'spacebar') part = ' ';
            return part;
        });

        this.shortcuts.set(shortcut, {
            key: parts.find(part => !['ctrl', 'control', 'shift', 'alt', 'super', 'meta', 'cmd', 'command'].includes(part)),
            ctrl: parts.includes('ctrl') || parts.includes('control'),
            shift: parts.includes('shift'),
            alt: parts.includes('alt'),
            meta: parts.includes('super') || parts.includes('meta') || parts.includes('cmd') || parts.includes('command'),
            options, // Can be null, otherwise { flags: [], condition: function(event) { ... }, description: string, source: string } for further filtering & metadata
            handler
        });
        return this;
    }

    unregister(shortcut){
        if(this.destroyed) throw new Error('Cannot unregister a shortcut on a destroyed ShortcutManager');

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
     * // You assign the action once to the shortcut name
     * shortcutManager.assign("SAVE", () => { ... });
     * 
     * // Later, you can override the mapping:
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
        this.flags.clear();
        return this;
    }

    triggerMapping(key) {
        const handler = this.mappings.get(key);
        if (typeof handler === 'function') {
            handler();
            return true;
        }
        return false;
    }

    /**
     * Sets whether to pause input events, disabling all shortcuts.
     * @param {boolean} block - Whether to block input.
     */
    setBlockInput(block) {
        this.blockInput = block;
        return this;
    }

    setFlag(key) {
        this.flags.add(key);
        return this;
    }

    unsetFlag(key) {
        this.flags.delete(key);
        return this;
    }

    getFlag(key) {
        if(key.charCodeAt(0) === 33) { // "!"
            return !this.getFlag(key.substring(1));
        }

        if(this.flags.has(key)) {
            return true;
        }

        if(this.flagGetter) {
            return this.flagGetter(key);
        }

        return false;
    }

    #handleKeyDown(event) {
        if(this.blockInput) return;

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
        // Test modifier keys
        if (shortcut.ctrl  !== event.ctrlKey)  return false;
        if (shortcut.shift !== event.shiftKey) return false;
        if (shortcut.alt   !== event.altKey)   return false;
        if (shortcut.meta  !== event.metaKey)  return false;

        // Test main key
        if (event.key.toLowerCase() !== shortcut.key) return false;

        // Test filter function
        if (typeof this.filterFunc === 'function' && !this.filterFunc(event, shortcut)) return false;

        if(!shortcut.options) return true;

        // Test conditions
        if (typeof shortcut.options.condition === 'function' && !shortcut.options.condition(event)) return false;

        // Test flags
        // todo: Enable expressions to allow better matching, eg. "flag1 || !flag2". Currently all flags are ANDed together, eg. ["flag1", "!flag2"] === "flag1 && !flag2"
        // todo: The parser for this is already available from reactive.js, just need to figure out the best way to integrate it to the framework without bloat
        const flags = shortcut.options.flags;
        if (typeof flags === 'string') {
            if (!this.getFlag(flags)) return false;
        } else if (Array.isArray(flags)) {
            for (const flag of flags) {
                if (!this.getFlag(flag)) return false;
            }
        }

        return true;
    }

    destroy(){
        this.reset();

        this.events.clear();

        this.target.removeEventListener('keydown', this.handler);
        this.target = null;

        this.handler = null;
        this.filterFunc = null;
        this.flagGetter = null;
        this.forceMappings = null;
        this.shortcuts = null;
        this.mappings = null;
        this.destroyed = true;
    }
};

/*@ls-export*/ if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        ShortcutManager: LS.ShortcutManager
    };
}