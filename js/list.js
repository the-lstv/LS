/**
 * ListView base for LS with optimized virtualized rendering.
 * Used for general-purpose high-performance virtualized lists/trees.
 * Handles automatic resizing, dynamic updates, etc.
 * 
 * ! Doesn't currently support variable height (fixed-height rows only).
 * ! Early stages component. The flat structure is very hacky as of now & testing is needed.
 * 
 * Future improvements:
 * * Drag and drop support
 * * Overlays, maybe
 * * More customization
 * 
 * @version 0.2.1
 */

class List extends LS.Component {
    static { LS.register(this, { name: "List", global: true }) }

    // See constructor for documentation on options
    static defaults = LS.Util.staticDefaults({
        rowHeight: 24,
        updateNode: null,
        createNode: null,
        loadData: null,
        overscan: 2,
        
        // Related to default styling:
        space: 16,
        styled: true,
        lazy: false,
        guides: true,
        icons: true,
        iconClass: "li-icons",
        caretIconClass: null,

        // Misc
        maxFramerate: -1,
    });

    #scroll = 0;
    overscan = 2;

    // Internals
    #startIndex = null;
    #segmentBaseIndex = 0;
    #containerHeight = 0;
    #scrollDirty = false;
    #pendingDataRefresh = true;
    #lastRowHeight = 0;
    #lastFakeHeight = 0;
    #lastContentOffset = null;
    #resizeObserver = null;

    // Flat-Tree State
    #listItems = [];
    #listDirty = true;
    #focusedNode = null;

    constructor(options = {}){
        super();

        /**
         * Structure:
         * 
         * container
         *  - content (moves with the scroll offset to give the illusion of scrolling)
         *    - tree-node (flat structure)
         *  - fakeScroll (for proper scrollbar height, which there *still* isn't a better way to achieve without custom scrollbars, that i know of, let me know if there is a better way. actually making a custom scrollbar seems fun. should i?)
         */
        this.container = this.createElement({ class: "ls-list", role: "list", inner: [
            (this.content = this.createElement({ class: "ls-list-content" })),
            (this.fakeScroll = this.createElement({ class: "ls-list-fake-scroll" })),
        ] });

        this.options = this.constructor.defaults(options);

        this.frameScheduler = this.addDestroyable(new LS.Util.FrameScheduler(() => this.#render()));

        this.updateOptions(this.options);
    }

    /**
     * Update the tree's options dynamically.
     * @param {*} options 
     */
    updateOptions(options) {
        if(options.rowHeight !== undefined) {
            this.container.style.setProperty("--ls-tree-row-height", `${options.rowHeight}px`);
            this.options.rowHeight = options.rowHeight;
        }

        if(options.scroll !== undefined) {
            this.#scroll = options.scroll;
            this.container.scrollTop = options.scroll;
            this.#scrollDirty = true;
            delete options.scroll;
        }

        if(options.data) {
            this.loadData(options.data);
            delete options.data;
        }

        if(options.maxFramerate > 0){
            this.frameScheduler.limitFPS(options.maxFramerate);
        }

        if(options.target) {
            // We don't really care where the user appends the component or how or when.
            // Most libraries don't seem to grasp that concept and force some mounting bs
            options.target.append(this.container);
            delete options.target;
        }

        if(typeof options.updateNode === "function") this.options.updateNode = options.updateNode;
        if(typeof options.createNode === "function") this.options.createNode = options.createNode;
        if(options.overscan !== undefined) this.overscan = options.overscan;
        if(options.lazy !== undefined) this.options.lazy = options.lazy;
        if(options.styled !== undefined) {
            this.container.classList.toggle("ls-tree-styled", options.styled);
            this.options.styled = options.styled;
        }

        this.render();
    }
}

/*@ls-export*/ if (typeof module !== "undefined" && module.exports) {
    module.exports = List;
}