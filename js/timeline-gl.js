/**
 * A (work in progress) WebGL version of the timeline component, originally using DOM.
 * It handles drag and drop, resizing, slicing, markers, touch controls, etc.
 * Features highly intuitive keyboard controls.
 * 
 * Based on the original DOM version (timeline.js), rewritten from scratch for WebGL.
 * WebGPU is not yet supported though may be in the future if it is deemed worthwhile
 * 
 * @author lstv.space
 * @license GPL-3.0
 * 
 * Using for AI assistance or training is strictly prohibited.
 * No AI was used to write this code.
 */

(() => {
    // For now there's a limit since all of those are pre-instanced and take that much memory
    const MAX_RENDER_ITEMS = 1500000;
    const DEFAULT_TILE_COLOR = [104, 104, 104];

    function num(value, fallback = 0) {
        value = Number(value);
        return Number.isFinite(value) ? value : fallback;
    }

    const colorConversion = new LS.Color();
    function colorToAccent(color, tone = 40) {
        colorConversion.set(color);
        const hsl = colorConversion.getHSL();
        const h = hsl[0];
        const s = hsl[1];
        colorConversion.setHSL(h, s, tone);
        return colorConversion.color; // Copy
    }

    const LS_ACCENTS_MAP = new Map([
        ["navy",          colorToAccent([40, 28, 108])],
        ["blue",          colorToAccent([0, 133, 255])],
        ["pastel-indigo", colorToAccent([70, 118, 181])],
        ["lapis",         colorToAccent([34, 114, 154])],
        ["teal",          colorToAccent([0, 128, 128])],
        ["pastel-teal",   colorToAccent([69, 195, 205])],
        ["aquamarine",    colorToAccent([58, 160, 125])],
        ["green",         colorToAccent([25, 135, 84])],
        ["lime",          colorToAccent([133, 210, 50])],
        ["neon",          colorToAccent([173, 255, 110])],
        ["yellow",        colorToAccent([255, 236, 32])],
        ["orange",        colorToAccent([255, 140, 32])],
        ["deep-orange",   colorToAccent([255, 112, 52])],
        ["red",           colorToAccent([245, 47, 47])],
        ["rusty-red",     colorToAccent([220, 53, 69])],
        ["pink",          colorToAccent([230, 52, 164])],
        ["hotpink",       colorToAccent([245, 100, 169])],
        ["purple",        colorToAccent([155, 77, 175])],
        ["soap",          colorToAccent([210, 190, 235])],
        ["burple",        colorToAccent([81, 101, 246])],
        ["white",         colorToAccent([255, 255, 255])]
    ]);

    LS.LoadComponent(class TimelineGL extends LS.Component {
        /**
         * 
         * Timeline item data structure
         * @typedef {Object} TimelineItem
         * @property {number} start - Start time of the item
         * @property {number} duration - Duration of the item
         * @property {number} [row=0] - Row index where the item is placed
         * @property {string} [label=""] - Display label for the item
         * @property {string|null} [tileColor=null] - Tile accent color for the item
         * @property {*} [data=null] - Custom data associated with the item
         */

        /**
         * Timeline component options configuration
         * @typedef {Object} TimelineGLOptions
         * @property {HTMLElement|null} options.element - The DOM element to attach the timeline to
         * @property {number} options.zoom - Initial zoom level (pixels per time unit)
         * @property {number} options.offset - Initial horizontal scroll offset in pixels
         * @property {number|"auto"} options.minZoom - Minimum allowed zoom level. "auto" fits content to viewport width
         * @property {number} options.maxZoom - Maximum allowed zoom level
         * @property {number} options.markerSpacing - Minimum spacing between time markers in pixels
         * @property {"time"|"number"|Function} options.markerMetric - Format for time markers. "time" shows HH:MM:SS, "number" shows raw values, or custom function(time, step)
         * @property {boolean} options.allowAutomationClips - Allow creation of automation clips
         * @property {boolean} options.autoCreateAutomationClips - Automatically create automation clips when adding automation points
         * @property {number} options.itemHeaderHeight - Height of the item header in pixels
         * @property {object} options.grid - Grid dimensions {w, h}
         * @property {boolean} options.snapEnabled - Enable snapping functionality
         * @property {boolean} options.gridSnapping - Enable snapping to a grid
         * @property {number} options.gridSnapDivision - Division of the grid for snapping (e.g., 1/40 for 40 divisions)
         * @property {boolean} options.remapAutomationTargets - Remap automation targets when items are moved or duplicated
         * @property {number} options.framerateLimit - Limit the rendering framerate for performance optimization
         * @property {string} options.tool - Initial tool selected ("select", "slice", "preview", "erase", "group")
         * @property {Object} options.toolShortcuts - Keyboard shortcuts for tools
         * @property {string} options.toolShortcuts.select - Shortcut for select tool
         * @property {string} options.toolShortcuts.slice - Shortcut for slice tool
         * @property {string} options.toolShortcuts.preview - Shortcut for preview tool
         * @property {string} options.toolShortcuts.erase - Shortcut for erase tool
         * @property {string} options.toolShortcuts.group - Shortcut for group tool
         * @property {string} options.fontName - Name of the font to use for text rendering
         * @property {Object} options.rendererOptions - Additional options for the WebGL renderer
         * @property {Object} options.textEngineOptions - Additional options for the WebGL text engine
         * @property {boolean} options.addRenderables - Whether to add renderables to the renderer automatically
         * @property {LS.GL.WebGLRenderer|null} options.renderer - Custom WebGL renderer instance
         * @property {LS.GL.WebGLTextEngine|null} options.textEngine - Custom WebGL text engine instance
         * @property {Object} options.rect - Rectangle defining the rendering area {x, y, width, height}, defaults to renderer dimensions
         * @property {Function} options.cloneFilter - Optional function to filter properties when cloning items
         * @property {string} options.backgroundFragment - Custom fragment shader for the background
         * @property {string} options.itemFragment - Custom fragment shader for timeline items
         * @property {string} options.selectionFragment - Custom fragment shader for the selection rectangle
         */

        static DEFAULTS = LS.Util.staticDefaults({
            element: null,
            zoom: 200,
            offset: 0,
            minZoom: 0.4,
            maxZoom: 1400,
            markerSpacing: 100,
            markerMetric: "time",
            allowAutomationClips: false,
            autoCreateAutomationClips: false,
            itemHeaderHeight: 20,
            grid: { w: 10, h: 45 },
            gridSnapping: true,
            gridSnapDivision: 1 / 40,
            remapAutomationTargets: true,
            framerateLimit: 90,
            tool: "select",
            fontName: "UbuntuMono",
            toolShortcuts: {
                select: "v",
                slice: "c",
                preview: "p",
                erase: "e",
                group: "g"
            },
            cloneFilter: null
        });

        // --- Player state values (does influence content) ---
        #seek = 0;
        #duration = 0;

        // --- Camera state values (do not influence content) ---
        #scrollX = 0;
        #scrollY = 0;
        #zoomX = 1;
        #zoomY = 1;

        // --- UI state ---
        #tool = "draw";

        /**
         * Timeline component options configuration
         * @param {TimelineGLOptions} options - Configuration options for the timeline
         */
        constructor(options = {}) {
            super({
                dependencies: ["GL", "GL.TextEngine", "Menu"]
            });

            this.options = this.constructor.DEFAULTS(options);

            // --- State variables
            this.selectionRect = [false, 0, 0, 0, 0];
            this.grid = this.options.grid || { w: 64, h: 45 };
            this.timeSignature = { x: 4, y: 4 }; // Default time signature (4/4) TEMP
            this.maxRows = this.options.maxRows || -1;

            this.sidebarWidth = this.options.sidebarWidth || 84;
            this.labelBarHeight = this.options.labelBarHeight || 32;

            this.resizeMargin = this.options.resizeMargin || 6;

            const testItems = 100;
            this.items = [...Array(testItems)].map((_, i) => ({ start: i / 0.5, duration: 100, row: i % 30, label: `Item ${i}`, tileColor: (new LS.Color("red").lerp("blue", i / (testItems))), data: {} }));
            this.itemMap = new Map();

            this.selectedItems = [];

            this.previousItem = { start: null, duration: null, row: null };

            this.clipboard = [];
            
            // Undo/Redo action events (history management is external)
            this.__actionEventRef = this.prepareEvent("action");

            this.container = this.options.element || document.createElement("div");
            this.container.classList.add("timeline-gl-container");

            this.__needsSort = true;
            this.__rerenderItems = true;
            this.__visibleItems = 0;

            // -- Renderer and text engine setup
            this.renderer = this.options.renderer || new LS.GL.WebGLRenderer({
                backgroundColor: "transparent",
                resizeTo: this.container,
                blockIfHidden: true,
                ...this.options.rendererOptions
            });

            this.container.appendChild(this.renderer.canvas);

            // -- Text engine for labels
            this.textEngine = this.options.textEngine || new LS.GL.WebGLTextEngine({
                renderer: this.renderer,
                fontName: this.options.fontName,
                mtsdf: true, // TODO: the engine should extract this from the font file automatically

                // The amount of characters that can be rendered at once
                bufferSize: 16384,
                ...this.options.textEngineOptions
            });

            this.textEngine.loadPromise.then(() => {
                this.__prevScrollX = null;
                this.__prevZoomX = null;

                this.#setupRenderables();
                this.#setupHandle();
                this.renderer.render();
            });

            // Misc
            this.__prevSelectedItemsLength = 0;
            this.__prevScrollX = null;
            this.__prevScrollY = null;
            this.__prevZoomX = null;
            this.__prevZoomY = null;

            if(!(this.renderer instanceof LS.GL.WebGLRenderer)) {
                console.warn("TimelineGL: Renderer is not an instance of LS.GL.WebGLRenderer.");
            }

            if(!(this.textEngine instanceof LS.GL.WebGLTextEngine)) {
                console.warn("TimelineGL: Text engine is not an instance of LS.GL.WebGLTextEngine.");
            }

            this.labels = this.textEngine.createText(16384 - 2048);
            this.numberLabelsX = this.textEngine.createText(1024);
            this.numberLabelsY = this.textEngine.createText(1024);

            const self = this;
            this.renderable = {
                rect: this.options.rect || {
                    x: 0,
                    y: 0,

                    get width() {
                        return self.renderer.width;
                    },

                    get height() {
                        return self.renderer.height;
                    }
                },

                renderables: [],
            }

            if (this.options.addRenderables !== false) {
                this.renderer.addRenderable(this.renderable);
            }

            // Set initial contrast based on the current theme
            this.contrast = LS.Color.theme === "dark" ? 1.0 : 0.6;
            this.addExternalEventListener(LS.Color, "theme-changed", (theme) => {
                this.contrast = theme === "dark" ? 1.0 : 0.6;
                this.renderer.render();
            });

            this.addExternalEventListener(LS.Color, "accent-changed", (theme) => {
                this.__rerenderItems = true;
                this.renderer.render();
            });

            window.timeline = this;

            // TODO:
            this.contextMenu = new LS.Menu({
                items: [
                    { text: "Paste Item(s)", icon: "bi-clipboard", action: () => {
                        if (!this.clipboard.length) return;
                        const pastedItems = [];
                        const idMap = new Map(); // Maps clipboard item IDs to new item IDs
                        for (const entry of this.clipboard) {
                            const newItem = this.cloneItem(entry.data);
                            newItem.start = this.seek + entry.offset;
                            newItem.row = entry.row;
                            idMap.set(entry.data.id, newItem.id);
                            pastedItems.push(newItem);
                            this.add(newItem);
                        }
                        // Remap automation targets if enabled
                        if (this.options.remapAutomationTargets) {
                            this.remapAutomationTargets(pastedItems, idMap);
                        }

                        this.renderer.render();
                    }, get hidden() { return self.clipboard.length === 0 } },
                    { type: "separator" },
                    { text: "Select All", icon: "bi-check2-all", action: () => this.selectAll() },
                    { text: "Deselect All", icon: "bi-x-lg", action: () => this.deselectAll() },
                ]
            });

            // this.addExternalEventListener(this.container, "contextmenu", (event) => {
            //     event.preventDefault();

            //     if (this.__suppressContextMenuUntil && performance.now() <= this.__suppressContextMenuUntil) {
            //         this.__suppressContextMenuUntil = 0;
            //         return;
            //     }

            //     const itemElement = event.target.closest(".ls-timeline-item");
            //     if(itemElement) {
            //         this.contextMenu.close();
            //         this.focusedItem = itemElement.__timelineItem;
            //         this.renderer.render();
            //         this.itemContextMenu.open(event.clientX, event.clientY);
            //     } else {
            //         this.itemContextMenu.close();
            //         this.contextMenu.open(event.clientX, event.clientY);
            //     }
            // });

            this.addExternalEventListener(this.container, "pointerdown", () => {
                this.container.focus();
            });
        }

        zoomFrom(mouseX = 0, mouseY = 0, delta = 0, zoomFactorX = 1.1, zoomFactorY = 1.1) {
            if (zoomFactorX && zoomFactorX !== 1.0) {
                const oldZoomX = this.#zoomX;
                let newZoomX = oldZoomX;
                if (delta < 0) {
                    newZoomX *= zoomFactorX;
                } else {
                    newZoomX /= zoomFactorX;
                }

                this.zoomX = newZoomX;
                this.scrollX = this.#scrollX; // Ensure scrollX is clamped
                if (this.#zoomX === newZoomX) this.scrollX = (mouseX + this.scrollX) * (newZoomX / oldZoomX) - mouseX;
            }

            if (zoomFactorY && zoomFactorY !== 1.0) {
                const oldZoomY = this.#zoomY;
                let newZoomY = oldZoomY;
                if (delta < 0) {
                    newZoomY *= zoomFactorY;
                } else {
                    newZoomY /= zoomFactorY;
                }

                this.zoomY = newZoomY;
                this.scrollY = this.#scrollY; // Ensure scrollY is clamped
                if (this.#zoomY === newZoomY) this.scrollY = (mouseY + this.scrollY) * (newZoomY / oldZoomY) - mouseY;
            }
        }

        /**
         * Transforms screen coordinates to timeline coordinates, taking into account the current scroll and zoom levels.
         * @param {number} x - The x-coordinate in screen space
         * @param {number} y - The y-coordinate in screen space
         * @param {boolean} [viewport=true] - Whether to consider the viewport offset or the bounds (default: true)
         */
        transformCoords(x, y, viewport = true) {
            if (viewport) {
                const rect = this.renderer.canvas.getBoundingClientRect();
                x -= this.renderable.rect.x + rect.left + this.sidebarWidth;
                y -= this.renderable.rect.y + rect.top + this.labelBarHeight;
            }

            const time = (x + this.#scrollX) / this.#zoomX;
            const row = Math.floor((y + this.#scrollY) / (this.grid.h * this.#zoomY));

            return { time, row };
        }

        // --- Data management methods

        /**
         * Adds a new item to the timeline.
         * @param {TimelineItem} item - The item to add to the timeline
         */
        add(item) {
            if (this.destroyed) return;
            if(!item.id) item.id = LS.Misc.uid();
            this.itemMap.set(item.id, item);

            this.items.push(item);

            // if(item.start > this.#duration) {
            //     this.#duration = item.start + item.duration;
            //     this.quickEmit("duration-changed", this.#duration);
            // } else {
            //     this.__needsSort = true;
            // }
            this.__needsSort = true;

            this.renderer.render();
        }

        /**
         * Resets the timeline, optionally destroying existing items and replacing them with new ones.
         * @param {*} destroyItems - Whether to destroy existing items (default: true)
         * @param {*} replacingItems - Optional array of items to replace the existing items with (default: null)
         * @returns 
         */
        reset(destroyItems = true, replacingItems = null) {
            if (this.destroyed) return;
            return; // TODO

            const oldItems = Array.isArray(this.items) ? this.items.slice() : [];

            if (destroyItems) {
                for (const item of oldItems) {
                    this.destroyItem(item);
                }
            }

            this.selectedItems.length = 0;

            this.items = replacingItems || [];
            this.sortItems();

            this.renderer.render();
        }

        binarySearch(time) {
            const items = this.items;
            let low = 0;
            let high = items.length - 1;

            while (low <= high) {
                const mid = (low + high) >>> 1;
                if (items[mid].start < time) {
                    low = mid + 1;
                } else {
                    high = mid - 1;
                }
            }
            return low;
        }

        getItemById(id) {
            return this.itemMap.get(id);
        }

        sortItems() {
            console.log("Sorting items!");

            this.itemMap.clear();

            let totalDuration = 0;
            this.maxDuration = 0;

            this.__needsSort = false;

            if(this.items.length < 1) {
                if (0 !== this.#duration) {
                    this.#duration = 0;
                    this.quickEmit("duration-changed", this.#duration);
                }
                return;
            }

            if(this.items.length > 1) {
                this.items.sort((a, b) => (a.start || 0) - (b.start || 0));
            }

            for (let i = 0; i < this.items.length; i++) {
                const item = this.items[i];
                if (!item.id) {
                    item.id = LS.Misc.uid();
                }

                this.itemMap.set(item.id, item);

                item.start = Math.max(0, num(item.start));
                item.duration = Math.max(0, num(item.duration));
                item.row = Math.max(0, Math.floor(num(item.row)));

                if (!item.data) item.data = {};
                if (item.duration > this.maxDuration) this.maxDuration = item.duration;
                const end = item.start + item.duration;
                if (end > totalDuration) totalDuration = end;
            }

            if (totalDuration !== this.#duration) {
                this.#duration = totalDuration;
                this.quickEmit("duration-changed", this.#duration);
            }
        }

        /**
         * Gets all items that intersect with the given time.
         * @param {*} time - The time to check for intersecting items
         * @param {*} row - Optionally the row to check for
         * @returns {TimelineItem[]} An array of items that intersect with the given time
         */
        getIntersectingAt(time, row = null) {
            if (this.__needsSort) {
                this.sortItems();
            }

            const searchStart = time - this.maxDuration;
            let i = this.binarySearch(searchStart);

            const result = [];
            const items = this.items;
            const len = items.length;
            const ignoreRows = row === null;

            for (; i < len; i++) {
                const item = items[i];

                // Since items are sorted by start, if this item starts after 'time',
                // all subsequent items also start after 'time' and cannot intersect.
                if (item.start > time) {
                    break;
                }

                // We know item.start <= time (from loop condition/break).
                // Intersection occurs if item.end >= time.
                if ((item.start + item.duration) >= time && (ignoreRows || item.row === row)) {
                    result.push(item);
                }
            }

            return result;
        }

        /**
         * Gets all items that are within the given time range.
         * @param {*} start - The start time of the range
         * @param {*} end - The end time of the range
         * @param {*} containedOnly - Whether to only include items fully contained within the range
         * @returns {TimelineItem[]} An array of items within the given time range
         */
        getRange(start, end, containedOnly = false) {
            if (this.__needsSort) {
                this.sortItems();
            }

            const result = [];
            // If containedOnly is true, we only care about items starting >= start.
            // If false, we need to look back to catch long items starting before the range.
            const searchStart = containedOnly ? start : start - this.maxDuration;
            const startIndex = this.binarySearch(searchStart);

            for (let i = startIndex; i < this.items.length; i++) {
                const item = this.items[i];

                if (item.start > end) {
                    break;
                }

                const itemEnd = item.start + item.duration;

                if (containedOnly) {
                    if (itemEnd <= end) {
                        result.push(item);
                    }
                } else {
                    // We know item.start <= end.
                    // We just need to ensure the item ends after the range starts.
                    if (itemEnd >= start) {
                        result.push(item);
                    }
                }
            }

            return result;
        }

        /**
         * Cuts an item at a specific time or offset, creating a new item for the second part.
         * @param {TimelineItem|number} itemOrTime - The item to cut or the time at which to cut intersecting items
         * @param {number|string} offset - The time or percentage offset at which to cut the item
         * @returns {TimelineItem|TimelineItem[]|null} The new item created from the cut, an array of new items if cutting intersecting items, or null if no cut was made
        */
        cut(itemOrTime, offset) {
            // Cut all intersecting items at a specific time
            if (typeof itemOrTime === "number") {
                const time = itemOrTime;
                const intersecting = this.getIntersectingAt(time);
                const newItems = [];
                for (const item of intersecting) {
                    const newItem = this.cut(item, time);
                    if (newItem) newItems.push(newItem);
                }
                return newItems;
            }

            // Cut a specific item
            const item = itemOrTime;
            let splitTime;

            if (typeof offset === "string" && offset.endsWith("%")) {
                const percent = parseFloat(offset);
                splitTime = item.start + (item.duration * (percent / 100));
            } else {
                splitTime = offset;
            }

            // Validate split time
            // We use a small epsilon to avoid floating point issues at edges
            if (splitTime <= item.start + 0.0001 || splitTime >= item.start + item.duration - 0.0001) {
                return null;
            }

            // Clone item
            const newItem = this.cloneItem(item);
            const originalDuration = item.duration;
            
            // Update durations and start times
            const originalEndTime = item.start + item.duration;
            item.duration = normalizeSnappedTime(splitTime - item.start);
            
            newItem.start = normalizeSnappedTime(splitTime);
            newItem.duration = normalizeSnappedTime(originalEndTime - splitTime);

            this.add(newItem);
            
            // Emit action for external history management
            this.emitAction({
                type: "cut",
                originalId: item.id,
                originalDuration: originalDuration,
                afterDuration: item.duration,
                newItemId: newItem.id,
                newItemData: this.cloneItem(newItem)
            });
            
            return newItem;
        }

        // --- Selection methods

        select(item) {
            this.focusedItem = item;
            this.quickEmit("item-select", item);
            this.renderer.render();
        }

        deselectAll() {
            if (this.selectedItems.length > 0) {
                this.selectedItems.length = 0;
                this.renderer.render();
                this.quickEmit("item-deselect");
            }
        }

        selectAll() {
            this.selectedItems.length = 0;
            for (const item of this.items) this.selectedItems.push(item);
            this.renderer.render();
        }

        deleteSelected() {
            // Emit action for external history management
            this.emitAction({
                type: "delete",
                items: this.selectedItems.map(item => ({
                    id: item.id,
                    data: this.cloneItem(item)
                }))
            });

            for (const item of this.selectedItems) {
                this.destroyItem(item);
            }

            this.selectedItems.length = 0;
            this.renderer.render();
        }


        /**
         * Clones a timeline item, optionally keeping its ID and preparing it for export.
         * @param {TimelineItem} item - The timeline item to clone
         * @param {boolean} [keepId=false] - Whether to keep the original item's ID in the clone
         * @param {boolean} [exportMode=false] - Whether to prepare the clone for export (affects data cloning behavior)
         * @returns {TimelineItem} A new cloned timeline item
         */
        cloneItem(item, keepId = false, exportMode = false) {
            const id = keepId? item.id: LS.Misc.uid();

            return {
                start: item.start,
                duration: item.duration,
                id,
                row: item.row || 0,
                label: item.label || id,
                tileColor: item.tileColor || null,

                data: item.data && LS.Util.clone(item.data, (key, value) => {
                    if(this.options.cloneFilter) {
                        const filterResult = this.options.cloneFilter(key, value, item, exportMode);
                        if(filterResult !== undefined) {
                            return filterResult;
                        }
                    }

                    if(exportMode && typeof value.export === "function") {
                        return { newValue: value.export() };
                    }

                    // Only clone plain objects or primitives.
                    // In export mode, special objects simply get discarded unless they offer an export method.
                    return typeof value !== "object" || value.constructor === Object? true: exportMode? { cloneValue: false }: false;
                }, LS.Util.FILTER_MODE_MAP),

                type: item.type || null,
                ...(item.cover? { cover: item.cover }: null),
                ...(item.waveform? { waveform: item.waveform }: null)
            };
        }


        /**
         * Exports the current timeline items as a new array of cloned items in a serialized format.
         * @returns {TimelineItem[]} An array of cloned timeline items
         */
        export() {
            if(this.__needsSort) {
                this.sortItems();
            }

            return this.items.map(item => this.cloneItem(item, true, true));
        }

        // --- Misc utility methods

        formatMarker(time, step) {
            const metric = this.options.markerMetric;
            if(metric && metric !== "time") {
                if (metric === "number") return time.toString();
                if (typeof metric === "function") return metric(time, step);
            }

            const absTime = Math.abs(time);
            const d = Math.floor(absTime / 86400);
            const h = Math.floor((absTime % 86400) / 3600);
            const m = Math.floor((absTime % 3600) / 60);
            const s = Math.floor(absTime % 60);

            if (time < 60) return absTime.toFixed(1) + "s";
            if (d > 0) return `${d}d ${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            return `${m}:${s.toString().padStart(2, '0')}`;
        }

        render(updateItems = false) {
            if (updateItems) {
                this.__needsSort = true;
            }
            this.renderer.render();
        }

        // --- Undo / redo action management

        /**
         * Emit an action event for external history management.
         * External code should listen to the "action" event and store the action for undo/redo.
         * @param {Object} action - The action data to emit
         */
        emitAction(action) {
            action.source = this;
            this.quickEmit(this.__actionEventRef, action);
        }

        /**
         * Apply an undo operation with the given action state.
         * Called by external history manager with the action to undo.
         * @param {Object} action - The action state to undo
         * @returns {boolean} Whether the undo was applied successfully
         */
        applyUndo(action) {
            if (!action || !action.type) return false;
            
            switch (action.type) {
                case "move":
                    // Restore previous positions
                    for (const change of action.changes) {
                        const item = this.getItemById(change.id);
                        if (item) {
                            item.start = change.before.start;
                            item.row = change.before.row;
                        }
                    }
                    this.__needsSort = true;
                    break;
                    
                case "clone":
                case "add":
                    // Remove the added/cloned items
                    for (const entry of action.items) {
                        const item = this.getItemById(entry.id);
                        if (item) {
                            this.remove(item, true);
                        }
                    }
                    break;
                    
                case "delete":
                    // Restore deleted items
                    for (const entry of action.items) {
                        const restoredItem = this.cloneItem(entry.data);
                        restoredItem.id = entry.id;
                        this.items.push(restoredItem);
                        this.itemMap.set(restoredItem.id, restoredItem);
                    }
                    this.__needsSort = true;
                    break;
                    
                case "resize":
                case "slice-delete":
                    // Restore previous size
                    for (const change of action.changes) {
                        const item = this.getItemById(change.id);
                        if (item) {
                            item.start = change.before.start;
                            item.duration = change.before.duration;
                        }
                    }
                    this.__needsSort = true;
                    break;
                    
                case "cut":
                    // Remove the new item and restore original
                    if (action.newItemId) {
                        const newItem = this.getItemById(action.newItemId);
                        if (newItem) this.remove(newItem, true);
                    }
                    const originalItem = this.getItemById(action.originalId);
                    if (originalItem && action.originalDuration !== undefined) {
                        originalItem.duration = action.originalDuration;
                    }
                    this.__needsSort = true;
                    break;
                    
                default:
                    return false;
            }

            this.renderer.render();
            return true;
        }

        /**
         * Apply a redo operation with the given action state.
         * Called by external history manager with the action to redo.
         * @param {Object} action - The action state to redo
         * @returns {boolean} Whether the redo was applied successfully
         */
        applyRedo(action) {
            if (!action || !action.type) return false;
            
            switch (action.type) {
                case "move":
                    // Apply the move again
                    for (const change of action.changes) {
                        const item = this.getItemById(change.id);
                        if (item) {
                            item.start = change.after.start;
                            item.row = change.after.row;
                        }
                    }
                    this.__needsSort = true;
                    break;
                    
                case "clone":
                case "add":
                    // Re-add the items
                    for (const entry of action.items) {
                        const item = this.cloneItem(entry.data);
                        item.id = entry.id;
                        this.items.push(item);
                        this.itemMap.set(item.id, item);
                    }
                    this.__needsSort = true;
                    break;
                    
                case "delete":
                    // Delete the items again
                    for (const entry of action.items) {
                        const item = this.getItemById(entry.id);
                        if (item) {
                            this.remove(item, true);
                        }
                    }
                    break;
                    
                case "resize":
                case "slice-delete":
                    // Apply resize again
                    for (const change of action.changes) {
                        const item = this.getItemById(change.id);
                        if (item) {
                            item.start = change.after.start;
                            item.duration = change.after.duration;
                        }
                    }
                    this.__needsSort = true;
                    break;
                    
                case "cut":
                    // Re-perform the cut
                    const cutItem = this.getItemById(action.originalId);
                    if (cutItem && action.newItemData) {
                        cutItem.duration = action.afterDuration;
                        const newItem = this.cloneItem(action.newItemData);
                        newItem.id = action.newItemId;
                        this.items.push(newItem);
                        this.itemMap.set(newItem.id, newItem);
                    }
                    this.__needsSort = true;
                    break;
                    
                default:
                    return false;
            }

            this.renderer.render();
            return true;
        }


        // --- Setup

        // -- Renderables
        #setupRenderables() {
            const self = this;
            this.gridBackground = this.renderer.createRenderable({
                vertex: `#version 300 es

out vec2 vUV;

uniform vec2 resolution;

const vec2 positions[3] = vec2[](
    vec2(-1.0, -1.0),
    vec2( 3.0, -1.0),
    vec2(-1.0,  3.0)
);

void main() {
    vec2 pos = positions[gl_VertexID];
    vUV = pos * 0.5 + 0.5;
    gl_Position = vec4(pos, 0.0, 1.0);
}`,
            fragment: this.options.backgroundFragment ?? `#version 300 es
precision highp float;

uniform vec2 offset;
uniform vec2 resolution;
uniform vec2 zoom;
uniform vec2 timeSignature;
uniform vec2 gridSize;
uniform float contrast;

uniform float sidebarWidth;

in vec2 vUV;
out vec4 fragColor;

void main() {
    // Here we have the coordinates of the current pixel
    vec2 uv = vUV * resolution;

    // Flip the y-axis so that 0,0 is at the top left
    uv.y = resolution.y - uv.y;
    
    if(uv.y < 32.0) {
        if(uv.y > 30.0) {
            fragColor = vec4(vec3(0.2), 0.8 * contrast);
            return;
        }

        // Draw the top bar area
        fragColor = vec4(vec3(0.05), 0.8 * contrast);
        return;
    }

    if(uv.x < sidebarWidth) {
        if(uv.x > sidebarWidth - 2.0) {
            fragColor = vec4(vec3(0.0), 0.8 * contrast);
            return;
        }

        float mixFactor = 1.0;
        if(uv.x > sidebarWidth - 4.0) {
            mixFactor = 1.0 - (uv.x - (sidebarWidth - 4.0)) * 0.25;
        }

        fragColor = vec4(vec3(0.2), 1.0);
        return;
    }

    // Lines
    if(mod(uv.y + offset.y, gridSize.y * zoom.y) < 1.0 || uv.x < sidebarWidth + 1.0) {
        float keyHeight = gridSize.y * zoom.y;
        float posY = (uv.y + offset.y) * (1.0 / keyHeight);
        float gIndexY = floor(posY);
        float note = floor(mod(gIndexY, 12.0));
        float factor = 0.6;

        if(note == 0.0 || note == 7.0) {
            factor = 1.0;
        }

        fragColor = vec4(0.0, 0.0, 0.0, factor * contrast);
        return;
    }

    if(mod(uv.x + offset.x, gridSize.x * zoom.x) < 1.0 || uv.x < sidebarWidth + 1.0) {
        float factor = 0.6;

        // if we are on a bar line, make it more visible
        if(mod(uv.x + offset.x, gridSize.x * zoom.x * timeSignature.x) < 1.0) {
            factor = 1.0;
        }

        fragColor = vec4(0.0, 0.0, 0.0, factor * contrast);
        return;
    }

    // fract = modulo 1

    // Segments
    float cell = (uv.x + offset.x) * 1.0 / (64.0 * gridSize.x * zoom.x);
    float segmentHighlight = step(0.5, fract(cell)) * 0.5;

    // Rows
    float row = (uv.y + offset.y) * 1.0 / (2.0 * gridSize.y * zoom.y);
    float rowHighlight = step(0.5, fract(row)) * (segmentHighlight > 0.0 ? 0.2 : 0.5);

    fragColor = vec4(0.0, 0.0, 0.0, (segmentHighlight + rowHighlight) * contrast);
}
                `,

                uniforms: ["offset", "resolution", "zoom", "timeSignature", "gridSize", "contrast", "sidebarWidth"],
                attributes: [],

                bindVAO: true,

                onRender(delta, now, gl, cw, ch, updatedDimensions, uniforms, attributes) {
                    gl.uniform2f(uniforms.offset, self.#scrollX - self.sidebarWidth, self.#scrollY - self.labelBarHeight);
                    gl.uniform2f(uniforms.resolution, cw, ch);
                    gl.uniform2f(uniforms.zoom, self.#zoomX, self.#zoomY);
                    gl.uniform2f(uniforms.timeSignature, self.timeSignature.x, self.timeSignature.y);
                    gl.uniform2f(uniforms.gridSize, self.grid.w, self.grid.h);
                    gl.uniform1f(uniforms.contrast, self.contrast ?? 1.0);
                    gl.uniform1f(uniforms.sidebarWidth, self.sidebarWidth);

                    gl.drawArrays(gl.TRIANGLES, 0, 3);
                }
            });

            this.itemsRenderable = this.renderer.createRenderable({
                vertex: `#version 300 es

in float a_size;
in float a_state;
in vec2 a_position;
in vec3 a_color;

in float depth;

uniform float rowHeight;
uniform vec2 offset;
uniform vec2 resolution;
uniform vec2 zoom;

out float v_size;
out vec3 v_color;
out vec2 v_uv;
out vec2 v_position;
out float v_state;

const vec2 positions[6] = vec2[](
    vec2(-1.0, -1.0),
    vec2( 1.0, -1.0),
    vec2(-1.0,  1.0),

    vec2(-1.0,  1.0),
    vec2( 1.0, -1.0),
    vec2( 1.0,  1.0)
);

void main() {
    // Calculate the position of the note in screen space
    vec2 pos = a_position + (positions[gl_VertexID] * vec2(a_size, rowHeight));

    // Apply zoom and offset
    pos = (pos * zoom) - offset;

    // Convert to normalized device coordinates
    vec2 ndc = (pos / resolution) * 2.0 - 1.0;
    ndc.y = -ndc.y; // Flip y-axis for WebGL

    gl_Position = vec4(ndc, depth, 1.0);

    v_color = a_color;
    v_size = a_size;
    v_position = a_position;
    v_state = a_state;

    v_uv = positions[gl_VertexID];
}`,
            fragment: this.options.itemFragment ?? `#version 300 es
precision highp float;

in float v_size;
in vec3 v_color;
in vec2 v_uv;
in vec2 v_position;

in float v_state;

out vec4 fragColor;

uniform vec2 resolution;
uniform vec2 zoom;
uniform vec2 offset;
uniform float rowHeight;

uniform float sidebarWidth;

float roundedBoxSDF(vec2 CenterPosition, vec2 Size, float Radius) {
    return length(max(abs(CenterPosition)-Size+Radius,0.0))-Radius;
}

void main() {
    gl_FragDepth = 1.0;
    fragColor = vec4(0.1);
    // // Apply non-uniform zoom
    // vec2 size = vec2(v_size, rowHeight) * zoom;

    // float d = roundedBoxSDF((v_uv - 0.5) * size, size * 0.5, 4.0);

    // float aa = fwidth(d); // Anti-aliasing factor
    // float alpha = 1.0 - smoothstep(0.0, aa * 0.5, d);

    // // Base color
    // vec3 color = v_color.rgb;
    // vec2 pos = v_uv * size;

    // // Borders & resize handles

    // if(v_state > 0.0) {
    //     color = mix(color, vec3(1.0), 0.2);
    // } else {
    //     if(pos.y < 1.0) {
    //         fragColor = vec4(mix(color, vec3(1.0), 0.3), alpha);
    //         return;
    //     }
    
    //     if(pos.y > size.y - 1.0) {
    //         fragColor = vec4(mix(color, vec3(0.0), 0.5), alpha);
    //         return;
    //     }
    // }

    // if(pos.x < 6.0 || pos.x > size.x - 6.0) {
    //     fragColor = vec4(mix(color, vec3(1.0), 0.3), alpha);
    //     return;
    // }

    // fragColor = vec4(color, alpha);
}`,

                uniforms: ["offset", "resolution", "zoom", "sidebarWidth", "rowHeight"],
                attributes: ["a_position", "a_size", "a_color", "a_state", "depth"],

                bindVAO: true,

                onSetup(gl, program, uniforms, attributes) {
                    this.positionBuffer = this.createBufferForAttribute(attributes.a_position, MAX_RENDER_ITEMS, 2);
                    this.sizeBuffer = this.createBufferForAttribute(attributes.a_size,         MAX_RENDER_ITEMS, 1);
                    this.colorBuffer = this.createBufferForAttribute(attributes.a_color,       new Uint8Array(MAX_RENDER_ITEMS * 3), 3, gl.UNSIGNED_BYTE, true);
                    this.depthBuffer = this.createBufferForAttribute(attributes.depth, MAX_RENDER_ITEMS, 1);

                    // I genuinely tried for 4 fucking hours to get this to work with a Uint8Array but webgl just decides to do random bullshit and i don't have the nerves for it
                    // So sorry not sorry we gonna waste 4 bytes for a boolean
                    // this.stateBuffer = this.createBufferForAttribute(attributes.a_state,       new Uint8Array(MAX_RENDER_ITEMS),     1);
                    this.stateBuffer = this.createBufferForAttribute(attributes.a_state,       MAX_RENDER_ITEMS, 1);
                },

                onRender(delta, now, gl, cw, ch, updatedDimensions, uniforms, attributes) {
                    if(updatedDimensions) {
                        // Ensure scroll is within bounds
                        self.scrollX = self.#scrollX;
                        self.scrollY = self.#scrollY;
                    }

                    const viewWidth = cw / self.#zoomX;

                    const movedX = self.__prevScrollX !== self.#scrollX || self.__prevZoomX !== self.#zoomX || updatedDimensions;
                    const movedY = self.__prevScrollY !== self.#scrollY || self.__prevZoomY !== self.#zoomY || updatedDimensions;

                    const focusedItems = self.selectedItems;
                    const focusedItemsLength = focusedItems.length;
                    const selectedItemsChanged = self.__prevSelectedItemsLength !== focusedItemsLength;
                    self.__prevSelectedItemsLength = focusedItemsLength;

                    // --- Redraw items
                    if (movedX || movedY || self.__needsSort || self.__rerenderItems || selectedItemsChanged || focusedItemsLength > 0) {
                        if (self.__needsSort) {
                            self.sortItems();
                        }

                        self.__rerenderItems = false;

                        // First find the first visible item
                        const maxDuration = self.maxDuration;
                        const startIndex = self.binarySearch((self.#scrollX / self.#zoomX) - maxDuration);
                        const firstVisibleRow = Math.floor(self.#scrollY / (self.grid.h * self.#zoomY));
                        const lastVisibleRow = Math.floor((self.#scrollY + ch) / (self.grid.h * self.#zoomY));

                        const toRender = Math.min(self.items.length, MAX_RENDER_ITEMS);

                        let j = 0, reserved = 0;
                        for (let i = startIndex; i < toRender; i++) {
                            const item = self.items[i];
                            if(!item) continue;

                            if(focusedItems.indexOf(item) !== -1) {
                                continue;
                            }

                            const [shouldBreak, itemReserved, itemsAdded] = self.__addRenderableItem(item, 0, j, reserved, firstVisibleRow, lastVisibleRow);
                            reserved += itemReserved;
                            j += itemsAdded;
                            if(shouldBreak) {
                                break;
                            }
                        }

                        for (let i = 0; i < focusedItemsLength; i++) {
                            const item = focusedItems[i];
                            if(!item) continue;

                            const [shouldBreak, itemReserved, itemsAdded] = self.__addRenderableItem(item, 1, j, reserved, firstVisibleRow, lastVisibleRow);
                            reserved += itemReserved;
                            j += itemsAdded;
                            if(shouldBreak) {
                                break;
                            }
                        }

                        if(reserved) {
                            // Clear remaining space by changing the range (faster when rendering in ranges (standalone), otherwise clear must be used to actually clear the text block)
                            self.labels.clip(0, reserved);
                        } else {
                            self.labels.clip(0, 0);
                        }

                        if(j > 0) {

                            this.positionBuffer.update();
                            this.sizeBuffer.update();
                            this.colorBuffer.update();
                            this.stateBuffer.update();
                            this.depthBuffer.update();
                        }

                        this.__visibleItems = j;
                    }

                    if(this.__visibleItems > 0) {
                        self.renderer.scissor(self.sidebarWidth, self.labelBarHeight);

                        gl.uniform2f(uniforms.offset, self.#scrollX - self.sidebarWidth, self.#scrollY - self.labelBarHeight);
                        gl.uniform2f(uniforms.zoom, self.#zoomX, self.#zoomY);
                        gl.uniform2f(uniforms.resolution, cw, ch);
                        gl.uniform1f(uniforms.sidebarWidth, self.sidebarWidth);
                        gl.uniform1f(uniforms.rowHeight, self.grid.h - 1.0);

                        // fuck webgl nothing ever works
                        // it's the same cycle: 1) try to implement the simplest thing in existence that should take 2 seconds at most, 2) absolutely nothing works and shit that worked flawlessly is gone, 3) 8 hours in just give up
                        // took me 30 hours to get a shitty rectangle to render

                        // gl.enable(gl.DEPTH_TEST);
                        // gl.depthFunc(gl.LEQUAL);
                        // gl.depthMask(true);
                        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.__visibleItems);
                        
                        // gl.depthMask(false);
                        self.labels.render();
                        // gl.disable(gl.DEPTH_TEST);

                        self.renderer.endScissor();
                    }

                    let reserved = 0;

                    // Redraw bar labels (markers)
                    if (movedX) {
                        self.__prevScrollX = self.#scrollX;
                        self.__prevZoomX = self.#zoomX;

                        const pixelsPerGrid = self.grid.w * self.#zoomX;

                        const labelSpacing = self.textEngine.cellWidth * 15; // minimum space between labels
                        const labelStep = Math.max(1, Math.ceil(labelSpacing / pixelsPerGrid));

                        const labelCount = ((self.renderer.width - self.sidebarWidth) / pixelsPerGrid);
                        const preBuffer = Math.floor(self.sidebarWidth / pixelsPerGrid);

                        const y = (self.labelBarHeight / 2) - (self.textEngine.cellHeight / 2);

                        for (let i = 0; i < labelCount + preBuffer + 1; i++) {
                            const tNorm = i - preBuffer + Math.floor(self.#scrollX / pixelsPerGrid);

                            if (tNorm < 0 || tNorm % labelStep !== 0) continue;

                            const label = self.formatMarker(tNorm, labelStep);
                            const length = label.length;

                            self.numberLabelsX.writeTextAt(
                                label,
                                reserved,
                                length,
                                (self.sidebarWidth - self.#scrollX % pixelsPerGrid) + (i - preBuffer) * pixelsPerGrid,
                                y,
                                255, 255, 255, 255
                            );

                            reserved += length;
                        }
                    }

                    // Clear remaining space by changing the range (if not drawing standalone then clear must be used to actually clear the text block)
                    if(reserved) {
                        self.numberLabelsX.clip(0, reserved || 0);
                    }

                    self.numberLabelsX.render();

                    // Key labels
                    reserved = 0;
                    if (movedY) {
                        self.__prevScrollY = self.#scrollY;
                        self.__prevZoomY = self.#zoomY;

                        // const pixelsPerRow = self.grid.h * self.#zoomY;
                        // if(pixelsPerRow > self.textEngine.cellHeight + 2) {
                        //     const labelStep = Math.max(1, Math.ceil(self.textEngine.cellHeight / pixelsPerRow));
                        //     const labelCount = ((self.renderer.height - self.labelBarHeight) / pixelsPerRow);
                        //     const preBuffer = Math.floor(self.labelBarHeight / pixelsPerRow);
                        //     const padding = 4;

                        //     // First pass: render C labels only
                        //     for (let i = 0; i < labelCount + preBuffer + 1; i++) {
                        //         const row = i - preBuffer + Math.floor(self.#scrollY / pixelsPerRow);

                        //         if (row < 0 || (self.maxRows > 0 && row >= self.maxRows) || row % labelStep !== 0) continue;

                        //         const noteName = "test"|| self.getNoteName(row);
                        //         const isC = noteName.charCodeAt(0) === 67 && noteName.charCodeAt(1) !== 35;
                        //         const isBlack = noteName.charCodeAt(1) === 35;

                        //         if(isBlack) continue;

                        //         const y =
                        //             (self.labelBarHeight - self.#scrollY % pixelsPerRow) +
                        //             (i - preBuffer) * pixelsPerRow +
                        //             (pixelsPerRow / 2) -
                        //             (self.textEngine.cellHeight / 2);

                        //         // if (y < self.labelBarHeight)
                        //         //     continue;

                        //         const length = noteName.length;
                        //         const x = self.sidebarWidth - padding - (self.textEngine.cellWidth * length);

                        //         console.log(`Rendering label "${noteName}" at (${x}, ${y}), row: ${row}, pixelsPerRow: ${pixelsPerRow}, labelStep: ${labelStep}, labelCount: ${labelCount}, preBuffer: ${preBuffer}`);

                        //         self.numberLabelsY.writeTextAt(
                        //             noteName,
                        //             reserved,
                        //             length,
                        //             x - 5,
                        //             y,
                        //             0, 0, 0, isC? 200: 64
                        //         );

                        //         reserved += length;
                        //     }
                        // }
                    }

                    // Clear remaining space by changing the range (if not drawing standalone then clear must be used to actually clear the text block)
                    // if(reserved) {
                    //     self.numberLabelsY.clip(0, reserved || 0);
                    // }
                    // self.renderer.scissor(0, self.labelBarHeight);
                    // self.numberLabelsY.render();
                    // self.renderer.endScissor();

                    // self.labels.setText(`Scroll: (${self.#scrollX.toFixed(2)}, ${self.#scrollY.toFixed(2)}), Zoom: (${self.#zoomX.toFixed(2)}, ${self.#zoomY.toFixed(2)})`, self.contrast < 0.8 ? "black" : "white");
                }
            });

            this.selectionRectRenderable = this.renderer.createRenderable({
                vertex: LS.GL.shaders.basic_quad,
                fragment: this.options.selectionFragment ?? `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform vec2 uSize;
uniform vec2 uOffset;
uniform vec2 uResolution;
uniform uvec3 uColor; 

void main() {
    vec2 uv = vUV * uSize;
    vec3 color = vec3(uColor) / 255.0;

    // Border
    if(uv.x < 2.0 || uv.x > uSize.x - 2.0 || uv.y < 2.0 || uv.y > uSize.y - 2.0) {
        fragColor = vec4(color, 1.0);
        return;
    }

    fragColor = vec4(color, 0.2);
}`,
                uniforms: ["uOffset", "uSize", "uResolution", "uColor"],
                attributes: [],

                bindVAO: true,

                // i spent SO MUCH fucking time and nerves on this bullshit
                onRender(delta, now, gl, cw, ch, updatedDimensions, uniforms, attributes) {
                    if(!self.selectionRect[0]) return;
                    let x = self.selectionRect[1]  - self.#scrollX;
                    let y = self.selectionRect[2];
                    let x2 = self.selectionRect[3] - self.#scrollX;
                    let y2 = self.selectionRect[4];

                    const rowHeight = self.grid.h * self.#zoomY;
                    const row1 = Math.floor(y  / rowHeight);
                    const row2 = Math.floor(y2 / rowHeight);

                    const snappedTop = Math.min(row1, row2) * rowHeight - self.#scrollY;
                    const snappedBottom = (Math.max(row1, row2) + 1) * rowHeight - self.#scrollY;

                    gl.uniform2f(uniforms.uOffset, Math.min(x, x2) + self.sidebarWidth, snappedTop + self.labelBarHeight);
                    gl.uniform2f(uniforms.uSize, Math.abs(x2 - x), snappedBottom - snappedTop);

                    const color = LS.Color.currentAccent || DEFAULT_TILE_COLOR;
                    gl.uniform3ui(uniforms.uColor, color[0], color[1], color[2]);

                    gl.uniform2f(uniforms.uResolution, cw, ch);

                    this.renderer.scissor(self.sidebarWidth, self.labelBarHeight);
                    gl.drawArrays(gl.TRIANGLES, 0, 6);
                    this.renderer.endScissor();
                }
            });

            this.renderable.renderables.push(this.gridBackground, this.itemsRenderable, this.selectionRectRenderable);
        }

        __addRenderableItem(item, state, j, reserved, firstVisibleRow, lastVisibleRow) {
            const computedX = item.start * this.#zoomX - this.#scrollX;

            const positionBuffer = this.itemsRenderable.positionBuffer;
            const sizeBuffer = this.itemsRenderable.sizeBuffer;
            const colorBuffer = this.itemsRenderable.colorBuffer;
            const stateBuffer = this.itemsRenderable.stateBuffer;
            const depthBuffer = this.itemsRenderable.depthBuffer;

            if (computedX > this.renderer.width) {
                // Since items are sorted by start, all subsequent items will also be off-screen to the right
                // However we skip this check for focused items (state = 1)
                return [state !== 1, 0, 0];
            }

            if(item.row < firstVisibleRow || item.row > lastVisibleRow) {
                return [false, 0, 0];
            }

            positionBuffer.set(j * 2, item.start);
            positionBuffer.set(j * 2 + 1, item.row * this.grid.h);

            sizeBuffer.set(j, Math.max(1, item.duration));

            if(item.tileColor && !Array.isArray(item.tileColor)) {
                // Parse & cache any non-array color value
                item.tileColor = LS.Color.parse(item.tileColor);
            }

            const color = item.tileColor || LS.Color.currentAccent || DEFAULT_TILE_COLOR;

            colorBuffer.set(j * 3,     color[0]);
            colorBuffer.set(j * 3 + 1, color[1]);
            colorBuffer.set(j * 3 + 2, color[2]);

            stateBuffer.set(j, state);

            const depth = j / 1000;

            depthBuffer.set(j, depth + 0.0001);

            // TODO text should be properly centered
            if(item.duration * this.#zoomX > 20) {
                const label = (item.label || item.id || "").slice(0, (item.duration * this.#zoomX - 20) / this.textEngine.cellWidth);
                const labelLength = label.length;

                if(labelLength > 0) {
                    this.labels.writeTextAt(label, reserved, labelLength, computedX + 10 + this.sidebarWidth, (((this.grid.h * 0.5) + (item.row * this.grid.h)) * this.#zoomY - this.#scrollY) + this.labelBarHeight - (10), 255, 255, 255, 255, 16, 0, 0, depth);
                    return [false, labelLength, 1];
                };
            }

            return [false, 0, 1];
        }

        // -- Navigation
        #setupHandle() {
            let initial = [0, 0], mode = 0, edgeScrollOffset = [0, 0], itemChanged = false;
            this.touchHandle = new LS.Util.TouchHandle(this.renderer.canvas, {
                calculateBounds: true,

                frameTimed: true,
                fluentFrames: true,

                edgeScroll: true,

                handleWheel: true,
                handleHover: true,

                transformBounds: (rect) => {
                    const rRect = this.renderable.rect;
                    return {
                        x: rect.x + rRect.x + this.sidebarWidth,
                        y: rect.y + rRect.y + this.labelBarHeight,
                        width: rRect.width - this.sidebarWidth,
                        height: rRect.height - this.labelBarHeight
                    };
                },

                // This handles scrolling, edge scrolling, and scroll inertia
                onScroll: (deltaX, deltaY, event, isWheel) => {
                    if(isWheel) {
                        if (event.domEvent.ctrlKey) {
                            const rect = this.renderer.canvas.getBoundingClientRect();
                            const mouseX = event.domEvent.clientX - rect.left;
                            this.zoomFrom(mouseX, 0, deltaY, 1.1, 1.0);
                        } else if (event.domEvent.altKey) {
                            const rect = this.renderer.canvas.getBoundingClientRect();
                            const mouseY = event.domEvent.clientY - rect.top;
                            this.zoomFrom(0, mouseY, deltaY, 1.0, 1.1);
                        } else {
                            if (event.domEvent.shiftKey) {
                                this.scrollX += deltaY;
                            } else {
                                this.scrollY += deltaY;
                            }
                        }
                        return;
                    }

                    // Clamp the edge scroll offset
                    const scrollDeltaX = Math.max(-this.#scrollX, deltaX);
                    const scrollDeltaY = Math.max(-this.#scrollY, deltaY);

                    if (scrollDeltaX) {
                        this.scrollX += scrollDeltaX;
                        edgeScrollOffset[0] += scrollDeltaX;
                        event.__scrolled = true;
                    }

                    if (scrollDeltaY) {
                        this.scrollY += scrollDeltaY;
                        edgeScrollOffset[1] += scrollDeltaY;
                        event.__scrolled = true;
                    }
                },

                onStart: (event) => {
                    // Reset state
                    const button = +event.domEvent.button ?? 0;
                    this.touchHandle.edgeScroll = button !== 1;
                    this.renderer.canvas.style.cursor = "";
                    this.touchHandle.inertia = false;
                    event.__scrolled = false;
                    edgeScrollOffset[0] = 0;
                    edgeScrollOffset[1] = 0;
                    itemChanged = false;
                    mode = 0;

                    if (event.boundX < 0) {
                        // Sidebar area
                        return event.cancel();
                    }

                    // Check if we are interacting with an item
                    if (button === 0 && !event.domEvent.ctrlKey) {
                        const { row, time } = this.transformCoords(event.boundX, event.boundY, false);
                        const items = this.getIntersectingAt(time, row);

                        if (items.length > 0) {
                            const item = this.focusedItem = items[items.length - 1];
                            initial[0] = item.start;
                            initial[1] = item.duration;

                            const itemX = item.start * this.#zoomX - this.#scrollX;
                            const itemWidth = item.duration * this.#zoomX;

                            if (event.boundX >= itemX + itemWidth - this.resizeMargin && event.boundX <= itemX + itemWidth) {
                                // Resize from the right edge
                                mode = 2;
                                this.touchHandle.cursor = "ew-resize";
                            } else if (event.boundX >= itemX && event.boundX <= itemX + this.resizeMargin) {
                                // Resize from the left edge
                                mode = 3;
                                this.touchHandle.cursor = "ew-resize";
                            } else {
                                // Move the item
                                mode = 1;
                                this.touchHandle.cursor = "var(--ls-timeline-cursor-move)";
                            }
                            console.log(`Focused item: ${item.id}, mode: ${mode}`);
                            return;
                        }
                    }

                    // Mouse behaviors
                    if (button === 1) {
                        if (event.domEvent.altKey || event.domEvent.ctrlKey) {
                            this.touchHandle.cursor = "none";
                            mode = event.domEvent.altKey ? 6 : 7;
                        } else {
                            this.touchHandle.cursor = "grabbing";
                            this.touchHandle.inertia = true;
                            mode = 0;
                        }
                    } else if (button === 0) {
                        if (event.domEvent.ctrlKey) {
                            // Selection
                            mode = 8;
                            this.touchHandle.cursor = "crosshair";
                            this.selectionRect[0] = 1;
                            this.selectionRect[1] = event.boundX + this.scrollX;
                            this.selectionRect[2] = event.boundY + this.scrollY;
                            this.selectionRect[3] = event.boundX + this.scrollX;
                            this.selectionRect[4] = event.boundY + this.scrollY;
                            this.selectedItems.length = 0;
                            this.renderer.render();
                            return;
                        }

                        mode = 4;

                        if (this.#tool === "draw") {
                            const { row, time } = this.transformCoords(event.boundX, event.boundY, false);
                            const start = event.domEvent?.altKey === true ? time : this._snap(time, this.grid.w);

                            const paintingSize = event.domEvent?.shiftKey === true;

                            this.focusedItem = {
                                start: start,
                                duration: paintingSize ? (event.domEvent?.altKey === true ? 1 : this.grid.w) : (this.previousItem? this.previousItem.duration || this.grid.w : this.grid.w),
                                row: row,
                                id: LS.Misc.uid(),
                            };

                            this.items.push(this.focusedItem);
                            this.touchHandle.cursor = "var(--ls-timeline-cursor-move)";
                            initial[0] = this.focusedItem.start;
                            initial[1] = this.focusedItem.duration;
                            itemChanged = true;

                            // Dragging the note
                            mode = paintingSize ? 2 : 1;

                            this.renderer.render();
                        }
                    } else if (button === 2) {
                        this.touchHandle.cursor = "var(--ls-timeline-cursor-erase)";
                        mode = 5;
                    }
                },

                onMove: (event) => {
                    if (!event.hasMoved && !event.__scrolled) return;
                    event.__scrolled = false;

                    let nothingToDo = false;

                    const unlockedSnap = (event.domEvent && event.domEvent.altKey) || this.#zoomX > 2.0;
                    let snapDistance = unlockedSnap ? 1 : this.grid.w;
                    const snapOffset = initial[0] % snapDistance;

                    const keepRelative = event.domEvent && !event.domEvent.shiftKey;

                    switch (mode) {
                        // -- Panning the view
                        case 0:
                            this.scrollX -= event.dx;
                            this.scrollY -= event.dy;
                            nothingToDo = true;
                            return;

                        // -- Zoom X
                        case 6:
                            this.zoomFrom(event.boundX, 0, event.dy, 1.1, 1.0);
                            break;

                        // -- Zoom Y
                        case 7:
                            this.zoomFrom(0, event.boundY, event.dy, 1.0, 1.1);
                            break;

                        // -- Selection
                        case 8:
                            this.selectionRect[3] = event.boundX + this.scrollX;
                            this.selectionRect[4] = event.boundY + this.scrollY;

                            let time1 = this.transformCoords(this.selectionRect[1] - this.scrollX, this.selectionRect[2] - this.scrollY, false);
                            let time2 = this.transformCoords(event.boundX, event.boundY, false);
                            if(time1.time > time2.time) {
                                [time1, time2] = [time2, time1];
                            }

                            const items = this.getRange(time1.time, time2.time).filter(item => item.row >= Math.min(time1.row, time2.row) && item.row <= Math.max(time1.row, time2.row));

                            this.selectedItems = items;
                            console.log(`Selected items: `, this.selectedItems, time1, time2, this.selectionRect, items);
                            break;

                        // -- Move item
                        case 1: {
                            if (!this.focusedItem) return;

                            const { row } = this.transformCoords(event.boundX, event.boundY, false);

                            let start = initial[0] + (event.offsetX + edgeScrollOffset[0]) / this.#zoomX;
                            if (snapDistance > 0) {
                                if (keepRelative) {
                                    start = this._snap(start, snapDistance, snapOffset);
                                } else {
                                    start = Math.round(start / snapDistance) * snapDistance;
                                }
                            }

                            if(this.selectedItems.length > 0) {
                                const delta = start - this.focusedItem.start;
                                const deltaRow = row - this.focusedItem.row;
                                for(const item of this.selectedItems) {
                                    item.start = Math.max(0, item.start + delta);
                                    item.row = Math.max(0, item.row + deltaRow);
                                }
                            }

                            this.focusedItem.start = Math.max(0, start);
                            this.focusedItem.row = row;
                            itemChanged = true;
                            break;
                        }

                        // -- Resize item from right edge
                        case 2: {
                            if (!this.focusedItem) return;
                            let end = initial[0] + initial[1] + (event.offsetX + edgeScrollOffset[0]) / this.#zoomX;

                            if (snapDistance > 0) {
                                const offset = keepRelative
                                    ? (initial[0] + initial[1]) % snapDistance
                                    : 0;

                                if (keepRelative) {
                                    end = this._snap(end, snapDistance, offset);
                                } else {
                                    end = this._snap(end, snapDistance);
                                }
                            }

                            this.focusedItem.duration = Math.max(1, unlockedSnap ? 1 : Math.min(this.grid.w, initial[1]), end - this.focusedItem.start);

                            LS.Tooltips.position(event.boundingRect.left + 10, event.boundingRect.top + 10);
                            LS.Tooltips.set(`Start: ${(this.focusedItem.start / this.grid.w).toFixed(2)} steps, Length: ${(this.focusedItem.duration / this.grid.w).toFixed(2)} steps`);
                            LS.Tooltips.show();
                            itemChanged = true;
                            break;
                        }

                        // -- Resize item from left edge
                        case 3: {
                            if (!this.focusedItem) return;
                            let start = initial[0] + (event.offsetX + edgeScrollOffset[0]) / this.#zoomX;
                            const end = initial[0] + initial[1];

                            if (snapDistance > 0) {
                                if (keepRelative) {
                                    start = this._snap(start, snapDistance, snapOffset);
                                } else {
                                    start = this._snap(start, snapDistance);
                                }
                            }

                            start = Math.max(0, Math.min(start, end - (unlockedSnap ? 1 : this.grid.w)));

                            this.focusedItem.start = start;
                            this.focusedItem.duration = Math.max(1, end - start);

                            LS.Tooltips.position(this.touchHandle.boundingRect.left + 10, this.touchHandle.boundingRect.top + 10);
                            LS.Tooltips.set(`Start: ${(this.focusedItem.start / this.grid.w).toFixed(2)} steps, Length: ${(this.focusedItem.duration / this.grid.w).toFixed(2)} steps`);
                            LS.Tooltips.show();
                            itemChanged = true;
                            break;
                        }

                        // -- Tool
                        case 4:
                            break;

                        // -- Erase item
                        case 5: {
                            if (!this.focusedItem) return;

                            const { row: eraseRow, time: eraseTime } = this.transformCoords(event.boundX, event.boundY, false);
                            const itemsToErase = this.getIntersectingAt(eraseTime, eraseRow);

                            if (itemsToErase.length > 0) {
                                const itemToErase = itemsToErase[itemsToErase.length - 1];
                                this.remove(itemToErase, true);
                                this.focusedItem = null;
                            }
                            break;
                        }
                    }

                    if (!nothingToDo) {
                        this.renderer.render();
                    }
                },

                onEnd: (event) => {
                    this.previousItem.start = this.focusedItem?.start;
                    this.previousItem.duration = this.focusedItem?.duration;
                    this.previousItem.row = this.focusedItem?.row;

                    if(itemChanged) {
                        this.sortItems();
                    }

                    if(this.selectionRect[0]) {
                        this.selectionRect[0] = false;
                        this.renderer.render();
                    }

                    // this.focusedItem = null;

                    // Hide any tooltips created by the timeline
                    LS.Tooltips.hide();
                },

                onHover: (event) => {
                    // TODO: zIndex
                    const item = this.getIntersectingAt((event.boundX + this.#scrollX) / this.#zoomX, Math.floor((event.boundY + this.#scrollY) / (this.grid.h * this.#zoomY))).pop();
                    if (!item) {
                        this.renderer.canvas.style.cursor = "";
                        return;
                    }

                    const noteX = item.start * this.#zoomX - this.#scrollX;
                    const noteY = item.row * this.grid.h * this.#zoomY - this.#scrollY;
                    const noteW = item.duration * this.#zoomX;
                    const noteH = this.grid.h * this.#zoomY;

                    if (event.boundX > noteX + this.resizeMargin && event.boundX < noteX + noteW - this.resizeMargin) {
                        this.renderer.canvas.style.cursor = "var(--ls-timeline-cursor-move)";
                    } else {
                        this.renderer.canvas.style.cursor = "ew-resize";
                    }
                }
            });

            // Keyboard navigation
            // TODO
            this.addExternalEventListener(this.container, 'keydown', (event) => {});

            this.addExternalEventListener(this.container, 'dragover', (event) => {
                const dt = event.dataTransfer;
                if (!dt) return;

                // Only intercept when files are present
                const types = dt.types ? Array.from(dt.types) : [];
                if (!types.includes('Files')) return;

                event.preventDefault();
                try { dt.dropEffect = 'copy'; } catch (_) { /* noop */ }
            });

            this.addExternalEventListener(this.container, 'drop', (event) => {
                const dt = event.dataTransfer;
                if (!dt || !dt.files || dt.files.length === 0) return;
                event.preventDefault();

                const { row, time } = this.transformCoords(event.clientX, event.clientY);
                this.quickEmit("file-dropped", dt.files, row, time);
            });
        }

        get focusedItem() {
            return this.selectedItems[0];
        }

        set focusedItem(item) {
            if (item === this.focusedItem) return;
            this.selectedItems.length = 0;
            if (item) {
                this.selectedItems.push(item);
            }
        }

        _snap(value, snapDistance, snapOffset = 0) {
            return Math.round((value - snapOffset) / snapDistance) * snapDistance + snapOffset;
        }

        // --- Getters and Setters and camera-related methods

        set scrollX(value) {
            if(isNaN(value)) return;
            value = Math.max(0, value);
            if (value === this.#scrollX) return;
            this.#scrollX = value;
            this.renderer.render();
        }

        get scrollX() {
            return this.#scrollX;
        }

        set scrollY(value) {
            if(isNaN(value)) return;

            if(this.maxRows < 0) {
                value = Math.max(0, value);
            } else {
                value = Math.max(0, Math.min(Number(value), ((this.maxRows * this.grid.h) * this.#zoomY) - ((this.renderer.height - this.labelBarHeight))));
            }

            if (value === this.#scrollY) return;

            this.#scrollY = value;
            this.renderer.render();
        }

        get scrollY() {
            return this.#scrollY;
        }

        set zoomX(value) {
            if(isNaN(value)) return;
            value = Math.max(0.1, Math.min(5, value));
            if (value === this.#zoomX) return;
            this.#zoomX = value;
            this.renderer.render();
        }

        get zoomX() {
            return this.#zoomX;
        }

        set zoomY(value) {
            if(isNaN(value)) return;
            value = Math.max(0.5, Math.min(5, value));
            if (value === this.#zoomY) return;
            this.#zoomY = value;
            this.renderer.render();
        }

        get zoomY() {
            return this.#zoomY;
        }

        get duration() {
            return this.#duration;
        }

        set rowHeight(value) {
            if(isNaN(value)) return;
            value = Math.max(1, value);
            if (value === this.grid.h) return;
            this.grid.h = value;
            this.renderer.render();
        }

        get rowHeight() {
            return this.grid.h;
        }

        set tool(value) {}

        get tool() {
            return this.#tool;
        }

        // --- Cleanup

        /**
         * Remove an item from the timeline, but keeps it alive to be added later.
         * Use if you think you might want to re-add the item later (eg. multiple timelines).
         * Optionally destroys it.
         * @param {*} item Item to remove
         * @param {*} destroy Whether to destroy the item
         * @returns {void}
         */
        remove(item, destroy = false) {
            const index = this.items.indexOf(item);
            if (index >= 0) {
                this.items.splice(index, 1);
                this.__needsSort = true;
                this.renderer.render();
            }

            const selectedItemIndex = this.selectedItems.indexOf(item);
            if (selectedItemIndex >= 0) {
                this.selectedItems.splice(selectedItemIndex, 1);
            }

            if (item.id) this.itemMap.delete(item.id);
            if(item.type === "automation" && item.__automationClip) {
                item.__automationClip?.destroy?.();
                item.__automationClip = null;
            }

            this.quickEmit("item-removed", item);

            if(destroy) {
                this.quickEmit("item-cleanup", item);
            }
        }

        /**
         * Destroy an item and remove it from the timeline. Clears any associated resources.
         * Use if you want to permanently delete an item.
         * @param {*} item Item to destroy
         * @returns {void}
         */
        destroyItem(item) {
            return this.remove(item, true);
        }

        destroy() {
            if(this.destroyed) return;
            this.reset(true);

            this.textEngine.destroy();
            this.textEngine = null;

            this.touchHandle.destroy();
            this.touchHandle = null;

            this.options = null;
            this.renderable = null;
            this.clipboard = null;
            this.selectedItems = null;
            this.items = null;
            this.itemMap = null;
            this.previousItem = null;

            this.__actionEventRef = null;

            this.container.remove();
            this.container = null;

            this.renderer.destroy();
            this.renderer = null;

            super.destroy();
        }

        // --- Legacy methods (for compatibility with TimelineDOM)
        reserveRows() {}
        clearUnusedRows() {}
        addTrack() {}
    }, { name: "TimelineGL", global: true });
})();