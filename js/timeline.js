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
 * - Complete drag and drop functionality
 * - Add a multi-timeline swap functionality
 * - Implement proper playback API
 * - Proper drag-drop cleanup on destroy
 * 
 * CRITICAL:
 * - Dragging multiple elements does not work
 * - Snapping issues (desync when dragging & right side snap)
 * - Resizing is not proportional
 * - etc
 * 
 * As of 5.2.7 i'll take a break and just mark it as incomplete because this one stupid
 * component is insane in complexity and I wan't to move on to other parts, otherwise I'd get nowhere.
 * 
 * I'm thinking using WebGL would have been much easier and better lmao 😭
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
        rowHeight: 45
    };

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
                dependencies: ["DragDrop", "Resize"]
            });

            if(!LS.DragDrop) {
                throw new Error("LS.Timeline: LS.DragDrop component is required for drag and drop functionality.");
            }

            this.options = LS.Util.defaults(DEFAULTS, options);

            this.container = LS.Create({
                attributes: { tabindex: "0" },
                inner: [
                    (this.markerContainer = LS.Create({
                        class: "ls-timeline-markers"
                    })),

                    (this.playerHead = LS.Create({
                        class: "ls-timeline-player-head"
                    })),

                    (this.selectionRect = LS.Create({
                        class: "ls-timeline-selection-rect",
                        style: "position: absolute; pointer-events: none; display: none; border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 50%, rgba(0, 0, 0, 0.2) 50%); z-index: 100;"
                    })),

                    (this.scrollContainer = LS.Create({
                        class: "ls-timeline-scroll-container",
                        inner: [
                            (this.spacerElement = LS.Create({
                                class: "ls-timeline-spacer",
                                style: "height: 1px; width: 0px;"
                            })),

                            (this.rowContainer = LS.Create({
                                class: "ls-timeline-rows"
                            }))
                        ]
                    }))
                ]
            });

            if (this.options.element) {
                this.options.element.appendChild(this.container);
            }

            this.container.classList.add("ls-timeline");
            this.container.__lsComponent = this;

            this.items = [];

            this.rowElements = [];

            this.markerPool = [];
            this.activeMarkers = [];

            this.selectedItems = new Set();

            this.__rendered = new Set();
            this.__needsSort = false;
            this.maxDuration = 0;
            this.#duration = 0;
            this.__spacerWidth = 0;

            this.dragDrop = new LS.DragDrop({
                id: "timeline-dragdrop",
                container: this.rowContainer,
                scrollContainer: this.scrollContainer,
                relativeMouse: true,
                clone: false,
                absoluteX: true,
                absoluteY: false,
                dropPreview: true,
                animate: false,
                snapEnabled: true,
                strictDrop: false,
                multiList: this.selectedItems,
                multiBehavior: "relative",
                handleOptions: {
                    exclude: true
                },
                // sameParent: true,
                allowedTargets: ["timeline-row"],
            });

            this.frameScheduler = new LS.Util.FrameScheduler(() => this.#render());
            this.reserveRows(this.options.reservedRows);

            // Mouse/touch drag
            // TODO: Should not block scrolling on mobile
            let dragType = null, rect = null, startX = 0, startY = 0;
            let selectStartWorldX = 0, selectStartWorldY = 0, lastCursorY = 0;
            
            // Inertia & Edge Scroll state
            let velocityX = 0, lastMoveTime = 0, inertiaRaf = null;
            let edgeScrollSpeed = 0, edgeScrollRaf = null, lastCursorX = 0;

            const stopInertia = () => {
                if (inertiaRaf) cancelAnimationFrame(inertiaRaf);
                inertiaRaf = null;
            };

            const stopEdgeScroll = () => {
                if (edgeScrollRaf) cancelAnimationFrame(edgeScrollRaf);
                edgeScrollRaf = null;
                edgeScrollSpeed = 0;
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
                if (edgeScrollSpeed !== 0) {
                    this.offset += edgeScrollSpeed;
                    // Update seek position based on the last known cursor position relative to the moving viewport
                    if (dragType === "seek") {
                        const worldX = lastCursorX + this.offset;
                        this.setSeek(worldX / this.#zoom);
                    } else if (dragType === "select") {
                        updateSelectionBox(lastCursorX, lastCursorY);
                    }
                    edgeScrollRaf = requestAnimationFrame(processEdgeScroll);
                } else {
                    stopEdgeScroll();
                }
            };

            const processInertia = () => {
                if (Math.abs(velocityX) > 0.5) {
                    this.offset -= velocityX;
                    velocityX *= 0.92; // Friction
                    inertiaRaf = requestAnimationFrame(processInertia);
                } else {
                    stopInertia();
                }
            };

            this.dragHandle = LS.Util.touchHandle(this.container, {
                exclude: ".ls-timeline-item, .ls-timeline-item *",

                onStart: (event, cancel, x, y) => {
                    stopInertia();
                    stopEdgeScroll();
                    this.dragHandle.options.pointerLock = false;

                    const touchEvent = event.type.startsWith("touch");
                    const button = touchEvent? ((event.target === this.scrollContainer || this.scrollContainer.contains(event.target)) ? 1 : 0) : event.button;

                    if (event.ctrlKey && button === 0) {
                        dragType = "select";
                    } else if (event.ctrlKey && button === 1) {
                        dragType = "zoom-v";
                        this.dragHandle.options.pointerLock = true;
                    } else {
                        dragType = button === 0 ? "seek" : button === 1 ? "pan" : button === 2 ? "delete" : null;
                    }

                    if (!dragType) {
                        cancel();
                        return;
                    }

                    rect = this.container.getBoundingClientRect();
                    startX = x;
                    startY = y;
                    
                    // Capture world coordinates for selection to handle scrolling
                    selectStartWorldX = (x - rect.left) + this.offset;
                    selectStartWorldY = (y - rect.top) + this.scrollContainer.scrollTop;

                    velocityX = 0;
                    lastMoveTime = performance.now();

                    if (dragType === "select") {
                        this.selectionRect.style.display = "block";
                        this.selectionRect.style.width = "0px";
                        this.selectionRect.style.height = "0px";
                        this.dragHandle.cursor = "crosshair";
                        this.selectedItems.clear();
                        this.frameScheduler.schedule();
                    } else {
                        this.dragHandle.cursor = dragType === "pan" ? "grabbing" : dragType === "seek" ? "ew-resize" : dragType === "zoom-v" ? "none" : "no-drop";
                        if (dragType === "seek") {
                            this.deselectAll();
                        }
                    }

                    this.emit("drag-start", [dragType]);
                },

                onMove: (x, y) => {
                    const now = performance.now();
                    this.__isDragging = true;

                    if (dragType === "pan") {
                        const deltaX = x - startX;
                        const deltaY = y - startY;
                        this.offset -= deltaX;
                        this.scrollContainer.scrollTop -= deltaY;
                        
                        // Track velocity
                        velocityX = deltaX;
                        
                        startX = x;
                        startY = y;

                        this.emit("drag-move", [dragType, deltaX, deltaY]);
                    } else if (dragType === "zoom-v") {
                        const deltaY = y - startY;
                        const sensitivity = 0.5;
                        const oldHeight = this.rowHeight;
                        const targetHeight = oldHeight - (deltaY * sensitivity);

                        this.rowHeight = targetHeight;
                        const newHeight = this.rowHeight;

                        if (newHeight !== oldHeight) {
                            const rect = this.scrollContainer.getBoundingClientRect();
                            const mouseY = startY - rect.top;
                            const oldScrollTop = this.scrollContainer.scrollTop;
                            const contentY = oldScrollTop + mouseY;
                            
                            const ratio = newHeight / oldHeight;
                            this.scrollContainer.scrollTop = (contentY * ratio) - mouseY;
                        }
                        
                        startY = y;

                        this.emit("drag-move", [dragType, 0, deltaY]);
                    } else if (dragType === "seek" || dragType === "select") {
                        const cursorX = x - rect.left;
                        const cursorY = y - rect.top;
                        lastCursorX = cursorX;
                        lastCursorY = cursorY;

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
                        
                        if (cursorX < threshold) {
                            edgeScrollSpeed = -maxSpeed * ((threshold - cursorX) / threshold);
                        } else if (cursorX > rect.width - threshold) {
                            edgeScrollSpeed = maxSpeed * ((cursorX - (rect.width - threshold)) / threshold);
                        } else {
                            edgeScrollSpeed = 0;
                        }
                        
                        if (edgeScrollSpeed !== 0 && !edgeScrollRaf) {
                            edgeScrollRaf = requestAnimationFrame(processEdgeScroll);
                        }

                        this.emit("drag-move", [dragType, cursorX, cursorY]);
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

                    stopEdgeScroll();
                    setTimeout(() => this.__isDragging = false, 10);

                    this.emit("drag-end", [dragType]);
                    dragType = null;
                }
            });

            this.container.addEventListener("click", (event) => {
                if (this.__isDragging) return;

                const itemElement = event.target.closest(".ls-timeline-item");
                if (itemElement) {
                    const item = this.items.find(i => i.timelineElement === itemElement);
                    if (item) {
                        this.select(item);
                    }
                } else {
                    this.deselectAll();
                }
            });

            this.__wheelHandler = (event) => {
                if (event.target !== this.container && !this.container.contains(event.target)) return;
                if (!event.ctrlKey) return;

                event.preventDefault();

                const rect = this.container.getBoundingClientRect();
                const cursorX = event.clientX - rect.left;
                const currentZoom = this.#zoom;

                const zoomDelta = currentZoom * 0.16 * (event.deltaY > 0 ? -1 : 1);
                this.zoom = currentZoom + zoomDelta;

                const worldX = (cursorX + this.offset) / currentZoom;
                this.offset = (worldX * this.zoom) - cursorX;
            };

            document.addEventListener('wheel', this.__wheelHandler, { passive: false });

            // Allow native file drops on the timeline and emit processing info
            this.__nativeDragOverHandler = (event) => {
                const dt = event.dataTransfer;
                if (!dt) return;
                // Only intercept when files are present
                const types = dt.types ? Array.from(dt.types) : [];
                if (!types.includes('Files')) return;
                event.preventDefault();
                try { dt.dropEffect = 'copy'; } catch (_) { /* noop */ }
            };

            this.__nativeDropHandler = (event) => {
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

                const files = Array.from(dt.files);
                this.emit(this.__fileProcessEventRef, [files, rowIndex, timeOffset]);
            };

            this.container.addEventListener('dragover', this.__nativeDragOverHandler);
            this.container.addEventListener('drop', this.__nativeDropHandler);

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

            // this.dragDrop.on("drag", (elements) => { });

            this.dragDrop.on("drop", (event) => {
                console.log(event);
                
                for(const el of event.items) {
                    const item = el.__timelineItem || this.items.find(i => i.timelineElement === event.source);
                    if (item && event.target.classList.contains("ls-timeline-row")) {
                        const newRow = this.rowElements.indexOf(event.target);
                        item.row = newRow;
                        item.start = (event.boundX + this.#offset) / this.#zoom;
                        if(this.options.autoAppendRows && newRow === this.rowElements.length) {
                            // Add an extra track
                            this.addTrack();
                        }
                    }

                    this.__needsSort = true;
                    this.frameScheduler.schedule();
                }
            });

            // this.dragDrop.on("cancel", (element) => { });

            this.clipboard = [];

            this.container.addEventListener("keydown", (event) => {
                console.log(event);
                
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
                    for (const entry of this.clipboard) {
                        const newItem = this.cloneItem(entry.data);
                        newItem.start = this.seek + entry.offset;
                        newItem.row = entry.row;
                        this.add(newItem);
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
            this.frameScheduler.schedule();
        }

        setSeek(value) {
            value = Math.max(0, value);
            if(this.#seek === value) return;
            this.seek = value;
            this.emit(this.__seekEventRef, [this.#seek]);
        }

        get duration() {
            return this.#duration;
        }

        binarySearch(time) {
            let low = 0;
            let high = this.items.length - 1;

            while (low <= high) {
                const mid = (low + high) >>> 1;
                if (this.items[mid].start < time) {
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
                if (!item.duration || item.duration < 0) item.duration = 0;
                if (!item.start || item.start < 0) item.start = 0;
                if (!item.row || item.row < 0) item.row = 0;
                if (item.duration > this.maxDuration) this.maxDuration = item.duration;
                const end = item.start + item.duration;
                if (end > totalDuration) totalDuration = end;
            }

            this.__needsSort = false;

            this.emit("sorted", [this.maxDuration]);
            if (totalDuration !== this.#duration) {
                this.#duration = totalDuration;
                this.emit("duration-changed", [this.#duration]);
            }
        }

        reserveRows(number) {
            while (this.rowElements.length < number) {
                const rowElement = LS.Create({
                    class: "ls-timeline-row"
                });

                this.dragDrop.dropZone(rowElement, {

                });
                rowElement.lsDropTarget = "timeline-row";

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

            const worldLeft = this.#offset;
            const viewportWidth = this.container.clientWidth;
            const worldRight = worldLeft + viewportWidth;

            if (this.__needsSort) {
                this.sortItems();
            }

            // Update spacer width
            // Ensure the spacer is wide enough for the content plus padding, regardless of zoom/offset
            const endPadding = viewportWidth * 0.5;
            const contentWidth = this.#duration * this.#zoom;
            const spacerWidth = Math.max(contentWidth + endPadding, worldRight + endPadding);

            if (Math.abs(this.__spacerWidth - spacerWidth) > 1) {
                this.spacerElement.style.width = `${spacerWidth}px`;
                this.__spacerWidth = spacerWidth;
            }

            // --- Marker Logic ---
            // Translate the container to counteract scrolling, creating a virtual viewport
            this.markerContainer.style.transform = `translate3d(${-worldLeft}px, 0, 0)`;

            const minMarkerDist = this.options.markerSpacing;
            const minTimeStep = minMarkerDist / this.#zoom;
            // Find nearest power of 2 for clean steps (0.5, 1, 2, 4, 8...)
            let step = Math.pow(2, Math.ceil(Math.log2(minTimeStep)));
            
            // Align start time to step grid
            const startTime = Math.floor(worldLeft / this.#zoom / step) * step;
            const endTime = worldRight / this.#zoom;

            let markerIndex = 0;
            for (let time = startTime; time <= endTime + step; time += step) {
                const t = Math.round(time * 1000) / 1000; // Fix float precision
                if (t < 0) continue;

                let marker;
                if (markerIndex < this.activeMarkers.length) {
                    marker = this.activeMarkers[markerIndex];
                } else {
                    // Reuse or create new marker
                    marker = this.markerPool.pop() || LS.Create({
                        class: "ls-timeline-marker"
                    });
                    this.markerContainer.appendChild(marker);
                    this.activeMarkers.push(marker);
                }

                const pos = t * this.#zoom;
                
                // Since the container moves with scroll, markers stay at fixed world coordinates
                if (marker.__pos !== pos) {
                    marker.style.transform = `translateX(${pos}px)`;
                    marker.__pos = pos;
                }
                
                // Only update text if time changed (optimization)
                if (marker.__time !== t) {
                    marker.innerText = this.formatMarker(t, step);
                    marker.__time = t;
                }
                markerIndex++;
            }

            // Recycle unused markers
            while (markerIndex < this.activeMarkers.length) {
                const marker = this.activeMarkers.pop();
                marker.remove();
                this.markerPool.push(marker);
            }

            const chunkSize = this.options.chunkSize === "auto"
                ? this.items.length < 1000 ? 2000
                : this.items.length < 5000 ? 500
                : 100
                : this.options.chunkSize;

            // Snap the render window to a grid defined by chunkSize
            // This ensures that the set of rendered items remains stable while scrolling within a chunk
            const chunkStart = Math.floor((worldLeft - chunkSize) / chunkSize) * chunkSize;
            const chunkEnd = Math.ceil((worldRight + chunkSize) / chunkSize) * chunkSize;

            const minX = chunkStart - this.#offset;
            const maxX = chunkEnd - this.#offset;

            // Find the first item that could possibly be visible
            // We look back by maxDuration to ensure we catch long items starting before the view
            const visibleStartTime = chunkStart / this.#zoom;
            const searchStartTime = Math.max(0, visibleStartTime - this.maxDuration);
            const startIndex = this.binarySearch(searchStartTime);

            for (let i = startIndex; i < this.items.length; i++) {
                // debug_scanned++;

                const item = this.items[i];
                const computedWidth = item.duration * this.#zoom;
                const computedX = item.start * this.#zoom - this.#offset;

                // Early out
                if (computedX > maxX) {
                    break;
                }

                const itemElement = item.timelineElement || this.createTimelineElement(item);

                if(this.dragDrop.dragging && this.dragDrop.currentElement === itemElement) {
                    this.__rendered.delete(itemElement);
                    itemElement.__eligible = true;
                    continue;
                }

                // Drop items that are too small to be seen
                if(computedWidth <= 0 || computedX + computedWidth < minX) {
                    continue;
                }

                // Ensure we do not trigger CSS layout
                const widthChanged = computedWidth !== item.__previousWidth;
                if (widthChanged) {
                    itemElement.style.width = `${computedWidth}px`;
                    item.__previousWidth = computedWidth;
                }

                if (this.selectedItems.has(item)) {
                    itemElement.classList.add("selected");
                } else {
                    itemElement.classList.remove("selected");
                }

                itemElement.style.transform = `translate3d(${computedX}px, 0, 0)`;

                this.reserveRows((item.row || 0) + 1);
                const rowElement = this.rowElements[item.row || 0];
                if (!itemElement.isConnected || itemElement.parentNode !== rowElement) {
                    rowElement.appendChild(itemElement);

                    if (item.type === "automation") {
                        if (!item.__automationClip && this.options.autoCreateAutomationClips) {
                            item.data = item.data || {};
                            item.data.points = item.data.points || [];
                            item.__automationClip = new LS.AutomationGraph({ items: item.data.points, value: item.data.value || 0 });
                        }
                        if (item.__automationClip) {
                            item.__automationClip.setElement(itemElement);
                            item.__automationClip.updateScale(this.#zoom);
                            item.__automationClip.updateSize(computedWidth, this.rowHeight - this.options.itemHeaderHeight);
                        }
                    }
                } else {
                    if (item.type === "automation" && item.__automationClip) {
                        item.__automationClip.updateScale(this.#zoom);
                        if (widthChanged || this.rowHeight !== item.__previousHeight) {
                            item.__automationClip.updateSize(computedWidth, this.rowHeight - this.options.itemHeaderHeight);
                            item.__previousHeight = this.rowHeight;
                        }
                    }
                }

                this.__rendered.add(itemElement);
                itemElement.__eligible = true;
            }

            // Hide non-eligible items
            for (let child of this.__rendered) {
                if (!child.__eligible) {
                    if (child.__timelineItem && child.__timelineItem.type === "automation" && child.__timelineItem.__automationClip) {
                        child.__timelineItem.__automationClip.setElement(null);
                    }
                    child.remove();
                    this.__rendered.delete(child);
                } else {
                    child.__eligible = false;
                }
            }

            const headPos = (this.#seek * this.#zoom) - worldLeft;
            if (this.__headPos !== headPos) {
                this.playerHead.style.transform = `translate3d(${headPos}px, 0, 0)`;
                this.__headPos = headPos;
            }

            // console.log(`Timeline rendered: scanned ${debug_scanned} items to render ${this.__rendered.size} items in ${performance.now() - debug_time} ms.`);
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
            this.emit("item-select", [item]);
            this.frameScheduler.schedule();
        }

        deselectAll() {
            if (this.selectedItems.size > 0) {
                this.selectedItems.clear();
                this.frameScheduler.schedule();
            }
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
            this.__needsSort = true;
            this.frameScheduler.schedule();
        }

        remove(item) {
            const index = this.items.indexOf(item);
            if (index >= 0) {
                this.items.splice(index, 1);
                if (item.timelineElement && item.timelineElement.parentNode) {
                    item.timelineElement.remove();
                }
                this.__needsSort = true;
                this.frameScheduler.schedule();
            }
        }

        cloneItem(item) {
            return {
                start: item.start,
                id: item.id || null,
                duration: item.duration,
                row: item.row || 0,
                label: item.label || "",
                color: item.color || null,
                data: item.data || null,
                type: item.type || null,
                cover: item.cover || null,
                waveform: item.waveform || null,
            };
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
            
            // Update durations and start times
            const originalEndTime = item.start + item.duration;
            item.duration = splitTime - item.start;
            
            newItem.start = splitTime;
            newItem.duration = originalEndTime - splitTime;

            this.add(newItem);
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

                this.dragDrop.set(item.timelineElement, {
                    object: item
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

        destroyTimelineElement(item) {
            if (item.timelineElement) {
                if(LS.Resize) LS.Resize.remove(item.timelineElement);
                if(item.timelineElement.parentNode) item.timelineElement.remove();
            }
            item.timelineElement = null;
        }

        destroyItem(item) {
            if (item.type === "automation" && item.__automationClip) {
                if (typeof item.__automationClip.destroy === "function") item.__automationClip.destroy();
                item.__automationClip = null;
            }
            this.destroyTimelineElement(item);
            const index = this.items.indexOf(item);
            if (index >= 0) {
                this.items.splice(index, 1);
                this.frameScheduler.schedule();
            }
        }

        reset(destroyItems = true, replacingItems = null) {
            for (let item of this.items) {
                if (destroyItems) {
                    if (item.type === "automation" && item.__automationClip) {
                        if (typeof item.__automationClip.destroy === "function") item.__automationClip.destroy();
                        item.__automationClip = null;
                    }
                    this.destroyTimelineElement(item);
                } else if (item.timelineElement && item.timelineElement.parentNode) {
                    if (item.type === "automation" && item.__automationClip) {
                        item.__automationClip.setElement(null);
                    }
                    item.timelineElement.remove();
                }
            }

            this.items = replacingItems || [];
            if (replacingItems) {
                this.sortItems();
            }

            this.maxDuration = 0;
            this.#duration = 0;
            this.clearUnusedRows();
            this.reserveRows(this.options.startingRows);
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
            return this.items.map(item => this.cloneItem(item));
        }

        destroy() {
            this.reset(true);
            this.frameScheduler.cancel();
            this.frameScheduler = null;
            this.container.remove();
            this.container = null;
            this.markerPool = null;
            this.activeMarkers = null;
            this.rowElements = null;
            this.spacerElement = null;
            this.selectedItems = null;
            this.__rendered = null;
            this.playerHead = null;
            this.rowContainer = null;
            this.scrollContainer = null;
            this.markerContainer = null;
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
            this.dragHandle.destroy();
            this.dragHandle = null;
            this.dragDrop.destroy();
            this.dragDrop = null;
        }
    }, { name: "Timeline", global: true });
})();