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
    constructor(options = {}) {
        super();
        this.name = "Patcher";

        if(options instanceof Element) options = { element: options };

        this.options = LS.Util.defaults({
            element: LS.Create(),
            edgeSize: 10
        }, options);

        this.container = this.options.element;
        this.frameScheduler = new LS.Util.FrameScheduler(() => this.#render());

        this.zIndex = 0;

        let target = null;
        this.handle = new LS.Util.TouchHandle(this.container, {
            frameTimed: true,
            fluentFrames: true,

            onStart: (event) => {
                // this.frameScheduler.start();
                const evTarget = event.domEvent.target;
                const node = evTarget.closest(".ls-patcher-node");

                if(node && node._lsNodeId) {
                    target = this.nodes.find(e => e.id === node._lsNodeId);

                    if(target) {
                        target.x ??= 0;
                        target.y ??= 0;
                        node.style.zIndex = this.zIndex++;
                    }
                } else target = null;
            },

            onMove: (event) => {
                const zoom = this.#camera.zoom;

                if(!target) {
                    if(!event.dx && !event.dy) return;
                    this.#camera.position[0] += event.dx;
                    this.#camera.position[1] += event.dy;

                    this.render();
                    return;
                }

                let scrollX = 0, scrollY = 0, edgeSize = this.options.edgeSize;
                if(event.x < edgeSize) scrollX = edgeSize - event.x;
                else if(event.x > this.cachedWidth - edgeSize) scrollX = -(event.x - (this.cachedWidth - edgeSize));
                if(event.y < edgeSize) scrollY = edgeSize - event.y;
                else if(event.y > this.cachedHeight - edgeSize) scrollY = -(event.y - (this.cachedHeight - edgeSize));

                this.#camera.position[0] += scrollX;
                this.#camera.position[1] += scrollY;

                target.x += event.dx / zoom;
                target.y += event.dy / zoom;

                if(scrollX || scrollY) {
                    // Trigger another move event for continuous scrolling
                    this.handle.scheduleMove();
                }

                this.render();
            },

            onEnd: (event) => {
                // this.frameScheduler.stop();
            }
        });

        this.container.addEventListener("wheel", (event) => {
            event.preventDefault();
            const delta = -event.deltaY * 0.001;
            const zoomFactor = 1 + delta;
            const newZoom = this.#camera.zoom * zoomFactor;

            // Limit zoom level
            if (newZoom < 0.1 || newZoom > 10) return;

            // Calculate the position of the mouse relative to the content container
            const rect = this.contentContainer.getBoundingClientRect();
            const offsetX = event.clientX - rect.left;
            const offsetY = event.clientY - rect.top;
            
            // Calculate the new camera position to keep the zoom centered on the mouse
            this.#camera.position[0] -= offsetX * (zoomFactor - 1);
            this.#camera.position[1] -= offsetY * (zoomFactor - 1);
            this.#camera.zoom = newZoom;
            this.render();
        }, { passive: false });

        this.nodes = [];
        this.elementPool = [];

        this.visibleViewport = {
            x: 0,
            y: 0,
            width: 0,
            height: 0
        };

        this.__resizeObserver = new ResizeObserver(() => {
            this.cachedWidth = this.container.clientWidth;
            this.cachedHeight = this.container.clientHeight;
            this.#render();
        });

        this.__resizeObserver.observe(this.container);
        this.container.classList.add("ls-patcher");

        this.container.appendChild(this.contentContainer = LS.Create(".ls-patcher-container"));
        
        if(this.options.nodes) {
            this.nodes = this.options.nodes;
        }

        if(this.options.parent) {
            this.options.parent.append(this.container);
        }

        this.cachedWidth = this.container.clientWidth;
        this.cachedHeight = this.container.clientHeight;
        this.render();
    }

    #camera = {
        position: [0, 0],
        zoom: 1
    };

    #render() {
        const vvp = this.visibleViewport;

        vvp.x      = (-this.#camera.position[0] - (this.cachedWidth / 2)) / this.#camera.zoom;
        vvp.y      = (-this.#camera.position[1] - (this.cachedHeight / 2)) / this.#camera.zoom;
        vvp.width  = this.cachedWidth / this.#camera.zoom;
        vvp.height = this.cachedHeight / this.#camera.zoom;

        this.contentContainer.style.transform = `translate3d(${this.#camera.position[0] + (this.cachedWidth / 2)}px, ${this.#camera.position[1] + (this.cachedHeight / 2)}px, 0) scale(${this.#camera.zoom})`;

        let required = 0;
        // TODO: binary search equivalent or something so we don't do this ugly O(n).
        for(let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];

            if(node.x + node.width < vvp.x || node.x > vvp.x + vvp.width ||
               node.y + node.height < vvp.y || node.y > vvp.y + vvp.height) {
                // Skip invisible nodes.
                continue;
            }

            node.id ??= LS.Misc.uid();

            required++;
            let element = null;
            if(required < this.elementPool.length) {
                // Reuse existing element.
                element = this.elementPool[required - 1];
            } else {
                // Create new element.
                element = {
                    container: LS.Create(".ls-patcher-node", { style: { position: "absolute" } }),
                    label: document.createElement("span")
                };

                element.container.append(element.label);
                this.elementPool.push(element);
            }

            if(!element.container.isConnected) {
                this.contentContainer.appendChild(element.container);
            }

            element.container.style.transform = `translate3d(${node.x}px, ${node.y}px, 0)`;

            if(element.nodeId === node.id) {
                continue;
            }

            element.container.style.width = `${node.width}px`;
            element.container.style.height = `${node.height}px`;
            element.label.textContent = node.label;
            element.container._lsNodeId = node.id;
            element.nodeId = node.id;
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

    export(){
        return {
            nodes: this.nodes.map(n => ({ x: n.x, y: n.y, width: n.width, height: n.height, label: n.label }))
        };
    }

    destroy() {
        if(this.destroyed) return;

        this.handle.destroy();
        this.nodes.length = 0;
        this.container.remove();
        this.elementPool.length = 0;

        this.__resizeObserver.disconnect();
        this.__resizeObserver = null;

        this.frameScheduler.destroy();
        super.destroy();
    }
}, { name: "Patcher", global: true });