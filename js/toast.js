LS.LoadComponent(class Toast extends LS.Component {
    constructor(){
        super()

        let container = this.container = N({
            class: "ls-toast-layer"
        });

        LS.once("body-available", () => {
            LS._topLayer.add(container);
        })
    }

    closeAll(){
        this.emit("close-all")
    }

    show(content, options = {}){
        let toast = N({
            class: "ls-toast level-n2",
            accent: options.accent || null,

            inner: [
                options.icon? N("i", {class: options.icon}) : null,

                { inner: content, class: "ls-toast-content" },

                !options.uncancellable? N("button", {
                    class: "elevated circle ls-toast-close",
                    innerHTML: "&times;",

                    onclick(){
                        methods.close()
                    }
                }): null
            ]
        })

        let methods = {
            element: toast,

            update(content){
                toast.get(".ls-toast-content").set(content)
            },

            close(){
                toast.class("open", 0);
                setTimeout(()=>{
                    if(!options.keep) toast.remove()
                }, 150)
            }
        }

        this.once("close-all", methods.close)

        this.container.add(toast);

        if(options.timeout) setTimeout(()=>{
            methods.close()
        }, options.timeout)
        
        setTimeout(()=>{
            toast.class("open")
        }, 1)

        return methods
    }
}, { global: true, singular: true, name: "Toast" });
