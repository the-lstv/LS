/**
 * An efficient timeline component, optimized for long timelines with many items via virtual scrolling.
 * It handles drag and drop, resizing, slicing, markers, touch controls, etc.
 * Features highly intuitive keyboard controls.
 * 
 * Based on the original LSv3 implementation, rewritten from scratch.
 * 
 * @author lstv.space
 * @license GPL-3.0
 */

/**
 * TODO List:
 * 
 * CRITICAL:
 * - Item to item snapping issues
 * 
 * I'm thinking using WebGL would have been much easier and better 😭
 */

(() => {
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const normalizeSnappedTime = (value) => Math.abs(value) < 1e-12 ? 0 : Number(value.toPrecision(12));
    const snapTimeToStep = (time, step) => step > 0 ? normalizeSnappedTime(Math.round(time / step) * step) : time;

    const DEFAULTS = {
        element: null,
        chunkSize: "auto",
        reservedRows: 5,
        zoom: 200,
        offset: 0,
        minZoom: 0.4,
        maxZoom: 1400,
        markerSpacing: 100,
        markerMetric: "time",
        resizable: true,
        autoAppendRows: true,
        allowAutomationClips: false,
        autoCreateAutomationClips: false,
        snapping: false,
        itemHeaderHeight: 20,
        startingRows: 15,
        rowHeight: 45,
        // snapEnabled: true,
        snapEnabled: false,
        gridSnapping: true,
        gridSnapDivision: 1 / 40,
        remapAutomationTargets: true,
        framerateLimit: 90,
        tool: "select",
        toolShortcuts: {
            select: "v",
            slice: "c",
            preview: "p",
            erase: "e",
            group: "g"
        }
    };

    const SLICE_EPSILON = 0.01;
    const MIN_GRID_LINE_SPACING = 10;
    const MIN_MAJOR_GRID_LINE_SPACING = 60;
    const MIN_ITEM_PIXEL_WIDTH = 5;

    function num(value, fallback = 0) {
        value = Number(value);
        return Number.isFinite(value) ? value : fallback;
    }

    // const TEMPLATE = LS.CompileTemplate((data, logic) => ({
    //     attributes: { tabindex: "0" },
    //     inner: [
    //         (logic.export("markerContainer", {
    //             class: "ls-timeline-markers"
    //         })),

    //         (logic.export("playerHead", {
    //             class: "ls-timeline-player-head"
    //         })),

    //         (logic.export("selectionRect", {
    //             class: "ls-timeline-selection-rect",
    //             style: "position: absolute; pointer-events: none; display: none; border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 50%, rgba(0, 0, 0, 0.2) 50%); z-index: 100;"
    //         })),

    //         (logic.export("snapLine", {
    //             class: "ls-timeline-snap-line",
    //             style: "position: fixed; top: 0; left: 0; width: 1px; background: var(--accent-60); z-index: 1000; pointer-events: none; display: none;"
    //         })),

    //         (logic.export("sliceLine", {
    //             class: "ls-timeline-slice-line",
    //             style: "position: fixed; top: 0; left: 0; width: 2px; background: var(--accent-60); z-index: 1000; pointer-events: none; display: none;"
    //         })),

    //         (logic.export("scrollContainer", {
    //             class: "ls-timeline-scroll-container",
    //             inner: [
    //                 (logic.export("spacerElement", {
    //                     class: "ls-timeline-spacer",
    //                     style: "height: 1px; width: 0px;"
    //                 })),

    //                 (logic.export("rowContainer", {
    //                     class: "ls-timeline-rows"
    //                 }))
    //             ]
    //         }))
    //     ]
    // }));

    // Until I have a server-side transpiler of LS.CompileTemplate, I will hard-code the output here to give the client some rest :P
    const TEMPLATE = function(d){'use strict';var e0=document.createElement("div");e0.setAttribute("tabindex","0");var e1=document.createElement("div");e1.className="ls-timeline-markers";var e2=document.createElement("div");e2.className="ls-timeline-player-head";var e3=document.createElement("div");e3.className="ls-timeline-selection-rect";e3.style.cssText="position: absolute; pointer-events: none; display: none; border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 50%, rgba(0, 0, 0, 0.2) 50%); z-index: 100;";var e4=document.createElement("div");e4.className="ls-timeline-snap-line";e4.style.cssText="position: fixed; top: 0; left: 0; width: 1px; background: var(--accent-60); z-index: 1000; pointer-events: none; display: none;";var e5=document.createElement("div");e5.className="ls-timeline-slice-line";e5.style.cssText="position: fixed; top: 0; left: 0; width: 2px; background: var(--accent-60); z-index: 1000; pointer-events: none; display: none;";var e6=document.createElement("div");e6.className="ls-timeline-scroll-container";var e7=document.createElement("div");e7.className="ls-timeline-spacer";e7.style.cssText="height: 1px; width: 0px;";var e8=document.createElement("div");e8.className="ls-timeline-rows";e6.append(e7,e8);e0.append(e1,e2,e3,e4,e5,e6);var __rootValue=e0;return{"markerContainer":e1,"playerHead":e2,"selectionRect":e3,"snapLine":e4,"sliceLine":e5,"scrollContainer":e6,"spacerElement":e7,"rowContainer":e8,root:__rootValue};}

    LS.LoadComponent(class Timeline extends LS.Component {
        // --- Player state values (does influence content) ---
        #seek = 0;
        #duration = 0;

        // --- Camera state values (do not influence content) ---
        #offset = 0;
        #zoom = 1;
        #rowHeight = 30;

        // --- UI state ---
        #tool = "select";

        /**
         * Timeline component options configuration
         * @property {HTMLElement|null} element - The DOM element to attach the timeline to
         * @property {number|"auto"} chunkSize - Size of chunks for virtual scrolling. "auto" adjusts based on item count
         * @property {number} reservedRows - Number of rows to pre-allocate
         * @property {number} zoom - Initial zoom level (pixels per time unit)
         * @property {number} offset - Initial horizontal scroll offset in pixels
         * @property {number|"auto"} minZoom - Minimum allowed zoom level. "auto" fits content to viewport width
         * @property {number} maxZoom - Maximum allowed zoom level
         * @property {number} markerSpacing - Minimum spacing between time markers in pixels
         * @property {"time"|"number"|Function} markerMetric - Format for time markers. "time" shows HH:MM:SS, "number" shows raw values, or custom function(time, step)
         * @property {boolean} resizable - Enable resizing of timeline items
         * @property {boolean} autoAppendRows - Automatically add new rows when items are dropped on the last row
         */
        constructor(options = {}) {
            super({
                dependencies: ["Menu"]
            });

            this.options = LS.Util.defaults(DEFAULTS, options);
            if (options.toolShortcuts && typeof options.toolShortcuts === "object" && !Array.isArray(options.toolShortcuts)) {
                // TODO: Use the new defaults API
                this.options.toolShortcuts = {
                    ...DEFAULTS.toolShortcuts,
                    ...options.toolShortcuts
                };
            }

            const element = TEMPLATE();

            this.tool = this.options.tool;

            this.container = element.root;
            this.scrollContainer = element.scrollContainer;
            this.rowContainer = element.rowContainer;
            this.spacerElement = element.spacerElement;
            this.markerContainer = element.markerContainer;
            this.playerHead = element.playerHead;
            this.selectionRect = element.selectionRect;
            this.snapLine = element.snapLine;
            this.sliceLine = element.sliceLine;

            if (this.options.element) {
                this.options.element.appendChild(this.container);
            }

            this.container.classList.add("ls-timeline");
            this.container.__lsComponent = this;

            this.items = [];
            this.itemMap = new Map();

            this.rowElements = [];

            this.markerPool = [];
            this.activeMarkers = [];

            this.selectedItems = new Set();
            this.__previewItem = null;

            this.__rendered = new Set();
            this.__needsSort = false;
            this.maxDuration = 0;
            this.__spacerWidth = 0;

            this.frameScheduler = new LS.Util.FrameScheduler(() => this.#render());
            if(this.options.framerateLimit > 0) this.frameScheduler.limitFPS(this.options.framerateLimit);
            this.reserveRows(this.options.reservedRows);

            // Mouse/touch drag
            // TODO: Should not block scrolling on mobile
            let dragType = null, rect = null;
            let selectStartWorldX = 0, selectStartWorldY = 0, lastCursorY = 0;
            
            // Inertia & Edge Scroll state
            let velocityX = 0, lastMoveTime = 0, inertiaRaf = null;
            let edgeScrollSpeedX = 0, edgeScrollSpeedY = 0, edgeScrollRaf = null, lastCursorX = 0, lastClientX = 0, lastClientY = 0;

            const stopInertia = () => {
                if (inertiaRaf) cancelAnimationFrame(inertiaRaf);
                inertiaRaf = null;
            };

            const stopEdgeScroll = () => {
                if (edgeScrollRaf) cancelAnimationFrame(edgeScrollRaf);
                edgeScrollRaf = null;
                edgeScrollSpeedX = 0;
                edgeScrollSpeedY = 0;
            };

            const getRowIndexAtClientY = (clientY) => {
                if (!this.rowElements.length) return 0;

                for (let i = 0; i < this.rowElements.length; i++) {
                    const rect = this.rowElements[i].getBoundingClientRect();
                    if (clientY >= rect.top && clientY <= rect.bottom) {
                        return i;
                    }
                }

                const firstRect = this.rowElements[0].getBoundingClientRect();
                const lastRect = this.rowElements[this.rowElements.length - 1].getBoundingClientRect();
                if (clientY < firstRect.top) return 0;
                if (clientY > lastRect.bottom) return this.rowElements.length - 1;
                return 0;
            };

            const getRowSpanBounds = (startRow, endRow) => {
                if (!this.rowElements.length) return null;

                const minRow = Math.min(startRow, endRow);
                const maxRow = Math.max(startRow, endRow);
                const startEl = this.rowElements[minRow];
                const endEl = this.rowElements[maxRow];

                if (startEl && endEl) {
                    const startRect = startEl.getBoundingClientRect();
                    const endRect = endEl.getBoundingClientRect();
                    return { top: startRect.top, bottom: endRect.bottom };
                }

                const containerRect = this.rowContainer.getBoundingClientRect();
                const rowHeight = this.rowElements[0]?.offsetHeight || this.rowHeight || 30;
                const top = containerRect.top + (minRow * rowHeight);
                const bottom = containerRect.top + ((maxRow + 1) * rowHeight);
                return { top, bottom };
            };

            const updateSelectionBox = (x, y) => {
                const currentX = x;
                const currentY = y;

                const scrollLeft = this.offset;
                const scrollTop = this.scrollContainer.scrollTop;

                const startScreenX = selectStartWorldX - scrollLeft;
                const startScreenY = selectStartWorldY - scrollTop;

                const left = Math.min(startScreenX, currentX);
                const width = Math.abs(currentX - startScreenX);

                const rowRect = this.rowContainer.getBoundingClientRect();
                const containerRect = this.container.getBoundingClientRect();
                const relativeRowTop = rowRect.top - containerRect.top;
                const rowHeight = this.rowElements.length > 0 ? this.rowElements[0].offsetHeight : this.rowHeight || 30;
                if(rowHeight <= 0) return;

                const maxRowIndex = Math.max(0, this.rowElements.length - 1);
                let startRow = Math.floor((startScreenY - relativeRowTop) / rowHeight);
                let endRow = Math.floor((currentY - relativeRowTop) / rowHeight);

                if (startRow < 0) startRow = 0;
                else if (startRow > maxRowIndex) startRow = maxRowIndex;

                if (endRow < 0) endRow = 0;
                else if (endRow > maxRowIndex) endRow = maxRowIndex;

                const rowStart = Math.min(startRow, endRow);
                const rowEnd = Math.max(startRow, endRow);
                const top = relativeRowTop + (rowStart * rowHeight);
                const height = ((rowEnd - rowStart) + 1) * rowHeight;

                this.selectionRect.style.transform = `translate3d(${left}px, ${top}px, 0)`;
                this.selectionRect.style.width = `${width}px`;
                this.selectionRect.style.height = `${height}px`;

                const worldLeft = left + scrollLeft;
                const worldRight = worldLeft + width;

                const timeStart = worldLeft / this.#zoom;
                const timeEnd = worldRight / this.#zoom;

                const candidates = this.getRange(timeStart, timeEnd, false);

                this.selectedItems.clear();

                for(const item of candidates) {
                    if (item.row >= rowStart && item.row <= rowEnd) {
                        const itemEnd = item.start + item.duration;
                        if (itemEnd > timeStart && item.start < timeEnd) {
                            this.selectedItems.add(item);
                        }
                    }
                }

                this.frameScheduler.schedule();
            };

            const processEdgeScroll = () => {
                if (edgeScrollSpeedX !== 0 || edgeScrollSpeedY !== 0) {
                    this.offset += edgeScrollSpeedX;
                    this.scrollContainer.scrollTop += edgeScrollSpeedY;

                    // Update seek position based on the last known cursor position relative to the moving viewport
                    if (dragType === "seek" || dragType === "preview") {
                        const worldX = lastCursorX + this.offset;
                        this.setSeek(worldX / this.#zoom);
                    } else if (dragType === "slice" || dragType === "slice-delete") {
                        updateSliceLine(lastClientX, lastClientY);
                    } else if (dragType === "resize") {
                        updateResizePosition(lastClientX);
                    } else if (dragType === "erase" || dragType === "delete") {
                        performToolAlongPath(lastClientX, lastClientY, performEraseAtPointer);
                    } else if (dragType === "select") {
                        updateSelectionBox(lastCursorX, lastCursorY);
                    } else if (dragState.draggingItems) {
                        const rect = this.container.getBoundingClientRect();
                        updateDragItemPosition(lastCursorX + rect.left, lastCursorY + rect.top);
                    }
                    edgeScrollRaf = this.requestAnimationFrame(processEdgeScroll);
                } else {
                    stopEdgeScroll();
                }
            };

            const processInertia = () => {
                if (Math.abs(velocityX) > 0.5) {
                    this.offset -= velocityX;
                    velocityX *= 0.92; // Friction
                    inertiaRaf = this.requestAnimationFrame(processInertia);
                } else {
                    stopInertia();
                }
            };

            const DRAG_ACTIVATION_DISTANCE = 6;
            const ITEM_DRAG_ACTIVATION_DISTANCE = 4;

            const dragState = {};
            this.__dragSnapModifiers = null;

            const updateSnapModifiers = (domEvent) => {
                const shiftKey = !!(domEvent && domEvent.shiftKey);
                const altKey = !!(domEvent && domEvent.altKey);

                if (!shiftKey) dragState.consumedSnapShift = false;
                if (!altKey) dragState.consumedSnapAlt = false;

                dragState.snapModifierShift = shiftKey && !dragState.consumedSnapShift;
                dragState.snapModifierAlt = altKey && !dragState.consumedSnapAlt;
            };

            const resetSnapModifiers = () => {
                dragState.consumedSnapShift = false;
                dragState.consumedSnapAlt = false;
                dragState.snapModifierShift = false;
                dragState.snapModifierAlt = false;
            };

            const getGridSnapStep = (modifiers = null) => this.#getGridSnapStep(modifiers);
            const snapTimeToGrid = (time, modifiers = null) => this.#snapTimeToGrid(time, modifiers);
            const snapClientXToGrid = (clientX, modifiers = null) => this.#snapClientXToGrid(clientX, modifiers);

            this.__getGridSnapStep = getGridSnapStep;

            this.__modifierKeyHandler = (event) => {
                if (event.key !== "Shift" && event.key !== "Alt") return;

                if (dragType === "slice" || dragType === "slice-delete" || dragType === "resize" || dragState.draggingItems || dragState.resizingItems || dragState.pendingItemDrag) {
                    updateSnapModifiers(event);
                    this.__dragSnapModifiers = dragState;
                } else if (this.__dragSnapModifiers) {
                    this.__dragSnapModifiers = null;
                }

                this.frameScheduler.schedule();
            };

            this.__modifierBlurHandler = () => {
                if (dragType || dragState.draggingItems || dragState.resizingItems) return;
                if (!this.__dragSnapModifiers) return;

                this.__dragSnapModifiers = null;
                this.frameScheduler.schedule();
            };

            document.addEventListener("keydown", this.__modifierKeyHandler);
            document.addEventListener("keyup", this.__modifierKeyHandler);
            window.addEventListener("blur", this.__modifierBlurHandler);

            const getItemFromElement = (itemElement) => {
                if (!itemElement) return null;
                return itemElement.__timelineItem
                    || this.items.find((item) => item.timelineElement === itemElement || item.element === itemElement)
                    || null;
            };

            const setPreviewItem = (item) => {
                if (this.__previewItem === item) return;

                if (this.__previewItem) {
                    const prevElement = this.__previewItem.timelineElement;
                    if (prevElement) prevElement.classList.remove("previewed");
                    this.quickEmit("preview-stop", this.__previewItem);
                }

                this.__previewItem = item;

                if (item) {
                    const nextElement = item.timelineElement;
                    if (nextElement) nextElement.classList.add("previewed");
                    this.container.classList.add("preview-focus");
                    this.quickEmit("preview-start", item);
                } else {
                    this.container.classList.remove("preview-focus");
                }
            };

            this.__setPreviewItem = setPreviewItem;

            const buildItemSnapValues = (excludedItems, width = 0, dragOffset = 0, includeWidthOffsets = false) => {
                const excluded = new Set(excludedItems);
                const snapValues = [];
                const vh = window.innerHeight;
                const vw = window.innerWidth;

                for (const item of this.items) {
                    if (excluded.has(item)) continue;

                    const element = item.timelineElement;
                    if (!element) continue;

                    const box = element.getBoundingClientRect();

                    // Skip invisible or off-screen elements
                    if (box.width === 0 && box.height === 0) continue;
                    if (box.bottom < -50 || box.top > vh + 50 || box.right < -50 || box.left > vw + 50) continue;

                    if (includeWidthOffsets) {
                        snapValues.push(
                            { dest: box.left + dragOffset, line: box.left },
                            { dest: box.right + dragOffset, line: box.right },
                            { dest: (box.left - width) + dragOffset, line: box.left },
                            { dest: (box.right - width) + dragOffset, line: box.right }
                        );
                    } else {
                        snapValues.push(
                            { dest: box.left, line: box.left },
                            { dest: box.right, line: box.right }
                        );
                    }
                }

                return snapValues;
            };

            const applyItemSnap = (x, snapValues) => {
                const snapArea = 10;

                if (Array.isArray(snapValues)) {
                    for (const snap of snapValues) {
                        if (snap.dest - x > -snapArea && snap.dest - x < snapArea) {
                            return { x: snap.dest, line: snap.line, snapped: true };
                        }
                    }
                }

                return { x, line: null, snapped: false };
            };

            const shouldUseItemSnap = (state) => this.options.snapEnabled
                && !state.disableSnapping
                && !state.snapModifierAlt
                && !state.snapModifierShift
                && !state.altKey
                && !state.shiftKey;

            const updateSnapLineForEntries = (snapLineX, entries) => {
                if (!this.snapLine || snapLineX === null) return false;

                let minRow = Infinity;
                let maxRow = -Infinity;

                for (const entry of entries) {
                    const row = entry.item.row || 0;
                    if (row < minRow) minRow = row;
                    if (row > maxRow) maxRow = row;
                }

                if (!Number.isFinite(minRow) || !Number.isFinite(maxRow)) return false;

                const bounds = getRowSpanBounds(minRow, maxRow);
                if (!bounds) return false;

                this.snapLine.style.transform = `translate3d(${snapLineX}px, ${bounds.top}px, 0)`;
                this.snapLine.style.height = `${Math.max(0, bounds.bottom - bounds.top)}px`;
                this.snapLine.style.display = "block";
                return true;
            };

            const hideSnapLine = () => {
                if (this.snapLine) this.snapLine.style.display = "none";
            };

            const updateSliceLine = (clientX, clientY) => {
                if (!this.sliceLine) return;

                if (dragState.sliceDeleteShorter) {
                    this.sliceLine.setAttribute("ls-accent", "red");
                } else {
                    this.sliceLine.removeAttribute("ls-accent");
                }

                const x = snapClientXToGrid(clientX, dragState);
                const startRow = Number.isFinite(dragState.sliceStartRow)
                    ? dragState.sliceStartRow
                    : getRowIndexAtClientY(clientY);
                const currentRow = getRowIndexAtClientY(clientY);
                const bounds = getRowSpanBounds(startRow, currentRow);

                if (!bounds) return;

                this.sliceLine.style.transform = `translate3d(${x}px, ${bounds.top}px, 0)`;
                this.sliceLine.style.height = `${Math.max(0, bounds.bottom - bounds.top)}px`;
                this.sliceLine.style.display = "block";

                dragState.sliceClientX = x;
                dragState.sliceStartRow = startRow;
                dragState.sliceCurrentRow = currentRow;
            };

            const getItemsAtPointer = (clientX, clientY, includeEdges = false) => {
                const { time, row } = this.transformCoords(clientX, clientY);
                const candidates = this.getIntersectingAt(time);
                const items = [];

                for (const item of candidates) {
                    if ((item.row || 0) !== row) continue;

                    if (!includeEdges && (
                        time <= item.start + SLICE_EPSILON ||
                        time >= item.start + item.duration - SLICE_EPSILON
                    )) {
                        continue;
                    }

                    items.push(item);
                }

                return { time, row, items };
            };

            const performSliceAtLine = (clientX, startRow, endRow, deleteShorter = false) => {
                const clampedX = snapClientXToGrid(clientX, dragState);
                const rowRect = this.rowContainer.getBoundingClientRect();
                const time = snapTimeToGrid((clampedX - rowRect.left + this.#offset) / this.#zoom, dragState);
                const rowMin = Math.min(startRow, endRow);
                const rowMax = Math.max(startRow, endRow);
                const candidates = this.getIntersectingAt(time);
                const slicedItems = new Set();
                const changes = deleteShorter ? [] : null;

                for (const item of candidates) {
                    const itemRow = item.row || 0;
                    if (itemRow < rowMin || itemRow > rowMax) continue;
                    if (
                        time <= item.start + SLICE_EPSILON ||
                        time >= item.start + item.duration - SLICE_EPSILON
                    ) {
                        continue;
                    }
                    if (slicedItems.has(item)) continue;

                    if (deleteShorter) {
                        const start = item.start;
                        const duration = item.duration;
                        const end = start + duration;
                        const leftDuration = time - start;
                        const rightDuration = end - time;

                        if (leftDuration >= rightDuration) {
                            item.duration = normalizeSnappedTime(leftDuration);
                        } else {
                            item.start = normalizeSnappedTime(time);
                            item.duration = normalizeSnappedTime(rightDuration);
                        }

                        changes.push({
                            id: item.id,
                            before: { start, duration },
                            after: { start: item.start, duration: item.duration }
                        });

                        slicedItems.add(item);
                        continue;
                    }

                    const newItem = this.cut(item, time);
                    if (newItem) {
                        slicedItems.add(item);
                        slicedItems.add(newItem);
                    }
                }

                if (deleteShorter && changes.length > 0) {
                    this.__needsSort = true;
                    this.emitAction({
                        type: "slice-delete",
                        changes
                    });
                    this.frameScheduler.schedule();
                }
            };

            const performEraseAtPointer = (clientX, clientY) => {
                const { items } = getItemsAtPointer(clientX, clientY, true);
                const erasedItems = dragState.erasedItems || (dragState.erasedItems = new Set());
                const erasedActionItems = dragState.erasedActionItems || (dragState.erasedActionItems = []);

                for (const item of items) {
                    if (erasedItems.has(item)) continue;

                    erasedItems.add(item);
                    erasedActionItems.push({
                        id: item.id,
                        data: this.cloneItem(item)
                    });

                    this.destroyItem(item);
                }
            };

            const performToolAlongPath = (clientX, clientY, action) => {
                const startX = Number.isFinite(dragState.lastToolClientX) ? dragState.lastToolClientX : clientX;
                const startY = Number.isFinite(dragState.lastToolClientY) ? dragState.lastToolClientY : clientY;
                const distance = Math.hypot(clientX - startX, clientY - startY);
                const steps = Math.min(64, Math.max(1, Math.ceil(distance / 12)));

                for (let i = 1; i <= steps; i++) {
                    const ratio = i / steps;
                    action(
                        startX + ((clientX - startX) * ratio),
                        startY + ((clientY - startY) * ratio)
                    );
                }

                dragState.lastToolClientX = clientX;
                dragState.lastToolClientY = clientY;
            };

            const beginItemDrag = (event) => {
                dragState.pendingItemDrag = false;
                dragState.draggingItems = true;
                updateSnapModifiers(event.domEvent);
                this.__dragSnapModifiers = dragState;

                let itemsToMove = Array.isArray(dragState.baseItemsToMove)
                    ? dragState.baseItemsToMove.slice()
                    : [];

                if (!itemsToMove.length && dragState.item) {
                    itemsToMove = [dragState.item];
                }

                if (this.options.snapEnabled) {
                    const cw = dragState.item.duration * this.#zoom;
                    const itemRect = dragState.itemElement.getBoundingClientRect();
                    const dragOffset = event.x - itemRect.left;

                    dragState.dragOffsetY = event.y - itemRect.top;
                    dragState.itemHeight = itemRect.height;
                    dragState.snapValues = buildItemSnapValues(itemsToMove, cw, dragOffset, true);
                } else {
                    dragState.snapValues = [];
                }

                if (dragState.isCloning) {
                    const clonedItems = [];
                    const cloneMap = new Map();
                    const idMap = new Map(); // Maps old item IDs to new item IDs

                    for (const itm of itemsToMove) {
                        const cloned = this.cloneItem(itm);
                        cloned.start = itm.start;
                        cloned.row = itm.row || 0;
                        this.add(cloned);
                        clonedItems.push(cloned);
                        cloneMap.set(itm, cloned);
                        idMap.set(itm.id, cloned.id);
                    }

                    // Remap automation targets if enabled
                    if (this.options.remapAutomationTargets) {
                        this.remapAutomationTargets(clonedItems, idMap);
                    }

                    // Update dragState to use cloned items
                    dragState.clonedItems = clonedItems;
                    itemsToMove = clonedItems;

                    // Update selection to cloned items
                    this.selectedItems.clear();
                    for (const cloned of clonedItems) {
                        this.selectedItems.add(cloned);
                    }

                    // Update drag target
                    if (cloneMap.has(dragState.item)) {
                        dragState.item = cloneMap.get(dragState.item);
                        dragState.itemElement = dragState.item.timelineElement;
                    }
                }

                dragState._initialPositions = itemsToMove.map((itm) => ({
                    item: itm,
                    start: itm.start,
                    row: itm.row || 0
                }));

                dragState.itemsToMove = itemsToMove;

                let minStart = Infinity;
                for (const entry of itemsToMove) {
                    if (entry.start < minStart) minStart = entry.start;
                }
                dragState.gridSnapAnchorStart = Number.isFinite(minStart) ? minStart : 0;
            };

            const updateDragItemPosition = (x, y) => {
                let snapLineX = null;
                let snapped = false;
                const gridStep = getGridSnapStep(dragState);
                const allowItemSnap = shouldUseItemSnap(dragState);

                if (allowItemSnap) {
                    const snap = applyItemSnap(x, dragState.snapValues);
                    if (snap.snapped) {
                        x = snap.x;
                        snapLineX = snap.line;
                        snapped = true;
                    }
                } else {
                    hideSnapLine();
                }

                const rect = this.container.getBoundingClientRect();
                const currentWorldX = (x - rect.left) + this.offset;
                const currentWorldY = (y - rect.top) + this.scrollContainer.scrollTop;

                const deltaWorldX = currentWorldX - dragState.startWorldX;
                const deltaWorldY = currentWorldY - dragState.startWorldY;

                let deltaTime = deltaWorldX / this.#zoom;
                if (!snapped && gridStep > 0 && Number.isFinite(dragState.gridSnapAnchorStart)) {
                    let targetStart = dragState.gridSnapAnchorStart + deltaTime;
                    if (targetStart < 0) targetStart = 0;
                    deltaTime = snapTimeToStep(targetStart, gridStep) - dragState.gridSnapAnchorStart;
                }
                const rowOffset = Math.round(deltaWorldY / this.rowHeight);

                // Prevent items from collapsing when dragged past edges
                // Find the minimum start time that would result from this drag
                let minResultStart = Infinity;
                for (const entry of dragState._initialPositions) {
                    const newStart = entry.start + deltaTime;
                    if (newStart < minResultStart) minResultStart = newStart;
                }
                
                // If any item would go negative, clamp the deltaTime to keep all items at or above 0
                if (minResultStart < 0) {
                    deltaTime -= minResultStart; // Adjust deltaTime to keep the leftmost item at 0
                }

                let minResultRow = Infinity;
                for (const entry of dragState._initialPositions) {
                    const newRow = entry.row + rowOffset;
                    if (newRow < minResultRow) minResultRow = newRow;
                }
                
                const clampedRowOffset = minResultRow < 0 ? rowOffset - minResultRow : rowOffset;

                // Apply the clamped deltas to all items
                for (const entry of dragState._initialPositions) {
                    entry.item.start = normalizeSnappedTime(entry.start + deltaTime);
                    entry.item.row = entry.row + clampedRowOffset;
                }

                if (snapped && snapLineX !== null) {
                    if (!updateSnapLineForEntries(snapLineX, dragState._initialPositions)) {
                        hideSnapLine();
                    }
                } else {
                    hideSnapLine();
                }

                this.__needsSort = true;
                this.frameScheduler.schedule();
            };

            const beginResizeDrag = (event, resizeHandle, itemElement, item) => {
                const side = resizeHandle.classList.contains("ls-left") ? "left" : "right";

                if (!this.selectedItems.has(item)) {
                    this.select(item);
                } else {
                    this.focusedItem = item;
                }

                const itemsToResize = this.selectedItems.size && this.selectedItems.has(item)
                    ? Array.from(this.selectedItems)
                    : [item];

                const itemRect = itemElement.getBoundingClientRect();
                const initialEdgeClientX = side === "left" ? itemRect.left : itemRect.right;

                dragType = "resize";
                dragState.pendingItemDrag = false;
                dragState.draggingItems = false;
                dragState.resizingItems = true;
                dragState.resizeSide = side;
                dragState.resizeItem = item;
                dragState.resizeItemElement = itemElement;
                dragState.resizePointerOffsetX = event.x - initialEdgeClientX;
                dragState.resizeInitialEdgeTime = side === "left" ? item.start : item.start + item.duration;
                dragState.resizeInitialPositions = itemsToResize.map((itm) => ({
                    item: itm,
                    start: itm.start,
                    duration: itm.duration,
                    row: itm.row || 0
                }));
                dragState.resizeItems = itemsToResize;
                updateSnapModifiers(event.domEvent);
                dragState.snapValues = this.options.snapEnabled ? buildItemSnapValues(itemsToResize) : [];
                this.__dragSnapModifiers = dragState;

                this.dragHandle.options.pointerLock = false;
                this.dragHandle.options.disablePointerEvents = false;
                this.dragHandle.cursor = side === "left" ? "w-resize" : "e-resize";

                LS.Tooltips.set(this.formatMarker(item.duration)).position(itemElement).show();
                this.quickEmit("drag-start", dragType);
            };

            const updateResizePosition = (clientX) => {
                const entries = dragState.resizeInitialPositions;
                if (!entries || entries.length === 0) return;

                let edgeClientX = clientX - (dragState.resizePointerOffsetX || 0);
                let snapLineX = null;
                let snapped = false;

                if (shouldUseItemSnap(dragState)) {
                    const snap = applyItemSnap(edgeClientX, dragState.snapValues);
                    if (snap.snapped) {
                        edgeClientX = snap.x;
                        snapLineX = snap.line;
                        snapped = true;
                    }
                } else {
                    hideSnapLine();
                }

                const rowRect = this.rowContainer.getBoundingClientRect();
                let edgeTime = (edgeClientX - rowRect.left + this.#offset) / this.#zoom;

                if (snapped) {
                    edgeTime = Math.max(0, edgeTime);
                } else {
                    edgeTime = snapTimeToGrid(Math.max(0, edgeTime), dragState);
                }

                let deltaTime = edgeTime - dragState.resizeInitialEdgeTime;
                const minDuration = this.#zoom > 0 ? MIN_ITEM_PIXEL_WIDTH / this.#zoom : 0;
                const side = dragState.resizeSide;

                if (side === "left") {
                    let minDelta = -Infinity;
                    let maxDelta = Infinity;

                    for (const entry of entries) {
                        const minAllowed = -entry.start;
                        const maxAllowed = entry.duration - minDuration;
                        if (minAllowed > minDelta) minDelta = minAllowed;
                        if (maxAllowed < maxDelta) maxDelta = maxAllowed;
                    }

                    deltaTime = clamp(deltaTime, minDelta, maxDelta);

                    for (const entry of entries) {
                        entry.item.start = normalizeSnappedTime(entry.start + deltaTime);
                        entry.item.duration = normalizeSnappedTime(entry.duration - deltaTime);
                    }
                } else {
                    let minDelta = -Infinity;

                    for (const entry of entries) {
                        const minAllowed = minDuration - entry.duration;
                        if (minAllowed > minDelta) minDelta = minAllowed;
                    }

                    if (deltaTime < minDelta) deltaTime = minDelta;

                    for (const entry of entries) {
                        entry.item.duration = normalizeSnappedTime(entry.duration + deltaTime);
                    }
                }

                if (snapped && snapLineX !== null) {
                    if (!updateSnapLineForEntries(snapLineX, entries)) {
                        hideSnapLine();
                    }
                } else {
                    hideSnapLine();
                }

                const resizeItem = dragState.resizeItem;
                if (resizeItem && resizeItem.timelineElement) {
                    LS.Tooltips.set(this.formatMarker(resizeItem.duration)).position(resizeItem.timelineElement).show();
                }

                this.__needsSort = true;
                this.frameScheduler.schedule();
            };

            // If you are asking why in the hell is this in a microtask, it's because for some unknown reason, accessing (not even actually reading, just referencing) *any* private property *anywhere* causes *every* private field to suddenly require being at the top of the class, otherwise it throws.
            // If I understand it right, fixing this would require restructuring the entire component to have every private property at the top, which would nerf any kind of readability.
            queueMicrotask(() => {
                this.dragHandle = new LS.Util.TouchHandle(this.container, {
                    exclude: ".ls-automation-point-handle, .ls-automation-center-handle, .ls-automation-graph",
                    frameTimed: true,
    
                    onStart: (event) => {

                        stopInertia();
                        stopEdgeScroll();

                        resetSnapModifiers();
                        dragState.sliceDeleteShorter = false;

                        const domEvent = event.domEvent;
                        const target = domEvent.target;
                        const touchEvent = domEvent.type.startsWith("touch");
                        const primaryButton = touchEvent || domEvent.button === 0;
                        const rightButton = !touchEvent && domEvent.button === 2;
                        const resizeHandle = target.closest(".ls-resize-handle");

                        if (resizeHandle) {
                            if (!primaryButton) return;

                            const itemElement = resizeHandle.closest(".ls-timeline-item");
                            const item = getItemFromElement(itemElement);
                            if (!item) return;

                            rect = this.container.getBoundingClientRect();
                            lastClientX = event.x;
                            lastClientY = event.y;
                            lastCursorX = event.x - rect.left;
                            lastCursorY = event.y - rect.top;

                            beginResizeDrag(event, resizeHandle, itemElement, item);
                            return;
                        }
    
                        // --- One item selection logic
                        if (target.closest(".ls-automation-point-handle, .ls-automation-center-handle")) {
                            return;
                        }
    
                        const selectionModifiers = domEvent.ctrlKey || domEvent.metaKey;
                        const additiveSelectionModifiers = selectionModifiers || domEvent.shiftKey;
                        const itemElement = target.closest(".ls-timeline-item");
    
                        if (itemElement) {
                            const item = getItemFromElement(itemElement);
                            if (!item) return;
    
                            if (selectionModifiers) {
                                if (this.selectedItems.has(item)) {
                                    this.selectedItems.delete(item);
                                } else {
                                    this.selectedItems.add(item);
                                }
                                this.focusedItem = item;
                                this.quickEmit("item-select", item);
                                this.frameScheduler.schedule();
                                return;
                            }

                            if (!this.selectedItems.has(item)) {
                                this.select(item);
                            } else {
                                this.focusedItem = item;
                            }
                        } else {
                            if (!additiveSelectionModifiers) this.deselectAll();
                        }
                        // ---
    
                        this.dragHandle.options.pointerLock = false;
    
                        rect = this.container.getBoundingClientRect();
                        const activeTool = this.tool;
                        const sliceDeleteGesture = rightButton && activeTool === "slice";
                        const sliceGesture = primaryButton && (domEvent.altKey || activeTool === "slice");
                        const eraseGesture = primaryButton && activeTool === "erase" && !domEvent.altKey;
                        const previewGesture = primaryButton && activeTool === "preview" && !domEvent.altKey;
                        const rightPreviewGesture = rightButton && domEvent.altKey && !sliceDeleteGesture;
                        lastClientX = event.x;
                        lastClientY = event.y;
                        lastCursorX = event.x - rect.left;
                        lastCursorY = event.y - rect.top;
                        dragState.pointerDownX = event.x;
                        dragState.pointerDownY = event.y;
                        dragState.pointerMoved = false;
                        dragState.erasedItems = null;
                        dragState.erasedActionItems = null;
                        dragState.lastToolClientX = event.x;
                        dragState.lastToolClientY = event.y;
                        this.dragHandle.options.disablePointerEvents = rightButton ? false : !(
                            primaryButton
                            && itemElement
                            && (activeTool === "select" || activeTool === "move" || selectionModifiers)
                            && !sliceGesture
                            && !eraseGesture
                            && !previewGesture
                        );
    
                        this.dragHandle.cursor = "var(--ls-timeline-cursor-move)";
    
                        if (rightPreviewGesture) {
                            dragType = "preview-item";
                            dragState.draggingItems = false;
                            this.__suppressContextMenuUntil = performance.now() + 500;
                            this.dragHandle.cursor = "var(--ls-timeline-cursor-preview)";
                            setPreviewItem(getItemFromElement(itemElement));
                            this.quickEmit("drag-start", dragType);
                            return;
                        }
    
                        if (sliceDeleteGesture) {
                            dragType = "slice-delete";
                            dragState.draggingItems = false;
                            dragState.sliceDeleteShorter = true;
                            updateSnapModifiers(domEvent);
                            this.__dragSnapModifiers = dragState;
                            dragState.sliceStartRow = getRowIndexAtClientY(event.y);
                            dragState.sliceCurrentRow = dragState.sliceStartRow;
                            dragState.sliceStartClientX = event.x;
                            this.__suppressContextMenuUntil = performance.now() + 500;
                            this.contextMenu.close();
                            this.itemContextMenu.close();
                            this.dragHandle.cursor = "var(--ls-timeline-cursor-slice)";
                            updateSliceLine(event.x, event.y);
                            this.quickEmit("drag-start", dragType);
                            return;
                        }
    
                        if (rightButton) {
                            dragType = "delete-pending";
                            dragState.draggingItems = false;
                            dragState.deleteStartX = event.x;
                            dragState.deleteStartY = event.y;
                            dragState.deleteActivated = false;
                            return;
                        }
    
                        if (sliceGesture) {
                            dragType = "slice";
                            dragState.draggingItems = false;
                            dragState.sliceDeleteShorter = false;
                            dragState.consumedSnapAlt = domEvent.altKey && activeTool !== "slice";
                            updateSnapModifiers(domEvent);
                            this.__dragSnapModifiers = dragState;
                            dragState.sliceStartRow = getRowIndexAtClientY(event.y);
                            dragState.sliceCurrentRow = dragState.sliceStartRow;
                            dragState.sliceStartClientX = event.x;
                            this.dragHandle.cursor = "var(--ls-timeline-cursor-slice)";
                            updateSliceLine(event.x, event.y);
                            this.quickEmit("drag-start", dragType);
                            return;
                        }
    
                        if (eraseGesture) {
                            dragType = "erase-pending";
                            dragState.draggingItems = false;
                            dragState.eraseStartX = event.x;
                            dragState.eraseStartY = event.y;
                            dragState.erasedItems = null;
                            dragState.erasedActionItems = null;
                            this.dragHandle.cursor = "var(--ls-timeline-cursor-erase)";
                            return;
                        }
    
                        if (previewGesture) {
                            dragType = "preview";
                            dragState.draggingItems = false;
                            this.dragHandle.cursor = "var(--ls-timeline-cursor-preview)";
                            setPreviewItem(getItemFromElement(itemElement));
                            this.setSeek(((event.x - rect.left) + this.offset) / this.#zoom);
                            this.quickEmit("drag-start", dragType);
                            return;
                        }
    
                        // Prepare for dragging items, if that is what we're doing
                        if(itemElement && (activeTool === "select" || activeTool === "move")) {
                            const item = getItemFromElement(itemElement);
                            if (!item) {
                                dragState.draggingItems = false;
                            } else {
                                // Dragging an item (activate after a small threshold)
                                dragState.draggingItems = false;
                                dragState.pendingItemDrag = true;
                                dragState.itemElement = itemElement;
                                dragState.item = item;
                                dragState.startX = event.x;
                                dragState.startY = event.y;
                                dragState.startWorldX = (event.x - rect.left) + this.offset;
                                dragState.startWorldY = (event.y - rect.top) + this.scrollContainer.scrollTop;
                                dragState.disableSnapping = false;
                                dragState.isCloning = event.domEvent.shiftKey; // Shift+drag to clone
                                dragState.consumedSnapShift = dragState.isCloning;
                                updateSnapModifiers(event.domEvent);
                                dragState.itemDragStartX = event.x;
                                dragState.itemDragStartY = event.y;
                                dragState.baseItemsToMove = this.selectedItems.size && this.selectedItems.has(item)
                                    ? Array.from(this.selectedItems)
                                    : [item];
                                dragState._initialPositions = null;
                                dragState.gridSnapAnchorStart = null;
                                return;
                            }
                        } else {
                            dragState.draggingItems = false;
                            dragState.pendingItemDrag = false;
                        }
    
                        const button = touchEvent? ((event.domEvent.target === this.scrollContainer || this.scrollContainer.contains(event.domEvent.target)) ? 1 : 0) : event.domEvent.button;
    
                        if (additiveSelectionModifiers && button === 0) {
                            dragType = "select";
                        } else if (event.domEvent.ctrlKey && button === 1) {
                            dragType = "zoom-v";
                            this.dragHandle.options.pointerLock = true;
                        } else {
                            dragType = button === 0 ? "seek" : button === 1 ? "pan" : button === 2 ? "delete" : null;
                        }
    
                        if (!dragType) {
                            event.cancel();
                            return;
                        }
    
                        rect = this.container.getBoundingClientRect();
                        
                        // Capture world coordinates for selection to handle scrolling
                        selectStartWorldX = (event.x - rect.left) + this.offset;
                        selectStartWorldY = (event.y - rect.top) + this.scrollContainer.scrollTop;
    
                        velocityX = 0;
                        lastMoveTime = performance.now();
    
                        if (dragType === "select") {
                            this.selectionRect.style.display = "block";
                            this.selectionRect.style.transform = `translate3d(${lastCursorX}px, ${lastCursorY}px, 0)`;
                            this.selectionRect.style.width = "0px";
                            this.selectionRect.style.height = "0px";
                            this.dragHandle.cursor = "crosshair";
    
                            if(!event.domEvent.shiftKey) {
                                this.selectedItems.clear();
                                this.frameScheduler.schedule();
                            }
                        } else {
                            this.dragHandle.cursor = dragType === "pan" ? "grabbing" : dragType === "seek" ? "ew-resize" : dragType === "zoom-v" ? "none" : "no-drop";
                            if (dragType === "seek") {
                                this.deselectAll();
                            }
                        }
    
                        this.quickEmit("drag-start", dragType);
                    },
    
                    onMove: (event) => {
                        const rect = this.container.getBoundingClientRect();
                        const cursorX = event.x - rect.left;
                        const cursorY = event.y - rect.top;
                        lastCursorX = cursorX;
                        lastCursorY = cursorY;
                        lastClientX = event.x;
                        lastClientY = event.y;
    
                        if (dragType === "preview-item") {
                            const hoverElement = document.elementFromPoint(event.x, event.y);
                            const hoverItemElement = hoverElement ? hoverElement.closest(".ls-timeline-item") : null;
                            if (hoverItemElement) {
                                const hoverItem = getItemFromElement(hoverItemElement);
                                if (hoverItem) setPreviewItem(hoverItem);
                            }
                            this.quickEmit("drag-move", dragType, cursorX, cursorY);
                            return;
                        }
    
                        if (dragType === "delete-pending") {
                            const startX = dragState.deleteStartX || event.x;
                            const startY = dragState.deleteStartY || event.y;
                            const distance = Math.hypot(event.x - startX, event.y - startY);
                            if (distance > DRAG_ACTIVATION_DISTANCE) {
                                dragType = "delete";
                                dragState.deleteActivated = true;
                                dragState.erasedItems = new Set();
                                dragState.erasedActionItems = [];
                                this.__suppressContextMenuUntil = performance.now() + 500;
                                this.contextMenu.close();
                                this.itemContextMenu.close();
                                this.dragHandle.cursor = "var(--ls-timeline-cursor-erase)";
                                performToolAlongPath(event.x, event.y, performEraseAtPointer);
                                this.quickEmit("drag-start", dragType);
                            }
                            return;
                        }
    
                        if (dragType === "erase-pending") {
                            const startX = dragState.eraseStartX || event.x;
                            const startY = dragState.eraseStartY || event.y;
                            const distance = Math.hypot(event.x - startX, event.y - startY);
                            if (distance > DRAG_ACTIVATION_DISTANCE) {
                                dragType = "erase";
                                dragState.erasedItems = new Set();
                                dragState.erasedActionItems = [];
                                this.contextMenu.close();
                                this.itemContextMenu.close();
                                this.dragHandle.cursor = "var(--ls-timeline-cursor-erase)";
                                performToolAlongPath(event.x, event.y, performEraseAtPointer);
                                this.quickEmit("drag-start", dragType);
                            }
                            return;
                        }

                        if (dragType === "resize") {
                            const threshold = 50;
                            const maxSpeed = 15;

                            this.__isDragging = true;
                            updateSnapModifiers(event.domEvent);
                            this.__dragSnapModifiers = dragState;

                            edgeScrollSpeedX = 0;
                            edgeScrollSpeedY = 0;

                            if (cursorX < threshold) edgeScrollSpeedX = -maxSpeed * ((threshold - cursorX) / threshold);
                            else if (cursorX > rect.width - threshold) edgeScrollSpeedX = maxSpeed * ((cursorX - (rect.width - threshold)) / threshold);

                            if ((edgeScrollSpeedX !== 0 || edgeScrollSpeedY !== 0) && !edgeScrollRaf) {
                                edgeScrollRaf = this.requestAnimationFrame(processEdgeScroll);
                            }

                            updateResizePosition(event.x);
                            this.quickEmit("drag-move", dragType, cursorX, cursorY);
                            return;
                        }
    
                        if (dragState.pendingItemDrag) {
                            const startX = dragState.itemDragStartX || event.x;
                            const startY = dragState.itemDragStartY || event.y;
                            const distance = Math.hypot(event.x - startX, event.y - startY);
                            if (distance > ITEM_DRAG_ACTIVATION_DISTANCE) {
                                beginItemDrag(event);
                            } else {
                                return;
                            }
                        }
    
                        if (!dragState.pointerMoved && dragState.pointerDownX != null && dragType !== "preview") {
                            const distance = Math.hypot(event.x - dragState.pointerDownX, event.y - dragState.pointerDownY);
                            if (distance < DRAG_ACTIVATION_DISTANCE) {
                                return;
                            }
                            dragState.pointerMoved = true;
                        }
    
                        if (dragState.draggingItems) {
                            const threshold = 50;
                            const maxSpeed = 15;
    
                            updateSnapModifiers(event.domEvent);
                            this.__dragSnapModifiers = dragState;
    
                            edgeScrollSpeedX = 0;
                            edgeScrollSpeedY = 0;
    
                            if (cursorX < threshold) edgeScrollSpeedX = -maxSpeed * ((threshold - cursorX) / threshold);
                            else if (cursorX > rect.width - threshold) edgeScrollSpeedX = maxSpeed * ((cursorX - (rect.width - threshold)) / threshold);
                            
                            if (cursorY < threshold) edgeScrollSpeedY = -maxSpeed * ((threshold - cursorY) / threshold);
                            else if (cursorY > rect.height - threshold) edgeScrollSpeedY = maxSpeed * ((cursorY - (rect.height - threshold)) / threshold);
    
                            if ((edgeScrollSpeedX !== 0 || edgeScrollSpeedY !== 0) && !edgeScrollRaf) {
                                edgeScrollRaf = this.requestAnimationFrame(processEdgeScroll);
                            }
    
                            updateDragItemPosition(event.x, event.y);
                            return;
                        }
    
                        const now = performance.now();
                        this.__isDragging = true;
    
                        if (dragType === "pan") {
                            this.offset -= event.dx;
                            this.scrollContainer.scrollTop -= event.dy;
                            
                            // Track velocity
                            velocityX = event.dx;
    
                            this.quickEmit("drag-move", dragType, event.dx, event.dy);
                        } else if (dragType === "zoom-v") {
                            const sensitivity = 1;
                            const oldHeight = this.rowHeight;
                            const targetHeight = oldHeight - (event.dy * sensitivity);
    
                            this.rowHeight = targetHeight;
                            const newHeight = this.rowHeight;
    
                            if (newHeight !== oldHeight) {
                                const rect = this.scrollContainer.getBoundingClientRect();
                                const mouseY = event.startY - rect.top;
                                const oldScrollTop = this.scrollContainer.scrollTop;
                                const contentY = oldScrollTop + mouseY;
                                
                                const ratio = newHeight / oldHeight;
                                this.scrollContainer.scrollTop = (contentY * ratio) - mouseY;
                            }
    
                            this.quickEmit("drag-move", dragType, 0, event.dy);
                        } else if (dragType === "slice" || dragType === "slice-delete" || dragType === "erase" || dragType === "delete") {
                            const threshold = 50;
                            const maxSpeed = 15;
                            
                            edgeScrollSpeedX = 0;
                            edgeScrollSpeedY = 0;
                            if (cursorX < threshold) {
                                edgeScrollSpeedX = -maxSpeed * ((threshold - cursorX) / threshold);
                            } else if (cursorX > rect.width - threshold) {
                                edgeScrollSpeedX = maxSpeed * ((cursorX - (rect.width - threshold)) / threshold);
                            }
                            
                            if (cursorY < threshold) edgeScrollSpeedY = -maxSpeed * ((threshold - cursorY) / threshold);
                            else if (cursorY > rect.height - threshold) edgeScrollSpeedY = maxSpeed * ((cursorY - (rect.height - threshold)) / threshold);
                            
                            if ((edgeScrollSpeedX !== 0 || edgeScrollSpeedY !== 0) && !edgeScrollRaf) {
                                edgeScrollRaf = this.requestAnimationFrame(processEdgeScroll);
                            }
                            if (dragType === "slice" || dragType === "slice-delete") {
                                updateSnapModifiers(event.domEvent);
                                this.__dragSnapModifiers = dragState;
                                updateSliceLine(event.x, event.y);
                            } else {
                                performToolAlongPath(event.x, event.y, performEraseAtPointer);
                            }
                            this.quickEmit("drag-move", dragType, cursorX, cursorY);
                        } else if (dragType === "seek" || dragType === "select" || dragType === "preview") {
                            if (dragType === "seek" || dragType === "preview") {
                                const worldX = cursorX + this.offset;
                                const time = worldX / this.#zoom;
                                this.setSeek(time);
                                if (dragType === "preview") {
                                    const hoverElement = document.elementFromPoint(event.x, event.y);
                                    const hoverItemElement = hoverElement ? hoverElement.closest(".ls-timeline-item") : null;
                                    if (hoverItemElement) {
                                        const hoverItem = getItemFromElement(hoverItemElement);
                                        if (hoverItem) setPreviewItem(hoverItem);
                                    }
                                }
                            } else {
                                updateSelectionBox(cursorX, cursorY);
                            }
    
                            // Edge scrolling
                            const threshold = 50;
                            const maxSpeed = 15;
                            
                            edgeScrollSpeedX = 0;
                            edgeScrollSpeedY = 0;
    
                            if (cursorX < threshold) {
                                edgeScrollSpeedX = -maxSpeed * ((threshold - cursorX) / threshold);
                            } else if (cursorX > rect.width - threshold) {
                                edgeScrollSpeedX = maxSpeed * ((cursorX - (rect.width - threshold)) / threshold);
                            }
                            
                            if (dragType === "select") {
                                if (cursorY < threshold) edgeScrollSpeedY = -maxSpeed * ((threshold - cursorY) / threshold);
                                else if (cursorY > rect.height - threshold) edgeScrollSpeedY = maxSpeed * ((cursorY - (rect.height - threshold)) / threshold);
                            }
                            
                            if ((edgeScrollSpeedX !== 0 || edgeScrollSpeedY !== 0) && !edgeScrollRaf) {
                                edgeScrollRaf = this.requestAnimationFrame(processEdgeScroll);
                            }
    
                            this.quickEmit("drag-move", dragType, cursorX, cursorY);
                        }
                        
                        lastMoveTime = now;
                    },
    
                    onEnd: () => {
                        if (dragType === "pan") {
                            // Only apply inertia if the last move was recent
                            if (performance.now() - lastMoveTime < 50) {
                                processInertia();
                            }
                        } else if (dragType === "select") {
                            this.selectionRect.style.display = "none";
                        }
    
                        if (dragType === "preview-item") {
                            setPreviewItem(null);
                        }
    
                        if (dragType === "preview") {
                            setPreviewItem(null);
                        }
    
                        if (dragType === "slice" || dragType === "slice-delete") {
                            if (this.sliceLine) {
                                this.sliceLine.style.display = "none";
                                this.sliceLine.removeAttribute("ls-accent");
                            }
    
                            const startRow = Number.isFinite(dragState.sliceStartRow) ? dragState.sliceStartRow : 0;
                            const endRow = Number.isFinite(dragState.sliceCurrentRow) ? dragState.sliceCurrentRow : startRow;
                            const sliceClientX = Number.isFinite(dragState.sliceClientX) ? dragState.sliceClientX : dragState.sliceStartClientX;
    
                            if (Number.isFinite(sliceClientX)) {
                                performSliceAtLine(sliceClientX, startRow, endRow, dragType === "slice-delete");
                            }
    
                            dragState.sliceStartRow = null;
                            dragState.sliceCurrentRow = null;
                            dragState.sliceStartClientX = null;
                            dragState.sliceClientX = null;
                            dragState.sliceDeleteShorter = false;
                        }

                        if (dragType === "resize" && dragState.resizeInitialPositions) {
                            const changes = [];

                            for (const entry of dragState.resizeInitialPositions) {
                                if (entry.item.start !== entry.start || entry.item.duration !== entry.duration) {
                                    changes.push({
                                        id: entry.item.id,
                                        before: { start: entry.start, duration: entry.duration },
                                        after: { start: entry.item.start, duration: entry.item.duration }
                                    });
                                }
                            }

                            if (changes.length > 0) {
                                this.emitAction({
                                    type: "resize",
                                    changes
                                });
                            }

                            LS.Tooltips.hide();
                        }
    
                        if ((dragType === "erase" || dragType === "delete") && dragState.erasedActionItems && dragState.erasedActionItems.length > 0) {
                            this.emitAction({
                                type: "delete",
                                items: dragState.erasedActionItems
                            });
                        }
    
                        dragState.erasedItems = null;
                        dragState.erasedActionItems = null;
                        dragState.lastToolClientX = null;
                        dragState.lastToolClientY = null;
                        dragState.deleteStartX = null;
                        dragState.deleteStartY = null;
                        dragState.deleteActivated = false;
                        dragState.eraseStartX = null;
                        dragState.eraseStartY = null;
                        dragState.itemDragStartX = null;
                        dragState.itemDragStartY = null;
                        dragState.pointerDownX = null;
                        dragState.pointerDownY = null;
                        dragState.pointerMoved = false;
                        resetSnapModifiers();
                        dragState.resizingItems = false;
                        dragState.resizeSide = null;
                        dragState.resizeItem = null;
                        dragState.resizeItemElement = null;
                        dragState.resizePointerOffsetX = null;
                        dragState.resizeInitialEdgeTime = null;
                        dragState.resizeInitialPositions = null;
                        dragState.resizeItems = null;
                        this.__dragSnapModifiers = null;
    
                        // Emit action for external history management
                        if (dragState.draggingItems && dragState._initialPositions) {
                            const hasChanged = dragState._initialPositions.some(entry => 
                                entry.item.start !== entry.start || entry.item.row !== entry.row
                            );
                            
                            if (hasChanged || dragState.isCloning) {
                                if (dragState.isCloning) {
                                    // Emit clone action
                                    this.emitAction({
                                        type: "clone",
                                        items: dragState.clonedItems.map(item => ({
                                            id: item.id,
                                            data: this.cloneItem(item)
                                        }))
                                    });
                                } else {
                                    // Emit move action
                                    this.emitAction({
                                        type: "move",
                                        changes: dragState._initialPositions.map(entry => ({
                                            id: entry.item.id,
                                            before: { start: entry.start, row: entry.row },
                                            after: { start: entry.item.start, row: entry.item.row }
                                        }))
                                    });
                                }
                            }
                            
                            dragState._initialPositions = null;
                            dragState.clonedItems = null;
                            dragState.isCloning = false;
                            dragState.draggingItems = false;
                            dragState.baseItemsToMove = null;
                            dragState.itemsToMove = null;
                            dragState.item = null;
                            dragState.itemElement = null;
                            dragState.gridSnapAnchorStart = null;
                        }
    
                        if (dragState.pendingItemDrag) {
                            dragState.pendingItemDrag = false;
                            dragState.isCloning = false;
                            dragState.baseItemsToMove = null;
                            dragState.item = null;
                            dragState.itemElement = null;
                            dragState._initialPositions = null;
                            dragState.clonedItems = null;
                            dragState.gridSnapAnchorStart = null;
                        }
    
                        hideSnapLine();
    
                        stopEdgeScroll();
                        this.setTimeout(() => this.__isDragging = false, 10);
    
                        if (dragType === "delete-pending" || dragType === "erase-pending") {
                            dragType = null;
                            return;
                        }
    
                        this.quickEmit("drag-end", dragType);
                        dragType = null;
                    }
                });
            });

            this.focusedItem = null;
            this.container.addEventListener("contextmenu", (event) => {
                event.preventDefault();

                if (this.__suppressContextMenuUntil && performance.now() <= this.__suppressContextMenuUntil) {
                    this.__suppressContextMenuUntil = 0;
                    return;
                }

                const itemElement = event.target.closest(".ls-timeline-item");
                if(itemElement) {
                    this.contextMenu.close();
                    this.focusedItem = itemElement.__timelineItem;
                    this.selectedItems.clear();
                    this.selectedItems.add(this.focusedItem);
                    this.frameScheduler.schedule();
                    this.itemContextMenu.open(event.clientX, event.clientY);
                } else {
                    this.itemContextMenu.close();
                    this.contextMenu.open(event.clientX, event.clientY);
                }
            });

            this.container.addEventListener("pointerdown", () => {
                this.container.focus();
            });

            const self = this;

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
                        this.frameScheduler.schedule();
                    }, get hidden() { return self.clipboard.length === 0 } },
                    { type: "separator" },
                    { text: "Select All", icon: "bi-check2-all", action: () => this.selectAll() },
                    { text: "Deselect All", icon: "bi-x-lg", action: () => this.deselectAll() },
                ]
            });

            this.itemContextMenu = new LS.Menu({
                items: [
                    { text: "Copy Item(s)", icon: "bi-clipboard", action: () => {
                        if (this.selectedItems.size === 0) return;
                        let minStart = Infinity;
                        for (const item of this.selectedItems) {
                            if (item.start < minStart) minStart = item.start;
                        }
                        this.clipboard = Array.from(this.selectedItems, (item) => ({
                            data: this.cloneItem(item),
                            row: item.row || 0,
                            offset: item.start - minStart,
                        }));
                    } },
                    { text: "Cut Item(s)", icon: "bi-scissors", action: () => {
                        if (this.selectedItems.size === 0) return;
                        let minStart = Infinity;
                        for (const item of this.selectedItems) {
                            if (item.start < minStart) minStart = item.start;
                        }
                        this.clipboard = Array.from(this.selectedItems, (item) => ({
                            data: this.cloneItem(item),
                            row: item.row || 0,
                            offset: item.start - minStart,
                        }));
                        this.deleteSelected();
                    } },
                    { type: "separator" },
                    { text: "Delete Item(s)", icon: "bi-trash", action: () => {
                        this.deleteSelected();
                    } }
                ]
            });

            document.addEventListener('wheel', this.__wheelHandler = (event) => {
                if (!event.ctrlKey && !event.altKey) return;
                if (event.target !== this.container && !this.container.contains(event.target)) return;

                event.preventDefault();

                if (event.altKey) {
                    const deltaY = event.deltaMode === 1
                        ? event.deltaY * 16
                        : event.deltaMode === 2
                            ? event.deltaY * this.scrollContainer.clientHeight
                            : event.deltaY;
                    const oldHeight = this.rowHeight;
                    const targetHeight = oldHeight - (deltaY * 0.25);

                    this.rowHeight = targetHeight;
                    const newHeight = this.rowHeight;

                    if (newHeight !== oldHeight) {
                        const rect = this.scrollContainer.getBoundingClientRect();
                        const mouseY = event.clientY - rect.top;
                        const oldScrollTop = this.scrollContainer.scrollTop;
                        const contentY = oldScrollTop + mouseY;
                        
                        const ratio = newHeight / oldHeight;
                        this.scrollContainer.scrollTop = (contentY * ratio) - mouseY;
                    }

                    return;
                }

                const rect = this.container.getBoundingClientRect();
                const cursorX = event.clientX - rect.left;
                const currentZoom = this.#zoom;
                const currentOffset = this.scrollContainer.scrollLeft;
                const worldX = (cursorX + currentOffset) / currentZoom;

                const zoomDelta = currentZoom * 0.16 * (event.deltaY > 0 ? -1 : 1);
                this.zoom = currentZoom + zoomDelta;

                const appliedZoom = this.#zoom;
                this.offset = Math.max(0, (worldX * appliedZoom) - cursorX);
            }, { passive: false });


            this.container.addEventListener('dragover', this.__nativeDragOverHandler = (event) => {
                const dt = event.dataTransfer;
                if (!dt) return;
                // Only intercept when files are present
                const types = dt.types ? Array.from(dt.types) : [];
                if (!types.includes('Files')) return;
                event.preventDefault();
                try { dt.dropEffect = 'copy'; } catch (_) { /* noop */ }
            });

            this.container.addEventListener('drop', this.__nativeDropHandler = (event) => {
                const dt = event.dataTransfer;
                if (!dt || !dt.files || dt.files.length === 0) return;
                event.preventDefault();

                const containerRect = this.container.getBoundingClientRect();
                const cursorX = event.clientX - containerRect.left;
                const cursorY = event.clientY - containerRect.top;

                // Compute timeline time offset from X
                const worldX = cursorX + this.#offset;
                const timeOffset = worldX / this.#zoom;

                // Determine row from Y
                let rowIndex = 0;
                let matched = false;
                for (let i = 0; i < this.rowElements.length; i++) {
                    const r = this.rowElements[i].getBoundingClientRect();
                    if (event.clientY >= r.top && event.clientY <= r.bottom) {
                        rowIndex = i;
                        matched = true;
                        break;
                    }
                }
                if (!matched && this.rowElements.length > 0) {
                    const firstRect = this.rowElements[0].getBoundingClientRect();
                    const lastRect = this.rowElements[this.rowElements.length - 1].getBoundingClientRect();
                    if (event.clientY < firstRect.top) {
                        rowIndex = 0;
                    } else if (event.clientY > lastRect.bottom) {
                        rowIndex = this.rowElements.length - 1;
                    }
                }

                this.quickEmit(this.__fileProcessEventRef, dt.files, rowIndex, timeOffset);
            });

            this.zoom = this.options.zoom;
            this.offset = this.options.offset;

            let previousScrollLeft = this.#offset;
            this.scrollContainer.addEventListener('scroll', (event) => {
                const scrollLeft = this.scrollContainer.scrollLeft;
                this.#offset = scrollLeft;
                if (scrollLeft !== previousScrollLeft) {
                    previousScrollLeft = scrollLeft;
                    this.frameScheduler.schedule();
                }
            });

            this.clipboard = [];
            
            // Undo/Redo action events (history management is external)
            this.__actionEventRef = this.prepareEvent("action");

            this.container.addEventListener("keydown", (event) => {
                if(event.shiftKey && (
                    event.key === "ArrowLeft" ||
                    event.key === "ArrowRight" ||
                    event.key === "ArrowUp" ||
                    event.key === "ArrowDown"
                )) {
                    event.preventDefault();
                    this.#moveSelectedWithKeyboard(event.key, event);
                    return;
                }

                if(event.key === "Delete" || event.key === "Backspace") {
                    this.deleteSelected();
                    return;
                }

                if (!event.ctrlKey) return;

                const key = event.key.toLowerCase();
                
                if (key === "a") {
                    event.preventDefault();
                    this.selectedItems.clear();
                    for (const item of this.items) this.selectedItems.add(item);
                    this.frameScheduler.schedule();
                } else if (key === "b") {
                    event.preventDefault();
                    this.#repeatSelection();
                } else if (key === "c") {
                    event.preventDefault();
                    if (this.selectedItems.size === 0) return;
                    let minStart = Infinity;
                    for (const item of this.selectedItems) {
                        if (item.start < minStart) minStart = item.start;
                    }
                    this.clipboard = Array.from(this.selectedItems, (item) => ({
                        data: this.cloneItem(item),
                        row: item.row || 0,
                        offset: item.start - minStart,
                    }));
                } else if (key === "v") {
                    event.preventDefault();
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
                    this.frameScheduler.schedule();
                }
            });

            this.rowHeight = this.options.rowHeight;
            this.reserveRows(this.options.startingRows);
            this.frameScheduler.schedule();

            this.__seekEventRef = this.prepareEvent("seek");
            this.__fileProcessEventRef = this.prepareEvent("file-dropped");
            this.enabled = true;
        }

        get rowHeight() {
            return this.#rowHeight;
        }

        set rowHeight(value) {
            value = clamp(value, 18, 500);
            if (value === this.#rowHeight) return;
            this.#rowHeight = value;
            this.container.style.setProperty("--ls-timeline-row-height", `${value}px`);
            this.frameScheduler.schedule();
        }

        get zoom() {
            return this.#zoom;
        }

        set zoom(value){
            let minZoom = this.options.minZoom;

            if (minZoom === "auto") {
                if (this.#duration > 0 && this.container.clientWidth > 0) {
                    minZoom = this.container.clientWidth / this.#duration;
                } else {
                    minZoom = 0.000001;
                }
            }

            value = clamp(value, minZoom, this.options.maxZoom);
            if (value === this.#zoom) return;
            this.#zoom = value;
            this.frameScheduler.schedule();
        }

        get offset() {
            return this.#offset;
        }

        set offset(value) {
            value = Math.max(0, value);
            if (value === this.#offset) return;
            this.scrollContainer.scrollLeft = value;
            value = this.scrollContainer.scrollLeft;
            if (value === this.#offset) return;
            this.#offset = value;
            this.frameScheduler.schedule();
        }

        get seek() {
            return this.#seek;
        }

        set seek(value) {
            // TODO: implement player controller API
            this.#seek = Math.max(0, value);
            this.updateHeadPosition();
        }

        setSeek(value) {
            value = Math.max(0, value);
            if(this.#seek === value) return;
            this.#seek = value;
            this.quickEmit(this.__seekEventRef, value);
            this.updateHeadPosition();
        }

        get duration() {
            return this.#duration;
        }

        set tool(value) {
            const previous = this.#tool;
            value = value == null ? "select" : String(value);
            if (value === previous) return;

            this.#tool = value;

            if (this.container) {
                this.container.setAttribute("data-tool", value);
            }

            if (previous === "preview" && value !== "preview" && this.__setPreviewItem) {
                this.__setPreviewItem(null);
            }

            this.quickEmit("tool-changed", value, previous);
        }

        get tool() {
            return this.#tool;
        }

        #parseGridSnapDivision() {
            let step = this.options.gridSnapDivision;
            if (typeof step === "string" && step.includes("/")) {
                const parts = step.split("/").map(Number);
                if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]) && parts[1] !== 0) {
                    step = parts[0] / parts[1];
                }
            }

            step = num(step, 0);
            return step > 0 ? step : 0;
        }

        #getBaseGridSnapStep(modifiers = null) {
            if (modifiers && (modifiers.altKey || modifiers.snapModifierAlt)) return 0;
            if (!this.options.gridSnapping) return 0;
            if (modifiers && (modifiers.shiftKey || modifiers.snapModifierShift)) return 1;
            return this.#parseGridSnapDivision();
        }

        #getGridSnapStep(modifiers = null) {
            let step = this.#getBaseGridSnapStep(modifiers);
            if (step <= 0 || this.#zoom <= 0) return 0;

            while (step * this.#zoom < MIN_GRID_LINE_SPACING) {
                step = normalizeSnappedTime(step * 2);
            }

            return step;
        }

        #snapTimeToGrid(time, modifiers = null) {
            const step = this.#getGridSnapStep(modifiers);
            return step > 0 ? Math.max(0, snapTimeToStep(time, step)) : time;
        }

        #snapClientXToGrid(clientX, modifiers = null) {
            const containerRect = this.container.getBoundingClientRect();
            let x = clamp(clientX, containerRect.left, containerRect.right);
            const step = this.#getGridSnapStep(modifiers);

            if (step <= 0 || this.#zoom <= 0) {
                return x;
            }

            const rowRect = this.rowContainer.getBoundingClientRect();
            const time = this.#snapTimeToGrid((x - rowRect.left + this.#offset) / this.#zoom, modifiers);
            return clamp(rowRect.left + (time * this.#zoom) - this.#offset, containerRect.left, containerRect.right);
        }

        #getKeyboardMoveStep(event) {
            if (event && event.altKey) {
                return this.#zoom > 0 ? normalizeSnappedTime(1 / this.#zoom) : 0;
            }

            let step = this.#getGridSnapStep(null);
            if (step <= 0) step = this.#parseGridSnapDivision();
            return step > 0 ? step : 1;
        }

        #moveSelectedWithKeyboard(key, event) {
            const items = this.selectedItems.size > 0
                ? Array.from(this.selectedItems)
                : this.focusedItem
                    ? [this.focusedItem]
                    : [];

            if (items.length === 0) return false;

            let deltaTime = 0;
            let rowDelta = 0;

            if (key === "ArrowLeft" || key === "ArrowRight") {
                const step = this.#getKeyboardMoveStep(event);
                deltaTime = key === "ArrowLeft" ? -step : step;

                if (deltaTime < 0) {
                    let minStart = Infinity;
                    for (const item of items) {
                        if (item.start < minStart) minStart = item.start;
                    }

                    if (minStart + deltaTime < 0) {
                        deltaTime = -minStart;
                    }
                }

                if (deltaTime === 0) return true;
            } else {
                rowDelta = key === "ArrowUp" ? -1 : 1;

                if (rowDelta < 0) {
                    let minRow = Infinity;
                    for (const item of items) {
                        const row = item.row || 0;
                        if (row < minRow) minRow = row;
                    }

                    if (minRow + rowDelta < 0) {
                        rowDelta = -minRow;
                    }
                }

                if (rowDelta === 0) return true;
            }

            const changes = [];

            for (const item of items) {
                const before = { start: item.start, row: item.row || 0 };

                if (deltaTime !== 0) {
                    item.start = normalizeSnappedTime(item.start + deltaTime);
                }

                if (rowDelta !== 0) {
                    item.row = Math.max(0, (item.row || 0) + rowDelta);
                }

                if (item.start !== before.start || (item.row || 0) !== before.row) {
                    changes.push({
                        id: item.id,
                        before,
                        after: { start: item.start, row: item.row || 0 }
                    });
                }
            }

            if (changes.length === 0) return true;

            if (deltaTime !== 0) {
                this.__needsSort = true;
            }

            this.__dragSnapModifiers = null;
            this.emitAction({
                type: "move",
                changes
            });
            this.frameScheduler.schedule();
            return true;
        }

        #repeatSelection() {
            const items = this.selectedItems.size > 0
                ? Array.from(this.selectedItems)
                : this.focusedItem
                    ? [this.focusedItem]
                    : [];

            if (items.length === 0) return false;

            let minStart = Infinity;
            let maxEnd = -Infinity;

            for (const item of items) {
                const start = num(item.start);
                const end = start + num(item.duration);
                if (start < minStart) minStart = start;
                if (end > maxEnd) maxEnd = end;
            }

            if (!Number.isFinite(minStart) || !Number.isFinite(maxEnd)) return false;

            const offset = maxEnd - minStart;
            const clonedItems = [];
            const idMap = new Map();

            for (const item of items) {
                const cloned = this.cloneItem(item);
                cloned.start = normalizeSnappedTime((item.start || 0) + offset);
                cloned.row = item.row || 0;
                idMap.set(item.id, cloned.id);
                clonedItems.push(cloned);
                this.add(cloned);
            }

            if (this.options.remapAutomationTargets) {
                this.remapAutomationTargets(clonedItems, idMap);
            }

            this.selectedItems.clear();
            for (const item of clonedItems) {
                this.selectedItems.add(item);
            }

            this.focusedItem = clonedItems[0] || null;

            this.emitAction({
                type: "clone",
                items: clonedItems.map((item) => ({
                    id: item.id,
                    data: this.cloneItem(item)
                }))
            });

            this.frameScheduler.schedule();
            return true;
        }

        getItemById(id) {
            return this.itemMap.get(id);
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

        sortItems() {
            this.items.sort((a, b) => (a.start || 0) - (b.start || 0));

            this.itemMap.clear();

            let totalDuration = 0;
            this.maxDuration = 0;

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

            this.__needsSort = false;

            this.quickEmit("sorted", this.maxDuration);
            if (totalDuration !== this.#duration) {
                this.#duration = totalDuration;
                this.quickEmit("duration-changed", this.#duration);
            }
        }

        reserveRows(number) {
            while (this.rowElements.length < number) {
                const rowElement = LS.Create({
                    class: "ls-timeline-row"
                });

                this.rowContainer.add(rowElement);
                this.rowElements.push(rowElement);
            }
        }

        addTrack() {
            this.reserveRows(this.rowElements.length + 1);
        }

        clearUnusedRows() {
            const highestUsedRow = this.items.reduce((max, item) => Math.max(max, item.row || 0), 0);
            for (let i = this.rowElements.length - 1; i > highestUsedRow; i--) {
                const rowElement = this.rowElements.pop();
                rowElement.remove();
            }
        }

        #render() {
            // let debug_scanned = 0, debug_time = performance.now();

            if(!this.enabled || document.hidden || document.fullscreenElement) return;

            const zoom = this.#zoom;
            const offset = this.#offset;
            const items = this.items;
            const rowElements = this.rowElements;
            const selectedItems = this.selectedItems;
            const rendered = this.__rendered;
            const options = this.options;

            const viewportWidth = this.container.clientWidth;
            const worldRight = offset + viewportWidth;

            if (this.__needsSort) {
                this.sortItems();
            }

            const gridStep = this.#getGridSnapStep(this.__dragSnapModifiers);
            if (gridStep > 0 && zoom > 0) {
                const visualMinorStep = gridStep;
                let visualMajorStep = visualMinorStep;

                while (visualMajorStep * zoom < MIN_MAJOR_GRID_LINE_SPACING) {
                    visualMajorStep = normalizeSnappedTime(visualMajorStep * 2);
                }

                const majorStepPx = visualMajorStep * zoom;
                const minorStepPx = visualMinorStep * zoom;
                const gridOffset = majorStepPx > 0
                    ? -((((offset % majorStepPx) + majorStepPx) % majorStepPx))
                    : 0;

                if (!this.__gridEnabled) {
                    this.container.classList.add("grid-enabled");
                    this.__gridEnabled = true;
                }
                this.rowContainer.style.setProperty("--ls-timeline-grid-major-step", `${majorStepPx}px`);
                this.rowContainer.style.setProperty("--ls-timeline-grid-minor-step", `${minorStepPx}px`);
                this.rowContainer.style.setProperty("--ls-timeline-grid-offset", `${gridOffset}px`);
            } else if (this.__gridEnabled) {
                this.container.classList.remove("grid-enabled");
                this.__gridEnabled = false;
            }

            // Update spacer width
            // Ensure the spacer is wide enough for the content plus padding, regardless of zoom/offset
            const endPadding = viewportWidth * 0.5;
            const contentWidth = this.#duration * zoom;
            const spacerWidth = contentWidth + endPadding > worldRight + endPadding 
                ? contentWidth + endPadding 
                : worldRight + endPadding;

            if (this.__spacerWidth - spacerWidth > 1 || spacerWidth - this.__spacerWidth > 1) {
                this.spacerElement.style.width = spacerWidth + "px";
                this.__spacerWidth = spacerWidth;
            }

            // --- Marker Logic ---
            this.markerContainer.style.transform = `translate3d(${-offset}px, 0, 0)`;

            const minMarkerDist = options.markerSpacing;
            const invZoom = 1 / zoom; // Pre-compute inverse to avoid repeated division
            const minTimeStep = minMarkerDist * invZoom;

            // Find nearest power of 2 for clean steps (0.5, 1, 2, 4, 8...)
            const step = Math.pow(2, Math.ceil(Math.log2(minTimeStep)));
            
            // Align start time to step grid
            const invStep = 1 / step;
            const startTime = Math.floor(offset * invZoom * invStep) * step;
            const endTime = worldRight * invZoom;
            const endTimePlusStep = endTime + step;

            let markerIndex = 0;
            const activeMarkers = this.activeMarkers;
            const markerPool = this.markerPool;
            const markerContainer = this.markerContainer;

            for (let time = startTime; time <= endTimePlusStep; time += step) {
                const t = (time * 1000 + 0.5) | 0; // Faster rounding: multiply, truncate
                const tNorm = t * 0.001; // Normalize back
                if (tNorm < 0) continue;

                let marker;
                if (markerIndex < activeMarkers.length) {
                    marker = activeMarkers[markerIndex];
                } else {
                    // Reuse or create new marker
                    marker = markerPool.pop();
                    if (!marker) {
                        marker = document.createElement("div");
                        marker.className = "ls-timeline-marker";
                    }
                    markerContainer.appendChild(marker);
                    activeMarkers.push(marker);
                }

                const pos = tNorm * zoom;

                // Since the container moves with scroll, markers stay at fixed world coordinates
                if (marker.__pos !== pos) {
                    marker.style.transform = `translateX(${pos}px)`;
                    marker.__pos = pos;
                }
                
                // Only update text if time changed (optimization)
                // Use textContent instead of innerText (faster, no layout)
                if (marker.__time !== tNorm) {
                    marker.textContent = this.formatMarker(tNorm, step);
                    marker.__time = tNorm;
                }
                markerIndex++;
            }

            // Recycle unused markers
            const activeLen = activeMarkers.length;
            if (markerIndex < activeLen) {
                for (let i = activeLen - 1; i >= markerIndex; i--) {
                    const marker = activeMarkers[i];
                    marker.remove();
                    markerPool.push(marker);
                }
                activeMarkers.length = markerIndex;
            }

            const itemCount = items.length;
            const chunkSize = options.chunkSize === "auto"
                ? itemCount < 1000? 2000
                : itemCount < 5000? 500
                : 100
                : options.chunkSize;

            // Snap the render window to a grid defined by chunkSize
            // This ensures that the set of rendered items remains stable while scrolling within a chunk
            const invChunkSize = 1 / chunkSize;
            const chunkStart = Math.floor((offset - chunkSize) * invChunkSize) * chunkSize;
            const chunkEnd = Math.ceil((worldRight + chunkSize) * invChunkSize) * chunkSize;

            const minX = chunkStart - offset;
            const maxX = chunkEnd - offset;

            // Find the first item that could possibly be visible
            // We look back by maxDuration to ensure we catch long items starting before the view
            const maxDuration = this.maxDuration;
            const visibleStartTime = chunkStart * invZoom;
            const searchStartTime = visibleStartTime - maxDuration > 0? visibleStartTime - maxDuration: 0;
            const startIndex = this.binarySearch(searchStartTime);

            const rowHeight = this.#rowHeight;
            const autoCreateAutomation = options.autoCreateAutomationClips;
            const itemHeaderHeight = options.itemHeaderHeight;
            const automationHeight = rowHeight - itemHeaderHeight;

            for (let i = startIndex; i < itemCount; i++) {
                // debug_scanned++;

                const item = items[i];
                const itemStart = item.start;
                const itemDuration = item.duration;
                const computedX = itemStart * zoom - offset;

                // Early out - items are sorted by start, so all subsequent items are further right
                if (computedX > maxX) {
                    break;
                }

                const computedWidth = itemDuration * zoom;

                // Drop items that are too small to be seen (check before creating element)
                if (computedWidth <= 0 || computedX + computedWidth < minX) {
                    continue;
                }

                const widthChanged = computedWidth !== item.__previousWidth;
                const itemElement = item.timelineElement || this.createTimelineElement(item);
                const itemRow = item.row || 0;

                // Ensure we do not trigger CSS layout - only update if changed
                if (widthChanged) {
                    itemElement.style.width = computedWidth + "px";
                    item.__previousWidth = computedWidth;
                }

                const isSelected = selectedItems.has(item);
                if (isSelected !== item.__wasSelected) {
                    if (isSelected) {
                        itemElement.classList.add("selected");
                    } else {
                        itemElement.classList.remove("selected");
                    }
                    item.__wasSelected = isSelected;
                }

                itemElement.style.transform = `translate3d(${computedX}px, 0, 0)`;

                // Inline row reservation for hot path
                const requiredRows = itemRow + 1;
                if (rowElements.length < requiredRows) {
                    this.reserveRows(requiredRows);
                }
                
                const rowElement = rowElements[itemRow];
                const needsAppend = !itemElement.isConnected || itemElement.parentNode !== rowElement;
                
                if (needsAppend) {
                    rowElement.appendChild(itemElement);
                }

                // Handle automation clips
                if (item.type === "automation") {
                    let clip = item.__automationClip;

                    if (!clip && autoCreateAutomation) {
                        const data = item.data || (item.data = {});
                        data.points = data.points || [];
                        clip = item.__automationClip = new LS.AutomationGraph({
                            items: data.points,
                            value: data.value || 0
                        });
                    }

                    if (clip) {
                        if (needsAppend) {
                            clip.setElement(itemElement);
                        }

                        clip.updateScale(zoom);

                        if (needsAppend || widthChanged || rowHeight !== item.__previousHeight) {
                            clip.updateSize(computedWidth, automationHeight);
                            item.__previousHeight = rowHeight;
                        }
                    }
                }

                rendered.add(itemElement);
                itemElement.__eligible = true;
            }

            for (const child of rendered) {
                if (child.__eligible) {
                    child.__eligible = false;
                } else {
                    const timelineItem = child.__timelineItem;
                    if (timelineItem && timelineItem.type === "automation" && timelineItem.__automationClip) {
                        timelineItem.__automationClip.setElement(null);
                    }
                    child.remove();
                    rendered.delete(child);
                }
            }

            const headPos = (this.#seek * zoom) - offset;
            if (this.__headPos !== headPos) {
                this.playerHead.style.transform = `translate3d(${headPos}px, 0, 0)`;
                this.__headPos = headPos;
            }

            // console.log(`Timeline rendered: scanned ${debug_scanned} items to render ${rendered.size} items in ${performance.now() - debug_time} ms.`);
        }

        #updateHeadPosition() {
            const zoom = this.#zoom;
            const offset = this.#offset;
            const headPos = (this.#seek * zoom) - offset;
            if (this.__headPos !== headPos) {
                this.playerHead.style.transform = `translate3d(${headPos}px, 0, 0)`;
                this.__headPos = headPos;
            }

            this.__headPositionQueued = false;
        }

        updateHeadPosition() {
            if (this.__headPositionQueued) return;
            this.__headPositionQueued = true;
            this.requestAnimationFrame(() => this.#updateHeadPosition());
        }

        formatMarker(time, step) {
            if (this.options.markerMetric === "number") return time.toString();
            if (typeof this.options.markerMetric === "function") return this.options.markerMetric(time, step);

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
            this.frameScheduler.schedule();
        }

        select(item) {
            this.selectedItems.clear();
            this.selectedItems.add(item);
            this.focusedItem = item;
            this.quickEmit("item-select", item);
            this.frameScheduler.schedule();
        }

        deselectAll() {
            if (this.selectedItems.size > 0) {
                this.selectedItems.clear();
                this.frameScheduler.schedule();
                this.quickEmit("item-deselect");
            }
            this.focusedItem = null;
        }

        selectAll() {
            this.selectedItems.clear();
            for (const item of this.items) this.selectedItems.add(item);
            this.frameScheduler.schedule();
        }

        /**
         * Timeline item data structure
         * @property {number} start - Start time of the item
         * @property {number} duration - Duration of the item
         * @property {number} [row=0] - Row index where the item is placed
         * @property {string} [label=""] - Display label for the item
         * @property {string|null} [tileColor=null] - Tile accent color for the item
         * @property {*} [data=null] - Custom data associated with the item
         */
        add(item) {
            this.items.push(item);
            // If no ID, it will be assigned during sorting
            if(item.id) this.itemMap.set(item.id, item);
            this.__needsSort = true;
            this.frameScheduler.schedule();
        }

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
         * Remaps automation target nodeIds in cloned/pasted items.
         * If an automation clip's target was also cloned, update the target reference to point to the new clone.
         * @param {Array} items - The cloned/pasted items to process
         * @param {Map} idMap - Map from original item IDs to new item IDs
         */
        remapAutomationTargets(items, idMap) {
            for (const item of items) {
                if (item.type === "automation" && item.data && Array.isArray(item.data.targets)) {
                    for (const target of item.data.targets) {
                        if (target.nodeId && idMap.has(target.nodeId)) {
                            target.nodeId = idMap.get(target.nodeId);
                            item.__dirty = true; // Mark item as dirty for external systems
                        }
                    }
                }
            }
        }

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

        getIntersectingAt(time) {
            if (this.__needsSort) {
                this.sortItems();
            }

            const searchStart = time - this.maxDuration;
            let i = this.binarySearch(searchStart);

            const result = [];
            const items = this.items;
            const len = items.length;

            for (; i < len; i++) {
                const item = items[i];

                // Since items are sorted by start, if this item starts after 'time',
                // all subsequent items also start after 'time' and cannot intersect.
                if (item.start > time) {
                    break;
                }

                // We know item.start <= time (from loop condition/break).
                // Intersection occurs if item.end >= time.
                if ((item.start + item.duration) >= time) {
                    result.push(item);
                }
            }

            return result;
        }

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

        createTimelineElement(item) {
            item.timelineElement = LS.Create({
                class: "ls-timeline-item" + (item.type ? ` ls-timeline-item-${item.type}` : "") + (item.cover ? " ls-timeline-item-cover" : ""),
                inner: { tag: "span", textContent: item.label || (item.data && item.data.label ? item.data.label : "") },
                accent: item.tileColor || null,
                style: item.cover ? `background-image: url('${item.cover}'); background-size: cover; background-position: center;` : ""
            });

            // todo
            Object.defineProperty(item, "label", {
                get: () => {
                    const span = item.timelineElement.querySelector("span");
                    return span ? span.textContent : "";
                },
                set: (value) => {
                    const span = item.timelineElement.querySelector("span");
                    if (span) span.textContent = value;
                }
            });
            
            // todo
            Object.defineProperty(item, "tileColor", {
                get: () => {
                    return item.timelineElement.getAttribute("ls-accent");
                },
                set: (value) => {
                    if (value) {
                        item.timelineElement.setAttribute("ls-accent", value);
                    } else {
                        item.timelineElement.removeAttribute("ls-accent");
                    }
                }
            });

            item.timelineElement.__timelineItem = item;

            if (this.options.resizable) {
                const leftHandle = document.createElement("div");
                leftHandle.className = "ls-resize-handle ls-left ls-resize-handle-styled";

                const rightHandle = document.createElement("div");
                rightHandle.className = "ls-resize-handle ls-right ls-resize-handle-styled";

                item.timelineElement.append(leftHandle, rightHandle);
            }

            return item.timelineElement;
        }

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
                this.frameScheduler.schedule();
            }

            this.selectedItems.delete(item);

            if (this.__rendered && item.timelineElement) {
                this.__rendered.delete(item.timelineElement);
            }

            if (item.id) this.itemMap.delete(item.id);
            if(item.type === "automation" && item.__automationClip) {
                item.__automationClip?.destroy?.();
                item.__automationClip = null;
            }

            if(this.focusedItem === item) {
                this.focusedItem = null;
            }

            if (item.timelineElement && item.timelineElement.parentNode) {
                item.timelineElement.remove();
                if (item.timelineElement) {
                    item.timelineElement.__eligible = false;
                }
            }

            this.quickEmit("item-removed", item);

            if(destroy) {
                this.destroyTimelineElement(item);
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

        /**
         * Clears and removes the timeline element associated with an item.
         * @param {*} item 
         */
        destroyTimelineElement(item) {
            if (item.timelineElement) {
                if (this.__rendered) {
                    this.__rendered.delete(item.timelineElement);
                }

                if (item.timelineElement.parentNode) {
                    item.timelineElement.remove();
                }

                item.timelineElement.__timelineItem = null;
            }

            item.timelineElement = null;
        }

        deleteSelected() {
            const itemsToDelete = [];
            
            if(this.focusedItem && !this.selectedItems.has(this.focusedItem)) {
                itemsToDelete.push(this.focusedItem);
            }
            
            for (const item of this.selectedItems) {
                itemsToDelete.push(item);
            }
            
            if (itemsToDelete.length === 0) return;
            
            // Emit action for external history management
            this.emitAction({
                type: "delete",
                items: itemsToDelete.map(item => ({
                    id: item.id,
                    data: this.cloneItem(item)
                }))
            });
            
            for (const item of itemsToDelete) {
                this.destroyItem(item);
            }

            this.focusedItem = null;
            this.selectedItems.clear();
            this.frameScheduler.schedule();
        }

        reset(destroyItems = true, replacingItems = null) {
            if (this.destroyed) return;

            const oldItems = Array.isArray(this.items) ? this.items.slice() : [];

            for (const item of oldItems) {
                if (destroyItems) {
                    this.destroyItem(item);
                } else if (item.timelineElement && item.timelineElement.parentNode) {
                    if (item.type === "automation" && item.__automationClip) {
                        item.__automationClip.setElement(null);
                    }

                    if (this.__rendered) {
                        this.__rendered.delete(item.timelineElement);
                    }

                    item.timelineElement.remove();
                }
            }

            this.items = replacingItems || [];

            this.itemMap.clear();
            this.__rendered.clear();
            this.selectedItems.clear();
            this.focusedItem = null;

            this.maxDuration = 0;
            this.#duration = 0;

            this.clearUnusedRows();
            this.reserveRows(this.options.startingRows);

            if (replacingItems) {
                for (const item of this.items) {
                    if (!item.id) item.id = LS.Misc.uid();
                    this.itemMap.set(item.id, item);
                }

                this.__needsSort = true;
                this.sortItems();
            } else {
                this.__needsSort = false;
            }

            this.frameScheduler.schedule();
        }

        transformCoords(x, y) {
            const rowsRect = this.rowContainer.getBoundingClientRect();
            const time = (x - rowsRect.left + this.#offset) / this.#zoom;

            let rowIndex = 0;
            if(y !== undefined) {
                let matched = false;
                for (let i = 0; i < this.rowElements.length; i++) {
                    const r = this.rowElements[i].getBoundingClientRect();
                    if (y >= r.top && y <= r.bottom) {
                        rowIndex = i;
                        matched = true;
                        break;
                    }
                }

                if (!matched && this.rowElements.length > 0) {
                    const firstRect = this.rowElements[0].getBoundingClientRect();
                    const lastRect = this.rowElements[this.rowElements.length - 1].getBoundingClientRect();
                    if (y < firstRect.top) {
                        rowIndex = 0;
                    } else if (y > lastRect.bottom) {
                        rowIndex = this.rowElements.length - 1;
                    }
                }
            }

            return { time, row: rowIndex };
        }

        export() {
            if(this.__needsSort) {
                this.sortItems();
            }

            return this.items.map(item => this.cloneItem(item, true, true));
        }

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
            
            this.frameScheduler.schedule();
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
            
            this.frameScheduler.schedule();
            return true;
        }

        destroy() {
            this.reset(true);
            this.frameScheduler.destroy();
            this.frameScheduler = null;
            this.clipboard = null;
            this.__actionEventRef = null;
            this.markerPool = null;
            this.activeMarkers = null;
            this.selectedItems.clear();
            this.selectedItems = null;
            this.items = null;
            this.itemMap = null;
            this.__rendered = null;
            this.__dragSnapModifiers = null;
            this.__getGridSnapStep = null;
            this.focusedItem = null;

            // UI Elements
            this.rowElements = null;
            this.spacerElement = null;
            this.playerHead = null;
            this.rowContainer = null;
            this.scrollContainer = null;
            this.markerContainer = null;
            this.selectionRect = null;
            this.snapLine = null;
            this.sliceLine = null;

            if (this.__setPreviewItem) {
                this.__setPreviewItem(null);
                this.__setPreviewItem = null;
            }
            this.__previewItem = null;

            this.__seekEventRef = null;
            this.__fileProcessEventRef = null;

            document.removeEventListener('wheel', this.__wheelHandler);
            this.__wheelHandler = null;

            if (this.__modifierKeyHandler) {
                document.removeEventListener("keydown", this.__modifierKeyHandler);
                document.removeEventListener("keyup", this.__modifierKeyHandler);
                this.__modifierKeyHandler = null;
            }

            if (this.__modifierBlurHandler) {
                window.removeEventListener("blur", this.__modifierBlurHandler);
                this.__modifierBlurHandler = null;
            }

            if (this.container && this.__previewHoverHandler) {
                this.container.removeEventListener("pointermove", this.__previewHoverHandler);
                this.__previewHoverHandler = null;
            }
            if (this.container && this.__previewLeaveHandler) {
                this.container.removeEventListener("pointerleave", this.__previewLeaveHandler);
                this.__previewLeaveHandler = null;
            }

            if (this.container && this.__nativeDragOverHandler) {
                this.container.removeEventListener('dragover', this.__nativeDragOverHandler);
                this.__nativeDragOverHandler = null;
            }
            if (this.container && this.__nativeDropHandler) {
                this.container.removeEventListener('drop', this.__nativeDropHandler);
                this.__nativeDropHandler = null;
            }

            this.container.remove();
            this.container = null;

            if(this.contextMenu) {
                this.contextMenu.destroy();
                this.contextMenu = null;
            }

            if(this.itemContextMenu) {
                this.itemContextMenu.destroy();
                this.itemContextMenu = null;
            }

            this.dragHandle.destroy();
            this.dragHandle = null;

            this.destroyed = true;
            this.emit("destroy");
            this.events.clear();
        }
    }, { name: "Timeline", global: true });
})();