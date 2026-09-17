/*
    Author: Lukas (thelstv)
    Copyright: (c) https://lstv.space
    No commercial or training use permitted.
    This code is not open-source.

    Last modified: 2026
    See: https://github.com/the-lstv/lstv-web

    New, better and proper version of the command palette, replacing the previous AI slop trash,
    which in turn replaced the old FOSSHome implementation.
    This one is finally clean and human-written (though still work-in-progress).
    On the bright side, it can finally be worked on again without me wanting to kill myself every time i look at it.

    It is also much, much more efficient than the previous one, while taking less than **HALF** the lines of code.
*/

/**
 * @typedef {Object} PaletteOptions
 * @property {Object} [logger] - Custom logger object with info/log/warn/error/fatal methods
 * @property {number} [fontWidth] - The width of a single character in the input element (used for caret positioning)
 * @property {HTMLElement} [wrapperElement] - The wrapper element for the command palette
 * @property {HTMLElement} [inputElement] - The input element for the command palette
 * @property {HTMLElement} [menuElement] - The menu element for the command palette
 * @property {HTMLElement} [hintElement] - The hint element for the command palette
 * @property {HTMLElement} [iconElement] - The icon element for the command palette
 */

/**
 * @typedef {Object} CommandConfig
 * @property {string} name - The name of the command
 * @property {string} [description] - A brief description of the command
 * @property {string} [icon] - The icon class for the command
 * @property {string[]} [alias] - Alternative names for the command
 * @property {CommandConfig[]} [children] - Sub-commands under this command
 * @property {function} [onCalled] - The function to execute when the command is called
 * @property {CommandInput[]} [inputs] - Argument definitions for the command
 * @property {string} [accentColor] - The accent color for the command
 * 
 * CommandConfig defines a command in the tree. "name" is always unique within its parent.
 */

/**
 * @typedef {Object} CommandInput
 * @property {string} name - The name of the input argument
 * @property {string} [type] - The type of the input argument (e.g., 'text', 'number', 'boolean', 'color', 'file', 'list')
 * @property {string} [description] - A brief description of the input argument
 * @property {string} [icon] - The icon class for the input argument
 * @property {Array} [list] - For 'list' type, an array of possible values
 * @property {string} [accentColor] - The accent color for the input argument
 * 
 * CommandInput is used to define the expected arguments for a command that will then be passed to the command's callback in order.
 */

class CommandPalette extends LS.Component {
    static { LS.register(this, { name: "CommandPalette", global: true }) }

    /**
     * @type {PaletteOptions}
     */
    options = {};

    /**
     * @type {Object.<string, CommandConfig>}
     */
    #commands = {};
    #abortController = new AbortController();

    #fileInput  = null;
    #colorInput = null;

    /**
     * @type {CommandConfig[]}
     */
    #currentCompletions = [];
    #autoCompletionIndex = 0;
    #execAutoCompletion = false;
    #currentPartLen = 0;

    get autoCompletionIndex() {
        return this.#autoCompletionIndex;
    }

    set autoCompletionIndex(value) {
        const itemCount = this.#currentCompletions.length || 0;
        
        value ||= 0;

        if(value < 0) {
            value = itemCount - 1;
        } else if(value >= itemCount) {
            value = 0;
        }

        const selectedItem = this.menuElement.querySelector('.completion-item.selected');
        if (selectedItem) {
            selectedItem.classList.remove('selected');
        }

        const completion = this.#currentCompletions[value];
        if(completion) {
            if(this.iconElement) {
                this.iconElement.className = (completion && completion.icon) || this.options.defaultIcon;
            }
    
            // Show hint
            if(this.hintElement) {
                const hintText = (completion?.name || completion?.value || "");
                if(hintText && hintText.startsWith(this.getValue().trim())) {
                    this.hintElement.textContent = (completion?.name || completion?.value || "").slice(this.#currentPartLen);
                    this.hintElement.style.display = "inline";
                } else {
                    this.hintElement.style.display = "none";
                }
            }
        } else {
            this.hintElement.style.display = "none";
        }

        for (let i = 0; i < this.menuElement.children.length; i++) {
            const child = this.menuElement.children[i];

            // Stop if we reach hidden items
            if (child.style.display === "none") break;

            child.classList.toggle('selected', i === value);
        }

        this.#autoCompletionIndex = value;
        this.#scrollToSelectedItem();
    }

    /**
     * Creates a new CommandPalette instance
     * @param {PaletteOptions} options - Configuration options
     */
    constructor(options = {}) {
        super();
        this.options = options;

        this.options.defaultIcon ??= "bi-terminal";
        this.options.logger      ??= LS.DEFAULT_LOG_OUTPUT;
        this.options.fontWidth   ??= 9.6 * 1.2;

        this.isOpen = false;
        this.StackRef = this;

        // --- Elements
        this.wrapperElement = this.options.wrapperElement  || null;
        this.inputElement   = this.options.inputElement    || LS.Create("input");
        this.menuElement    = this.options.menuElement     || LS.Create("div.completion-menu");

        this.menuElement.style.display = "none";
        this.wrapperElement.appendChild(this.menuElement);

        if (!this.wrapperElement && this.inputElement) {
            this.wrapperElement = this.inputElement.parentElement;
        }

        this.hintElement        = this.options.hintElement        || null;
        this.iconElement        = this.options.iconElement        || null;
        this.terminalOutput     = this.options.terminalOutput     || null;
        this.textDisplayElement = this.options.textDisplayElement || null;

        this.caretElement = this.options.caretElement ||
            this.wrapperElement?.querySelector('.command-caret') || null;

        this.selectionHighlight = this.options.selectionHighlight ||
            this.wrapperElement?.querySelector('.command-selection') || null;

        this.#setupHandlers();
    }

    /**
     * Opens the command palette
     */
    open() {
        this.options.onOpen?.();
        this.emit("open");

        this.isOpen = true;
        LS.Stack.push(this.StackRef);
        this.focus();
    }

    /**
     * Closes the command palette
     */
    close() {
        this.options.onClose?.();
        this.emit("close");

        this.isOpen = false;
        LS.Stack.remove(this.StackRef);
        this.blur();
    }

    /**
     * Shows the completions menu
     */
    showCompletions() {
        if (this.menuElement) {
            this.menuElement.style.display = "flex";
        }
        this.#updateMenuPosition();
    }

    /**
     * Hides the completions menu
     */
    hideCompletions() {
        this.#currentCompletions.length = 0;
        if (this.menuElement) {
            this.menuElement.style.display = "none";
        }

        if(this.hintElement) {
            this.hintElement.style.display = "none";
        }
    }

    get isMenuVisible() {
        return this.menuElement?.style.display !== "none";
    }

    /**
     * Focuses the command input
     */
    focus() {
        if (this.inputElement) {
            this.inputElement.focus();
        }
        this.#updateCaretPosition();
    }

    blur() {
        if (this.inputElement) {
            this.inputElement.blur();
        }
    }

    /**
     * Opens the palette with a pre-filled command
     * @param {string} command - The command to pre-fill the input with
     */
    openWithCommand(command) {
        this.open();
        this.setValue(command);
    }

    setValue(value) {
        if (this.inputElement) {
            this.inputElement.value = value;
            this.#handleInput();
        }
    }

    getValue() {
        return this.inputElement?.value || "";
    }

    clearValue() {
        this.setValue("");
    }

    /**
     * Executes a command from a string. This can be run independent of the current input.
     * @param {string} [value] - The command to execute. If not provided, the current input value is used.
     * @param {boolean} [clear=true] - Whether to clear the input after executing the command.
     */
    execute(value = null, clear = true) {
        value ??= this.getValue();
        const { command, args, segments, currentPart, rootLevel } = this.#locateCommand(value);

        if(clear) {
            this.clearValue();
        }

        if(!command || rootLevel) {
            this.options.logger.error(`Command not found: ${value}`);
            return;
        }

        // if(rootLevel) {
        //     this.options.logger.error(`Cannot execute root-level command: ${value}`);
        //     return;
        // }

        const callback = command.onCalled || command.callback;

        if(!callback) {
            this.options.logger.warn(`Command '${command.name}' has no action defined.`);
            return;
        }

        // Validate and convert arguments based on command input definitions
        for(let i = 0; i < args.length; i++) {
            const inputDef = command.inputs?.[i];
            try {
                if(inputDef && typeof inputDef.validate === 'function') {
                    if(!inputDef.validate(args[i])) {
                        this.options.logger.error(`Invalid argument for command '${command.name}': ${args[i]}`);
                        return;
                    }
                }

                switch(inputDef?.type) {
                    case 'number':
                        args[i] = Number(args[i]);
                        break;

                    case 'boolean':
                        args[i] = ['true', '1', 'yes', 'on'].includes(args[i].toLowerCase());
                        break;
                    
                    case 'color':
                        if(LS.Color) args[i] = LS.Color.parse(args[i]);
                        break;
                    
                    case 'file':
                        break;
                }
            } catch (error) {
                this.options.logger.error(`Error processing argument ${i + 1} for command '${command.name}': ${error.message}`);
                return;
            }
        }

        try {
            callback(...args);
        } catch (error) {
            this.options.logger.error(`Error executing command '${command.name}': ${error.message}`);
        }
    }

    /**
     * Registers commands
     * 
     * @param {CommandConfig|CommandConfig[]|string} definition - Command definition(s)
     * @param {CommandConfig} [config] - Config when definition is a string
     * @returns {CommandPalette} Returns this for chaining
     * 
     * @example
     * palette.register([
     *   { name: 'hello', description: 'Say hello', onCalled: (name) => console.log(`Hello, ${name}!`) },
     *   { name: 'theme', description: 'Theme commands', children: [
     *     { name: 'dark', onCalled: () => setTheme('dark') },
     *     { name: 'light', onCalled: () => setTheme('light') }
     *   ]}
     * ]);
     */
    register(definition, config) {
        if (Array.isArray(definition)) {
            this.#ingestDefinitions(definition, this.#commands);
            return this;
        }

        if (typeof definition === 'string') {
            return this.register([{ name: definition, ...config }]);
        }

        if (definition && typeof definition === 'object') {
            this.#ingestDefinitions([definition], this.#commands);
            return this;
        }

        throw new Error('Invalid command definition');
    }

    #ingestDefinitions(definitions, target) {
        for (const node of definitions) {
            if (!node || typeof node !== 'object') continue;

            if (typeof node.name !== 'string') {
                throw new Error('Command definition requires a name');
            }

            this.#normalizeNode(node);
            node.parent = target;
            target[node.name] = node;
        }

        return target;
    }

    #normalizeNode(node) {
        if (!node || typeof node !== 'object' || typeof node.name !== 'string') return null;

        node.name = node.name.trim();

        if(Array.isArray(node.children)) {
            const children = {};
            for (const child of node.children) {
                if (typeof child === 'string') {
                    children[child] = { name: child };
                } else if (typeof child === 'object' && child !== null) {
                    children[child.name] = child;
                }
            }
            node.children = children;
        }

        node.type        ??= (node.onCalled) ? 'command' : 'group';
        node.alias       ??= [];
        node.inputs      ??= [];
        node.children    ??= {};
        node.parent      ??= null;
        node.description ??= '';

        for (const key in node.children) {
            const child = node.children[key];
            this.#normalizeNode(child);
            child.parent = node;
        }

        return node;
    }

    /**
     * Unregisters a command or group
     * 
     * @param {string} name - Name of command/group to remove
     * @returns {boolean} True if command existed and was removed
     */
    unregister(name) {}

    /**
     * Checks if a command or group exists
     * 
     * @param {string} name - Command/group name
     * @returns {boolean}
     */
    has(name) {
        return name in this.#commands;
    }

    /**
     * Gets a command or group configuration
     * 
     * @param {string} name - Command/group name
     * @returns {CommandConfig|undefined}
     */
    get(name) {
        return this.#commands[name];
    }

    /**
     * Parses a command string into its component parts
     * @param {string} inputValue - The input string to split
     * @param {boolean} expectsEmptySlot - Whether to expect an empty slot at the end if the input ends with a space
     * @returns {string[]}
     */
    splitCommand(inputValue, expectsEmptySlot = false) {
        let stringChar = null, start = 0;
        inputValue = inputValue.trimStart();

        if(!inputValue) return [''];
        let parts = [];

        for (let i = 0; i < inputValue.length; i++) {
            const char = inputValue.charCodeAt(i);

            if(stringChar) {
                if(char === stringChar) {
                    stringChar = null;
                    parts.push(inputValue.slice(start, i));
                    start = i + 1;
                }
                continue;
            }

            if(char === 34 || char === 39) { // " or '
                const v = inputValue.slice(start, i);
                if(v) parts.push(v);
                stringChar = char;
                start = i + 1;
                continue;
            }

            if(char === 32) { // space
                if (start === i) {
                    start = i + 1;
                    continue;
                }

                const v = inputValue.slice(start, i);
                if(v) parts.push(v);
                start = i + 1;
            }
        }

        const v = inputValue.slice(start);
        if(v) parts.push(v);

        if(expectsEmptySlot && inputValue.endsWith(' ')) {
            parts.push('');
            return parts;
        }

        return parts
    }


    // --- Private methods

    #search(candidates, query, location = null) {
        query = LS.Util.normalize(query);

        if(!query) {
            return candidates.filter(candidate => {
                if (candidate.startsWith('_')) return false;
                if (location && location[candidate]?.hidden) return false;
                return true;
            });
        }

        const results = [];
        for (const candidate of candidates) {
            let text = LS.Util.normalize(candidate);

            if (text.startsWith('_')) continue;

            if (location && location[candidate]) {
                const item = location[candidate];
                if (item.hidden) {
                    continue;
                }

                // if (item.description) {
                //     text += ' ' + LS.Util.normalize(item.description);
                // }
            }

            const idx = text.indexOf(query);
            if (idx === -1) {
                continue;
            }

            let score = 0;

            // Starts with query
            if (idx === 0) score += 100;

            // Starts a word
            if (idx === 0 || text[idx - 1] === ' ') score += 50;

            // Earlier matches are better
            score += Math.max(0, 30 - idx);

            // Shorter strings are slightly preferred
            score -= text.length * 0.01;

            if (score > 0) {
                results.push({ candidate, score });
            }
        }

        return results.sort((a, b) => b.score - a.score).map(r => r.candidate);
    }

    #setupHandlers() {
        if (!this.inputElement) return;

        const eventOpt = { signal: this.#abortController.signal };

        this.inputElement.addEventListener('input',   ()  => this.#handleInput(),         eventOpt);
        this.inputElement.addEventListener('keydown', (e) => this.#handleKeyDown(e),      eventOpt);
        this.inputElement.addEventListener('keyup',   ()  => this.#updateCaretPosition(), eventOpt);
        this.inputElement.addEventListener('select',  ()  => this.#updateCaretPosition(), eventOpt);
        this.inputElement.addEventListener('mouseup', ()  => this.#updateCaretPosition(), eventOpt);
        this.inputElement.addEventListener('scroll',  ()  => this.#updateCaretPosition(), eventOpt);

        this.inputElement.addEventListener('focus',   ()  => { this.wrapperElement?.classList.add('focused'); this.autoCompletion(); },    eventOpt);
        this.inputElement.addEventListener('blur',    ()  => this.wrapperElement?.classList.remove('focused'), eventOpt);

        // Is this necessary?
        this.inputElement.addEventListener('touchend', () => {
            this.requestAnimationFrame(() => this.#updateCaretPosition());
        }, eventOpt);

        document.addEventListener('selectionchange', () => {
            if (document.activeElement === this.inputElement) {
                this.#updateCaretPosition();
            }
        }, eventOpt);

        eventOpt.passive = true;

        document.addEventListener('pointerdown', (e) => {
            if (!this.isMenuVisible) return;
            if(!this.wrapperElement?.contains(e.target)) return this.hideCompletions();

            const item = e.target.closest('.completion-item');
            if(!item) return;

            const index = parseInt(item.dataset.index);
            if(!isNaN(index)) {
                this.autoCompletionIndex = index;
                this.#acceptCompletion();
            }
        }, eventOpt);
    }

    #handleKeyDown(event) {
        let preventDefault = true;

        switch (event.key) {
            case 'Enter':
                if (this.isMenuVisible && this.#currentCompletions.length > 0) {
                    this.#acceptCompletion();
                } else {
                    this.execute();
                }
                break;

            case 'Tab':
                this.#acceptCompletion();
                break;

            case 'ArrowDown':
                this.autoCompletionIndex++;
                break;

            case 'ArrowUp':
                this.autoCompletionIndex--;
                break;

            case 'Escape':
                if (this.isMenuVisible) {
                    this.hideCompletions();
                } else {
                    this.close();
                }
                break;

            default:
                preventDefault = false;
                break;
        }

        if (preventDefault) {
            event.preventDefault();
            event.stopPropagation();
        }

        requestAnimationFrame(() => this.#updateCaretPosition());
    }

    #handleInput() {
        this.#updateTextDisplay();
        this.autoCompletion();
        this.#updateCaretPosition();
    }

    /**
     * Parses and locates the command in the command tree based on the input value including aliases.
     * @param {string} inputValue Command string.
     * @returns { command: CommandConfig|null, args: string[]|null, segments: string[], currentPart: string, rootLevel: boolean, atEnd: boolean }
     */
    #locateCommand(inputValue = null) {
        inputValue ??= this.getValue() ?? '';

        // Parse command
        const segments = this.splitCommand(inputValue.trim());
        const hasTrailingSpace = inputValue.endsWith(' ');

        // Get the furthest matching command node
        let command = this.#commands, depth = 0;
        for (const segment of segments) {
            let children = depth === 0? this.#commands: command && command.children;

            if (children && children[segment]) {
                command = children[segment];
                depth++;
            } else break;
        }

        const rootLevel = depth === 0;
        const args = rootLevel? null: segments.length - depth > 0? segments.slice(depth): [];
        const currentPart = (!hasTrailingSpace && segments.length > 0)? segments.at(-1) : '';

        const inputCount = command.inputs? command.inputs.length : 0;

        const atEnd = !!(!command || (rootLevel && segments.length > 1) || ((args && args.length >= inputCount) && (!command.children || Object.keys(command.children).length === 0)));

        // console.log("Command:", command, "Args:", args, "Current Part:", currentPart, "Segments:", segments, "Root Level:", rootLevel, "At End:", atEnd, "Input Count:", inputCount);
        return { command, args, atEnd, segments, currentPart, rootLevel };
    }

    /**
     * Finds auto-completion values for the current command value, performs an ordered search, and updates the menu with the results.
     */
    autoCompletion(inputValue = null) {
        inputValue ??= this.getValue() ?? '';
        const { command, args, segments, atEnd, currentPart, rootLevel } = this.#locateCommand(inputValue);

        if(this.#execAutoCompletion) {
            if(atEnd) {
                this.execute();
                return;
            }
            this.#execAutoCompletion = false;
        }

        this.#currentPartLen = currentPart.length;

        if(atEnd) {
            this.hideCompletions();
            return;
        }

        let completions = rootLevel? command: command.children;
        if(command.inputs && command.inputs.length > 0) {
            completions = this.#inputCompletion(command.inputs[args.length]);
        }

        const keys = Object.keys(completions);
        if(!completions || keys.length === 0) {
            this.hideCompletions();
            return;
        }

        // Search for matches
        const matches = this.#search(keys, currentPart, completions);

        this.#currentCompletions.length = 0;

        let required = 0;
        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            const item = completions[match];

            if(item.hidden) {
                continue;
            }

            this.#currentCompletions.push(item);

            this.#updateMenuItem(item, required);
            required++;
        }

        let removed = 0;
        for(let i = this.menuElement.children.length - 1; i >= required; i--) {
            const child = this.menuElement.children[i];

            // Keep up to 5 hidden items as an extra buffer to avoid creating/removing elements.
            if(removed <= 5) {
                child.style.display = "none";
            } else {
                this.menuElement.removeChild(child);
            }
            removed++;
        }

        if(required === 0) {
            this.hideCompletions();
        } else {
            this.autoCompletionIndex = 0;
            this.showCompletions();
        }
    }

    #updateMenuItem(command, index) {
        const menuItem = this.menuElement.children[index] || LS.Create("div.completion-item", {
            inner: [
                { tag: "i" },
                { tag: "span" },
                { tag: "span", class: "completion-description" },
            ]
        }).addTo(this.menuElement);

        menuItem.children[0].className   = command.icon || this.options.defaultIcon;
        menuItem.children[1].textContent = command.name;
        menuItem.children[2].textContent = command.description? ` - ${command.description}` : '';

        menuItem.setAttribute("ls-accent", command.accentColor || '');
        menuItem.classList.toggle("has-accent", !!command.accentColor);

        menuItem.style.display = "flex";
        menuItem.dataset.index = index;
        return menuItem;
    }

    #updateMenuPosition() {
        const fontWidth = this.options.fontWidth;
        if (!this.menuElement || !this.inputElement) return;

        const scrollLeft = this.inputElement.scrollLeft || 0;
        const anchor = Math.max(0, ((this.inputElement.selectionEnd || 0) * fontWidth) - scrollLeft);

        const inputRect = this.inputElement.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const menuWidth = Math.min(600, viewportWidth - 20); // Max ?px or viewport - padding

        let menuLeft = anchor;
        if (inputRect.left + anchor + menuWidth > viewportWidth) {
            // Menu would overflow right, adjust position
            menuLeft = Math.max(0, viewportWidth - inputRect.left - menuWidth - 10);
        }

        this.menuElement.style.transform = `translateX(${menuLeft}px)`;
        this.menuElement.style.maxWidth = `${menuWidth}px`;
    }

    #updateTextDisplay() {
        // todo:
        if (this.textDisplayElement) {
            this.textDisplayElement.textContent = this.getValue();
        }
    }

    #acceptCompletion(index = this.autoCompletionIndex) {
        if (!this.menuElement) return;

        // Execute next if auto-completion is at the end
        this.#execAutoCompletion = true;

        const completion = this.#currentCompletions[index];
        if (!completion) return;

        const parts = this.splitCommand(this.inputElement.value, true);
        parts[parts.length - 1] = completion.value || completion.name;

        const cleaned = parts.join(' ').trimEnd();

        if(cleaned) this.setValue(cleaned + ' '); else this.clearValue();

        if(this.iconElement) {
            this.iconElement.className = this.options.defaultIcon;
        }
    }

    #inputCompletion(inputDef) {
        if(!inputDef) return {};

        const type = inputDef?.type || 'text';

        switch (type) {
            case 'boolean':
                return {
                    true:  { name: 'true', icon: "bi-toggle-on" },
                    false: { name: 'false', icon: "bi-toggle-off" }
                }
            
            case 'number':
                return {
                    '(enter a number)': { icon: inputDef.icon || "bi-123", description: inputDef.description || "Enter a number" },
                    '0':    { name: '0', icon: inputDef.icon || "bi-123", description: "Zero" },
                    '1':    { name: '1', icon: inputDef.icon || "bi-123", description: "One" },
                    '10':   { name: '10', icon: inputDef.icon || "bi-123", description: "Ten" },
                    '100':  { name: '100', icon: inputDef.icon || "bi-123", description: "One Hundred" },
                    '1000': { name: '1000', icon: inputDef.icon || "bi-123", description: "One Thousand" }
                };

            case 'color':
                return {
                    'Pick a color': { source: "colorPicker", icon: inputDef.icon || "bi-palette", description: inputDef.description || "Pick a color" },
                    '#000000': { name: '#000000', icon: 'bi-circle', description: "Black" },
                    '#FFFFFF': { name: '#FFFFFF', icon: 'bi-circle-fill', description: "White" },
                    '#FF0000': { name: '#FF0000', icon: 'bi-circle-fill', description: "Red", accentColor: 'red' },
                    '#00FF00': { name: '#00FF00', icon: 'bi-circle-fill', description: "Green", accentColor: 'green' },
                    '#0000FF': { name: '#0000FF', icon: 'bi-circle-fill', description: "Blue", accentColor: 'blue' },
                    '#FFFF00': { name: '#FFFF00', icon: 'bi-circle-fill', description: "Yellow", accentColor: 'yellow' },
                    '#FFA500': { name: '#FFA500', icon: 'bi-circle-fill', description: "Orange", accentColor: 'orange' },
                    '#800080': { name: '#800080', icon: 'bi-circle-fill', description: "Purple", accentColor: 'purple' },
                    '#00FFFF': { name: '#00FFFF', icon: 'bi-circle-fill', description: "Cyan", accentColor: 'cyan' },
                    '#FFC0CB': { name: '#FFC0CB', icon: 'bi-circle-fill', description: "Pink", accentColor: 'pink' }
                };

            case 'list':
                return (inputDef.list || []).reduce((acc, item) => {
                    const key = item.name || String(item.value);

                    acc[key] = {
                        name: key,
                        value: String(item.value ?? item.name),
                        icon:        item.icon || inputDef.icon || "bi-list",
                        description: item.description || inputDef.description,
                        accentColor: item.accentColor || inputDef.accentColor || null
                    };

                    return acc;
                }, {});

            case 'file':
                return {
                    'Choose a file': { value: '', source: "filePicker", icon: inputDef.icon || "bi-file-earmark", description: inputDef.description || "Choose a file" }
                };

            case 'text': case 'string':
                return {
                    '(enter text)': { value: '""', icon: inputDef.icon || "bi-type", description: inputDef.description || "Enter text" }
                };

            // todo: path completion
            case 'path':
                return {};

            default:
                return {};
        }
    }

    #scrollToSelectedItem() {
        if (!this.menuElement) return;

        const selectedItem = this.menuElement.querySelector('.completion-item.selected');
        if (selectedItem) {
            selectedItem.scrollIntoView({
                block: 'center',
                inline: 'nearest',
                behavior: 'smooth'
            });
        }
    }

    #updateCaretPosition() {
        if (!this.inputElement) return;

        const fontWidth = this.options.fontWidth;
        const selectionStart = this.inputElement.selectionStart ?? 0;
        const selectionEnd = this.inputElement.selectionEnd ?? 0;
        const hasSelection = selectionEnd !== selectionStart;
        const scrollLeft = this.inputElement.scrollLeft || 0;

        if (this.caretElement) {
            this.caretElement.style.transform = `translateX(${Math.max(0, (selectionEnd * fontWidth) - scrollLeft)}px)`;
        }

        if (this.selectionHighlight) {
            if (hasSelection) {
                const selectionLeft = Math.max(0, (selectionStart * fontWidth) - scrollLeft);
                const selectionWidth = Math.max(0, (selectionEnd - selectionStart) * fontWidth);
                this.selectionHighlight.style.transform = `translateX(${selectionLeft}px)`;
                this.selectionHighlight.style.width = `${selectionWidth}px`;
            } else {
                this.selectionHighlight.style.width = '0';
            }
        }

        if (this.wrapperElement) {
            this.wrapperElement.classList.toggle('selection', hasSelection);
        }
    }

    destroy() {
        this.inputElement = null;
        this.menuElement = null;
        this.hintElement = null;
        this.iconElement = null;
        this.textDisplayElement = null;
        this.caretElement = null;
        this.selectionHighlight = null;

        this.#abortController.abort();
        this.#commands = null;
        this.options = null;
        this.StackRef = null;

        this.#currentCompletions = null;

        if (this.#fileInput) {
            this.#fileInput.remove();
            this.#fileInput = null;
        }

        if (this.#colorInput) {
            this.#colorInput.remove();
            this.#colorInput = null;
        }

        super.destroy();
    }

    static serializeValue(value) {
        if (value === null) return LS.Create("span", { textContent: "null", class: "hljs-comment" });
        if (value === undefined) return LS.Create("span", { textContent: "undefined", class: "hljs-comment" });
        
        const type = typeof value;
        if(type === "string") {
            // return LS.Create("span.hljs-string", { text: `"${value}"` });
            return LS.Create("span", { text: value });
        } else if(type === "number") {
            return LS.Create("span.hljs-number", { text: String(value) });
        } else if(type === "boolean") {
            return LS.Create("span.hljs-literal", { text: String(value) });
        }

        // Error objects
        if (value instanceof Error) {
            return LS.Create("span", {
                text: value.toString(),
                class: "terminal-error"
            });
        }

        // todo: object tree serialization

        return LS.Create("span", { text: String(value), class: "hljs-comment" });
    }

    // Log render utilities

    static writeLogTo(container, level, ...args) {
        if (!container) return;

        const line = LS.Create("div", { class: "terminal-line " + (["level-info", "level-log", "level-warn", "level-error", "level-fatal"][level]) });

        // Check if first arg contains DevTools styles (%c)
        // Mayhaps ANSI escape codes eventually? By that point the logger will be moved
        if (typeof args[0] === "string" && args[0].indexOf("%c") !== -1) {
            let str = args[0];
            let styleIndex = 1;

            const parts = str.split("%c");

            parts.forEach((part, i) => {
                if (i === 0) {
                    line.append(document.createTextNode(part));
                } else {
                    const style = args[styleIndex++] || "";
                    const span = LS.Create("span", {
                        textContent: part,
                        style: style
                    });
                    line.append(span);
                }
            });

            // Append remaining args (non-style)
            for (let i = styleIndex; i < args.length; i++) {
                line.append(document.createTextNode(" "));
                line.append(this.serializeValue(args[i]));
            }
        } else {
            for(let i = 0; i < args.length; i++) {
                const arg = args[i];
                if (i > 0) line.append(document.createTextNode(" "));
                line.append(this.serializeValue(arg));
            }
        }

        container.append(line);

        // Scroll to bottom
        container.parentElement.scrollTop = container.parentElement.scrollHeight;
    }
}

/*@ls-export*/ if (typeof module !== "undefined" && module.exports) {
    module.exports = CommandPalette;
}