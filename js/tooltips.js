LS.LoadComponent(class Tooltips extends LS.Component {
    constructor(){
        super()

        this.container = N({ class: "ls-tootlip-layer" });
        this.contentElement = N({ class:"ls-tooltip-content" });

        this.container.add(this.contentElement);

        this.attributes = ['ls-tooltip', 'ls-hint'];

        // Observe attribute changes
        // this.observer = new MutationObserver(this.addElements.bind(this));

        LS.once("body-available", () => {
            LS._topLayer.add(this.container)

            this.rescan()

            // this.observer.observe(document.documentElement, {
            //     attributes: true,
            //     subtree: true,
            //     attributeFilter: this.attributes
            // })
        })
    }

    position(x, y){
        let box;

        if(x instanceof Element) {
            box = x.getBoundingClientRect()
        } else if(typeof x == "number") box = { x }

        let cbox = this.contentElement.getBoundingClientRect(),
            pos_top = box.top - cbox.height,
            pos_bottom = box.top + box.height
        ;

        this.contentElement.style.left = (
            box.width ? Math.min(Math.max(box.left + (box.width / 2) - (cbox.width / 2), 4), innerWidth - (cbox.width)) : box.x
        ) + "px";

        this.contentElement.style.maxWidth = (innerWidth - 8) + "px";

        if(typeof y === "number") {
            this.contentElement.style.top = y + "px";
        } else {
            this.contentElement.style.top = `calc(${pos_top < 20 ? pos_bottom : pos_top}px ${pos_top < 0 ? "+" : "-"} var(--ui-tooltip-rise, 5px))`;
        }
        return this;
    }

    set(text){
        this.contentElement.set(text);
        return this;
    }

    show(text = null){
        if(text) this.set(text);
        this.container.class("shown");
        return this;
    }

    hide(){
        this.container.class("shown", false);
        return this;
    }

    addElements(mutations){
        if(!Array.isArray(mutations)) mutations = [mutations];

        for(let mutation of mutations) {
            if(typeof mutation !== "object" || !mutation || !mutation.target) continue;
            if(mutation.attributeName && !this.attributes.includes(mutation.attributeName)) continue;

            let element = mutation.target;

            element.ls_hasTooltip = element.hasAttribute("ls-tooltip") || element.hasAttribute("ls-hint");
            element.ls_tooltip_isHint = element.hasAttribute("ls-hint");

            if(!element.ls_tooltipSetup) this.setup(element); else if(!element.ls_hasTooltip) this.unbind(element);
        }
    }

    rescan(){
        this.addElements([...document.querySelectorAll(this.attributes.map(a => `[${a}]`).join(","))].map(element => {
            return {
                target: element
            }
        }));
    }

    setup(element){
        element.ls_tooltipSetup = true;
        element.addEventListener("mouseenter", this._onMouseEnter);
        element.addEventListener("mousemove", this._onMouseMove);
        element.addEventListener("mouseleave", this._onMouseLeave);
    }

    unbind(element){
        if(!element.ls_tooltipSetup) return;

        element.ls_tooltipSetup = false;
        element.removeEventListener("mouseenter", this._onMouseEnter);
        element.removeEventListener("mousemove", this._onMouseMove);
        element.removeEventListener("mouseleave", this._onMouseLeave);
    }

    _onMouseEnter(event){
        const element = O(event.target);
        if(!element.ls_hasTooltip) return;

        element.ls_tooltip = element.getAttribute("ls-tooltip") || element.getAttribute("ls-hint") || element.getAttribute("title") || element.getAttribute("aria-label") || element.getAttribute("alt") || "";
        LS.Tooltips.emit("set", [element.ls_tooltip, element]);

        if(element.ls_tooltip_isHint) return;
        LS.Tooltips.show(element.ls_tooltip).position(element);
    }

    _onMouseMove(event) {
        const element = O(event.target);
        if(!element.ls_hasTooltip) return;

        LS.Tooltips.position(element);
    }

    _onMouseLeave(event) {
        const element = O(event.target);
        if(!element.ls_hasTooltip) return;

        LS.Tooltips.emit("leave", [element.tooltip_value]);
        LS.Tooltips.hide();
    }
}, { global: true, singular: true, name: "Tooltips" });