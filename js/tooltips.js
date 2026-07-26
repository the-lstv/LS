LS.LoadComponent(class Tooltips extends LS.Component {
    /**
     * Global scan mode: Global event listeners are used to detect mouseenter/mouseleave events.
     * This causes more overhead when moving the mouse (each event is scanned for a possible matching tooltip even if there are none), but allows for tooltips
     * to be detected even if they are added dynamically and is more memory efficient (significantly less event listeners).
     * 
     * This is the new default mode since 6.0.0-alpha.3, and is recommended for most use cases.
     */
    SCAN_GLOBAL = "global";

    /**
     * Local scan mode: Tooltips are detected by scanning the DOM for elements with the tooltip attributes.
     * This can be more efficient when there is only a few tooltips, but requires rescanning the element if new tooltips are added.
     * The downside is it uses more memory and requires more manual management.
     * 
     * This is the default legacy behavior in < 6.0.0-alpha.3 and is now deprecated.
     * 
     * To switch back to this mode, use:
     * LS.Tooltips.resetGlobalInstance({ scanMode: LS.Tooltips.SCAN_LOCAL });
     */
    SCAN_LOCAL = "local";

    constructor(options = {}){
        super();

        this.container = this.createElement({ class: "ls-tooltip-layer" });
        this.contentElement = this.createElement({ class:"ls-tooltip-content" });

        this.container.append(this.contentElement);

        this.attributes = ['ls-tooltip', 'ls-hint'];
        this.selector = this.attributes.map(a => `[${a}]`).join(",");

        this.scanMode = options.scanMode || this.SCAN_GLOBAL;
        this.animationEnabled = options.animationEnabled;

        this.shown = false;

        this.__onMouseEnter = this._onMouseEnter.bind(this);
        this.__onMouseMove  = this._onMouseMove.bind(this);
        this.__onMouseLeave = this._onMouseLeave.bind(this);

        this.__currentTarget = null;

        this.__x = null;
        this.__y = null;
        this.__value = null;
        this.__valueChanged = false;
        this.__positionChanged = false;
        this.__lastVisible = false;

        this.frameScheduler = new LS.Util.FrameScheduler(() => this.#render());

        LS.once("ready", () => {
            LS._topLayer.append(this.container);

            if(this.scanMode === this.SCAN_GLOBAL) {
                document.addEventListener("mouseenter", this.__onMouseEnter, { capture: true });
                document.addEventListener("mousemove",  this.__onMouseMove,  { capture: true });
                document.addEventListener("mouseleave", this.__onMouseLeave, { capture: true });
            } else {
                this.rescan();
            }
        });
    }

    position(x, y){
        this.__x = x;
        this.__y = y;
        this.__positionChanged = true;
        this.render();
        return this;
    }

    set(text){
        if(text === this.__value) return this;
        this.__value = text;
        this.__valueChanged = true;
        if(this.shown) this.render();
        return this;
    }

    #render(){
        if(this.__valueChanged) {
            this.__valueChanged = false;

            const ltIndex = this.__value.indexOf("<");
            if(!(ltIndex !== -1 && this.__value.indexOf(">", ltIndex) !== -1)) {
                // Plain text
                this.contentElement.textContent = this.__value;
            } else {
                // We are likely dealing with a HTML value

                // Temporary container
                const temp = document.createElement('span');
                temp.innerHTML = this.__value;

                // Sanitize
                LS.Util.sanitize(temp);

                // Render
                this.contentElement.replaceChildren(...temp.childNodes);
            }

            this.__positionChanged = true;
        }

        if(this.__positionChanged && this.shown) {
            let x = this.__x;
            let y = this.__y;

            // We must nullify
            this.__x = null;
            this.__y = null;

            let box, element = null;

            if(x instanceof Element) {
                element = x;
                box = x.getBoundingClientRect();
            } else if(typeof x == "number") {
                box = { x };
            }

            if(box) {
                let cbox = this.contentElement.getBoundingClientRect();

                if(cbox.width === 0 || cbox.height === 0) {
                    // We need to render the tooltip offscreen first to get its size
                    this.contentElement.style.left = "0px";
                    this.contentElement.style.top = "0px";
                    this.contentElement.style.visibility = "hidden";
                    this.contentElement.style.display = "block";
                    this.container.classList.add("shown");
                    this.__pendingPosition = true;
                    return this.render();
                }

                this.__pendingPosition = false;
                let isDetached = element?.hasAttribute?.("ls-tooltip-detached") && typeof y?.clientX === "number";
    
                if(isDetached) {
                    // Follow cursor for detached tooltips
                    this.contentElement.style.left = Math.min(Math.max(y.clientX + 12, 4), innerWidth - cbox.width) + "px";
                    this.contentElement.style.top = Math.min(Math.max(y.clientY + 12, 4), innerHeight - cbox.height) + "px";
                } else {
                    // Position relative to element or coordinate
                    this.contentElement.style.left = (
                        box.width ? Math.min(Math.max(box.left + (box.width / 2) - (cbox.width / 2), 4), innerWidth - (cbox.width)) : box.x
                    ) + "px";
                    this.contentElement.style.maxWidth = (innerWidth - 8) + "px";
    
                    if(typeof y === "number") {
                        this.contentElement.style.top = y + "px";
                    } else {
                        let pos_top = box.top - cbox.height;
                        let pos_above_fits = pos_top >= 20;
                        this.contentElement.style.top = `calc(${pos_above_fits ? pos_top : box.top + box.height}px ${pos_above_fits ? "-" : "+"} var(--ui-tooltip-rise, 5px))`;
                    }
                }
            }

            this.__positionChanged = false;
        }

        if(!this.shown && this.__pendingPosition) {
            this.__pendingPosition = false;
            this.container.classList.remove("shown");
            this.contentElement.style.visibility = "";
        }

        if(this.shown !== this.__lastVisible) {
            // Sadly we have to render on the next frame to ensure the CSS transition is applied correctly
            // Otherwise it flickers
            if(this.shown && this.__pendingPosition) {
                return this.render();
            }

            this.contentElement.style.visibility = "visible";

            this.__lastVisible = this.shown;

            if(this.animationEnabled) {
                this.container.classList.add("shown");

                if(this.shown) {
                    LS.Animation.fadeIn(this.contentElement, "up");
                } else {
                    LS.Animation.fadeOut(this.contentElement, "up");
                }
            } else {
                this.container.classList.toggle("shown", this.shown);
                this.contentElement.style.display = "";
            }
        }
    }

    render(){
        this.frameScheduler.schedule();
    }

    show(text = null){
        if(text) this.set(text);
        this.shown = true;
        this.render();
        return this;
    }
    
    hide(){
        this.shown = false;
        this.render();
        return this;
    }

    #getTarget(event, direct = false){
        const target = event?.target;

        if(!(target instanceof Element)) return null;
        if(target.ls_hasTooltip) return target;
        if(target.matches(this.selector)) return target;
        if(direct) return null;

        return target.closest(this.selector);
    }

    _onMouseEnter(event){
        const element = this.#getTarget(event);
        if(!element) return;

        this.__currentTarget = element;

        const tooltipContent = element.getAttribute("ls-tooltip") || element.getAttribute("title") || element.getAttribute("aria-label") || element.getAttribute("alt") || "";
        if(tooltipContent) {
            this.quickEmit("set", tooltipContent, element);
            this.__x = this.__currentTarget;
            this.__y = event;
            this.__positionChanged = true;
            this.show(tooltipContent);
        }

        const hintContent = element.getAttribute("ls-hint") || "";
        if(hintContent) {
            this.quickEmit("hint", hintContent, element);
        }
    }

    _onMouseMove(event) {
        if(!this.__currentTarget) return;
        this.__x = this.__currentTarget;
        this.__y = event;
        this.__positionChanged = true;
        this.render();
    }

    _onMouseLeave(event) {
        const element = this.#getTarget(event, true);
        if(!element) return;

        this.__currentTarget = null;

        this.quickEmit("leave", this.__value, element);
        this.hide();
    }


    // --- Legacy (local scan mode) methods ---

    addElements(mutations){
        // No need to manually scan for elements in global mode
        if(this.scanMode === this.SCAN_GLOBAL) return;

        if(!Array.isArray(mutations) && !(mutations instanceof MutationRecord) && !(mutations instanceof NodeList)) mutations = [mutations];
        
        for(const mutation of mutations) {
            const element = (mutation instanceof Element) ? mutation : mutation?.target;
            if(!element) continue;

            const attributeName = mutation.attributeName || null;
            if(attributeName && !this.attributes.includes(attributeName)) continue;

            this.updateElement(element);
        }
    }

    updateElement(element){
        element.ls_tooltip_isHint = element.hasAttribute("ls-hint");
        element.ls_hasTooltip = element.ls_tooltip_isHint || this.attributes.some(attr => element.hasAttribute(attr));
        if(!element.ls_tooltipSetup) this.setup(element); else if(!element.ls_hasTooltip) this.unbind(element);
    }

    rescan(scope = document){
        // No need to manually scan for elements in global mode
        if(this.scanMode === this.SCAN_GLOBAL) return;

        this.addElements(scope.querySelectorAll(this.selector));
    }

    setup(element){
        // No need to manually setup elements in global mode
        if(this.scanMode === this.SCAN_GLOBAL) return;

        element.ls_tooltipSetup = true;
        element.addEventListener("mouseenter", this.__onMouseEnter);
        element.addEventListener("mousemove", this.__onMouseMove);
        element.addEventListener("mouseleave", this.__onMouseLeave);
    }

    unbind(element){
        if(!element.ls_tooltipSetup) return;

        element.ls_tooltipSetup = false;
        element.removeEventListener("mouseenter", this.__onMouseEnter);
        element.removeEventListener("mousemove", this.__onMouseMove);
        element.removeEventListener("mouseleave", this.__onMouseLeave);
    }

    unbindAll(){
        // No need to manually unbind elements in global mode
        if(this.scanMode === this.SCAN_GLOBAL) return;

        const elements = document.querySelectorAll(this.selector);
        for(const element of elements) {
            this.unbind(element);
        }
    }

    /**
     * Reload the global instance of LS.Tooltips.
     * This allows you to change the options or fix some potential issues.
     * Ensure you do not have any references to the old instance!
     */
    resetGlobalInstance(newOptions = {}) {
        if(LS.Tooltips !== this) {
            // This is not the global instance
            return;
        }

        this.destroy();
        LS.Tooltips = new this.constructor(newOptions);
    }

    destroy() {
        this.unbindAll();
        document.removeEventListener("mouseenter", this.__onMouseEnter, { capture: true });
        document.removeEventListener("mousemove",  this.__onMouseMove,  { capture: true });
        document.removeEventListener("mouseleave", this.__onMouseLeave, { capture: true });
        this.__currentTarget = null;
        this.__x = null;
        this.__y = null;
        this.__value = null;
        this.__valueChanged = null;
        this.__positionChanged = null;
        this.container.remove();
        this.container = null;
        this.contentElement = null;
        this.__onMouseEnter = null;
        this.__onMouseMove = null;
        this.__onMouseLeave = null;
        this.frameScheduler.destroy();
        this.frameScheduler = null;
        super.destroy();
    }
}, { global: true, singular: true, name: "Tooltips" });
