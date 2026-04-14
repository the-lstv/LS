/**
 * Component for managing complex multipane layouts.
 * Originally developed for my Video Editor, but it's so useful I made it into a standalone component.
 * @author Lukas
 */

LS.LoadComponent(class Multipane extends LS.Component {
    static PRESETS = {
        /**
         * |   | | |
         * |   |---|
         * |   |   |
         */
        'default': {
            title: "Default",
            direction: 'row',
            inner: [
                {
                    inner: {
                        direction: 'column',
                        inner: [
                            { type: 'slot', view: 'EditorView', resize: { height: "70%" } },
                            { type: 'slot', view: 'TerminalView' }
                        ]
                    }
                },
                {
                    inner: {
                        direction: 'column',
                        inner: [{ direction: "row", inner: [{ type: 'slot', view: 'OutputView' }, { type: 'slot', view: 'ASTView' }] }, { type: 'slot', view: 'LogsView' }]
                    }
                }
            ]
        },

        /**
        * |       |
        * |-------|
        * |       |
        */
        'editor-focused': {
            title: "Editor Focused",
            direction: 'column',
            inner: [
                { type: 'slot', view: 'EditorView', resize: { height: "70%" } },
                {
                    direction: 'row',
                    inner: [
                        { type: 'slot', view: 'TerminalView', resize: { width: "50%" } },
                        { type: 'slot', view: 'LogsView' }
                    ]
                }
            ]
        },

        /**
        * |   |   |
        * |   |   |
        * |   |   |
        */
        'output-focused': {
            title: "Output Focused",
            direction: 'row',
            inner: [
                { type: 'slot', view: 'EditorView', resize: { width: "40%" } },
                {
                    direction: 'column',
                    inner: [
                        { type: 'slot', view: 'ASTView', resize: { height: "60%" } },
                        { type: 'slot', view: 'LogsView' }
                    ]
                }
            ]
        },

        /**
        * |       |
        * |-------|
        * |       |
        * |-------|
        * |       |
        */
        'vertical-compiler': {
            title: "Vertical",
            direction: 'column',
            inner: [
                { type: 'slot', view: 'EditorView', resize: { height: "50%" } },
                { type: 'slot', view: 'TerminalView', resize: { height: "25%" } },
                { type: 'slot', view: 'LogsView' }
            ]
        },

        /**
        * |     |  |
        * |-----|--|
        * |     |  |
        */
        'ast-sidebar': {
            title: "AST Sidebar",
            direction: 'row',
            inner: [
                {
                    direction: 'column',
                    inner: [
                        { type: 'slot', view: 'EditorView', resize: { height: "60%" } },
                        { type: 'slot', view: 'LogsView' }
                    ]
                },
                { type: 'slot', view: 'ASTView', resize: { width: 300 } }
            ]
        },

        /**
        * | |   | |
        * | |   | |
        * | |   | |
        */
        'three-column-compiler': {
            title: "Three Columns",
            direction: 'row',
            inner: [
                { type: 'slot', view: 'EditorView', resize: { width: "35%" } },
                { type: 'slot', view: 'LogsView', resize: { width: "35%" } },
                { type: 'slot', view: 'ASTView' }
            ]
        },

        /**
        * |   |   |
        * |-------|
        * |   |   |
        * |-------|
        * |   |   |
        */
        'four-panel': {
            title: "Four Panel",
            direction: 'column',
            inner: [
                { inner: [{ type: 'slot', view: 'EditorView', resize: { width: "50%" } }, { type: 'slot', view: 'TerminalView' }], resize: { height: "50%" } },
                { inner: [{ type: 'slot', view: 'ASTView', resize: { width: "50%" } }, { type: 'slot', view: 'LogsView' }], resize: { height: "50%" } }
            ]
        },

        /**
        * |       |
        * |       |
        * |       |
        */
        'editor-only': {
            title: "Editor only",
            direction: 'column',
            inner: [
                { type: 'slot', view: 'EditorView' }
            ]
        },

        /**
        * |       |
        * |       |
        * |       |
        */
        'terminal-only': {
            title: "Terminal only",
            direction: 'column',
            inner: [
                { type: 'slot', view: 'TerminalView' }
            ]
        },
    };

    /**
     * Main Layout Manager
     * 
     * LS.Multipane manages a schema and a set of slots.
     * Views can specify an array of slot names where they want to be placed, in order.
     * 
     * The schema defines the layout structure, which can be virtually any combination with an unlimited amount of slots.
     */    
    constructor(container, options = {}) {
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
                return { type: 'slot', view: value.expectedView, ...value.options? { options: value.options }: {}, ...value.resize? { resize: value.resize }: {} };
            }
            return value;
        }

        return JSON.parse(JSON.stringify(schema, replacer));
    }

    add(...views) {
        for (const view of views) {
            if (!(view instanceof View)) {
                console.error("LS.Multipane.add: view must be an instance of View");
                return;
            }

            this.views.add(view);
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
        if(typeof schema === "string") {
            schema = this.constructor.PRESETS[schema];
        }

        if(!schema || (typeof schema !== "object")) {
            if(this.__schemaLoaded) {
                console.error("LS.Multipane.setSchema: valid schema is required");
                return false;
            }

            console.warn("LS.Multipane.setSchema: invalid schema provided, using default");
            schema = this.constructor.PRESETS['default'];
        }

        // Make a deep copy of the schema and set it as the current working schema
        schema = this.constructor.cloneSchema(schema);
        this.schema = schema;

        for(const child of this.container.children) {
            child.remove();
        }

        for(const slot of this.slots) {
            if(slot.container) {
                LS.Resize.remove(slot.container); // Removes any resize handlers
                if(slot.destroy) slot.destroy();
            }
        }

        for(const item of this.destroyables) {
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
        for (const key in this.constructor.PRESETS) {
            layouts.push({
                name: key,
                title: this.constructor.PRESETS[key].title || key,
                schema: this.constructor.cloneSchema(this.constructor.PRESETS[key])
            });
        }
        return layouts;
    }

    _processSchema(schema) {
        if (schema instanceof Slot || (schema.type && schema.type === 'slot')) {
            if (!(schema instanceof Slot)) {
                schema = new Slot(schema.options || schema);
            }

            this.slots.add(schema);
            return schema.container;
        }

        if (schema.type === 'tabs') {
            const container = LS.Create("layout-item", { class: "editor-tabs" });
            const tabs = new LS.Tabs(container, {
                list: true,
                styled: false
            });

            if(schema.tabs) {
                let i = 0;
                for(const tabData of schema.tabs) {
                    let title = tabData.title || `Tab ${i + 1}`;
                    let contentNode;

                    if (Array.isArray(tabData)) {
                        contentNode = this._processSchema({ inner: tabData, direction: schema.direction || 'row' });
                    } else {
                        contentNode = this._processSchema(tabData);
                    }
                    
                    tabs.add(title, contentNode);
                    i++;
                }
                tabs.set(0);
            }

            this.destroyables.add(tabs);
            return container;
        }

        const direction = schema.direction || "row";
        const container = LS.Create({ tag: "layout-item", class: 'layout-' + direction, ...schema.tilt? { style: `transform:rotate(${schema.tilt}deg)` }: {} });

        if(Array.isArray(schema.inner)) {
            let i = 0;
            for (const item of schema.inner) {
                const child = this._processSchema(item);
                container.appendChild(child);

                if(i !== schema.inner.length - 1) {
                    LS.Resize.set(child, {
                        sides: direction === 'column'? ['bottom']: ['right'],

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

                    if(!item.resize) child.style[direction === 'column'? 'height': 'width'] = (100 / schema.inner.length) + '%';
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

        return asString? JSON.stringify(exported): exported;
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

    destroy() {

    }


    /**
     * View class
     * Base class for all views
     */
    static View = class View extends LS.EventEmitter {
        constructor({ container, name, title } = {}) { 
            super();

            this.container = container;
            this.container.classList.add('editor-view');
            this.__name = name || null;
            this.title = title || null;

            this.currentSlot = null;
        }

        get isVisible() {
            return (this.container && this.container.isConnected && this.currentSlot && this.container.parentElement === this.currentSlot.container);
        }

        // Subclasses should override with their own destruction logic, but DON'T forget to call super.destroy()
        destroy() {
            this.emit('destroy');
            this.container.remove();
            this.events.clear();
            this.__destroyed = true;
            if(this.currentSlot) {
                this.currentSlot.set(null);
            }
        }
    }


    /**
     * Slot class
     * Represents a slot in the layout where views can be placed
     */
    static Slot = class Slot {
        constructor(options = {}) {
            this.options = options;
            this.expectedView = options.view || null;
            this.currentView = null;

            this.__emptyMessage = LS.Create({ class: 'editor-view layout-slot-empty', inner: [{ tag: "i", class: "bi-info-circle" }, `This slot is empty.`] });

            this.container = LS.Create({
                tag: "layout-item",
                class: 'layout-slot',
                inner: [
                    this.__header = N({ class: "layout-slot-header", inner: [
                        [
                            { tag: "svg", attributes: {
                                xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 256 256",
                                width: "16", height: "16",
                                fill: "currentColor"
                            }, innerHTML: `<path d="M108,60A16,16,0,1,1,92,44,16,16,0,0,1,108,60Zm56,16a16,16,0,1,0-16-16A16,16,0,0,0,164,76ZM92,112a16,16,0,1,0,16,16A16,16,0,0,0,92,112Zm72,0a16,16,0,1,0,16,16A16,16,0,0,0,164,112ZM92,180a16,16,0,1,0,16,16A16,16,0,0,0,92,180Zm72,0a16,16,0,1,0,16,16A16,16,0,0,0,164,180Z"></path>` }, this.__titleElement = LS.Create({ tag: "span", inner: "Empty slot" })
                        ],
                        [
                            { tag: "button", class: "square clear small layout-slot-close-button", inner: { tag: "i", class: "bi-x-lg" }, onclick: () => {
                                this.set(null);
                            } }
                        ]
                    ]}),
                    this.__emptyMessage
                ]
            });

            this.container._slotInstance = this;

            if(options.minSize) {
                this.container.style.minWidth = options.minSize.width + 'px';
                this.container.style.minHeight = options.minSize.height + 'px';
            }

            if(options.maxSize) {
                this.container.style.maxWidth = options.maxSize.width + 'px';
                this.container.style.maxHeight = options.maxSize.height + 'px';
            }

            if(options.width) {
                this.container.style.width = options.width + (typeof options.width === "number"? 'px': '');
            }

            if(options.height) {
                this.container.style.height = options.height + (typeof options.height === "number"? 'px': '');
            }
        }

        set(view) {
            const oldView = this.currentView;
            
            for(const child of this.container.children) {
                if(child === this.__header || child.classList.contains('ls-resize-handle')) continue;
                child.remove();
            }

            if(oldView) {
                oldView.currentSlot = null;
            }

            this.currentView = view;

            if(!view || view.__destroyed) {
                this.container.appendChild(this.__emptyMessage);
                this.__titleElement.innerText = "Empty slot";
                if(view && view.__destroyed) {
                    console.warn(`Slot.set: cannot set destroyed view ${view.constructor.name} to slot ${this.name}`);
                    view.currentSlot = null;
                    return;
                }
                return;
            }

            this.__titleElement.innerText = view.title || view.__name || view.constructor.name;
            view.currentSlot = this;

            this.container.appendChild(view.container);
        }

        swapWith(otherSlot) {
            const myView = this.currentView;
            const otherView = otherSlot.currentView;
            
            otherSlot.set(myView);
            this.set(otherView);
        }

        destroy() {
            this.container.removeEventListener('mouseenter', this.__mouseEnter);
            this.container.removeEventListener('mouseleave', this.__mouseLeave);
            this.container.remove();
            this.container = null;
            this.options = null;
            this.__emptyMessage = null;
            this.__header = null;
            this.__titleElement = null;
            this.__destroyed = true;
        }
    }
}, { name: "Multipane", id: "ls-multipane-layout", global: true });