/**
 * Component for managing complex multipane layouts.
 * Originally developed for my Video Editor, but it's quite useful I made it into a standalone component.
 * @author Lukas
 */

(() => {
    /**
     * Slot class
     * Represents a slot in the layout where views can be placed
     */
    class Slot {
        constructor(options = {}) {
            this.options = options;
            this.expectedView = options.view || null;
            this.currentView = null;

            this.__emptyMessage = LS.Create({ class: 'editor-view layout-slot-empty', inner: [{ tag: "i", class: "bi-info-circle" }, `This slot is empty.`] });

            this.container = LS.Create({
                tag: "layout-item",
                class: 'layout-slot',
                inner: [
                    this.__header = LS.Create({
                        class: "layout-slot-header", inner: [
                            [
                                {
                                    tag: "svg", attributes: {
                                        xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 256 256",
                                        width: "16", height: "16",
                                        fill: "currentColor"
                                    }, innerHTML: `<path d="M108,60A16,16,0,1,1,92,44,16,16,0,0,1,108,60Zm56,16a16,16,0,1,0-16-16A16,16,0,0,0,164,76ZM92,112a16,16,0,1,0,16,16A16,16,0,0,0,92,112Zm72,0a16,16,0,1,0,16,16A16,16,0,0,0,164,112ZM92,180a16,16,0,1,0,16,16A16,16,0,0,0,92,180Zm72,0a16,16,0,1,0,16,16A16,16,0,0,0,164,180Z"></path>`
                                }, this.__titleElement = LS.Create({ tag: "span", inner: "Empty slot" })
                            ],
                            [
                                {
                                    tag: "button", class: "square clear small layout-slot-close-button", inner: { tag: "i", class: "bi-x-lg" }, onclick: () => {
                                        this.set(null);
                                    }
                                }
                            ]
                        ]
                    }),
                    this.__emptyMessage
                ]
            });

            this.container._slotInstance = this;

            if (options.minSize) {
                this.container.style.minWidth = options.minSize.width + 'px';
                this.container.style.minHeight = options.minSize.height + 'px';
            }

            if (options.maxSize) {
                this.container.style.maxWidth = options.maxSize.width + 'px';
                this.container.style.maxHeight = options.maxSize.height + 'px';
            }

            if (options.width) {
                this.container.style.width = options.width + (typeof options.width === "number" ? 'px' : '');
            }

            if (options.height) {
                this.container.style.height = options.height + (typeof options.height === "number" ? 'px' : '');
            }
        }

        set(view) {
            const oldView = this.currentView;

            for (const child of this.container.children) {
                if (child === this.__header || child.classList.contains('ls-resize-handle')) continue;
                child.remove();
            }

            if (oldView) {
                oldView.currentSlot = null;
                oldView.off?.('destroy', this.__onViewDestroyed);
                this.__onViewDestroyed = null;
            }

            this.currentView = view;

            if (!view || view.destroyed) {
                this.container.appendChild(this.__emptyMessage);
                this.__titleElement.innerText = "Empty slot";
                if (view && view.destroyed) {
                    console.warn(`Slot.set: cannot set destroyed view ${view.constructor.name} to slot ${this.name}`);
                    view.currentSlot = null;
                    return;
                }
                return;
            }

            this.__titleElement.innerText = view.title || view.__name || view.constructor.name;
            view.currentSlot = this;

            view.on?.('destroy', this.__onViewDestroyed = () => {
                if (this.currentView === view) {
                    this.set(null);
                }
            });

            this.container.appendChild(view.container);
        }

        swapWith(otherSlot) {
            const myView = this.currentView;
            const otherView = otherSlot.currentView;

            otherSlot.set(myView);
            this.set(otherView);
        }

        destroy() {
            this.set(null);

            if (this.container) {
                this.container.removeEventListener('mouseenter', this.__mouseEnter);
                this.container.removeEventListener('mouseleave', this.__mouseLeave);
                this.container.remove();
                this.container = null;
            }

            this.options = null;
            this.__emptyMessage = null;
            this.__header = null;
            this.__titleElement = null;
            this.destroyed = true;
        }
    }

    LS.LoadComponent(class Multipane extends LS.Component {
        static PRESETS = {
            default: {
                /**
                * |       |
                * |       |
                * |       |
                */
                default: {
                    id: "default",
                    title: "Default",
                    direction: 'column',
                    inner: [
                        { type: 'slot' }
                    ]
                },

                /**
                 * |   | | |
                 * |   |---|
                 * |   |   |
                 */
                basic: {
                    id: "basic",
                    title: "Basic",
                    direction: 'row',
                    inner: [
                        {
                            inner: {
                                direction: 'column',
                                inner: [
                                    { type: 'slot', resize: { height: "70%" } },
                                    { type: 'slot' }
                                ]
                            }
                        },
                        {
                            inner: {
                                direction: 'column',
                                inner: [{ direction: "row", inner: [{ type: 'slot' }, { type: 'slot' }] }, { type: 'slot' }]
                            }
                        }
                    ]
                },

                /**
                * |   |   |
                * |-------|
                * |   |   |
                * |-------|
                * |   |   |
                */
                "four-panel": {
                    id: "four-panel",
                    title: "Four Panel",
                    direction: 'column',
                    inner: [
                        { inner: [{ type: 'slot', resize: { width: "50%" } }, { type: 'slot' }], resize: { height: "50%" } },
                        { inner: [{ type: 'slot', resize: { width: "50%" } }, { type: 'slot' }], resize: { height: "50%" } }
                    ]
                },
            }
        };

        static View = LS.View;
        static Slot = Slot;

        static registerPresets(group, presets) {
            if (!presets || typeof group === "object") {
                presets = group;
            } else {
                presets = { [group]: presets };
            }

            if (!presets || typeof presets !== "object" || Array.isArray(presets)) {
                return;
            }

            for (const [group, groupPresets] of Object.entries(presets)) {
                if (!groupPresets || typeof groupPresets !== "object" || Array.isArray(groupPresets)) {
                    continue;
                }

                if (!this.PRESETS[group]) {
                    this.PRESETS[group] = {};
                }

                for (const [id, preset] of Object.entries(groupPresets)) {
                    this.PRESETS[group][id] = { id, group, ...preset };
                }
            }
        }

        static getPreset(id) {
            if (typeof id !== "string" || !id) {
                return null;
            }

            const [group, presetId] = id.split(':');
            if (presetId) {
                return this.PRESETS[group]?.[presetId] || null;
            }

            if (this.PRESETS.default?.[group]) {
                return this.PRESETS.default[group];
            }

            for (const groupPresets of Object.values(this.PRESETS)) {
                if (groupPresets[group]) {
                    return groupPresets[group];
                }
            }

            return null;
        }

        /**
         * Main Layout Manager
         * 
         * LS.Multipane manages a schema and a set of slots.
         * Views can specify an array of slot names where they want to be placed, in order.
         * 
         * The schema defines the layout structure, which can be virtually any combination with an unlimited amount of slots.
         */
        constructor(container, options = {}) {
            super({
                dependencies: ["Resize", "Tabs"]
            });

            this.container = container || document.body;
            this.options = options;

            this.views = new Set();
            this.slots = new Set();
            this.destroyables = new Set();

            this.__schemaLoaded = false;
            this.setSchema(options.layout || 'default');
        }

        static cloneSchema(schema) {
            function replacer(key, value) {
                if (value instanceof Slot) {
                    return { type: 'slot', view: value.expectedView, ...value.options ? { options: value.options } : {}, ...value.resize ? { resize: value.resize } : {} };
                }
                return value;
            }

            return JSON.parse(JSON.stringify(schema, replacer));
        }

        add(...views) {
            for (const view of views) {
                if (!(view instanceof LS.View)) {
                    console.error("LS.Multipane.add: view must be an instance of LS.View");
                    return;
                }

                this.views.add(view);
                view.on?.('destroy', () => {
                    this.views.delete(view);
                    if (view.currentSlot) {
                        view.currentSlot.set(null);
                    }
                });
            }

            this.render();
        }

        render() {
            for (const slot of this.slots) {
                if (!slot.expectedView) continue;

                // Find the view
                let foundView = null;
                for (const view of this.views) {
                    const viewName = view.__name || view.constructor.name;
                    if (viewName === slot.expectedView) {
                        foundView = view;
                        break;
                    }
                }

                if (foundView) {
                    slot.set(foundView);
                }
            }
        }

        setSchema(schema) {
            if (typeof schema === "string") {
                schema = LS.Multipane.getPreset(schema);
            }

            if (!schema || (typeof schema !== "object")) {
                if (this.__schemaLoaded) {
                    console.error("LS.Multipane.setSchema: valid schema is required");
                    return false;
                }

                console.warn("LS.Multipane.setSchema: invalid schema provided, using default");
                schema = LS.Multipane.getPreset('default');
            }

            // Make a deep copy of the schema and set it as the current working schema
            schema = this.constructor.cloneSchema(schema);
            this.schema = schema;

            for (const child of this.container.children) {
                child.remove();
            }

            for (const slot of this.slots) {
                if (slot.container) {
                    if(LS.Resize) {
                        LS.Resize.remove(slot.container); // Removes any resize handlers
                    }
                    if (slot.destroy) slot.destroy();
                }
            }

            for (const item of this.destroyables) {
                item.destroy();
            }
            this.destroyables.clear();

            this.slots.clear();
            this.container.appendChild(this._processSchema(this.schema));

            this.__schemaLoaded = true;
            this.render();
            return true;
        }

        getAvailableLayouts() {
            const layouts = [];
            for (const [group, groupPresets] of Object.entries(this.constructor.PRESETS)) {
                for (const [id, preset] of Object.entries(groupPresets)) {
                    layouts.push({
                        name: group === "default" ? id : `${group}:${id}`,
                        group,
                        id,
                        title: preset.title || id,
                        schema: this.constructor.cloneSchema(preset)
                    });
                }
            }
            return layouts;
        }

        /**
         * Recursively processes the schema and creates the layout structure.
         * Warning: Mutates the schema in place live.
         * @param {*} schema The schema to process
         * @returns {HTMLElement} The root element of the processed schema
         */
        _processSchema(schema) {
            if (schema instanceof Slot || (schema.type && schema.type === 'slot')) {
                if (!(schema instanceof Slot)) {
                    schema = new Slot(schema.options || schema);
                }

                this.slots.add(schema);
                return schema.container;
            }

            if (schema.type === 'tabs') {
                if(!LS.Tabs) {
                    throw new Error("LS.Multipane: LS.Tabs component is required for tabs layout");
                }

                const container = LS.Create("layout-item", { class: "editor-tabs" });
                const tabs = new LS.Tabs(container, {
                    list: true,
                    styled: false,

                    reorderableList: true,
                    onReorder: (id, newOrder) => {
                        schema.order = tabs.order;
                    },

                    ...schema.tabOptions || {}
                });

                if (schema.order) tabs.order = schema.order; else schema.order = tabs.order;

                if (schema.tabs) {
                    let i = 0;
                    for (const tabData of schema.tabs) {
                        if(!tabData.id) {
                            tabData.id = `tab-${i}`;
                        }

                        // TODO: automatic title
                        let title = tabData.title || tabData.id;

                        let contentNode;

                        if (Array.isArray(tabData)) {
                            contentNode = this._processSchema({ inner: tabData, direction: schema.direction || 'row' });
                        } else {
                            contentNode = this._processSchema(tabData);
                        }

                        tabs.add(tabData.id, contentNode);
                        i++;
                    }
                    tabs.set(0);
                }

                this.destroyables.add(tabs);
                return container;
            }

            const direction = schema.direction || "row";
            const container = LS.Create({ tag: "layout-item", class: 'layout-' + direction, ...schema.tilt ? { style: `transform:rotate(${schema.tilt}deg)` } : {} });

            if (Array.isArray(schema.inner)) {
                let i = 0;
                for (const item of schema.inner) {
                    const child = this._processSchema(item);
                    container.appendChild(child);

                    if (i !== schema.inner.length - 1) {
                        LS.Resize && LS.Resize.set(child, {
                            sides: direction === 'column' ? ['bottom'] : ['right'],
                            siblibngs: true, // TODO

                            // Snapping
                            snapCollapse: true,
                            snapExpand: true,
                            snapVertical: direction === 'column',
                            snapHorizontal: direction === 'row',

                            // Storage
                            store: true,
                            storeStringify: false,
                            storage: {
                                getItem: (key) => {
                                    return item.resize || null;
                                },
                                setItem: (key, value) => {
                                    item.resize = value;
                                }
                            }
                        });

                        if (!item.resize) child.style[direction === 'column' ? 'height' : 'width'] = (100 / schema.inner.length) + '%';
                    }

                    i++;
                }
            } else if (schema.inner) {
                container.appendChild(this._processSchema(schema.inner));
            }

            return container;
        }

        exportLayout(asString = false) {
            const exported = {
                schema: this.constructor.cloneSchema(this.schema)
            }

            return asString ? JSON.stringify(exported) : exported;
        }

        importLayout(data) {
            if (typeof data === "string") {
                data = JSON.parse(data);
            }

            if (!data.schema) {
                console.error("LS.Multipane.importLayout: invalid layout data");
                return;
            }

            this.setSchema(data.schema);
            this.render();
        }

        // TODO:
        destroy() {
            if (this.destroyed) return;

            for (const slot of this.slots) {
                if (slot.container) {
                    if (LS.Resize) {
                        LS.Resize.remove(slot.container); // Removes any resize handlers
                    }
                    if (slot.destroy) slot.destroy();
                }
            }

            for (const item of this.destroyables) {
                item.destroy();
            }

            this.slots.clear();
            this.destroyables.clear();
            this.views.clear();

            this.container = null;
            super.destroy();
        }
    }, { name: "Multipane", id: "ls-multipane-layout", global: true });
})();