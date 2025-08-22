/**
 * A very flexible and robust resizer library for LS.
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
     * Sides and corners can be specified in three ways:
     * - As a CSS-style array of booleans/numbers (e.g. [true, false, true, false])
     * - As an array of strings (e.g. ["top", "bottom"])
     * - In the object { top: true, right: false, bottom: true, left: false }
     * 
     * Other options:
     * @param {boolean} [options.styled=true] - Whether to apply default visual styles.
     * @param {number|string} [options.handleSize] - Size of the side handles.
     * @param {number|string} [options.cornerSize] - Size of the corner handles.
     * @param {string} [options.anchor=0.5] - Whether handles should be outside, inside, or in the center of the edge. (0 = inside, 0.5 = center, 1 = outside)
     * @param {boolean} [options.cursors=true] - Whether to set the cursor when dragging.
     * @param {number} [options.minWidth=20] - Minimum width of the target element (overrides CSS min-width value).
     * @param {number} [options.minHeight=20] - Minimum height of the target element (overrides CSS min-height value).
     * @param {number} [options.maxWidth=null] - Maximum width of the target element (overrides CSS max-width value).
     * @param {number} [options.maxHeight=null] - Maximum height of the target element (overrides CSS max-height value).
     * @returns An object with the registered handles
     * @example
     * LS.Resize.set(element, {
     *     styled: true,
     *     sides: ["top", "bottom"],
     *     corners: [1, 0, 1, 0]
     * });
     */
    set(target, options) {
        let entry = this.targets.get(target);
        if(!entry) {
            entry = { target, handles: {} };
            const defaultChoice = !options;
            options = LS.Util.defaults({
                styled: true,
                top: defaultChoice,
                right: defaultChoice,
                bottom: defaultChoice,
                left: defaultChoice,
                topLeft: null,
                topRight: null,
                bottomRight: null,
                bottomLeft: null,
                cursors: true // enable resize cursors by default
            }, options || {});
            this.targets.set(target, entry);
        }

        if(Array.isArray(options.sides)) {
            options.top = options.sides[0] === 1 || options.sides.includes("top");
            options.right = options.sides[1] === 1 || options.sides.includes("right");
            options.bottom = options.sides[2] === 1 || options.sides.includes("bottom");
            options.left = options.sides[3] === 1 || options.sides.includes("left");
        }

        if(Array.isArray(options.corners)) {
            options.topLeft = options.corners[0] === 1 || options.corners.includes("top-left");
            options.topRight = options.corners[1] === 1 || options.corners.includes("top-right");
            options.bottomRight = options.corners[2] === 1 || options.corners.includes("bottom-right");
            options.bottomLeft = options.corners[3] === 1 || options.corners.includes("bottom-left");
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
                if(entry.hasOwnProperty(side)) continue;

                const element = N("div", { class: `ls-resize-handle ls-${side}` + (options.styled? " ls-resize-handle-styled": "") + (isCorner? " ls-resize-handle-corner": "") });

                let startX = 0, startY = 0;
                let startWidth = 0, startHeight = 0;
                let startTop = 0, startLeft = 0; // page-based (rect) values
                let startTopStyle = 0, startLeftStyle = 0; // style/offsetParent based values used for writing back
                let minWidth, minHeight, maxWidth, maxHeight;
                let absolutePositioned = false; // detected at drag start

                const handler = LS.Util.touchHandle(element, {
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
                        startTop = rect.top + window.scrollY; // kept for reference (height math)
                        startLeft = rect.left + window.scrollX;
                        // Use style / offsetParent coordinates for adjustments to avoid jump
                        startTopStyle = !isNaN(parseFloat(style.top)) ? parseFloat(style.top) : target.offsetTop;
                        startLeftStyle = !isNaN(parseFloat(style.left)) ? parseFloat(style.left) : target.offsetLeft;
                        startX = mx;
                        startY = my;
                        absolutePositioned = style.position === 'absolute';
                    },
                    onMove(mx, my) {
                        let dx = mx - startX;
                        let dy = my - startY;
                        let newWidth = startWidth;
                        let newHeight = startHeight;
                        // Use style-space starting points (relative to offsetParent) for writing
                        let newTop = startTopStyle;
                        let newLeft = startLeftStyle;

                        // Width calculations
                        if (["left","topLeft","bottomLeft"].includes(side)) {
                            let candidate = startWidth - dx;
                            if (candidate < minWidth) {
                                candidate = minWidth;
                                dx = startWidth - candidate;
                            } else if (candidate > maxWidth) {
                                candidate = maxWidth;
                                dx = startWidth - candidate;
                            }
                            newWidth = candidate;
                            newLeft = startLeftStyle + dx; // adjust within offsetParent space
                        } else if (["right","topRight","bottomRight"].includes(side)) {
                            let candidate = startWidth + dx;
                            if (candidate < minWidth) candidate = minWidth;
                            if (candidate > maxWidth) candidate = maxWidth;
                            newWidth = candidate;
                        }

                        // Height calculations
                        if (["top","topLeft","topRight"].includes(side)) {
                            let candidate = startHeight - dy;
                            if (candidate < minHeight) {
                                candidate = minHeight;
                                dy = startHeight - candidate;
                            } else if (candidate > maxHeight) {
                                candidate = maxHeight;
                                dy = startHeight - candidate;
                            }
                            newHeight = candidate;
                            newTop = startTopStyle + dy;
                        } else if (["bottom","bottomLeft","bottomRight"].includes(side)) {
                            let candidate = startHeight + dy;
                            if (candidate < minHeight) candidate = minHeight;
                            if (candidate > maxHeight) candidate = maxHeight;
                            newHeight = candidate;
                        }

                        target.style.width = newWidth + 'px';
                        target.style.height = newHeight + 'px';

                        if (absolutePositioned) {
                            if (["left","topLeft","bottomLeft"].includes(side)) target.style.left = newLeft + 'px';
                            if (["top","topLeft","topRight"].includes(side)) target.style.top = newTop + 'px';
                        }
                    }
                });

                entry[side] = { element, handler };

                target.appendChild(element);
            } else if (entry.hasOwnProperty(side)) {
                entry[side].handler.destroy();
                entry[side].element.remove();
                delete entry[side];
            }
        }

        this.targets.set(target, entry);
        return entry.handles;
    }

    remove(target) {
        const entry = this.targets.get(target);
        if (entry) {
            for (const handle of entry.handles) {
                handle.handler.destroy();
                handle.element.remove();
            }
            this.targets.delete(target);
            return true;
        }
        return false;
    }
}, { name: "Resize", singular: true, global: true })
