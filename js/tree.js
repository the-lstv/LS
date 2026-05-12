/**
 * Tree Component for LS with optimized virtualized rendering.
 * Can also be used as a general-purpose virtualized list.
 * Supports automatic resizing, dynamic updates, etc.
 * Early stages component.
 * 
 * TODO:
 * - Flattened tree structure
 * - Expand/collapse logic
 * - Keyboard navigation
 * - Accessibility improvements
 * - Drag and drop support
 * - Overlays, maybe
 * - More customization
 * 
 * @version 0.1.0
 */

LS.LoadComponent(class Tree extends LS.Component {
    static defaults = LS.Util.staticDefaults({
        rowHeight: 24, // Height of each row in pixels
        updateNode: null,
        createNode: null,
        overscan: 2,
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

    /**
     * Create a new Tree component.
     * @param {*} options - Configuration options for the tree.
     * @param {function} options.updateNode - A function that will be called when it is time to update a node's content. It will receive the node data and the corresponding DOM element as arguments.
     * @param {function} options.createNode - A function that will be called when it is time to create a new node. It should return a DOM element.
     * @param {number} options.overscan - The number of rows to render outside the visible area.
     * @param {number} options.rowHeight - The height of each row in pixels.
     * @param {Array} options.data - The initial tree data to load.
     * @param {Element} options.target - The DOM element to which the tree should be appended. If not provided, the tree will simply not be appended automatically, and you can do it manually (tree.container).
     */
    constructor(options) {
        super();

        /**
         * Structure:
         * 
         * container
         *  - content (moves with the scroll offset to give the illusion of scrolling)
         *    - tree-node (flat structure)
         *  - fakeScroll (for proper scrollbar height, which there *still* isn't a better way to achieve without custom scrollbars, that i know of, let me know if there is a better way. actually making a custom scrollbar seems fun. should i?)
         */
        this.container = this.createElement({ class: "ls-tree", role: "tree", inner: [
            (this.content = this.createElement({ class: "ls-tree-content" })),
            (this.fakeScroll = this.createElement({ class: "ls-tree-fake-scroll" })),
        ] });

        this.options = this.constructor.defaults(options);

        this.frameScheduler = this.addDestroyable(new LS.Util.FrameScheduler(() => this.#render()));

        // Tree structure, as an actual tree structure
        this.nodes = [];

        // Lookup map
        this.nodeMap = new Map();

        // A fixed list of DOM nodes that we will recycle for rendering.
        // The length of this list will depend on the height of the container and the row height.
        this.domNodes = [];

        this.container.addEventListener("scroll", (event) => {
            this.#scroll = event.target.scrollTop;
            this.#scrollDirty = true;
            this.render();
        });

        if (typeof ResizeObserver !== "undefined") {
            this.#resizeObserver = new ResizeObserver((entries) => {
                const entry = entries[0];
                if(!entry) return;

                const newHeight = Math.round(entry.contentRect.height);
                if(newHeight === this.#containerHeight) return;
                this.#containerHeight = newHeight;
                this.render();
            });

            this.#resizeObserver.observe(this.container);
        }

        this.updateOptions(this.options);
    }

    get scroll() {
        return this.#scroll;
    }

    set scroll(value) {
        if(this.#scroll === value) return;
        this.#scroll = value;
        this.container.scrollTop = value;
        this.#scrollDirty = true;
        this.render();
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

        if(options.target) {
            // We don't really care where the user appends the component or how or when.
            // Most libraries don't seem to grasp that concept and force some mounting bs
            options.target.append(this.container);
            delete options.target;
        }

        if(typeof options.updateNode === "function") {
            this.options.updateNode = options.updateNode;
        }

        if(typeof options.createNode === "function") {
            this.options.createNode = options.createNode;
        }

        if(options.overscan !== undefined) {
            this.overscan = options.overscan;
        }

        this.render();
    }

    /**
     * Load data into the tree. The data should be an array of objects with the following structure:
     * {
     *   id: string,        // Unique identifier for the node
     *   parentId: string,  // Identifier of the parent node (null for root nodes)
     *   label: string,     // Text to display for the node
     *   children: array,   // Optional array of child nodes
     *   state: boolean,    // Expanded or collapsed
     *   ...any other user data, the component only uses the ones mentioned above.
     * }
     * @param {Array} data - The tree data to load.
     */
    loadData(data) {
        this.#pendingDataRefresh = true;
        for(let item of data) {
            this.addNode(item);
        }
    }

    /**
     * Render the tree (frame-scheduled).
     */
    render() { this.frameScheduler.schedule(); }

    /**
     * Actually render the tree.
     */
    #render() {
        // Temporary
        const flat = this.toFlat();
        const totalRows = flat.length;
        const rowHeight = this.options.rowHeight;

        // * Oh my fucking god this code is shit
        // * AI does NOT pay off
        // * Please remind me to rewrite this properly, I just did not have the time to do this
        // * And I am sorry for this

        if(!this.#resizeObserver || this.#containerHeight === 0) {
            this.#containerHeight = this.container.clientHeight;
        }

        const containerHeight = this.#containerHeight;
        const visibleCount = containerHeight > 0 ? Math.ceil(containerHeight / rowHeight) + 1 : 0;
        const targetPoolSize = Math.min(totalRows, Math.max(0, visibleCount + this.overscan * 2));
        const poolChanged = this.#ensurePoolSize(targetPoolSize);

        const maxScrollTop = Math.max(0, totalRows * rowHeight - containerHeight);
        const scrollTop = Math.min(this.#scroll, maxScrollTop);
        if(scrollTop !== this.#scroll) {
            this.#scroll = scrollTop;
            this.container.scrollTop = scrollTop;
        }

        const firstVisible = Math.max(0, Math.floor(scrollTop / rowHeight));
        const maxStart = Math.max(0, totalRows - this.domNodes.length);
        const unclampedStart = Math.max(0, firstVisible - this.overscan);
        const startIndex = Math.min(unclampedStart, maxStart);

        // hm?
        const minRows = 64;
        const maxRows = 1024;

        const segmentRows = Math.max(minRows, Math.min((this.domNodes.length || 1) * 2, maxRows));
        const segmentBaseIndex = Math.floor(firstVisible / segmentRows) * segmentRows;
        const contentOffset = scrollTop - segmentBaseIndex * rowHeight;

        if(this.#lastContentOffset !== contentOffset) {
            this.content.style.transform = `translateY(${-contentOffset}px)`;
            this.#lastContentOffset = contentOffset;
        }

        const fakeHeight = totalRows * rowHeight;
        if(this.#lastFakeHeight !== fakeHeight) {
            this.fakeScroll.style.height = `${fakeHeight}px`;
            this.#lastFakeHeight = fakeHeight;
        }

        const rowHeightChanged = rowHeight !== this.#lastRowHeight;
        const segmentChanged = segmentBaseIndex !== this.#segmentBaseIndex;
        const forceContentUpdate = this.#pendingDataRefresh || !this.#scrollDirty;
        const delta = this.#startIndex === null ? 0 : startIndex - this.#startIndex;

        const needsUpdate = this.#startIndex === null
            || poolChanged
            || rowHeightChanged
            || segmentChanged
            || forceContentUpdate
            || Math.abs(delta) >= this.domNodes.length;

        if(needsUpdate) {
            for(let i = 0; i < this.domNodes.length; i++) {
                this.#applyNode(this.domNodes[i], startIndex + i, flat, segmentBaseIndex, rowHeight, totalRows, forceContentUpdate);
            }
        } else if(delta !== 0) {
            const baseIndex = this.#startIndex;
            const poolSize = this.domNodes.length;

            if(delta > 0) {
                for(let i = 0; i < delta; i++) {
                    const domNode = this.domNodes.shift();
                    this.domNodes.push(domNode);
                    const newIndex = baseIndex + poolSize + i;
                    this.#applyNode(domNode, newIndex, flat, segmentBaseIndex, rowHeight, totalRows, false);
                }
            } else {
                for(let i = 0; i < Math.abs(delta); i++) {
                    const domNode = this.domNodes.pop();
                    this.domNodes.unshift(domNode);
                    const newIndex = baseIndex - 1 - i;
                    this.#applyNode(domNode, newIndex, flat, segmentBaseIndex, rowHeight, totalRows, false);
                }
            }
        }

        this.#startIndex = startIndex;
        this.#segmentBaseIndex = segmentBaseIndex;
        this.#lastRowHeight = rowHeight;
        this.#pendingDataRefresh = false;
        this.#scrollDirty = false;
    }

    /**
     * Ensure the pool of DOM nodes is the correct size for the current viewport.
     * @param {*} targetSize - The desired number of DOM nodes in the pool based on the current viewport size and overscan.
     * @returns {boolean} - Returns true if the pool size was changed
     */
    #ensurePoolSize(targetSize) {
        const currentSize = this.domNodes.length;
        if(targetSize === currentSize) return false;

        if(targetSize > currentSize) {
            const fragment = document.createDocumentFragment();

            for(let i = currentSize; i < targetSize; i++) {
                const domNode = this.options.createNode ? this.options.createNode() : this.createElement();

                domNode.classList.add("ls-tree-node");
                domNode.setAttribute("role", "treeitem");

                domNode.onclick = (event) => {
                    this.#nodeClicked?.(event, domNode);
                };

                domNode.__lsTreeIndex = -1;
                domNode.__lsTreeY = null;
                domNode.__lsTreeHidden = true;
                fragment.appendChild(domNode);
                this.domNodes.push(domNode);
            }

            // Append new nodes to the content
            this.content.appendChild(fragment);
        } else {
            for(let i = currentSize - 1; i >= targetSize; i--) {
                const domNode = this.domNodes.pop();
                if(!domNode) continue;
                domNode.remove();
            }
        }

        return true;
    }

    #nodeClicked(event, domNode) {
        const nodeData = this.nodeFromDom(domNode);
        if(!nodeData) return;

        this.quickEmit("click", nodeData, domNode, event);

        if(nodeData.children) {
            event.stopPropagation();
            this.toggle(nodeData);
        }
    }

    nodeFromDom(domNode) {
        const index = domNode.__lsTreeIndex;
        if(index === undefined || index === -1) return null;
        
        const nodeData = this.toFlat()[index];
        return nodeData || null;
    }

    /**
     * Apply data to a DOM node.
     */
    #applyNode(domNode, dataIndex, flat, segmentBaseIndex, rowHeight, totalRows, forceContentUpdate) {
        if(dataIndex < 0 || dataIndex >= totalRows) {
            if(!domNode.__lsTreeHidden) {
                domNode.style.display = "none";
                domNode.__lsTreeHidden = true;
            }
            domNode.__lsTreeIndex = -1;
            return;
        }

        const nodeData = flat[dataIndex];
        if(!nodeData) {
            if(!domNode.__lsTreeHidden) {
                domNode.style.display = "none";
                domNode.__lsTreeHidden = true;
            }
            domNode.__lsTreeIndex = -1;
            return;
        }

        if(domNode.__lsTreeHidden) {
            domNode.style.display = "";
            domNode.__lsTreeHidden = false;
        }

        const y = (dataIndex - segmentBaseIndex) * rowHeight;
        if(domNode.__lsTreeY !== y) {
            domNode.style.transform = `translateY(${y}px)`;
            domNode.__lsTreeY = y;
        }

        if(forceContentUpdate || domNode.__lsTreeIndex !== dataIndex) {
            if(this.options.updateNode) {
                this.options.updateNode(nodeData, domNode);
            } else {
                domNode.textContent = nodeData.label || nodeData.id || "";
            }
        }

        domNode.__lsTreeIndex = dataIndex;
    }

    toFlat() {
        const flat = [];

        const traverse = (nodes, parent = null) => {
            for(const node of nodes) {
                if(node.state !== true && parent !== null) continue; // Skip collapsed nodes

                flat.push({ ...node, parentId: parent });

                if(node.children) {
                    traverse(node.children, node.id);
                }
            }
        };

        traverse(this.nodes);
        return flat;
    }

    /**
     * Collapse a node.
     */
    collapse(node) {}

    /**
     * Expand a node.
     */
    expand(node) {}

    /**
     * Toggle a node's expanded/collapsed state.
     */
    toggle(node) {}

    /**
     * Remove a node by its ID or node object.
     * @param {string|object} id - The ID of the node to remove or the node object itself.
     */
    removeNode(id) {
        const node = (typeof id === "string") ? this.nodeMap.get(id) : id;
        if(!node) return;

        this.#pendingDataRefresh = true;

        // Remove from node map
        this.nodeMap.delete(node.id);

        const parent = node.parentId? this.nodeMap.get(node.parentId)?.children: this.nodes;

        // Remove from array
        const index = parent.indexOf(node);
        if(index !== -1) {
            parent.splice(index, 1);
        }
    }

    /**
     * Get a node by its ID.
     * @param {string} id - The ID of the node to retrieve.
     * @returns {object|null} The node with the specified ID, or null if not found.
     */
    getNodeById(id) {
        return this.nodeMap.get(id) || null;
    }

    /**
     * Add a new node to the tree.
     * @param {object} nodeData - The data for the new node, following the same structure as described in loadData.
     * @param {string|null} parentId - The ID of the parent node to which this new node should be added. If null, the node will be added as a root node (or just taken from the node object).
     */
    addNode(nodeData, parentId = null) {
        this.#pendingDataRefresh = true;
        this.nodes.push(nodeData);
        this.nodeMap.set(nodeData.id, nodeData);

        if(parentId) {
            nodeData.parentId = parentId;
        }

        if(nodeData.parentId !== null) {
            const parentNode = this.nodeMap.get(nodeData.parentId);
            if(parentNode) {
                parentNode.children ??= [];
                parentNode.children.push(nodeData);
            }
        }
    }

    /**
     * Expand all nodes.
     */
    expandAll() {}

    /**
     * Collapse all nodes.
     */
    collapseAll() {}

    /**
     * Destroy the component and clean up any resources.
     */
    destroy() {
        if (this.destroyed) return;

        if (this.#resizeObserver) {
            this.#resizeObserver.disconnect();
            this.#resizeObserver = null;
        }

        this.container = null;
        this.nodes = null;
        this.nodeMap.clear();
        this.nodeMap = null;
        this.domNodes = null;
 
        super.destroy(); // Does the rest
    }
}, { name: "Tree", global: true });