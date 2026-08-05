class Toast extends LS.Component {
    static { LS.register(this, { name: "Toast", global: true }) }

    constructor(content, options = {}){
        super();

        this.element = this.constructor.TEMPLATE({
            content,
            accent: options.accent,
            icon: options.icon,
            closeClicked: (e) => {
                this.close();
            },
        }).root;

        this.constructor.openToasts.add(this);
        this.constructor.container.appendChild(this.element);

        this.closeCallback = options.onClose;

        this.setTimeout(() => {
            // this.element.class("open");
            if(LS.Animation) LS.Animation.fadeIn(this.element, "upBackward", 400);
        }, 1);

        if(options.timeout > 0 || options.timeout === undefined) this.setTimeout(() => {
            this.close();
        }, options.timeout || 5000);
    }

    update(content){
        if(this.element) this.element.querySelector(".ls-toast-content").textContent = content;
    }

    close(){
        if(LS.Animation) LS.Animation.fadeOut(this.element, 150, "upBackward");
        this.constructor.openToasts.delete(this);

        if(this.closeCallback) this.closeCallback();
        this.closeCallback = null;

        this.setTimeout(() => {
            this.element.remove();
            this.element = null;
            super.destroy();
        }, LS.Animation? 150 : 0);
    }

    static {
        this.container = LS.Create({
            class: "ls-toast-layer"
        });

        LS.once("ready", () => {
            LS._topLayer.add(this.container);
        });

        // this.TEMPLATE = LS.CompileTemplate((data, logic) => ({
        //     class: "ls-toast level-n2",
        //     accent: data.accent || null,
        //     inner: [
        //         logic.if(data.icon, { tag: "i", class: data.icon }),

        //         { inner: data.content, class: "ls-toast-content" },

        //         logic.if(data.uncancellable, null, { tag: "button", class: "elevated circle ls-toast-close", innerHTML: "&times;", onclick: data.closeClicked })
        //     ]
        // }));

        // Precompiled template function
        this.TEMPLATE = function(d){'use strict';var e0=document.createElement("div");e0.setAttribute("ls-accent",d.accent);e0.className="ls-toast level-n2";if(!!(d.icon)){var e1=document.createElement("i");e1.className=d.icon;e0.appendChild(e1);}var e2=document.createElement("div");e2.className="ls-toast-content";e2.textContent=d.content;e0.appendChild(e2);if(!!(d.uncancellable)){}else{var e3=document.createElement("button");e3.innerHTML="&times;";e3.onclick=d.closeClicked;e3.className="elevated circle ls-toast-close";e0.appendChild(e3);}var __rootValue=e0;return{root:__rootValue};}
        this.openToasts = new Set();
    }

    static closeAll(){
        for(let toast of this.openToasts){
            toast.close();
        }
    }

    static show(content, options = {}){
        return new this(content, options);
    }

    static destroy(){
        this.container.remove();
        this.openToasts.clear();
    }
}

/*@ls-export*/ if (typeof module !== "undefined" && module.exports) {
    module.exports = Toast;
}