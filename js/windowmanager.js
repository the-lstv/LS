// Work in progress

class WindowManager extends LS.Component {
    static { LS.register(this, { name: "WindowManager", global: true, singleton: true }) }

    constructor(options = {}){
        super();

        this.windows = new Set();

        this.container = document.createElement("div");
        this.container.className = "ls-window-manager";
        this.container.style.position = "fixed";
        this.container.style.top = "0";
        this.container.style.left = "0";

        this.topOffset = options.topOffset || 0;
        this.globalWindowZIndex = 1000;
        this.WINDOW_EDGE_MARGIN = 12;
        this.WINDOW_TOP_STACK_GAP = 10;
        this.WINDOW_TOP_STACK = [];
        this.WINDOW_MAXIMIZE_DRAG_RESTORE_BUFFER = 18;
        this.SUSPEND_ON_CLOSE = options.suspendOnClose ?? false;

        this.target = options.target || LS._topLayer || document.body;
        this.target.appendChild(this.container);

        // Keep floating windows in view on resize
        this.windowBoundsScheduler = new LS.Util.FrameScheduler(() => {
            for (const win of this.windows) {
                if (win.destroyed || !win.windowElement) continue;
                win.applyLayout();
            }
        });

        const scheduleWindowClamp = () => this.windowBoundsScheduler.schedule();
        this.addExternalEventListener(window, 'resize', scheduleWindowClamp);
        if (window.visualViewport) this.addExternalEventListener(window.visualViewport, 'resize', scheduleWindowClamp);

        this.addExternalEventListener(document, "pointerdown", (event) => {
            if (this.windows.size > 0 && !event.target.closest(".window-container") ) {
                for (const windowInstance of this.windows.values()) {
                    windowInstance.blur();
                }
            }
        }, { passive: true });
    }

    push(window) {
        if (!window || !window.isWindow) return;
        this.windows.add(window);
        this.container.appendChild(window.windowElement);
    }

    remove(window) {
        if (!window || !window.isWindow) return;
        this.windows.delete(window);
        if(window.windowElement && window.windowElement.parentNode === this.container) {
            this.container.removeChild(window.windowElement);
        }
    }

    closeAllWindows() {
        for (const win of this.windows) {
            if (win.destroyed) continue;
            win.close();
        }

        this.windows.clear();
    }

    relayoutWindowTopStack() {
        for (let i = this.WINDOW_TOP_STACK.length - 1; i >= 0; i--) {
            const win = this.WINDOW_TOP_STACK[i];
            if (!win || win.destroyed || !win.isPinnedView) {
                this.WINDOW_TOP_STACK.splice(i, 1);
            }
        }

        let offsetY = 0;
        for (const win of this.WINDOW_TOP_STACK) {
            offsetY = win.applyPinnedLayout(offsetY);
        }
    }

    addToWindowTopStack(win) {
        const index = this.WINDOW_TOP_STACK.indexOf(win);
        if (index !== -1) {
            this.WINDOW_TOP_STACK.splice(index, 1);
        }
        this.WINDOW_TOP_STACK.push(win);
        this.relayoutWindowTopStack();
    }

    removeFromWindowTopStack(win) {
        const index = this.WINDOW_TOP_STACK.indexOf(win);
        if (index !== -1) {
            this.WINDOW_TOP_STACK.splice(index, 1);
            this.relayoutWindowTopStack();
        }
    }

    destroy(replacing = false) {
        if(this.destroyed) return;
        this.closeAllWindows();
        this.windows = null;
        this.windowBoundsScheduler.destroy();
        this.windowBoundsScheduler = null;
        LS.WindowManager = replacing? new WindowManager(): null;
        super.destroy();
    }
}

class Window extends LS.Slot {
    static { LS.register(this, { name: "Window", global: true }) }

    // static TEMPLATE = LS.CompileTemplate((data, logic) => ({
    //     class: 'window-container',
    //     inner: [
    //         logic.export("header", { class: 'level-1 window-header', inner: [
    //             [
    //                 logic.export("icon", { class: 'window-icon', tag: 'img' }),
    //                 logic.export("title", { class: 'window-title text-overflow-nowrap', textContent: data.name, tag: 'span' }),
    //             ],

    //             { class: 'window-header-buttons', inner: [
    //                 {
    //                     tag: 'button',
    //                     class: 'window-pin-button circle elevated',
    //                     inner: { tag: 'i', class: 'bi-window' },
    //                     tooltip: 'Toggle Window View',
    //                     onclick: data.toggleView
    //                 },
    //                 {
    //                     tag: 'button',
    //                     class: 'window-minimize-button circle elevated',
    //                     inner: { tag: 'i', class: 'bi-dash-lg' },
    //                     onclick: data.minimize
    //                 },
    //                 {
    //                     tag: 'button',
    //                     class: 'window-maximize-button circle elevated',
    //                     inner: { tag: 'i', class: 'bi-square' },
    //                     onclick: data.maximize
    //                 },
    //                 {
    //                     tag: 'button',
    //                     class: 'window-close-button circle elevated',
    //                     inner: { tag: 'i', class: 'bi-x-lg' },
    //                     onclick: data.close
    //                 },
    //             ]}
    //         ]}),

    //         data.target
    //     ],
    // }));

    // Precompiled
    static TEMPLATE = function(d){'use strict';var e0=document.createElement("div");e0.className="window-container";var e1=document.createElement("div");e1.className="level-1 window-header";var e2=document.createElement("div");var e3=document.createElement("img");e3.className="window-icon";e2.appendChild(e3);var e4=document.createElement("span");e4.textContent=d.name;e4.className="window-title text-overflow-nowrap";e2.appendChild(e4);var e5=document.createElement("div");e5.className="window-header-buttons";var e6=document.createElement("button");e6.onclick=d.toggleView;e6.setAttribute("ls-tooltip","Toggle Window View");LS.Tooltips.updateElement(e6);e6.className="window-maximize-button circle elevated";var e7=document.createElement("i");e7.className="bi-window";e6.appendChild(e7);var e8=document.createElement("button");e8.onclick=d.minimize;e8.className="window-minimize-button circle elevated";var e9=document.createElement("i");e9.className="bi-dash-lg";e8.appendChild(e9);var e10=document.createElement("button");e10.onclick=d.maximize;e10.className="window-maximize-button circle elevated";var e11=document.createElement("i");e11.className="bi-square";e10.appendChild(e11);var e12=document.createElement("button");e12.onclick=d.close;e12.className="window-close-button circle elevated";var e13=document.createElement("i");e13.className="bi-x-lg";e12.appendChild(e13);e5.append(e6,e8,e10,e12);e1.append(e2,e5);var dyn14=LS.toNode(d.target);e0.append(e1,dyn14);var __rootValue=e0;return{"header":e1,"icon":e3,"title":e4,root:__rootValue};}

    constructor(options = {}){
        super({
            isWindow: true,
            windowOptions: options
        });

        this.isWindow = true;
        this.isPinnedView = false;
        this.isMaximized = false;
        this.suspended = false; // minimized

        const contentTarget = options.target || this.container || document.createElement("div");

        const window = Window.TEMPLATE({
            name: this.getTitle(),
            target: contentTarget,
            minimize: () => this.minimize(),
            maximize: () => this.maximize(),
            close: () => this.close(),
            toggleView: () => this.toggleView(),
        });

        contentTarget.classList.add("ls-window-content-container");
        this.contentTarget = contentTarget;

        this.windowElement = window.root;
        this.headerElement = window.header;
        this.iconElement = window.icon;
        this.__titleElement = window.title;
        this.destroying = false;

        if(options.header === false) {
            this.setHeaderEnabled(false);
        }

        if(options.frame !== false) {
            this.setFrameEnabled(true);
        }

        this.suspendOnClose = options.suspendOnClose ?? LS.WindowManager.SUSPEND_ON_CLOSE;

        const headerButtons = this.windowElement.querySelectorAll(".window-header-buttons > button");
        this.toggleViewButton = headerButtons[0] || null;
        this.minimizeButton = headerButtons[1] || null;
        this.maximizeButton = headerButtons[2] || null;
        this.closeButton = headerButtons[3] || null;

        if(options.closeable === false) {
            this.setCloseButtonEnabled(false);
        }

        if(options.minimizable === false || this.suspendOnClose === true) {
            this.setMinimizeButtonEnabled(false);
        }

        if(options.maximizable === false) {
            this.setMaximizeButtonEnabled(false);
        }

        if(options.pinButton === false) {
            this.setToggleViewButtonEnabled(false);
        }

        // x, y, width, height
        this.restoreState = [0, 0, 0, 0];

        let startX, startY;
        this.windowHandle = new LS.Util.TouchHandle(window.header, {
            buttons: [0],
            exclude: true,
            frameTimed: true,
            cursor: 'move',

            onStart: (event) => {
                if (this.isPinnedView) return;
                startX = event.x - this.x;
                startY = event.y - this.y;
                this.focus();
            },

            onMove: (event) => {
                if (this.isPinnedView) return;

                if (this.isMaximized) {
                    const dx = event.x - this.restoreState[0];
                    const dy = event.y - this.restoreState[1];
                    if (Math.hypot(dx, dy) < LS.WindowManager.WINDOW_MAXIMIZE_DRAG_RESTORE_BUFFER) return;

                    this.maximize(false);

                    // todo:
                    this.setPosition(event.x - (this.restoreState[2] / 2), event.y - 20, false);

                    startX = event.x - this.x;
                    startY = event.y - this.y;
                }

                if (this.isMaximized) return;
                this.setPosition(event.x - startX, event.y - startY);
            },

            onEnd: (event) => {
                // todo: indicator that the window will be maximized
                if (!this.isMaximized && event.y < this.getViewportTopOffset() + LS.WindowManager.WINDOW_MAXIMIZE_DRAG_RESTORE_BUFFER) {
                    this.maximize(true);
                    startX = event.x - (this.width / 2);
                    startY = event.y - 20;
                }
            }
        });

        this.headerElement.addEventListener("dblclick", (event) => {
            if (event.target.closest("button")) return;
            this.maximize();
        });

        this.windowElement.addEventListener("mousedown", () => {
            this.focus();
        }, { passive: true });

        this.resizeOptions = {
            sides: true,
            corners: true,
            styled: false,
            minWidth: 300,
            minHeight: 100,
            ...options.resizeOptions || {},
            translate: true,
        };

        this.resize = null;
        this.setResizeEnabled(true);

        this.ownsContent = options.ownsContent ?? false;

        this.setSize(options.width || 600, options.height || 400, false);
        this.setPosition(options.x || ((innerWidth / 2) - (this.width / 2)), options.y || ((innerHeight / 2) - (this.height / 2)), false);
        this.applyLayout();
        this.updateControlButtons();

        if(options.transparent) {
            this.windowElement.classList.add("window-transparent");
            this.windowElement.style.backgroundColor = "transparent";
        }

        if(options.content) {
            this.setWindowContent(options.content);
        }

        this.on("rendered", (content) => {
            if(this.destroyed) return;

            if(content && content !== this.currentView) {
                this.setWindowContent(content);
            }

            // Update title and icon based on content
            this.setTitle(this.getTitle());
            this.setIcon(this.getIcon());
            this.emit("ready");

            options.open ??= options.show !== false;
            if(options.open || options.show) {
                const openAnimation  = !(options.disableOpenAnimation || options.openAnimation === false) && LS.Animation && LS.Animation.fadeIn;
                this.windowElement.style.opacity = openAnimation? 1: 0;
        
                if (openAnimation) {
                    requestAnimationFrame(() => {
                        this.show();
                    });
                }
        
                if (this.isMobileViewport()) {
                    this.maximize(true);
                }

                this.focus();
            }
        });

        this.windowElement.style.display = "none";
        if(!options.waitForRender) {
            this.emit("rendered");
        }

        LS.WindowManager.push(this);
    }

    setWindowContent(content) {
        if(this.currentView === content) return;

        // if(this.currentView && this.currentView !== this && this.ownsContent) {
        //     this.currentView.destroy?.();
        // }

        if(content instanceof LS.View) {
            this.set(content);
        } else if(content instanceof LS.Slot) {
            this.swapWith(content);
        } else if(content instanceof HTMLElement) {
            this.contentTarget.appendChild(content);
        }
    }

    setFrameEnabled(enabled, disableHeader = false) {
        this.windowElement.classList.toggle("window-framed", enabled);
        if (disableHeader) {
            this.setHeaderEnabled(false);
        }
    }

    setHeaderEnabled(enabled) {
        this.windowElement.querySelector(".window-header").style.display = enabled ? "flex" : "none";
    }

    setCloseButtonEnabled(enabled) {
        if (this.closeButton) {
            this.closeButton.style.display = enabled ? "inline-flex" : "none";
        }
    }

    setMaximizeButtonEnabled(enabled) {
        if (this.maximizeButton) {
            this.maximizeButton.style.display = enabled ? "inline-flex" : "none";
        }
    }

    setToggleViewButtonEnabled(enabled) {
        if (this.toggleViewButton) {
            this.toggleViewButton.style.display = enabled ? "inline-flex" : "none";
        }
    }

    setMinimizeButtonEnabled(enabled) {
        if (this.minimizeButton) {
            this.minimizeButton.style.display = enabled ? "inline-flex" : "none";
        }
    }

    setResizeEnabled(enabled) {
        if (enabled) {
            if (this.resize || !this.windowElement || this.destroyed) return;

            this.resize = LS.Resize.set(this.windowElement, this.resizeOptions);
            this.resize.handler.on("resize", (side, nW, nH, nX, nY) => {
                if (this.isMaximized) {
                    this.applyLayout();
                    return;
                }

                this.width = nW;
                this.height = nH;
                this.x = nX;
                this.y = nY;

                if (this.isPinnedView) {
                    LS.WindowManager.relayoutWindowTopStack();
                } else {
                    this.applyLayout();
                }

                this.emit("resize", [this.width, this.height, side, this.x, this.y]);
            });
            return;
        }

        if (!this.resize) return;
        this.resize.handler.destroy();
        LS.Resize.remove(this.windowElement);
        this.resize = null;
    }

    setPosition(x, y, evt = true, force = false) {
        if ((this.isPinnedView || this.isMaximized) && !force) return;

        const screenW = window.innerWidth;
        const screenH = window.innerHeight;

        let left = Number(x);
        let top = Number(y);

        if (!Number.isFinite(left)) left = Number.isFinite(this.x) ? this.x : 0;
        if (!Number.isFinite(top)) top = Number.isFinite(this.y) ? this.y : 0;

        const NET = LS.WindowManager.topOffset;
        left = Math.max(NET + 90 - this.width, Math.min(left, screenW - NET));
        top = Math.max(NET, Math.min(top, screenH - NET));

        this.x = left;
        this.y = top;

        this.windowElement.style.transform = `translate3d(${left}px, ${top}px, 0)`;
        if(evt) this.emit("move", [left, top]);
    }

    setSize(width, height, evt = true, force = false) {
        if (this.isMaximized && !force) return;

        const bounds = this.getViewportBounds();
        const minW = Math.min(300, Math.max(180, bounds.maxWidth));
        const minH = Math.min(100, Math.max(80, bounds.maxHeight));

        let nextWidth = Number(width);
        let nextHeight = Number(height);

        if (!Number.isFinite(nextWidth)) nextWidth = minW;
        if (!Number.isFinite(nextHeight)) nextHeight = minH;
        nextWidth = Math.max(minW, nextWidth);
        nextHeight = Math.max(minH, nextHeight);

        this.width = nextWidth;
        this.height = nextHeight;
        this.windowElement.style.width = this.width + "px";
        this.windowElement.style.height = this.height + "px";
        if(evt) this.emit("resize", [this.width, this.height, null, this.x, this.y]);
    }

    getTitle(context) {
        context ??= this.currentView;
        return this.title || this.id || (context && (context.title || context.constructor.manifest.title || context.constructor.manifest.name || context.id || context.constructor.manifest.id || context.constructor.name) || "Untitled Window");
    }

    getIcon(context) {
        context ??= this.currentView;
        return this.icon || (context && (context.icon || context?.constructor?.manifest?.icon || null)) || null;
    }

    setTitle(title) {
        this.title = title;
        this.__titleElement.textContent = title;
    }

    setIcon(icon) {
        this.icon = icon;
        if(icon) {
            const src = icon.startsWith("data:") || icon.startsWith("http:") || icon.startsWith("https:")? icon: "https://cdn.extragon.cloud/" + "/file/" + icon; //todo..
            this.iconElement.src = src;
            this.iconElement.style.display = "";
        } else {
            this.iconElement.src = "";
            this.iconElement.style.display = "none";
        }
    }

    minimize(animation = true, hiding = false) {
        if(this.destroyed) return;
        this.suspended = true;
        if(this.currentView && this.currentView.suspend) this.currentView.suspend();
        this.quickEmit("minimize");

        if(!animation) {
            this.windowElement.style.display = "none";
            return;
        }
        return LS.Animation.fadeOut(this.windowElement, hiding? "backward": "up", null, true);
    }

    restore(animation = true) {
        if(this.destroyed) return;
        this.suspended = false;
        if(this.currentView && this.currentView.resume) this.currentView.resume();
        this.quickEmit("restore");

        if(!animation) {
            this.windowElement.style.display = "";
            this.windowElement.style.transform = `translate3d(${this.x}px, ${this.y}px, 0)`;
            this.windowElement.style.opacity = 1;
            return;
        }
        return LS.Animation.fadeIn(this.windowElement, "up", null, true);
    }

    maximize(forceState = null) {
        const shouldMaximize = typeof forceState === "boolean" ? forceState : !this.isMaximized;

        if (shouldMaximize) {
            if (this.isPinnedView) this.toggleView(false);
            this.captureLayout(this.restoreState);

            this.isMaximized = true;
            this.setResizeEnabled(false);
            this.applyLayout();
            this.focus();
        } else {
            this.isMaximized = false;
            this.setResizeEnabled(true);

            if (this.restoreState) {
                this.setPosition(this.restoreState[0], this.restoreState[1], false, true);
                this.setSize(this.restoreState[2], this.restoreState[3], false, true);
            }

            this.applyLayout();
        }

        this.updateControlButtons();
    }

    focus() {
        LS.WindowManager.globalWindowZIndex += 1;
        this.windowElement.style.zIndex = LS.WindowManager.globalWindowZIndex;

        for (const win of LS.WindowManager.windows) {
            if (win !== this && win.windowElement) {
                win.windowElement.classList.remove("top");
            }
        }

        this.windowElement.classList.add("top");
        this.quickEmit("focus");
    }

    blur() {
        if(!this.windowElement) return;
        this.windowElement.classList.remove("top");
        this.quickEmit("blur");
    }

    show(animation = true) {
        if(this.destroyed) return;
        this.applyLayout();
        this.focus();

        if(this.suspended) {
            return this.restore(animation);
        }

        if(!animation) {
            this.windowElement.style.display = "";
            this.windowElement.style.transform = `translate3d(${this.x}px, ${this.y}px, 0)`;
            this.windowElement.style.opacity = 1;
            return;
        }

        return LS.Animation.fadeIn(this.windowElement, "backward", null, true);
    }

    hide(animation = true, suspend = true) {
        if(this.destroyed) return;

        if(suspend) {
            return this.minimize(animation, true);
        }

        if(!animation) {
            this.windowElement.style.display = "none";
            return;
        }

        return LS.Animation.fadeOut(this.windowElement, "backward", null, true);
    }

    // Closes the window with animation
    close(animation = true) {
        if(this.suspendOnClose) {
            return this.minimize(animation, true);
        }

        if(this.destroyed) return;

        if (!animation) {
            this.destroy();
            return;
        }

        this.destroying = true;
        return LS.Animation.fadeOut(this.windowElement, "backward", null, true).then(() => {
            if(this.destroyed) return;
            this.destroy(null, true);
        });
    }

    isMobileViewport() {
        return window.innerWidth <= 820 || window.innerHeight <= 680;
    }

    getViewportTopOffset() {
        return LS.WindowManager.topOffset;
    }

    getViewportBounds() {
        const top = Math.max(LS.WindowManager.WINDOW_EDGE_MARGIN, this.getViewportTopOffset());
        return {
            top,
            maxWidth: Math.max(180, window.innerWidth - (LS.WindowManager.WINDOW_EDGE_MARGIN * 2)),
            maxHeight: Math.max(120, window.innerHeight - top - LS.WindowManager.WINDOW_EDGE_MARGIN),
        };
    }

    captureLayout(out = []) {
        // is there a point to those ternary operators? who tf put them there?
        out[0] = Number.isFinite(this.x)? this.x : ((window.innerWidth - (this.width || 600)) / 2);
        out[1] = Number.isFinite(this.y)? this.y : this.getViewportBounds().top;
        out[2] = Number.isFinite(this.width)? this.width : (this.windowElement?.offsetWidth || 600);
        out[3] = Number.isFinite(this.height)? this.height : (this.windowElement?.offsetHeight || 400);
        return out;
    }

    applyLayout() {
        if (this.isMaximized) {
            const topOffset = this.getViewportTopOffset();
            this.setSize(window.innerWidth, Math.max(120, window.innerHeight - topOffset), false, true);
            this.setPosition(0, topOffset, false, true);
            return;
        }

        if (this.isPinnedView) {}

        if (!this.isMobileViewport()) return;

        const bounds = this.getViewportBounds();
        const right = (this.x || 0) + (this.width || 0);
        const bottom = (this.y || 0) + (this.height || 0);

        const overflows =
            (this.width || 0) > bounds.maxWidth ||
            (this.height || 0) > bounds.maxHeight ||
            (this.x || 0) < LS.WindowManager.WINDOW_EDGE_MARGIN ||
            (this.y || 0) < bounds.top ||
            right > (window.innerWidth - LS.WindowManager.WINDOW_EDGE_MARGIN) ||
            bottom > (window.innerHeight - LS.WindowManager.WINDOW_EDGE_MARGIN);

        if (!overflows) return;

        const fitWidth = Math.min(this.width || 600, bounds.maxWidth);
        const fitHeight = Math.min(this.height || 400, bounds.maxHeight);

        this.setSize(fitWidth, fitHeight, false, true);

        const centerX = Math.round((window.innerWidth - this.width) / 2);
        const centerY = Math.round(bounds.top + Math.max(0, (bounds.maxHeight - this.height) / 2));
        this.setPosition(centerX, centerY, false, true);
    }

    toggleView(forceState = null) {
        const shouldPin = typeof forceState === "boolean" ? forceState : !this.isPinnedView;

        if (shouldPin) {
            if (this.isMaximized) this.maximize(false);
            this.captureLayout(this.restoreState);

            this.isPinnedView = true;
            LS.WindowManager.addToWindowTopStack(this);
            this.focus();
        } else {
            this.isPinnedView = false;
            LS.WindowManager.removeFromWindowTopStack(this);

            if (this.restoreState) {
                this.setPosition(this.restoreState[0], this.restoreState[1], false, true);
                this.setSize(this.restoreState[2], this.restoreState[3], false, true);
            }

            this.applyLayout();
        }

        this.updateControlButtons();
    }

    applyPinnedLayout(offsetY = 0) {
        const bounds = this.getViewportBounds();
        const compactViewport = window.innerWidth <= 820;

        const pinnedWidth = compactViewport
            ? bounds.maxWidth
            : Math.min(this.width || 600, bounds.maxWidth);
        const pinnedHeight = Math.min(this.height || 400, Math.max(120, bounds.maxHeight - offsetY));

        this.setSize(pinnedWidth, pinnedHeight, false, true);

        const top = Math.min(bounds.top + offsetY, Math.max(bounds.top, window.innerHeight - this.height - LS.WindowManager.WINDOW_EDGE_MARGIN));
        const left = Math.round((window.innerWidth - this.width) / 2);

        this.setPosition(left, top, false, true);
        return (top - bounds.top) + this.height + LS.WindowManager.WINDOW_TOP_STACK_GAP;
    }

    updateControlButtons() {
        if (this.toggleViewButton) {
            this.toggleViewButton.setAttribute("ls-tooltip", this.isPinnedView ? "Unpin Window View" : "Pin Window View");
            this.toggleViewButton.querySelector("i").className = this.isPinnedView ? "bi-pin-angle-fill" : "bi-window";
        }

        if (this.maximizeButton) {
            this.maximizeButton.setAttribute("ls-tooltip", this.isMaximized ? "Restore Window" : "Maximize Window");
            this.maximizeButton.querySelector("i").className = this.isMaximized ? "bi-fullscreen-exit" : "bi-square";
        }

        this.windowElement.classList.toggle("window-pinned", this.isPinnedView);
        this.windowElement.classList.toggle("window-maximized", this.isMaximized);
    }

    destroy(destroyContent = true, _force = false) {
        if(this.destroyed || (this.destroying && !_force)) return;

        LS.WindowManager.removeFromWindowTopStack(this);
        LS.WindowManager.remove(this);

        this.setResizeEnabled(false);

        if(this.windowHandle) this.windowHandle.destroy();
        this.windowHandle = null;

        if(this.windowElement) {
            this.windowElement.remove();
        }
        this.windowElement = null;

        this.headerElement = null;
        this.__titleElement = null;
        this.iconElement = null;
        this.toggleViewButton = null;
        this.maximizeButton = null;

        if((this.ownsContent || destroyContent) && this.currentView && this.currentView !== this) {
            this.currentView.destroy?.();
        }

        super.destroy();
    }
}

/*@ls-export*/ if (typeof module !== "undefined" && module.exports) {
    module.exports = WindowManager;
}
