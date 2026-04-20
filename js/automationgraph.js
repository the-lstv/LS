/**
 * Automation graph component for LS.
 * Migrated from v3.
 * 
 * @author lstv.space
 * @license GPL-3.0
 */


LS.LoadComponent(class AutomationGraph extends LS.Component {
    static POINT_TYPES = {
        LINEAR: "linear",
        HALF_SINE: "half_sine",
        EXPONENTIAL: "exponential",
        STAIRS: "stairs",
        HOLD: "hold",
        PULSE: "pulse",
        SINE: "sine",
        BEZIER: "bezier"
    };

    static contextMenuItems = [
        { type: "radio", group: "curve_type", text: "Linear", value: "linear", checked: true },
        { type: "radio", group: "curve_type", text: "Exponential", value: "exponential" },
        { type: "radio", group: "curve_type", text: "Hold", value: "hold" },
        { type: "radio", group: "curve_type", text: "Stairs", value: "stairs" },
        { type: "radio", group: "curve_type", text: "Sine Wave", value: "sine" },
        { type: "radio", group: "curve_type", text: "Half Sine Wave", value: "half_sine" },
        { type: "radio", group: "curve_type", text: "Pulse Wave", value: "pulse" },
        { type: "radio", group: "curve_type", text: "Bezier Curve", value: "bezier" },
        { type: "separator" },
        { text: "Type In Value", action: "type_in_value" },
        { text: "Reset Value", action: "reset_value" },
        { type: "separator" },
        { text: "Delete Point", action: "delete_point" },
    ];

    static contextMenu = null;
    static gradientIndex = 0;

    /**
     * Constructor
     * @param {*} options
     * @property {boolean} render - If false, the component will not render (data model only)
     * @property {Element} element - Parent element where to append the svg element
     */
    constructor(options = {}) {
        super();
        this.name = "AutomationGraph";

        if(options instanceof Element) options = { element: options };

        this.options = LS.Util.defaults({
            element: null,
            render: true, // If false, the component will not create an element (data model only)
            minTime: 0,
            maxTime: 460,
            minValue: 0,
            maxValue: 1,
            width: 460,
            height: 100,
            value: 0, // Initial value
            rightClickToCreate: true,
            snapToColumns: 0,
            allowAltUnsnap: false,
            bounds: true,
            stretch: false
        }, options);

        const minTime = Number.isFinite(this.options.minTime) ? this.options.minTime : 0;
        const maxTime = Number.isFinite(this.options.maxTime) ? this.options.maxTime : minTime + 1;
        this.options.minTime = Math.min(minTime, maxTime);
        this.options.maxTime = Math.max(minTime, maxTime);
        if (this.options.maxTime === this.options.minTime) {
            this.options.maxTime = this.options.minTime + 1;
        }

        const minValue = Number.isFinite(this.options.minValue) ? this.options.minValue : 0;
        const maxValue = Number.isFinite(this.options.maxValue) ? this.options.maxValue : minValue + 1;
        this.options.minValue = Math.min(minValue, maxValue);
        this.options.maxValue = Math.max(minValue, maxValue);
        if (this.options.maxValue === this.options.minValue) {
            this.options.maxValue = this.options.minValue + 1;
        }

        if (!Number.isFinite(this.options.width) || this.options.width <= 0) {
            this.options.width = this.options.maxTime - this.options.minTime;
        }

        if (!Number.isFinite(this.options.height) || this.options.height <= 0) {
            this.options.height = 100;
        }

        if (!Number.isFinite(this.options.value)) {
            this.options.value = this.options.minValue;
        }
        this.options.value = Math.max(this.options.minValue, Math.min(this.options.maxValue, this.options.value));

        if (!Number.isFinite(this.options.snapToColumns) || this.options.snapToColumns < 0) {
            this.options.snapToColumns = 0;
        }

        this.options.allowAltUnsnap = this.options.allowAltUnsnap !== false;
        if (this.options.bounds !== "expand") {
            this.options.bounds = this.options.bounds !== false;
        }

        this.options.stretch = this.options.stretch === true;

        this.gradientId = `ls-automation-gradient-${++this.constructor.gradientIndex}`;

        this.scale = 1;
        this.frameScheduler = new LS.Util.FrameScheduler(() => this.#render());

        this.items = [];
        this.startPoint = { time: this.options.minTime, value: this.options.value, type: 'start' };

        this.__needsSort = false;
        this._dragState = null;
        this.handle = null;
        this.focusedItem = null;
        this.element = null;

        if(this.options.render && this.options.element) {
            this.setElement(this.options.element);
        }

        if(this.options.items) {
            this.reset(this.options.items);
        }

        if(!this.contextMenu && LS.Menu) {
            this.contextMenu = new LS.Menu({
                items: this.constructor.contextMenuItems
            });

            this.contextMenu.on('select', (item) => {
                const focused = this.focusedItem;
                if (!focused) return;

                switch(item.action) {
                    case 'delete_point':
                        if (focused !== this.startPoint) {
                            this.remove(focused);
                            this.focusedItem = null;
                        }
                        break;

                    case 'type_in_value': {
                        const value = prompt("Enter new value:", focused.value);
                        if (value !== null) {
                            const num = parseFloat(value);
                            if (!isNaN(num)) {
                                focused.value = Math.max(this.options.minValue, Math.min(this.options.maxValue, num));
                                this.frameScheduler.schedule();
                            }
                        }

                        break;
                    }

                    case 'reset_value':
                        focused.value = this.options.value;
                        this.frameScheduler.schedule();
                        break;
                }
            });

            this.contextMenu.on('check', (item) => {
                const focused = this.focusedItem;
                if (!focused || focused === this.startPoint) return;

                focused.type = item.value;
                this.frameScheduler.schedule();
            });
        }
    }

    setElement(target) {
        if(target === this.options.element && this.element) return;

        if (!target) {
            if(!this.options.render) return;
            this.options.render = false;
            this.options.element = null;
            if (this.element) {
                this.element.remove();
                this.element = null;
            }
            if (this.handle) {
                this.handle.destroy();
                this.handle = null;
            }
            return;
        }

        this.options.render = true;
        this.options.element = target;

        if (!this.element) {
            this.#createDOM();
        }

        if (this.element.parentNode !== target) {
            target.appendChild(this.element);
        }
        
        this.updateSize();
        this.frameScheduler.schedule();
    }

    #createDOM() {
        this.element = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.element.classList.add("ls-automation-graph");
        this.element.setAttribute("tabindex", "0");
        this.element.style.outline = "none";

        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        const gradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
        gradient.setAttribute("id", this.gradientId);
        gradient.setAttribute("x1", "0%");
        gradient.setAttribute("y1", "0%");
        gradient.setAttribute("x2", "0%");
        gradient.setAttribute("y2", "100%");

        const stops = [
            { offset: "0%", style: "stop-color:var(--accent);stop-opacity:12%" },
            { offset: "100%", style: "stop-color:var(--accent);stop-opacity:4%" }
        ];

        for (const stopData of stops) {
            const stop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
            stop.setAttribute("offset", stopData.offset);
            stop.setAttribute("style", stopData.style);
            gradient.appendChild(stop);
        }

        defs.appendChild(gradient);
        this.element.appendChild(defs);

        // Create groups for layering
        this.pathGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        this.element.appendChild(this.pathGroup);

        this.handleGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        this.element.appendChild(this.handleGroup);

        // Create single path elements
        this.strokePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        this.strokePath.setAttribute("fill", "none");
        this.strokePath.setAttribute("stroke", "var(--accent)");
        this.strokePath.setAttribute("stroke-width", "2");
        this.pathGroup.appendChild(this.strokePath);

        this.fillPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        this.fillPath.setAttribute("fill", `url(#${this.gradientId})`);
        this.fillPath.setAttribute("stroke", "none");
        this.pathGroup.appendChild(this.fillPath);

        this.handle = new LS.Util.TouchHandle(this.element, {
            cursor: this.options.cursor || 'none',
            buttons: [0],

            onStart: (event) => {
                const item = event.domEvent.target.__automationItem;
                const type = event.domEvent.target.__automationHandleType;
                
                this.handle.options.pointerLock = type === 'center';

                if(!item) {
                    this.focusedItem = null;
                    this.frameScheduler.schedule();
                    return event.cancel();
                }

                this.focusedItem = item;
                this._dragState = {
                    item,
                    type,
                    startX: event.x,
                    startY: event.y,
                    startCurvature: item.curvature || 0,
                    startTime: item.time,
                    startValue: item.value
                };

                event.domEvent.stopPropagation();
                event.domEvent.preventDefault();
                this.frameScheduler.schedule();
            },

            onMove: (event) => this.#onMouseMove(event),
            onEnd: () => this._dragState = null
        });

        // Right click to create
        this.element.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.target.__automationItem) {
                this.focusedItem = e.target.__automationItem;
                if (this.contextMenu) {
                    for (const menuItem of this.contextMenu.items) {
                        if (menuItem.type === "radio" && menuItem.group === "curve_type") {
                            menuItem.checked = menuItem.value === this.focusedItem.type;
                        }
                    }

                    this.contextMenu.render();
                    this.contextMenu.open(e.clientX, e.clientY);
                }
                this.frameScheduler.schedule();
            } else if (this.options.rightClickToCreate) {
                const rect = this.element.getBoundingClientRect();
                const relX = e.clientX - rect.left;
                const relY = e.clientY - rect.top;
                let time = this.x2t(relX);
                const snapStep = this.options.snapToColumns;
                const shouldSnap = snapStep > 0 && !(this.options.allowAltUnsnap && e.altKey);

                if (shouldSnap) {
                    time = Math.round(time / snapStep) * snapStep;
                }

                if (this.options.bounds === true) {
                    time = Math.max(this.options.minTime, Math.min(this.options.maxTime, time));
                }
                
                let value;
                if (e.shiftKey || (window.M && window.M.ShiftDown)) {
                    value = this.getValueAtTime(time);
                } else {
                    value = this.y2v(relY);
                    if (this.options.bounds === true) {
                        value = Math.max(this.options.minValue, Math.min(this.options.maxValue, value));
                    }
                }

                const newItem = this.add({ time, value, type: this.constructor.POINT_TYPES.LINEAR });
                this.focusedItem = newItem;
            }
        });

        // Keyboard events
        this.element.addEventListener('keydown', (e) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && this.focusedItem && this.focusedItem !== this.startPoint) {
                this.remove(this.focusedItem);
                this.focusedItem = null;
            }
        });
    }

    updateSize(width, height) {
        if (Number.isFinite(width) && width > 0) {
            this.options.width = width;
        }

        if (Number.isFinite(height) && height > 0) {
            this.options.height = height;
        }

        if (this.element) {
            this.element.setAttribute("width", this.options.width);
            this.element.setAttribute("height", this.options.height);
        }
        this.frameScheduler.schedule();
    }

    updateScale(scale) {
        if (!Number.isFinite(scale) || scale <= 0 || scale === this.scale) return;
        this.scale = scale;
        this.frameScheduler.schedule();
    }

    updateSnapToColumns(columns = 0) {
        const snap = Number(columns);
        this.options.snapToColumns = Number.isFinite(snap) && snap > 0 ? snap : 0;
    }

    updateBounds(bounds = true) {
        this.options.bounds = bounds === "expand" ? "expand" : bounds !== false;
    }

    updateStretch(stretch = false) {
        this.options.stretch = stretch === true;
        this.frameScheduler.schedule();
    }

    resize(delta) {
        const currentDuration = this.options.maxTime - this.options.minTime;
        this.resizeToPX(currentDuration + delta);
    }

    resizeToPX(width) {
        const currentDuration = this.options.maxTime - this.options.minTime;
        if (!Number.isFinite(width) || currentDuration <= 0 || width <= 0) return;

        const ratio = width / currentDuration;
        
        for(let item of this.items) {
            item.time = this.options.minTime + (item.time - this.options.minTime) * ratio;
        }

        this.options.maxTime = this.options.minTime + width;
        this.frameScheduler.schedule();
    }

    /**
     * Point data structure
     * @param {*} item
     * @property {number} time - Where the point starts
     * @property {number} value - Target value of the point
     * @property {string} type - Shape of the point (linear, exponential, hold, etc)
     * @property {number} curvature - (For curved points) Curvature amount / Frequency
     * @property {Object} outHandle - (For bezier curves) Handle out position
     * @property {number} outHandle.dx - X position of the out handle
     * @property {number} outHandle.dy - Y position of the out handle
     * @property {Object} inHandle - (For bezier curves) Handle in position
     * @property {number} inHandle.dx - X position of the in handle
     * @property {number} inHandle.dy - Y position of the in handle
     */
    add(item, scheduleRender = true) {
        if (!this.#normalizeItem(item)) return null;

        this.items.push(item);
        this.__needsSort = true;
        if (scheduleRender) {
            this.frameScheduler.schedule();
        }

        return item;
    }

    remove(item, scheduleRender = true) {
        const index = this.items.indexOf(item);
        if(index !== -1) {
            this.items.splice(index, 1);
            // Cleanup DOM
            if (item._pathNode) { item._pathNode.remove(); item._pathNode = null; }
            if (item._handleNode) { item._handleNode.remove(); item._handleNode = null; }
            if (item._centerHandleNode) { item._centerHandleNode.remove(); item._centerHandleNode = null; }

            if (this.focusedItem === item) {
                this.focusedItem = null;
            }
        }

        if (scheduleRender) {
            this.frameScheduler.schedule();
        }
    }

    // time to x
    t2x(t) {
        if (this.options.stretch) {
            const range = this.options.maxTime - this.options.minTime;
            const width = Number.isFinite(this.options.width) && this.options.width > 0 ? this.options.width : 1;
            if (range > 0) {
                return ((t - this.options.minTime) / range) * width;
            }
        }

        const scale = this.scale > 0 ? this.scale : 1;
        return (t - this.options.minTime) * scale;
    }

    // value to y
    v2y(v) {
        const height = this.options.height;
        const range = this.options.maxValue - this.options.minValue;

        if (range <= 0) {
            return height / 2;
        }

        return height - ((v - this.options.minValue) / range) * height;
    }

    // x to time
    x2t(x) {
        if (this.options.stretch) {
            const range = this.options.maxTime - this.options.minTime;
            const width = Number.isFinite(this.options.width) && this.options.width > 0 ? this.options.width : 1;
            if (range > 0 && width > 0) {
                return this.options.minTime + (x / width) * range;
            }
        }

        const scale = this.scale > 0 ? this.scale : 1;
        return (x / scale) + this.options.minTime;
    }

    // y to value
    y2v(y) {
        const height = this.options.height;
        const range = this.options.maxValue - this.options.minValue;

        if (height <= 0 || range <= 0) {
            return this.options.minValue;
        }

        return this.options.minValue + ((height - y) / height) * range;
    }

    #normalizeItem(item) {
        if (!item || typeof item !== "object") return false;

        const clampBounds = this.options.bounds === true;

        if (!Number.isFinite(item.time)) {
            item.time = this.options.minTime;
        }
        if (clampBounds) {
            item.time = Math.max(this.options.minTime, Math.min(this.options.maxTime, item.time));
        }

        if (!Number.isFinite(item.value)) {
            item.value = this.options.value;
        }
        if (clampBounds) {
            item.value = Math.max(this.options.minValue, Math.min(this.options.maxValue, item.value));
        }

        if (!Number.isFinite(item.curvature)) {
            item.curvature = 0;
        }

        switch(item.type) {
            case this.constructor.POINT_TYPES.LINEAR:
            case this.constructor.POINT_TYPES.HALF_SINE:
            case this.constructor.POINT_TYPES.EXPONENTIAL:
            case this.constructor.POINT_TYPES.STAIRS:
            case this.constructor.POINT_TYPES.HOLD:
            case this.constructor.POINT_TYPES.PULSE:
            case this.constructor.POINT_TYPES.SINE:
            case this.constructor.POINT_TYPES.BEZIER:
                break;
            default:
                item.type = this.constructor.POINT_TYPES.LINEAR;
        }

        if (item.inHandle && typeof item.inHandle === "object") {
            item.inHandle = {
                dx: Number.isFinite(item.inHandle.dx) ? item.inHandle.dx : 0,
                dy: Number.isFinite(item.inHandle.dy) ? item.inHandle.dy : 0
            };
        } else {
            item.inHandle = null;
        }

        if (item.outHandle && typeof item.outHandle === "object") {
            item.outHandle = {
                dx: Number.isFinite(item.outHandle.dx) ? item.outHandle.dx : 0,
                dy: Number.isFinite(item.outHandle.dy) ? item.outHandle.dy : 0
            };
        } else {
            item.outHandle = null;
        }

        return true;
    }

    #createPointHandle(item) {
        const handle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        handle.classList.add("ls-automation-point-handle");
        handle.setAttribute("r", "6");
        handle.setAttribute("fill", "var(--accent)");
        handle.setAttribute("fill-opacity", "0.8");
        handle.setAttribute("stroke", "var(--accent)");
        handle.style.cursor = item === this.startPoint ? "ns-resize" : "move";
        handle.__automationItem = item;
        handle.__automationHandleType = 'point';
        return handle;
    }

    #createCenterHandle(item) {
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");

        const hitArea = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        hitArea.setAttribute("r", "10");
        hitArea.setAttribute("fill", "transparent");
        hitArea.style.cursor = "ns-resize";
        hitArea.__automationItem = item;
        hitArea.__automationHandleType = 'center';

        const handle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        handle.classList.add("ls-automation-center-handle");
        handle.setAttribute("r", "4");
        handle.setAttribute("fill", "none");
        handle.setAttribute("stroke-width", "1");
        handle.setAttribute("stroke", "var(--accent)");
        handle.style.pointerEvents = "none";

        group.style.cursor = "ns-resize";
        group.__automationItem = item;
        group.__automationHandleType = 'center';
        group._visualNode = handle;

        group.appendChild(hitArea);
        group.appendChild(handle);

        group.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            e.preventDefault();
            item.curvature = 0;
            this.frameScheduler.schedule();
        });

        return group;
    }

    #render() {
        if(this.__needsSort) this.sortItems();
        if(!this.options.render || !this.element) return;

        let d = "";
        let fillD = "";
        
        // Start path with startPoint
        const startX = this.t2x(this.startPoint.time);
        const startY = this.v2y(this.startPoint.value);
        d = `M ${startX} ${startY}`;
        fillD = `M ${startX} ${this.options.height} L ${startX} ${startY}`;

        // Render Start Point Handle
        if (!this.startPoint._handleNode) {
            this.startPoint._handleNode = this.#createPointHandle(this.startPoint);
            this.handleGroup.appendChild(this.startPoint._handleNode);
        } else if (this.startPoint._handleNode.parentNode !== this.handleGroup) {
            this.handleGroup.appendChild(this.startPoint._handleNode);
        }
        this.startPoint._handleNode.setAttribute("cx", startX);
        this.startPoint._handleNode.setAttribute("cy", startY);
        
        // Focus style for start point
        if (this.focusedItem === this.startPoint) {
            this.startPoint._handleNode.setAttribute("stroke-width", "2");
            this.startPoint._handleNode.setAttribute("fill", "#eee");
            this.startPoint._handleNode.setAttribute("r", "5");
        } else {
            this.startPoint._handleNode.setAttribute("stroke-width", "1");
            this.startPoint._handleNode.setAttribute("fill", "#fff");
            this.startPoint._handleNode.setAttribute("r", "4");
        }

        // Iterate items
        for(let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            const prev = i > 0 ? this.items[i-1] : this.startPoint;

            const x = this.t2x(item.time);
            const y = this.v2y(item.value);

            // 1. Render Handle (Point)
            if (!item._handleNode) {
                item._handleNode = this.#createPointHandle(item);
                this.handleGroup.appendChild(item._handleNode);
            } else if (item._handleNode.parentNode !== this.handleGroup) {
                this.handleGroup.appendChild(item._handleNode);
            }

            item._handleNode.setAttribute("cx", x);
            item._handleNode.setAttribute("cy", y);

            // Focus style
            if (this.focusedItem === item) {
                item._handleNode.setAttribute("stroke-width", "2");
                item._handleNode.setAttribute("fill", "var(--accent-60)");
                item._handleNode.setAttribute("r", "8");
            } else {
                item._handleNode.setAttribute("stroke-width", "1");
                item._handleNode.setAttribute("fill", "var(--accent)");
                item._handleNode.setAttribute("r", "6");
            }

            // 2. Render Path Segment & Center Handle
            const prevX = this.t2x(prev.time);
            const prevY = this.v2y(prev.value);
            
            const pathData = this._calculatePath(prevX, prevY, x, y, item);
            d += " " + pathData.d;
            fillD += " " + pathData.d;

            // Center Handle
            if (item.type !== this.constructor.POINT_TYPES.HOLD) {
                if (!item._centerHandleNode) {
                    item._centerHandleNode = this.#createCenterHandle(item);
                    this.handleGroup.appendChild(item._centerHandleNode);
                } else if (item._centerHandleNode.parentNode !== this.handleGroup) {
                    this.handleGroup.appendChild(item._centerHandleNode);
                }

                item._centerHandleNode.setAttribute("transform", `translate(${pathData.center.x} ${pathData.center.y})`);
            } else {
                if (item._centerHandleNode) {
                    item._centerHandleNode.remove();
                    item._centerHandleNode = null;
                }
            }
        }

        // Close fill path
        if (this.items.length > 0) {
            const lastItem = this.items[this.items.length - 1];
            const lastX = this.t2x(lastItem.time);
            fillD += ` L ${lastX} ${this.options.height} Z`;
        } else {
            // If no items, fill to end
            const endX = this.t2x(this.options.maxTime);
            fillD += ` L ${endX} ${this.options.height} Z`;
            d += ` H ${endX}`;
        }

        this.strokePath.setAttribute("d", d);
        this.fillPath.setAttribute("d", fillD);
    }

    _calculatePath(x0, y0, x1, y1, item) {
        let d = "";
        let center = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };

        switch(item.type) {
            case this.constructor.POINT_TYPES.LINEAR:
            case this.constructor.POINT_TYPES.EXPONENTIAL: {
                const curv = Number.isFinite(item.curvature) ? item.curvature : 0;
                if (Math.abs(curv) < 0.001) {
                    d = `L ${x1} ${y1}`;
                    center = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
                } else {
                    const midX = (x0 + x1) / 2;
                    const midY = (y0 + y1) / 2;
                    const cpX = midX;
                    let cpY = midY + curv * (this.options.height / 2);

                    // Clamp to avoid hills
                    // TODO: FL-like behavior
                    const minY = Math.min(y0, y1);
                    const maxY = Math.max(y0, y1);
                    cpY = Math.max(minY, Math.min(maxY, cpY));

                    d = `Q ${cpX} ${cpY} ${x1} ${y1}`;
                    center = {
                        x: 0.25 * x0 + 0.5 * cpX + 0.25 * x1,
                        y: 0.25 * y0 + 0.5 * cpY + 0.25 * y1
                    };
                }
                break;
            }

            case this.constructor.POINT_TYPES.HOLD:
                d = `H ${x1} V ${y1}`;
                center = { x: (x0 + x1) / 2, y: y0 };
                break;

            case this.constructor.POINT_TYPES.STAIRS: {
                const steps = Math.max(1, Math.floor(Math.abs(item.curvature || 0) * 20) + 1);
                const dx = (x1 - x0) / steps;
                const dy = (y1 - y0) / steps;
                d = "";
                for(let i = 0; i < steps; i++) {
                    d += `H ${x0 + (i + 1) * dx} V ${y0 + (i + 1) * dy}`;
                }
                center = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
                break;
            }

            case this.constructor.POINT_TYPES.HALF_SINE: {
                const points = 50;
                d = "";
                for(let i = 1; i <= points; i++) {
                    const t = i / points;
                    const xx = x0 + t * (x1 - x0);
                    const yy = y0 + ((1 - Math.cos(Math.PI * t)) * 0.5) * (y1 - y0);
                    d += ` L ${xx} ${yy}`;
                }
                center = { x: (x0 + x1) / 2, y: y0 + (0.5 * (y1 - y0)) };
                break;
            }

            case this.constructor.POINT_TYPES.SINE: {
                const freq = Math.max(0.5, Math.abs(item.curvature || 0) * 10);
                const omega = freq * Math.PI * 2;
                const amp = (y1 - y0) / 2;
                const points = 50;
                d = "";
                for(let i = 1; i <= points; i++) {
                    const t = i / points;
                    const xx = x0 + t * (x1 - x0);
                    const wave = Math.sin(t * omega) - (t * Math.sin(omega));
                    const yy = y0 + (t * (y1 - y0)) + (amp * wave);
                    d += ` L ${xx} ${yy}`;
                }

                const centerT = 0.5;
                const centerWave = Math.sin(centerT * omega) - (centerT * Math.sin(omega));
                center = {
                    x: (x0 + x1) / 2,
                    y: y0 + (centerT * (y1 - y0)) + (amp * centerWave)
                };
                break;
            }

            case this.constructor.POINT_TYPES.PULSE: {
                const pFreq = Math.max(1, Math.abs(item.curvature || 0) * 10);
                const pAmp = Math.abs(y1 - y0) / 2;
                d = "";
                for(let i = 1; i <= 50; i++) {
                    const t = i / 50;
                    const xx = x0 + t * (x1 - x0);
                    const phase = (t * pFreq) % 1;
                    const pulse = phase < 0.5 ? 1 : -1;
                    const envelope = Math.sin(Math.PI * t);
                    const yy = y0 + (t * (y1 - y0)) + (pulse * pAmp * envelope);
                    d += ` L ${xx} ${yy}`;
                }
                center = { x: (x0 + x1) / 2, y: y0 + (0.5 * (y1 - y0)) };
                break;
            }

            case this.constructor.POINT_TYPES.BEZIER: {
                const cp1x = x0 + (item.outHandle ? item.outHandle.dx : (x1-x0)/3);
                const cp1y = y0 + (item.outHandle ? item.outHandle.dy : 0);
                const cp2x = x1 + (item.inHandle ? item.inHandle.dx : -(x1-x0)/3);
                const cp2y = y1 + (item.inHandle ? item.inHandle.dy : 0);

                d = `C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${x1} ${y1}`;

                center = {
                    x: 0.125 * x0 + 0.375 * cp1x + 0.375 * cp2x + 0.125 * x1,
                    y: 0.125 * y0 + 0.375 * cp1y + 0.375 * cp2y + 0.125 * y1
                };
                break;
            }

            default:
                d = `L ${x1} ${y1}`;
        }

        return { d, center };
    }

    getCenterLocation(item) {
        const index = this.items.indexOf(item);
        if (index < 0) return null;

        const prev = index === 0 ? this.startPoint : this.items[index-1];

        const x0 = this.t2x(prev.time);
        const y0 = this.v2y(prev.value);
        const x1 = this.t2x(item.time);
        const y1 = this.v2y(item.value);

        return this._calculatePath(x0, y0, x1, y1, item).center;
    }

    #onMouseMove(event) {
        if (!this._dragState || !event) return;

        const x = event.x;
        const y = event.y;
        const { item, type } = this._dragState;

        if (type === 'point') {
            const rect = this.element.getBoundingClientRect();
            const relX = x - rect.left;
            const relY = y - rect.top;
            const shiftDown = !!(event.domEvent && event.domEvent.shiftKey) || (window.M && window.M.ShiftDown);
            const altDown = !!(event.domEvent && event.domEvent.altKey);
            const snapStep = this.options.snapToColumns;
            const shouldSnap = snapStep > 0 && !(this.options.allowAltUnsnap && altDown);

            let proposedTime = this.x2t(relX);
            let proposedValue = this.y2v(relY);

            if (shouldSnap) {
                const pointerTime = this.x2t(relX);
                const deltaFromStart = pointerTime - this._dragState.startTime;
                proposedTime = this._dragState.startTime + (Math.round(deltaFromStart / snapStep) * snapStep);
            }

            const minOverflow = Math.max(0, this.options.minTime - proposedTime);
            const maxOverflow = Math.max(0, proposedTime - this.options.maxTime);
            const lowOverflow = Math.max(0, this.options.minValue - proposedValue);
            const highOverflow = Math.max(0, proposedValue - this.options.maxValue);

            if (this.options.bounds === "expand" && (minOverflow > 0 || maxOverflow > 0 || lowOverflow > 0 || highOverflow > 0)) {
                this.emit("expand", [{
                    minTime: minOverflow,
                    maxTime: maxOverflow,
                    minValue: lowOverflow,
                    maxValue: highOverflow,
                    item,
                    sourceEvent: event.domEvent
                }]);
            }
            
            if (item === this.startPoint) {
                // Start point only moves vertically
                if (this.options.bounds === true) {
                    item.value = Math.max(this.options.minValue, Math.min(this.options.maxValue, proposedValue));
                } else {
                    item.value = proposedValue;
                }
            } else {
                // Constrain time to neighbors
                const index = this.items.indexOf(item);
                let minT = this.options.bounds === true ? this.options.minTime : -Infinity;
                let maxT = this.options.bounds === true ? this.options.maxTime : Infinity;

                if (index > 0) minT = this.items[index - 1].time;
                if (index < this.items.length - 1) maxT = this.items[index + 1].time;

                item.time = Math.max(minT, Math.min(maxT, proposedTime));
                
                // Check for shift key to lock value
                if (shiftDown) {
                    item.value = this._dragState.startValue;
                } else {
                    if (this.options.bounds === true) {
                        item.value = Math.max(this.options.minValue, Math.min(this.options.maxValue, proposedValue));
                    } else {
                        item.value = proposedValue;
                    }
                }
            }
            
            this.frameScheduler.schedule();
        } else if (type === 'center') {
            const index = this.items.indexOf(item);
            if (index < 0) return;
            
            const prev = index === 0 ? this.startPoint : this.items[index-1];
            
            const x0 = this.t2x(prev.time);
            const y0 = this.v2y(prev.value);
            const x1 = this.t2x(item.time);
            const y1 = this.v2y(item.value);
            
            const rect = this.element.getBoundingClientRect();
            const mouseY = y - rect.top;
            
            const midY = (y0 + y1) / 2;
            
            const diffY = mouseY - midY;
            const divisor = Math.max(1, this.options.height * 0.25);
            item.curvature = diffY / divisor;
            
            this.frameScheduler.schedule();
        }
    }

    render() {
        this.frameScheduler.schedule();
    }

    binarySearch(time) {
        let low = 0;
        let high = this.items.length - 1;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const midTime = this.items[mid].time;

            if (midTime <= time) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        return low - 1;
    }

    getValueAtTime(time) {
        if (this.__needsSort) this.sortItems();

        if (!Number.isFinite(time) || this.items.length === 0) return this.startPoint.value;

        // Check bounds
        if (time <= this.startPoint.time) return this.startPoint.value;
        if (time >= this.items[this.items.length - 1].time) return this.items[this.items.length - 1].value;

        let index = this.binarySearch(time);
        
        let prevItem, nextItem;
        
        if (index === -1) {
            prevItem = this.startPoint;
            nextItem = this.items[0];
        } else {
            prevItem = this.items[index];
            nextItem = this.items[index + 1];
        }
        
        if (!nextItem) return prevItem.value;

        const t0 = prevItem.time;
        const t1 = nextItem.time;
        const v0 = prevItem.value;
        const v1 = nextItem.value;

        if (t1 === t0) return v1;

        const ratio = Math.max(0, Math.min(1, (time - t0) / (t1 - t0)));

        switch (nextItem.type) {
            case this.constructor.POINT_TYPES.HOLD:
                return v0;

            case this.constructor.POINT_TYPES.STAIRS: {
                const steps = Math.max(1, Math.floor(Math.abs(nextItem.curvature || 0) * 20) + 1);
                const stepIndex = Math.min(steps, Math.floor(ratio * steps));
                const vStep = (v1 - v0) / steps;
                return v0 + stepIndex * vStep;
            }

            case this.constructor.POINT_TYPES.LINEAR:
            case this.constructor.POINT_TYPES.EXPONENTIAL: {
                const curv = Number.isFinite(nextItem.curvature) ? nextItem.curvature : 0;
                if(Math.abs(curv) < 0.000001) {
                    // Linear
                    return v0 + (v1 - v0) * ratio;
                }

                const midY = (v0 + v1) / 2;
                const range = this.options.maxValue - this.options.minValue;
                let cpVal = midY - curv * (range / 2);

                // Clamp to avoid hills
                const minV = Math.min(v0, v1);
                const maxV = Math.max(v0, v1);
                cpVal = Math.max(minV, Math.min(maxV, cpVal));

                const t = ratio;
                return (1-t)*(1-t)*v0 + 2*(1-t)*t*cpVal + t*t*v1;
            }

            case this.constructor.POINT_TYPES.HALF_SINE:
                return v0 + ((1 - Math.cos(Math.PI * ratio)) * 0.5) * (v1 - v0);

            case this.constructor.POINT_TYPES.SINE: {
                const freq = Math.max(0.5, Math.abs(nextItem.curvature || 0) * 10);
                const omega = freq * Math.PI * 2;
                const amp = (v1 - v0) / 2;
                const wave = Math.sin(ratio * omega) - (ratio * Math.sin(omega));
                return v0 + (ratio * (v1 - v0)) + (amp * wave);
            }

            case this.constructor.POINT_TYPES.PULSE: {
                 const pFreq = Math.max(1, Math.abs(nextItem.curvature || 0) * 10);
                 const pAmp = (v1 - v0) / 2;
                 const pMidV = (v0 + v1) / 2;
                 const phase = (ratio * pFreq) % 1;
                 const pOffset = (phase < 0.5 ? 1 : -1) * pAmp;
                 return pMidV + pOffset;
            }

            case this.constructor.POINT_TYPES.BEZIER:
                 // Fallback to linear for now as Bezier math is complex without solving cubic equation for t
                 return v0 + (v1 - v0) * ratio;

            default:
                return v0 + (v1 - v0) * ratio;
        }
    }

    sortItems() {
        this.items = this.items.filter(item => this.#normalizeItem(item));
        this.items.sort((a, b) => a.time - b.time);

        if (this.options.bounds !== true) {
            this.__needsSort = false;
            return;
        }

        let previousTime = this.options.minTime;
        for (const item of this.items) {
            if (item.time < previousTime) {
                item.time = previousTime;
            }

            previousTime = item.time;
        }

        this.__needsSort = false;
    }

    reset(replacingItems = null) {
        const nextItems = Array.isArray(replacingItems) ? replacingItems.slice() : [];

        for (let i = this.items.length - 1; i >= 0; i--) {
            this.remove(this.items[i], false);
        }

        this.items = [];
        for (const item of nextItems) {
            this.add(item, false);
        }

        if (this.focusedItem !== this.startPoint && this.focusedItem && !this.items.includes(this.focusedItem)) {
            this.focusedItem = null;
        }

        if (this.items.length > 1) {
            this.sortItems();
        } else {
            this.__needsSort = false;
        }

        this.frameScheduler.schedule();
    }

    export() {
        return {
            startPoint: this.cloneItem(this.startPoint),
            items: this.items.map(item => this.cloneItem(item))
        };
    }

    cloneItem(item) {
        return {
            time: Number.isFinite(item.time) ? item.time : 0,
            value: Number.isFinite(item.value) ? item.value : 0,
            type: item.type,
            curvature: Number.isFinite(item.curvature) ? item.curvature : 0,
            inHandle: item.inHandle ? { dx: item.inHandle.dx, dy: item.inHandle.dy } : null,
            outHandle: item.outHandle ? { dx: item.outHandle.dx, dy: item.outHandle.dy } : null
        };
    }

    destroy() {
        for (let i = this.items.length - 1; i >= 0; i--) {
            this.remove(this.items[i], false);
        }

        this.frameScheduler.destroy();
        if(this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }

        this.element = null;

        if(this.handle) {
            this.handle.destroy();
            this.handle = null;
        }

        if (this.startPoint && this.startPoint._handleNode) {
            this.startPoint._handleNode.remove();
            this.startPoint._handleNode = null;
        }

        this.startPoint = null;
        this._dragState = null;
        this.focusedItem = null;

        if(this.contextMenu) {
            this.contextMenu.destroy();
            this.contextMenu = null;
        }

        this.items.length = 0;
    }
}, { name: "AutomationGraph", global: true });