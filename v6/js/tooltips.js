LS.LoadComponent(class Tooltips extends LS.Component {
    constructor(){
        super();

        this.container = this.createElement({ class: "ls-tooltip-layer" });
        this.contentElement = this.createElement({ class:"ls-tooltip-content" });

        this.container.append(this.contentElement);

        this.attributes = ['ls-tooltip', 'ls-hint'];

        this.__onMouseEnter = this._onMouseEnter.bind(this);
        this.__onMouseMove = this._onMouseMove.bind(this);
        this.__onMouseLeave = this._onMouseLeave.bind(this);

        this.frameScheduler = this.addDestroyable(new LS.Util.FrameScheduler(() => this.#render()));

        LS.once("ready", () => {
            LS._topLayer.append(this.container);
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

            let ltIndex = this.__value.indexOf("<");
            if(ltIndex !== -1 && this.__value.indexOf(">", ltIndex) !== -1) {
                // We are likely dealing with a HTML value
                // Temporary container
                const temp = document.createElement('span');
                temp.innerHTML = this.__value;
                // Sanitize
                LS.Util.sanitize(temp);
                // Render
                this.contentElement.replaceChildren(...temp.childNodes);
            } else {
                // Plain text
                this.contentElement.textContent = this.__value;
            }
        }

        if(this.__positionChanged) {
            this.__positionChanged = false;

            let x = this.__x;
            let y = this.__y;
            let box, element = null;

            if(x instanceof Element) {
                element = x;
                box = x.getBoundingClientRect();
            } else if(typeof x == "number") {
                box = { x };
            } else {
                return; // Early exit if position cannot be determined
            }

            let cbox = this.contentElement.getBoundingClientRect();
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

    unbindAll(){
        const elements = document.querySelectorAll(this.attributes.map(a => `[${a}]`).join(","));
        for(const element of elements) {
            this.unbind(element);
        }
    }

    _onMouseEnter(event){
        const element = event.target;
        if(!element.ls_hasTooltip) return;

        element.ls_tooltip = element.getAttribute("ls-tooltip") || element.getAttribute("ls-hint") || element.getAttribute("title") || element.getAttribute("aria-label") || element.getAttribute("alt") || "";
        this.emit("set", [element.ls_tooltip, element]);

        if(element.ls_tooltip_isHint) return;
        this.position(0, 0).show(element.ls_tooltip).position(element, event);
    }

    _onMouseMove(event) {
        const element = event.target;
        if(!element.ls_hasTooltip) return;

        this.position(element, event);
    }

    _onMouseLeave(event) {
        const element = event.target;
        if(!element.ls_hasTooltip) return;

        this.emit("leave", [element.ls_tooltip]);
        this.hide();
    }

    destroy() {
        this.unbindAll();
        super.destroy();
    }
}, { global: true, singular: true, name: "Tooltips" });
