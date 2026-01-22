/**
 * Global shortcut manager API (not finalized)
 * @experimental May completely change in future versions, use carefully
 */
LS.ShortcutManager = class ShortcutManager extends LS.EventEmitter {
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