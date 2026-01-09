LS.LoadComponent(class Tooltips extends LS.Component {
    constructor(){
        super()

        this.container = N({ class: "ls-tooltip-layer" });
        this.contentElement = N({ class:"ls-tooltip-content" });

        this.container.add(this.contentElement);

        this.attributes = ['ls-tooltip', 'ls-hint'];

        this.__onMouseEnter = this._onMouseEnter.bind(this);
        this.__onMouseMove = this._onMouseMove.bind(this);
        this.__onMouseLeave = this._onMouseLeave.bind(this);

        this.frameScheduler = new LS.Util.FrameScheduler(() => this.#render());

        LS.once("body-available", () => {
            LS._topLayer.add(this.container);
            this.rescan();
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
        this.render();
        return this;
    }

    #render(){
        if(this.__valueChanged) {
            this.__valueChanged = false;

            // Create a temporary container
            const temp = document.createElement('span');
            temp.innerHTML = this.__value;
            LS.Util.sanitize(temp);
            this.contentElement.replaceChildren(...temp.childNodes);
        }

        if(this.__positionChanged) {
            this.__positionChanged = false;

            let box, element = null;

            let x = this.__x;
            let y = this.__y;

            if(x instanceof Element) {
                element = x;
                box = x.getBoundingClientRect();
            } else if(typeof x == "number") {
                box = { x };
            }

            let cbox = this.contentElement.getBoundingClientRect(),
                pos_top = box.top - cbox.height,
                pos_bottom = box.top + box.height;

            // If element has 'ls-tooltip-detached', follow the cursor instead
            if (element && element.hasAttribute && element.hasAttribute("ls-tooltip-detached") && typeof y === "object" && y.clientX !== undefined && y.clientY !== undefined) {
                // y is the mouse event
                this.contentElement.style.left = Math.min(Math.max(y.clientX + 12, 4), innerWidth - cbox.width) + "px";
                this.contentElement.style.top = Math.min(Math.max(y.clientY + 12, 4), innerHeight - cbox.height) + "px";
            } else {
                this.contentElement.style.left = (
                    box.width ? Math.min(Math.max(box.left + (box.width / 2) - (cbox.width / 2), 4), innerWidth - (cbox.width)) : box.x
                ) + "px";

                this.contentElement.style.maxWidth = (innerWidth - 8) + "px";

                if(typeof y === "number") {
                    this.contentElement.style.top = y + "px";
                } else {
                    this.contentElement.style.top = `calc(${pos_top < 20 ? pos_bottom : pos_top}px ${pos_top < 0 ? "+" : "-"} var(--ui-tooltip-rise, 5px))`;
                }
            }
        }
    }

    render(){
        this.frameScheduler.schedule();
    }

    show(text = null){
        if(text) this.set(text);
        this.container.classList.add("shown");
        return this;
    }

    hide(){
        this.container.classList.remove("shown");
        return this;
    }

    addElements(mutations){
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

    rescan(){
        this.addElements(document.querySelectorAll(this.attributes.map(a => `[${a}]`).join(",")));
    }

    setup(element){
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

    _onMouseEnter(event){
        const element = O(event.target);
        if(!element.ls_hasTooltip) return;

        element.ls_tooltip = element.getAttribute("ls-tooltip") || element.getAttribute("ls-hint") || element.getAttribute("title") || element.getAttribute("aria-label") || element.getAttribute("alt") || "";
        this.emit("set", [element.ls_tooltip, element]);

        if(element.ls_tooltip_isHint) return;
        this.position(0, 0).show(element.ls_tooltip).position(element, event);
    }

    _onMouseMove(event) {
        const element = O(event.target);
        if(!element.ls_hasTooltip) return;

        this.position(element, event);
    }

    _onMouseLeave(event) {
        const element = O(event.target);
        if(!element.ls_hasTooltip) return;

        this.emit("leave", [element.tooltip_value]);
        this.hide();
    }

    destroy(){
        this.frameScheduler.destroy();
        this.container.remove();
        this.container = null;
        this.contentElement = null;
        this.emit("destroy");
        this.events.clear();
        return null;
    }
}, { global: true, singular: true, name: "Tooltips" });
