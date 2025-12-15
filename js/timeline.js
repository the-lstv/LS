/**
 * A fast timeline component, optimized for long timelines with many items.
 * @author lstv.space
 * @license GPL-3.0
 */

(() => {
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const DEFAULTS = {
        element: null
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
                        class: "ls-timeline-markers",
                        inner: []
                    })),

                    (this.scrollContainer = LS.Create({
                        class: "ls-timeline-scroll-container",
                        inner: [
                            (this.spacerElement = LS.Create({
                                class: "ls-timeline-spacer",
                                style: "height: 1px; width: 100000px;"
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
            this.reserveRows(this.options.reservedRows || 5);

            this.precomputedOffsetsChunkSize = 100;
            this.precomputedOffsets = {};

            this.frameScheduler = new LS.Util.FrameScheduler(() => this.#render());

            // Used to move the head
            // Later could also have an option to move the timeline instead
            // TODO: Should not block scrolling on mobile
            this.dragHandle = LS.Util.touchHandle(this.container, {
                onMove(dx, dy) {
                    // this.seek
                }
            });

            document.addEventListener('wheel', (event) => {
                if (event.target !== this.container && !this.container.contains(event.target)) return;
                if (!event.ctrlKey) return;

                event.preventDefault();

                const rect = this.container.getBoundingClientRect();
                const cursorX = event.clientX - rect.left;
                const currentZoom = this.zoom;
                const zoomDelta = currentZoom * 0.16 * (event.deltaY > 0 ? -1 : 1);
                const newZoom = clamp(currentZoom + zoomDelta, 0.001, 25);

                const worldX = (cursorX + this.offset) / currentZoom;
                this.zoom = newZoom;
                this.offset = (worldX * this.zoom) - cursorX;
            }, { passive: false });

            this.scrollContainer.addEventListener('scroll', (event) => {
                this.offset = this.scrollContainer.scrollLeft;
            });
        }

        // --- Camera state values (do not influence content) ---
        #zoom = 1;
        #offset = 0;

        get zoom() {
            return this.#zoom;
        }

        set zoom(value){
            value = clamp(value, 0.001, 25);
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
        }

        /**
         * Computes offset by groups for very fast scrolling (optimization), so we don't need to iterate all items each time and can skip some
         * TODO:
         */
        regenerateOffsets() {
            this.precomputedOffsets = {};

            this.items.sort((a, b) => a.start - b.start);

            let i = 0;
            for (let item of this.items) {
                const chunkIndex = Math.floor(item.start / this.precomputedOffsetsChunkSize);
                if (!(chunkIndex in this.precomputedOffsets)) {
                    this.precomputedOffsets[chunkIndex] = i;
                }
                i++;
            }

            this.__needsOffsetRecompute = false;
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
            const maxX = this.container.clientWidth;

            if (this.__needsOffsetRecompute) {
                this.regenerateOffsets();
            }

            const skip = this.precomputedOffsets[Math.floor(this.#offset / this.precomputedOffsetsChunkSize)] || 0;
            const eligible = new Set();
            for (let i = skip; i < this.items.length; i++) {
                const item = this.items[i];
                const itemElement = item.timelineElement || (item.timelineElement = LS.Create({
                    class: "ls-timeline-item",
                }));

                const computedWidth = item.duration * this.#zoom;
                const computedX = (item.start * this.#zoom) - this.#offset;

                // Drop items that are too small to be seen
                if(computedWidth <= 0 || computedX + computedWidth < 0) {
                    if (item.__previousVisibility !== false) itemElement.style.display = 'none';
                    item.__previousVisibility = false;
                    continue;
                }

                // Ensure we do not trigger CSS layout
                if (computedWidth !== item.__previousWidth) {
                    itemElement.style.width = `${computedWidth}px`;
                    item.__previousWidth = computedWidth;
                }

                itemElement.style.transform = `translate3d(${computedX}px, 0, 0)`;
                if (item.__previousVisibility !== true) itemElement.style.display = '';
                item.__previousVisibility = true;

                this.reserveRows((item.row || 0) + 1);
                const rowElement = this.rowElements[item.row || 0];
                if (itemElement.parentNode !== rowElement) {
                    rowElement.appendChild(itemElement);
                }

                eligible.add(item);

                // Early out optimization
                if (computedX > maxX) {
                    break;
                }
            }

            // Hide non-eligible items
            if(this.__renderedItems && this.__renderedItems.length) for (let child of this.__renderedItems) {
                if (!eligible.has(child) && child.__previousVisibility !== false) {
                    child.style.display = 'none';
                    child.__previousVisibility = false;
                }
            }

            this.__renderedItems = eligible;
        }

        render() {
            this.frameScheduler.schedule();
        }

        add(item) {
            this.items.push(item);
            this.__needsOffsetRecompute = true;
            this.frameScheduler.schedule();
        }

        remove(item) {
            const index = this.items.indexOf(item);
            if (index >= 0) {
                this.items.splice(index, 1);
                if (item.timelineElement && item.timelineElement.parentNode) {
                    item.timelineElement.remove();
                }
                this.__needsOffsetRecompute = true;
                this.frameScheduler.schedule();
            }
        }

        intersectsAt(time) {
            return this.items.filter(item => time >= item.start && time <= (item.start + item.duration));
        }

        reset() {
            for (let item of this.items) {
                if (item.timelineElement && item.timelineElement.parentNode) {
                    item.timelineElement.remove();
                }
            }
            this.items = [];
            this.removeUnusedRows();
            this.__needsOffsetRecompute = true;
            this.frameScheduler.schedule();
        }
    }, { name: "Timeline", global: true });
})();