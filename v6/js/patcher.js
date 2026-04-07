/**
 * Patcher component for LS.
 * Migrated from v3 - still work in progress.
 * 
 * @author lstv.space
 * @license GPL-3.0
 */


LS.LoadComponent(class Patcher extends LS.Component {
    static Node = class Node extends LS.Node {}

    constructor(options = {}) {
        super();
        this.name = "Patcher";

        if(options instanceof Element) options = { element: options };

        this.options = LS.Util.defaults({
            element: LS.Create()
        }, options);

        this.element = this.options.element;
        this.frameScheduler = new LS.Util.FrameScheduler(() => this.#render());

        this.handle = new LS.Util.TouchHandle(this.element, {
            onStart: (event) => {
                this.frameScheduler.start();
            },

            onMove: (event) => {
                this.#camera.position[0] += event.dx;
                this.#camera.position[1] += event.dy;
            },

            onEnd: (event) => {
                this.frameScheduler.stop();
            }
        });

        this.nodes = new Set();

        this.element.classList.add("ls-patcher");
        this.renderTarget = null;
    }

    #camera = {
        position: [0, 0],
        zoom: 1
    }

    #render() {
        this.element.style.transform = `translate3d(${this.#camera.position[0]}px, ${this.#camera.position[1]}px, 0) scale(${this.#camera.zoom})`;
    }

    render() {
        this.frameScheduler.schedule();
    }

    setRenderTarget(node) {
        this.renderTarget = node;
        this.render();
    }

    destroy() {
        this.frameScheduler.destroy();
    }
}, { name: "Patcher", global: true });