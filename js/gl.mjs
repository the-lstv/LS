/**
 * GL Utilities for LS
 * @version 2.0.0-alpha.0
 * 
 * ! This is an early stage component. The API is not stable and may change in future releases.
 * ! This component is not fully tested and may contain bugs.
 * 
 * 
 * This is the base module for LS.GL.
 * For more functionality you can chek out extensions like gl-extras and gl-text
 */

const quad = `const vec2 positions[4] = vec2[](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(1.0, 1.0));`;

/**
 * A simple hash function
 * @param {string} str - The input string
 * @param {number} seed - An optional seed value
 * @returns Either string or an array of two 32-bit integers
 * @see https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript/52171480#52171480
 * @see https://github.com/bryc/code/blob/master/jshash/experimental/cyrb53.js
 */
function cyrb64(str, seed = 0, string = true) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for(let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1  = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2  = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    // For a single 53-bit numeric return value we could return
    // 4294967296 * (2097151 & h2) + (h1 >>> 0);
    // but we instead return the full 64-bit value:
    h2 = h2 >>> 0;
    h1 = h1 >>> 0;
    return string? h2.toString(36).padStart(7, '0') + h1.toString(36).padStart(7, '0'): [h2, h1];
}

function stripShaderVersion(source) {
    const trimmed = source.trimStart();
    if (!trimmed.startsWith("#version")) return source;
    const firstNewline = source.indexOf("\n");
    if (firstNewline === -1) return "";
    return source.slice(firstNewline + 1);
}

function getShader(renderer, type, ...keys) {
    for (const key of keys) {
        if(!key) continue;

        if (type === renderer.gl.VERTEX_SHADER && renderer.vertexShaders.has(key)) {
            return { shader: renderer.vertexShaders.get(key), key };
        }

        if (type === renderer.gl.FRAGMENT_SHADER && renderer.fragmentShaders.has(key)) {
            return { shader: renderer.fragmentShaders.get(key), key };
        }
    }
    return null;
}

/**
 * For WebGLRenderer.
 * Creates a shader of the given type, uploads the source and compiles it.
 * The shader is cached in the parent renderer for future use.
 * 
 * @experimental
 * @param {*} renderer - The parent renderer
 * @param {*} type - The shader type (gl.VERTEX_SHADER or gl.FRAGMENT_SHADER)
 * @param {*} source - The shader source code
 * @returns The compiled shader or null if compilation failed
 */
function compileShader(renderer, type, source) {
    if (!(renderer instanceof WebGLRenderer)) throw new Error("Parent is not a LS.GL.WebGLRenderer instance.");
    if (!renderer.gl) throw new Error("Parent does not have a WebGL context.");

    const shaderHash = cyrb64(source);
    const foundShader = getShader(renderer, type, shaderHash);
    if (foundShader) {
        // // If the shader was found by source, we can store it under the name if provided
        // if(foundShader.key !== name) {
        //     renderer[type === renderer.gl.VERTEX_SHADER? "vertexShaders": "fragmentShaders"].set(name, foundShader.shader);
        // }
        return { shader: foundShader.shader, hash: shaderHash };
    }

    const gl = renderer.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }

    renderer[type === gl.VERTEX_SHADER? "vertexShaders": "fragmentShaders"].set(shaderHash, shader);
    return { shader, hash: shaderHash };
}

/**
 * For WebGLRenderer.
 * Creates a shader program from vertex and fragment sources.
 * @param {*} renderer - The parent renderer
 * @param {*} vertex - The vertex shader source code or vertex shader object
 * @param {*} fragment - The fragment shader source code or fragment shader object
 * @returns The compiled and linked shader program or null if failed
 */
function createProgram(renderer, vertex, fragment) {
    if (!(renderer instanceof WebGLRenderer)) throw new Error("Parent is not a LS.GL.WebGLRenderer instance.");
    if (!renderer.gl) throw new Error("Parent does not have a WebGL context.");

    const gl = renderer.gl;
    const program = gl.createProgram();

    if(vertex.shader) vertex = vertex.shader;
    if(fragment.shader) fragment = fragment.shader;

    vertex   = vertex   instanceof WebGLShader ? vertex   : compileShader(renderer, gl.VERTEX_SHADER, vertex)?.shader;
    fragment = fragment instanceof WebGLShader ? fragment : compileShader(renderer, gl.FRAGMENT_SHADER, fragment)?.shader;

    if (!vertex || !fragment) {
        console.error("Failed to create shaders for program.");
        return null;
    }

    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }

    return program;
}

/**
 * Abstract base class for a renderer, reserved for future use
 * 
 * TODO: Support for multiple backends (eg. WebGPU, OpenGL, etc.)
 */
class Renderer extends LS.Context {
    static backend = "Abstract";

    constructor(options = {}) {
        super();
        this.options = options;
        this.activeCamera = null;
    }

    setOptions(options) {
        this.width  = options.width  || this.canvas?.width  || 800;
        this.height = options.height || this.canvas?.height || 600;

        if (options.camera) {
            this.activeCamera = options.camera;
        } else if (!this.activeCamera) {
            this.activeCamera = new Camera(0, 0, this.width, this.height, 0, -1, 1);
        }

        if(options.resizeTo) {
            const resizeTo = options.resizeTo === window? document.body: options.resizeTo;

            if(resizeTo instanceof HTMLElement) {
                this.__observer = new ResizeObserver(() => {
                    this.resize(resizeTo.clientWidth, resizeTo.clientHeight);
                });

                this.__observer.observe(resizeTo);
            }

            this.resize(resizeTo.clientWidth, resizeTo.clientHeight);
            window.addEventListener("resize", this.__resizeHandler = () => {
                this.resize(resizeTo.clientWidth, resizeTo.clientHeight);
            });

        } else if (options.resizeTo === false && this.__observer || this.__resizeHandler) {
            this.__observer && this.__observer.disconnect();
            this.__resizeHandler && window.removeEventListener("resize", this.__resizeHandler);

            this.__observer = null;
            this.__resizeHandler = null;
        }
    }

    resize(width, height) {
        this.width  = width;
        this.height = height;
    }

    // --- Helpers
    get CENTER() {
        return {
            x: this.width / 2,
            y: this.height / 2
        };
    }

    get TOP_LEFT() {
        return {
            x: 0,
            y: 0
        };
    }

    get TOP_RIGHT() {
        return {
            x: this.width,
            y: 0
        };
    }

    get BOTTOM_LEFT() {
        return {
            x: 0,
            y: this.height
        };
    }

    get BOTTOM_RIGHT() {
        return {
            x: this.width,
            y: this.height
        };
    }

    createRenderable(options = {}, append = false) {
        options.parent = this;
        const renderable = new Renderable(options);
        if (append) {
            this.addRenderable(renderable);
        }
        return renderable;
    }

    addRenderable(renderable) {
        this.renderables.push(renderable);
    }

    removeRenderable(renderable) {
        const index = this.renderables.indexOf(renderable);
        if (index !== -1) {
            this.renderables.splice(index, 1);
        }
    }

    destroy() {
        if(this.__observer) {
            this.__observer.disconnect();
            this.__observer = null;
        }

        for(const renderable of this.renderables) {
            if(typeof renderable.destroy === "function" && !renderable.destroyed) {
                renderable.destroy();
            }
        }

        this.renderables = null;
        super.destroy();
    }
}

/**
 * A WebGL renderer base class for handling graphics rendering.
 * Note that due to the way WebGL is implemented in most browsers, you should use this *very* sparingly,
 * and always preffer reusing for multiple applications if you can and as much as you can.
 * Or you can hit limits and get major performance issues.
 * 
 * @experimental
 * 
 * TIP: If you need to render multiple components, you don't have to create a new renderer for each one!
 * Renderables are independent of the renderer and do not require a separate renderer instance.
 * 
 * All LS renderables are designed to co-exist in the same renderer and share resources, so you can simply have a single one and draw whichever you need.
 * Eg., you can have multiple LS.Timeline or LS.Patcher instances and draw them on the same canvas with a single renderer, and simply update the region
 * where you want them to draw by updating the rect {x,y,width,height} property.
 * Doing this is prefferable and also lowers resource usage as many resources can be shared between renderables.
 */
class WebGLRenderer extends Renderer {
    static backend = "WebGL";

    constructor(options = {}, recycle = false) {
        super(options);

        // Base renderables
        this.renderables = [];

        this.frameScheduler = this.addDestroyable(new LS.Util.FrameScheduler(this.tick.bind(this), { deltaTime: true, ...options?.frameScheduler }));

        this._backgroundColor = new LS.Color(0, 0, 0, 1);

        this.pendingResize = [false, 0, 0];

        this.initialized = false;

        this.lastRenderWidth = 0;
        this.lastRenderHeight = 0;

        this.dimensionsVersion = 0;

        this.vertexShaders = new Map();
        this.fragmentShaders = new Map();

        this.renderTargets = new Set();

        this.x = null;
        this.y = null;
        this.width  = null;
        this.height = null;

        this.width = null;
        this.height = null;

        this.virtual = recycle;

        this.setOptions(options);
        if (options.init !== false) {
            this.init(options);
        }
    }

    /**
     * Schedules a render call for the next frame.
     * This is a non-blocking call and will not immediately render.
     * 
     * ! Note: This uses the default frame scheduler with it's own framerate limit and vsync (good in most cases, calling this function multiple times within a frame will not waste resources).
     * 
     * ! Are you looking for manual rendering? Use tick() or renderOne()
     */
    render(now = false, reEvaluateComponentSizes = false) {
        if (!this.initialized) return;

        this.reEvaluateComponentSizes = reEvaluateComponentSizes;

        if (now) {
            this.tick(0, performance.now(), this.activeCamera);
        }

        this.frameScheduler.schedule();
    }

    init(options = {}) {
        if (this.initialized) return;
        this.initialized = true;

        if(!this.width) this.width   = options.width  || 800;
        if(!this.height) this.height = options.height || 600;

        this.canvas = options.canvas || document.createElement('canvas');
        this.canvas.width  = this.width;
        this.canvas.height = this.height;

        // WebGL2 context
        this.gl = options.gl || this.canvas.getContext('webgl2', {
            antialias: options.antialias !== false,
            alpha:     options.alpha !== false,
            depth:     options.depth !== false,
            stencil:   options.stencil !== false,
            preserveDrawingBuffer: options.preserveDrawingBuffer === true, // this could be awesome if only it wasn't slow apparently
            powerPreference: options.powerPreference || "high-performance",
            failIfMajorPerformanceCaveat: options.failIfMajorPerformanceCaveat !== false,
        });

        if(!this.gl) {
            throw new Error("Failed initializing WebGL2 context. Make sure it is supported by your environment");
        }

        const gl = this.gl;

        gl.clearColor(...this.backgroundColor.floatPixel);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.disable(gl.CULL_FACE);

        // if (cullFace) {
        //     gl.enable(gl.CULL_FACE);
        // } else {
        //     gl.disable(gl.CULL_FACE);
        // }

        if(options.firstFrame !== false) {
            this.frameScheduler.schedule();
        }

        if(options.running) {
            this.frameScheduler.start();
        }
    }

    /**
     * Sets the background color of the renderer.
     * @param {LS.Color|string|number} color - The background color as an LS.Color instance, a CSS color string, or a hex number.
     */
    set backgroundColor(color) {
        this._backgroundColor = color instanceof LS.Color ? color : new LS.Color(color);
        if (this.gl) {
            this.gl.clearColor(...this._backgroundColor.floatPixel);
        }
    }

    get backgroundColor() {
        return this._backgroundColor;
    }

    setOptions(options) {
        if (options.backgroundColor) {
            this.backgroundColor = options.backgroundColor;
        }

        if (options.limitFPS) {
            this.frameScheduler.limitFPS(options.limitFPS);
        }

        super.setOptions(options);
    }

    /**
     * Main render loop
     */
    tick(delta, now, camera, target = null, clear = true) {
        if (!this.initialized) return;

        if (this.pendingResize[0]) {
            this.#resize(this.pendingResize[1], this.pendingResize[2]);
            // console.log(`Renderer resized to ${this.pendingResize[1]}x${this.pendingResize[2]}`);
            this.pendingResize[0] = false;
        }

        if(this.options.blockIfHidden && !this.isVisible()) return;

        const gl = this.gl;
        const canvasWidth = this.width;
        const canvasHeight = this.height;

        if(clear && this.options.clear !== false) {
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        const updatedDimensions = canvasWidth !== this.lastRenderWidth || canvasHeight !== this.lastRenderHeight;
        if (updatedDimensions) {
            this.lastRenderWidth = canvasWidth;
            this.lastRenderHeight = canvasHeight;
            this.viewport(0, 0, canvasWidth, canvasHeight);
            this.dimensionsVersion++;
        }

        if(this.options.preRender) {
            if(this.options.preRender(delta, now, camera, updatedDimensions) === false) {
                this.renderTargets.clear();
                this.reEvaluateComponentSizes = false;
                return;
            }
        }

        if(target) {
            this.renderOne(target, delta, now, camera, false, updatedDimensions);
        } else {
            // const targets = this.renderTargets.size > 0 ? this.renderTargets : this.renderables;
            // for(const renderable of targets) {
            //     this.renderOne(renderable, delta, now, camera, false, updatedDimensions);
            // }

            // Nevermind, we have to redraw everything every frame, since WebGL clears the screen every frame.
            for(const renderable of this.renderables) {
                this.renderOne(renderable, delta, now, camera, false, updatedDimensions);
            }
        }

        this.renderTargets.clear();
        this.reEvaluateComponentSizes = false;
    }

    /**
     * Renders a single renderable.
     * todo: refactor & cleanup
     * @param {*} renderable 
     * @param {*} delta 
     * @param {*} now 
     * @param {*} camera 
     * @param {*} clear 
     * @param {*} updateDimensions 
     * @returns 
     */
    renderOne(renderable, delta = 0, now = null, camera = null, clear = false, updateDimensions = false) {
        if(!renderable || renderable.enabled === false || renderable.destroyed) return;

        if(renderable.isContainer) {
            if(!renderable.renderer) {
                console.warn("Renderable container", renderable, "does not have a renderer. It will not be rendered.");
                return;
            }
            return this.renderScene(renderable, renderable.renderer, renderable.x, renderable.y, renderable.opacity, delta, now, updateDimensions);
        }

        const hasRenderMethod = typeof renderable.renderCallback === "function";

        if(!hasRenderMethod && typeof renderable.render === "function") {
            console.warn("Renderable has a render() method but no renderCallback. It is possible it is using the legacy renderable API, which is no longer supported");
        }

        if(this.reEvaluateComponentSizes && renderable.boundingContainer) {
            this.recomputeBoundingRect(renderable, false);
        }

        if(typeof renderable.rect === "object" || typeof renderable.viewport === "object") {
            const rect = renderable.viewport || renderable.rect;
            if(rect.width < 1 || rect.height < 1) return;
            this.viewport(rect.x, rect.y, rect.width, rect.height);
        }

        if(renderable.renderables || renderable.children) {
            renderable = renderable.renderable || renderable.renderables || renderable.children;
        }

        if(Array.isArray(renderable)) {
            for(const r of renderable) {
                this.renderOne(r, delta, now, camera, clear, updateDimensions);
            }
            return;
        }

        if(!hasRenderMethod) {
            console.warn("Renderable", renderable, "doesn't provide a render method.");
            return;
        }

        const gl = this.gl;
        const cw = this.viewportWidth  || this.width;
        const ch = this.viewportHeight || this.height;

        if(clear) {
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        if(!renderable.dimensionsUpToDate || renderable.dimensionsUpToDate !== this.dimensionsVersion) {
            // Ensure the renderable is informed of the current dimensions
            renderable.dimensionsUpToDate = this.dimensionsVersion;
            updateDimensions = true;
        }

        if(renderable.useProgram !== false && renderable.program !== undefined) {
            gl.useProgram(renderable.program);
        }

        const bindVAO = renderable.bindVAO && renderable.vao;
        if(bindVAO) {
            gl.bindVertexArray(renderable.vao);
        }

        renderable.renderCallback(delta || 0, now || performance.now(), gl, cw, ch, updateDimensions, renderable.uniforms, renderable.attributes, camera? camera.projectionMatrix: this.activeCamera.projectionMatrix);

        if(bindVAO) {
            gl.bindVertexArray(null);
        }
    }

    renderScene(container, renderer, x = container.data[SDi.x], y = container.data[SDi.y], opacity = container.opacity, delta, now, _skipSetup = false) {
        if(!container || !container.children || container.children.length === 0 || (opacity !== null && opacity <= 0)) return;

        let low = 0, high = 0, atlas = null;

        const gl = renderer.renderer.gl;

        // -- Buffers
        let buffers    = renderer.buffers;
        let matrixData = buffers.iMatrix .data; // Transformation matrix
        let colorData  = buffers.iColor ?.data; // Color (optional)
        let uvRectData = buffers.iUVRect?.data; // UV Rect (texture region, optional)

        // Stack for parent matrices
        const stackM = [container.transformMatrix];

        // Stack for parent indices
        const stackI = [0];

        // Stack for parent containers
        const stackC = [container];

        let parentOpacity = opacity;

        let depth = 0;

        /**@glitter_transform inline()*/
        const flush = () => {
            // The goal is to minimize calls to flush()
            renderer.draw(high, atlas, low, high, opacity, x, y, delta, now, _skipSetup);
            _skipSetup = true;
            high  = 0;
            atlas = null;
        }

        while (depth >= 0) {
            const currentContainer = stackC[depth];
            const parentMatrix     = stackM[depth];
            const i                = stackI[depth];
            stackI[depth]++;

            // -- Leave container
            if(i > currentContainer.children.length) {
                if(depth === 0) break;
                depth--;

                // todo: draw to framebuffers for proper container opacity
                parentOpacity /= currentContainer.opacity;
                continue;
            }

            const child = currentContainer.children[i];
            if(!child || !child.visible || child.opacity <= 0) continue;

            // -- Enter container
            if(child.isContainer) {
                if(child.children.length === 0) continue;

                /**@glitter_transform inline*/ LSGL.multiplyMatrix(
                    parentMatrix,
                    child.transformMatrix,
                    child.worldMatrix
                );

                if(child.layoutDirty) {
                    if(typeof child.recompute === "function") {
                        child.recompute();
                    }
                }

                depth++;
                stackM[depth] = child.worldMatrix;
                stackC[depth] = child;
                stackI[depth] = 0;

                parentOpacity *= child.opacity;
                continue;
            }

            if(!child.texture) continue;

            if(child.isInstanceSprite) {
                if(child.next(delta, now)) {
                    stackI[depth]--;
                }
            }

            const data          = child.data;
            const combinedAlpha = data[SDi.a] * data[SDi.alphaMultiplier] * parentOpacity;
            if(combinedAlpha <= 0) continue;

            const texture   = child.texture;
            const glTexture = texture.getGLTexture(gl);

            if(atlas && atlas !== glTexture) {
                flush();
            }

            atlas = glTexture;

            /**
             * @type {Float32Array}
             */
            const matrix = matrixData.subarray(high * 16, high * 16 + 16);

            // TODO: we are now doing a lot of the calculation here which eh, it is not ideal

            // Copy the child transform matrix into the buffer

            const sWidth  = child.width;
            const sHeight = child.height;
            const sDepth  = child.depth;

            // we could use the subarray to upload to GPU directly but idk about w/h and if frequent uploads weren't worse

            const a00 = parentMatrix[0],  a01 = parentMatrix[1],  a02 = parentMatrix[2],  a03 = parentMatrix[3];
            const a10 = parentMatrix[4],  a11 = parentMatrix[5],  a12 = parentMatrix[6],  a13 = parentMatrix[7];
            const a20 = parentMatrix[8],  a21 = parentMatrix[9],  a22 = parentMatrix[10], a23 = parentMatrix[11];
            const a30 = parentMatrix[12], a31 = parentMatrix[13], a32 = parentMatrix[14], a33 = parentMatrix[15];

            const uMatrix = child.transformMatrix;
            const b00 = uMatrix[0] * sWidth,  b01 = uMatrix[1] * sWidth,  b02 = uMatrix[2] * sWidth,  b03 = uMatrix[3];
            const b10 = uMatrix[4] * sHeight, b11 = uMatrix[5] * sHeight, b12 = uMatrix[6] * sHeight, b13 = uMatrix[7];
            const b20 = uMatrix[8] * sDepth,  b21 = uMatrix[9] * sDepth,  b22 = uMatrix[10] * sDepth, b23 = uMatrix[11];
            const b30 = uMatrix[12],          b31 = uMatrix[13],          b32 = uMatrix[14],          b33 = uMatrix[15];

            // Apply parent transform
            matrix[0]  = a00 * b00 + a10 * b01 + a20 * b02 + a30 * b03;
            matrix[1]  = a01 * b00 + a11 * b01 + a21 * b02 + a31 * b03;
            matrix[2]  = a02 * b00 + a12 * b01 + a22 * b02 + a32 * b03;
            matrix[3]  = a03 * b00 + a13 * b01 + a23 * b02 + a33 * b03;

            matrix[4]  = a00 * b10 + a10 * b11 + a20 * b12 + a30 * b13;
            matrix[5]  = a01 * b10 + a11 * b11 + a21 * b12 + a31 * b13;
            matrix[6]  = a02 * b10 + a12 * b11 + a22 * b12 + a32 * b13;
            matrix[7]  = a03 * b10 + a13 * b11 + a23 * b12 + a33 * b13;

            matrix[8]  = a00 * b20 + a10 * b21 + a20 * b22 + a30 * b23;
            matrix[9]  = a01 * b20 + a11 * b21 + a21 * b22 + a31 * b23;
            matrix[10] = a02 * b20 + a12 * b21 + a22 * b22 + a32 * b23;
            matrix[11] = a03 * b20 + a13 * b21 + a23 * b22 + a33 * b23;

            matrix[12] = a00 * b30 + a10 * b31 + a20 * b32 + a30 * b33;
            matrix[13] = a01 * b30 + a11 * b31 + a21 * b32 + a31 * b33;
            matrix[14] = a02 * b30 + a12 * b31 + a22 * b32 + a32 * b33;
            matrix[15] = a03 * b30 + a13 * b31 + a23 * b32 + a33 * b33;

            const f4h = high * 4;

            if(colorData) {
                colorData[f4h + 0] = data[SDi.r];
                colorData[f4h + 1] = data[SDi.g];
                colorData[f4h + 2] = data[SDi.b];
                colorData[f4h + 3] = combinedAlpha;
            }

            if(uvRectData) {
                const uvRect = texture.region;
                if(uvRect) {
                    uvRectData[f4h + 0] = (uvRect[0] || 0) / texture.imageWidth;
                    uvRectData[f4h + 1] = (uvRect[1] || 0) / texture.imageHeight;
                    uvRectData[f4h + 2] = (uvRect[2] || 0) / texture.imageWidth;
                    uvRectData[f4h + 3] = (uvRect[3] || 0) / texture.imageHeight;
                } else {
                    uvRectData[f4h + 0] = 0;
                    uvRectData[f4h + 1] = 0;
                    uvRectData[f4h + 2] = 1;
                    uvRectData[f4h + 3] = 1;
                }
            }

            high++;

            // If we reach the max batch size, draw the current batch and reset for the next one
            if(high > renderer.maxBatchSize) {
                flush();
            }
        }

        if(high > 0) flush();
    }

    renderMany(renderables, delta = 0, now = null, camera = null, clear = false) {
        for(const renderable of renderables) {
            this.renderOne(renderable, delta, now, camera, clear);
            clear = false; // Only clear on the first renderable
        }
    }

    schedule(renderable){
        this.renderTargets.add(renderable);
        this.render();
    }

    viewport(x, y, width, height) {
        if(typeof x === "object" && x !== null) {
            width = x.width;
            height = x.height;
            y = x.y;
            x =  x.x;
        }

        // seriously, even here
        y = this.height - (y + height);

        const gl = this.gl;
        gl.viewport(x, y, width, height);

        this.viewportX = x;
        this.viewportY = y;
        this.viewportWidth = width;
        this.viewportHeight = height;

        // eeh? it works..
        this.activeCamera.update(0, width, height, 0, -1, 1);
    }

    #resize(width, height) {
        this.width = width;
        this.height = height;

        if(this.options.accountForPixelRatio) {
            const pixelRatio = window.devicePixelRatio || 1;
            width  *= pixelRatio;
            height *= pixelRatio;
        }

        console.log(`Resizing renderer to ${width}x${height}`);

        if (width !== undefined) this.canvas.width = width;
        if (height !== undefined) this.canvas.height = height;

        const cw = this.canvas.width;
        const ch = this.canvas.height;

        if (cw === 0 || ch === 0) return;

        this.gl.viewport(0, 0, cw, ch);
        this.quickEmit("resized", cw, ch);
    }

    resize(width, height, now = false) {
        this.pendingResize[0] = !now;
        if(!now) {
            this.pendingResize[1] = width;
            this.pendingResize[2] = height;
        }

        this.quickEmit("resize", width, height, this.canvas?.width, this.canvas?.height);

        if (!this.initialized) return;
        if (now) {
            this.#resize(width, height);
        } else if (this.options.renderOnResize !== false) {
            this.render();
        }
    }

    /**
     * Checks if the renderer is visible in the DOM.
     * Note that this can be expensive to call frequently.
     * @returns {Boolean} True if the renderer is visible, false otherwise
     */
    isVisible() {
        if (!this.canvas) return false;
        if (this.width === 0 || this.height === 0 || document.hidden || !this.canvas.isConnected) return false;
        if (Element.prototype.checkVisibility && !this.canvas.checkVisibility()) return false;
        // if (this.canvas.offsetParent === null) return false;
        // if (this.canvas.clientWidth === 0 || this.canvas.clientHeight === 0) return false;
        return true;
    }

    /**
     * Clear the screen
    */
    clear(enum_ = this.gl.COLOR_BUFFER_BIT) {
        this.gl.clear(enum_);
    }

    compileShader(type, name, source) {
        return compileShader(this, type, source, name);
    }

    compileProgram(vertexSource, fragmentSource) {
        return createProgram(this, vertexSource, fragmentSource);
    }

    createBuffer(data, cellSize = 1, usage = this.gl.STATIC_DRAW) {
        return new WebGLBuffer(this, data, cellSize, usage);
    }

    destroyShader(shaderKey) {
        if (!shaderKey) return;

        const shader = this.vertexShaders.get(shaderKey) || this.fragmentShaders.get(shaderKey);
        if (!shader) return;

        this.vertexShaders.delete(shaderKey);
        this.fragmentShaders.delete(shaderKey);

        const gl = this.gl;
        gl.deleteShader(shader);
    }

    destroyProgram(program) {
        if (!program) return;
        const gl = this.gl;
        gl.deleteProgram(program);
    }

    /**
     * Sets the scissor box for clipping rendering.
     * Flips the y-coordinate so you can use the proper expected top-left origin coordinates.
     * @param {*} x
     * @param {*} y 
     * @param {*} width - If undefined, will use the remaining width of the canvas from x
     * @param {*} height - If undefined, will use the remaining height of the canvas from y
     */
    scissor(x, y, width, height) {
        if(width === undefined) {
            width = this.width - x;
        }

        if(height === undefined) {
            height = this.height - y;
        }

        const gl = this.gl;
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(x, this.height - y - height, width, height);
    }

    endScissor() {
        const gl = this.gl;
        gl.disable(gl.SCISSOR_TEST);
    }

    recomputeBoundingRect(renderable, renderNow = false) {
        if(!renderable || !renderable.boundingContainer) return;

        const rect = renderable.boundingContainer.getBoundingClientRect();
        renderable.rect.x = rect.left;
        renderable.rect.y = rect.top;
        renderable.rect.width = rect.width;
        renderable.rect.height = rect.height;

        if(renderable.compositeDOMLayers) {
            for(const layer of renderable.compositeDOMLayers) {
                const element = layer.element || layer;
                const offsetX = layer.offset?.x || 0;
                const offsetY = layer.offset?.y || 0;
                const offsetLeft = layer.offset?.left || 0;
                const offsetTop = layer.offset?.top || 0;
                const offsetRight = layer.offset?.right || 0;
                const offsetBottom = layer.offset?.bottom || 0;

                element.style.position = "fixed";
                element.style.left = "0px";
                element.style.top = "0px";
                element.style.transform = "translate3d(" + `${rect.x + offsetLeft + offsetX}px, ${rect.y + offsetTop + offsetY}px, 0px)`;
                element.style.width = `${rect.width - offsetLeft - offsetRight}px`;
                element.style.height = `${rect.height - offsetTop - offsetBottom}px`;
            }
        }

        if(renderNow) {
            // this.renderOne(renderable, 0, performance.now(), this.activeCamera, false, true);
            this.schedule(renderable);
        }
    }

    addRenderable(renderable) {
        if(!renderable) return;

        if(renderable.boundingContainer) {
            renderable._resizeObserver = null;
            renderable._resizeObserver = new ResizeObserver(() => {
                this.recomputeBoundingRect(renderable, true);
            });

            renderable._resizeObserver.observe(renderable.boundingContainer);

            renderable._intersectionObserver = new IntersectionObserver((entries) => {
                for(const entry of entries) {
                    const isVisible = entry.isIntersecting;
                    renderable.enabled = isVisible;
                    this.render(); //todo:

                    if(renderable.compositeDOMLayers) {
                        for(const layer of renderable.compositeDOMLayers) {
                            const element = layer.element || layer;

                            element.style.display = isVisible? "block": "none";
                            if(!element.isConnected) LS._compositeLayer.appendChild(element);
                        }
                    }
                }
            }, { threshold: 0 });

            renderable._intersectionObserver.observe(renderable.boundingContainer);
        }

        this.renderables.push(renderable);
        return renderable;
    }

    destroyRenderable(renderable) {
        if(!renderable) return;

        if(renderable.renderables || renderable.children) {
            for(const r of renderable.renderables || renderable.children) {
                this.destroyRenderable(r);
            }
        }

        if(Array.isArray(renderable)) {
            for(const r of renderable) {
                this.destroyRenderable(r);
            }
        }

        if(typeof renderable.destroy === "function" && !renderable.destroyed) {
            renderable.destroy();
        } else {
            console.warn("Renderable does not have a destroy method!");
        }

        if(renderable.program) {
            this.destroyProgram(renderable.program);
            renderable.program = null;
        }

        if(renderable.vao) {
            this.gl.deleteVertexArray(renderable.vao);
            renderable.vao = null;
        }

        if(renderable.buffers) {
            for(const key in renderable.buffers) {
                const buffer = renderable.buffers[key];
                if(buffer instanceof WebGLBuffer) {
                    buffer.destroy();
                }
            }
            renderable.buffers = null;
        }

        if(renderable._resizeObserver) {
            renderable._resizeObserver.disconnect();
            renderable._resizeObserver = null;
        }

        if(renderable._intersectionObserver) {
            renderable._intersectionObserver.disconnect();
            renderable._intersectionObserver = null;
        }

        if(renderable.compositeDOMLayers) {
            for(const layer of renderable.compositeDOMLayers) {
                const element = layer.element || layer;
                if(element.isConnected) element.remove();
            }
            renderable.compositeDOMLayers = null;
        }

        const index = this.renderables.indexOf(renderable);
        if(index !== -1) {
            this.renderables.splice(index, 1);
        }

        this.renderTargets.delete(renderable);
    }

    destroy() {
        if(this.canvas && !this.options.canvas) {
            this.canvas.remove();
            this.canvas = null;
        }

        if(this.frameScheduler) {
            this.frameScheduler.destroy();
            this.frameScheduler = null;
        }

        for(const shader of this.vertexShaders.keys()) {
            this.destroyShader(shader);
        }
        this.vertexShaders.clear();

        for(const shader of this.fragmentShaders.keys()) {
            this.destroyShader(shader);
        }
        this.fragmentShaders.clear();

        this.activeCamera = null;

        this.initialized = false;
        this.width = null;
        this.height = null;
        this.backgroundColor = null;
        this.pendingResize = null;
        this.options = null;
        this.renderTargets.clear();
        super.destroy();

        // Destroy the WebGL context last to ensure all resources are cleaned up first
        if(this.gl) {
            this.gl.getExtension('WEBGL_lose_context')?.loseContext();
            this.gl = null;
        }
        this.renderTargets = null;
    }
}

const GL_ENUMS = WebGL2RenderingContext.prototype;
function bufferType(type, strict = true) {
    if(typeof type === "string") {
        type = type.toLowerCase();
    } else if(typeof type === "number") {
        return type;
    } else {
        type = type?.constructor;
    }

    switch(type) {
        case "float": case "float32": case "mat4": case "f32":
        case Float32Array:
            return GL_ENUMS.FLOAT;

        case "int": case "int32": case "i32":
        case Int32Array:
            return GL_ENUMS.INT;

        case "uint": case "uint32": case "u32":
        case Uint32Array:
            return GL_ENUMS.UNSIGNED_INT;

        case "short": case "int16": case "i16":
        case Int16Array:
            return GL_ENUMS.SHORT;

        case "ushort": case "uint16": case "u16":
        case Uint16Array:
            return GL_ENUMS.UNSIGNED_SHORT;

        case "byte": case "int8": case "i8":
        case Int8Array:
            return GL_ENUMS.BYTE;

        case "ubyte": case "uint8": case "u8":
        case Uint8Array:
            return GL_ENUMS.UNSIGNED_BYTE;

        case "double": case "float64": case "f64":
        case Float64Array:
            if(strict) throw new Error("WebGL does not support Float64Array for vertex attributes.");

        default:
            if(strict) throw new Error("Could not determine the correct WebGL type for the provided data. Please specify the 'type' parameter explicitly.");
            console.warn(`Unknown buffer type "${type}". Defaulting to Float32Array.`);
            return GL_ENUMS.FLOAT;
    }
}

function bufferFrom(type, size) {
    if(typeof type === "string") {
        type = bufferType(type, false);
    }

    switch(type) {
        case GL_ENUMS.FLOAT:
            return new Float32Array(size);
        case GL_ENUMS.INT:
            return new Int32Array(size);
        case GL_ENUMS.UNSIGNED_INT:
            return new Uint32Array(size);
        case GL_ENUMS.SHORT:
            return new Int16Array(size);
        case GL_ENUMS.UNSIGNED_SHORT:
            return new Uint16Array(size);
        case GL_ENUMS.BYTE:
            return new Int8Array(size);
        case GL_ENUMS.UNSIGNED_BYTE:
            return new Uint8Array(size);
        default:
            console.warn(`Unknown buffer type "${type}". Defaulting to Float32Array.`);
            return new Float32Array(size);
    }
}

/**
 * A WebGL renderable base class for handling graphics rendering.
 */
class Renderable {
    /**
     * @type {WebGLRenderer}
     */
    renderer;

    constructor(options = {}) {
        this.renderer = options.renderer || options.parent;

        if(!this.renderer || !(this.renderer instanceof Renderer)) throw new Error("Renderable requires a LS.WebGLRenderer instance in options.");
        if(!this.renderer.gl) throw new Error("Renderable requires a GL context.");

        options.fragment ??= options.frag ?? options.fragmentShader;
        options.vertex   ??= options.vert ?? options.vertexShader;
        options.fragment ??= LS.GL.shaders.basic_color_fragment;

        const gl = this.renderer.gl;
        this.program = options.program || (options.vertex && options.fragment ? createProgram(this.renderer, options.vertex, options.fragment) : null);

        if(!this.program) {
            throw new Error("Renderable requires a shader program or vertex and fragment shaders.");
        }

        this.uniforms = {};
        this.attributes = {};
        this.buffers = {};

        this.addUniforms(options.uniforms);
        this.addAttributes(options.attributes);

        this.enabled = options.enabled !== undefined ? options.enabled : true;

        this.dimensionsUpToDate = false;

        // We can create a default VAO helper for this renderable
        if(options.vao) {
            this.vao = gl.createVertexArray();
            this.bindVAO = true;
        }

        this.useProgram = options.useProgram !== undefined ? options.useProgram : true;

        if(options.onSetup || typeof options.bind === "object") {
            if(this.vao) gl.bindVertexArray(this.vao);

            // Bind some defined buffer layouts to attributes
            if(typeof options.bind === "object") {
                for(const key in options.bind) {
                    const a = this.addAttribute(key);

                    if(a !== null && a !== -1) {
                        const buffer = options.bind[key];
                        if(buffer instanceof WebGLBuffer) {
                            this.buffers[key] = buffer.bindToAttribute(a);
                        } else if(typeof buffer === "number") {
                            this.buffers[key] = this.renderer.createBuffer(buffer * 1, 1, gl.DYNAMIC_DRAW).bindToAttribute(a, 1, null, false, 0, 0, 1);
                        } else if(typeof buffer === "object" && buffer !== null) {
                            buffer.cellSize ??= 1;

                            let data = buffer.data || buffer.size;

                            if(typeof data === "number") {
                                data = bufferFrom(buffer.type || "float", data * buffer.cellSize);
                            }

                            this.buffers[key] = this.renderer.createBuffer(data, buffer.cellSize, buffer.usage || gl.DYNAMIC_DRAW).bindToAttribute(a, buffer.cellSize, buffer.type || null, !!buffer.normalized, buffer.stride, buffer.offset, buffer.divisor);
                        } else {
                            console.warn(`Invalid buffer for attribute "${key}". Expected a WebGLBuffer, number, or object with buffer data.`);
                        }
                    }
                }
            }

            if(options.debug) {
                const count = gl.getProgramParameter(this.program, gl.ACTIVE_ATTRIBUTES);
                for (let i = 0; i < count; i++) {
                    const info = gl.getActiveAttrib(this.program, i);
                    const loc = gl.getAttribLocation(this.program, info.name);

                    console.log({
                        name: info.name,
                        location: loc,
                        type: info.type,
                        size: info.size,
                    });
                }
                for (let i = 0; i < gl.getParameter(gl.MAX_VERTEX_ATTRIBS); i++) {
                    console.log(i, {
                        enabled: gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_ENABLED),
                        integer: gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_INTEGER),
                        size: gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_SIZE),
                        type: gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_TYPE),
                        stride: gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_STRIDE),
                    });
                }
            }

            if(typeof options.onSetup === "function") {
                options.onSetup.call(this, gl, this.program, this.uniforms, this.attributes, options);
            }

            if(this.vao) {
                gl.bindVertexArray(null);
            }
        }

        if(options.onRender) {
            this.renderCallback = options.onRender.bind(this);
        }

        this.renderer.once("destroy", this.__parentDestroyHandler = () => this.destroy());
    }

    renderCallback(delta, now, gl, width, height, updatedDimensions, uniforms, attributes, projectionMatrix) {
        // Override in subclass or provide a render function in the constructor
    }

    addUniforms(uniforms) {
        if(!uniforms) return;

        if(Array.isArray(uniforms)) {
            for(const key of uniforms) {
                this.addUniform(key);
            }
        } else if(typeof uniforms === "object") {
            for(const key in uniforms) {
                this.addUniform(key);
            }
        } else if(typeof uniforms === "string") {
            this.addUniform(uniforms);
        }
    }

    addAttributes(attributes) {
        if(!attributes) return;

        if(Array.isArray(attributes)) {
            for(const key of attributes) {
                this.addAttribute(key);
            }
        } else if(typeof attributes === "object") {
            for(const key in attributes) {
                this.addAttribute(key);
            }
        } else if(typeof attributes === "string") {
            this.addAttribute(attributes);
        }
    }

    addAttribute(key) {
        if(!key) return;
        if(typeof key !== "string") throw new Error(`Invalid location key: expected a string, got ${typeof key}.`);
        if(this.attributes[key] !== undefined) return this.attributes[key];
        return this.attributes[key] = this.renderer.gl.getAttribLocation(this.program, key);
    }

    addUniform(key) {
        if(!key) return;
        if(typeof key !== "string") throw new Error(`Invalid location key: expected a string, got ${typeof key}.`);
        if(this.uniforms[key] !== undefined) return this.uniforms[key];
        return this.uniforms[key] = this.renderer.gl.getUniformLocation(this.program, key);
    }

    getUniformLocation(key) {
        return this.uniforms[key] || (this.uniforms[key] = this.renderer.gl.getUniformLocation(this.program, key)) || null;
    }

    getAttributeLocation(key) {
        return this.attributes[key] || (this.attributes[key] = this.renderer.gl.getAttribLocation(this.program, key)) || null;
    }

    /**
     * Destroy the renderable and clean up resources.
     */
    destroy() {
        if(this.destroyed) return;

        if(this.program) {
            this.renderer.destroyProgram(this.program);
            this.program = null;
        }

        if(this.uniforms) {
            for(const key in this.uniforms) {
                this.uniforms[key] = null;
            }
            this.uniforms = null;
        }

        if(this.attributes) {
            for(const key in this.attributes) {
                this.attributes[key] = null;
            }
            this.attributes = null;
        }

        if(this.renderer && !this.renderer.destroyed) {
            this.renderer.off("destroy", this.__parentDestroyHandler);

            // TODO:
            this.renderer.renderables = this.renderer.renderables.filter(r => r !== this);
        }

        if(this.buffers) {
            for(const key in this.buffers) {
                const buffer = this.buffers[key];
                if(buffer && typeof buffer.destroy === "function") {
                    buffer.destroy();
                }
                this.buffers[key] = null;
            }
            this.buffers = null;
        }

        if(this.vao) {
            this.renderer.gl.deleteVertexArray(this.vao);
            this.vao = null;
        }

        this.renderer = null;
        this.__parentDestroyHandler = null;

        this.destroyed = true;
    }
}

/**
 * A simple camera class.
 * Work in progress
 */
class Camera {
    static ORTHOGRAPHIC = 0;
    static PERSPECTIVE = 1;

    /**
     * Creates a new Camera instance.
     * @param {number} type - The type of camera (Camera.ORTHOGRAPHIC or Camera.PERSPECTIVE)
     * @param {number} left - The left clipping plane or field of view (for perspective)
     * @param {number} right - The right clipping plane or aspect ratio (for perspective)
     * @param {number} bottom - The bottom clipping plane or near clipping plane (for perspective)
     * @param {number} top - The top clipping plane or far clipping plane (for perspective)
     * @param {number} near - The near clipping plane
     * @param {number} far - The far clipping plane
     * @experimental
     */
    constructor(type = Camera.ORTHOGRAPHIC, left, right, bottom, top, near, far) {
        this.type = type;
        this.left = left;
        this.right = right;
        this.bottom = bottom;
        this.top = top;
        this.near = near;
        this.far = far;

        this.projectionMatrix = new Float32Array(16);
        this.update(left, right, bottom, top, near, far);
    }

    update(left, right, bottom, top, near, far) {
        if (this.type === Camera.ORTHOGRAPHIC) {
            Camera.ortho(this.projectionMatrix, left, right, bottom, top, near, far);
        } else {
            Camera.perspective(this.projectionMatrix, left, right, bottom, top, near, far);
        }
    }

    setOrtho(left = null, right = null, bottom = null, top = null, near = null, far = null) {
        this.type = Camera.ORTHOGRAPHIC;
        if( left   !== null ) this.left = left;
        if( right  !== null ) this.right = right;
        if( bottom !== null ) this.bottom = bottom;
        if( top    !== null ) this.top = top;
        if( near   !== null ) this.near = near;
        if( far    !== null ) this.far = far;

        Camera.ortho(this.projectionMatrix, this.left, this.right, this.bottom, this.top, this.near, this.far);
    }

    setPerspective(fov = null, aspect = null, near = null, far = null) {
        this.type = Camera.PERSPECTIVE;
        if( fov    !== null ) this.fov = fov;
        if( aspect !== null ) this.aspect = aspect;
        if( near   !== null ) this.near = near;
        if( far    !== null ) this.far = far;

        Camera.perspective(this.projectionMatrix, this.fov, this.aspect, this.near, this.far);
    }

    /**
     * Creates an orthographic projection matrix.
     * @param {*} out - The output matrix
     * @param {*} left - The left clipping plane
     * @param {*} right - The right clipping plane
     * @param {*} bottom - The bottom clipping plane
     * @param {*} top - The top clipping plane
     * @param {*} near - The near clipping plane
     * @param {*} far - The far clipping plane
     * @returns The orthographic projection matrix
     */
    static ortho(out, left, right, bottom, top, near, far) {
        out[0] = 2 / (right - left);
        out[1] = 0;
        out[2] = 0;
        out[3] = 0;

        out[4] = 0;
        out[5] = 2 / (top - bottom);
        out[6] = 0;
        out[7] = 0;

        out[8] = 0;
        out[9] = 0;
        out[10] = -2 / (far - near);
        out[11] = 0;

        out[12] = -(right + left) / (right - left);
        out[13] = -(top + bottom) / (top - bottom);
        out[14] = -(far + near) / (far - near);
        out[15] = 1;
        return out;
    }

    static perspective(out, fov, aspect, near, far) {
        const f = 1.0 / Math.tan(fov / 2);
        const nf = 1 / (near - far);

        out[0] = f / aspect;
        out[1] = 0;
        out[2] = 0;
        out[3] = 0;

        out[4] = 0;
        out[5] = f;
        out[6] = 0;
        out[7] = 0;

        out[8] = 0;
        out[9] = 0;
        out[10] = (far + near) * nf;
        out[11] = -1;

        out[12] = 0;
        out[13] = 0;
        out[14] = (2 * far * near) * nf;
        out[15] = 0;
        return out;
    }
}

/**
 * A wrapper that manages a WebGL buffer and its associated data.
 * It tracks dirty regions and only updates those regions when necessary.
 * It also provides helpers for binding the buffer to vertex attributes.
 */
class WebGLBuffer {
    constructor(renderer, data, cellSize = 1, usage) {
        if(!(renderer instanceof WebGLRenderer)) {
            throw new Error("GPUBuffer constructor expects a WebGLRenderer instance as the first argument.");
        }

        this.isUInt = data instanceof Uint8Array || data instanceof Uint16Array || data instanceof Uint32Array;
        this.isInt = data instanceof Int8Array || data instanceof Int16Array || data instanceof Int32Array;

        if(this.isInt || this.isUInt || data instanceof Float32Array || data instanceof Float64Array) {
            this.data = data;
        } else if(data instanceof ArrayBuffer || typeof data === 'number' || data instanceof Array) {
            this.data = new Float32Array(data);
        } else {
            throw new Error("GPUBuffer constructor expects a typed array constructor, an ArrayBuffer, a number (size), or an array as the second argument.");
        }

        this.renderer = renderer;
        this.gl = renderer.gl;

        this.byteSize = this.data.BYTES_PER_ELEMENT;
        this.cellSize = cellSize || 1;
        this.instanceSize = this.cellSize * this.byteSize;

        this.buffer = this.gl.createBuffer();

        this.usage = usage || this.gl.DYNAMIC_DRAW;
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, this.data.byteLength, this.usage);

        this.lowestDirty = 0;
        this.highestDirty = this.data.length;

        renderer.once('destroy', this.__parentDestroyed = () => this.delete());
    }

    bindToAttribute(location, size = this.cellSize, type = null, normalized = false, stride = 0, offset = 0, divisor = 1) {
        if(typeof type !== 'number' && type !== "mat4") {
            type = bufferType((type && typeof type === 'string')? type: this.data);
        }

        WebGLBuffer.bindToAttribute(this.gl, this.buffer, this.isInt || this.isUInt, location, size, type, normalized, stride, offset, divisor);
        return this;
    }

    static bindToAttribute(gl, buffer, isInt, location, size = this.cellSize, type = null, normalized = false, stride = 0, offset = 0, divisor = 1) {
        if(type === "mat4") {
            // Mat4 attributes are special and require 4 attribute locations
            for (let i = 0; i < 4; i++) {
                WebGLBuffer.bindToAttribute(gl, buffer, isInt, location + i, 4, gl.FLOAT, normalized, 64, offset + i * 16, 1);
            }
            return;
        }

        console.log("bindToAttribute: location=" + location + ", size=" + size + ", type=" + type + ", normalized=" + normalized + ", stride=" + stride + ", offset=" + offset + ", divisor=" + divisor);

        if(typeof location !== 'number' || location < 0) {
            throw new Error("bindToAttribute expects a valid attribute location (non-negative integer) as the first argument. Got: " + location);
        }

        if(typeof size !== 'number' || size <= 0) {
            throw new Error("bindToAttribute expects a valid size (positive integer) as the second argument. Got: " + size);
        }

        if(typeof type !== 'number') {
            type = bufferType(type);
            if(typeof type !== 'number') {
                throw new Error("bindToAttribute could not determine the WebGL type for the buffer data. Please provide a valid WebGL type as the third argument.");
            }
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(location);

        // while (gl.getError() !== gl.NO_ERROR) {}
        if(isInt && normalized === false) {
            gl.vertexAttribIPointer(location, size, type, stride, offset);
        } else {
            gl.vertexAttribPointer(location, size, type, normalized, stride, offset);
        }
        // console.log(gl.getError());

        // Verify that it is active:
        const isEnabled = gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_ENABLED);
        if (!isEnabled) {
            console.warn(`bindToAttribute: Failed to enable vertex attribute at location ${location}.`);
        }

        if (divisor !== undefined) {
            gl.vertexAttribDivisor(location, divisor); // For instanced rendering
        }
    }

    /**
     * Sets a value in the buffer at the specified index and marks the region as dirty for updating.
     * Does nothing if the value is the same, so skipping updates if the value hasn't changed.
     * 
     * This method tracks and compares the dirty range for you, guaranteeing minimal GPU updates, but also has extra CPU overhead per set.
     * If you do a lot of writes and want to track manually, you can set the value directly in the `data` array and then call `update()` with the range you want to update or set lowestDirty and highestDirty.
     * 
     * @param {number|Array|TypedArray|Buffer} value The value to set.
     * @param {number} offset The index in the buffer to set the value at.
     * @returns {void}
     * 
     * Warning: This method is high level and may not be the most efficient. Avoid in performance critical code paths.
     */
    set(value, offset = 0) {
        if(Array.isArray(value) || value instanceof ArrayBuffer || value instanceof Float32Array || value instanceof Uint8Array || value instanceof Uint16Array || value instanceof Uint32Array || value instanceof Int8Array || value instanceof Int16Array || value instanceof Int32Array) {
            if(value.length + offset > this.data.length) {
                throw new Error("set expects the value array to fit within the buffer. Value length: " + value.length + ", offset: " + offset + ", buffer length: " + this.data.length);
            }

            this.data.set(value, offset);

            this.lowestDirty = Math.min(this.lowestDirty, offset);
            this.highestDirty = Math.max(this.highestDirty, offset + value.length);
            return;
        }

        if(this.data[offset] === value) return;
        this.data[offset] = value;
        if (offset < this.lowestDirty) this.lowestDirty = offset;
        if (offset + 1 > this.highestDirty) this.highestDirty = offset + 1;
    }

    setWithStride(value, offset = 0, stride = this.cellSize) {
        this.set(value, offset * stride);
    }

    bind() {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    }

    /**
     * Updates the GPU buffer with the data from the CPU buffer.
     * If `from` and `to` are provided, only that range will be updated.
     * If `from` is true, the entire buffer will be updated.
     * If `from` and `to` are not provided, it will only update the range automatically marked as dirty when using .set() or do nothing if nothing changed (default).
     * 
     * @param {*} from - The starting index of the range to update, or true to update the entire buffer, or undefined to update the dirty range.
     * @param {*} to - The ending index of the range to update (exclusive), or undefined to update the dirty range.
     * @returns 
     */
    update(from, to) {
        if(from === true) {
            from = 0;
            to = this.data.length;
        } else if(from === undefined && to === undefined) {
            from = this.lowestDirty;
            to = this.highestDirty;
        }

        if(from >= to) return;

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);

        if(from === 0 && to === this.data.length) {
            this.gl.bufferData(this.gl.ARRAY_BUFFER, this.data, this.usage);
        } else {
            const subData = this.data.subarray(from, to);
            this.gl.bufferSubData(this.gl.ARRAY_BUFFER, from * this.byteSize, subData);
        }

        this.lowestDirty = this.data.length;
        this.highestDirty = 0;
    }

    updateWithStride(from, to, stride = this.cellSize) {
        return this.update(from * stride, to * stride);
    }

    /**
     * Resize the buffer to a new size. This will create a new typed array and copy the existing data to it.
     * @param {*} newSize - The new size of the buffer. Must be a positive integer.
     * @param {boolean} keepData - Whether to keep the existing data when resizing or start with an empty buffer.
     * @returns {void}
     * 
     * Warning: This method will invalidate existing references to the old data array.
     * Also, this is an expensive operation, use only if absolutely necessary, never use this as a way to change the buffer size dynamically (eg. for instancing you can simply choose how many instances to render without resizing the buffer).
     */
    resize(newSize, keepData = true) {
        if(newSize <= 0) {
            throw new Error("resize expects a positive integer as the new size.");
        }

        const newData = new this.data.constructor(newSize);
        if(keepData) {
            newData.set(this.data.subarray(0, Math.min(this.data.length, newSize)));
        }

        this.data = newData;

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, this.data.byteLength, this.usage);

        this.lowestDirty = 0;
        this.highestDirty = this.data.length;
    }

    resizeCells(newCellCount, keepData = true) {
        if(newCellCount <= 0) {
            throw new Error("resizeCells expects a positive integer as the new cell count.");
        }

        const newSize = newCellCount * this.cellSize;
        this.resize(newSize, keepData);
    }

    doubleSize(keepData = true) {
        const newSize = this.data.length * 2;
        this.resize(newSize, keepData);
    }

    clear() {
        this.data.fill(0);
        this.lowestDirty = 0;
        this.highestDirty = this.data.length;
    }

    replace(newData) {
        if(!(newData instanceof this.data.constructor)) {
            throw new Error("replace expects a typed array of the same type as the original data.");
        }

        this.data = newData;

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, this.data.byteLength, this.usage);

        this.lowestDirty = 0;
        this.highestDirty = this.data.length;
    }

    delete() {
        if (this.buffer) {
            this.gl.deleteBuffer(this.buffer);
            this.buffer = null;
        }

        if (this.data) {
            this.data = null;
        }

        this.gl = null;
        this.renderer = null;
        this.lowestDirty = 0;
        this.highestDirty = 0;
        this.byteSize = 0;
        this.cellSize = 0;
        this.instanceSize = 0;
        this.usage = null;

        this.renderer.off('destroy', this.__parentDestroyed);
        this.destroyed = true;
    }
}

const sharedColorConversionBuffer = new Uint8Array(4);
const roundedBoxSDF = `float roundedBoxSDF(vec2 CenterPosition, vec2 Size, float Radius) {\nreturn length(max(abs(CenterPosition)-Size+Radius,0.0))-Radius;\n}`;

/**
 * Temporary & should be inlined at compile time
 * Sprite data indices/enums
 * 
 * @enum {number}
 * @readonly
 * @constant
 */
const SDi = {
    // --- Transforms
    x: 0,                 // f32
    y: 1,                 // f32
    z: 2,                 // f32
    rotationX: 3,         // f32
    rotationY: 4,         // f32
    rotationZ: 5,         // f32
    scaleX: 6,            // f32
    scaleY: 7,            // f32
    scaleZ: 8,            // f32
    anchorX: 9,           // f32
    anchorY: 10,          // f32
    anchorZ: 11,          // f32
    offsetX: 12,          // f32
    offsetY: 13,          // f32
    offsetZ: 14,          // f32
    width: 15,            // f32
    height: 16,           // f32
    depth: 17,            // f32
    transformFlags: 18,   // u32
    rotationOrder: 19,    // u8

    // --- Display
    visible: 20,          // 1b
    r: 21,                // u8
    g: 22,                // u8
    b: 23,                // u8
    a: 24,                // u8
    alphaMultiplier: 25,  // f32
    blendMode: 26,        // u8

    // --- Flags
    ANCHOR_AFFECTS_POSITION: 1,

    ORDER_XYZ: 0,
    ORDER_XZY: 1,
    ORDER_YXZ: 2,
    ORDER_YZX: 3,
    ORDER_ZXY: 4,
    ORDER_ZYX: 5
};

/**
 * Rotates & scales a 4x4 column-major transformation matrix based on the provided rotation and scale parameters.
 * 
 * @param {array} spriteData - An array containing these values in the order: [x, y, z, rx, ry, rz, sx, sy, sz].
 * @param {Float32Array} out - An optional Float32Array to store the resulting matrix.
 * @returns {Float32Array} The resulting transformation matrix.
 */
function rotateMatrix(spriteData, out = new Float32Array(16)) {
    // -- Rotation and scale
    const rx = spriteData[SDi.rotationX];
    const ry = spriteData[SDi.rotationY];
    const rz = spriteData[SDi.rotationZ];

    const sx = spriteData[SDi.scaleX];
    const sy = spriteData[SDi.scaleY];
    const sz = spriteData[SDi.scaleZ];

    const cx = Math.cos(rx), sX = Math.sin(rx);
    const cy = Math.cos(ry), sY = Math.sin(ry);
    const cz = Math.cos(rz), sZ = Math.sin(rz);

    const rotationOrder = spriteData[SDi.rotationOrder] || SDi.ORDER_XYZ;

    switch (rotationOrder) {
        case SDi.ORDER_ZYX:
            out[0] = cz * cy * sx;
            out[1] = sZ * cy * sx;
            out[2] = -sY * sx;

            out[4] = (cz * sY * sX - sZ * cx) * sy;
            out[5] = (sZ * sY * sX + cz * cx) * sy;
            out[6] = cy * sX * sy;

            out[8] = (cz * sY * cx + sZ * sX) * sz;
            out[9] = (sZ * sY * cx - cz * sX) * sz;
            out[10] = cy * cx * sz;
            break;

        case SDi.ORDER_ZXY:
            out[0] = (cz * cy + sZ * sY * sX) * sx;
            out[1] = sZ * cx * sx;
            out[2] = (cz * -sY + sZ * cy * sX) * sx;

            out[4] = (-sZ * cy + cz * sY * sX) * sy;
            out[5] = cz * cx * sy;
            out[6] = (sZ * sY + cz * cy * sX) * sy;

            out[8] = cy * cx * sz;
            out[9] = -sX * sz;
            out[10] = sY * cx * sz;
            break;

        case SDi.ORDER_YXZ:
            out[0] = cy * cx * sx;
            out[1] = sZ * cx * sx;
            out[2] = -sY * sx;

            out[4] = (cy * sY * sX - sZ * cx) * sy;
            out[5] = (sZ * sY * sX + cy * cx) * sy;
            out[6] = cy * sX * sy;

            out[8] = (cy * sY * cx + sZ * sX) * sz;
            out[9] = (sZ * sY * cx - cy * sX) * sz;
            out[10] = cy * cx * sz;
            break;

        case SDi.ORDER_YZX:
            out[0] = cy * cx * sx;
            out[1] = sZ * cx * sx;
            out[2] = -sY * sx;

            out[4] = (cy * sY * sX - sZ * cx) * sy;
            out[5] = (sZ * sY * sX + cy * cx) * sy;
            out[6] = cy * sX * sy;

            out[8] = (cy * sY * cx + sZ * sX) * sz;
            out[9] = (sZ * sY * cx - cy * sX) * sz;
            out[10] = cy * cx * sz;
            break;

        case SDi.ORDER_XYZ:
            out[0] = cy * cz * sx;
            out[1] = cy * sZ * sx;
            out[2] = -sY * sx;

            out[4] = (sY * sX * cz - cx * sZ) * sy;
            out[5] = (sY * sX * sZ + cx * cz) * sy;
            out[6] = cy * sX * sy;

            out[8] = (sY * cx * cz + sX * sZ) * sz;
            out[9] = (sY * cx * sZ - sX * cz) * sz;
            out[10] = cy * cx * sz;
            break;

        case SDi.ORDER_XZY:
            out[0] = cy * cz * sx;
            out[1] = cy * sZ * sx;
            out[2] = -sY * sx;

            out[4] = (sY * sX * cz - cx * sZ) * sy;
            out[5] = (sY * sX * sZ + cx * cz) * sy;
            out[6] = cy * sX * sy;

            out[8] = (sY * cx * cz + sX * sZ) * sz;
            out[9] = (sY * cx * sZ - sX * cz) * sz;
            out[10] = cy * cx * sz;
            break;
    }
    return out;
}

/**
 * Transforms a 4x4 column-major transformation matrix based on the provided translation, offset and anchor parameters.
 * 
 * Width/Height/Depth are optional if the anchor point is not used or you rely on scale.
 * 
 * If sclale or rotation has updated, you must first update those, then translation.
 * 
 * @param {array} spriteData - An array containing these values in the order: [x, y, z, rx, ry, rz, sx, sy, sz].
 * @param {Float32Array} out - An optional Float32Array to store the resulting matrix.
 * @param {number} w - The width of the sprite (used for anchor calculations).
 * @param {number} h - The height of the sprite (used for anchor calculations).
 * @param {number} d - The depth of the sprite (used for anchor calculations).
 * @returns {Float32Array} The resulting transformation matrix.
 */
function transformMatrix(spriteData, out = new Float32Array(16), w = 1, h = 1, d = 1) {
    // -- Position
    let x = spriteData[SDi.x];
    let y = spriteData[SDi.y];
    let z = spriteData[SDi.z];

    const ox = spriteData[SDi.offsetX] || 0;
    const oy = spriteData[SDi.offsetY] || 0;
    const oz = spriteData[SDi.offsetZ] || 0;

    x += ox;
    y += oy;
    z += oz;

    const anchorX = spriteData[SDi.anchorX] || 0;
    const anchorY = spriteData[SDi.anchorY] || 0;
    const anchorZ = spriteData[SDi.anchorZ] || 0;

    if(anchorX === 0 && anchorY === 0 && anchorZ === 0) {
        out[12] = x;
        out[13] = y;
        out[14] = z;
        return out;
    }

    // --- Adjust for anchor point

    w ??= 1;
    h ??= 1;
    d ??= 1;

    const anchorXw = anchorX * w;
    const anchorYh = anchorY * h;
    const anchorZd = anchorZ * d;

    out[12] = x - (
        out[0] * anchorXw +
        out[4] * anchorYh +
        out[8] * anchorZd
    );

    out[13] = y - (
        out[1] * anchorXw +
        out[5] * anchorYh +
        out[9] * anchorZd
    );

    out[14] = z - (
        out[2]  * anchorXw +
        out[6]  * anchorYh +
        out[10] * anchorZd
    );

    const transformFlags = spriteData[SDi.transformFlags] || 0;

    // By default, the anchor point affects only rotation and scale by resetting the position after the offset.
    // You can override this to also affect the position. Set Sprite.DEFAULT_FLAGS to set this globally.
    if(!(transformFlags & SDi.ANCHOR_AFFECTS_POSITION)) {
        out[12] += w * anchorX;
        out[13] += h * anchorY;
        out[14] += d * anchorZ;
    }

    return out;
}

function createMatrix(spriteData, out = new Float32Array(16), w = 1, h = 1, d = 1) {
    out ??= new Float32Array(16);
    out[15] = 1;
    updateMatrix(spriteData, out, w, h, d);
    return out;
}

function updateMatrix(spriteData, out = new Float32Array(16), w = 1, h = 1, d = 1) {
    return transformMatrix(spriteData, rotateMatrix(spriteData, out), w, h, d);
}

/**
 * Multiplies two 4x4 matrices and returns the result.
 * @param {Float32Array} a - The first matrix.
 * @param {Float32Array} b - The second matrix.
 * @param {Float32Array} out - An optional Float32Array to store the resulting matrix.
 * @returns {Float32Array} The resulting matrix after multiplication.
 * 
 * @glitter_transform inline
 */
function multiplyMatrix(a, b, out = new Float32Array(16)) {
    const a00 = a[0],  a01 = a[1],  a02 = a[2],  a03 = a[3];
    const a10 = a[4],  a11 = a[5],  a12 = a[6],  a13 = a[7];
    const a20 = a[8],  a21 = a[9],  a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    const b00 = b[0],  b01 = b[1],  b02 = b[2],  b03 = b[3];
    const b10 = b[4],  b11 = b[5],  b12 = b[6],  b13 = b[7];
    const b20 = b[8],  b21 = b[9],  b22 = b[10], b23 = b[11];
    const b30 = b[12], b31 = b[13], b32 = b[14], b33 = b[15];

    out[0]  = a00 * b00 + a10 * b01 + a20 * b02 + a30 * b03;
    out[1]  = a01 * b00 + a11 * b01 + a21 * b02 + a31 * b03;
    out[2]  = a02 * b00 + a12 * b01 + a22 * b02 + a32 * b03;
    out[3]  = a03 * b00 + a13 * b01 + a23 * b02 + a33 * b03;

    out[4]  = a00 * b10 + a10 * b11 + a20 * b12 + a30 * b13;
    out[5]  = a01 * b10 + a11 * b11 + a21 * b12 + a31 * b13;
    out[6]  = a02 * b10 + a12 * b11 + a22 * b12 + a32 * b13;
    out[7]  = a03 * b10 + a13 * b11 + a23 * b12 + a33 * b13;

    out[8]  = a00 * b20 + a10 * b21 + a20 * b22 + a30 * b23;
    out[9]  = a01 * b20 + a11 * b21 + a21 * b22 + a31 * b23;
    out[10] = a02 * b20 + a12 * b21 + a22 * b22 + a32 * b23;
    out[11] = a03 * b20 + a13 * b21 + a23 * b22 + a33 * b23;

    out[12] = a00 * b30 + a10 * b31 + a20 * b32 + a30 * b33;
    out[13] = a01 * b30 + a11 * b31 + a21 * b32 + a31 * b33;
    out[14] = a02 * b30 + a12 * b31 + a22 * b32 + a32 * b33;
    out[15] = a03 * b30 + a13 * b31 + a23 * b32 + a33 * b33;
    return out;
}

const obj = {
    v: 2,
    version: "2.2.0-alpha.0",

    SDi,

    Camera,

    // WebGL shader utilities
    stripShaderVersion,
    compileShader,
    createProgram,
    getShader,

    Renderable,
    AbstractRenderer: Renderer,

    // WebGLRenderer class
    WebGLRenderer,
    Renderable,
    WebGLBuffer,

    createMatrix,
    updateMatrix,
    rotateMatrix,
    transformMatrix,
    multiplyMatrix,

    /**
     * Creates a global WebGLRenderer instance that is composited on top of your application and resizes to your window.
     * Drawing on this renderer will be composited on top of whatever is rendered in your application.
     * @param {*} options 
     * @returns 
     */
    createGlobalWebGLRenderer(options = {}) {
        if(!LS.GlobalWebGLRenderer) {
            options.resizeTo ??= window;
            options.backgroundColor ??= "transparent";
            options.blockIfHidden ??= true;
            options.firstFrame ??= false;

            LS.GlobalWebGLRenderer = new WebGLRenderer(options);
            LS.GlobalWebGLRenderer.canvas.style.position = "fixed";
            LS.GlobalWebGLRenderer.canvas.style.top = "0px";
            LS.GlobalWebGLRenderer.canvas.style.left = "0px";
            LS.GlobalWebGLRenderer.canvas.style.zIndex = "1";
            LS.GlobalWebGLRenderer.canvas.style.pointerEvents = "none";
            LS.GlobalWebGLRenderer.canvas.classList.add("ls-global-webgl-renderer");

            LS.once("ready", () => {
                (options.compositeLayerParent || LS._topLayer).appendChild(LS._compositeLayer = LS.Create({
                    class: "ls-gl-composite-layer",
                    inner: LS.GlobalWebGLRenderer.canvas
                }));

                LS.completed("global-composite-layer", LS._compositeLayer);
            });
        } else {
            console.warn("Global WebGLRenderer was already created. Returning the existing instance, options provided were ignored. You should only call createGlobalWebGLRenderer once.");
        }
        return LS.GlobalWebGLRenderer;
    },

    destroyGlobalWebGLRenderer() {
        if(LS.GlobalWebGLRenderer) {
            console.log("Global WebGLRenderer was destroyed.");
            LS.GlobalWebGLRenderer.canvas.remove();
            LS.GlobalWebGLRenderer.destroy();
            LS.GlobalWebGLRenderer = null;
            LS.configureEvent("global-composite-layer", { completed: false, data: null });
            LS._compositeLayer?.remove();
            LS._compositeLayer = null;
        }
    },

    /**
     * Creates a new LS.Color instance from the given color input. The input can be any valid LS.Color input.
     * @param {LS.Color|string|Array|Object|number} r - The red component of the color or an LS.Color instance, any valid CSS color string, array, object, or a hex number.
     * @param {number} g - The green component of the color.
     * @param {number} b - The blue component of the color.
     * @param {number} a - The alpha component of the color.
     * @param {Array} target - Optional target array to store the result. If not provided, a new array will be created.
     * @param {number} offset - Optional offset in the target array to start writing the result.
     * @returns {Array} The color as a vec4 array [r, g, b, a] with values in the range [0, 1].
     */
    colorToVec4: (r, g, b, a = 1, target = [], offset = 0) => {
        if(r instanceof LS.Color) {
            const c = r.floatPixel;
            target[offset + 0] = c[0];
            target[offset + 1] = c[1];
            target[offset + 2] = c[2];
            target[offset + 3] = c[3];
            return target;
        }

        // Parse the color
        LS.Color.parse(r, g, b, a, sharedColorConversionBuffer);

        // Return the color as a vec4
        target[offset + 0] = Math.fround(sharedColorConversionBuffer[0] / 255);
        target[offset + 1] = Math.fround(sharedColorConversionBuffer[1] / 255);
        target[offset + 2] = Math.fround(sharedColorConversionBuffer[2] / 255);
        target[offset + 3] = Math.fround(sharedColorConversionBuffer[3] / 255);
        return target;
    },

    /**
     * Offsets a rectangle by another rectangle.
     * @param {Object} rect1 - The first rectangle with properties x, y, width, and height.
     * @param {Object} rect2 - The second rectangle with properties x, y, width, and height.
     * @returns {Object} A new rectangle that encompasses both input rectangles.
     * This creates a new rectangle.
     */
    offsetRect: (rect1, rect2) => {
        const x = rect1.x + rect2.x;
        const y = rect1.y + rect2.y;
        const width = rect2.width;
        const height = rect2.height;
        return { x, y, width, height };
    },

    /**
     * Offsets a rectangle by another rectangle.
     * @param {Object} rect1 - The first rectangle with properties x, y, width, and height.
     * @param {Object} rect2 - The second rectangle with properties x, y, width, and height.
     * @returns {Object} A new rectangle that encompasses both input rectangles.
     * This modifies rect1 in place and returns it.
     */
    offsetRectNC: (rect1, rect2) => {
        rect1.x += rect2.x;
        rect1.y += rect2.y;
        rect1.width = rect2.width;
        rect1.height = rect2.height;
        return rect1;
    },

    createRenderer(options = {}) {
        return new WebGLRenderer(options);
    },

    // TODO
    unloadGlobals() {},

    // Misc utilities
    cyrb64,

    // Shader presets
    shaders: {
        // Fullscreen triangle (covers the entire screen with a single triangle, which is more efficient than a quad)
        basic_fullscreen_vertex: `#version 300 es

out vec2 uv;

uniform vec2 uResolution;

const vec2 positions[3] = vec2[](
vec2(-1.0, -1.0),
vec2( 3.0, -1.0),
vec2(-1.0,  3.0)
);

void main() {
vec2 pos = positions[gl_VertexID];
gl_Position = vec4(pos, 0.0, 1.0);
uv = (pos * 0.5 + 0.5) * uResolution;
uv.y = uResolution.y - uv.y;
}`,
        // Fullscreen quad if you need to use a real quad (but two triangles)
        basic_fullscreen_quad: `#version 300 es

out vec2 uv;

${quad}

void main() {
vec2 pos = positions[gl_VertexID];
uv = pos * 0.5 + 0.5;
gl_Position = vec4(pos, 0.0, 1.0);
}`,
        basic_quad: `#version 300 es

${quad}

out vec2 vUV;

uniform vec2 uOffset;
uniform vec2 uSize;
uniform vec2 uResolution;

void main() {
vec2 local = positions[gl_VertexID];

// local coordinates for fragment shader(?)
vUV = local * 0.5 + 0.5;

vec2 pos = vUV * (uSize / uResolution) + (uOffset / uResolution);
pos = pos * 2.0 - 1.0;
pos.y = -pos.y;

gl_Position = vec4(pos, 0.0, 1.0);
}`,
        instanced_quads: (extra_attributes) => `#version 300 es

${quad}

in vec2 iOffset;
in vec2 iSize;
${extra_attributes? extra_attributes.map(attr => `in ${attr.type} i${attr.name};${attr.type === "uint"? "flat ": ""}out ${attr.type} v${attr.name};`).join(""): ""}

out vec2 vUV;
out vec2 vSize;
out vec2 vOffset;

uniform vec2 uResolution;
uniform vec2 uOffset;
uniform vec2 uZoom;
uniform float uOutset;

void main() {
vec2 size = iSize * uZoom;
vec2 offset = (iOffset * uZoom) - uOffset;

vec2 local = positions[gl_VertexID] * uOutset;
vUV = local * 0.5 + 0.5;

vSize = size;
vOffset = offset;
${extra_attributes? extra_attributes.map(attr => `v${attr.name} = i${attr.name};`).join(""): ""}

vec2 pos = vUV * (size / uResolution) + (offset / uResolution);
pos = pos * 2.0 - 1.0;
pos.y = -pos.y;

gl_Position = vec4(pos, 0.0, 1.0);
}`,
        instanced_lines: `#version 300 es

${quad}

out vec2 vUV;
out vec2 vStart;
out vec2 vEnd;
out float vThickness;
out vec3 vColor;

uniform vec2 uResolution;
uniform vec2 uOffset;
uniform vec2 uSize;

in vec2 iStart;
in vec2 iEnd;
in float iThickness;
in vec3 iColor;

void main() {
vec2 local = uSize * positions[gl_VertexID];

vUV = local * 0.5 + 0.5;

// World/screen pixel coordinates
vec2 start = iStart - uOffset;
vec2 end   = iEnd - uOffset;

vec2 dir = normalize(end - start);
vec2 normal = vec2(-dir.y, dir.x);

// Expand the line into a quad
vec2 pos = mix(start, end, vUV.x);
pos += normal * (local.y * iThickness * 0.5);

// Pixel space -> clip space
pos /= uResolution;
pos = pos * 2.0 - 1.0;
pos.y = -pos.y;

gl_Position = vec4(pos, 0.0, 1.0);

vColor = iColor;
}`,
        // Simple hello world shader
        basic_fullscreen_fragment: `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

void main() {
fragColor = vec4(vUV, 0.0, 1.0);
}`,
        selection_rect_fragment: `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform vec2 uSize;
uniform vec2 uOffset;
uniform vec2 uResolution;
uniform uvec3 uColor;

${roundedBoxSDF}

void main() {
    vec3 color = vec3(uColor) / 255.0;

    vec2 p = (vUV - 0.5) * uSize;
    vec2 halfSize = uSize * 0.5;

    float radius = 6.0;

    // Outer rounded box
    float outer = roundedBoxSDF(p, halfSize, radius);

    // Inner rounded box (border thickness)
    float borderWidth = 2.0;
    float inner = roundedBoxSDF(
        p,
        halfSize - vec2(borderWidth),
        max(radius - borderWidth, 0.0)
    );

    float aa = fwidth(outer);

    float shapeAlpha = 1.0 - smoothstep(0.0, aa, outer);

    // Border area between outer and inner rounded boxes
    float border = smoothstep(-aa, aa, inner) * shapeAlpha;

    // Fill area
    float fill = (1.0 - smoothstep(-aa, aa, inner)) * shapeAlpha;

    fragColor = vec4(color, border + fill * 0.2);
}`,

        basic_color_fragment: `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec4 uColor;

void main() {
fragColor = vec4(uColor);
}`,


        // Debug shaders to quicker find out what isn't working so you don't lose your sanity
        // This one just renders red
        debug_fragment: `#version 300 es\nprecision highp float;\nout vec4 fragColor;\nvoid main() {\nfragColor = vec4(1.0, 0.0, 0.0, 1.0);\n}`,
        debug_vertex: `#version 300 es\nin vec2 aPosition;\nout vec2 vUV;\nvoid main() {\nvUV = aPosition * 0.5 + 0.5;\ngl_Position = vec4(aPosition, 0.0, 1.0);\n}`
    },

    utils: {
        roundedBoxSDF,
        quad
    },

    get animation() {
        throw new Error("LS.GL.animation is deprecated. See Animation2 (LS.Animation) component for the new animation system compatible with LS.GL.");
    }
};

LS.register(obj, { name: "GL", global: true, dependencies: ["Color"] });

// Hoist LS.GL to the global scope
(typeof window !== 'undefined'? window : globalThis).LSGL = obj;

console.warn("LS.GL is an early stage component. The API is not stable and may change in future releases. This component is not fully tested and may contain bugs.");

/*@ls-export*/ if (typeof module !== "undefined" && module.exports) {
    module.exports = obj;
}

export default obj;