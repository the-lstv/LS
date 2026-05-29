const G_CENTERPOINT_ARRAY = new Float32Array(2);

/**
 * High performance patcher component for LS.
 * Migrated from v3, fully rewritten for v6 - still work in progress.
 * 
 * Technically WebGL rendering could be more efficient but also eh
 * 
 * Copyright (c) 2026 lstv.space. All rights reserved.
 * Use of this source code is governed by the IMMSA license that can be found in the LICENSE file.
 * @author lstv.space
 * @license https://lstv.space/IMMSA.0.txt
 * 
 * Data model:
 * - Node: { x, y, width, height, label, id?, inputs?:[Port], outputs?:[Port], metadata?: any }
 * - Port: { id: string, connection: Connection?, metadata?: { type: any, label: string, color?: string } }
 * - Connection: { nodeId, portId, strength?: number }
 * 
 * Nodes are individual graph nodes.
 * Ports are inputs/outputs that nodes can connect to each other for data flow.
 * Connection is an output to another port.
 * 
 * Ports can be connected if their types are compatible.
 * Port IDs are unique per-node and not globally unique, so nodes can share port IDs without conflict.
 * Connection will only work when a port is an output port.
 * 
 * Port metadata can be stored in a port itself, OR globally via options.portMetadata or patcher.setPortMetadata(portId, metadata) to share by it's ID.
 */

class Patcher extends LS.Component {
    static { LS.LoadComponent(this, { name: "Patcher", global: true }) }

    constructor(options = {}) {
        super();
        this.name = "Patcher";

        if(options instanceof Element) options = { element: options };

        this.options = LS.Util.defaults({
            element: LS.Create(),
            edgeSize: 10,
            maxEdgeScroll: 20,
            anchor: 0.5,
            minZoom: 0.1,
            maxZoom: 20,
            buffer: 20,
        }, options);

        this.container = this.options.element;
        this.frameScheduler = new LS.Util.FrameScheduler(() => this.#render());

        this.zIndex = 0;

        let target = null, scrolledX = 0, scrolledY = 0, moveX = 0, moveY = 0;
        this.handle = new LS.Util.TouchHandle(this.container, {
            frameTimed: true,
            fluentFrames: true,

            onStart: (event) => {
                const evTarget = event.domEvent.target;
                const node = evTarget.closest(".ls-patcher-node");
                
                if(node && node._lsNodeId) {
                    target = this.nodes.find(e => e.id === node._lsNodeId);

                    if(target) {
                        scrolledX = 0;
                        scrolledY = 0;
                        target.x ??= 0;
                        target.y ??= 0;
                        moveX = target.x;
                        moveY = target.y;
                        node.style.zIndex = this.zIndex++;
                    }

                    this.handle.cursor = "none";
                    return;
                } else target = null;

                this.handle.cursor = "grabbing";
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

                let scrollX = 0, scrollY = 0, edgeSize = this.options.edgeSize, maxEdgeScroll = this.options.maxEdgeScroll;
                if(event.x < edgeSize) scrollX = Math.min(maxEdgeScroll, edgeSize - event.x);
                else if(event.x > this.cachedWidth - edgeSize) scrollX = Math.max(-maxEdgeScroll, -(event.x - (this.cachedWidth - edgeSize)));
                if(event.y < edgeSize) scrollY = Math.min(maxEdgeScroll, edgeSize - event.y);
                else if(event.y > this.cachedHeight - edgeSize) scrollY = Math.max(-maxEdgeScroll, -(event.y - (this.cachedHeight - edgeSize)));

                this.#camera.position[0] += scrollX;
                this.#camera.position[1] += scrollY;
                scrolledX += scrollX;
                scrolledY += scrollY;

                target.x = moveX + (event.offsetX - scrolledX) / zoom;
                target.y = moveY + (event.offsetY - scrolledY) / zoom;
                target._dirty = true;

                if(scrollX || scrollY) {
                    // Trigger another move event for continuous scrolling until the mouse is not in the corner boundary
                    this.handle.scheduleMove();
                }

                this.render();
            },

            onEnd: (event) => {
                target = null;
            }
        });

        this.container.addEventListener("wheel", (event) => {
            event.preventDefault();
            const delta = -event.deltaY * 0.001;
            const zoomFactor = 1 + delta;
            const newZoom = this.#camera.zoom * zoomFactor;

            // Limit zoom level
            if (newZoom < this.options.minZoom || newZoom > this.options.maxZoom) return;

            // Calculate the position of the mouse relative to the content container
            const rect = this.scene.getBoundingClientRect();
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
        this.pathPool = [];

        this.__resizeObserver = new ResizeObserver(() => {
            this.cachedWidth = this.container.clientWidth;
            this.cachedHeight = this.container.clientHeight;
            this.#render();
        });

        this.__resizeObserver.observe(this.container);
        this.container.classList.add("ls-patcher");

        this.container.appendChild(this.scene = LS.Create(".ls-patcher-container"));

        if(this.options.nodes) {
            this.nodes = this.options.nodes;
        }

        if(this.options.parent) {
            this.options.parent.append(this.container);
        }

        this.svgContext = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svgContext.setAttribute("class", "ls-patcher-svg");
        this.scene.appendChild(this.svgContext);

        this.cachedWidth = this.container.clientWidth;
        this.cachedHeight = this.container.clientHeight;
        this.render();
    }

    #camera = {
        position: [0, 0],
        zoom: 1
    };

    #render() {
        // Camera
        const camX = this.#camera.position[0];
        const camY = this.#camera.position[1];
        const zoom = this.#camera.zoom;

        const anchor = this.options.anchor ?? 0.5;
        const buffer = (this.options.buffer ?? 100) / zoom;

        // Anchor
        const originW = this.cachedWidth  * anchor;
        const originH = this.cachedHeight * anchor;

        const cameraUpdated = camX !== this._lastCameraX || camY !== this._lastCameraY || zoom !== this._lastCameraZoom;

        // Visible viewport in content coordinates
        const visibleViewportLeft   = (-camX - originW) / zoom;
        const visibleViewportTop    = (-camY - originH) / zoom;
        const visibleViewportBottom = visibleViewportTop  + this.cachedHeight / zoom;
        const visibleViewportRight  = visibleViewportLeft + this.cachedWidth  / zoom;

        this.scene.style.transform = `translate3d(${camX + (originW * zoom)}px, ${camY + (originH * zoom)}px, 0) scale(${zoom})`;

        let required = 0;
        // TODO: binary search equivalent or something so we don't do this ugly O(n).
        for(let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];

            const nodeLeft = node.x ?? 0;
            const nodeTop = node.y ?? 0;
            const nodeWidth  = node.width  ?? 1;
            const nodeHeight = node.height ?? 1;
            const nodeRight  = nodeLeft + (nodeWidth ?? 1);
            const nodeBottom = nodeTop + (nodeHeight ?? 1);

            // if(zoom < 0.5 && nodeWidth * zoom < 20 && nodeHeight * zoom < 20) {
            //     // Render a simple rectangle for very small nodes to improve performance.
            // }

            if(
                nodeRight + buffer  <= visibleViewportLeft  ||
                nodeLeft - buffer   >= visibleViewportRight ||
                nodeBottom + buffer <= visibleViewportTop   ||
                nodeTop - buffer    >= visibleViewportBottom
            ) {
                // Skip invisible nodes.
                continue;
            }

            node.id ??= LS.Misc.uid();
            required++;

            if(!cameraUpdated && !node._dirty && !this.rebuildRequested) {
                continue;
            }

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
                this.scene.appendChild(element.container);
            }

            element.container.style.transform = `translate3d(${nodeLeft}px, ${nodeTop}px, 0)`;

            if(element.nodeId === node.id) {
                continue;
            }

            element.container.style.width = `${nodeWidth}px`;
            element.container.style.height = `${nodeHeight}px`;
            element.label.textContent = node.label;
            element.container._lsNodeId = node.id;
            element.nodeId = node.id;
        }

        for(let i = required; i < this.elementPool.length; i++) {
            // Remove unused elements.
            this.elementPool[i].container.remove();
        }

        this._lastCameraX = camX;
        this._lastCameraY = camY;
        this._lastCameraZoom = zoom;
        this.rebuildRequested = false;
    }

    render() {
        this.frameScheduler.schedule();
    }

    /**
     * Calculate a point of a quadratic Bezier curve defined by three points (x1, y1), (x2, y2), and (x3, y3) at a given t parameter (0 <= t <= 1).
     * @param {number} x1 - The x-coordinate of the first point.
     * @param {number} y1 - The y-coordinate of the first point.
     * @param {number} x2 - The x-coordinate of the control point.
     * @param {number} y2 - The y-coordinate of the control point.
     * @param {number} x3 - The x-coordinate of the second point.
     * @param {number} y3 - The y-coordinate of the second point.
     * @param {number} t - The parameter (0 <= t <= 1) at which to calculate the point on the curve.
     * @param {Float32Array} [array] - Optional array to store the result, to avoid creating new arrays.
     * @returns {Float32Array} An array containing the x and y coordinates of the calculated point on the curve.
    */
    calculateCenterPoint(x1, y1, x2, y2, x3, y3, t = 0.5, array = G_CENTERPOINT_ARRAY) {
        array[0] = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * x2 + t * t * x3;
        array[1] = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * y2 + t * t * y3;
        return array;
    }

    flushPool() {
        for(let i = 0; i < this.elementPool.length; i++) {
            this.elementPool[i].container.remove();
        }

        this.elementPool.length = 0;
    }

    export(){
        return {
            nodes: this.nodes.map(n => ({ x: n.x, y: n.y, width: n.width, height: n.height, label: n.label, id: n.id, inputs: n.inputs, outputs: n.outputs, metadata: n.metadata }))
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
}
