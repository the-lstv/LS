LS.LoadComponent(class Tree extends LS.Component {
    static ROOT = Symbol('root');
    static CARET_ICON = N("svg", {
        class: "ls-tree-caret-icon",
        inner: N("path", { ns: 'http://www.w3.org/2000/svg', attr: { d: "M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6-1.41-1.41z", fill: "currentColor" }}),
        attr: { viewBox: "0 0 24 24" }
    });

    constructor(element, options = {}) {
        super();

        this.element = element;
        this.nodes = new Map();
        this.childs = new Map();
        this.options = options || {};

        // default indent size if not provided
        if (typeof this.options.indent !== 'number') this.options.indent = 16;
    }

    randomId() {
        return Math.random().toString(36).slice(2);
    }

    upsert(nodes) {
        for(let node of nodes) {
            if(!node.id) {
                node.id = this.randomId();
            }
            if(typeof node.parent === "object" && node.parent.id) {
                node.parent = node.parent.id;
            }
            const parent = node.parent || this.constructor.ROOT;
            const existing = this.nodes.get(node.id);
            if(existing) {
                const parentNodes = this.childs.get(existing.parent);
                if (parentNodes) parentNodes.delete(existing);
                node = Object.assign(existing, node);
            } else {
                this.nodes.set(node.id, node);
            }
            if (!this.childs.has(parent)) {
                this.childs.set(parent, new Set());
            }
            this.childs.get(parent).add(node);
        }
    }

    // Added depth param to apply indentation
    render(parent = null, recursive = true, depth = 0) {
        if(!parent) parent = this.constructor.ROOT;

        const children = this.childs.get(parent) || [];
        const target = parent === this.constructor.ROOT ? this.element : (this.nodes.get(parent)?.element || null);
        const indentSize = this.options.indent;

        for (const node of children) {
            const element = node.element || (typeof this.options.createElement === "function"? this.options.createElement(node): N({
                class: 'ls-tree-node' + (this.options.styled !== false ? ' ls-tree-node-styled' : '') + (this.options.itemClass ? ' ' + this.options.itemClass : ''),
                inner: [ N({
                    class: "ls-tree-iconSlot",
                    inner: node.extensible? this.constructor.CARET_ICON.cloneNode(true) : node.icon
                }), N("span", { textContent: node.label || node.name }) ],
                attr: { "role": "treeitem" },
                tabIndex: "0"
            }));

            if(node.extensible) {
                element.classList.add('ls-tree-node-' + (node.open ? 'expanded' : 'collapsed'));
                element.classList.remove('ls-tree-node-' + (node.open ? 'collapsed' : 'expanded'));
                element.setAttribute('aria-expanded', String(!!node.open));
            } else {
                element.classList.remove('ls-tree-node-collapsed');
                element.classList.remove('ls-tree-node-expanded');
                element.removeAttribute('aria-expanded');
            }

            element.addEventListener('click', (e) => {
                e.stopPropagation();
                if(node.extensible) {
                    node.open = !node.open;
                    this.render(node.id, true, depth);
                }
            });

            const property = this.options.offsetProperty || 'marginLeft';

            node.element = element;
            // apply indentation for nested levels (skip root level 0)
            if (depth > 0) {
                // only set margin-left if not already explicitly set
                if (!element.style[property]) element.style[property] = (depth * indentSize) + 'px';
                element.setAttribute('data-level', depth);
            } else {
                element.removeAttribute('data-level');
                if (element.style[property]) element.style[property] = '';
            }

            if(parent === this.constructor.ROOT) {
                target.appendChild(element);
            } else if(target) {
                target.after(element);
            }

            if(node.id && recursive && node.open) this.render(node.id, true, depth + 1);
        }
    }
}, { name: 'Tree', global: true });