/**
 * An efficient timeline component, optimized for long timelines with many items via virtual scrolling.
 * It handles: drag and drop, resizing, markers, touch controls, and virtual scrolling by automatically unloading off-screen items.
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
 * - Snapping issues (desync when dragging)
 * - Resizing is not proportional (bug or feature?)
 * - etc
 * 
 * I'm thinking using WebGL would have been much easier and better 😭
 */

(() => {
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const DEFAULTS = {
        element: null,
        chunkSize: "auto",
        reservedRows: 5,
        zoom: 200,
        offset: 0,
        minZoom: 0.1,
        maxZoom: 1000,
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
        snapEnabled: true,
        remapAutomationTargets: true,
        framerateLimit: 90
    };

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
    const TEMPLATE = function(d){'use strict';var e0=document.createElement("div");e0.setAttribute("tabindex","0");var e1=document.createElement("div");e1.className="ls-timeline-markers";var e2=document.createElement("div");e2.className="ls-timeline-player-head";var e3=document.createElement("div");e3.className="ls-timeline-selection-rect";e3.style.cssText="position: absolute; pointer-events: none; display: none; border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 50%, rgba(0, 0, 0, 0.2) 50%); z-index: 100;";var e4=document.createElement("div");e4.className="ls-timeline-snap-line";e4.style.cssText="position: fixed; top: 0; left: 0; width: 1px; background: var(--accent-60); z-index: 1000; pointer-events: none; display: none;";var e5=document.createElement("div");e5.className="ls-timeline-scroll-container";var e6=document.createElement("div");e6.className="ls-timeline-spacer";e6.style.cssText="height: 1px; width: 0px;";var e7=document.createElement("div");e7.className="ls-timeline-rows";e5.append(e6,e7);e0.append(e1,e2,e3,e4,e5);var __rootValue=e0;return{"markerContainer":e1,"playerHead":e2,"selectionRect":e3,"snapLine":e4,"scrollContainer":e5,"spacerElement":e6,"rowContainer":e7,root:__rootValue};}


    // :shrug:
    // const computeZoomMultiplier = (zoom) => {
    //     return zoom < 0.005 ? 512
    //         : zoom < 0.01 ? 256
    //         : zoom < 0.015 ? 128
    //         : zoom < 0.02 ? 64
    //         : zoom < 0.05 ? 32
    //         : zoom < 0.1 ? 16
    //         : zoom < 0.25 ? 8
    //         : zoom < 0.5 ? 4
    //         : zoom < 10 ? 1
    //         : 0.5;
    // };

    LS.LoadComponent(class Timeline extends LS.Component {
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
                dependencies: ["Menu", "Resize"]
            });

            this.options = LS.Util.defaults(DEFAULTS, options);

            const element = TEMPLATE();

            this.container = element.root;
            this.scrollContainer = element.scrollContainer;
            this.rowContainer = element.rowContainer;
            this.spacerElement = element.spacerElement;
            this.markerContainer = element.markerContainer;
            this.playerHead = element.playerHead;
            this.selectionRect = element.selectionRect;
            this.snapLine = element.snapLine;

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

            this.__rendered = new Set();
            this.__needsSort = false;
            this.maxDuration = 0;
            this.#duration = 0;
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
            let edgeScrollSpeedX = 0, edgeScrollSpeedY = 0, edgeScrollRaf = null, lastCursorX = 0;

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

            const updateSelectionBox = (x, y) => {
                const currentX = x;
                const currentY = y;
                
                const scrollLeft = this.offset;
                const scrollTop = this.scrollContainer.scrollTop;

                const startScreenX = selectStartWorldX - scrollLeft;
                const startScreenY = selectStartWorldY - scrollTop;

                const left = Math.min(startScreenX, currentX);
                const top = Math.min(startScreenY, currentY);
                const width = Math.abs(currentX - startScreenX);
                const height = Math.abs(currentY - startScreenY);
                
                this.selectionRect.style.transform = `translate3d(${left}px, ${top}px, 0)`;
                this.selectionRect.style.width = `${width}px`;
                this.selectionRect.style.height = `${height}px`;

                const worldLeft = left + scrollLeft;
                const worldRight = worldLeft + width;
                
                const timeStart = worldLeft / this.#zoom;
                const timeEnd = worldRight / this.#zoom;
                
                const rowRect = this.rowContainer.getBoundingClientRect();
                const containerRect = this.container.getBoundingClientRect();
                const relativeRowTop = rowRect.top - containerRect.top;
                
                const boxTopRel = top - relativeRowTop;
                const boxBottomRel = boxTopRel + height;
                
                const rowHeight = this.rowElements.length > 0 ? this.rowElements[0].offsetHeight : 30;
                if(rowHeight <= 0) return;

                const rowStart = Math.floor(boxTopRel / rowHeight);
                const rowEnd = Math.floor(boxBottomRel / rowHeight);

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
                    if (dragType === "seek") {
                        const worldX = lastCursorX + this.offset;
                        this.setSeek(worldX / this.#zoom);
                    } else if (dragType === "select") {
                        updateSelectionBox(lastCursorX, lastCursorY);
                    } else if (dragState.draggingItems) {
                        const rect = this.container.getBoundingClientRect();
                        updateDragItemPosition(lastCursorX + rect.left, lastCursorY + rect.top);
                    }
                    edgeScrollRaf = this.ctx.requestAnimationFrame(processEdgeScroll);
                } else {
                    stopEdgeScroll();
                }
            };

            const processInertia = () => {
                if (Math.abs(velocityX) > 0.5) {
                    this.offset -= velocityX;
                    velocityX *= 0.92; // Friction
                    inertiaRaf = this.ctx.requestAnimationFrame(processInertia);
                } else {
                    stopInertia();
                }
            };

            const dragState = {};

            const updateDragItemPosition = (x, y) => {
                if (this.options.snapEnabled && !dragState.disableSnapping) {
                    const snapValues = dragState.snapValues;
                    const snapArea = 10;
                    let snapped = false;
                    if (Array.isArray(snapValues)) {
                        const currentItemTop = y - (dragState.dragOffsetY || 0);
                        const currentItemHeight = dragState.itemHeight || 0;

                        for (const snap of snapValues) {
                            if (snap.dest - x > -snapArea && snap.dest - x < snapArea) {
                                x = snap.dest;
                                if (this.snapLine) {
                                    const top = Math.min(snap.top, y);
                                    const height = Math.max(snap.top + snap.height, currentItemTop + currentItemHeight) - top;

                                    this.snapLine.style.transform = `translate3d(${snap.line}px, ${top}px, 0)`;
                                    this.snapLine.style.height = `${height}px`;
                                    this.snapLine.style.display = "block";
                                }
                                snapped = true;
                                break;
                            }
                        }
                    }
                    if (!snapped && this.snapLine) this.snapLine.style.display = "none";
                } else {
                    if (this.snapLine) this.snapLine.style.display = "none";
                }

                const rect = this.container.getBoundingClientRect();
                const currentWorldX = (x - rect.left) + this.offset;
                const currentWorldY = (y - rect.top) + this.scrollContainer.scrollTop;

                const deltaWorldX = currentWorldX - dragState.startWorldX;
                const deltaWorldY = currentWorldY - dragState.startWorldY;

                let deltaTime = deltaWorldX / this.#zoom;
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
                    entry.item.start = entry.start + deltaTime;
                    entry.item.row = entry.row + clampedRowOffset;
                }

                this.__needsSort = true;
                this.frameScheduler.schedule();
            };

            this.dragHandle = new LS.Util.TouchHandle(this.container, {
                exclude: ".ls-resize-handle, .ls-automation-point-handle, .ls-automation-center-handle",
                frameTimed: true,

                onStart: (event) => {
                    if(event.domEvent.button === 2) return event.cancel(); // Temporarily disabled until implemented

                    stopInertia();
                    stopEdgeScroll();

                    this.dragHandle.options.pointerLock = false;

                    rect = this.container.getBoundingClientRect();
                    const itemElement = event.domEvent.button === 0 ? event.domEvent.target.closest(".ls-timeline-item") : null;
                    this.dragHandle.options.disablePointerEvents = !itemElement;

                    // Prepare for dragging items, if that is what we're doing
                    if(itemElement) {

                        // Dragging an item
                        dragState.draggingItems = true;
                        dragState.itemElement = itemElement;
                        dragState.item = itemElement.__timelineItem || this.items.find(i => i.element === itemElement);
                        dragState.startX = event.x;
                        dragState.startY = event.y;
                        dragState.startWorldX = (event.x - rect.left) + this.offset;
                        dragState.startWorldY = (event.y - rect.top) + this.scrollContainer.scrollTop;
                        dragState.disableSnapping = false;
                        dragState.isCloning = event.domEvent.shiftKey; // Shift+drag to clone

                        let itemsToMove = this.selectedItems.size && this.selectedItems.has(dragState.item) ? Array.from(this.selectedItems) : [dragState.item];

                        if (this.options.snapEnabled) {
                            dragState.snapValues = [];
                            const cw = dragState.item.duration * this.#zoom;
                            const vh = window.innerHeight;
                            const vw = window.innerWidth;
                            const itemRect = dragState.itemElement.getBoundingClientRect();
                            const dragOffset = event.x - itemRect.left;
                            
                            dragState.dragOffsetY = event.y - itemRect.top;
                            dragState.itemHeight = itemRect.height;

                            for (const item of this.items) {
                                const element = item.timelineElement;
                                if (!element || element === dragState.itemElement) continue;

                                // Exclude all selected items from snapping
                                if (itemsToMove.includes(item)) continue;

                                const box = element.getBoundingClientRect();

                                // Skip invisible or off-screen elements
                                if (box.width === 0 && box.height === 0) continue;
                                if (box.bottom < -50 || box.top > vh + 50 || box.right < -50 || box.left > vw + 50) continue;

                                dragState.snapValues.push(
                                    { dest: box.left + dragOffset, line: box.left, top: box.top, height: box.height },
                                    { dest: box.right + dragOffset, line: box.right, top: box.top, height: box.height },
                                    { dest: (box.left - cw) + dragOffset, line: box.left, top: box.top, height: box.height },
                                    { dest: (box.right - cw) + dragOffset, line: box.right, top: box.top, height: box.height }
                                );
                            }
                        } else dragState.snapValues = [];

                        // Save initial positions for undo
                        dragState._initialPositions = itemsToMove.map((itm) => ({
                            item: itm,
                            start: itm.start,
                            row: itm.row || 0
                        }));

                        // Shift+drag to clone items
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
                            dragState._initialPositions = clonedItems.map((itm) => ({
                                item: itm,
                                start: itm.start,
                                row: itm.row || 0
                            }));
                            
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
                            
                            itemsToMove = clonedItems;
                        }
                        return;
                    } else {
                        dragState.draggingItems = false;
                    }

                    const touchEvent = event.domEvent.type.startsWith("touch");
                    const button = touchEvent? ((event.domEvent.target === this.scrollContainer || this.scrollContainer.contains(event.domEvent.target)) ? 1 : 0) : event.domEvent.button;

                    if (event.domEvent.ctrlKey && button === 0) {
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

                    if (dragState.draggingItems) {
                        const threshold = 50;
                        const maxSpeed = 15;

                        edgeScrollSpeedX = 0;
                        edgeScrollSpeedY = 0;

                        if (cursorX < threshold) edgeScrollSpeedX = -maxSpeed * ((threshold - cursorX) / threshold);
                        else if (cursorX > rect.width - threshold) edgeScrollSpeedX = maxSpeed * ((cursorX - (rect.width - threshold)) / threshold);
                        
                        if (cursorY < threshold) edgeScrollSpeedY = -maxSpeed * ((threshold - cursorY) / threshold);
                        else if (cursorY > rect.height - threshold) edgeScrollSpeedY = maxSpeed * ((cursorY - (rect.height - threshold)) / threshold);

                        if ((edgeScrollSpeedX !== 0 || edgeScrollSpeedY !== 0) && !edgeScrollRaf) {
                            edgeScrollRaf = this.ctx.requestAnimationFrame(processEdgeScroll);
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
                        const sensitivity = 0.5;
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
                    } else if (dragType === "seek" || dragType === "select") {
                        if (dragType === "seek") {
                            const worldX = cursorX + this.offset;
                            const time = worldX / this.#zoom;
                            this.setSeek(time);
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
                            edgeScrollRaf = this.ctx.requestAnimationFrame(processEdgeScroll);
                        }

                        this.quickEmit("drag-move", dragType, cursorX, cursorY);
                    } else if (dragType === "delete") {
                        // TODO: implement delete
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
                    }

                    if (this.snapLine) this.snapLine.style.display = "none";

                    stopEdgeScroll();
                    this.ctx.setTimeout(() => this.__isDragging = false, 10);

                    this.quickEmit("drag-end", dragType);
                    dragType = null;
                }
            });

            this.focusedItem = null;
            this.container.addEventListener("contextmenu", (event) => {
                event.preventDefault();

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

            this.container.addEventListener("click", (event) => {
                if (this.__isDragging) return;

                const itemElement = event.target.closest(".ls-timeline-item");
                if (itemElement) {
                    const item = itemElement.__timelineItem || this.items.find(i => i.element === itemElement);
                    if (item) {
                        this.select(item);
                    }
                } else {
                    this.deselectAll();
                }
            });

            document.addEventListener('wheel', this.__wheelHandler = (event) => {
                if (!event.ctrlKey) return;
                if (event.target !== this.container && !this.container.contains(event.target)) return;

                event.preventDefault();

                const rect = this.container.getBoundingClientRect();
                const cursorX = event.clientX - rect.left;
                const currentZoom = this.#zoom;

                const zoomDelta = currentZoom * 0.16 * (event.deltaY > 0 ? -1 : 1);
                this.zoom = currentZoom + zoomDelta;

                const worldX = (cursorX + this.offset) / currentZoom;
                this.offset = (worldX * this.zoom) - cursorX;
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
                this.#offset = this.scrollContainer.scrollLeft;
                if (this.#offset !== previousScrollLeft) {
                    previousScrollLeft = this.#offset;
                    this.frameScheduler.schedule();
                }
            });

            if(this.options.resizable && !LS.Resize) {
                console.warn("LS.Timeline: LS.Resize component is required for resizable timeline items.");
            }

            this.clipboard = [];
            
            // Undo/Redo action events (history management is external)
            this.__actionEventRef = this.prepareEvent("action");

            this.container.addEventListener("keydown", (event) => {
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

        // --- Camera state values (do not influence content) ---
        #offset = 0;
        #zoom = 1;
        #rowHeight = 30;

        get rowHeight() {
            return this.#rowHeight;
        }

        set rowHeight(value) {
            value = clamp(value, 20, 500);
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
            this.#offset = value;
            this.frameScheduler.schedule();
        }

        // --- Player state values (do influence content) ---
        #seek = 0;
        #duration = 0;

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

            let totalDuration = 0;
            this.maxDuration = 0;

            for (let i = 0; i < this.items.length; i++) {
                const item = this.items[i];
                if (!item.id) {
                    item.id = LS.Misc.uid();
                    this.itemMap.set(item.id, item);
                }
                if (!item.duration || item.duration < 0) item.duration = 0;
                if (!item.start || item.start < 0) item.start = 0;
                if (!item.row || item.row < 0) item.row = 0;
                if (item.duration > this.maxDuration) this.maxDuration = item.duration;
                if (!item.data) item.data = {};
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

                const itemElement = item.timelineElement || this.createTimelineElement(item);
                const itemRow = item.row || 0;

                // Ensure we do not trigger CSS layout - only update if changed
                if (computedWidth !== item.__previousWidth) {
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
                    const clip = item.__automationClip;
                    if (needsAppend) {
                        if (!clip && autoCreateAutomation) {
                            const data = item.data || (item.data = {});
                            data.points = data.points || [];
                            item.__automationClip = new LS.AutomationGraph({ items: data.points, value: data.value || 0 });
                        }
                        if (item.__automationClip) {
                            item.__automationClip.setElement(itemElement);
                            item.__automationClip.updateScale(zoom);
                            item.__automationClip.updateSize(computedWidth, automationHeight);
                        }
                    } else if (clip) {
                        clip.updateScale(zoom);
                        if (computedWidth !== item.__previousWidth || rowHeight !== item.__previousHeight) {
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
            this.ctx.requestAnimationFrame(() => this.#updateHeadPosition());
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
         * @property {string|null} [color=null] - Accent color for the item
         * @property {*} [data=null] - Custom data associated with the item
         */
        add(item) {
            this.items.push(item);
            // If no ID, it will be assigned during sorting
            if(item.id) this.itemMap.set(item.id, item);
            this.__needsSort = true;
            this.frameScheduler.schedule();
        }

        cloneItem(item, keepId = false) {
            const id = keepId? item.id: LS.Misc.uid();
            return {
                start: item.start,
                duration: item.duration,
                id: id,
                row: item.row || 0,
                label: item.label || id,
                color: item.color || null,
                data: item.data && LS.Util.clone(item.data, (key, value) => {
                    // Skip prefixed properties, DOM elements, and functions
                    if (key.startsWith("_") || (value instanceof Element) || typeof value === "function") return undefined;
                    return true;
                }),
                type: item.type || null,
                ...item.cover? { cover: item.cover }: null,
                ...item.waveform? { waveform: item.waveform }: null,
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
            item.duration = splitTime - item.start;
            
            newItem.start = splitTime;
            newItem.duration = originalEndTime - splitTime;

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
                accent: item.color || null,
                style: item.cover ? `background-image: url('${item.cover}'); background-size: cover; background-position: center;` : ""
            });

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

            Object.defineProperty(item, "color", {
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

            if (LS.Resize && this.options.resizable) {
                const { left, right } = LS.Resize.set(item.timelineElement, {
                    left: true,
                    right: true,
                    translate: true,
                    anchor: 0,
                    minWidth: 5,
                });

                const resizeHandler = (width, side) => {
                    if(side === 'left') {
                        const newDuration = width / this.#zoom;
                        const endTime = item.start + item.duration;
                        item.start = endTime - newDuration;
                        item.duration = newDuration;
                    } else {
                        item.duration = width / this.#zoom;
                    }

                    if (item.type === "automation" && item.__automationClip) {
                        item.__automationClip.updateSize(width, this.rowHeight - this.options.itemHeaderHeight);
                    }

                    // Resize all selected items proportionally
                    if (this.selectedItems.size > 1) {
                        for (const selectedItem of this.selectedItems) {
                            if (selectedItem === item) continue;
                            
                            if (side === 'left') {
                                const newDuration = width / this.#zoom;
                                const endTime = selectedItem.start + selectedItem.duration;
                                selectedItem.start = endTime - newDuration;
                                selectedItem.duration = newDuration;
                            } else {
                                selectedItem.duration = width / this.#zoom;
                            }
                        }
                    }

                    LS.Tooltips.set(this.formatMarker(item.duration)).position(item.timelineElement).show();
                    this.frameScheduler.schedule();
                }

                left.handler.on("resize", (width) => {
                    resizeHandler(width, 'left');
                });

                right.handler.on("resize", (width) => {
                    resizeHandler(width, 'right');
                });

                left.handler.on("resize-end", () => {
                    this.__needsSort = true;
                    LS.Tooltips.hide();
                    this.frameScheduler.schedule();
                });

                right.handler.on("resize-end", (width) => {
                    this.__needsSort = true;
                    LS.Tooltips.hide();
                    this.frameScheduler.schedule();
                });
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
                if(LS.Resize) LS.Resize.remove(item.timelineElement);
                if(item.timelineElement.parentNode) item.timelineElement.remove();
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
            if(this.destroyed) return;

            for (let item of this.items) {
                if (destroyItems) {
                    this.destroyItem(item);
                } else if (item.timelineElement && item.timelineElement.parentNode) {
                    if (item.type === "automation" && item.__automationClip) {
                        item.__automationClip.setElement(null);
                    }
                    item.timelineElement.remove();
                }
            }

            this.maxDuration = 0;
            this.#duration = 0;
            this.clearUnusedRows();
            this.reserveRows(this.options.startingRows);

            this.items = replacingItems || [];
            this.itemMap.clear();
            if (replacingItems) {
                for (const item of this.items) {
                    if (!item.id) item.id = LS.Misc.uid();
                    this.itemMap.set(item.id, item);
                }
                this.sortItems();
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

            return this.items.map(item => this.cloneItem(item, true));
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
            this.container.remove();
            this.clipboard = null;
            this.__actionEventRef = null;
            this.container = null;
            this.markerPool = null;
            this.activeMarkers = null;
            this.selectedItems.clear();
            this.selectedItems = null;
            this.items = null;
            this.itemMap = null;
            this.__rendered = null;
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

            this.__seekEventRef = null;
            this.__fileProcessEventRef = null;

            document.removeEventListener('wheel', this.__wheelHandler);
            this.__wheelHandler = null;

            if (this.container && this.__nativeDragOverHandler) {
                this.container.removeEventListener('dragover', this.__nativeDragOverHandler);
                this.__nativeDragOverHandler = null;
            }
            if (this.container && this.__nativeDropHandler) {
                this.container.removeEventListener('drop', this.__nativeDropHandler);
                this.__nativeDropHandler = null;
            }

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