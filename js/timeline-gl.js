/**
 * A (work in progress) WebGL version of the fast & efficient timeline component.
 * It handles drag and drop, resizing, slicing, markers, touch controls, etc.
 * Features highly intuitive keyboard controls.
 * 
 * Based on the original DOM version (timeline.js), rewritten from scratch for WebGL.
 * 
 * WebGPU is not yet supported though may be in the future if it is deemed worthwhile
 * 
 * @author lstv.space
 * @license GPL-3.0
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

    LS.LoadComponent(class TimelineGL extends LS.Component {
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
                dependencies: ["Menu", "GL"]
            });

            this.options = LS.Util.defaults(DEFAULTS, options);

            this.container = document.createElement("div");
        }

    }, { name: "TimelineGL", global: true });
})();