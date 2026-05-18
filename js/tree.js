/**
 * Tree/ListView Component for LS with optimized virtualized rendering.
 * Can also be used as a general-purpose virtualized list.
 * Handles automatic resizing, dynamic updates, etc.
 * 
 * ! Early stages component. The flat structure is very hacky as of now & testing is needed.
 * 
 * Future improvements:
 * * Drag and drop support
 * * Overlays, maybe
 * * More customization
 * 
 * @version 0.2.0
 */

LS.LoadComponent(class Tree extends LS.Component {
    // See constructor for documentation on options
    static defaults = LS.Util.staticDefaults({
        rowHeight: 24,
        updateNode: null,
        createNode: null,
        loadData: null,
        overscan: 2,
        styled: true,
        lazy: false,
        guides: true,
        icons: true,
        iconClass: "li-icons",
        caretIconClass: null,
        space: 16
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
    #flatNodes = [];
    #flatDirty = true;
    #focusedNode = null;

    /**
     * Create a new Tree component.
     * @param {*} options - Configuration options for the tree.
     * @param {function} options.updateNode - A function that will be called when it is time to update a node's content. It will receive the node data and the corresponding DOM element as arguments.
     * @param {function} options.createNode - A function that will be called when it is time to create a new node. It should return a DOM element.
     * @param {function} options.loadData - A function that will be called when a lazy node is expanded and needs to load its children. It will receive the node data as an argument, and should populate the node's `children` property with the loaded data.
     * @param {number} options.overscan - The number of rows to render outside the visible area.
     * @param {number} options.rowHeight - The height of each row in pixels.
     * @param {Array} options.data - The initial tree data to load.
     * @param {Element} options.target - The DOM element to which the tree should be appended. If not provided, the tree will simply not be appended automatically, and you can do it manually (tree.container).
     * @param {boolean} options.lazy - Whether to always enable lazy loading behavior (load-on-demand), even for nodes without the `lazy` property.
     * @param {boolean} options.styled - Whether to apply default styles to the tree. You can set this to false if you want to provide your own styles.
     * @param {boolean} options.guides - Whether to display indent guides (lines). Setting to false will only set padding.
     * @param {boolean} options.icons - Whether to display icons.
     * @param {string} options.iconClass - The base CSS classname to use for node icons.
     * @param {string} options.caretIconClass - The CSS class to use for the caret icon. If null, the default caret will be used.
     * @param {number} options.space - The amount of space to use for each level of indentation.
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

        // Tree structure
        this.nodes = [];

        // Lookup map
        this.nodeMap = new Map();

        // Data is currently held in three places (nodes - recursive, nodeMap - lookup, flatNodes - for rendering)

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

    /**
     * Replaces data in the tree. The data should be an array of objects with the following structure:
     * {
     *   id: string,        // Unique identifier for the node
     *   parentId: string,  // Identifier of the parent node (null for root nodes)
     *   label: string,     // Text to display for the node
     *   children: array,   // Optional array of child nodes
     *   state: object,     // { expanded: boolean }
     *   lazy: boolean,     // Whether the node should be loaded lazily (load-on-demand)
     *   ...any other user data, the component only uses the ones mentioned above.
     * }
     * @param {Array} data - The tree data to load.
     * @param {Object} parent - The parent node to which the data should replaced, otherwise the whole tree will be replaced.
     */
    loadData(data, parent = null) {
        if(parent) {
            return this.replaceChildren(parent, data);
        } else {
            // Reset everything
            this.reset();
        }

        this.#pendingDataRefresh = true;
        for(let item of data) {
            this.addNode(item, parent);
        }
    }

    reset() {
        this.nodes.length = 0;
        this.nodeMap.clear();
        this.#flatNodes.length = 0;
        this.#flatDirty = true;
        this.#focusedNode = null;

        for (let domNode of this.domNodes) {
            domNode.onclick = null;
            domNode.onkeydown = null;
            domNode.remove();
        }
        this.domNodes.length = 0;
    }

    /**
     * Render the tree (frame-scheduled).
     */
    render() { this.frameScheduler.schedule(); }

    getNodeDataByElement(domNode) {
        const index = domNode.__lsTreeIndex;
        if(index === undefined || index === -1) return null;
        return this.flatNodes[index] || null;
    }

    collapse(node) {
        if (!node.state?.expanded) return;
        node.state.expanded = false;
        this.#flatDirty = true;
        this.render();
    }

    async expand(node) {
        if (node.state?.expanded) return;
        node.state ??= {};
        node.state.expanded = true;

        // Simple built-in lazy loading
        if ((node.lazy || this.options.lazy) && !node.children) {
            node.children = []; // Set empty initially to prevent multiple load event fires
            if (typeof this.options.loadData === "function") {
                node.__promise = this.options.loadData(node);
                this.#flatDirty = true;
                this.render();
                try {
                    const children = await node.__promise;
                    if(children) node.children = children;
                } catch (error) {
                    console.error("Error loading node data:", error);
                    node.children = null; // Reset to null on error to allow retrying
                } finally {
                    delete node.__promise;
                    this.#flatDirty = true;
                    this.render();
                }
            }
        }

        this.#flatDirty = true;
        this.render();
    }

    toggle(node) {
        if (node.state?.expanded) this.collapse(node); else this.expand(node);
    }

    removeNode(id) {
        const node = (typeof id === "string") ? this.nodeMap.get(id) : id;
        if(!node) return;

        this.#pendingDataRefresh = true;

        // Recursively clean Map registry
        const removeRecursive = (n) => {
            this.nodeMap.delete(n.id);
            if (n.children) {
                for (let i = 0; i < n.children.length; i++) removeRecursive(n.children[i]);
            }
        };
        removeRecursive(node);

        // Disconnect from parent / base array
        const parentNode = node.parentId != null ? this.nodeMap.get(node.parentId) : null;
        const siblings = parentNode ? parentNode.children : this.nodes;
        
        if (siblings) {
            const index = siblings.indexOf(node);
            if(index !== -1) siblings.splice(index, 1);
        }

        this.#flatDirty = true;
        this.render();
    }

    /**
     * Replace or remove the children of a node with new data.
     * @param {*} id - The node or ID of the node whose children should be replaced.
     * @param {*} newData - An array of new child nodes, or null to remove existing children.
     */
    replaceChildren(id, newData) {
        const node = (typeof id === "string") ? this.nodeMap.get(id) : id;
        if(!node) return;

        this.#pendingDataRefresh = true;

        // Clear existing children and recursively remove them from map
        if (node.children) {
            const removeRecursive = (n) => {
                this.nodeMap.delete(n.id);
                if (n.children) {
                    for (let i = 0; i < n.children.length; i++) removeRecursive(n.children[i]);
                }
            };
            for (let i = 0; i < node.children.length; i++) {
                removeRecursive(node.children[i]);
            }
            node.children.length = 0;
        }

        // Add new children
        if (newData) for(let item of newData) {
            this.addNode(item, node);
        }
    }

    getNodeById(id) {
        return this.nodeMap.get(id) || null;
    }

    /**
     * Add a new node to the tree.
     * @param {*} nodeData - The data for the new node.
     * @param {*} parentId - The ID of the parent node to attach to, or null to add to the root.
     */
    addNode(nodeData, parentId = null) {
        if (parentId !== null) nodeData.parentId = typeof parentId === "string" ? parentId : parentId.id;

        this.#pendingDataRefresh = true;

        // Prevent duplication in root `nodes` list
        if (nodeData.parentId != null) {
            const parentNode = this.nodeMap.get(nodeData.parentId);
            if (parentNode) {
                parentNode.children ??= [];
                if (!parentNode.children.includes(nodeData)) {
                    parentNode.children.push(nodeData);
                }
            }
        } else if (!this.nodes.includes(nodeData)) {
            this.nodes.push(nodeData);
        }

        // Recursively register nodes deeply to nodeMap (helps bulk adding data safely)
        const indexRecursive = (node) => {
            this.nodeMap.set(node.id, node);
            if (node.children) {
                for (let i = 0; i < node.children.length; i++) {
                    node.children[i].parentId = node.id;
                    indexRecursive(node.children[i]);
                }
            }
        };
        indexRecursive(nodeData);

        this.#flatDirty = true;
        this.render();
    }

    /**
     * Expand all nodes in the tree.
     */
    expandAll() {
        this.traverse(node => {
            node.state ??= {};
            node.state.expanded = true;
        });

        this.#flatDirty = true;
        this.render();
    }

    /**
     * Collapse all nodes in the tree.
     */
    collapseAll() {
        this.traverse(node => {
            node.state ??= {};
            node.state.expanded = false;
        });

        this.#flatDirty = true;
        this.render();
    }

    /**
     * Traverse all nodes in the tree and execute a callback on each node.
     * @param {function} callback - The function to execute on each node. It receives the node data as an argument.
     * @param {Array} nodes - List of nodes to traverse
     */
    traverse(callback, nodes = this.nodes) {
        for (let i = 0; i < nodes.length; i++) {
            callback(nodes[i]);
            if (nodes[i].children) this.traverse(callback, nodes[i].children);
        }
    }

    /**
     * Actually render the tree
     */
    #render() {
        const flat = this.flatNodes;
        const totalRows = flat.length;
        const rowHeight = this.options.rowHeight;

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
                this.#updateDOMNode(this.domNodes[i], startIndex + i, flat, segmentBaseIndex, rowHeight, totalRows, forceContentUpdate);
            }
        } else if(delta !== 0) {
            const baseIndex = this.#startIndex;
            const poolSize = this.domNodes.length;

            if(delta > 0) {
                for(let i = 0; i < delta; i++) {
                    const domNode = this.domNodes.shift();
                    this.domNodes.push(domNode);
                    const newIndex = baseIndex + poolSize + i;
                    this.#updateDOMNode(domNode, newIndex, flat, segmentBaseIndex, rowHeight, totalRows, false);
                }
            } else {
                for(let i = 0; i < Math.abs(delta); i++) {
                    const domNode = this.domNodes.pop();
                    this.domNodes.unshift(domNode);
                    const newIndex = baseIndex - 1 - i;
                    this.#updateDOMNode(domNode, newIndex, flat, segmentBaseIndex, rowHeight, totalRows, false);
                }
            }
        }

        this.#startIndex = startIndex;
        this.#segmentBaseIndex = segmentBaseIndex;
        this.#lastRowHeight = rowHeight;
        this.#pendingDataRefresh = false;
        this.#scrollDirty = false;
    }

    // ! Temporary
    #updateFlatNodes() {
        if (!this.#flatDirty) return;
        
        // Zero-out array dynamically to reuse the reference and preserve memory
        this.#flatNodes.length = 0;
        this.#flattenInto(this.nodes, 0);
        this.#flatDirty = false;
    }

    // ! Temporary
    #flattenInto(nodes, depth) {
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            node.state ??= {};
            node.state.depth = depth;
            node.state.posinset = i + 1;
            node.state.setsize = nodes.length;
            node.state.isLastChild = (i === nodes.length - 1);
            node.state.selected = (this.#focusedNode === node);
            this.#flatNodes.push(node);

            if (node.state.expanded && node.children && node.children.length > 0) {
                this.#flattenInto(node.children, depth + 1);
            }
        }
    }

    // ! Temporary
    get flatNodes() {
        this.#updateFlatNodes();
        return this.#flatNodes;
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
                const domNode = this.options.createNode ? this.options.createNode() : LS.Create({
                    inner: [
                        { tag: "span", class: "ls-tree-node-indent"  },
                        { tag: "span", class: "ls-tree-node-icon" + (this.options.icons ? ` ${this.options.iconClass}` : "") },
                        { tag: "span", class: "ls-tree-node-label"   },
                        { tag: "span", class: "ls-tree-node-badge"   },
                    ],
                });

                domNode.classList.add("ls-tree-node");
                domNode.setAttribute("role", "treeitem");
                domNode.tabIndex = 0;

                domNode.onclick = (event) => this.#nodeClicked(event, domNode);
                domNode.onkeydown = (event) => this.#nodeKeyDown(event, domNode);
                domNode.onfocus = () => {
                    const node = this.getNodeDataByElement(domNode);
                    if (node) {
                        if (this.#focusedNode && this.#focusedNode !== node) {
                            this.#focusedNode.state.selected = false;
                            const prevDom = this.domNodes.find(n => n.__lsTreeIndex === this.flatNodes.indexOf(this.#focusedNode));
                            if (prevDom) prevDom.setAttribute("aria-selected", "false");
                        }
                        node.state.selected = true;
                        this.#focusedNode = node;
                        domNode.setAttribute("aria-selected", "true");
                    }
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
                if(domNode) domNode.remove();
            }
        }

        return true;
    }

    #nodeClicked(event, domNode) {
        const nodeData = this.getNodeDataByElement(domNode);
        if(!nodeData) return;

        this.quickEmit("click", nodeData, domNode, event);

        // Allows nodes that are lazy-loaded (load-on-demand) to register clicks even without native children
        if(nodeData.children || nodeData.lazy) {
            event.stopPropagation();
            this.toggle(nodeData);
        }
    }

    #nodeKeyDown(event, domNode) {
        const nodeData = this.getNodeDataByElement(domNode);
        if(!nodeData) return;

        const dataIndex = domNode.__lsTreeIndex;
        let prevent = true;

        switch(event.key) {
            case "ArrowDown":
                if (dataIndex < this.flatNodes.length - 1) {
                    this.#focusNode(dataIndex + 1);
                }
                break;
            case "ArrowUp":
                if (dataIndex > 0) {
                    this.#focusNode(dataIndex - 1);
                }
                break;
            case "ArrowRight":
                if (nodeData.children || nodeData.lazy) {
                    if (!nodeData.state?.expanded) this.expand(nodeData);
                    else if (dataIndex < this.flatNodes.length - 1) this.#focusNode(dataIndex + 1);
                }
                break;
            case "ArrowLeft":
                if (nodeData.children && nodeData.state?.expanded) {
                    this.collapse(nodeData);
                } else if (nodeData.parentId) {
                    const parentNode = this.getNodeById(nodeData.parentId);
                    const index = this.flatNodes.indexOf(parentNode);
                    if (index !== -1) this.#focusNode(index);
                }
                break;
            case "Enter":
            case " ":
                this.quickEmit("click", nodeData, domNode, event);
                if (nodeData.children || nodeData.lazy) this.toggle(nodeData);
                break;
            default:
                prevent = false;
        }

        if (prevent) {
            event.preventDefault();
            event.stopPropagation();
        }
    }

    #focusNode(index) {
        const rowHeight = this.options.rowHeight;
        const top = index * rowHeight;
        const bottom = top + rowHeight;

        if (top < this.#scroll) {
            this.scroll = top;
        } else if (bottom > this.#scroll + this.#containerHeight) {
            this.scroll = bottom - this.#containerHeight;
        }

        this.requestAnimationFrame(() => {
            const domNode = this.domNodes.find(n => n.__lsTreeIndex === index);
            if (domNode && !domNode.__lsTreeHidden) domNode.focus();
        });
    }

    #updateDOMNode(domNode, dataIndex, flat, segmentBaseIndex, rowHeight, totalRows, forceContentUpdate) {
        if(dataIndex < 0 || dataIndex >= totalRows) {
            if(!domNode.__lsTreeHidden) {
                domNode.style.display = "none";
                domNode.__lsTreeHidden = true;
            }
            domNode.__lsTreeIndex = -1;
            return;
        }

        const nodeData = flat[dataIndex];
        if(!nodeData) return;

        if(domNode.__lsTreeHidden) {
            domNode.style.display = "";
            domNode.__lsTreeHidden = false;
        }

        const y = (dataIndex - segmentBaseIndex) * rowHeight;
        if(domNode.__lsTreeY !== y) {
            domNode.style.transform = `translateY(${y}px)`;
            domNode.__lsTreeY = y;
        }

        nodeData.state ??= {};
        domNode.setAttribute("aria-selected", nodeData.state.selected ? "true" : "false");

        if(forceContentUpdate || domNode.__lsTreeIndex !== dataIndex) {
            domNode.setAttribute("aria-level", (nodeData.state.depth || 0) + 1);
            domNode.setAttribute("aria-setsize", nodeData.state.setsize || 1);
            domNode.setAttribute("aria-posinset", nodeData.state.posinset || 1);
            if (nodeData.label) domNode.setAttribute("aria-label", nodeData.label);
            domNode.setAttribute("data-index", dataIndex);
            
            if (nodeData.isLastChild) domNode.setAttribute("data-last-element", "true");
            else domNode.removeAttribute("data-last-element");

            // domNode.setAttribute("data-parity", dataIndex % 2 === 0 ? "even" : "odd");
            
            if (nodeData.children || nodeData.lazy) {
                domNode.classList.add("ls-tree-node-expandable");
                if (nodeData.state.expanded) {
                    domNode.classList.add("ls-tree-expanded");
                } else {
                    domNode.classList.remove("ls-tree-expanded");
                }
            } else {
                domNode.classList.remove("ls-tree-node-expandable");
                domNode.classList.remove("ls-tree-expanded");
            }

            if (nodeData.__promise) {
                domNode.setAttribute("data-ls-state", "loading");
                domNode.setAttribute("aria-busy", "true");
            } else {
                domNode.removeAttribute("data-ls-state");
                domNode.removeAttribute("aria-busy");
            }

            // Indent guides, they also get recycled when possible.
            if(this.options.guides) {
                const indentContainer = domNode.querySelector(".ls-tree-node-indent");
                if(indentContainer) {
                    const existingIndents = Array.from(indentContainer.children);

                    if (existingIndents.length > nodeData.state.depth) {
                        for (let i = nodeData.state.depth; i < existingIndents.length; i++) {
                            indentContainer.removeChild(existingIndents[i]);
                        }
                    }

                    // Update or create indent guides
                    for (let i = 0; i < nodeData.state.depth; i++) {
                        const line = existingIndents[i] || LS.Create({ class: "ls-tree-indent-guide" }).addTo(indentContainer);
                        line.classList.toggle("ls-tree-indent-guide-empty", nodeData.state.isLastChild && i === nodeData.state.depth - 1);
                    }
                }
            }

            // Icons & Caret
            if(this.options.icons) {
                const iconEl = domNode.querySelector(".ls-tree-node-icon");
                if(iconEl) {
                    let iconClassName = "ls-tree-node-icon " + (this.options.iconClass || "");

                    if (nodeData.children || nodeData.lazy) {
                        iconClassName += " " + (this.options.caretIconClass || "ls-tree-caret");
                    } else if (nodeData.icon) {
                        iconClassName += " " + nodeData.icon;
                    }
                    
                    iconEl.className = iconClassName.trim();
                }
            }

            // Provide default indent
            domNode.style.setProperty("--ls-tree-indent", `${(nodeData.state.depth || 0) * this.options.space}px`);

            // Label
            const label = domNode.querySelector(".ls-tree-node-label");
            if(label) {
                if(nodeData.i18n && LS.i18n) {
                    if(!this.__localeListener) {
                        this.__localeListener = () => {
                            for(let domNode of this.domNodes) {
                                const nodeData = this.getNodeDataByElement(domNode);
                                if(nodeData && nodeData.i18n) {
                                    const label = domNode.querySelector(".ls-tree-node-label");
                                    if(label) {
                                        label.textContent = LS.i18n.translate(nodeData.i18n?.key || nodeData.i18n, nodeData.i18n?.vars, null, nodeData.label || nodeData.id || "");
                                    }
                                }
                            }
                        };
                        LS.on("localeChanged", this.__localeListener);
                    }

                    label.textContent = LS.i18n.translate(nodeData.i18n?.key || nodeData.i18n, nodeData.i18n?.vars, null, nodeData.label || nodeData.id || "");
                } else {
                    label.textContent = nodeData.label || nodeData.id || "";
                }
            }

            if(this.options.updateNode) {
                this.options.updateNode(nodeData, domNode);
            }
        }

        domNode.__lsTreeIndex = dataIndex;
    }

    destroy() {
        if (this.destroyed) return;

        if (this.#resizeObserver) {
            this.#resizeObserver.disconnect();
            this.#resizeObserver = null;
        }

        this.#flatNodes.length = 0;
        this.#flatNodes = null;
        this.container = null;
        this.nodes = null;
        this.nodeMap.clear();
        this.nodeMap = null;

        for (let domNode of this.domNodes) {
            domNode.onclick = null;
            domNode.onkeydown = null;
            domNode.remove();
        }
        this.domNodes.length = 0;
        this.domNodes = null;

        if(this.__localeListener) {
            LS.off("localeChanged", this.__localeListener);
            this.__localeListener = null;
        }
 
        super.destroy();
    }
}, { name: "Tree", global: true });