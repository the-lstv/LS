LS.LoadComponent(class Tabs extends LS.Component {
    constructor(element, options = {}) {
        super();

        this.order = [];
        this.tabs = new Map;
        this.activeTab = null;
        this.element = O(element);
        this.container = O(element);

        options = LS.Util.defaults({
            unstyled: false,
            list: true,
            selector: "ls-tab, .ls-tab",
        }, options);
        
        if(!options.unstyled) {
            this.container.class("ls-tabs-styled");
        }

        if(options.selector) {
            this.container.getAll(options.selector).forEach((tab, i) => {
                this.add(tab.getAttribute("id") || "tab-" + i, tab);
            });
        }

        this.options = options;

        if(options.list) {
            this.element.class("ls-tabs-has-list");

            this.list = N({
                class: "ls-tabs-list",
            });

            this.container = N({
                class: "ls-tabs-content",
                inner: [...this.element.children]
            });

            this.element.add(this.list, this.container);

            this.renderList();
        } else {
            this.element.class("ls-tabs-content")
        }
    }

    get index() {
        return this.order.indexOf(this.activeTab);
    }

    add(id, content, options = {}) {
        if(this.tabs.has(id)) {
            return this;
        }

        const tab = { id, element: content, title: options.title || content.getAttribute("tab-title") || content.getAttribute("title") };

        this.tabs.set(id, tab);
        this.order.push(id);
        this.container.add(content);
        return this;
    }

    remove(id) {
        const tab = this.tabs.get(id);

        if(!tab) {
            return false;
        }

        const index = this.order.indexOf(id);

        tab.element.remove();
        if(tab.handle) tab.handle.remove();

        this.tabs.delete(id);
        this.order.splice(index, 1);

        this.emit("removed", [id]);
        return true;
    }

    setClosestNextTo(id) {
        const index = this.order.indexOf(id);
        if(index === -1) {
            return false;
        }

        if (index === this.order.length - 1) {
            this.set(this.order[index - 1]);
        } else {
            this.set(this.order[index + 1]);
        }
    }

    set(id) {
        if(typeof id === "number") {
            id = this.order[id];
        }

        const tab = this.tabs.get(id);
        const currentTab = this.tabs.get(this.activeTab)

        if(!tab) {
            return false;
        }

        const index = this.order.indexOf(id);

        if(this.activeTab === id) {
            return true;
        }

        if(currentTab) {
            currentTab.element.class("tab-active", false);

            if(currentTab.handle) {
                currentTab.handle.class("active", false);
            }
        }
        
        tab.element.class("tab-active");
        this.emit("changed", [id]);

        if(tab.handle) {
            tab.handle.class("active");
        }

        this.activeTab = id;

        // if(this.options.list) {
        //     for(const tab in this.tabs) {
        //         const _element = O(this.tabs[tab].element);
        //         if(!_element || tab === id) {
        //             continue;
        //         }

        //         _element.class("tab-active", 0);
        //         if(this.options.hide && this.options.mode !== "presentation") {
        //             _element.hide();
        //         }
        //     }
        // }
    }

    first() {
        this.set(this.order[0]);
    }

    last() {
        this.set(this.order[this.order.length - 1]);
    }

    next(loop = false) {
        const index = this.index;

        if(index === -1) {
            return false;
        }

        if(index !== this.order.length - 1) {
            return this.set(this.order[index + 1]);
        }
        
        if(loop) {
            return this.set(this.order[0]);
        }

        return false;
    }

    previous(loop = false) {
        const index = this.index;

        if(index === -1) {
            return false;
        }

        if(index !== 0) {
            return this.set(this.order[index - 1]);
        }

        if(loop) {
            return this.set(this.order[this.order.length - 1]);
        }

        return false;
    }

    renderList(){
        for(this.list.children.length; this.list.children.length > 0; this.list.children[0].remove());

        this.order.forEach((id) => {
            const tab = this.tabs.get(id);
            if(!tab) return;

            if(!tab.handle) {
                tab.handle = N({
                    class: "ls-tab-handle",
                    inner: tab.title || id,

                    onclick: () => {
                        this.set(id);
                    }
                })

                if(this.options.closeable){
                    tab.handle.add(N("button", {
                        class: "clear circle ls-tab-close",
                        inner: "&times;",

                        onclick: () => {
                            const canceled = this.emit("close", [id], { results: true })[0] === false;

                            if(canceled) return;

                            if(this.activeTab === id) {
                                this.setClosestNextTo(id);
                            }

                            this.remove(id);
                            this.renderList();
                        }
                    }))
                }
            }

            this.list.add(tab.handle);
        });
    }
}, { name: 'Tabs', global: true });