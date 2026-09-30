/*
    Author: Lukas (thelstv)
    Copyright: (c) https://lstv.space
    No commercial or training use permitted.
    This code is not open-source.

    Last modified: 2026
    See: https://github.com/the-lstv/lstv-web

    Command palette

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
 * @property {HTMLElement} [container] - The wrapper element for the command palette (optional)
 * @property {HTMLElement} [textContainer] - The text display element (optional)
 * @property {HTMLElement} [inputElement] - The input element for the command palette (optional)
 * @property {HTMLElement} [menuElement] - The menu element for the command palette (optional)
 * @property {HTMLElement} [hintElement] - The hint element for the command palette (optional)
 * @property {HTMLElement} [iconElement] - The icon element for the command palette (optional)
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

const colorPalette = [
    // Normal colors
    '000', 'c33', '3c3', 'cc3',
    '33c', 'c3c', '3cc', 'ccc',

    // Bright colors
    '666', 'f66', '6f6', 'ff6',
    '66f', 'f6f', '6ff', 'fff',

    // Extended 256-color palette (from xterm)
    "000000","00005f","000087","0000af","0000d7","0000ff","005f00","005f5f","005f87","005faf","005fd7","005fff","008700","00875f","008787","0087af","0087d7","0087ff","00af00","00af5f","00af87","00afaf","00afd7","00afff","00d700","00d75f","00d787","00d7af","00d7d7","00d7ff","00ff00","00ff5f","00ff87","00ffaf","00ffd7","00ffff","5f0000","5f005f","5f0087","5f00af","5f00d7","5f00ff","5f5f00","5f5f5f","5f5f87","5f5faf","5f5fd7","5f5fff","5f8700","5f875f","5f8787","5f87af","5f87d7","5f87ff","5faf00","5faf5f","5faf87","5fafaf","5fafd7","5fafff","5fd700","5fd75f","5fd787","5fd7af","5fd7d7","5fd7ff","5fff00","5fff5f","5fff87","5fffaf","5fffd7","5fffff","870000","87005f","870087","8700af","8700d7","8700ff","875f00","875f5f","875f87","875faf","875fd7","875fff","878700","87875f","878787","8787af","8787d7","8787ff","87af00","87af5f","87af87","87afaf","87afd7","87afff","87d700","87d75f","87d787","87d7af","87d7d7","87d7ff","87ff00","87ff5f","87ff87","87ffaf","87ffd7","87ffff","af0000","af005f","af0087","af00af","af00d7","af00ff","af5f00","af5f5f","af5f87","af5faf","af5fd7","af5fff","af8700","af875f","af8787","af87af","af87d7","af87ff","afaf00","afaf5f","afaf87","afafaf","afafd7","afafff","afd700","afd75f","afd787","afd7af","afd7d7","afd7ff","afff00","afff5f","afff87","afffaf","afffd7","afffff","d70000","d7005f","d70087","d700af","d700d7","d700ff","d75f00","d75f5f","d75f87","d75faf","d75fd7","d75fff","d78700","d7875f","d78787","d787af","d787d7","d787ff","d7af00","d7af5f","d7af87","d7afaf","d7afd7","d7afff","d7d700","d7d75f","d7d787","d7d7af","d7d7d7","d7d7ff","d7ff00","d7ff5f","d7ff87","d7ffaf","d7ffd7","d7ffff","ff0000","ff005f","ff0087","ff00af","ff00d7","ff00ff","ff5f00","ff5f5f","ff5f87","ff5faf","ff5fd7","ff5fff","ff8700","ff875f","ff8787","ff87af","ff87d7","ff87ff","ffaf00","ffaf5f","ffaf87","ffafaf","ffafd7","ffafff","ffd700","ffd75f","ffd787","ffd7af","ffd7d7","ffd7ff","ffff00","ffff5f","ffff87","ffffaf","ffffd7","ffffff","080808","121212","1c1c1c","262626","303030","3a3a3a","444444","4e4e4e","585858","626262","6c6c6c","767676","808080","8a8a8a","949494","9e9e9e","a8a8a8","b2b2b2","bcbcbc","c6c6c6","d0d0d0","dadada","e4e4e4","eeeeee"
];

class CommandPalette extends LS.Component {
    static { LS.register(this, { name: "CommandPalette", global: true }) }

    static colorPalette = colorPalette;

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
        this.container = this.options.container  || LS.Create();
        this.container.classList.add("ls-command-palette");

        this.container.onclick = () => this.focus();

        this.menuElement    = this.options.menuElement     || LS.Create(".completion-menu").addTo(this.container);
        this.menuElement.style.display = "none";

        this.iconElement    = this.options.iconElement     || LS.Create("i.command-icon", { class: this.options.defaultIcon }).addTo(this.container);

        const textContainer = this.options.textContainer   || LS.Create(".textContainer").addTo(this.container);

        this.selectionHighlight = this.options.selectionHighlight    ||
            this.container?.querySelector('.command-selection') || LS.Create("span.command-selection").addTo(textContainer);

        this.caretElement = this.options.caretElement ||
            this.container?.querySelector('.command-caret')     || LS.Create("span.command-caret").addTo(textContainer);

        this.textDisplayElement = this.options.textDisplayElement ?? LS.Create("span.command-text").addTo(textContainer);
        this.hintElement        = this.options.hintElement        ?? LS.Create("span.command-hint").addTo(textContainer);

        this.inputElement       = this.options.inputElement       || LS.Create("input.command-input[type='text']", {
            attributes: {
                autocomplete: "off",
                autocorrect: "off",
                autocapitalize: "off",
                spellcheck: "off",
                "aria-label": "Command Palette Input"
            }
        }).addTo(textContainer);

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
     * @param {boolean} [dataOnly=false] - Tell the command to only return data without performing any side effects (such as displaying a message). Depends on the command.
     */
    async execute(value = null, clear = true, dataOnly = false) {
        value ??= this.getValue();
        const { command, args, segments, currentPart, rootLevel } = this.#locateCommand(value);

        if(clear) {
            this.clearValue();
        }

        if(!command || rootLevel) {
            this.options.logger.error(`Command not found: ${value}`);
            return null;
        }

        // if(rootLevel) {
        //     this.options.logger.error(`Cannot execute root-level command: ${value}`);
        //     return null;
        // }

        const callback = (dataOnly && command.data) || command.onCalled || command.callback;

        if(!callback) {
            this.options.logger.warn(`Command '${command.name}' has no action defined.`);
            return null;
        }

        // Validate and convert arguments based on command input definitions
        for(let i = 0; i < args.length; i++) {
            const inputDef = command.inputs?.[i];
            let value = args[i];
            console.log(`Processing argument ${i + 1} for command '${command.name}':`, value);

            if(value[0] === "$") {
                console.log("Detected variable or sub-command substitution:", value);

                // Execute & substitute ($(command))
                if(value[1] === "(") {
                    const varName = value.slice(2, value[value.length - 1] === ")" ? -1 : undefined);

                    // Collect sub-command arguments
                    const subCommand = [varName];

                    while(i + 1 < args.length) {
                        i++;

                        const nextArg = args[i];
                        if(nextArg.endsWith(")")) {
                            subCommand.push(nextArg.slice(0, -1));
                            break;
                        } else {
                            subCommand.push(nextArg);
                        }
                    }

                    value = await this.execute(subCommand.join(" "), false, true);

                    console.log("Executing sub-command for variable substitution:", subCommand.join(" "), "Result:", value);
                } else {
                    // Variable substitution ($var)
                    const varName = value.slice(1);
                    value = this.options.variables?.[varName] ?? varName;
                    console.log(`Substituting variable '${varName}' with value:`, value);
                }
            }

            try {
                if(inputDef && typeof inputDef.validate === 'function') {
                    if(!inputDef.validate(value)) {
                        this.options.logger.error(`Invalid argument for command '${command.name}': ${value}`);
                        return null;
                    }
                }

                switch(inputDef?.type) {
                    case 'number':
                        value = Number(value);
                        break;

                    case 'boolean':
                        value = ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
                        break;
                    
                    case 'color':
                        if(LS.Color) value = LS.Color.parse(value);
                        break;
                    
                    case 'file':
                        break;
                }

                args[i] = value;
            } catch (error) {
                this.options.logger.error(`Error processing argument ${i + 1} for command '${command.name}': ${error.message}`);
                return null;
            }
        }

        try {
            return await callback(...args);
        } catch (error) {
            this.options.logger.error(`Error executing command '${command.name}': ${error.message}`);
            return null;
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
            if (candidate.startsWith('_')) continue;

            let text = LS.Util.normalize(candidate);

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

        this.inputElement.addEventListener('focus',   ()  => { this.container?.classList.add('focused'); this.autoCompletion(); },    eventOpt);
        this.inputElement.addEventListener('blur',    ()  => this.container?.classList.remove('focused'), eventOpt);

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
            if(!this.container?.contains(e.target)) return this.hideCompletions();

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

        const inputCount = command && command.inputs? command.inputs.length : 0;

        const atEnd = !!(!command || (rootLevel && segments.length > 1) || ((args && args.length >= inputCount) && (!command.children || Object.keys(command.children).length === 0)));

        console.log("Command:", command, "Args:", args, "Current Part:", currentPart, "Segments:", segments, "Root Level:", rootLevel, "At End:", atEnd, "Input Count:", inputCount);
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

        this.#currentPartLen = currentPart?.length || 0;

        // todo: better handling for argument suggestions
        if(
            (atEnd && this.#currentPartLen === 0) ||
            (rootLevel && (
                (segments.length !== 1) ||
                (segments.length === 1 && segments[0] !== '' && !this.#currentPartLen)
            ))
        ) {
            this.hideCompletions();
            return;
        }

        let completions = rootLevel? command: command.children;
        if(command.inputs && command.inputs.length > 0) {
            completions = this.#inputCompletion(command.inputs[args.length - (this.#currentPartLen === 0? 0 : 1)]);
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

        if (this.container) {
            this.container.classList.toggle('selection', hasSelection);
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
            return this.parseAnsi(value);
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

    static ansiColor(code) {
        const color = this.colorPalette[code] || null;
        if(color.length !== 3 && color.length !== 6) return color;
        return "#" + color;
    }

    static parseAnsi(text) {
        const len = text.length;

        let seq = false, start = 0, style = {};

        const fragment = document.createDocumentFragment();

        const push = (start, end, style) => {
            if (start >= end) return;

            const css = Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';');
            const span = document.createElement("span");
            span.textContent = text.slice(start, end);
            if(css) span.style.cssText = css;
            fragment.append(span);
        };

        for (let i = 0; i < len; i++) {
            const char = text.charCodeAt(i);

            if(seq) {
                if(char >= 64 && char <= 126) { // Final byte of ANSI sequence
                    const args = text.slice(start, i).split(';').map(Number);
                    
                    if(char === 109) { // 'm' - SGR (Select Graphic Rendition)
                        for (let j = 0; j < args.length; j++) {
                            const code = args[j];

                            if (code === 38 || code === 48) {
                                // Extended color codes
                                if (args[j + 1] === 5) {
                                    const colorCode = args[j + 2];
                                    if (code === 38) {
                                        style.color = this.ansiColor(colorCode);
                                    } else {
                                        style['background-color'] = this.ansiColor(colorCode);
                                    }
                                    j += 2; // Skip the next two arguments
                                } else if (args[j + 1] === 2) {
                                    // RGB color codes
                                    const r = args[j + 2];
                                    const g = args[j + 3];
                                    const b = args[j + 4];
                                    const rgbColor = `rgb(${r}, ${g}, ${b})`;
                                    if (code === 38) {
                                        style.color = rgbColor;
                                    } else {
                                        style['background-color'] = rgbColor;
                                    }
                                    j += 4; // Skip the next four arguments
                                }
                            }

                            if (code === 0) style = {};

                            else if (code === 1) style['font-weight'] = 'bold';
                            else if (code === 2) style.opacity = '.5';
                            else if (code === 4) style['text-decoration'] = 'underline';
                            else if (code === 22) {
                                delete style['font-weight'];
                                delete style.opacity;
                            }
                            else if (code === 24) delete style['text-decoration'];
                            else if (code === 39) delete style.color;
                            else if (code === 49) delete style['background-color'];
                            else if (30 <= code && code <= 37)
                                style.color = this.ansiColor(code - 30);
                            else if (90 <= code && code <= 97)
                                style.color = this.ansiColor(code - 90 + 8);
                            else if (40 <= code && code <= 47)
                                style['background-color'] = this.ansiColor(code - 40);
                            else if (100 <= code && code <= 107)
                                style['background-color'] = this.ansiColor(code - 100 + 8);
                        }
                    } else {
                        // Unsupported command, as of now
                    }

                    seq = false;
                    start = i + 1;
                }
                continue;
            }

            if (char === 27) { // ESC
                if (text.charCodeAt(i + 1) === 91) { // '['
                    push(start, i, style);

                    seq = true;
                    start = i + 2;
                    i++;
                    continue;
                }
            }
        }

        push(start, text.length, style);

        return fragment;
    }

    static writeLogTo(container, level, ...args) {
        if (!container) return;

        const line = LS.Create("div", { class: "terminal-line " + (["level-info", "level-log", "level-warn", "level-error", "level-fatal"][level]) });

        // Check if first arg contains DevTools styles (%c)
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