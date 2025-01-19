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
            left:(
                box.width ? Math.min(Math.max(box.left+(box.width/2)-(cbox.width/2),4),innerWidth-(cbox.width)) : box.x
            ) + "px",

            maxWidth:(innerWidth - 8)+"px",

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

            let e = O(mutation.target), attr = mutation.attributeName;

            e.hasTooltip = e.hasAttribute(attr);
            e.tooltip_value = e.attr(attr);
            e.tooltip_hint = e.hasAttribute("ls-hint");

            if(!e._hasTooltip)! this.setup(e);
        }
    }

    rescan(){
        this.addElements(Q(this.attributes.map(a=>`[${a}]`).join(",")).map(e=>{
            return {
                target: e,
                attributeName: Object.keys(e.attr()).find(a=>this.attributes.includes(a))
            }
        }))
    }

    setup(element){
        element._hasTooltip = true;
     
        element.on("mouseenter", ()=>{
            if(!element.hasTooltip) return;
            this.invoke("set", element.tooltip_value);

            if(element.tooltip_hint) return;

            this.set(element.tooltip_value)
            this.show()

            this.position(element)
        })

        element.on("mousemove", () => this.position(element))

        element.on("mouseleave", () => {
            if(!element.hasTooltip) return;
            this.invoke("leave", element.tooltip_value);
            this.hide()
        })
    }
}, { global: true, singular: true, name: "Tooltips" });