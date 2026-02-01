LS.LoadComponent(class Tabs extends LS.Component {
    constructor(element, options = {}) {
        super();

        this.order = [];
        this.tabs = new Map;
        this.activeTab = null;
        this.element = element? LS.Select(element) : LS.Create("div");
        this.container = element? LS.Select(element) : LS.Create("div");

        this.firstRender = true;

        options = LS.Util.defaults({
            styled: options.unstyled? false: true,
            list: true,
            closeable: false,
            selector: "ls-tab, .ls-tab",
            mode: "default",
            slideAnimation: false
        }, options);
        
        if(options.styled) {
            this.container.classList.add("ls-tabs-styled");
        }

        if(options.mode) {
            this.container.classList.add("ls-tabs-mode-" + options.mode);
        }

        if(options.selector) {
            this.container.querySelectorAll(options.selector).forEach((tab, i) => {
                tab.classList.add("ls-tab-content");
                this.add(tab.getAttribute("tab-id") || tab.getAttribute("id") || tab.getAttribute("tab-title") || "tab-" + i, tab);
            });
        }

        this.options = options;

        if(this.options.list) {
            this.frameScheduler = new LS.Util.FrameScheduler(() => this.#renderList());

            this.element.classList.add("ls-tabs-has-list");

            this.list = N({
                class: "ls-tabs-list",
            });

            this.container = N({
                class: "ls-tabs-content",
                inner: [...this.element.children]
            });

            this.element.add(this.list, this.container);

            this.frameScheduler.schedule();
        } else {
            this.element.classList.add("ls-tabs-content");
        }

        this.element.classList.add("ls-tabs");
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
        content.classList.add("ls-tab-content");
        this.renderList();
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

    set(id, force = false) {
        if(typeof id === "number") {
            id = this.order[id];
        }

        const tab = this.tabs.get(id);
        const oldTab = this.tabs.get(this.activeTab);

        if(!tab) {
            return false;
        }

        // const index = this.order.indexOf(id);

        if(this.activeTab === id && !force) {
            return false;
        }

        if(oldTab) {
            if(oldTab.element) {
                oldTab.element.classList.remove("tab-active");
            }

            if(oldTab.handle) {
                oldTab.handle.classList.remove("active");
            }
        }

        if(tab.element) {
            tab.element.classList.add("tab-active");

            if(this.options.slideAnimation && LS.Animation && !this.firstRender) {
                LS.Animation.slideInToggle(tab.element, oldTab?.element || null);
            }
            this.firstRender = false;
        }

        this.activeTab = id;

        this.emit("changed", [id, oldTab?.id || null]);

        if(tab.handle) {
            tab.handle.classList.add("active");
        }
        return true;
    }

    first() {
        this.set(this.order[0]);
    }

    last() {
        this.set(this.order[this.order.length - 1]);
    }

    currentElement() {
        return this.tabs.get(this.activeTab)?.element || null;
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

    #renderList(){
        if(!this.list || !this.options.list) return;

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
                });

                if(this.options.closeable){
                    tab.handle.add(LS.Create("button", {
                        class: "clear circle ls-tab-close",
                        innerHTML: "&times;",

                        onclick: () => {
                            const canceled = this.emit("close", [id], { results: true })[0] === false;

                            if(canceled) return;

                            if(this.activeTab === id) {
                                this.setClosestNextTo(id);
                            }

                            this.remove(id);
                            this.renderList();
                        }
                    }));
                }
            }

            tab.handle.classList.toggle("active", this.activeTab === id);
            this.list.add(tab.handle);
        });
    }

    renderList() {
        if(this.frameScheduler) this.frameScheduler.schedule();
    }

    destroy() {
        this.emit("destroy");

        if(this.frameScheduler) {
            this.frameScheduler.destroy();
            this.frameScheduler = null;
        }

        this.element.remove();
        this.element = null;
        this.container = null;
        this.list = null;
        this.order.length = 0;
        this.tabs.clear();
        this.events.clear();
        return null;
    }
}, { name: 'Tabs', global: true });
