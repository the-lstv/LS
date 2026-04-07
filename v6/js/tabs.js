LS.LoadComponent(class Tabs extends LS.Component {
    static defaults = LS.Util.staticDefaults({
        styled: true,
        list: true,
        closeable: false,
        reordableList: true,
        selector: "ls-tab, .ls-tab",
        mode: "default",
        slideAnimation: false
    });

    #reorderState = {
        id: null,
        moved: false,
        axis: "x",
        offsets: null
    }

    constructor(element, options = {}) {
        super();

        this.order = [];
        this.tabs = new Map;
        this.activeTab = null;

        this.element = this.container = element? LS.Select(element) : LS.Create("div");
        this.options = options = this.constructor.defaults(options);        

        this.element.classList.add("ls-tabs");

        if(options.styled && !options.unstyled) {
            this.container.classList.add("ls-tabs-styled");
        }

        if(options.mode) {
            this.container.classList.add("ls-tabs-mode-" + options.mode);
        }

        if(options.selector) {
            this.element.querySelectorAll(options.selector).forEach((tab) => {
                this.add(tab);
            });
        }

        this.prepareEvent("close", { results: true });
        this.aliasEvent("change", "changed");

        if(options.list) {
            this.frameScheduler = new LS.Util.FrameScheduler(() => this.#renderList());

            this.list = options.listContainer || LS.Create({
                class: "ls-tabs-list",
            });

            if(!options.listContainer) {
                // Wrap existing children in a container
                this.container = LS.Create({
                    class: "ls-tabs-content",
                    inner: [...this.element.children]
                });

                this.element.classList.add("ls-tabs-has-list");
                this.element.append(this.list, this.container);
            }

            this.frameScheduler.schedule();
        } else {
            this.element.classList.add("ls-tabs-content");
        }
    }

    get index() {
        return this.order.indexOf(this.activeTab);
    }

    add(id, content, options = {}) {
        if(id instanceof Element) {
            options = content || {};
            content = id;
            id = options.id || content.getAttribute("tab-id") || content.getAttribute("id") || content.getAttribute("tab-title");
        }

        if(!id) {
            id = "tab-" + (this.tabs.size + 1);
        }

        if(this.tabs.has(id)) {
            return false;
        }

        if(!content) {
            content = LS.Create("div", {
                inner: "Tab " + (this.tabs.size + 1)
            });
        }

        if(typeof options.icon === "string") {
            options.icon = LS.Create("i", { class: options.icon });
        }

        const tab = { id, element: content, title: options.title || options.label || content.getAttribute("tab-title") || content.getAttribute("title") || id, icon: options.icon || null, handle: null, reorderHandle: null };

        this.tabs.set(id, tab);
        this.order.push(id);
        this.container.add(content);

        content.classList.add("ls-tab-content");
        this.renderList();
        return id;
    }

    remove(id) {
        const tab = this.tabs.get(id);

        if(!tab) {
            return false;
        }

        const index = this.order.indexOf(id);

        if(tab.reorderHandle) {
            tab.reorderHandle.destroy();
            tab.reorderHandle = null;
        }

        if(this.#reorderState.id === id) {
            this.#reorderState.id = null;
            this.#reorderState.moved = false;
            this.#reorderState.axis = "x";
            this.#reorderState.offsets = null;
        }

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

        this.emit("change", [id, oldTab?.id || null]);

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

        for (const id of this.order) {
            const tab = this.tabs.get(id);
            if(!tab) continue;

            if(!tab.handle) {
                tab.handle = LS.Create({
                    class: "ls-tab-handle",
                    inner: [tab.icon? tab.icon : null, tab.title || id],

                    onpointerdown: () => {
                        this.set(id);
                    }
                });

                tab.handle.dataset.tabId = id;

                if(this.options.reordableList) {
                    tab.reorderHandle ??= new LS.Util.TouchHandle(tab.handle, {
                        buttons: [0],
                        cursor: "grabbing",
                        disablePointerEvents: false,

                        onStart: (event) => {
                            if(event.domEvent.target.closest(".ls-tab-close")) {
                                return event.cancel();
                            }

                            const handles = this.order
                                .map(tabId => this.tabs.get(tabId)?.handle)
                                .filter(Boolean);

                            if(!handles.length) {
                                return event.cancel();
                            }

                            let axis = "x";

                            if(handles.length > 1) {
                                const firstRect = handles[0].getBoundingClientRect();
                                const secondRect = handles[1].getBoundingClientRect();
                                const horizontalDistance = Math.abs((secondRect.left + secondRect.width / 2) - (firstRect.left + firstRect.width / 2));
                                const verticalDistance = Math.abs((secondRect.top + secondRect.height / 2) - (firstRect.top + firstRect.height / 2));
                                axis = horizontalDistance >= verticalDistance ? "x" : "y";
                            }

                            const offsets = this.order
                                .map(tabId => {
                                    const handle = this.tabs.get(tabId)?.handle;
                                    if(!handle) return null;
                                    const rect = handle.getBoundingClientRect();
                                    return axis === "x"
                                        ? rect.left + rect.width / 2
                                        : rect.top + rect.height / 2;
                                })
                                .filter(offset => typeof offset === "number");

                            if(!offsets.length) {
                                return event.cancel();
                            }

                            this.#reorderState.id = id;
                            this.#reorderState.moved = false;
                            this.#reorderState.axis = axis;
                            this.#reorderState.offsets = offsets;

                            tab.handle.classList.add("ls-tab-handle-reordering");
                            tab.handle.style.pointerEvents = "none";
                        },

                        onMove: (event) => {
                            if(this.#reorderState.id !== id) return;

                            const offsets = this.#reorderState.offsets;
                            if(!offsets || !offsets.length) return;

                            const position = this.#reorderState.axis === "x" ? event.x : event.y;

                            let toIndex = 0;

                            if(position <= offsets[0]) {
                                toIndex = 0;
                            } else if(position >= offsets[offsets.length - 1]) {
                                toIndex = offsets.length - 1;
                            } else {
                                let low = 0;
                                let high = offsets.length - 1;

                                while(low < high) {
                                    const mid = low + ((high - low) >> 1);
                                    if(position > offsets[mid]) {
                                        low = mid + 1;
                                    } else {
                                        high = mid;
                                    }
                                }

                                toIndex = low;

                                if(toIndex > 0) {
                                    const prev = offsets[toIndex - 1];
                                    const next = offsets[toIndex];
                                    if(Math.abs(position - prev) <= Math.abs(next - position)) {
                                        toIndex = toIndex - 1;
                                    }
                                }
                            }

                            const fromIndex = this.order.indexOf(id);

                            if(fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

                            this.order.splice(fromIndex, 1);
                            this.order.splice(toIndex, 0, id);
                            this.#reorderState.moved = true;
                            this.renderList();
                        },

                        onEnd: () => {
                            tab.handle.classList.remove("ls-tab-handle-reordering");
                            tab.handle.style.pointerEvents = "";
                            tab.handle.style.transform = "";

                            if(this.#reorderState.id !== id) return;

                            const moved = this.#reorderState.moved;
                            this.#reorderState.id = null;
                            this.#reorderState.moved = false;
                            this.#reorderState.axis = "x";
                            this.#reorderState.offsets = null;

                            if(moved) {
                                this.emit("reordered", [id, [...this.order]]);
                                this.renderList();
                            }
                        }
                    });
                }

                if(this.options.closeable){
                    tab.handle.appendChild(LS.Create("button", {
                        class: "clear circle ls-tab-close",
                        innerHTML: "&times;",

                        onclick: () => {
                            const results = this.emit("close", [id]);
                            console.log(results);
                            
                            if(results && results.some(result => result === false)) return;

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
            tab.handle.dataset.tabId = id;
            this.list.appendChild(tab.handle);
        }
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

        for(const tab of this.tabs.values()) {
            if(tab.reorderHandle) {
                tab.reorderHandle.destroy();
                tab.reorderHandle = null;
            }
        }

        this.tabs.clear();
        this.events.clear();
        return null;
    }
}, { name: 'Tabs', global: true });