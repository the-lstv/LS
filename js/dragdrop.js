/**
 * Provides draggable elements and droppable zones with preview, snapping,
 * constraints, optional cloning, and auto-scrolling.
 * 
 * Based on the original LSv3 implementation.
 * 
 * @author lstv.space
 * @license GPL-3.0
 */

LS.LoadComponent(class DragDrop extends LS.Component {
    static DROP_TARGET_DEFAULTS = {
        id: null,
        outsideParent: false,
        relativeMouse: false,
        animate: false,
        dropPreview: true,
        absoluteX: false,
        absoluteY: false,
        preserveHeight: true, 
        overflow: false,
        container: null,
        scrollContainer: null,
        sameParent: false,
        strictDrop: true,
        movementOnly: false,
        multiList: null,
        lockX: false,
        lockY: false,
        scrollY: true,
        scrollX: true,
        clone: false,
        allowedTargets: [],
        getters: {},
        snapEnabled: false,
        snapArea: 5,
        tolerance: 5,
        swap: false,
        handle: null
    };

    #handlers = new Map();
    #state = {
        moving: false,
        engaged: false,
        current: null,
        items: [],
        multi: false,
        parent: null,
        previewBox: null,
        dragArea: null,
        target: null,
        prevX: 0,
        prevY: 0,
        currentX: 0,
        currentY: 0,
        velocityX: 0,
        velocityY: 0,
        initialX: 0,
        initialY: 0,
        boundX: 0,
        boundY: 0,
        relative: null,
        scrollAllowed: false,
        snapValues: null
    };

    /**
     * Creates a DragDrop manager with specified options.
     * @param {*} options Options
     * @property {boolean} outsideParent - If true, drag only starts when cursor leaves the parent element.
     * @property {boolean} relativeMouse - If true, the element is positioned relative to the mouse cursor offset at start.
     * @property {boolean} animate - If true, applies inertial animation (tilt/velocity) during drag.
     * @property {boolean} dropPreview - If true, shows a placeholder box in the drop zone.
     * @property {boolean} absoluteX - If true, calculates absolute X position relative to container (useful for free positioning).
     * @property {boolean} absoluteY - If true, calculates absolute Y position relative to container (useful for free positioning).
     * @property {boolean} preserveHeight - If true, the drag area maintains the height of the dragged element.
     * @property {boolean} overflow - If false, constrains the element within the container boundaries (when absolute positioning is used).
     * @property {HTMLElement|string|null} container - The boundary container for the drag operation. Defaults to parent.
     * @property {HTMLElement|string|null} scrollContainer - The container that should scroll when dragging near edges. Defaults to container or parent.
     * @property {boolean} sameParent - If true, forces drop hover detection on the original parent immediately.
     * @property {boolean} strictDrop - If true, requires the mouse to be directly over a drop zone element. If false, uses the last valid hovered zone.
     * @property {boolean} movementOnly - If true, disables dropping logic entirely; element just moves visually.
     * @property {boolean} lockX - If true, prevents movement along the X-axis.
     * @property {boolean} lockY - If true, prevents movement along the Y-axis.
     * @property {boolean} scrollY - If true, enables auto-scrolling vertically.
     * @property {boolean} scrollX - If true, enables auto-scrolling horizontally.
     * @property {boolean} clone - If true, drags a copy of the element instead of the original.
     * @property {Array<string>} allowedTargets - List of allowed drop zone identifiers/types.
     * @property {Object} getters - Configuration for dynamic values (e.g., `snapAt`).
     * @property {Array<HTMLElement>} [getters.snapAt] - Array of elements to snap to.
     * @property {number} snapArea - Distance in pixels within which snapping occurs.
     * @property {number} tolerance - Distance in pixels mouse must move before drag initiates.
     * @property {boolean} swap - (Unused in current logic) Intended for swapping elements.
     * @property {HTMLElement|string|null} handle - Specific element to act as the drag handle. Defaults to the target element itself.
     * @property {Set<HTMLElement>} multiList - Optional set of elements to drag at once.
     */
    constructor(options = {}){
        super();
        this.options = LS.Util.defaults(this.constructor.DROP_TARGET_DEFAULTS, options);
        this.draggables = new Set();
        this.dropzones = new Set();

        this.frameScheduler = new LS.Util.FrameScheduler(() => this.#render());

        this.#state.dragArea = LS.Create({ class: "ls-drag-area", style: "position: fixed; pointer-events: none; display: none; top: 0; left: 0" });
        this.#state.snapLine = LS.Create({ class: "ls-drag-snap-line", style: "position: fixed; pointer-events: none; display: none; width: 1px; background: var(--accent-60); z-index: 10000; top: 0; left: 0" });
        this.#state.previewBox = LS.Create({ class: "ls-drop-preview", style: "display: none" });

        // Top-layer drag area and preview box
        LS.once("ready", () => {
            LS._topLayer.appendChild(this.#state.dragArea);
            LS._topLayer.appendChild(this.#state.snapLine);
        });
    }

    /**
     * Makes an element draggable.
     * @param {*} target Element or selector
     * @returns 
     */
    set(target, options = {}) {
        const element = LS.Tiny.O(target);

        element.lsDragEnabled = true;
        element.lsDragOptions = options || {};
        this.draggables.add(element);

        // Enable scrolling once hovered over scroll container
        const scrollParent = this.#getFather(true, element, this.options);
        if(scrollParent) scrollParent.on("mouseenter", () => { this.#state.scrollAllowed = true; });

        const handle = LS.Tiny.O(this.options.handle || element);

        const touchHandler = new LS.Util.TouchHandle(handle, {
            buttons: [0],
            cursor: "grabbing",
            disablePointerEvents: false,
            ...this.options.handleOptions || {},
            onStart: (event) => this.#onInputStart(event),
            onMove: (event) => this.#onInputMove(event.x, event.y),
            onEnd: () => this.#onInputEnd(),
        });

        this.#handlers.set(element, touchHandler);
        return this;
    }

    /**
     * Removes drag capability from an element.
     * @param {*} target Element or selector
     */
    remove(target){
        const el = LS.Tiny.O(target);
        if (this.#handlers.has(el)) {
            this.#handlers.get(el).destroy();
            this.#handlers.delete(el);
        }
        this.draggables.delete(el);
        delete el.lsDragEnabled;
        delete el.lsDragOptions;
        return this;
    }

    /**
     * Marks an element as a drop zone (where elements can be dropped).
     * @param {*} zone Element or selector
     * @returns 
     */
    dropZone(zone){
        const element = LS.Tiny.O(zone);
        element.lsDrop = true;
        element.lsDropTarget = this.options.id;
        element.classList.add("ls-drop");
        this.dropzones.add(element);

        element.addEventListener("mouseenter", () => {
            if(!this.#state.moving || this.options.movementOnly) return;
            this.#dropHover(element);
        });

        return this;
    }

    get dragging(){
        return this.#state.moving;
    }

    get currentElement(){
        return this.#state.current;
    }

    #onInputStart(event) {
        let enable = true;
        const element = event.domEvent.target;

        this.emit("dragStart", [element, event, () => { enable = false; }]);
        if(!element.lsDragEnabled || !enable) {
            event.cancel();
            return;
        }

        const state = this.#state;
        state.items = [];
        state.prevX = state.initialX = event.x;
        state.velocityX = 0;
        state.initialY = event.y;
        state.prevY = state.initialY;
        state.velocityY = 0;
        state.currentX = event.x;
        state.currentY = event.y;
        state.object = element.lsDragOptions?.object || null;

        const box = element.getBoundingClientRect();
        state.relative = { box, x: state.initialX - box.left, y: state.initialY - box.top };

        if(state.dragArea){
            state.dragArea.style.transform = `translate3d(${box.left}px, ${box.top}px, 0)`;
            if(this.options.preserveHeight) state.dragArea.style.height = box.height + "px";
        }

        state.parent = LS.Tiny.O(element.parentElement);
        state.engaged = true;
        state.current = element;
        state.moving = false; // Waiting for tolerance
    }

    #onInputMove(x, y) {
        const state = this.#state;
        if (!state.engaged) return;

        state.currentX = x;
        state.currentY = y;

        if (!state.moving) {
            // Movement has not beed initiated yet
            // We check tolerance, if met we enable moving

            if (Math.abs(state.initialX - x) >= this.options.tolerance || Math.abs(state.initialY - y) >= this.options.tolerance) {
                if (this.options.outsideParent && state.current.parentElement.matches(":hover")) {
                    // Wait until outside parent if required
                    // Starts the drag once the cursor moves outside of the parent
                    return;
                }

                this.#dropHover(this.options.sameParent? this.#getFather(false, state.current, this.options) : LS.Tiny.O(state.current.parentElement));

                state.scrollAllowed = this.#getFather(false, state.current, this.options).matches(":hover");

                state.moving = true;
                for(const child of state.dragArea.children) child.remove();

                state.multi = (this.options.multiList && this.options.multiList.size > 0);
                const sourceItems = state.multi
                    ? Array.from(this.options.multiList) 
                    : [state.current];

                state.items = sourceItems.map(item => {
                    if(!(item instanceof HTMLElement)) {
                        item = item.element || item.container || item.timelineElement || null;
                        if(!item || !(item instanceof HTMLElement)) throw new Error("DragDrop: Invalid multiList item, must be HTMLElement or contain 'element' property.");
                    }

                    const parent = item.parentElement;
                    const nextSibling = item.nextElementSibling;
                    const computed = getComputedStyle(item);
                    const prevMargin = computed.margin;
                    const rect = item.getBoundingClientRect();

                    let element = this.options.clone ? LS.Tiny.O(item.cloneNode(true)) : item
                    element.style.margin = "0";

                    element.classList.add("ls-held");
                    state.dragArea.add(element);
                    
                    return {
                        original: item,
                        rect,
                        element,
                        parent,
                        nextSibling,
                        prevMargin,
                        display: computed.display,
                        borderRadius: computed.borderRadius
                    };
                });

                state.dragArea.style.display = "block";

                // Precalculate snap values
                if(this.options.snapEnabled){
                    state.snapValues = null;
                    let snap = this.options.getters?.snapAt;
                    if (snap === undefined) snap = this.draggables;

                    if(snap && (Array.isArray(snap) || snap instanceof Set)){
                        state.snapValues = [];
                        const cw = state.dragArea.clientWidth;
                        const vh = window.innerHeight;
                        const vw = window.innerWidth;

                        for(const element of snap){
                            if(element === state.current) continue;

                            const box = element.getBoundingClientRect();
                            
                            // Skip invisible or off-screen elements
                            if(box.width === 0 && box.height === 0) continue;
                            if(box.bottom < -50 || box.top > vh + 50 || box.right < -50 || box.left > vw + 50) continue;

                            state.snapValues.push(
                                { dest: box.left, line: box.left, top: box.top, height: box.height },
                                { dest: box.right, line: box.right, top: box.top, height: box.height },
                                { dest: box.left - cw, line: box.left, top: box.top, height: box.height },
                                { dest: box.right - cw, line: box.right, top: box.top, height: box.height }
                            );
                        }
                    }
                }

                if(this.options.sameParent){ this.#dropHover(this.#getFather(false, state.current, this.options)); }

                this.emit("drag", [state.items]);
                this.frameScheduler.schedule();
            }
        } else {
            this.frameScheduler.schedule();
        }
    }

    #onInputEnd() {
        const state = this.#state;
        state.engaged = false;

        if(!state.moving) return;
        state.moving = false;

        if(!state.dragArea || !this.options) return;

        // Use currentX/Y for drop detection
        const drop = this.options.movementOnly? state.parent : (!this.options.strictDrop ? state.target : LS.Tiny.O(document.elementsFromPoint(state.currentX, state.currentY).reverse().find(e => e.lsDrop)));
        const success = drop && drop.lsDrop && this.#isAllowed(state.current, drop);

        state.items.forEach(item => {
            item.original.style.margin = item.prevMargin;
            item.original.classList.remove("ls-held");
            if(this.options.clone) item.dragged.remove();
        });

        if(success){
            const event = {
                source: state.current,
                items: state.items.map(i => i.original),
                target: drop,
                boundX: state.boundX,
                boundY: state.boundY,
                boundWidth: state.dragArea.clientWidth,
                boundHeight: state.dragArea.clientHeight,
                object: state.object || null
            };

            this.emit("drop", [event, drop]);
        }
        
        if (!success && !this.options.clone) {
            state.items.forEach(item => {
                this.emit("cancel", [item.original]);
                if (item.nextSibling) {
                    item.parent.insertBefore(item.original, item.nextSibling);
                } else {
                    item.parent.appendChild(item.original);
                }
            });
        } else if (!success && this.options.clone) {
            this.emit("cancel", []);
        }

        state.items = [];
        state.current = null;
        state.previewBox.remove();
        if(state.snapLine) state.snapLine.style.display = "none";
        state.moving = false;
        state.engaged = false;
        state.dragArea.style.display = "none";
    }

    #render(){
        const state = this.#state;
        if (!state.moving || !state.current) return;

        // TODO: Limit the amount of rect reads
        let x = state.currentX, y = state.currentY;
        const rect = state.dragArea.getBoundingClientRect();
        const parentBox = this.#getFatherBox(false, state.current, this.options);
        const scrollBox = this.#getFatherBox(true, state.current, this.options);

        if(this.options.relativeMouse && state.relative){ x -= state.relative.x; y -= state.relative.y; }

        if(this.options.lockX || (LS.Tiny.M.ShiftDown && state.prevX !== null)) x = state.prevX;
        if(this.options.lockY) y = state.prevY;

        if (this.options.snapEnabled) {
            const snapValues = state.snapValues;
            let snapped = false;
            if (Array.isArray(snapValues)) {
                for (const snap of snapValues) {
                    if (snap.dest - x > -this.options.snapArea && snap.dest - x < this.options.snapArea) {
                        x = snap.dest;
                        if (state.snapLine) {
                            const top = Math.min(snap.top, y);
                            const height = Math.max(snap.top + snap.height, y + rect.height) - top;
                            state.snapLine.style.transform = `translate3d(${snap.line}px, ${top}px, 0)`;
                            state.snapLine.style.height = height + "px";
                            state.snapLine.style.display = "block";
                        }
                        snapped = true;
                        break;
                    }
                }
            }
            if (!snapped && state.snapLine) state.snapLine.style.display = "none";
        }

        if(this.options.animate){
            if(x !== state.prevX) { state.velocityX = x - state.prevX; } else { state.velocityX += (state.velocityX > 0? -1 : 1); }
            if(y !== state.prevY) { state.velocityY = state.prevY - y; } else { state.velocityY += (state.velocityY > 0? -1 : 1); }
            state.dragArea.style.transform = ` translate3d(${x - (rect.width / 2)}px, ${y + state.velocityY}px, 0) rotate(${state.velocityX}deg)`;
        } else {
            state.dragArea.style.transform = ` translate3d(${x}px, ${y}px, 0)`;
        }

        state.prevX = x; state.prevY = y;

        if(this.options.absoluteX) {
            state.boundX = (rect.left - parentBox.left) + this.#getFather(false, state.current, this.options).scrollLeft;
            if(!this.options.overflow && state.boundX < 0) state.boundX = 0;
            if(this.options.dropPreview) state.previewBox.style.left = state.boundX + "px";
        }

        if(this.options.absoluteY) {
            state.boundY = (rect.top - parentBox.top) + this.#getFather(false, state.current, this.options).scrollTop;
            if(!this.options.overflow && state.boundY < 0) state.boundY = 0;
            if(this.options.dropPreview) state.previewBox.style.top = state.boundY + "px";
        }

        if(state.scrollAllowed){
            const sp = this.#getFather(true, state.current, this.options);
            if(this.options.scrollY){
                if(state.currentY > scrollBox.bottom) sp.scrollBy(null, Math.min(40, state.currentY - scrollBox.bottom));
                if(state.currentY < scrollBox.top) sp.scrollBy(null, Math.min(40, -(scrollBox.top - state.currentY)));
            }
            if(this.options.scrollX){
                if(state.currentX > (scrollBox.right - 20)) sp.scrollBy(Math.min(40, (state.currentX - (scrollBox.right - 20))/2), null);
                if(state.currentX < (scrollBox.left + 20)) sp.scrollBy(Math.min(40, -(((scrollBox.left + 20)) - state.currentX)/2), null);
            }
        }

        if(state.moving && state.dragArea) requestAnimationFrame(() => this.frameScheduler.schedule());
    }

    render(){
        this.frameScheduler.schedule();
    }

    #getFatherBox(scrollBox, current, opts){
        return this.#getFather(scrollBox, current, opts).getBoundingClientRect();
    }

    #getFather(scroll, current, opts){
        const container = (scroll? opts.scrollContainer : opts.container) || opts.container || (current? current.parentElement: null);
        return LS.Tiny.O(container || document.body);
    }

    #isAllowed(source, target){
        if(target === this.#getFather(false, source, this.options)) return true;
        if(!target.lsDrop) return false;
        
        if(this.options.allowedTargets && this.options.allowedTargets.length > 0) {
            return this.options.allowedTargets.includes(target.lsDropTarget);
        }
        
        return true;
    }

    #dropHover(drop){
        const state = this.#state;

        if(!this.#isAllowed(state.current, drop)) return;

        state.target = drop;

        if(!state.multi && state.moving && state.dragArea && this.options.dropPreview){
            for(const item of state.items) {
                const isAbsolute = this.options.absoluteX || this.options.absoluteY;
                const style = {
                    height: item.rect.height + "px",
                    width: item.rect.width + "px",
                    margin: item.prevMargin,
                    display: item.display,
                    position: isAbsolute ? "absolute" : "relative",
                    borderRadius: item.borderRadius,
                    pointerEvents: "none"
                };

                LS.TinyFactory.applyStyle.call(state.previewBox, style);
    
                if(this.options.absoluteX){ state.previewBox.style.marginRight = state.previewBox.style.marginLeft = "0px"; }
                if(this.options.absoluteY){ state.previewBox.style.marginTop = state.previewBox.style.marginBottom = "0px"; }
    
                drop.appendChild(state.previewBox);
            }
        }
    }

    destroy(){
        for (const [el, handler] of this.#handlers) {
            if(el.lsDragEnabled) {
                el.lsDragEnabled = false;
                delete el.lsDragOptions;
            }

            handler.destroy();
        }
        this.#handlers.clear();
        this.draggables.clear();
        this.dropzones.clear();
        if(this.#state.dragArea) this.#state.dragArea.remove();
        if(this.#state.previewBox) this.#state.previewBox.remove();
        if(this.#state.snapLine) this.#state.snapLine.remove();
        this.frameScheduler.cancel();
        this.frameScheduler = null;
    }
}, { name: "DragDrop", global: true });
