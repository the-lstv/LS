/**
 * High performance patcher component for LS.
 * Migrated from v3, fully rewritten for v6 - still work in progress.
 * 
 * Technically WebGL rendering could be more efficient but also eh
 * 
 * @author lstv.space
 * @license https://lstv.space/IMMFOSS
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

        this.nodes = [];
        this.elementPool = [];

        this.visibleViewport = {
            x: 0,
            y: 0,
            width: 0,
            height: 0
        };

        this.cachedWidth = this.element.clientWidth;
        this.cachedHeight = this.element.clientHeight;

        this.__resizeObserver = new ResizeObserver(() => {
            this.cachedWidth = this.element.clientWidth;
            this.cachedHeight = this.element.clientHeight;
            this.#render();
        });

        this.__resizeObserver.observe(this.element);
        this.element.classList.add("ls-patcher");
    }

    #camera = {
        position: [0, 0],
        zoom: 1
    };

    #render() {
        const vvp = this.visibleViewport;

        vvp.x      = -this.#camera.position[0] / this.#camera.zoom;
        vvp.y      = -this.#camera.position[1] / this.#camera.zoom;
        vvp.width  = this.cachedWidth / this.#camera.zoom;
        vvp.height = this.cachedHeight / this.#camera.zoom;

        this.element.style.transform = `translate3d(${this.#camera.position[0]}px, ${this.#camera.position[1]}px, 0) scale(${this.#camera.zoom})`;

        let required = 0;
        // TODO: binary search equivalent or something so we don't do this ugly O(n).
        for(let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];

            if(node.x + node.width < vvp.x || node.x > vvp.x + vvp.width ||
               node.y + node.height < vvp.y || node.y > vvp.y + vvp.height) {
                // Skip invisible nodes.
                continue;
            }

            required++;
            let element = null;
            if(required < this.elementPool.length) {
                // Reuse existing element.
                element = this.elementPool[required - 1];
            } else {
                // Create new element.
                element = {
                    container: LS.Create(".ls-patcher-node"),
                    label: LS.Create("span")
                };

                element.container.append(element.label);

                this.element.appendChild(element.container);
                this.elementPool.push(element);
            }

            element.container.style.transform = `translate3d(${node.x}px, ${node.y}px, 0)`;
            element.container.style.width = `${node.width}px`;
            element.container.style.height = `${node.height}px`;
            element.label.textContent = node.content;
        }

        for(let i = required; i < this.elementPool.length; i++) {
            // Remove unused elements.
            this.elementPool[i].container.remove();
        }
    }

    render() {
        this.frameScheduler.schedule();
    }

    flushPoool() {
        for(let i = 0; i < this.elementPool.length; i++) {
            this.elementPool[i].container.remove();
        }

        this.elementPool.length = 0;
    }

    destroy() {
        if(this.destroyed) return;
        this.flushPoool();

        this.__resizeObserver.disconnect();
        this.__resizeObserver = null;

        this.frameScheduler.destroy();
        super.destroy();
    }
}, { name: "Patcher", global: true });