/**
 * Menu Component
 * Primary abstract menu class used for dropdowns, context menus, select menus, etc.
 * 
 * @author lstv.space
 * @license GPL-3.0
 */

LS.LoadComponent(class Menu extends LS.Component {
    static index = 0;
    static groups = {};

    static addContextMenu(element, itemsProvider, options = {}) {
        if (Array.isArray(itemsProvider)) {
            // Create a persistent menu

            if (element.__menu) {
                element.__menu.destroy();
            }

            new LS.Menu(options, {
                adjacentElement: element,
                adjacentMode: 'context',
                items: itemsProvider,
                ...options
            });
        } else if (typeof itemsProvider === 'function') {
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
     * @property {boolean} options.selectable If true, the menu behaves like a select
     * @property {boolean} options.closeOnSelect If true, the menu closes when an item is selected
     * @property {boolean} options.closeable If true, the menu can be closed
     * @property {Element} options.adjacentElement If provided, the menu opens next to this element
     * @property {string} options.adjacentMode 'click' (default) or 'context' to open on right-click
     * @property {boolean} options.openOnAdjacentClick If true, clicking the adjacentElement toggles the menu
     * @property {boolean} options.inheritAdjacentWidth If true, the menu inherits the width of the adjacentElement
     * @property {boolean} options.fixed If true, the menu position is fixed rather than static
     * @property {boolean} options.ephemeral If true, the menu is destroyed when closed
     * @property {boolean} options.searchable If true, the menu has a search box to filter items
     * @property {string} options.group If set, only one menu in the group can be open at a time
     */
    constructor(element, options = null) {
        super();
        this.isOpen = false;

        this.items = [];
        this.selectedItem = null;
        this.focusedItem = null;
        this.activeSubmenu = null;
        this.parentMenu = null;

        this.__previousActiveElement = null;

        const isElement = element instanceof HTMLElement;
        if (!isElement) {
            options = options || element;
        }

        this.container = (isElement ? element : N({
            class: "ls-menu"
        }));

        this.container.style.display = "none";
        this.container.classList.add("ls-menu-container");
        this.container.tabIndex = -1;

        if (options.items) {
            this.items = options.items;
            delete options.items;
        }

        this.options = LS.Util.defaults({
            topLayer: true,
            fixed: true,
            selectable: false,
            closeOnSelect: true,
            closeable: true,
            adjacentElement: null,
            openOnAdjacentClick: true,
            adjacentMode: "click",
            ephemeral: false,
            searchable: false,
            inheritAdjacentWidth: false,
            group: null
        }, options || {});

        if (this.options.group) {
            if (!this.constructor.groups[this.options.group]) {
                this.constructor.groups[this.options.group] = new Set();
            }
            this.constructor.groups[this.options.group].add(this);
        }

        if (this.options.topLayer) {
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
                    if (this.focusedItem) {
                        this.#handleItemClick(this.focusedItem);
                    }
                }
            });
        }

        if (this.options.adjacentElement) {
            this.options.adjacentElement.__menu = this;

            if (this.options.openOnAdjacentClick) {
                if (this.options.adjacentMode === 'context') {
                    this.options.adjacentElement.addEventListener('contextmenu', this.__adjacentClickHandler = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.open(e.clientX, e.clientY);
                    });
                } else {
                    this.options.adjacentElement.addEventListener('pointerdown', this.__adjacentClickHandler = (e) => {
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

                if (this.options.group && this.options.adjacentMode !== 'context') {
                    this.options.adjacentElement.addEventListener('mouseenter', this.__adjacentHoverHandler = () => {
                        const group = this.constructor.groups[this.options.group];
                        if (!group) return;

                        let anyOpen = false;
                        for (const menu of group) {
                            if (menu.isOpen) {
                                anyOpen = true;
                                break;
                            }
                        }

                        if (anyOpen && !this.isOpen) {
                            this.open();
                        }
                    });
                }
            }
        }

        document.addEventListener('click', this.__documentClickHandler = (e) => {
            if (!this.isOpen) return;
            if (this.container.contains(e.target)) return;
            if (this.options.adjacentElement && this.options.adjacentElement.contains(e.target)) return;

            let parent = this.parentMenu;
            while (parent) {
                if (parent.container.contains(e.target)) return;
                parent = parent.parentMenu;
            }

            this.close();
        });

        if (this.options.ephemeral) {
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

        // Build set of elements that should remain
        const currentItems = [], currentElementsSet = new Set();
        for (const item of this.items) {
            if (!item.hidden) {
                currentItems.push(item);
                currentElementsSet.add(item.element);
            }
        }

        while(currentItems[0]?.element?.tagName === 'HR') {
            currentElementsSet.delete(currentItems.shift().element);
        }

        while(currentItems[currentItems.length - 1]?.element?.tagName === 'HR') {
            currentElementsSet.delete(currentItems.pop().element);
        }

        // Remove elements
        for (const child of Array.from(this.container.children)) {
            // if (!currentElementsSet.has(child)) {
                this.container.removeChild(child);
            // }
        }

        if (this.searchContainer?.parentNode === this.container && this.container.firstChild !== this.searchContainer) {
            this.container.prepend(this.searchContainer);
        }

        // Create/update/append items
        for (const item of currentItems) {
            if (!item.element) {
                this.#createItemElement(item);
            }

            this.#updateItemElement(item);

            if (item.element.parentNode !== this.container) {
                this.container.appendChild(item.element);
            }
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
            this.focus(firstVisible);
        } else {
            this.focusedItem = null;
            this.items.forEach(i => {
                if (i.element) i.element.classList.remove('focused');
            });
        }
    }

    #createItemElement(item) {
        if (item.type === "separator") {
            item.element = LS.Create("hr", {
                class: "ls-menu-separator"
            });
            return;
        }

        if (item.type === "label") {
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

            item.element.addEventListener('mouseenter', () => {
                if (item.disabled) return;
                this.#handleItemHover(item);
            });

            input.addEventListener('change', () => {
                this.#handleItemClick(item);
            });

            return;
        }

        const label = LS.Create("span");
        label.innerHTML = item.text;
        LS.Util.sanitize(label);
        label.classList.add("ls-menu-item-label");

        const inner = [label];

        if (item.icon) {
            inner.unshift(LS.Create("i", { class: item.icon + " ls-menu-item-icon" }));
        }

        if (item.items || item.type === 'submenu') {
            inner.push({ class: "ls-menu-submenu-arrow" });
        }

        item.element = LS.Create({
            class: "ls-list-item ls-menu-item",
            attributes: { 'role': 'option', tabindex: "-1" },
            inner
        });

        if (item.disabled) {
            item.element.classList.add('disabled');
        }

        item.element.dataset.value = item.value;

        item.element.addEventListener('pointerup', (event) => {
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

        if (item === this.focusedItem) {
            item.element.classList.add('focused');
            item.element.setAttribute('tabindex', '0');
        } else {
            item.element.classList.remove('focused');
            item.element.setAttribute('tabindex', '-1');
        }

        if (this.options.selectable && item === this.selectedItem) {
            item.element.classList.add('selected');
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

        if (this.options.closeOnSelect) {
            this.closeAll();
        }
    }

    #handleItemHover(item) {
        if (this.activeSubmenu && this.activeSubmenu !== item.submenu) {
            this.activeSubmenu.close();
            this.activeSubmenu = null;
        }

        this.focus(item);

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
            if (this.focusedItem && this.focusedItem.submenu) {
                this.#openSubmenu(this.focusedItem);
                this.focusedItem.submenu.navigate(1);
            } else if (this.options.group && this.options.adjacentMode !== 'context') {
                this.#navigateGroup(1);
            }
        } else if (key === 'ArrowLeft') {
            event.preventDefault();
            if (this.parentMenu) {
                this.close();
                if (this.parentMenu.focusedItem) {
                    this.parentMenu.focus(this.parentMenu.focusedItem);
                } else {
                    this.parentMenu.container.focus();
                }
            } else if (this.options.group && this.options.adjacentMode !== 'context') {
                this.#navigateGroup(-1);
            }
        } else if (key === 'Enter' || key === ' ') {
            event.preventDefault();
            if (this.focusedItem) {
                if ((this.focusedItem.type === 'checkbox' || this.focusedItem.type === 'radio') && this.focusedItem.inputElement) {
                    this.focusedItem.inputElement.click();
                } else {
                    this.#handleItemClick(this.focusedItem);
                }
            }
        } else if (key === 'Escape') {
            event.preventDefault();
            this.close();
        } else if (key === 'Tab') {
            this.close();
        }
    }

    #navigateGroup(direction) {
        const groupName = this.options.group;
        if (!groupName) return;

        const groupSet = this.constructor.groups[groupName];
        if (!groupSet || groupSet.size < 2) return;

        const menus = Array.from(groupSet).filter(m => m.options.adjacentElement && document.body.contains(m.options.adjacentElement));

        menus.sort((a, b) => {
            return (a.options.adjacentElement.compareDocumentPosition(b.options.adjacentElement) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
        });

        const currentIndex = menus.indexOf(this);
        if (currentIndex === -1) return;

        let nextIndex = currentIndex + direction;
        if (nextIndex >= menus.length) nextIndex = 0;
        if (nextIndex < 0) nextIndex = menus.length - 1;

        const nextMenu = menus[nextIndex];
        this.close();
        nextMenu.open();
        nextMenu.navigate(1);
    }

    render() {
        this.frameScheduler.schedule();
    }

    focus(item) {
        if (this.focusedItem && this.focusedItem.element) {
            this.focusedItem.element.classList.remove('focused');
            this.focusedItem.element.setAttribute('tabindex', '-1');
        }

        this.focusedItem = item;

        if (this.focusedItem && this.focusedItem.element) {
            this.focusedItem.element.classList.add('focused');
            this.focusedItem.element.setAttribute('tabindex', '0');
            this.focusedItem.element.focus();

            if (this.focusedItem.element.scrollIntoView) {
                this.focusedItem.element.scrollIntoView({ block: 'nearest' });
            }
        }
    }

    select(item, emitEvent = true) {
        if (typeof item === 'number') {
            item = this.items[item] || null;
        }

        if (typeof item === 'string') {
            item = this.items.find(i => i.value === item) || this.items[0];
        }

        if (!item) return;
        if (this.options.selectable) {
            this.selectedItem = item;
        }

        if (emitEvent) {
            this.emit("select", [item]);
        }
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
        if (index === -1) return;
        this.items.splice(index, 1);
        if (item.element) {
            item.element.remove();
            item.element = null;
        }
        this.render();
    }

    addItems(items) {
        for (const item of items) {
            this.items.push(item);
        }
        this.render();
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open(x, y) {
        if (this.options.group && this.constructor.groups[this.options.group]) {
            for (const menu of this.constructor.groups[this.options.group]) {
                if (menu !== this && menu.isOpen) {
                    menu.close();
                }
            }
        }

        this.render();

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

        if (LS.Animation) {
            LS.Animation.fadeIn(this.container, 200, "down");
        } else {
            this.container.style.display = 'block';
        }

        this.__previousActiveElement = document.activeElement;
        if (this.options.searchable && this.searchInput) {
            this.searchInput.value = '';
            this.#filterItems('');
            this.searchInput.focus();
        } else {
            if (this.selectedItem) {
                this.focus(this.selectedItem);
            } else {
                this.navigate(1);
            }
        }

        if (this.isOpen) return;
        this.isOpen = true;
        this.emit("open");
    }

    close() {
        if (!this.isOpen) return;

        if (this.__previousActiveElement) {
            this.__previousActiveElement.focus();
            this.__previousActiveElement = null;
        }

        if (this.activeSubmenu) {
            this.activeSubmenu.close();
            this.activeSubmenu = null;
        }

        this.isOpen = false;
        this.emit("close");

        if (LS.Animation) {
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
        if (this.items.length === 0) return;

        let currentIndex = this.items.indexOf(this.focusedItem);
        let newIndex = currentIndex;

        let count = 0;
        do {
            newIndex += direction;
            if (newIndex >= this.items.length) newIndex = 0;
            if (newIndex < 0) newIndex = this.items.length - 1;

            const item = this.items[newIndex];
            const isVisible = !item.element || item.element.style.display !== 'none';

            if (item.type !== 'separator' && item.type !== 'label' && !item.disabled && isVisible) {
                this.focus(item);
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

        if (this.options.group && this.constructor.groups[this.options.group]) {
            this.constructor.groups[this.options.group].delete(this);
        }

        if (this.options.adjacentElement) {
            this.options.adjacentElement.__menu = null;

            if (this.__adjacentClickHandler) {
                this.options.adjacentElement.removeEventListener('click', this.__adjacentClickHandler);
                this.options.adjacentElement.removeEventListener('contextmenu', this.__adjacentClickHandler);
            }

            if (this.__adjacentKeyHandler) {
                this.options.adjacentElement.removeEventListener('keydown', this.__adjacentKeyHandler);
            }

            if (this.__adjacentHoverHandler) {
                this.options.adjacentElement.removeEventListener('mouseenter', this.__adjacentHoverHandler);
            }
        }

        if (this.__documentClickHandler) {
            document.removeEventListener('click', this.__documentClickHandler);
        }

        this.items.forEach(item => {
            if (item.submenu) item.submenu.destroy();
        });

        if (this.searchInput) {
            this.searchInput.remove();
            this.searchInput = null;
        }

        if (this.searchContainer) {
            this.searchContainer.remove();
            this.searchContainer = null;
        }

        this.container = null;
        this.items = null;
        this.selectedItem = null;
        this.focusedItem = null;
        this.isOpen = false;
        this.__previousActiveElement = null;
        this.destroyed = true;
    }
}, { global: true, name: "Menu" });

customElements.define('ls-select', class LSSelect extends HTMLElement {
    constructor() {
        super();
        this.__pendingValue = null;
    }

    connectedCallback() {
        if (this.menu) return;
        if (!this.__pendingValue) this.__pendingValue = this.getAttribute('value');

        if (!LS.GetComponent("Menu")) {
            console.error("LSSelect requires LS.Menu component to be loaded.");

            LS.on("component-loaded", (component) => {
                if (component.name === "Menu") {
                    this.connectedCallback();
                    return LS.REMOVE_LISTENER;
                }
            });
            return;
        }

        this.menu = new LS.Menu({
            fixed: true,
            searchable: this.hasAttribute('searchable'),
            selectable: true,
            adjacentElement: this,
            inheritAdjacentWidth: true
        });

        this.menu.on("select", (item) => {
            this.#updateValue();
            this.dispatchEvent(new Event('change', { bubbles: true, detail: { value: item.value, item } }));
            this.dispatchEvent(new Event('input', { bubbles: true, detail: { value: item.value, item } }));
            if (this.onchange) this.onchange({ target: this, value: item.value, item });
            if (this.oninput) this.oninput({ target: this, value: item.value, item });
        });

        this.menu.on("open", (item) => {
            this.setAttribute('aria-expanded', 'true');
        });

        this.menu.on("close", (item) => {
            this.setAttribute('aria-expanded', 'false');
        });

        this.setAttribute('role', 'combobox');
        this.setAttribute('tabindex', '0');
        this.#generateMenu();
    }

    // Sadly there is no "garbageCollectedCallback"
    // So lifecycle management is manual and up to the user when using ls-select!!
    // disconnectedCallback() {
    //     this.destroy();
    // }

    connectedMoveCallback() {}

    #generateMenu() {
        let selectedOption = null;

        this.label = this.querySelector('.ls-select-label') || N({
            class: "ls-select-label"
        });

        this.content = LS.Create({
            class: "ls-select-content",
            inner: [
                this.label, { class: "ls-select-arrow" }
            ]
        }).addTo(this);

        if (!this._lsSelectOptions) {
            for (const optionElement of this.querySelectorAll('ls-option, option, optgroup')) {
                const isSelected = optionElement.selected || optionElement.getAttribute("selected") !== null;

                const option = optionElement.tagName.toLowerCase() === 'optgroup' ? {
                    type: "label",
                    text: optionElement.getAttribute("label") || '',
                } : {
                    value: optionElement.value || optionElement.getAttribute('value') || optionElement.textContent,
                    text: optionElement.getAttribute("label") || optionElement.textContent,
                    selected: isSelected
                };

                optionElement.remove();
                this.menu.add(option);

                if (isSelected && !selectedOption) {
                    selectedOption = option;
                }
            }
        } else {
            this.menu.items = this._lsSelectOptions;
            delete this._lsSelectOptions;
        }

        this.menu.select(this.__pendingValue || selectedOption || 0, false);
        this.#updateValue();
        this.__pendingValue = null;
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

    #updateValue() {
        const item = this.menu.selectedItem;
        this.label.textContent = item?.text || '';
        this.setAttribute('data-value', item?.value || '');
    }

    selectOption(value) {
        if (!this.menu) {
            this.__pendingValue = value;
            return;
        }

        this.menu.select(value, false);
        this.#updateValue();
    }

    get value() {
        return this.menu.selectedItem?.value || '';
    }

    set value(value) {
        this.selectOption(value);
    }

    destroy() {
        if (this.menu) {
            this.menu.destroy();
            this.menu = null;
        }

        this.content.remove();
        this.content = null;
        this.label = null;
        this.__pendingValue = null;
    }
});