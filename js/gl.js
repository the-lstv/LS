/**
 * GL Utilities for LS
 * @version 2.0.0-alpha.0
 * 
 * ! This is an early stage component. The API is not stable and may change in future releases.
 * ! This component is not fully tested and may contain bugs.
 * 
 * Future
 * @experimental
 */

/**
 * MSDF shader for rendering text with MSDF fonts.
 * Optionally THREE.js compatible.
 * @version 1.0.0
 */
const msdfFragment = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
in vec4 v_color;

uniform sampler2D uTexture;
uniform float uPxRange;
uniform float uWeight;

out vec4 outColor;

float median(float r, float g, float b) {
    return max(min(r, g), min(max(r, g), b));
}

void main() {
    vec3 msd = texture(uTexture, v_texCoord).rgb;
    float sd = median(msd.r, msd.g, msd.b);
    vec2 texSize = vec2(textureSize(uTexture, 0));
    vec2 unitRange = vec2(uPxRange) / texSize;
    vec2 screenTexSize = vec2(1.0) / fwidth(v_texCoord);
    float screenPxRange = max(0.5 * dot(unitRange, screenTexSize), 1.0);

    float alpha = clamp(screenPxRange * (sd - 0.5 + uWeight) + 0.5, 0.0, 1.0);

    outColor = vec4(v_color.rgb, v_color.a * alpha);
}
`;

const mtsdfFragment = `#version 300 es
precision highp float;

in vec2 v_texCoord;
in vec4 v_color;

uniform sampler2D uTexture;
uniform float uPxRange;
uniform float uWeight;

out vec4 outColor;

float median(float r, float g, float b) {
    return max(min(r, g), min(max(r, g), b));
}

void main() {
    vec4 tex = texture(uTexture, v_texCoord);

    float msdf = median(tex.r, tex.g, tex.b);
    float sdf = tex.a;

    float sd = mix(sdf, msdf, 0.75);
    sd += uWeight;

    vec2 texSize = vec2(textureSize(uTexture, 0));
    vec2 unitRange = vec2(uPxRange) / texSize;

    vec2 screenTexSize = vec2(1.0) / fwidth(v_texCoord);

    float screenPxRange = max(
        0.5 * dot(unitRange, screenTexSize),
        1.0
    );

    float alpha = clamp(
        screenPxRange * (sd - 0.5) + 0.5,
        0.0,
        1.0
    );

    outColor = vec4(v_color.rgb, v_color.a * alpha);
}`;

/**
 * Vertex shader for rendering MSDF text.
 * Optionally THREE.js compatible.
 * @version 1.0.0
 */
const msdfVertex = `#version 300 es

in vec2 a_quad;

in vec2 i_pos;
in vec2 i_size;
in vec4 i_uvRect;
in vec4 i_color;

uniform mat4 uProjection;
uniform vec2 uOffset;

#ifdef USE_THREE_MATRICES
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
#endif

out vec2 v_texCoord;
out vec4 v_color;

void main() {
    vec2 pos = i_pos + (a_quad * i_size);

#ifdef USE_THREE_MATRICES
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos + uOffset, 0.0, 1.0);
#else
    gl_Position = uProjection * vec4(pos + uOffset, 0.0, 1.0);
#endif

    vec2 uv = i_uvRect.xy + (a_quad * 0.5 + 0.5) * i_uvRect.zw;

    v_texCoord = uv;
    v_color = i_color;
}
`;

(() => {
    // const textEncoder = new TextEncoder();
    // const textDecoder = new TextDecoder("utf-8");

    /**
     * A fast and (very) simple implementation-agnostic parser to parse HTML-like code in just 124 lines.
     * Note that this is not a spec-compliant HTML parser and it is only intended to be used if you know the input is valid.
     * It does not correctly handle malformed HTML.
     * 
     * @param {*} code The code string
     * @param {*} root Optional - The root element
     * @param {Function} factory Optional - The element factory function
     * @experimental
     * @returns Parsed elements or root element
     */
    function htmlParser(code, root = null, factory = LS.GL.Create) {
        const stack = root? [root]: [], result = root? [root]: [];
        let state = 0, start = 0;

        for(let i = 0; i < code.length; i++) {
            const char = code.charCodeAt(i);

            if(state === 1 || state === 2) {
                if(char === 62) {
                    const tagValue = code.substring(start, i).trim();
                    const firstSpace = tagValue.indexOf(" ");
                    const tag = (firstSpace !== -1? tagValue.substring(0, firstSpace): tagValue).toLowerCase();

                    if(state === 2) {
                        const top = stack.at(-1);
                        state = 0;

                        if(top.tag !== tag) {
                            console.warn(`Mismatched closing tag: expected </${top.tag}>, found </${tag}>`);
                            continue;
                        }

                        stack.pop();
                        continue;
                    }

                    const props = {}; 
                    if(firstSpace !== -1) {
                        const parts = tagValue.substring(firstSpace + 1).trim();
                        let state = 0, start = 0, quoteChar = null, lastKey = null;
                        for(let i = 0; i < parts.length; i++) {
                            const char = parts.charCodeAt(i);

                            if(state === 2) {
                                if(char === quoteChar && parts.charCodeAt(i - 1) !== 92) {
                                    state = 0;
                                    quoteChar = null;

                                    if(lastKey) {
                                        const value = parts.substring(start, i);
                                        props[lastKey] = value === "true"? true: value === "false"? false: value;
                                        lastKey = null;
                                    }
                                    start = i + 1;
                                }
                                continue;
                            }

                            if(state === 1) {
                                if(char === 34 || char === 39) {
                                    state = 2;
                                    quoteChar = char;
                                    start = i + 1;
                                    continue;
                                }
                            }

                            const isLast = i === parts.length - 1;
                            if(char === 32 || char === 9 || char === 10 || isLast || char === 61) {
                                const key = isLast || i > start? parts.substring(start, isLast? i + 1: i).trim(): null;
                                if(state === 1) {
                                    if(key) {
                                        props[lastKey] = key === "true"? true: key === "false"? false: key;
                                        lastKey = null;
                                        state = 0;
                                        start = i + 1;
                                    }
                                    continue;
                                }

                                if(key) {
                                    props[key] = true;
                                    lastKey = key;
                                }

                                start = i + 1;
                            }

                            if(char === 61 && lastKey) {
                                state = 1;
                                continue;
                            }
                        }
                    }

                    console.log(props);

                    const element = factory(tag, props);
                    const top = stack.at(-1);
                    if(top) top.element.addChild(element); else if (!root) result.push(element);

                    if(element.allowChildren) {
                        stack.push({ element, tag });
                    }

                    start = i + 1;
                    state = 0;
                }
                continue;
            }

            if(char === 60) {
                const text = i > start? code.substring(start, i).trim(): null;
                if(text) {
                    const top = stack.at(-1);
                    if(!top && !root) result.push(factory("text", { text })); else if (top) {
                        if(top.element instanceof LS.GL.BlockElement) {
                            top.element.setText(text);
                        } else {
                            top.element.addChild(factory("text", { text }));
                        }
                    }
                }

                if(code.charCodeAt(i - 1) === 92) continue;

                state = code.charCodeAt(i + 1) === 47? 2: 1;
                start = i + state;
                if(state === 2) i++;
                continue;
            }
        }

        return root || result;
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
    function ortho(out, left, right, bottom, top, near, far) {
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

    function getShader(parent, type, ...keys) {
        for (const key of keys) {
            if(!key) continue;

            if (type === parent.gl.VERTEX_SHADER && parent.vertexShaders.has(key)) {
                return { shader: parent.vertexShaders.get(key), key };
            }

            if (type === parent.gl.FRAGMENT_SHADER && parent.fragmentShaders.has(key)) {
                return { shader: parent.fragmentShaders.get(key), key };
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
     * @param {*} parent - The parent renderer
     * @param {*} type - The shader type (gl.VERTEX_SHADER or gl.FRAGMENT_SHADER)
     * @param {*} source - The shader source code
     * @returns The compiled shader or null if compilation failed
     */
    function compileShader(parent, type, source) {
        if (!(parent instanceof WebGLRenderer)) throw new Error("Parent is not a LS.GL.WebGLRenderer instance.");
        if (!parent.gl) throw new Error("Parent does not have a WebGL context.");

        const shaderHash = cyrb64(source);
        const foundShader = getShader(parent, type, shaderHash);
        if (foundShader) {
            // // If the shader was found by source, we can store it under the name if provided
            // if(foundShader.key !== name) {
            //     parent[type === parent.gl.VERTEX_SHADER? "vertexShaders": "fragmentShaders"].set(name, foundShader.shader);
            // }
            return { shader: foundShader.shader, hash: shaderHash };
        }

        const gl = parent.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }

        parent[type === gl.VERTEX_SHADER? "vertexShaders": "fragmentShaders"].set(shaderHash, shader);
        return { shader, hash: shaderHash };
    }

    /**
     * For WebGLRenderer.
     * Creates a shader program from vertex and fragment sources.
     * @param {*} parent - The parent renderer
     * @param {*} vertex - The vertex shader source code or vertex shader object
     * @param {*} fragment - The fragment shader source code or fragment shader object
     * @returns The compiled shader program or null if compilation failed
     */
    function createProgram(parent, vertex, fragment) {
        if (!(parent instanceof WebGLRenderer)) throw new Error("Parent is not a LS.GL.WebGLRenderer instance.");
        if (!parent.gl) throw new Error("Parent does not have a WebGL context.");

        const gl = parent.gl;
        const program = gl.createProgram();

        if(vertex.shader) vertex = vertex.shader;
        if(fragment.shader) fragment = fragment.shader;

        vertex =   vertex   instanceof WebGLShader ? vertex   : compileShader(parent, gl.VERTEX_SHADER, vertex)?.shader;
        fragment = fragment instanceof WebGLShader ? fragment : compileShader(parent, gl.FRAGMENT_SHADER, fragment)?.shader;

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
     * TODO: Support for multiple backends (eg. WebGPU, THREE.JS, etc.)
     * 
     * @experimental
     */
    class Renderer extends LS.Context {
        constructor(options = {}) {
            super();
            this.options = options;
            this.activeCamera = null;
        }

        setOptions(options) {
            this.width = options.width || this.canvas?.width || 800;
            this.height = options.height || this.canvas?.height || 600;

            if (options.camera) {
                this.activeCamera = options.camera;
            } else if (!this.activeCamera) {
                this.activeCamera = new OrthographicCamera(0, this.width, this.height, 0, -1, 1);
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
            } else if (options.resizeTo === false && this.__observer) {
                this.__observer.disconnect();
                this.__observer = null;
            }
        }

        resize(width, height) {
            this.width = width;
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

        createRenderable(options = {}, append = true) {
            options.parent = this;
            const renderable = new Renderable(options);
            if (append) {
                this.renderables.push(renderable);
            }
            return renderable;
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
     * It should not be required directly.
     * @experimental
     */
    class WebGLRenderer extends Renderer {
        constructor(options = {}) {
            super(options);

            this.frameScheduler = this.addDestroyable(new LS.Util.FrameScheduler(this.tick.bind(this), { deltaTime: true, ...options?.frameScheduler }));

            this._backgroundColor = new LS.Color(0, 0, 0, 1);

            this.pendingResize = [false, 0, 0];

            this.initialized = false;

            this.lastRenderWidth = 0;
            this.lastRenderHeight = 0;

            this.vertexShaders = new Map();
            this.fragmentShaders = new Map();

            // Base renderables
            this.renderables = [];

            this.setOptions(options);
            if (options.init !== false) {
                this.init(options);
            }
        }

        /**
         * Schedules a render call for the next frame.
         * This is a non-blocking call and will not immediately render.
         */
        render() {
            if (!this.initialized) return;
            this.frameScheduler.schedule();
        }

        init(options = {}) {
            if (this.initialized) return;
            this.initialized = true;

            if(!this.width) this.width = options.width || 800;
            if(!this.height) this.height = options.height || 600;

            this.canvas = options.canvas || document.createElement('canvas');
            this.canvas.width = this.width;
            this.canvas.height = this.height;

            // WebGL2 context
            this.gl = options.gl || this.canvas.getContext('webgl2', {
                antialias: options.antialias !== false,
                alpha: options.alpha !== false,
                depth: options.depth !== false,
                stencil: options.stencil !== false,
                preserveDrawingBuffer: options.preserveDrawingBuffer === true
            });

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
        tick(delta, now, camera, target, clear = true) {
            if (!this.initialized) return;

            if (this.pendingResize[0]) {
                this.#resize(this.pendingResize[1], this.pendingResize[2]);
                this.pendingResize[0] = false;
            }

            if(this.options.blockIfHidden && !this.isVisible()) return;

            const gl = this.gl;
            const cw = this.width;
            const ch = this.height;

            if(clear && this.options.clear !== false) {
                gl.clear(gl.COLOR_BUFFER_BIT);
            }

            const updatedDimensions = cw !== this.lastRenderWidth || ch !== this.lastRenderHeight;
            if (updatedDimensions) {
                this.lastRenderWidth = cw;
                this.lastRenderHeight = ch;
                this.activeCamera.update(0, cw, ch, 0, -1, 1); // TODO: ? this isn't right what
                gl.viewport(0, 0, cw, ch);
            }

            // Update buffers and such
            // this.quickEmit("render", delta, now, cw, ch, updatedDimensions);

            if(target) {
                gl.useProgram(target.program);
                target.render(delta, now, gl, cw, ch, updatedDimensions, target.uniforms, target.attributes, camera? camera.projectionMatrix: this.activeCamera.projectionMatrix);
            } else {
                for(const renderable of this.renderables) {
                    gl.useProgram(renderable.program);
                    renderable.render(delta, now, gl, cw, ch, updatedDimensions, renderable.uniforms, renderable.attributes, camera? camera.projectionMatrix: this.activeCamera.projectionMatrix);
                }
            }
        }

        renderOne(renderable, delta, now, camera, clear = false) {
            const gl = this.gl;
            const cw = this.width;
            const ch = this.height;

            if(clear) {
                gl.clear(gl.COLOR_BUFFER_BIT);
            }

            renderable.render(delta, now, gl, cw, ch, false, renderable.uniforms, renderable.attributes, camera? camera.projectionMatrix: this.activeCamera.projectionMatrix);
        }

        #resize(width, height) {
            this.width = width;
            this.height = height;

            if(this.options.accountForPixelRatio) {
                const pixelRatio = window.devicePixelRatio || 1;
                width  *= pixelRatio;
                height *= pixelRatio;
            }

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
            if (document.hidden || !this.canvas.isConnected) return false;
            if (Element.prototype.checkVisibility && !this.canvas.checkVisibility()) return false;
            if (this.canvas.offsetParent === null) return false;
            if (this.canvas.clientWidth === 0 || this.canvas.clientHeight === 0) return false;
            return true;
        }

        /**
         * Clear the screen
        */
        clear() {
            const gl = this.gl;
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        compileShader(type, name, source) {
            return compileShader(this, type, source, name);
        }

        compileProgram(vertexSource, fragmentSource) {
            return createProgram(this, vertexSource, fragmentSource);
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

        destroy() {
            if(this.gl) {
                this.gl.getExtension('WEBGL_lose_context')?.loseContext();
                this.gl = null;
            }

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
            super.destroy();
        }
    }

    /**
     * A WebGL renderable base class for handling graphics rendering.
     */
    class Renderable {
        constructor(options = {}) {
            this.renderer = options.renderer || options.parent;

            if(!this.renderer || !(this.renderer instanceof Renderer)) throw new Error("Renderable requires a LS.WebGLRenderer instance in options.");
            if(!this.renderer.gl) throw new Error("Renderable requires a GL context.");

            this.program = options.program || (options.vertex && options.fragment ? createProgram(this.renderer, options.vertex, options.fragment) : null);
            this.uniforms = {};
            this.attributes = {};
            this.addUniforms(options.uniforms);
            this.addAttributes(options.attributes);

            if(options.onSetup) {
                options.onSetup.call(this, this.renderer.gl, this.program, this.uniforms, this.attributes, options);
            }

            if(options.onRender) {
                this.render = options.onRender.bind(this);
            }

            this.renderer.once("destroy", this.__parentDestroyHandler = () => this.destroy());
        }

        render(delta, now, gl, width, height, updatedDimensions, uniforms, attributes, projectionMatrix) {
            // Override in subclass or provide a render function in the constructor
        }

        addUniforms(uniforms) {
            if(!uniforms) return;

            if(Array.isArray(uniforms)) {
                for(const key of uniforms) {
                    if(!key) continue;
                    if(typeof key !== "string") throw new Error(`Invalid location key: expected a string, got ${typeof key}.`);
                    this.uniforms[key] = this.renderer.gl.getUniformLocation(this.program, key);
                }
            } else {
                for(const key in uniforms) {
                    const value = uniforms[key];
                    if(!value) continue;
                    if(typeof value !== "string") throw new Error(`Invalid location value for key "${key}". Expected a string, got ${typeof value}.`);
                    this.uniforms[key] = this.renderer.gl.getUniformLocation(this.program, value);
                }
            }
        }

        addAttributes(attributes) {
            if(!attributes) return;

            if(Array.isArray(attributes)) {
                for(const key of attributes) {
                    if(!key) continue;
                    if(typeof key !== "string") throw new Error(`Invalid location key: expected a string, got ${typeof key}.`);
                    this.attributes[key] = this.renderer.gl.getAttribLocation(this.program, key);
                }
            } else {
                for(const key in attributes) {
                    const value = attributes[key];
                    if(!value) continue;
                    if(typeof value !== "string") throw new Error(`Invalid location value for key "${key}". Expected a string, got ${typeof value}.`);
                    this.attributes[key] = this.renderer.gl.getAttribLocation(this.program, value);
                }
            }
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
                    console.log(`Destroyed uniform: ${key}`);
                }
                this.uniforms = null;
            }

            if(this.attributes) {
                for(const key in this.attributes) {
                    this.attributes[key] = null;
                    console.log(`Destroyed attribute: ${key}`);
                }
                this.attributes = null;
            }

            if(this.renderer && !this.renderer.destroyed) {
                this.renderer.off("destroy", this.__parentDestroyHandler);

                // TODO:
                this.renderer.renderables = this.renderer.renderables.filter(r => r !== this);
            }

            this.renderer = null;
            this.__parentDestroyHandler = null;

            this.destroyed = true;
        }
    }

    /**
     * A simple orthographic camera class for 2D rendering.
     * It creates an orthographic projection matrix based on the provided parameters.
     */
    class OrthographicCamera {
        constructor(left, right, bottom, top, near, far) {
            this.left = left;
            this.right = right;
            this.bottom = bottom;
            this.top = top;
            this.near = near;
            this.far = far;

            this.projectionMatrix = new Float32Array(16);
            ortho(this.projectionMatrix, left, right, bottom, top, near, far);
        }

        update(left, right, bottom, top, near, far) {
            this.left = left;
            this.right = right;
            this.bottom = bottom;
            this.top = top;
            this.near = near;
            this.far = far;

            ortho(this.projectionMatrix, left, right, bottom, top, near, far);
        }
    }

    /**
     * A simple perspective camera class for 3D rendering.
     * It creates a perspective projection matrix based on the provided parameters.
     */
    class PerspectiveCamera {
        constructor(fov, aspect, near, far) {
            this.fov = fov;
            this.aspect = aspect;
            this.near = near;
            this.far = far;

            this.projectionMatrix = new Float32Array(16);
            this.updateProjectionMatrix();
        }

        update(fov, aspect, near, far) {
            this.fov = fov;
            this.aspect = aspect;
            this.near = near;
            this.far = far;

            this.updateProjectionMatrix();
        }

        updateProjectionMatrix() {
            const f = 1.0 / Math.tan(this.fov / 2);
            const nf = 1 / (this.near - this.far);

            this.projectionMatrix[0] = f / this.aspect;
            this.projectionMatrix[1] = 0;
            this.projectionMatrix[2] = 0;
            this.projectionMatrix[3] = 0;

            this.projectionMatrix[4] = 0;
            this.projectionMatrix[5] = f;
            this.projectionMatrix[6] = 0;
            this.projectionMatrix[7] = 0;

            this.projectionMatrix[8] = 0;
            this.projectionMatrix[9] = 0;
            this.projectionMatrix[10] = (this.far + this.near) * nf;
            this.projectionMatrix[11] = -1;

            this.projectionMatrix[12] = 0;
            this.projectionMatrix[13] = 0;
            this.projectionMatrix[14] = (2 * this.far * this.near) * nf;
            this.projectionMatrix[15] = 0;
        }
    }


    /**
     * Fast MSDF/MTSDF text rendering using WebGL2.
     * Note that instancing this is expensive, so reuse the same instance for multiple text objects
     * 
     * VERY experimental and not production ready, use at your own risk
     * @experimental
     */
    class TextEngine extends Renderable {
        constructor(options = {}) {
            super({
                fragment: options.mtsdf? mtsdfFragment: msdfFragment,
                vertex: msdfVertex,
                uniforms: ["uProjection", "uOffset", "uTexture", "uPxRange", "uWeight"],
                attributes: ["a_quad", "i_pos", "i_size", "i_uvRect", "i_color"],
                ...options
            });


            this.font = null;
            this.instanceCount = 0;
            this.gridDirty = false;

            this.fontSize = 16;
            this.scale = 1;
            this.cellWidth = 0;
            this.cellHeight = 0;

            this.offsetX = 0;
            this.offsetY = 0;

            this.lineHeight = 1.2; // Line height multiplier for vertical spacing

            this.nextFree = 0;

            this.setOptions(options);
            this.loadPromise = this.setup(this.renderer.gl, this.program, this.uniforms, this.attributes, options);
        }

        async setup(gl, program, uniforms, attributes, options) {
            this.vao = gl.createVertexArray();
            gl.bindVertexArray(this.vao);

            const quadData = new Float32Array([
                -1, -1,
                1, -1,
                -1, 1,
                1, 1
            ]);
        
            this.quadBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, quadData, gl.STATIC_DRAW);

            gl.enableVertexAttribArray(attributes.a_quad);
            gl.vertexAttribPointer(attributes.a_quad, 2, gl.FLOAT, false, 0, 0);

            this.vertexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);

            const stride = (8 * 4) + (4 * 1); // 8 floats (32 bytes, position) + 4 unsigned bytes (4 bytes, color) per instance
            gl.enableVertexAttribArray(attributes.i_pos);
            gl.vertexAttribPointer(attributes.i_pos, 2, gl.FLOAT, false, stride, 0);
            gl.vertexAttribDivisor(attributes.i_pos, 1);

            gl.enableVertexAttribArray(attributes.i_size);
            gl.vertexAttribPointer(attributes.i_size, 2, gl.FLOAT, false, stride, 8);
            gl.vertexAttribDivisor(attributes.i_size, 1);

            gl.enableVertexAttribArray(attributes.i_uvRect);
            gl.vertexAttribPointer(attributes.i_uvRect, 4, gl.FLOAT, false, stride, 16);
            gl.vertexAttribDivisor(attributes.i_uvRect, 1);

            gl.enableVertexAttribArray(attributes.i_color);
            gl.vertexAttribPointer(attributes.i_color, 4, gl.UNSIGNED_BYTE, true, stride, 32);
            gl.vertexAttribDivisor(attributes.i_color, 1);

            gl.bindVertexArray(null);

            this.setBufferSize(options.bufferSize || 2048);

            await this.loadFont(options.fontSrc || ('./assets/fonts/' + (options.fontName || 'JetBrainsMono')));

            if(!this.lineHeight) this.lineHeight = options.lineHeight || this.font.metrics.lineHeight || 1.2;
            this.setFontSize(this.fontSize);
        }

        setBufferSize(numCells) {
            // Backing buffers to remember grid state for resizing & skipping updates
            this.gridBuffer = new Uint16Array(numCells);

            // Per-instance data: i_pos(2), i_size(2), i_uvRect(4), i_color(1) (color is stored as 4 bytes)
            this.vertexData = new Float32Array(numCells * 9);
            this.vertexByteView = new Uint8Array(this.vertexData.buffer);

            const gl = this.renderer.gl;
            gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, this.vertexData, gl.DYNAMIC_DRAW);

            this.instanceCount = numCells;
            this.gridDirty = false;
        }

        clear() {
            if (!this.gridBuffer) return;
            this.gridBuffer.fill(0);
            this.vertexData.fill(0);
            this.gridDirty = true;
            this.nextFree = 0;
        }

        setOptions(newOptions) {
            if (newOptions.fontSize) {
                this.setFontSize(newOptions.fontSize);
            }

            if (newOptions.fontSrc && this.gl) {
                this.loadFont(newOptions.fontSrc);
            }
        }

        render(delta, now, gl, cw, ch, updatedDimensions, uniforms, attributes, projectionMatrix) {
            this.updateBuffers();

            // -- Render text grid
            // Scale the MSDF pixel range to keep edges crisp at different font sizes
            if(updatedDimensions) {
                gl.uniformMatrix4fv(uniforms.uProjection, false, projectionMatrix);
            }

            gl.uniform2f(uniforms.uOffset, this.offsetX, this.offsetY);
            gl.uniform1f(uniforms.uWeight, this?.options?.weight || 0.0);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.uniform1i(uniforms.uTexture, 0);
            gl.bindVertexArray(this.vao);
            // gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.instanceCount);
            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nextFree);
            gl.bindVertexArray(null);
        }

        updateBuffers() {
            if (!this.gridDirty) return;
            const gl = this.renderer.gl;

            gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);

            // orphan old storage (avoids stall if GPU is still using it)
            gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.byteLength, gl.DYNAMIC_DRAW);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertexData);

            this.gridDirty = false;
        }

        /**
         * Important TODO: Somehow, with the new font map changes (to Chlumsky/msdf-atlas-gen from msdf-bmfont-xml), rendering got really slow (_updateVertex now takes up to 4x the time!!) AND worse quality (scaling issues, bad quality when up close).
         * It has to be refactored at some point.
         */
        async loadFont(src) {
            const imgUrl = src + "/atlas.png";

            const [fontData, image] = await Promise.all([
                fetch(src + "/font.json").then(r => r.json()),
                new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                    img.src = imgUrl;
                })
            ]);

            const gl = this.renderer.gl;
            this.texture = gl.createTexture();

            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

            // Number of floats per character in the cmap
            const MAP_SLOTS = 15;

            const baseFontSize = fontData.atlas.size || 24;
            const metrics = fontData.metrics || {};

            const lowestCharCode = Math.min(...fontData.glyphs.map(c => c.code || Infinity));
            const highestCharCode = Math.max(...fontData.glyphs.map(c => c.code || 0));

            // Pack the font data into a single Float32Array for fast access
            const map = new Float32Array((highestCharCode - lowestCharCode + 1) * MAP_SLOTS); // +1 for missing glyph

            const hasBottomOrigin = fontData.atlas?.yOrigin === "bottom";
            const baselinePx = (metrics.ascender || 0) * baseFontSize;

            // Precompute as much as possible
            for (let i = 0; i < fontData.glyphs.length; i++) {
                const charData = fontData.glyphs[i];
                const code = charData.code;

                if (code === undefined || code === null) continue;

                /* x, y, w, h, xoffset, yoffset, xadvance, u0, v0, u1, v1, xOff, yOff, gw, gh */

                const plane = charData.planeBounds || null;
                const atlas = charData.atlasBounds || null;

                const leftPx = plane ? plane.left * baseFontSize : 0;
                const rightPx = plane ? plane.right * baseFontSize : 0;
                const topPx = plane ? plane.top * baseFontSize : 0;
                const bottomPx = plane ? plane.bottom * baseFontSize : 0;

                const gw = rightPx - leftPx;
                const gh = topPx - bottomPx;

                const atlasLeft = atlas ? atlas.left : 0;
                const atlasRight = atlas ? atlas.right : 0;
                const atlasTop = atlas ? atlas.top : 0;
                const atlasBottom = atlas ? atlas.bottom : 0;

                const u0 = atlasLeft / image.width;
                const u1 = atlasRight / image.width;
                const v0 = hasBottomOrigin
                    ? (1 - (atlasTop / image.height))
                    : (atlasTop / image.height);
                const v1 = hasBottomOrigin
                    ? (1 - (atlasBottom / image.height))
                    : (atlasBottom / image.height);

                const xOff = leftPx;
                const yOff = baselinePx - topPx;

                // Font atlas data (kept for compatibility with rebuild)
                map[(code - lowestCharCode) * MAP_SLOTS    ] = atlasLeft;
                map[(code - lowestCharCode) * MAP_SLOTS + 1] = atlasBottom;
                map[(code - lowestCharCode) * MAP_SLOTS + 2] = gw;
                map[(code - lowestCharCode) * MAP_SLOTS + 3] = gh;
                map[(code - lowestCharCode) * MAP_SLOTS + 4] = xOff;
                map[(code - lowestCharCode) * MAP_SLOTS + 5] = yOff;
                map[(code - lowestCharCode) * MAP_SLOTS + 6] = charData.advance || 0;

                // UV coordinates
                map[(code - lowestCharCode) * MAP_SLOTS + 7]  = u0;
                map[(code - lowestCharCode) * MAP_SLOTS + 8]  = v0;
                map[(code - lowestCharCode) * MAP_SLOTS + 9]  = u1;
                map[(code - lowestCharCode) * MAP_SLOTS + 10] = v1;

                // Scale based
                map[(code - lowestCharCode) * MAP_SLOTS + 11] = xOff * this.scale;
                map[(code - lowestCharCode) * MAP_SLOTS + 12] = yOff * this.scale;
                // map[(code - lowestCharCode) * MAP_SLOTS + 13] = gw * this.scale;
                // map[(code - lowestCharCode) * MAP_SLOTS + 14] = gh * this.scale;
                map[(code - lowestCharCode) * MAP_SLOTS + 13] = (gw * this.scale) * 0.5;
                map[(code - lowestCharCode) * MAP_SLOTS + 14] = (gh * this.scale) * 0.5;
            }

            // Font metrics
            const spaceCharData = fontData.glyphs.find(c => c.code === 32) || fontData.glyphs[0];
            const baseCellWidth = (spaceCharData?.advance || 0.6) * baseFontSize;
            const baseCellHeight = baseFontSize;

            this.cmap = map;

            this.font = fontData;
            this.font.baseCellWidth = baseCellWidth;
            this.font.baseCellHeight = baseCellHeight;
            this.font._missingGlyphIndex = (highestCharCode - lowestCharCode + 1) * MAP_SLOTS;
            this.font._lowestCharCode = lowestCharCode;

            gl.useProgram(this.program);
            gl.uniform1f(this.uniforms.uPxRange, this.font.atlas?.distanceRange || 4.0);
            gl.bindTexture(gl.TEXTURE_2D, null);
            gl.useProgram(null);
        }

        setFontSize(size) {
            this.fontSize = size;
            if (this.font) {
                this.scale = size / this.font.atlas.size;
                this.cellWidth = this.font.baseCellWidth * this.scale;
                this.cellHeight = this.font.baseCellHeight * this.scale;
                this._rebuildGlyphScale();

                // Rebuild all vertices with the new scale
                if (this.gridBuffer) {
                    for (let i = 0; i < this.gridBuffer.length; i++) {
                        this._updateVertex(i);
                    }
                }
            }
        }

        _rebuildGlyphScale() {
            if (!this.font) return;
            for (let charCode = this.font._lowestCharCode; charCode < this.font._lowestCharCode + this.cmap.length / 15; charCode++) {
                const glyphIdx = (charCode - this.font._lowestCharCode) * 15;
                this.cmap[glyphIdx + 11] = (this.cmap[glyphIdx + 4] || 0) * this.scale;  // xOff
                this.cmap[glyphIdx + 12] = (this.cmap[glyphIdx + 5] || 0) * this.scale;  // yOff
                this.cmap[glyphIdx + 13] = (this.cmap[glyphIdx + 2] * this.scale) * 0.5; // gw
                this.cmap[glyphIdx + 14] = (this.cmap[glyphIdx + 3] * this.scale) * 0.5; // gh
            }
        }

        /**
         * Updates the vertex data for a single cell in the grid. Does not clamp values or check bounds.
         * @param {number} cellIdx - Index of the cell to update
         * @param {number} x - X position of the cell
         * @param {number} y - Y position of the cell
         * @param {number} charCode - Optional new character code for the cell. If undefined, the character will not be changed.
         * @param {number} r - Optional new red color component (0-255). If undefined, the red component will not be changed.
         * @param {number} g - Optional new green color component (0-255). If undefined, the green component will not be changed.
         * @param {number} b - Optional new blue color component (0-255). If undefined, the blue component will not be changed.
         * @param {number} a - Optional new alpha component (0-255). If undefined, the alpha component will not be changed.
         */
        _updateVertex(cellIdx, x, y, charCode, r, g, b, a) {
            if(!this.font || !this.cmap) return;

            // Dirty glyph (for now we only care to render if glyph changes through this function)
            let updateChar = false;
            const updatePos = x !== undefined || y !== undefined;

            if(charCode !== undefined) {
                updateChar = this.gridBuffer[cellIdx] !== charCode;
                this.gridBuffer[cellIdx] = charCode;

                if(charCode === 61 && this.gridBuffer[cellIdx - 1] === 62) {
                    // Handle => ligature as an example
                    // TODO
                    this._updateVertex(cellIdx - 1, x, y, 65536, r, g, b, a); // Use a char code outside of the normal range to indicate a ligature
                    return;
                }
            } else if(r === undefined && g === undefined && b === undefined && a === undefined && !updatePos) {
                return; // No updates needed
            }
 
            const vb = this.vertexByteView;
            const vIdx = cellIdx * 9;
            const vbIdx = vIdx * 4;

            // Update color if provided
            if(r !== undefined) vb[vbIdx + 32] = r; // i_color.r
            if(g !== undefined) vb[vbIdx + 33] = g; // i_color.g
            if(b !== undefined) vb[vbIdx + 34] = b; // i_color.b
            if(a !== undefined) vb[vbIdx + 35] = a; // i_color.a
            this.gridDirty = true;

            if(!updateChar && !updatePos) return;

            const map = this.cmap;

            let glyphIdx = this.font._missingGlyphIndex;
            if (glyphIdx >= map.length) glyphIdx = 0;
            if (charCode >= this.font._lowestCharCode) {
                const idx = (charCode - this.font._lowestCharCode) * 15;
                if (idx >= 0 && idx < map.length) glyphIdx = idx;
            }

            const u0 = map[glyphIdx + 7];
            const v0 = map[glyphIdx + 8];
            // const u1 = map[glyphIdx + 9];
            // const v1 = map[glyphIdx + 10];
            // const width = map[glyphIdx + 13];
            // const height = map[glyphIdx + 14];
            const x0 = x + map[glyphIdx + 11];
            const y0 = y + map[glyphIdx + 12];
            const halfWidth = map[glyphIdx + 13];
            const halfHeight = map[glyphIdx + 14];

            const uWidth = map[glyphIdx + 9] - u0;
            const vHeight = map[glyphIdx + 10] - v0;

            const v = this.vertexData;
            v[vIdx] = x0 + halfWidth;       // i_pos.x (center)
            v[vIdx + 1] = y0 + halfHeight;  // i_pos.y (center)
            v[vIdx + 2] = halfWidth;        // i_size.x (half width)
            v[vIdx + 3] = halfHeight;       // i_size.y (half height)

            v[vIdx + 4] = u0;               // uv.x
            v[vIdx + 5] = v0;               // uv.y
            v[vIdx + 6] = uWidth;           // uv.w
            v[vIdx + 7] = vHeight;          // uv.h
        }

        /**
         * Reserves a block of text for rendering.
         * The way this engine works and keeps it's performance is that it maintains a set reserve of characters and all text blocks use that space.
         * So to render some text, you first reserve a block of characters and then write to that block.
         * You can then freely update that text at any time as much as you want with great performance.
         * 
         * @param {*} text_or_size Amount of characters to reserve. If a string is provided, it will reserve space for that text and render it. If a number is provided, it will reserve that many characters worth of space.
         * @param {*} options Options for the text block.
         * @returns {TextBlock} A text block object that can be used to update the text later.
         */
        createText(text_or_size, options = {}) {
            const size = typeof text_or_size === 'string' ? text_or_size.length : text_or_size;
            return new TextBlock(this, size, options, text_or_size);
        }

        destroy() {
            if(this.vao) {
                this.renderer.gl.deleteVertexArray(this.vao);
                this.vao = null;
            }

            if(this.quadBuffer) {
                this.renderer.gl.deleteBuffer(this.quadBuffer);
                this.quadBuffer = null;
            }

            if(this.vertexBuffer) {
                this.renderer.gl.deleteBuffer(this.vertexBuffer);
                this.vertexBuffer = null;
            }

            if(this.texture) {
                this.renderer.gl.deleteTexture(this.texture);
                this.texture = null;
            }

            this.gridBuffer = null;
            this.vertexData = null;
            this.vertexByteView = null;
            this.cmap = null;
            this.font = null;

            super.destroy();
        }
    }

    /**
     * Text block class that represents a reserved block of text in the TextEngine.
     * You can update the text and color of this block at any time.
     * Charactes can be updated (glyph, color and position) individually or as a whole.
     */
    class TextBlock {
        constructor(engine, size, options = {}, text = "") {
            this.engine = engine;
            this.size = size;
            this.options = options;

            this.startIdx = engine.nextFree;
            engine.nextFree += size;

            if(typeof text === 'string' && text.length > 0) {
                this.setText(text);
            }
        }

        /**
         * Helper that sets the text for the text block.
         * @param {*} text The text to set. Newlines are supported.
         * @param {*} r Red color component (0-255)
         * @param {*} g Green color component (0-255)
         * @param {*} b Blue color component (0-255)
         * @param {*} a Alpha component (0-255)
         */
        setText(text, r = 255, g = 255, b = 255, a = 255) {
            const len = text.length;
            let x = this.options.x || 0;
            let y = this.options.y || 0;

            if(r && typeof r !== 'number') {
                [r, g, b, a] = LS.Color.parse(r, g, b, a);
            }

            let idx = this.startIdx;
            for (let i = 0; i < this.size; i++) {
                const charCode = i < len ? text.charCodeAt(i) : 0;
                this.setChar(idx, x, y, charCode, r, g, b, a);
                idx++;

                if(idx > this.startIdx + this.size) {
                    console.warn("TextBlock overflow: text exceeds reserved size, truncating. (Reserved size: " + this.size + ", text length: " + len + ")");
                    break;
                }

                x += this.engine.cellWidth;
                if (charCode === 10) { // Newline
                    x = 0;
                    y += this.engine.cellHeight * this.engine.lineHeight;
                }
            }
        }

        writeTextAt(text, startIdx = 0, len, x, y, r = 255, g = 255, b = 255, a = 255) {
            if(r && typeof r !== 'number') {
                [r, g, b, a] = LS.Color.parse(r, g, b, a);
            }

            let idx = this.startIdx + startIdx;
            for (let i = 0; i < len; i++) {
                const charCode = i < text.length ? text.charCodeAt(i) : 0;
                this.setChar(idx, x, y, charCode, r, g, b, a);
                idx++;

                if(idx > this.startIdx + this.size) {
                    console.warn("TextBlock overflow: text exceeds reserved size, truncating. (Reserved size: " + this.size + ", text length: " + text.length + ")");
                    break;
                }

                x += this.engine.cellWidth;
            }
        }

        /**
         * Readback the text from the text block.
         * Warning: This is a slow operation and should be avoided if possible.
         * Only intended for debugging purposes.
         * @returns {string} The text contained in the text block.
         */
        getText() {
            let text = [];
            for (let i = 0; i < this.size; i++) {
                const charCode = this.engine.gridBuffer[this.startIdx + i];
                if (charCode === 0) break;
                text.push(String.fromCharCode(charCode));
            }
            return text.join('');
        }

        /**
         * Iterates over the cells in the text block.
         * @returns {Generator} A generator yielding the index of each cell.
         */
        *iterateCells() {
            for (let i = 0; i < this.size; i++) {
                yield i;
            }
        }

        changeColor(r = 255, g = 255, b = 255, a = 255) {
            for (let i = 0; i < this.size; i++) {
                this.setChar(i, undefined, undefined, undefined, r, g, b, a);
            }
        }

        changePosition(x = 0, y = 0) {
            for (let i = 0; i < this.size; i++) {
                const cellIdx = this.startIdx + i;
                const charCode = this.engine.gridBuffer[cellIdx];
                if (charCode === 0) continue; // Skip empty cells

                const cellX = x + (i * this.engine.cellWidth);
                const cellY = y;

                this.setChar(i, cellX, cellY, undefined, undefined, undefined, undefined, undefined);
            }
        }

        /**
         * Sets a character and character color at the specified index.
         * @param {number} index - Index of the cell to update relative to this TextBlock's reserved space
         * @param {number} x - X position of the cell
         * @param {number} y - Y position of the cell
         * @param {number} charCode - Character code to set at the specified cell
         * @param {number} r - Red color component (0-255)
         * @param {number} g - Green color component (0-255)
         * @param {number} b - Blue color component (0-255)
         * @param {number} a - Alpha component (0-255)
         */
        setChar(index, x, y, charCode, r = 255, g = 255, b = 255, a = 255) {
            const cellIdx = this.startIdx + index;
            if (cellIdx < this.startIdx || cellIdx >= this.startIdx + this.size) {
                console.warn(`TextBlock.setChar: Index ${index} is out of bounds for reserved size ${this.size}.`);
                return;
            }

            // Clamp color values to [0, 255]
            if (r < 0) r = 0; else if (r > 255) r = 255;
            if (g < 0) g = 0; else if (g > 255) g = 255;
            if (b < 0) b = 0; else if (b > 255) b = 255;
            if (a < 0) a = 0; else if (a > 255) a = 255;

            this.engine._updateVertex(cellIdx, x, y, charCode, r, g, b, a);
        }
    }

    LS.LoadComponent({
        v: 2,
        version: "2.0.0-alpha.0",

        htmlParser,
        ortho,

        OrthographicCamera,
        PerspectiveCamera,

        // WebGL shader utilities
        stripShaderVersion,
        compileShader,
        createProgram,
        getShader,

        // WebGLRenderer class
        Renderer: WebGLRenderer,
        Renderable,
        
        // Misc utilities
        cyrb64,

        // Experimental
        TextEngine,

        // Shader presets
        shaders: {
            msdfVertex,
            msdfFragment,
            mtsdfFragment,

            basic_fullscreen_vertex: `#version 300 es

out vec2 vUV;

const vec2 positions[3] = vec2[](
    vec2(-1.0, -1.0),
    vec2( 3.0, -1.0),
    vec2(-1.0,  3.0)
);

void main() {
    vec2 pos = positions[gl_VertexID];
    vUV = pos * 0.5 + 0.5;
    gl_Position = vec4(pos, 0.0, 1.0);
}`
        },

        /**
         * Creates a new LS.Color instance from the given color input. The input can be any valid LS.Color input.
         * @param {LS.Color|string|Array|Object|number} r - The red component of the color or an LS.Color instance, any valid CSS color string, array, object, or a hex number.
         * @param {number} g - The green component of the color.
         * @param {number} b - The blue component of the color.
         * @param {number} a - The alpha component of the color.
         * @returns {Array} The color as a vec4 array [r, g, b, a] with values in the range [0, 1].
         */
        colorToVec4: (r, g, b, a = 1) => {
            if(r instanceof LS.Color) return r.floatPixel;

            // Parse the color
            [r, g, b, a] = LS.Color.parse(r, g, b, a);

            // Return the color as a vec4
            return [Math.fround(r / 255), Math.fround(g / 255), Math.fround(b / 255), Math.fround(a / 255)];
        },

        createRenderer(options = {}) {
            return new WebGLRenderer(options);
        },

        get animation() {
            throw new Error("LS.GL.animation is deprecated. See Animation2 (LS.Animation) component for the new animation system compatible with LS.GL.");
        }
    }, { name: "GL", global: true, dependencies: ["Color"] });

    console.warn("LS.GL is an early stage component. The API is not stable and may change in future releases. This component is not fully tested and may contain bugs.");
})();