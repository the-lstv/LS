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
    static contextMenuBindings = new WeakMap();
    static contextMenus = new Set();
    static openMenus = new Set();
    static globalClickListenerBound = false;
    static zIndexCounter = 10000;

    static DEFAULTS = {
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
    };

    static addContextMenu(element, itemsProvider, options = {}) {
        if (!(element instanceof HTMLElement)) return null;
        if (!Array.isArray(itemsProvider) && typeof itemsProvider !== 'function') return null;

        let binding = this.contextMenuBindings.get(element);

        if (!binding || !binding.menu || binding.menu.destroyed) {
            if (binding && binding.handler) {
                element.removeEventListener('contextmenu', binding.handler);
            }

            const menu = new LS.Menu({
                adjacentElement: element,
                adjacentMode: 'context',
                openOnAdjacentClick: false,
                items: Array.isArray(itemsProvider) ? itemsProvider : [],
                ...options
            });

            this.contextMenus.add(menu);

            binding = {
                menu,
                itemsProvider,
                options,
                handler: null
            };

            binding.handler = (e) => {
                e.preventDefault();
                e.stopPropagation();

                for (const contextMenu of this.contextMenus) {
                    if (!contextMenu || contextMenu.destroyed) {
                        this.contextMenus.delete(contextMenu);
                        continue;
                    }

                    if (contextMenu !== menu && contextMenu.isOpen) {
                        contextMenu.close();
                    }
                }

                const sourceItems = (typeof binding.itemsProvider === 'function')
                    ? binding.itemsProvider(e, menu)
                    : binding.itemsProvider;
                const nextItems = Array.isArray(sourceItems) ? sourceItems : [];

                if (menu.items !== nextItems) {
                    menu.replaceItems(nextItems);
                } else {
                    menu.render();
                }

                menu.open(e.clientX, e.clientY);
            };

            element.addEventListener('contextmenu', binding.handler);
            this.contextMenuBindings.set(element, binding);
            return menu;
        }

        binding.itemsProvider = itemsProvider;
        binding.options = options || {};
        this.contextMenus.add(binding.menu);

        if ('closeOnSelect' in binding.options) binding.menu.options.closeOnSelect = binding.options.closeOnSelect;
        if ('closeable' in binding.options) binding.menu.options.closeable = binding.options.closeable;
        if ('selectable' in binding.options) binding.menu.options.selectable = binding.options.selectable;
        if ('fixed' in binding.options) binding.menu.options.fixed = binding.options.fixed;
        if ('inheritAdjacentWidth' in binding.options) binding.menu.options.inheritAdjacentWidth = binding.options.inheritAdjacentWidth;

        if (Array.isArray(binding.itemsProvider)) {
            if (binding.menu.items !== binding.itemsProvider) {
                binding.menu.replaceItems(binding.itemsProvider);
            } else {
                binding.menu.render();
            }
        } else {
            binding.menu.render();
        }

        return binding.menu;
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

        options = options || {};

        this.container = (isElement ? element : N({
            class: "ls-menu"
        }));

        this.container.style.display = "none";
        this.container.classList.add("ls-menu-container");
        this.container.tabIndex = -1;

        if (!this.constructor.globalClickListenerBound) {
            const MenuClass = this.constructor;
            document.addEventListener('pointerdown', MenuClass.__globalPointerHandler = (e) => {
                if (!MenuClass.openMenus.size) return;

                for (const menu of MenuClass.openMenus) {
                    menu.#handleDocumentClick(e.target);
                }
            }, true);
            this.constructor.globalClickListenerBound = true;
        }

        if (options.items) {
            this.items = options.items;
            delete options.items;
        }

        this.options = LS.Util.defaults(this.constructor.DEFAULTS, options || {});

        if (this.options.group) {
            if (!this.constructor.groups[this.options.group]) {
                this.constructor.groups[this.options.group] = new Set();
            }
            this.constructor.groups[this.options.group].add(this);
        }

        if (this.options.topLayer) {
            LS.once("ready", () => {
                this.container.addTo(LS._topLayer.querySelector('.ls-dropdown-layer') || N({
                    class: "ls-dropdown-layer"
                }).addTo(LS._topLayer));
            });
        }

        this.searchInput = null;
        this.searchContainer = null;

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

        if (this.options.ephemeral) {
            this.on('close', () => {
                this.destroy();
            });
        }

        // Lazy-initialized on first scheduled render to keep instances lightweight.
        this.frameScheduler = null;

        this.container.addEventListener('keydown', (e) => this.#handleKeyDown(e));
    }

    #ensureSearchElements() {
        if (!this.options.searchable || this.searchInput) return;

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

    #render() {
        const hasIcons = this.items.some(i => i.icon);
        this.container.classList.toggle('ls-menu-has-icons', hasIcons);
        this.container.classList.toggle('ls-menu-no-icons', !hasIcons);

        const currentItems = [];
        for (const item of this.items) {
            if (!item.hidden) {
                currentItems.push(item);
            }
        }

        while (currentItems[0] && (currentItems[0].type === 'separator' || currentItems[0].element?.tagName === 'HR')) {
            currentItems.shift();
        }

        while (currentItems[currentItems.length - 1] && (currentItems[currentItems.length - 1].type === 'separator' || currentItems[currentItems.length - 1].element?.tagName === 'HR')) {
            currentItems.pop();
        }

        const nextChildren = [];
        if (this.searchContainer) {
            nextChildren.push(this.searchContainer);
        }

        for (const item of currentItems) {
            if (!item.element) {
                this.#createItemElement(item);
            }

            this.#updateItemElement(item);
            nextChildren.push(item.element);
        }

        const existingChildren = this.container.children;
        let changed = existingChildren.length !== nextChildren.length;

        if (!changed) {
            for (let i = 0; i < nextChildren.length; i++) {
                if (existingChildren[i] !== nextChildren[i]) {
                    changed = true;
                    break;
                }
            }
        }

        if (changed) {
            this.container.replaceChildren(...nextChildren);
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

        if (!item.items && item.submenu) {
            item.submenu.destroy();
            item.submenu = null;
        }
    }

    #ensureSubmenu(item) {
        if (!item || !item.items) return null;

        if (!item.submenu || item.submenu.destroyed) {
            item.submenu = new LS.Menu(null, {
                fixed: true,
                selectable: this.options.selectable,
                closeable: true
            });

            item.submenu.parentMenu = this;

            // Bubble events
            item.submenu.on('select', (data) => this.emit('select', [data]));
            item.submenu.on('check', (data) => this.emit('check', [data]));
        }

        if (item.submenu.items !== item.items) {
            item.submenu.replaceItems(item.items);
        }

        return item.submenu;
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
        if (!this.isOpen) return;

        if (this.activeSubmenu && this.activeSubmenu !== item.submenu) {
            this.activeSubmenu.close();
            this.activeSubmenu = null;
        }

        this.focus(item);

        if (item.items) {
            this.#openSubmenu(item);
        }
    }

    #openSubmenu(item) {
        if (!this.isOpen) return;
        if (!item || !item.items) return;

        let menu = this;
        while (menu) {
            if (!menu.isOpen) return;
            menu = menu.parentMenu;
        }

        const submenu = this.#ensureSubmenu(item);
        if (!submenu) return;

        const rect = item.element.getBoundingClientRect();
        submenu.open(rect.right, rect.top, {
            anchorRect: rect
        });
        this.activeSubmenu = submenu;
    }

    #closeTree(restoreFocus = true) {
        if (this.items) {
            for (const item of this.items) {
                if (!item.submenu) continue;

                if (item.submenu.isOpen || item.submenu.activeSubmenu) {
                    item.submenu.#closeTree(false);
                }
            }
        }

        this.activeSubmenu = null;

        if (this.isOpen) {
            this.close(restoreFocus);
        }
    }

    #handleDocumentClick(target) {
        if (!this.isOpen || !this.container) return;
        if (this.container.contains(target)) return;
        if (this.options.adjacentElement && this.options.adjacentElement.contains(target)) {
            // Context menus should still close when their target is clicked.
            if (this.options.adjacentMode !== 'context') return;
        }

        let parent = this.parentMenu;
        while (parent) {
            if (parent.container && parent.container.contains(target)) return;
            parent = parent.parentMenu;
        }

        this.close();
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
            if (this.focusedItem && this.focusedItem.items) {
                this.#openSubmenu(this.focusedItem);
                if (this.focusedItem.submenu && this.focusedItem.submenu.isOpen) {
                    this.focusedItem.submenu.navigate(1);
                }
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

    render(force = false) {
        if (force) {
            this.#render();
            return;
        }

        if (!this.isOpen) return;
        if (!this.frameScheduler) {
            this.frameScheduler = new LS.Util.FrameScheduler(() => this.#render());
        }
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

    /**
     * Replaces menu items
     * @param {Array} items Array of items.
     */
    replaceItems(items) {
        const nextItems = Array.isArray(items) ? items : [];

        if (this.items === nextItems) {
            this.render();
            return;
        }

        for (const item of this.items) {
            if (!item.submenu) continue;
            if (nextItems.includes(item)) continue;
            item.submenu.destroy();
            item.submenu = null;
        }

        this.items = nextItems;

        if (this.selectedItem && !this.items.includes(this.selectedItem)) {
            this.selectedItem = null;
        }

        if (this.focusedItem && !this.items.includes(this.focusedItem)) {
            this.focusedItem = null;
        }

        this.render();
    }

    remove(item) {
        const index = this.items.indexOf(item);
        if (index === -1) return;
        this.items.splice(index, 1);
        if (item.submenu) {
            item.submenu.destroy();
            item.submenu = null;
        }
        if (item.element) {
            item.element.remove();
            item.element = null;
        }
        this.render();
    }

    addItems(items) {
        if (!items || items.length === 0) return;
        this.items.push(...items);
        this.render();
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open(x, y, positionOptions = null) {
        if (this.options.group && this.constructor.groups[this.options.group]) {
            for (const menu of this.constructor.groups[this.options.group]) {
                if (menu !== this && (menu.isOpen || menu.activeSubmenu)) {
                    menu.#closeTree(false);
                }
            }
        }

        this.#ensureSearchElements();
        this.render(true);
        this.container.style.zIndex = ++this.constructor.zIndexCounter;

        if (this.options.fixed) {
            let posX = x;
            let posY = y;
            let anchorRect = positionOptions && positionOptions.anchorRect ? positionOptions.anchorRect : null;
            const viewportPadding = 8;

            if (posX === undefined || posY === undefined) {
                if (this.options.adjacentElement) {
                    const rect = this.options.adjacentElement.getBoundingClientRect();
                    anchorRect = anchorRect || rect;
                    posX = rect.left;
                    posY = rect.bottom;

                    if (this.options.inheritAdjacentWidth) {
                        this.container.style.minWidth = rect.width + 'px';
                    }
                } else {
                    if (!this.options.inheritAdjacentWidth) {
                        this.container.style.minWidth = '';
                    }
                    posX = 0;
                    posY = 0;
                }
            } else {
                if (!this.options.inheritAdjacentWidth) {
                    this.container.style.minWidth = '';
                } else {
                    const width = this.options.adjacentElement ? this.options.adjacentElement.getBoundingClientRect().width : null;
                    if (width) {
                        this.container.style.minWidth = width + 'px';
                    }
                }
            }

            this.container.style.position = 'fixed';
            this.container.style.left = posX + 'px';
            this.container.style.top = posY + 'px';
            this.container.style.maxWidth = '';
            this.container.style.maxHeight = '';

            // Temporarily show to measure size :(
            const prevVisibility = this.container.style.visibility;
            this.container.style.visibility = 'hidden';
            this.container.style.display = 'block';

            const rect = this.container.getBoundingClientRect();
            const menuW = rect.width;
            const menuH = rect.height;
            const maxX = Math.max(viewportPadding, window.innerWidth - menuW - viewportPadding);
            const maxY = Math.max(viewportPadding, window.innerHeight - menuH - viewportPadding);

            if (posX + menuW > window.innerWidth - viewportPadding) {
                if (anchorRect) {
                    const leftCandidate = anchorRect.left - menuW;
                    if (leftCandidate >= viewportPadding) {
                        posX = leftCandidate;
                    } else {
                        posX = maxX;
                    }
                } else {
                    posX = maxX;
                }
            }

            if (posY + menuH > window.innerHeight - viewportPadding) {
                if (anchorRect) {
                    const aboveCandidate = anchorRect.top - menuH;
                    if (aboveCandidate >= viewportPadding) {
                        posY = aboveCandidate;
                    } else {
                        posY = maxY;
                    }
                } else {
                    posY = maxY;
                }
            }

            if (posX < viewportPadding) posX = viewportPadding;
            if (posY < viewportPadding) posY = viewportPadding;

            // Apply final position and constraints
            this.container.style.left = posX + 'px';
            this.container.style.top = posY + 'px';
            this.container.style.maxWidth = Math.max(0, window.innerWidth - posX - viewportPadding) + 'px';
            this.container.style.maxHeight = Math.max(0, window.innerHeight - posY - viewportPadding) + 'px';

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
        this.constructor.openMenus.add(this);
        this.emit("open");
    }

    close(restoreFocus = true) {
        if (!this.isOpen) return;

        if (restoreFocus && this.__previousActiveElement) {
            this.__previousActiveElement.focus();
        }
        this.__previousActiveElement = null;

        if (this.activeSubmenu) {
            this.activeSubmenu.#closeTree(false);
            this.activeSubmenu = null;
        }

        this.isOpen = false;
        this.constructor.openMenus.delete(this);
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
        if (this.frameScheduler) {
            this.frameScheduler.destroy();
            this.frameScheduler = null;
        }
        this.container.remove();
        this.events.clear();
        this.constructor.contextMenus.delete(this);
        this.constructor.openMenus.delete(this);

        if (this.options.group && this.constructor.groups[this.options.group]) {
            this.constructor.groups[this.options.group].delete(this);
        }

        if (this.options.adjacentElement) {
            const contextBinding = this.constructor.contextMenuBindings.get(this.options.adjacentElement);
            if (contextBinding && contextBinding.menu === this) {
                this.options.adjacentElement.removeEventListener('contextmenu', contextBinding.handler);
                this.constructor.contextMenuBindings.delete(this.options.adjacentElement);
            }

            this.options.adjacentElement.__menu = null;

            if (this.__adjacentClickHandler) {
                this.options.adjacentElement.removeEventListener('pointerdown', this.__adjacentClickHandler);
                this.options.adjacentElement.removeEventListener('contextmenu', this.__adjacentClickHandler);
            }

            if (this.__adjacentKeyHandler) {
                this.options.adjacentElement.removeEventListener('keydown', this.__adjacentKeyHandler);
            }

            if (this.__adjacentHoverHandler) {
                this.options.adjacentElement.removeEventListener('mouseenter', this.__adjacentHoverHandler);
            }
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
            if(this.hasAttribute('ls-options-values')) {
                this.getAttribute('ls-options-values').split(',').forEach((value) => {
                    let selected = false;
                    value = value.trim();
                    if(value.startsWith("[") && value.endsWith("]")) {
                        value = value.substring(1, value.length - 1).trim();
                        selected = true && !selectedOption;
                    }

                    const option = {
                        value,
                        text: value,
                        selected
                    }

                    this.menu.add(option);

                    if (selected) {
                        selectedOption = option;
                    }
                });
            }

            for (const optionElement of this.querySelectorAll('ls-option, option, optgroup')) {
                const isSelected = (optionElement.selected || optionElement.getAttribute("selected") !== null) && !selectedOption;

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

                if (isSelected) {
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