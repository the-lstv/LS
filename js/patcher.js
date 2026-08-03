/**
 * Performant patcher component for LS.
 * Migrated from v3, originally made for DOM, fully rewritten for v6 and WebGL - still work in progress.
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
    // This is the new recommended way to register components since LS v6
    static { LS.register(this, { name: "Patcher", global: true }) }

    static MAX_RENDER_ITEMS = 16384;
    
    // This likely won't be reached but is a fallback in case the accent is not available
    static DEFAULT_TILE_COLOR = [104, 104, 104];

    static DEFAULTS = LS.Util.staticDefaults({
        edgeSize: 10,
        maxEdgeScroll: 20,

        collapsedNodeWidth: 60,
        collapsedNodeHeight: 60,
        defaultNodeHeight: (node) => Math.max(40, ((node.inputs?.length ?? 0) + (node.outputs?.length ?? 0)) * 20 + 20),

        anchor: 0.5,

        minZoom: 0.1,
        maxZoom: 20,

        buffer: 20,

        fontName: "UbuntuMono/softmask",
        fontType: "softmask",

        iconFontName: "Phosphor/msdf",
        iconFontType: "msdf",

        // In case the user wants to delay the render, such as when they actually want to show it.
        renderImmediately: true,

        // Fab
        fab: false,
        fabPosition: "bottom-right",
        fabIcon: "plus"
    });

    // --- Camera state values (does not influence content) ---
    #scrollX = 0;
    #scrollY = 0;
    #zoomX = 1;
    #zoomY = 1;

    constructor(options = {}) {
        super();
        if(options instanceof Element || typeof options === "string") options = { container: options };

        // generally not recommended but added for convenience
        if(typeof options.container === "string") options.container = document.querySelector(options.container);

        this.options = this.constructor.DEFAULTS(options);
        this.options.container ??= document.createElement("div");
        this.container = this.options.container;
        
        if(!(this.container instanceof HTMLElement)) {
            throw new Error("Patcher: container must be a DOM element.");
        }

        // -- Renderer and text engine setup
        this.renderer = this.options.renderer || new LS.GL.WebGLRenderer({
            backgroundColor: "transparent",
            resizeTo: this.container,
            blockIfHidden: true,
            firstFrame: false, // Don't render the first frame until the font is loaded
            ...this.options.rendererOptions
        });

        const self = this;
        this.renderable = {
            rect: this.options.rect || {
                x: 0,
                y: 0,
                get width() { return self.renderer.width; },
                get height() { return self.renderer.height; },
            },
            enabled: false, // Wait for font
            renderables: [],
        };

        // -- Text engine for labels
        this.textEngine = this.options.textEngine || new LS.GL.WebGLTextEngine({
            renderer: this.renderer,
            fontName: this.options.fontName,
            type: this.options.fontType, // TODO: the engine should extract this from the font file automatically

            staticColor: [255, 255, 255, 255],

            // The amount of characters that can be rendered at once
            bufferSize: 16384,
            ...this.options.textEngineOptions
        });

        this.iconEngine = this.options.iconEngine || new LS.GL.WebGLTextEngine({
            renderer: this.renderer,
            fontName: this.options.iconFontName,
            type: this.options.iconFontType, // TODO: the engine should extract this from the font file automatically

            staticColor: [255, 255, 255, 255],

            // The amount of characters that can be rendered at once
            bufferSize: 16384 / 2,
            ...this.options.iconEngineOptions
        });

        if (!(this.renderer instanceof LS.GL.WebGLRenderer)) {
            console.warn("TimelineGL: Renderer is not an instance of LS.GL.WebGLRenderer.");
        }

        if (!(this.textEngine instanceof LS.GL.WebGLTextEngine)) {
            console.warn("TimelineGL: Text engine is not an instance of LS.GL.WebGLTextEngine.");
        }

        this.labels = this.textEngine.createText(16384);
        this.iconLabels = this.iconEngine.createText(16384 / 2);

        this.loadPromise = Promise.all([this.textEngine.loadPromise, this.iconEngine.loadPromise]);

        this.__prevScrollX = null;
        this.__prevScrollY = null;
        this.__prevZoomX = null;
        this.__prevZoomY = null;

        this.gzIndex = 0;

        this.nodes = options.nodes || []; // todo
        this.nodeMap = new Map();

        this.selectedItems = [];
        this.selectionRect = [false, 0, 0, 0, 0];

        this.container.classList.add("ls-patcher-container");
        this.container.appendChild(this.renderer.canvas);

        if(this.options.parent) {
            this.options.parent.appendChild(this.container);
        }

        window.p = this;

        this.loadPromise.then(() => {
            // Force redraw of labels just in case
            this.__prevScrollX = null;
            this.__prevScrollY = null;
            this.__prevZoomX = null;
            this.__prevZoomY = null;

            this.renderable.enabled = true;

            this.#setupRenderables();
            this.#setupHandle();

            if (this.options.addRenderable !== false) {
                this.renderer.addRenderable(this.renderable);
            }

            if(this.options.renderImmediately) this.renderer.render();
        });
    }

    export(){
        return {
            nodes: this.nodes.map(n => ({ x: n.x, y: n.y, width: n.width, height: n.height, label: n.label, id: n.id, inputs: n.inputs, outputs: n.outputs, metadata: n.metadata }))
        };
    }

    get width() {
        return this.renderable.rect.width;
    }

    get height() {
        return this.renderable.rect.height;
    }

    // --- Navigation
    #setupHandle() {
        let edgeScrollOffset = [0, 0]; // This is so dragged nodes don't get stuck when edge scrolling
        let itemChanged = false; // If we updated an item and will need processing on end
        let mode = 0;

        this.touchHandle = new LS.Util.TouchHandle(this.renderer.canvas, {
            calculateBounds: true,

            frameTimed: true,
            fluentFrames: true,

            edgeScroll: true,

            handleWheel: true,
            handleHover: true,

            transformBounds: (rect) => {
                const rRect = this.renderable.rect;
                return {
                    x: rect.x + rRect.x,
                    y: rect.y + rRect.y,
                    width: rRect.width,
                    height: rRect.height
                };
            },

            // This handles scrolling, edge scrolling, and scroll inertia
            onScroll: (deltaX, deltaY, event, isWheel) => {
                if (isWheel) {
                    event.domEvent.preventDefault();

                    if (event.domEvent.ctrlKey) {
                        const rect = this.renderer.canvas.getBoundingClientRect();
                        const mouseX = event.domEvent.clientX - rect.left;
                        const mouseY = event.domEvent.clientY - rect.top;
                        this.zoomFrom(mouseX, mouseY, deltaY, 1.1, 1.1);
                    } else {
                        if (event.domEvent.shiftKey) {
                            this.scrollX += deltaY;
                        } else {
                            this.scrollY += deltaY;
                        }
                    }
                    return;
                }

                if (deltaX) {
                    this.scrollX += deltaX;
                    edgeScrollOffset[0] += deltaX;
                    event.__scrolled = true;
                }

                if (deltaY) {
                    this.scrollY += deltaY;
                    edgeScrollOffset[1] += deltaY;
                    event.__scrolled = true;
                }
            },

            onStart: (event) => {
                // Reset state
                const button = +event.domEvent.button?? 0;
                this.renderer.canvas.style.cursor = "";
                event.__scrolled = false;
                edgeScrollOffset[0] = 0;
                edgeScrollOffset[1] = 0;
                itemChanged = false;

                this.touchHandle.edgeScroll = button !== 1;

                this.touchHandle.inertia = false;
                mode = 0;

                this.container.focus();

                // Mouse behaviors
                if (button === 1) {
                    if (event.domEvent.altKey || event.domEvent.ctrlKey) {
                        this.touchHandle.cursor = "none";
                        mode = event.domEvent.altKey? 6: 7;
                    }

                    this.touchHandle.cursor = "grabbing";
                    this.touchHandle.inertia = true;
                    mode = 0;
                } else if (button === 0) {
                    if (event.domEvent.ctrlKey) {
                        // Selection
                        mode = 8;
                        this.touchHandle.cursor = "crosshair";
                        this.selectionRect[0] = 1;
                        this.selectionRect[1] = event.boundX + this.scrollX;
                        this.selectionRect[2] = event.boundY + this.scrollY;
                        this.selectionRect[3] = event.boundX + this.scrollX;
                        this.selectionRect[4] = event.boundY + this.scrollY;
                        this.selectedItems.length = 0;
                        this.renderer.render();
                        return;
                    } else {
                        this.touchHandle.cursor = "grabbing";
                        this.touchHandle.inertia = true;
                        mode = 0;
                    }
                }
            },

            onMove: (event) => {
                if (!event.hasMoved && !event.__scrolled) return;
                event.__scrolled = false;

                let nothingToDo = false;

                switch (mode) {
                    // -- Panning the view
                    case 0:
                        this.scrollX -= event.dx;
                        this.scrollY -= event.dy;
                        nothingToDo = true;
                        return;

                    // -- Zoom X
                    case 6:
                        this.zoomFrom(event.boundX, 0, event.dy, 1.1, 1.0);
                        break;

                    // -- Zoom Y
                    case 7:
                        this.zoomFrom(0, event.boundY, event.dy, 1.0, 1.1);
                        break;
                    
                    // -- Selection
                    case 8:
                        this.selectionRect[3] = event.boundX + this.scrollX;
                        this.selectionRect[4] = event.boundY + this.scrollY;
                        break;
                }

                if (nothingToDo) return;
                this.renderer.render();
            },

            onEnd: (event) => {
                if (this.selectionRect[0]) {
                    this.selectionRect[0] = false;
                    this.renderer.render();
                }

                // Hide any tooltips created during the drag
                LS.Tooltips.hide();
            },

            onHover: (event) => {},
        });
    }

    // --- Renderables
    #setupRenderables() {
        const self = this;

        // To be worked on:
        this.connectionRenderable = this.renderer.createRenderable({
            vertex: LS.GL.shaders.instanced_lines,
            fragment: LS.GL.shaders.debug_fragment,

            uniforms: ["uResolution", "uOffset", "uSize"],

            vao: true,
            bind: {
                iStart:     { cellSize: 2, type: "float", size: Patcher.MAX_RENDER_ITEMS },
                iEnd:       { cellSize: 2, type: "float", size: Patcher.MAX_RENDER_ITEMS },
                iThickness: { cellSize: 1, type: "float", size: Patcher.MAX_RENDER_ITEMS },
                iColor:     { cellSize: 3, type: "ubyte", size: Patcher.MAX_RENDER_ITEMS, normalized: true },
            },

            onRender(delta, now, gl, cw, ch, updatedDimensions, uniforms, attributes) {
                const buffers = this.buffers;
                const startBuffer = buffers.iStart;
                const endBuffer = buffers.iEnd;
                const thicknessBuffer = buffers.iThickness;
                const colorBuffer = buffers.iColor;

                // -- Update buffers with connection data
                let j = 0;
                for (let i = 0; i < self.nodes.length; i++) {
                    startBuffer.setWithStride([0, 0],   j);
                    endBuffer  .setWithStride([50, 50], j);
                    thicknessBuffer.setWithStride(1, j);
                    // colorBuffer.setWithStride([255, 0, 0], j);
                    j++;
                }

                // -- Upload buffers
                startBuffer.update();
                endBuffer.update();
                thicknessBuffer.update();
                colorBuffer.update();

                // -- Uniforms
                if(j > 0) {
                    gl.uniform2f(uniforms.uResolution, cw, ch);
                    gl.uniform2f(uniforms.uOffset, self.#scrollX, self.#scrollY);
                    gl.uniform2f(uniforms.uSize, self.#zoomX, self.#zoomY);

                    this.renderer.scissor(0, 0, cw, ch);
                    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, j);
                    this.renderer.endScissor();
                }
            }
        });

        this.nodeRenderable = this.renderer.createRenderable({
            vertex: LS.GL.shaders.instanced_quads,
            fragment: `#version 300 es
precision highp float;

in vec2 vUV;
in vec3 vColor;
in vec2 vSize;
in vec2 vOffset;
out vec4 fragColor;

${LS.GL.utils.roundedBoxSDF}

void main() {
    vec2 uv = vUV * vSize - vSize * 0.5;
    float dist = roundedBoxSDF(uv, vSize * 0.5, 4.0);
    float alpha = smoothstep(1.0, 0.0, dist);
    if (alpha < 0.01) discard;
    fragColor = vec4(vColor, alpha);
}`,

            uniforms: ["uResolution", "uOffset", "uSize"],

            vao: true,
            bind: {
                iOffset: { cellSize: 2, type: "float", size: Patcher.MAX_RENDER_ITEMS },
                iSize:   { cellSize: 2, type: "float", size: Patcher.MAX_RENDER_ITEMS },
                iColor:  { cellSize: 3, type: "ubyte", size: Patcher.MAX_RENDER_ITEMS, normalized: true },
            },

            onRender(delta, now, gl, cw, ch, updatedDimensions, uniforms, attributes) {
                const buffers = this.buffers;
                const offsetBuffer = buffers.iOffset;
                const sizeBuffer = buffers.iSize;
                const colorBuffer = buffers.iColor;

                const iconMap = self.iconEngine.font.nameMap;
                const iconSize = 48 * self.#zoomX;

                const defaultNodeW = self.options.collapsedNodeWidth;
                const defaultNodeH = self.options.collapsedNodeHeight;

                // -- Update buffers with node data
                let j = 0, reserved = 0, iconCount = 0;
                for (let i = 0; i < self.nodes.length; i++) {
                    const node = self.nodes[i];
                    if (!node) continue;

                    const nodeCollapsed = node.collapsed ?? false;

                    if(node.x + (node.width || defaultNodeW) < self.#scrollX - self.options.buffer ||
                       node.x > self.#scrollX + cw + self.options.buffer ||
                       node.y + (node.height || defaultNodeH) < self.#scrollY - self.options.buffer ||
                       node.y > self.#scrollY + ch + self.options.buffer) {
                        continue;
                    }

                    const x = node.x;
                    const y = node.y;
                    const width  = (node.width  || defaultNodeW) * self.#zoomX;
                    const height = (node.height || defaultNodeH) * self.#zoomY;

                    if(node.todo_node_selected) {
                        const color  = LS.Color.currentAccent || Patcher.DEFAULT_TILE_COLOR;
    
                        offsetBuffer.setWithStride([x, y], j);
                        sizeBuffer  .setWithStride([width, height], j);
                        colorBuffer .setWithStride([color[0], color[1], color[2]], j);
    
                        j++;
                    }

                    // const lColor = undefined;
                    const iColor = undefined;

                    // -- Render label
                    if (node.label) {
                        const label = node.label;
                        const labelLength = label.length;
                        self.labels.writeTextAt(label, reserved, labelLength, x - self.#scrollX - ((labelLength * self.textEngine.cellWidth) * 0.5) + (width * 0.5), y - self.#scrollY + height + 8);
                        reserved += labelLength;
                    }

                    if(node.icon) {
                        const glyph = typeof node.icon === "number"? node.icon: iconMap.get(node.icon);
                        
                        if(glyph) {
                            self.iconEngine._updateVertex(iconCount + self.iconLabels.startIdx, x - self.#scrollX + (width * 0.5) - (iconSize * 0.5), y - self.#scrollY + (height * 0.5) - (iconSize * 0.5), glyph, iColor, iColor, iColor, iColor, iconSize);
                            iconCount++;
                        }
                    }
                }

                if(j > 0) {
                    // -- Uniforms
                    gl.uniform2f(uniforms.uResolution, cw, ch);
                    gl.uniform2f(uniforms.uOffset, self.#scrollX, self.#scrollY);
                    gl.uniform2f(uniforms.uSize, self.#zoomX, self.#zoomY);

                    this.renderer.scissor(0, 0, cw, ch);

                    // -- Render nodes
                    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, j);
                }

                // -- Upload buffers
                offsetBuffer.update();
                sizeBuffer.update();
                colorBuffer.update();

                // -- Prepare label rendering
                if (reserved) {
                    self.labels.clip(0, reserved);

                    // -- Render labels
                    self.labels.render();
                } else {
                    self.labels.clip(0, 0);
                }

                // -- Prepare icon label rendering
                if (iconCount > 0) {
                    self.iconLabels.clip(0, iconCount);

                    // -- Render icon labels
                    self.iconLabels.render();
                } else {
                    self.iconLabels.clip(0, 0);
                }

                this.renderer.endScissor();
            }
        });

        this.selectionRectRenderable = this.renderer.createRenderable({
            vertex: LS.GL.shaders.basic_quad,
            fragment: LS.GL.shaders.selection_rect_fragment,
            uniforms: ["uOffset", "uSize", "uResolution", "uColor"],

            onRender(delta, now, gl, cw, ch, updatedDimensions, uniforms, attributes) {
                if (!self.selectionRect[0]) return;
                let x = self.selectionRect[1] - self.#scrollX;
                let y = self.selectionRect[2];
                let x2 = self.selectionRect[3] - self.#scrollX;
                let y2 = self.selectionRect[4];

                const rowHeight = self.rowHeight * self.#zoomY;
                const row1 = Math.floor(y / rowHeight);
                const row2 = Math.floor(y2 / rowHeight);

                const snappedTop = Math.min(row1, row2) * rowHeight - self.#scrollY;
                const snappedBottom = (Math.max(row1, row2) + 1) * rowHeight - self.#scrollY;

                gl.uniform2f(uniforms.uOffset, Math.min(x, x2), snappedTop);
                gl.uniform2f(uniforms.uSize, Math.abs(x2 - x), snappedBottom - snappedTop);

                const color = LS.Color.currentAccent || Patcher.DEFAULT_TILE_COLOR;
                gl.uniform3ui(uniforms.uColor, color[0], color[1], color[2]);

                gl.uniform2f(uniforms.uResolution, cw, ch);

                this.renderer.scissor(0, 0);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
                this.renderer.endScissor();
            }
        });

        this.renderable.renderables.push(this.connectionRenderable, this.nodeRenderable, this.selectionRectRenderable);
    }

    // -- Getters and setters for camera state
    set scrollX(value) {
        if (isNaN(value)) return;
        if (value === this.#scrollX) return;
        this.#scrollX = value;
        this.renderer.render();
    }

    get scrollX() {
        return this.#scrollX;
    }

    set scrollY(value) {
        if (isNaN(value)) return;
        if (value === this.#scrollY) return;
        this.#scrollY = value;
        this.renderer.render();
    }

    get scrollY() {
        return this.#scrollY;
    }

    get width() {
        return this.renderable.rect.width;
    }

    get height() {
        return this.renderable.rect.height;
    }

    zoomFrom(mouseX = 0, mouseY = 0, delta = 0, zoomFactorX = 1.1, zoomFactorY = 1.1) {
        // const delta = -event.deltaY * 0.001;
        // const zoomFactor = 1 + delta;
        // const newZoom = this.#camera.zoom * zoomFactor;

        // // Limit zoom level
        // if (newZoom < this.options.minZoom || newZoom > this.options.maxZoom) return;

        // // Calculate the position of the mouse relative to the content container
        // const rect = this.scene.getBoundingClientRect();
        // const offsetX = event.clientX - rect.left;
        // const offsetY = event.clientY - rect.top;

        // // Calculate the new camera position to keep the zoom centered on the mouse
        // this.#camera.position[0] -= offsetX * (zoomFactor - 1);
        // this.#camera.position[1] -= offsetY * (zoomFactor - 1);
        // this.#camera.zoom = newZoom;
        // this.render();

        if (zoomFactorX && zoomFactorX !== 1.0) {
            const oldZoomX = this.#zoomX;
            let newZoomX = oldZoomX;

            if (delta < 0) {
                newZoomX *= zoomFactorX;
            } else {
                newZoomX /= zoomFactorX;
            }

            this.zoomX = newZoomX;

            this.scrollX = this.#scrollX; // Ensure scrollX is clamped
            if (this.#zoomX !== oldZoomX) this.scrollX = (mouseX + this.#scrollX) * (this.#zoomX / oldZoomX) - mouseX;
        }

        if (zoomFactorY && zoomFactorY !== 1.0) {
            const oldZoomY = this.#zoomY;
            let newZoomY = oldZoomY;

            if (delta < 0) {
                newZoomY *= zoomFactorY;
            } else {
                newZoomY /= zoomFactorY;
            }

            this.zoomY = newZoomY;

            this.scrollY = this.#scrollY; // Ensure scrollY is clamped
            if (this.#zoomY !== oldZoomY) this.scrollY = (mouseY + this.#scrollY) * (this.#zoomY / oldZoomY) - mouseY;
        }
    }

    get zoomX() {
        return this.#zoomX;
    }

    set zoomX(value) {
        if (isNaN(value)) return;

        const minZoom = this.options.minZoom;
        const maxZoom = this.options.maxZoom;

        value = Math.min(maxZoom, Math.max(minZoom, value));

        if (value === this.#zoomX) return;
        this.#zoomX = value;
        this.renderer.render();
    }

    set zoomY(value) {
        if (isNaN(value)) return;

        const minZoom = this.options.minZoom;
        const maxZoom = this.options.maxZoom;

        value = Math.max(minZoom, Math.min(maxZoom, value));

        if (value === this.#zoomY) return;
        this.#zoomY = value;
        this.renderer.render();
    }

    get zoomY() {
        return this.#zoomY;
    }

    // -- Cleanup
    destroy() {
        if(this.destroyed) return;

        this.touchHandle.destroy();
        this.touchHandle = null;

        this.textEngine.destroy();
        this.textEngine = null;
        this.labels = null;

        this.iconEngine.destroy();
        this.iconEngine = null;
        this.iconLabels = null;

        this.loadPromise = null;

        this.container.__lsComponent = null;
        this.container.remove();
        this.container = null;

        if(!this.options.renderer) {
            this.renderer.destroy();
            this.renderer = null;
        } else {
            this.renderer.destroyRenderable(this.renderable);
        }
        this.renderable = null;

        this.options = null;
        this.selectionRect = null;
        this.nodes = null;
        this.nodeMap = null;

        super.destroy();
    }
}

if(typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = Patcher;
}