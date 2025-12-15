/**
 * An efficient timeline component, optimized for long timelines with many items via virtual scrolling.
 * @author lstv.space
 * @license GPL-3.0
 */

(() => {
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const DEFAULTS = {
        element: null,
        chunkSize: "auto",
        reservedRows: 5,
        zoom: 1,
        offset: 0,
        minZoom: "auto",
        maxZoom: 50,
        markerSpacing: 100,
        markerMetric: "time",
        resizable: true,
    };

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
        constructor(options = {}) {
            super();

            this.options = LS.Util.defaults(DEFAULTS, options);

            this.container = LS.Create({
                inner: [
                    (this.markerContainer = LS.Create({
                        class: "ls-timeline-markers"
                    })),

                    (this.playerHead = LS.Create({
                        class: "ls-timeline-player-head"
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

            this.items = [];

            this.rowElements = [];
            this.reserveRows(this.options.reservedRows);

            this.markerPool = [];
            this.activeMarkers = [];

            this.__rendered = new Set();
            this.__needsSort = false;
            this.maxDuration = 0;
            this.maxEndTime = 0;
            this.__spacerWidth = 0;

            this.frameScheduler = new LS.Util.FrameScheduler(() => this.#render());

            // Mouse/touch drag
            // TODO: Should not block scrolling on mobile
            let dragType = null, rect = null, startX = 0, startY = 0;
            
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

            const processEdgeScroll = () => {
                if (edgeScrollSpeed !== 0) {
                    this.offset += edgeScrollSpeed;
                    // Update seek position based on the last known cursor position relative to the moving viewport
                    const worldX = lastCursorX + this.offset;
                    this.seek = worldX / this.#zoom;
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

                    const touchEvent = event.type.startsWith("touch");
                    const button = touchEvent? ((event.target === this.scrollContainer || this.scrollContainer.contains(event.target)) ? 1 : 0) : event.button;

                    dragType = button === 0 ? "seek" : button === 1 ? "pan" : button === 2 ? "delete" : null;

                    if (!dragType) {
                        cancel();
                        return;
                    }

                    startX = x;
                    startY = y;
                    velocityX = 0;
                    lastMoveTime = performance.now();

                    this.dragHandle.cursor = dragType === "pan" ? "grabbing" : dragType === "seek" ? "ew-resize" : "no-drop";
                    rect = this.container.getBoundingClientRect();
                },

                onMove: (x, y) => {
                    const now = performance.now();

                    if (dragType === "pan") {
                        const deltaX = x - startX;
                        const deltaY = y - startY;
                        this.offset -= deltaX;
                        this.scrollContainer.scrollTop -= deltaY;
                        
                        // Track velocity
                        velocityX = deltaX; 
                        
                        startX = x;
                        startY = y;
                    } else if (dragType === "seek") {
                        const cursorX = x - rect.left;
                        lastCursorX = cursorX;

                        const worldX = cursorX + this.offset;
                        const time = worldX / this.#zoom;
                        this.seek = time;

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
                    } else if (dragType === "delete") {
                        // TODO: implement delete
                    }
                    
                    lastMoveTime = now;
                },

                onEnd() {
                    if (dragType === "pan") {
                        // Only apply inertia if the last move was recent
                        if (performance.now() - lastMoveTime < 50) {
                            processInertia();
                        }
                    }
                    stopEdgeScroll();
                    dragType = null;
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
        }

        // --- Camera state values (do not influence content) ---
        #offset = 0;
        #zoom = 1;

        get zoom() {
            return this.#zoom;
        }

        set zoom(value){
            let minZoom = this.options.minZoom;

            if (minZoom === "auto") {
                if (this.maxEndTime > 0 && this.container.clientWidth > 0) {
                    minZoom = this.container.clientWidth / this.maxEndTime;
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

        get seek() {
            return this.#seek;
        }

        set seek(value) {
            // TODO: implement player controller API
            this.#seek = Math.max(0, value);
            this.emit("seek", [this.#seek]);
            this.frameScheduler.schedule();
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
            this.items.sort((a, b) => a.start - b.start);
            
            this.maxDuration = 0;
            this.maxEndTime = 0;
            
            for (let i = 0; i < this.items.length; i++) {
                const item = this.items[i];
                if (item.duration > this.maxDuration) this.maxDuration = item.duration;
                const end = item.start + item.duration;
                if (end > this.maxEndTime) this.maxEndTime = end;
            }
            
            this.__needsSort = false;
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

        clearUnusedRows() {
            const highestUsedRow = this.items.reduce((max, item) => Math.max(max, item.row || 0), 0);
            for (let i = this.rowElements.length - 1; i > highestUsedRow; i--) {
                const rowElement = this.rowElements.pop();
                rowElement.remove();
            }
        }

        #render() {
            // let debug_scanned = 0, debug_time = performance.now();

            const worldLeft = this.#offset;
            const viewportWidth = this.container.clientWidth;
            const worldRight = worldLeft + viewportWidth;

            if (this.__needsSort) {
                this.sortItems();
            }

            // Update spacer width
            const endPadding = viewportWidth * 0.5;
            const spacerWidth = (this.maxEndTime * this.#zoom) + endPadding;

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

                // Drop items that are too small to be seen
                if(computedWidth <= 0 || computedX + computedWidth < minX) {
                    continue;
                }

                // Ensure we do not trigger CSS layout
                if (computedWidth !== item.__previousWidth) {
                    itemElement.style.width = `${computedWidth}px`;
                    item.__previousWidth = computedWidth;
                }

                itemElement.style.transform = `translate3d(${computedX}px, 0, 0)`;

                this.reserveRows((item.row || 0) + 1);
                const rowElement = this.rowElements[item.row || 0];
                if (!itemElement.isConnected || itemElement.parentNode !== rowElement) {
                    rowElement.appendChild(itemElement);
                }

                this.__rendered.add(itemElement);
                itemElement.__eligible = true;
            }

            // Hide non-eligible items
            for (let child of this.__rendered) {
                if (!child.__eligible) {
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
            if (this.options.markerMetric === "function") return this.options.markerMetric(time, step);
            
            const absTime = Math.abs(time);
            const h = Math.floor(absTime / 3600);
            const m = Math.floor((absTime % 3600) / 60);
            const s = Math.floor(absTime % 60);
            
            if (step < 1) return absTime.toFixed(1);
            if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            return `${m}:${s.toString().padStart(2, '0')}`;
        }

        render() {
            this.frameScheduler.schedule();
        }

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
                class: "ls-timeline-item"
            });

            if(LS.Resize && this.options.resizable) {
                const { left, right } = LS.Resize.set(item.timelineElement, {
                    left: true,
                    right: true,
                    minWidth: 5,
                });

                left.handler.on("resize", (newSize, delta) => {
                    console.log(arguments);
                    
                    const deltaTime = delta.width / this.#zoom;
                    item.start += deltaTime;
                    item.duration -= deltaTime;
                    this.frameScheduler.schedule();
                });

                right.handler.on("resize", (newSize, delta) => {
                    const deltaTime = delta.width / this.#zoom;
                    item.duration += deltaTime;
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
            this.destroyTimelineElement(item);
            const index = this.items.indexOf(item);
            if (index >= 0) {
                this.items.splice(index, 1);
                this.frameScheduler.schedule();
            }
        }

        reset(destroyItems = true) {
            for (let item of this.items) {
                if (destroyItems) {
                    this.destroyTimelineElement(item);
                } else if (item.timelineElement && item.timelineElement.parentNode) {
                    item.timelineElement.remove();
                }
            }

            this.items = [];
            this.maxDuration = 0;
            this.maxEndTime = 0;
            this.clearUnusedRows();
            this.__needsSort = false;
            this.frameScheduler.schedule();
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
            this.rowContainer = null;
            this.scrollContainer = null;
            this.markerContainer = null;
            document.removeEventListener('wheel', this.__wheelHandler);
            this.__wheelHandler = null;
            this.dragHandle.destroy();
            this.dragHandle = null;
        }
    }, { name: "Timeline", global: true });
})();