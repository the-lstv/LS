/**
 * A flexible and robust resizer library for LS.
 * Adds resize bars to any side or corner of an element.
 * Automatically adjusts to absolute/relative positioning and works with touch events as well.
 * Note: ls.css is required.
 * @version 1.0.0
 */

LS.LoadComponent(class Resize extends LS.Component {
    constructor(){
        super();
        this.targets = new Map();
    }

    /**
     * Adds a resize handle to a target element. It can be called multiple times on the same element to change sides or options.
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
     * @param {object} [options.storage=null] - Custom storage object (must implement getItem/setItem). Default is localStorage.
     * @returns An object with the registered handles
     * Events on handle:
     * - resize: Emitted when the element is resized with the new width, height, and state.
     * - start: Emitted when resizing starts.
     * - end: Emitted when resizing ends.
     * @example
     * LS.Resize.set(element, {
     *     sides: ["top", "bottom"],
     *     corners: [1, 0, 1, 0]
     * });
     */
    set(target, options) {
        let entry = this.targets.get(target);
        if(!entry) {
            entry = { target, handles: {}, restored: false };
            if(!options) {
                options = {
                    top: true,
                    right: true,
                    bottom: true,
                    left: true
                };
            }
            this.targets.set(target, entry);
        }

        options = LS.Util.defaults({
            styled: entry.options?.styled ?? true,
            cursors: entry.options?.cursors ?? true,
            boundsCursors: entry.options?.boundsCursors ?? true,
            snapArea: entry.options?.snapArea ?? 40,
            snapCollapse: entry.options?.snapCollapse ?? false,
            snapExpand: entry.options?.snapExpand ?? false,
            snapVertical: entry.options?.snapVertical ?? false,
            snapHorizontal: entry.options?.snapHorizontal ?? false,
            // --- boundary option ---
            boundary: entry.options?.boundary ?? null,    // "viewport" or {x, y, width, height}
            // --- persistence options ---
            store: entry.options?.store ?? null,          // string key
            storage: entry.options?.storage ?? null,      // custom storage (must implement getItem/setItem)
        }, options || {});

        entry.options = options;
        

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
        const storeKey = typeof options?.store === 'string' ? options.store : null;
        const storage = options.storage || (typeof window !== 'undefined' ? window.localStorage : null);

        if(storeKey && !entry.restored && storage) {
            try {
                const raw = storage.getItem(storeKey);
                if(raw) {
                    const data = JSON.parse(raw);
                    if(data && typeof data === 'object') {
                        if(data.width != null) target.style.width = data.width;
                        if(data.height != null) target.style.height = data.height;
                        if(data.left != null) target.style.left = data.left;
                        if(data.top != null) target.style.top = data.top;
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

        const self = this; // reference for event emitting inside closures
        let i = 0;
        for(let side of ["top", "right", "bottom", "left", "topLeft", "topRight", "bottomRight", "bottomLeft"]) {
            const isCorner = i >= 4;
            i++;

            if(options[side]) {
                if(entry.handles.hasOwnProperty(side)) continue;

                const element = N("div", { class: `ls-resize-handle ls-${side}` + (options.styled? " ls-resize-handle-styled": "") + (isCorner? " ls-resize-handle-corner": "") });

                let startX = 0, startY = 0;
                let startWidth = 0, startHeight = 0;
                // let startTop = 0, startLeft = 0; // page-based (rect) values
                let startTopStyle = 0, startLeftStyle = 0; // style/offsetParent based values used for writing back
                let minWidth, minHeight, maxWidth, maxHeight;
                let absolutePositioned = false; // detected at drag start
                let boundaryRect = null; // computed boundary rect
                let targetOffsetX = 0, targetOffsetY = 0; // offset from boundary origin to target's offset parent

                // helper to persist current state
                const persist = () => {
                    if(!storeKey || !storage) return;
                    try {
                        const data = {
                            width: target.style.width || null,
                            height: target.style.height || null,
                            left: target.style.left || null,
                            top: target.style.top || null,
                            state: target.classList.contains('ls-resize-collapsed') ? 'collapsed' : (target.classList.contains('ls-resize-expanded') ? 'expanded' : 'normal')
                        };
                        storage.setItem(storeKey, JSON.stringify(data));
                    } catch(e) { console.error(e) }
                };

                const handler = LS.Util.touchHandle(element, {
                    // frameTimed: true, // Limits move calls to the frame rate

                    onStart(e, c, mx, my) {
                        const rect = target.getBoundingClientRect();
                        const style = window.getComputedStyle(target);
                        if (options.cursors !== false) {
                            const cursorMap = {
                                top: 'ns-resize',
                                bottom: 'ns-resize',
                                left: 'ew-resize',
                                right: 'ew-resize',
                                topLeft: 'nwse-resize',
                                bottomRight: 'nwse-resize',
                                topRight: 'nesw-resize',
                                bottomLeft: 'nesw-resize'
                            };
                            const cur = cursorMap[side];
                            if (cur) {
                                handler.cursor = cur;
                            }
                        }
                        minWidth = options.minWidth || parseFloat(style.minWidth) || 20;
                        minHeight = options.minHeight || parseFloat(style.minHeight) || 20;
                        maxWidth = options.maxWidth || parseFloat(style.maxWidth) || Infinity;
                        maxHeight = options.maxHeight || parseFloat(style.maxHeight) || Infinity;
                        startWidth = rect.width;
                        startHeight = rect.height;
                        // startTop = rect.top + window.scrollY;
                        // startLeft = rect.left + window.scrollX;
                        // Use style / offsetParent coordinates for adjustments to avoid jump
                        startTopStyle = !isNaN(parseFloat(style.top)) ? parseFloat(style.top) : target.offsetTop;
                        startLeftStyle = !isNaN(parseFloat(style.left)) ? parseFloat(style.left) : target.offsetLeft;
                        startX = mx;
                        startY = my;
                        absolutePositioned = style.position === 'absolute' || style.position === 'fixed';
                        
                        // Compute boundary rect
                        if (options.boundary === 'viewport') {
                            boundaryRect = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
                        } else if (options.boundary && typeof options.boundary === 'object') {
                            boundaryRect = options.boundary;
                        } else {
                            boundaryRect = null;
                        }
                        
                        // Calculate offset from boundary to target's positioning context
                        if (boundaryRect && absolutePositioned) {
                            if (style.position === 'fixed') {
                                // Fixed position is relative to viewport
                                targetOffsetX = 0;
                                targetOffsetY = 0;
                            } else {
                                // Absolute position is relative to offsetParent
                                const offsetParent = target.offsetParent || document.body;
                                const parentRect = offsetParent.getBoundingClientRect();
                                targetOffsetX = parentRect.left + window.scrollX - (boundaryRect.x || 0);
                                targetOffsetY = parentRect.top + window.scrollY - (boundaryRect.y || 0);
                            }
                        }
                    },
                    onMove(mx, my) {
                        let dx = mx - startX;
                        let dy = my - startY;
                        let newWidth = startWidth;
                        let newHeight = startHeight;
                        let newTop = startTopStyle;
                        let newLeft = startLeftStyle;

                        const affectsWidth = ["left","right","topLeft","topRight","bottomRight","bottomLeft"].includes(side);
                        const affectsHeight = ["top","bottom","topLeft","topRight","bottomRight","bottomLeft"].includes(side);

                        // Pre-calc raw candidates (before min/max) for snapping decisions
                        let rawWidthCandidate = startWidth;
                        let rawHeightCandidate = startHeight;
                        if (["left","topLeft","bottomLeft"].includes(side)) rawWidthCandidate = startWidth - dx;
                        else if (["right","topRight","bottomRight"].includes(side)) rawWidthCandidate = startWidth + dx;
                        if (["top","topLeft","topRight"].includes(side)) rawHeightCandidate = startHeight - dy;
                        else if (["bottom","bottomLeft","bottomRight"].includes(side)) rawHeightCandidate = startHeight + dy;

                        if (["left","topLeft","bottomLeft"].includes(side)) {
                            let candidate = startWidth - dx;
                            if (candidate < minWidth) { candidate = minWidth; dx = startWidth - candidate; }
                            else if (candidate > maxWidth) { candidate = maxWidth; dx = startWidth - candidate; }
                            newWidth = candidate;
                            newLeft = startLeftStyle + dx;
                        } else if (["right","topRight","bottomRight"].includes(side)) {
                            let candidate = startWidth + dx;
                            if (candidate < minWidth) candidate = minWidth;
                            if (candidate > maxWidth) candidate = maxWidth;
                            newWidth = candidate;
                        }

                        if (["top","topLeft","topRight"].includes(side)) {
                            let candidate = startHeight - dy;
                            if (candidate < minHeight) { candidate = minHeight; dy = startHeight - candidate; }
                            else if (candidate > maxHeight) { candidate = maxHeight; dy = startHeight - candidate; }
                            newHeight = candidate;
                            newTop = startTopStyle + dy;
                        } else if (["bottom","bottomLeft","bottomRight"].includes(side)) {
                            let candidate = startHeight + dy;
                            if (candidate < minHeight) candidate = minHeight;
                            if (candidate > maxHeight) candidate = maxHeight;
                            newHeight = candidate;
                        }

                        // --- Snapping logic (track per-axis) ---
                        let widthSnappedCollapsed = false, heightSnappedCollapsed = false;
                        let widthSnappedExpanded = false, heightSnappedExpanded = false;

                        const snapArea = options.snapArea || 40;

                        if (options.snapHorizontal && affectsWidth) {
                            if (options.snapCollapse && rawWidthCandidate < snapArea) {
                                newWidth = 0;
                                widthSnappedCollapsed = true;
                            } else if (options.snapExpand && target.parentElement) {
                                const pw = target.parentElement.getBoundingClientRect().width;
                                if (rawWidthCandidate > (pw - snapArea)) {
                                    newWidth = pw;
                                    widthSnappedExpanded = true;
                                }
                            }
                        }

                        if (options.snapVertical && affectsHeight) {
                            if (options.snapCollapse && rawHeightCandidate < snapArea) {
                                newHeight = 0;
                                heightSnappedCollapsed = true;
                            } else if (options.snapExpand && target.parentElement) {
                                const ph = target.parentElement.getBoundingClientRect().height;
                                if (rawHeightCandidate > (ph - snapArea)) {
                                    newHeight = ph;
                                    heightSnappedExpanded = true;
                                }
                            }
                        }

                        const snappedCollapsed = widthSnappedCollapsed || heightSnappedCollapsed;
                        const snappedExpanded = widthSnappedExpanded || heightSnappedExpanded;

                        const horizExpanded = widthSnappedExpanded && options.snapExpand;
                        const vertExpanded = heightSnappedExpanded && options.snapExpand;

                        // Apply position only if axis affected & absolute
                        if (absolutePositioned) {
                            if (["left","topLeft","bottomLeft"].includes(side)) target.style.left = newLeft + 'px';
                            if (["top","topLeft","topRight"].includes(side)) target.style.top = newTop + 'px';
                        }

                        // Apply dimensions only when that axis is being resized (prevents assigning fixed px values unintentionally)
                        if (affectsWidth || widthSnappedCollapsed || widthSnappedExpanded) {
                            if (horizExpanded) target.style.width = '100%';
                            else target.style.width = newWidth + 'px';
                        }
                        if (affectsHeight || heightSnappedCollapsed || heightSnappedExpanded) {
                            if (vertExpanded) target.style.height = '100%';
                            else target.style.height = newHeight + 'px';
                        }

                        // Manage classes
                        if (snappedCollapsed) {
                            target.classList.add('ls-resize-collapsed');
                            target.classList.remove('ls-resize-expanded');
                        } else if (snappedExpanded) {
                            target.classList.add('ls-resize-expanded');
                            target.classList.remove('ls-resize-collapsed');
                        } else {
                            target.classList.remove('ls-resize-collapsed');
                            target.classList.remove('ls-resize-expanded');
                        }

                        // --- Boundary constraints ---
                        if (boundaryRect) {
                            const bx = boundaryRect.x || 0;
                            const by = boundaryRect.y || 0;
                            const bw = boundaryRect.width;
                            const bh = boundaryRect.height;

                            if (absolutePositioned) {
                                // Constrain left edge
                                const leftInBoundary = newLeft + targetOffsetX;
                                if (leftInBoundary < bx) {
                                    const diff = bx - leftInBoundary;
                                    newLeft += diff;
                                    if (["left","topLeft","bottomLeft"].includes(side)) {
                                        newWidth -= diff;
                                    }
                                }
                                // Constrain top edge
                                const topInBoundary = newTop + targetOffsetY;
                                if (topInBoundary < by) {
                                    const diff = by - topInBoundary;
                                    newTop += diff;
                                    if (["top","topLeft","topRight"].includes(side)) {
                                        newHeight -= diff;
                                    }
                                }
                                // Constrain right edge
                                const rightInBoundary = newLeft + targetOffsetX + newWidth;
                                if (rightInBoundary > bx + bw) {
                                    const diff = rightInBoundary - (bx + bw);
                                    if (["right","topRight","bottomRight"].includes(side)) {
                                        newWidth -= diff;
                                    } else if (["left","topLeft","bottomLeft"].includes(side)) {
                                        newLeft -= diff;
                                    }
                                }
                                // Constrain bottom edge
                                const bottomInBoundary = newTop + targetOffsetY + newHeight;
                                if (bottomInBoundary > by + bh) {
                                    const diff = bottomInBoundary - (by + bh);
                                    if (["bottom","bottomLeft","bottomRight"].includes(side)) {
                                        newHeight -= diff;
                                    } else if (["top","topLeft","topRight"].includes(side)) {
                                        newTop -= diff;
                                    }
                                }
                            } else {
                                // For non-absolute elements, just constrain dimensions
                                if (newWidth > bw) newWidth = bw;
                                if (newHeight > bh) newHeight = bh;
                            }

                            // Re-apply min constraints after boundary clamping
                            if (newWidth < minWidth) newWidth = minWidth;
                            if (newHeight < minHeight) newHeight = minHeight;
                        }

                        let currentState = 'normal';
                        if (snappedCollapsed || target.classList.contains('ls-resize-collapsed')) currentState = 'collapsed';
                        else if (snappedExpanded || target.classList.contains('ls-resize-expanded')) currentState = 'expanded';

                        self.emit('resize', [{target, handler, side}, newWidth, newHeight, currentState]);
                        handler.emit('resize', [newWidth, newHeight, currentState]);

                        if (options.cursors !== false && options.boundsCursors !== false) {
                            const canExpandWidth = newWidth < maxWidth;
                            const canShrinkWidth = newWidth > minWidth;
                            const canExpandHeight = newHeight < maxHeight;
                            const canShrinkHeight = newHeight > minHeight;
                            let cur = handler.cursor;
                            if (["left","right"].includes(side)) {
                                if (canExpandWidth && canShrinkWidth) cur = 'ew-resize';
                                else if (canExpandWidth && !canShrinkWidth) cur = side === 'left' ? 'w-resize' : 'e-resize';
                                else if (!canExpandWidth && canShrinkWidth) cur = side === 'left' ? 'e-resize' : 'w-resize';
                                else cur = 'not-allowed';
                            } else if (["top","bottom"].includes(side)) {
                                if (canExpandHeight && canShrinkHeight) cur = 'ns-resize';
                                else if (canExpandHeight && !canShrinkHeight) cur = side === 'top' ? 'n-resize' : 's-resize';
                                else if (!canExpandHeight && canShrinkHeight) cur = side === 'top' ? 's-resize' : 'n-resize';
                                else cur = 'not-allowed';
                            }
                            handler.cursor = cur;
                        }
                    },
                    onEnd() {
                        persist();
                    }
                });

                entry.handles[side] = { element, handler };

                target.appendChild(element);
            } else if (entry.handles.hasOwnProperty(side)) {
                entry.handles[side].handler.destroy();
                entry.handles[side].element.remove();
                delete entry.handles[side];
            }
        }

        this.targets.set(target, entry);

        return entry.handles;
    }

    remove(target) {
        const entry = this.targets.get(target);
        if (entry) {
            if(entry._removalObserver) {
                entry._removalObserver.disconnect();
                delete entry._removalObserver;
            }
            for (const side in entry.handles) {
                entry.handles[side].handler.destroy();
                entry.handles[side].element.remove();
            }
            this.targets.delete(target);
            return true;
        }
        return false;
    }
}, { name: "Resize", singular: true, global: true })
