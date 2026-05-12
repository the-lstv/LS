/**
 * Tree Component for LS with virtualized rendering.
 * 
 * Very early stages component.
 * I am aware of the mid performance but it is at relatively constant and has faster rendering & less memory usage than some other libraries (ahem infinitytree).
 * Though a LOT of work is needed to improve this so yeah.
 * Tbh I am just tired and have no clue if all this is even worth it.
 * I mean nobody is ever going to use this anyway, so why do I care how good it is
 * @version 0.1.0
 */

LS.LoadComponent(class Tree extends LS.Component {
    static defaults = LS.Util.staticDefaults({
        rowHeight: 24, // Height of each row in pixels
        updateNode: null,
        createNode: null
    });

    #scroll = 0;

    /**
     * Create a new Tree component.
     * @param {*} options - Configuration options for the tree.
     * @param {function} options.updateNode - A function that will be called when it is time to update a node's content. It will receive the node data and the corresponding DOM element as arguments.
     * @param {function} options.createNode - A function that will be called when it is time to create a new node. It should return a DOM element.
     */
    constructor(options) {
        super();

        this.container = this.createElement({ class: "ls-tree", role: "tree", inner: [
            (this.fakeScroll = this.createElement({ class: "ls-tree-fake-scroll", inner: [] })),
            (this.content = this.createElement({ class: "ls-tree-content", inner: [] }))
        ] });

        this.options = this.constructor.defaults(options);

        if(options.target) {
            // We don't really care where the user appends the component
            options.target.append(this.container);
            delete options.target;
        }

        this.frameScheduler = this.addDestroyable(new LS.Util.FrameScheduler(() => this.#render()));

        // Tree structure, as an actual tree structure
        this.nodes = [];

        // Lookup map
        this.nodeMap = new Map();

        // A fixed list of DOM nodes that we will recycle for rendering.
        // The length of this list will depend on the height of the container and the row height.
        this.domNodes = [];

        if(options.data) {
            this.loadData(options.data);
            delete options.data;
        }

        this.updateOptions(this.options);
    }

    get scroll() {
        return this.#scroll;
    }

    set scroll(value) {
        if(this.#scroll === value) return;
        this.#scroll = value;
        this.render();
    }

    updateOptions(options) {
        if(options.rowHeight !== undefined) {
            this.container.style.setProperty("--ls-tree-row-height", `${options.rowHeight}px`);
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
        const flat = this.toFlat();

        this.fakeScroll.style.height = `${flat.length * this.options.rowHeight}px`;

        const containerHeight = this.content.clientHeight;
        const startIndex = Math.floor(this.scroll / this.options.rowHeight);
        const endIndex = Math.min(flat.length, Math.ceil((this.scroll + containerHeight) / this.options.rowHeight)) + 1;

        console.log(`Rendering nodes ${startIndex} to ${endIndex} (total: ${flat.length})`);
        
        this.content.style.transform = `transform3d(0, ${this.scroll}px, 0)`;

        // Recycle DOM nodes
        while(this.domNodes.length < (endIndex - startIndex)) {
            const node = this.options.createNode ? this.options.createNode() : this.createElement({ class: "ls-tree-node" });
            this.content.append(node);
            this.domNodes.push(node);
        }

        for(let i = 0; i < this.domNodes.length; i++) {
            const nodeIndex = startIndex + i;
            const domNode = this.domNodes[i];

            if(nodeIndex < endIndex) {
                const nodeData = flat[nodeIndex];
                domNode.style.display = "";

                if(this.options.updateNode) {
                    this.options.updateNode(nodeData, domNode);
                } else {
                    domNode.textContent = nodeData.label || `Node ${nodeData.id}`;
                }
            } else {
                domNode.style.display = "none";
            }
        }
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
        this.container.remove();
        this.nodes = null;
        super.destroy();
    }
}, { name: "Tree", global: true });