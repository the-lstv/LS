/**
 * A flexible and lightweight resizer library for LS.
 * Adds resize bars to any side or corner of an element.
 * Automatically adjusts to absolute/relative positioning, supports collapsing, and works with touch events as well.
 * Note: ls.css and LS.Effect is required.
 * @version 1.0.0
 */
class Resize extends LS.EventEmitter {
    static { LS.register(this, { name: "Resize", singleton: true, global: true }) }

    cursorMap = {
        top: 'ns-resize',
        bottom: 'ns-resize',
        left: 'ew-resize',
        right: 'ew-resize',
        topLeft: 'nwse-resize',
        bottomRight: 'nwse-resize',
        topRight: 'nesw-resize',
        bottomLeft: 'nesw-resize'
    }

    /**
     * @type {WeakMap<HTMLElement, ResizeHandler>}
     */
    targets = new WeakMap();

    /**
     * Adds or updates a resize handle on a target element.
     *
     * Certain options (anchor, size) can also be set per specific handle with CSS (eg. element > .ls-resize-handle.ls-top { --ls-resize-handle-size: 8px; --ls-resize-anchor: 0.5 })
     * @param {*} target - The target element to resize.
     * @param {*} options - The options for the resize handle.
     * 
     * Sides and corners can be specified in four ways:
     * - As a CSS-style array of booleans/numbers (e.g. { sides: [true, false, true, false] }), clockwise
     * - As an array of strings (e.g. { sides: ["top", "bottom"] })
     * - As keys { top: true, right: false, bottom: true, left: false }
     * - All at once { sides: "all" }
     * 
     * Other options:
     * @param {boolean} [options.styled=true] - Whether to apply default visual styles, eg. highlight on hover. Otherwise only functional styles will apply.
     * @param {boolean|Array|string} [options.sides=true] - Which sides to add handles to. Can be a boolean (true = all sides), an array of booleans/numbers [top, right, bottom, left], or an array of strings ["top", "right", "bottom", "left"].
     * @param {boolean|Array|string} [options.corners=false] - Which corners to add handles to. Can be a boolean (true = all corners), an array of booleans/numbers [top-left, top-right, bottom-right, bottom-left], or an array of strings ["top-left", "top-right", "bottom-right", "bottom-left"].
     * @param {boolean} [options.top] - Whether to add a handle to the top side.
     * @param {boolean} [options.right] - Whether to add a handle to the right side.
     * @param {boolean} [options.bottom] - Whether to add a handle to the bottom side.
     * @param {boolean} [options.left] - Whether to add a handle to the left side.
     * @param {boolean} [options.topLeft] - Whether to add a handle to the top-left corner.
     * @param {boolean} [options.topRight] - Whether to add a handle to the top-right corner.
     * @param {boolean} [options.bottomRight] - Whether to add a handle to the bottom-right corner.
     * @param {boolean} [options.bottomLeft] - Whether to add a handle to the bottom-left corner.
     * @param {number|string} [options.handleSize] - Size of the side handles (thickness).
     * @param {number|string} [options.cornerSize] - Size of the corner handles (square size).
     * @param {string} [options.anchor=0.5] - Whether handles should be outside, inside, or in the center of the edge. (0 = inside, 0.5 = center, 1 = outside)
     * @param {boolean} [options.cursors=true] - Whether to set the cursor when dragging (this does not effect the CSS cursor style of the handle itself).
     * @param {boolean} [options.boundsCursors=true] - Set the cursor to a single direction when dragging past min/max.
     * @param {number} [options.snapArea=40] - Pixel threshold for snapping.
     * @param {boolean} [options.snapCollapse=false] - If true, shrinking within snapArea snaps to collapsed height/width.
     * @param {boolean} [options.snapExpand=false] - If true, expanding within snapArea of parent height snaps to 100% height/width.
     * @param {boolean} [options.snapVertical=false] - If true, enables snapping vertically.
     * @param {boolean} [options.snapHorizontal=false] - If true, enables snapping horizontally.
     * @param {number} [options.minWidth=20] - Minimum width of the target element (overrides CSS min-width value).
     * @param {number} [options.minHeight=20] - Minimum height of the target element (overrides CSS min-height value).
     * @param {number} [options.maxWidth=null] - Maximum width of the target element (overrides CSS max-width value).
     * @param {number} [options.maxHeight=null] - Maximum height of the target element (overrides CSS max-height value).
     * @param {string|object} [options.boundary=null] - Boundary to constrain resizing. Can be "viewport" or a rect object {x, y, width, height}.
     * @param {string} [options.store=null] - Key name for storage. If set, updates will be persistent and saved into a storage object.
     * @param {boolean} [options.storeStringify=true] - Whether to stringify the stored data.
     * @param {object} [options.storage=null] - Custom storage object (must implement getItem/setItem). Default is localStorage.
     * @param {boolean} [options.translate] - Use translate3d instead of left/top
     * @param {function} [options.map] - A function to apply custom mapping to resizing
     * @returns {ResizeHandler} - ResizeHandler instance for the target element.
     * 
     * Events on handle:
     * - resize: Emitted when the element is resized with the new width, height, and state.
     * - start: Emitted when resizing starts.
     * - end: Emitted when resizing ends.
     * 
     * @example
     * const handle = LS.Resize.set(element, {
     *     sides: ["top", "bottom"],
     *     corners: [1, 0, 1, 0]
     * });
     * 
     * handle.on("resize", (side, width, height, posX, posY, state) => {});
     * 
     * handle.destroy();
     */
    set(target, options = {}) {
        let entry = this.targets.get(target) || new ResizeHandler(target);
        console.log(entry);

        if(options) Object.assign(entry.options, options);
        options = entry.options;

        if(options.sides === "all" || options.sides === true) {
            options.top = true;
            options.right = true;
            options.bottom = true;
            options.left = true;
        } else if(Array.isArray(options.sides)) {
            const s = options.sides;
            if (s.length === 4 && s.every(v => typeof v !== 'string')) {
                options.top    = !!s[0];
                options.right  = !!s[1];
                options.bottom = !!s[2];
                options.left   = !!s[3];
            } else {
                options.top    = s.includes("top");
                options.right  = s.includes("right");
                options.bottom = s.includes("bottom");
                options.left   = s.includes("left");
            }
        }

        if (options.corners === "all" || options.corners === true) {
            options.topLeft = true;
            options.topRight = true;
            options.bottomRight = true;
            options.bottomLeft = true;
        } else if(Array.isArray(options.corners)) {
            const c = options.corners;
            if (c.length === 4 && c.every(v => typeof v !== 'string')) {
                options.topLeft     = !!c[0];
                options.topRight    = !!c[1];
                options.bottomRight = !!c[2];
                options.bottomLeft  = !!c[3];
            } else {
                options.topLeft     = c.includes("top-left");
                options.topRight    = c.includes("top-right");
                options.bottomRight = c.includes("bottom-right");
                options.bottomLeft  = c.includes("bottom-left");
            }
        }

        // --- restore persisted state (once per target) ---
        const storeKey = typeof options?.store === 'string' ? options.store : options.store === true ? "ls-resize-" + target.id : null;
        const storage  = options.storage || (typeof window !== 'undefined' ? window.localStorage : null);

        entry.storeKey = storeKey;
        entry.storage  = storage;

        if(storeKey && !entry.restored && storage) {
            try {
                const raw = storage.getItem(storeKey);
                if(raw) {
                    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;

                    if(data && typeof data === 'object') {
                        if(data.width  != null) target.style.width  = LS.Util.toCSSSize(data.width);
                        if(data.height != null) target.style.height = LS.Util.toCSSSize(data.height);

                        if(options.translate) {
                            if(data.translateX != null || data.translateY != null) {
                                const tx = data.translateX ?? 0;
                                const ty = data.translateY ?? 0;
                                target.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
                            }
                        } else {
                            if(data.left != null) target.style.left = LS.Util.toCSSSize(data.left);
                            if(data.top  != null) target.style.top  = LS.Util.toCSSSize(data.top);
                        }

                        if(data.state === 'collapsed') target.classList.add('ls-resize-collapsed');
                        else if(data.state === 'expanded') target.classList.add('ls-resize-expanded');
                    }
                }
            } catch(e) { /* ignore */ }
            entry.restored = true;
        }

        if(options.handleSize) {
            target.style.setProperty("--ls-resize-handle-size", typeof options.handleSize === "number"? `${options.handleSize}px`: options.handleSize);
        }

        if(options.cornerSize) {
            target.style.setProperty("--ls-resize-corner-size", typeof options.cornerSize === "number"? `${options.cornerSize}px`: options.cornerSize);
        }

        if(options.anchor) {
            target.style.setProperty("--ls-resize-anchor", options.anchor);
        }

        let i = 0;
        for(let side of ["top", "right", "bottom", "left", "topLeft", "topRight", "bottomRight", "bottomLeft"]) {
            const isCorner = i >= 4;
            i++;

            if(options[side]) {
                if(entry.handles.hasOwnProperty(side)) continue;

                const element = document.createElement("div");
                element.className = `ls-resize-handle ls-${side}` + (options.styled? " ls-resize-handle-styled": "") + (isCorner? " ls-resize-handle-corner": "");
                element.setAttribute("data-ls-effect", "resize-bar");
                element.dataset.side = side;
                entry.handles[side] = element;
                target.appendChild(element);

            } else if (entry.handles.hasOwnProperty(side)) {
                entry.handles[side].remove();
                delete entry.handles[side];
            }
        }

        this.targets.set(target, entry);
        return entry;
    }

    remove(target) {
        const entry = this.targets.get(target);
        if (!entry) return false;

        entry.destroy();
        return true;
    }

    getHandle(target, side) {
        const entry = this.targets.get(target);
        if (entry && entry.handles[side]) {
            return entry.handles[side];
        }
        return null;
    }

    getTarget(element) {
        return this.targets.get(element) || null;
    }
}

/**
 * Owns the lifetime of a resize target's resize state & options.
 */
class ResizeHandler extends LS.EventEmitter  {
    target     = null;  // Target element
    states     = {};    // State of each side/corner
    handles    = {};    // Handle elements

    // Resize options
    options    = {
        styled:         true,
        cursors:        true,
        boundsCursors:  true,
        snapArea:       40,
        snapCollapse:   false,
        snapExpand:     false,
        snapVertical:   false,
        snapHorizontal: false,
        translate:      false,
        map:            null,

        // --- boundary
        boundary:       null,

        // --- persistence
        store:          null,
        storeStringify: true,
        storage:        null,
    };
    
    // Persistence
    storage    = null;  // Where to store data
    storageKey = null;  // Key for storing data
    restored   = false; // Whether the persisted state has been restored

    constructor(target) {
        super();
        this.target = target;
    }

    /**
     * @deprecated
     */
    get handler() {
        return this;
    }

    destroy() {
        LS.Resize.targets.delete(this.target);

        this.target     = null;
        this.options    = null;
        this.states     = null;
        this.restored   = false;
        this.storage    = null;
        this.storageKey = null;

        for (const side in this.handles) {
            this.handles[side].remove();
        }
        this.handles = null;

        if(this._removalObserver) {
            this._removalObserver.disconnect();
            delete this._removalObserver;
        }

        super.destroy();
    }
}

/**
 * Controls the resize behavior.
 */
class ResizeBar {
    static {
        if(!LS.Effect) throw new Error("LS.Effect is required for LS.Resize to work.");
        LS.Effect.register("resize-bar", this);
    }

    // Note: data is a temporary state object, and has no guarantee that it survives between events.
    static dragStart(event, data) {
        const side  = this.dataset.side;

        data.target = this.parentElement;
        data.side   = side;

        const entry = LS.Resize.getTarget(data.target);
        if (!data.target || !side || !entry) return event.cancel();

        entry.emit('start', [ side, event.cancel ]);
        if(event.cancelled) return;

        LS.Resize.emit('resize-start', [{ target: data.target, side: side }]);

        const style = window.getComputedStyle(data.target);

        data.entry = entry;
        data.boundingBox = data.target.getBoundingClientRect();
        data.targetOffsetX = 0;
        data.targetOffsetY = 0;
        data.endWidth  = null;
        data.endHeight = null;

        data.isWest  = side === 'left'   || side === 'topLeft'    || side === 'bottomLeft';
        data.isEast  = side === 'right'  || side === 'topRight'   || side === 'bottomRight';
        data.isNorth = side === 'top'    || side === 'topLeft'    || side === 'topRight';
        data.isSouth = side === 'bottom' || side === 'bottomLeft' || side === 'bottomRight';

        data.affectsWidth  = data.isWest  || data.isEast;
        data.affectsHeight = data.isNorth || data.isSouth;

        data.minMax = [
            entry.options.minWidth  || parseFloat(style.minWidth)  || 20,
            entry.options.minHeight || parseFloat(style.minHeight) || 20,
            entry.options.maxWidth  || parseFloat(style.maxWidth)  || Infinity,
            entry.options.maxHeight || parseFloat(style.maxHeight) || Infinity,
        ];

        data.absolutePositioned = style.position === 'absolute' || style.position === 'fixed';

        if (entry.options.cursors !== false) {
            LS.Effect.sharedHandle.cursor = LS.Resize.cursorMap[side] || 'default';
        }

        // Use style / offsetParent coordinates for adjustments to avoid jump
        if (entry.options.translate) {
            const transform = style.transform;
            let mat = transform.match(/^matrix3d\((.+)\)$/);
            if (mat) {
                data.startPosX = parseFloat(mat[1].split(', ')[12]);
                data.startPosY = parseFloat(mat[1].split(', ')[13]);
            } else {
                mat = transform.match(/^matrix\((.+)\)$/);
                if (mat) {
                    data.startPosX = parseFloat(mat[1].split(', ')[4]);
                    data.startPosY = parseFloat(mat[1].split(', ')[5]);
                } else {
                    data.startPosX = 0;
                    data.startPosY = 0;
                }
            }
        } else {
            data.startPosX = !isNaN(parseFloat(style.left)) ? parseFloat(style.left) : entry.target.offsetLeft;
            data.startPosY = !isNaN(parseFloat(style.top))  ? parseFloat(style.top)  : entry.target.offsetTop;
        }

        let boundary = null;

        // Compute boundary rect
        if (entry.options.boundary === 'viewport') {
            boundary = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
        } else if (entry.options.boundary && typeof entry.options.boundary === 'object') {
            boundary = entry.options.boundary;
        }

        // Calculate offset from boundary to target's positioning context
        if (boundary && data.absolutePositioned) {
            if (style.position === 'fixed') {
                // Fixed position is relative to viewport
                data.targetOffsetX = 0;
                data.targetOffsetY = 0;
            } else {
                // Absolute position is relative to offsetParent
                const offsetParent = data.target.offsetParent || document.body;
                const parentRect = offsetParent.getBoundingClientRect();
                data.targetOffsetX = parentRect.left + window.scrollX - (data.boundingBox.x || 0);
                data.targetOffsetY = parentRect.top + window.scrollY  - (data.boundingBox.y || 0);

                // If using translate, startPosX is just the transform part. 
                // We need to account for the static left/top offset in the boundary calculation.
                if (entry.options.translate) {
                    data.targetOffsetX += data.target.offsetLeft;
                    data.targetOffsetY += data.target.offsetTop;
                }
            }
        }

        data.boundary = boundary;
        return data;
    }

    static move(event, data) {
        const startWidth  = data.boundingBox.width;
        const startHeight = data.boundingBox.height;

        // before you ask why this code is so terrible, this is the only remaining part that was written by ai

        let newWidth  = startWidth;
        let newHeight = startHeight;
        let newPosX = data.startPosX;
        let newPosY = data.startPosY;

        const entry = data.entry;

        // Precalculation for snapping
        let rawWidthCandidate = startWidth;
        let rawHeightCandidate = startHeight;

        if      (data.isWest)  rawWidthCandidate  = startWidth  - event.offsetX;
        else if (data.isEast)  rawWidthCandidate  = startWidth  + event.offsetX;
        if      (data.isNorth) rawHeightCandidate = startHeight - event.offsetY;
        else if (data.isSouth) rawHeightCandidate = startHeight + event.offsetY;

        if (data.isWest) {
            let candidate = startWidth - event.offsetX;
            if      (candidate < data.minMax[0]) { candidate = data.minMax[0]; event.offsetX = startWidth - candidate; }
            else if (candidate > data.minMax[2]) { candidate = data.minMax[2]; event.offsetX = startWidth - candidate; }
            newWidth = candidate;
            newPosX = data.startPosX + event.offsetX;
        } else if (data.isEast) {
            let candidate = startWidth + event.offsetX;
            if (candidate < data.minMax[0]) candidate = data.minMax[0];
            if (candidate > data.minMax[2]) candidate = data.minMax[2];
            newWidth = candidate;
        }

        if (data.isNorth) {
            let candidate = startHeight - event.offsetY;
            if      (candidate < data.minMax[1]) { candidate = data.minMax[1]; event.offsetY = startHeight - candidate; }
            else if (candidate > data.minMax[3]) { candidate = data.minMax[3]; event.offsetY = startHeight - candidate; }
            newHeight = candidate;
            newPosY = data.startPosY + event.offsetY;
        } else if (data.isSouth) {
            let candidate = startHeight + event.offsetY;
            if (candidate < data.minMax[1]) candidate = data.minMax[1];
            if (candidate > data.minMax[3]) candidate = data.minMax[3];
            newHeight = candidate;
        }

        // --- Snapping logic (track per-axis) ---
        let widthSnappedCollapsed = false, heightSnappedCollapsed = false;
        let widthSnappedExpanded = false, heightSnappedExpanded = false;

        const snapArea = entry.options.snapArea || 40;

        if (entry.options.snapHorizontal && data.affectsWidth) {
            if (entry.options.snapCollapse && rawWidthCandidate < snapArea) {
                newWidth = 0;
                widthSnappedCollapsed = true;
            } else if (entry.options.snapExpand && entry.target.parentElement) {
                const pw = entry.target.parentElement.getBoundingClientRect().width;
                if (rawWidthCandidate > (pw - snapArea)) {
                    newWidth = pw;
                    widthSnappedExpanded = true;
                }
            }
        }

        if (entry.options.snapVertical && data.affectsHeight) {
            if (entry.options.snapCollapse && rawHeightCandidate < snapArea) {
                newHeight = 0;
                heightSnappedCollapsed = true;
            } else if (entry.options.snapExpand && entry.target.parentElement) {
                const ph = entry.target.parentElement.getBoundingClientRect().height;
                if (rawHeightCandidate > (ph - snapArea)) {
                    newHeight = ph;
                    heightSnappedExpanded = true;
                }
            }
        }

        const snappedCollapsed = widthSnappedCollapsed || heightSnappedCollapsed;
        const snappedExpanded  = widthSnappedExpanded  || heightSnappedExpanded;
        const horizExpanded    = widthSnappedExpanded  && entry.options.snapExpand;
        const vertExpanded     = heightSnappedExpanded && entry.options.snapExpand;

        // --- Boundary constraints ---
        if (data.boundary) {
            const bx = data.boundary.x || 0;
            const by = data.boundary.y || 0;
            const bw = data.boundary.width;
            const bh = data.boundary.height;

            if (data.absolutePositioned) {
                // Constrain left edge
                const leftInBoundary = newPosX + data.targetOffsetX;
                if (leftInBoundary < bx) {
                    const diff = bx - leftInBoundary;
                    newPosX += diff;
                    if (data.isWest) {
                        newWidth -= diff;
                    }
                }

                // Constrain top edge
                const topInBoundary = newPosY + data.targetOffsetY;
                if (topInBoundary < by) {
                    const diff = by - topInBoundary;
                    newPosY += diff;
                    if (data.isNorth) {
                        newHeight -= diff;
                    }
                }

                // Constrain right edge
                const rightInBoundary = newPosX + data.targetOffsetX + newWidth;
                if (rightInBoundary > bx + bw) {
                    const diff = rightInBoundary - (bx + bw);
                    if (data.isEast) {
                        newWidth -= diff;
                    } else if (data.isWest) {
                        newPosX -= diff;
                    }
                }

                // Constrain bottom edge
                const bottomInBoundary = newPosY + data.targetOffsetY + newHeight;
                if (bottomInBoundary > by + bh) {
                    const diff = bottomInBoundary - (by + bh);
                    if (data.isSouth) {
                        newHeight -= diff;
                    } else if (data.isNorth) {
                        newPosY -= diff;
                    }
                }
            } else {
                // For non-absolute elements, just constrain dimensions
                if (newWidth  > bw) newWidth  = bw;
                if (newHeight > bh) newHeight = bh;
            }

            // Re-apply min constraints after boundary clamping
            if (newWidth  < data.minMax[0]) newWidth  = data.minMax[0];
            if (newHeight < data.minMax[1]) newHeight = data.minMax[1];
        }

        if (entry.options.map && typeof entry.options.map === 'function') {
            const mapped = entry.options.map({
                side: data.side,
                width: newWidth,
                height: newHeight,
                posX: newPosX,
                posY: newPosY,
                snappedCollapsed,
                snappedExpanded,
                event,
                cancelIfUnchanged: false
            });
            
            if (mapped) {
                if (mapped.cancelIfUnchanged && data.endWidth === newWidth && data.endHeight === newHeight) {
                    return;
                }

                if (mapped.width != null)  newWidth = mapped.width;
                if (mapped.height != null) newHeight = mapped.height;
                if (mapped.posX != null)   newPosX = mapped.posX;
                if (mapped.posY != null)   newPosY = mapped.posY;
                if (mapped.snappedCollapsed != null) snappedCollapsed = mapped.snappedCollapsed;
                if (mapped.snappedExpanded != null) snappedExpanded = mapped.snappedExpanded;
            }
        }

        // Manage classes
        if (snappedCollapsed) {
            entry.target.classList.add('ls-resize-collapsed');
            entry.target.classList.remove('ls-resize-expanded');
        } else if (snappedExpanded) {
            entry.target.classList.add('ls-resize-expanded');
            entry.target.classList.remove('ls-resize-collapsed');
        } else {
            entry.target.classList.remove('ls-resize-collapsed');
            entry.target.classList.remove('ls-resize-expanded');
        }

        const evtd = [data.side, newWidth, newHeight, newPosX, newPosY, entry.states[data.side]];
        entry.emit('resize', evtd);
        evtd.unshift({ target: entry.target, side: data.side, handler: entry });
        LS.Resize.emit('resize', evtd);

        // Apply position only if axis affected & absolute
        if (data.absolutePositioned) {
            if (entry.options.translate) {
                if (data.isWest || data.isNorth) {
                    entry.target.style.transform = `translate3d(${newPosX}px, ${newPosY}px, 0)`;
                }
            } else {
                if (data.isWest) entry.target.style.left = newPosX + 'px';
                if (data.isNorth) entry.target.style.top = newPosY + 'px';
            }
        }

        // Apply size
        if (data.affectsWidth || widthSnappedCollapsed || widthSnappedExpanded) {
            if (horizExpanded) entry.target.style.width = '100%';
            else entry.target.style.width = newWidth + 'px';
        }

        if (data.affectsHeight || heightSnappedCollapsed || heightSnappedExpanded) {
            if (vertExpanded) entry.target.style.height = '100%';
            else entry.target.style.height = newHeight + 'px';
        }

        entry.states[data.side] = 'normal';
        if      (snappedCollapsed || entry.target.classList.contains('ls-resize-collapsed')) entry.states[data.side] = 'collapsed';
        else if (snappedExpanded  || entry.target.classList.contains('ls-resize-expanded'))  entry.states[data.side] = 'expanded';

        data.endWidth  = newWidth;
        data.endHeight = newHeight;

        if (entry.options.cursors !== false && entry.options.boundsCursors !== false) {
            const canExpandWidth  = newWidth  < data.minMax[2];
            const canShrinkWidth  = newWidth  > data.minMax[0];
            const canExpandHeight = newHeight < data.minMax[3];
            const canShrinkHeight = newHeight > data.minMax[1];

            let cur = entry.cursor;
            if (data.isWest || data.isEast) {
                if (canExpandWidth && canShrinkWidth) cur = 'ew-resize';
                else if (canExpandWidth && !canShrinkWidth) cur = data.isWest ? 'w-resize' : 'e-resize';
                else if (!canExpandWidth && canShrinkWidth) cur = data.isWest ? 'e-resize' : 'w-resize';
                else cur = 'not-allowed';
            } else if (data.isNorth || data.isSouth) {
                if (canExpandHeight && canShrinkHeight) cur = 'ns-resize';
                else if (canExpandHeight && !canShrinkHeight) cur = data.isNorth ? 'n-resize' : 's-resize';
                else if (!canExpandHeight && canShrinkHeight) cur = data.isNorth ? 's-resize' : 'n-resize';
                else cur = 'not-allowed';
            }

            entry.cursor = cur;
        }
    }

    static release(event, data) {
        const entry = data.entry;

        if(entry.storage) try {
            const storageData = {
                width:  entry.target.style.width  || null,
                height: entry.target.style.height || null,
                state:  entry.target.classList.contains('ls-resize-collapsed') ? 'collapsed' : (entry.target.classList.contains('ls-resize-expanded') ? 'expanded' : 'normal')
            };

            if (entry.options.translate) {
                const transform = window.getComputedStyle(entry.target).transform;
                let mat = transform.match(/^matrix3d\((.+)\)$/);
                if (mat) {
                    storageData.translateX = parseFloat(mat[1].split(', ')[12]);
                    storageData.translateY = parseFloat(mat[1].split(', ')[13]);
                } else {
                    mat = transform.match(/^matrix\((.+)\)$/);
                    if (mat) {
                        storageData.translateX = parseFloat(mat[1].split(', ')[4]);
                        storageData.translateY = parseFloat(mat[1].split(', ')[5]);
                    } else {
                        storageData.translateX = 0;
                        storageData.translateY = 0;
                    }
                }
            } else {
                storageData.left = entry.target.style.left || null;
                storageData.top = entry.target.style.top || null;
            }

            entry.storage.setItem(entry.storeKey, entry.options?.storeStringify !== false ? JSON.stringify(storageData) : storageData);
        } catch(e) { console.error(e) }

        LS.Resize.emit('resize-end', [{ target: entry.target, handler: entry, side: data.side }, data.endHeight, data.endWidth, entry.states[data.side]?.currentState || 'normal']);
        entry.emit('resize-end', [data.side, data.endHeight, data.endWidth, entry.states[data.side]?.currentState || 'normal']);

        // Cleanup state just in case
        data.target = null;
        data.entry = null;
        data.boundingBox = null;
        data.startPosX = null;
        data.startPosY = null;
        data.endWidth  = null;
        data.endHeight = null;
        data.boundary = null;
        data.targetOffsetX = null;
        data.targetOffsetY = null;
        data.minMax = null;
    }
}

/*@ls-export*/ if (typeof module !== "undefined" && module.exports) {
    module.exports = Resize;
}