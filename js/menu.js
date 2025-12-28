/**
 * Menu Component
 * Primary abstract menu class used for dropdowns, context menus, select menus, etc.
 * 
 * @author lstv.space
 * @license GPL-3.0
 */

LS.LoadComponent(class Menu extends LS.Component {
    static index = 0;

    static addContextMenu(element, itemsProvider, options = {}) {
        if(Array.isArray(itemsProvider)) {
            // Create a persistent menu

            if(element.__menu) {
                element.__menu.destroy();
            }

            new LS.Menu(options, {
                adjacentElement: element,
                adjacentMode: 'context',
                items: itemsProvider,
                ...options
            });
        } else if(typeof itemsProvider === 'function') {
            // This method is experimental
            element.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const menu = new LS.Menu({
                    ...options,
                    ephemeral: true,
                    items: (typeof itemsProvider === 'function') ? itemsProvider() : itemsProvider,
                });

                menu.open(e.clientX, e.clientY);
            });
        }
    }

    /**
     * Menu constructor
     * @param {*} element (optional) Container element or null to create a new one
     * @param {*} options Menu options
     * @property {boolean} options.topLayer If true, the menu is added to the top layer
     * @property {boolean} options.selectable If true, the menu behaves like a select (closes on selection)
     * @property {boolean} options.closeable If true, the menu can be closed
     * @property {Element} options.adjacentElement If provided, the menu opens next to this element
     * @property {string} options.adjacentMode 'click' (default) or 'context' to open on right-click
     * @property {boolean} options.openOnAdjacentClick If true, clicking the adjacentElement toggles the menu
     * @property {boolean} options.inheritAdjacentWidth If true, the menu inherits the width of the adjacentElement
     * @property {boolean} options.fixed If true, the menu position is fixed rather than static
     * @property {boolean} options.ephemeral If true, the menu is destroyed when closed
     * @property {boolean} options.searchable If true, the menu has a search box to filter items
     */
    constructor(element, options = null) {
        super();
        this.isOpen = false;

        console.log("New menu created", element, options);
        

        this.items = [];
        this.selectedItem = null;
        this.activeSubmenu = null;
        this.parentMenu = null;

        const isElement = element instanceof HTMLElement;
        if(!isElement) {
            options = options || element;
        }

        this.container = (isElement? element : N({
            class: "ls-menu",
            style: { display: "none" }
        }));

        this.container.classList.add("ls-menu-container");
        this.container.tabIndex = -1;

        if(options.items) {
            this.items = options.items;
            delete options.items;
        }

        this.options = LS.Util.defaults({
            topLayer: true,
            fixed: true,
            selectable: true,
            closeable: true,
            adjacentElement: null,
            openOnAdjacentClick: true,
            adjacentMode: "click",
            ephemeral: false,
            searchable: false,
            inheritAdjacentWidth: false
        }, options || {});

        if(this.options.topLayer) {
            LS.once("body-available", () => {
                this.container.addTo(LS._topLayer.querySelector('.ls-dropdown-layer') || N({
                    class: "ls-dropdown-layer"
                }).addTo(LS._topLayer));
            });
        }

        if (this.options.searchable) {
            this.searchInput = LS.Create("input", {
                type: "text",
                class: "ls-menu-search",
                placeholder: "Search...",
                attributes: {
                    autocomplete: "off"
                }
            });
            
            this.searchContainer = LS.Create("div", {
                class: "ls-menu-search-container",
                inner: this.searchInput
            });
            
            this.container.appendChild(this.searchContainer);
            
            this.searchInput.addEventListener('input', () => {
                this.#filterItems(this.searchInput.value);
            });
            
            this.searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.navigate(1);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (this.selectedItem) {
                        this.#handleItemClick(this.selectedItem);
                    }
                }
            });
        }

        if(this.options.adjacentElement) {
            this.options.adjacentElement.__menu = this;

            if(this.options.openOnAdjacentClick) {
                if (this.options.adjacentMode === 'context') {
                    this.options.adjacentElement.addEventListener('contextmenu', this.__adjacentClickHandler = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.open(e.clientX, e.clientY);
                    });
                } else {
                    this.options.adjacentElement.addEventListener('click', this.__adjacentClickHandler = (e) => {
                        e.stopPropagation();
                        this.toggle();
                    });
                }

                // Keyboard support
                this.options.adjacentElement.addEventListener('keydown', this.__adjacentKeyHandler = (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!this.isOpen) {
                            this.open();
                            this.navigate(1);
                        } else {
                            this.close();
                        }
                    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                        e.preventDefault();
                        if (!this.isOpen) {
                            this.open();
                        }

                        this.navigate(e.key === 'ArrowDown' ? 1 : -1);
                    }
                });
            }
        }

        document.addEventListener('click', this.__documentClickHandler = (e) => {
            if (!this.isOpen) return;
            if (this.container.contains(e.target)) return;
            if (this.options.adjacentElement && this.options.adjacentElement.contains(e.target)) return;

            let parent = this.parentMenu;
            while(parent) {
                if (parent.container.contains(e.target)) return;
                parent = parent.parentMenu;
            }

            this.close();
        });

        if(this.options.ephemeral) {
            this.on('close', () => {
                this.destroy();
            });
        }

        // Limits updates to animation frames
        this.frameScheduler = new LS.Util.FrameScheduler(() => this.#render());

        this.container.addEventListener('keydown', (e) => this.#handleKeyDown(e));
        this.render();
    }

    #render() {
        const hasIcons = this.items.some(i => i.icon);
        this.container.classList.toggle('ls-menu-has-icons', hasIcons);
        this.container.classList.toggle('ls-menu-no-icons', !hasIcons);

        const currentElements = new Set(this.items.map(i => i.element).filter(e => e));
        if (this.searchContainer) currentElements.add(this.searchContainer);
        
        Array.from(this.container.children).forEach(child => {
            if (!currentElements.has(child)) {
                this.container.removeChild(child);
            }
        });

        if (this.searchContainer && this.container.firstChild !== this.searchContainer) {
            this.container.prepend(this.searchContainer);
        }

        for(const item of this.items) {
            if(!item.element) {
                this.#createItemElement(item);
            }

            this.#updateItemElement(item);
            this.container.appendChild(item.element);
        }
    }

    #filterItems(query) {
        const normalizedQuery = LS.Util.normalize(query);
        let firstVisible = null;
        
        for (const item of this.items) {
            if (!item.element) continue;
            
            if (item.type === 'separator' || item.type === 'label') {
                if (normalizedQuery) {
                    item.element.style.display = 'none';
                } else {
                    item.element.style.display = '';
                }
                continue;
            }
            
            const text = item.text || '';
            const normalizedText = LS.Util.normalize(text);
            const match = normalizedText.includes(normalizedQuery);
            
            item.element.style.display = match ? '' : 'none';
            
            if (match && !firstVisible && !item.disabled) {
                firstVisible = item;
            }
        }
        
        if (firstVisible) {
            this.select(firstVisible);
        } else {
            this.selectedItem = null;
            this.items.forEach(i => {
                if (i.element) i.element.classList.remove('selected');
            });
        }
    }

    #createItemElement(item) {
        if(item.type === "separator") {
            item.element = LS.Create("hr", {
                class: "ls-menu-separator"
            });
            return;
        }

        if(item.type === "label") {
            item.element = LS.Create({
                class: "ls-menu-label",
                textContent: item.text
            });
            return;
        }

        if (item.type === 'checkbox' || item.type === 'radio') {
            const input = LS.Create("input", {
                type: item.type,
                checked: !!item.checked,
                disabled: !!item.disabled,
                tabindex: -1
            });

            if (item.type === 'radio' && item.group) {
                input.name = item.group;
            }

            item.element = LS.Create("label", {
                class: `ls-${item.type} ls-menu-item`,
                content: [
                    input,
                    LS.Create('span'),
                    document.createTextNode(" " + item.text)
                ],
                tabindex: -1
            });

            item.inputElement = input;

            item.element.addEventListener('click', (event) => {
                event.stopPropagation();
                if (item.disabled) {
                    event.preventDefault();
                }
            });

            input.addEventListener('change', () => {
                this.#handleItemClick(item);
            });
            
            item.element.addEventListener('mouseenter', () => {
                if (item.disabled) return;
                this.#handleItemHover(item);
            });

            return;
        }

        const label = LS.Create("span");
        label.innerHTML = item.text;
        LS.Util.sanitize(label);
        label.classList.add("ls-menu-item-label");

        const inner = [ label ];

        if (item.icon) {
            inner.unshift(LS.Create("i", { class: item.icon + " ls-menu-item-icon" }));
        }

        if (item.items || item.type === 'submenu') {
            inner.push({ class: "ls-menu-submenu-arrow" });
        }

        item.element = LS.Create({
            class: "ls-list-item ls-menu-item",
            tabindex: -1,
            inner
        });

        if (item.disabled) {
            item.element.classList.add('disabled');
        }

        item.element.dataset.value = item.value;
        
        item.element.addEventListener('click', (event) => {
            event.stopPropagation();
            if (item.disabled) return;
            this.#handleItemClick(item);
        });
        
        item.element.addEventListener('mouseenter', () => {
            if (item.disabled) return;
            this.#handleItemHover(item);
        });

        if (item.items) {
            item.submenu = new LS.Menu(null, {
                fixed: true,
                selectable: this.options.selectable,
                closeable: true
            });

            item.submenu.parentMenu = this;
            item.submenu.addItems(item.items);

            // Bubble events
            item.submenu.on('select', (data) => this.emit('select', [data]));
            item.submenu.on('check', (data) => this.emit('check', [data]));
        }
    }

    #updateItemElement(item) {
        if (!item.element) return;

        if (item === this.selectedItem) {
            item.element.classList.add('selected');
            item.element.focus();
        } else {
            item.element.classList.remove('selected');
        }

        if (item.type === 'checkbox' || item.type === 'radio') {
            if (item.inputElement) {
                item.inputElement.checked = !!item.checked;
                item.inputElement.disabled = !!item.disabled;
            }
            if (item.checked) {
                item.element.classList.add('checked');
            } else {
                item.element.classList.remove('checked');
            }
        }
        
        if (item.disabled) {
            item.element.classList.add('disabled');
        } else {
            item.element.classList.remove('disabled');
        }
    }

    #handleItemClick(item) {
        if (item.items) {
            if (item.submenu && !item.submenu.isOpen) {
                this.#openSubmenu(item);
            }
            return;
        }

        if (item.type === 'checkbox') {
            if (item.inputElement) {
                item.checked = item.inputElement.checked;
            } else {
                item.checked = !item.checked;
            }
            this.render();
            this.emit("check", [item]);
            if (typeof item.action === 'function') item.action(item);
            return;
        }

        if (item.type === 'radio') {
            if (item.inputElement) {
                if (item.inputElement.checked) {
                    if (item.group) {
                        this.items.forEach(i => {
                            if (i.type === 'radio' && i.group === item.group && i !== item) {
                                i.checked = false;
                            }
                        });
                    }
                    item.checked = true;
                    this.render();
                    this.emit("check", [item]);
                    if (typeof item.action === 'function') item.action(item);
                }
            } else if (!item.checked) {
                if (item.group) {
                    this.items.forEach(i => {
                        if (i.type === 'radio' && i.group === item.group) {
                            i.checked = false;
                        }
                    });
                }
                item.checked = true;
                this.render();
                this.emit("check", [item]);
                if (typeof item.action === 'function') item.action(item);
            }
            return;
        }

        this.select(item);
        if (typeof item.action === 'function') item.action(item);
        this.closeAll();
    }

    #handleItemHover(item) {
        if (this.activeSubmenu && this.activeSubmenu !== item.submenu) {
            this.activeSubmenu.close();
            this.activeSubmenu = null;
        }

        this.selectedItem = item;
        this.render();

        if (item.submenu) {
            this.#openSubmenu(item);
        }
    }

    #openSubmenu(item) {
        if (!item.submenu) return;
        
        const rect = item.element.getBoundingClientRect();
        let x = rect.right;
        let y = rect.top;
        
        if (x + 200 > window.innerWidth) {
            x = rect.left - 200;
        }
        
        item.submenu.open(x, y);
        this.activeSubmenu = item.submenu;
    }

    #handleKeyDown(event) {
        const key = event.key;

        if (key === 'ArrowDown') {
            event.preventDefault();
            this.navigate(1);
        } else if (key === 'ArrowUp') {
            event.preventDefault();
            this.navigate(-1);
        } else if (key === 'ArrowRight') {
            event.preventDefault();
            if (this.selectedItem && this.selectedItem.submenu) {
                this.#openSubmenu(this.selectedItem);
                this.selectedItem.submenu.navigate(1);
            }
        } else if (key === 'ArrowLeft') {
            event.preventDefault();
            if (this.parentMenu) {
                this.close();
                this.parentMenu.container.focus();
            }
        } else if (key === 'Enter' || key === ' ') {
            event.preventDefault();
            if (this.selectedItem) {
                if ((this.selectedItem.type === 'checkbox' || this.selectedItem.type === 'radio') && this.selectedItem.inputElement) {
                    this.selectedItem.inputElement.click();
                } else {
                    this.#handleItemClick(this.selectedItem);
                }
            }
        } else if (key === 'Escape') {
            event.preventDefault();
            this.close();
        }
    }

    render() {
        this.frameScheduler.schedule();
    }

    select(item) {
        this.emit("select", [item]);
        this.selectedItem = item;
        this.render();
    }

    /**
     * Add a new item to the menu
     * @param {*} item 
     * @property {string} item.text Text of the item
     * @property {string} item.icon (optional) Icon class for the item
     * @property {string} item.value Value of the item
     * @property {string} item.type Type of the item: "option" (default), "separator", "label", "checkbox", "radio", "submenu"
     * @property {boolean} item.checked For checkbox and radio types, whether the item is checked
     * @property {string} item.group For radio types, the group name
     * @property {Array} item.items For submenu type, the array of submenu items
     * @property {boolean} item.disabled If true, the item is disabled
     * @property {function} item.action Function to call when the item is selected
     */
    add(item) {
        this.items.push(item);
        this.render();
    }

    remove(item) {
        const index = this.items.indexOf(item);
        if(index === -1) return;
        this.items.splice(index, 1);
        if (item.element) {
            item.element.remove();
            item.element = null;
        }
        this.render();
    }

    addItems(items) {
        for(const item of items) {
            this.items.push(item);
        }
        this.render();
    }

    toggle() {
        if(this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open(x, y) {
        if (this.options.fixed) {
            let posX = x;
            let posY = y;

            if (posX === undefined || posY === undefined) {
                if (this.options.adjacentElement) {
                    const rect = this.options.adjacentElement.getBoundingClientRect();
                    posX = rect.left;
                    posY = rect.bottom;

                    if (this.options.inheritAdjacentWidth) {
                        this.container.style.minWidth = rect.width + 'px';
                    }
                } else {
                    posX = 0;
                    posY = 0;
                }
            }

            this.container.style.position = 'absolute';
            this.container.style.left = posX + 'px';
            this.container.style.top = posY + 'px';
            this.container.style.zIndex = 10000;

            // Temporarily show to measure size :(
            const prevVisibility = this.container.style.visibility;
            this.container.style.visibility = 'hidden';
            this.container.style.display = 'block';

            const rect = this.container.getBoundingClientRect();
            const menuW = rect.width;
            const menuH = rect.height;

            // Horizontal fit: try left side if overflow; else clamp to 0
            if (posX + menuW > window.innerWidth) {
                if (posX - menuW >= 0) {
                    posX = posX - menuW;
                } else {
                    posX = 0;
                }
            }

            // Vertical fit: try top side if overflow; else clamp to 0
            if (posY + menuH > window.innerHeight) {
                if (posY - menuH >= 0) {
                    posY = posY - menuH;
                } else {
                    posY = 0;
                }
            }

            // Apply final position and constraints
            this.container.style.left = posX + 'px';
            this.container.style.top = posY + 'px';
            this.container.style.maxWidth = Math.max(0, window.innerWidth - posX) + 'px';
            this.container.style.maxHeight = Math.max(0, window.innerHeight - posY) + 'px';

            // Restore visibility (keep display block for animation)
            this.container.style.visibility = prevVisibility || '';
        }

        if(LS.Animation) {
            LS.Animation.fadeIn(this.container, 200, "down");
        } else {
            this.container.style.display = 'block';
        }
        
        if (this.options.searchable && this.searchInput) {
            this.searchInput.value = '';
            this.#filterItems('');
            this.searchInput.focus();
        } else {
            this.container.focus();
        }

        if(this.isOpen) return;
        this.isOpen = true;
        this.emit("open");
    }
    
    close() {
        if(!this.isOpen) return;
        
        if (this.activeSubmenu) {
            this.activeSubmenu.close();
            this.activeSubmenu = null;
        }

        this.isOpen = false;
        this.emit("close");

        if(LS.Animation) {
            LS.Animation.fadeOut(this.container, 200, "down");
        } else {
            this.container.style.display = 'none';
        }
    }
    
    closeAll() {
        this.close();
        if (this.parentMenu) {
            this.parentMenu.closeAll();
        }
    }

    navigate(direction) {
        if(this.items.length === 0) return;

        let currentIndex = this.items.indexOf(this.selectedItem);
        let newIndex = currentIndex;
        
        let count = 0;
        do {
            newIndex += direction;
            if (newIndex >= this.items.length) newIndex = 0;
            if (newIndex < 0) newIndex = this.items.length - 1;
            
            const item = this.items[newIndex];
            const isVisible = !item.element || item.element.style.display !== 'none';

            if (item.type !== 'separator' && item.type !== 'label' && !item.disabled && isVisible) {
                this.select(item);
                return;
            }
            count++;
        } while (count < this.items.length);
    }

    cloneOption(option) {
        return {
            text: option.text,
            icon: option.icon,
            value: option.value,
            type: option.type || "option",
            checked: option.checked,
            group: option.group,
            items: option.items ? option.items.map(i => this.cloneOption(i)) : undefined
        };
    }

    export() {
        return this.items.map(item => this.cloneOption(item));
    }

    destroy() {
        this.frameScheduler.destroy();
        this.container.remove();
        this.events.clear();

        if(this.options.adjacentElement) {
            this.options.adjacentElement.__menu = null;

            if(this.__adjacentClickHandler) {
                this.options.adjacentElement.removeEventListener('click', this.__adjacentClickHandler);
                this.options.adjacentElement.removeEventListener('contextmenu', this.__adjacentClickHandler);
            }
    
            if(this.__adjacentKeyHandler) {
                this.options.adjacentElement.removeEventListener('keydown', this.__adjacentKeyHandler);
            }
        }

        if(this.__documentClickHandler) {
            document.removeEventListener('click', this.__documentClickHandler);
        }
        
        this.items.forEach(item => {
            if (item.submenu) item.submenu.destroy();
        });

        if(this.searchInput) {
            this.searchInput.remove();
            this.searchInput = null;
        }

        if(this.searchContainer) {
            this.searchContainer.remove();
            this.searchContainer = null;
        }

        this.container = null;
        this.items = null;
        this.selectedItem = null;
        this.isOpen = false;
        this.__destroyed = true;
    }
}, { global: true, name: "Menu" });

customElements.define('ls-select', class LSSelect extends HTMLElement {
    constructor() {
        super();
        this.options = [];
    }

    connectedCallback() {
        if(!LS.GetComponent("Menu")) {
            console.error("LSSelect requires LS.Menu component to be loaded.");

            LS.on("component-loaded", (component) => {
                if(component.name === "Menu") {
                    this.connectedCallback();
                    return LS.REMOVE_LISTENER;
                }
            });
            return;
        }

        this.menu = new LS.Menu({ 
            fixed: true, 
            searchable: this.hasAttribute('searchable'),
            adjacentElement: this,
            inheritAdjacentWidth: true
        });

        this.menu.on("select", (item) => {
            this.handle.textContent = item.text;
            this.dispatchEvent(new Event('change', { bubbles: true, detail: { value: item.value, item } }));
        });

        this.menu.on("open", (item) => {
            this.setAttribute('aria-expanded', 'true');
        });

        this.menu.on("close", (item) => {
            this.setAttribute('aria-expanded', 'false');
        });

        this.setAttribute('role', 'combobox');
        this.setAttribute('tabindex', '0');
        this._render();
    }

    disconnectedCallback() {
        if(this.menu) {
            this.menu.destroy();
            this.menu = null;
        }
    }

    _render() {
        // const select = this.querySelector('select') || document.createElement('select');
        // select.style.display = 'none';

        let selectedOption = null;
        this.options = [];

        for(const opt of this.querySelectorAll('ls-option, option, optgroup')) {
            if (opt.selected || opt.getAttribute("selected") !== null) selectedOption = opt;
            opt.setAttribute('role', 'option');

            const option = opt.tagName.toLowerCase() === 'optgroup'? {
                type: "label",
                text: opt.getAttribute("label") || '',
            }: {
                value: opt.value || opt.getAttribute('value') || opt.textContent,
                text: opt.getAttribute("label") || opt.textContent,
                selected: opt.getAttribute("selected") !== null,
                optionElement: opt,
                element: N({
                    class: "ls-list-item ls-select-option",
                    textContent: opt.textContent,
                    tabindex: -1
                })
            };

            if(option.type !== "label") {
                option.element.dataset.value = option.value;
                option.element.addEventListener('click', (event) => {
                    event.stopPropagation();
                    this.selectOption(option);
                });

                opt.remove();
            }

            this.menu.add(option); // Moves the element to the menu
        }

        this.handle = this.querySelector('.ls-select-display') || N({
            class: "ls-select-display",
            textContent: selectedOption ? selectedOption.textContent : (this.getAttribute("placeholder") || 'Select an option')
        }).addTo(this);

        this._labelTarget = this.querySelector('.ls-select-display .ls-select-label-target, .ls-select-display');

        this.menu.render();
    }

    addOption(option) {
        this.menu.add(option);
    }

    toggle() {
        this.menu.toggle();
    }

    open() {
        this.menu.open();
    }

    close() {
        this.menu.close();
    }

    selectOption(value) {
        this.menu.select(value);
    }

    get value() {
        return this.menu.selectedItem?.value || '';
    }

    set value(val) {
        this.menu.select(val);
    }
});