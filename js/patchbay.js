/**
 * Patchbay (patcher) component for LS.
 * Migrated from v3 - still work in progress.
 * 
 * @author lstv.space
 * @license GPL-3.0
 */


LS.LoadComponent(class Patchbay extends LS.Component {
    constructor(options = {}) {
        super();
        this.name = "Patchbay";

        if(options instanceof Element) options = { element: options };

        this.options = LS.Util.defaults({
            element: LS.Create()
        }, options);

        this.element = this.options.element;
        this.frameScheduler = new LS.Util.FrameScheduler(() => this.#render());

        this.element.classList.add("ls-patchbay");
    }

    #render() {
        
    }

    render() {
        this.frameScheduler.schedule();
    }

    destroy() {
        this.frameScheduler.destroy();
    }
}, { name: "Patchbay", global: true });