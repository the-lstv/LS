LS.LoadComponent(class Tooltips extends LS.Component {
    constructor(){
        super()

        this.container = N({ class: "ls-tootlip-layer" });
        this.contentElement = N({ class:"ls-tooltip-content" });

        this.container.add(this.contentElement);

        this.attributes = ['ls-tooltip', 'ls-hint'];

        // Observe attribute changes
        this.observer = new MutationObserver(this.addElements);

        LS.once("body-available", () => {
            LS._topLayer.add(this.container)

            this.rescan()

            this.observer.observe(document.documentElement, {
                attributes: true,
                // childList: true,
                subtree: true,
                attributeFilter: this.attributes
            })
        })
    }

    position(x, y){
        let box;

        if(x instanceof Element) {
            box = x.getBoundingClientRect()
        } else if(typeof x == "number") box = {x}

        let cbox = this.contentElement.getBoundingClientRect(),
            pos_top = box.top - cbox.height,
            pos_bottom = box.top + box.height
        ;

        this.contentElement.applyStyle({
            left: (
                box.width ? Math.min(Math.max(box.left + (box.width / 2) - (cbox.width / 2), 4), innerWidth - (cbox.width)) : box.x
            ) + "px",

            maxWidth: (innerWidth - 8) + "px",

            top: typeof y === "number"? y + "px": `calc(${pos_top < 20? pos_bottom : pos_top}px ${pos_top < 0? "+" : "-"} var(--ui-tooltip-rise, 5px))`
        })
    }

    set(text){
        this.contentElement.set(text);
    }

    show(){
        this.container.class("shown");
    }

    hide(){
        this.container.class("shown", false);
    }

    addElements(mutations){
        if(!Array.isArray(mutations)) mutations = [mutations];

        for(let mutation of mutations.reverse()) {
            if(typeof mutation !== "object" || !mutation || !mutation.target) continue;

            let element = O(mutation.target), attribute = mutation.attributeName;

            element.ls_hasTooltip = element.hasAttribute(attribute);
            element.ls_tooltip_isHint = element.hasAttribute("ls-hint");

            if(!element.ls_tooltipSetup) !this.setup(element);
        }
    }

    rescan(){
        this.addElements([...document.querySelectorAll(this.attributes.map(a=>`[${a}]`).join(","))].map(element => {
            return {
                target: element,
                attributeName: Object.keys(element.attr()).find(a=>this.attributes.includes(a))
            }
        }))
    }

    setup(element){
        element.ls_tooltipSetup = true;
     
        element.on("mouseenter", ()=>{
            if(!element.ls_hasTooltip) return;
            const value = element.ls_tooltip || element.getAttribute("ls-tooltip") || element.getAttribute("ls-hint");

            this.emit("set", [value, element]);

            if(element.ls_tooltip_isHint) return;

            this.set(value)
            this.show()

            this.position(element)
        })

        element.on("mousemove", () => this.position(element))

        element.on("mouseleave", () => {
            if(!element.ls_hasTooltip) return;

            this.emit("leave", [element.tooltip_value]);
            this.hide()
        })
    }
}, { global: true, singular: true, name: "Tooltips" });