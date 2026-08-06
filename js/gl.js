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

const quad = `const vec2 positions[4] = vec2[](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(1.0, 1.0));`

/**
 * MSDF shader for rendering text with MSDF fonts.
 * Optionally THREE.js compatible.
 * @version 1.0.0
 */
const msdfFragment = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
in vec4 v_color;
in float v_weight;

flat in uint v_style;

uniform sampler2D uTexture;
uniform float uPxRange;

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

    float alpha = clamp(screenPxRange * (sd - 0.5 + v_weight) + 0.5, 0.0, 1.0);

    // Apply a second anti-aliasing pass to smooth out the edges of the glyphs
    float aa = fwidth(sd);
    alpha = smoothstep(0.5 - aa, 0.5 + aa, sd);

    outColor = vec4(v_color.rgb, v_color.a * alpha);
}
`;

const mtsdfFragment = `#version 300 es
precision highp float;

in vec2 v_texCoord;
in vec4 v_color;
in float v_weight;

flat in uint v_style;

uniform sampler2D uTexture;
uniform float uPxRange;

out vec4 outColor;

float median(float r, float g, float b) {
    return max(min(r, g), min(max(r, g), b));
}

float screenPxRange() {
    vec2 texSize = vec2(textureSize(uTexture, 0));

    vec2 unitRange = vec2(uPxRange) / texSize;
    vec2 screenTexSize = 1.0 / fwidth(v_texCoord);

    return max(
        0.5 * dot(unitRange, screenTexSize),
        1.0
    );
}

void main() {
    vec4 tex = texture(uTexture, v_texCoord);

    float msdf = median(tex.r, tex.g, tex.b);
    float sdf = tex.a;

    float sd = mix(msdf, sdf, 0.15);

    vec2 texSize = vec2(textureSize(uTexture, 0));
    vec2 unitRange = vec2(uPxRange) / texSize;
    vec2 screenTexSize = 1.0 / fwidth(v_texCoord);

    float screenPxRange = max(
        0.5 * dot(unitRange, screenTexSize),
        1.0
    );

    float alpha = smoothstep(
        0.0,
        1.0,
        screenPxRange * (sd - 0.5) + 0.5
    );

    alpha = pow(alpha, 0.9);

    outColor = vec4(v_color.rgb, v_color.a * alpha);
}`;

/**
 * Fragment shader for rendering bitmap text.
 */
const bitmapFragment = `#version 300 es
precision highp float;

in vec2 v_texCoord;
in vec4 v_color;

uniform sampler2D uTexture;

out vec4 outColor;

void main() {
    float coverage = texture(uTexture, v_texCoord).r;

    outColor = vec4(
        v_color.rgb,
        v_color.a * coverage
    );
}`;

/**
 * Vertex shader for rendering MSDF text.
 * Optionally THREE.js compatible.
 * @version 1.0.0
 */
const fontVertex = `#version 300 es

${quad}

in vec2 i_pos;
in vec4 i_uvRect;
in vec4 i_color;
in vec2 i_size;
in uint i_weight;
in uint i_style;

in float glyphDepth;

uniform mat4 uProjection;
uniform vec2 uOffset;

#ifdef USE_THREE_MATRICES
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
#endif

out vec2 v_texCoord;
out vec4 v_color;
flat out uint v_style;
out float v_weight;

void main() {
    vec2 pos = (i_pos + (positions[gl_VertexID] * i_size)) + uOffset;

#ifdef USE_THREE_MATRICES
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, glyphDepth, 1.0);
#else
    vec4 p = uProjection * vec4(pos, 0.0, 1.0);
    p.z = glyphDepth;
    gl_Position = p;
#endif

    vec2 uv = i_uvRect.xy + (positions[gl_VertexID] * 0.5 + 0.5) * i_uvRect.zw;

    v_texCoord = uv;
    v_color = i_color;
    v_style = i_style;
    v_weight = float(i_weight);
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
     * @returns The compiled shader program or null if compilation failed
     */
    function createProgram(renderer, vertex, fragment) {
        if (!(renderer instanceof WebGLRenderer)) throw new Error("Parent is not a LS.GL.WebGLRenderer instance.");
        if (!renderer.gl) throw new Error("Parent does not have a WebGL context.");

        const gl = renderer.gl;
        const program = gl.createProgram();

        if(vertex.shader) vertex = vertex.shader;
        if(fragment.shader) fragment = fragment.shader;

        vertex =   vertex   instanceof WebGLShader ? vertex   : compileShader(renderer, gl.VERTEX_SHADER, vertex)?.shader;
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
     * TODO: Support for multiple backends (eg. WebGPU, THREE.JS, etc.)
     * 
     * @experimental
     */
    class Renderer extends LS.Context {
        static backend = "Abstract";

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

        createRenderable(options = {}, append = false) {
            options.parent = this;
            const renderable = new Renderable(options);
            if (append) {
                this.renderables.push(renderable);
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

            this.x = null;
            this.y = null;
            this.width = null;
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
        render(now = false) {
            if (!this.initialized) return;

            if (now) {
                this.tick(0, performance.now(), this.activeCamera);
            }

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
                alpha:     options.alpha !== false,
                depth:     options.depth !== false,
                stencil:   options.stencil !== false,
                preserveDrawingBuffer: options.preserveDrawingBuffer === true
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

            // Update buffers and such
            // this.quickEmit("render", delta, now, cw, ch, updatedDimensions);

            if(target) {
                this.renderOne(target, delta, now, camera, false, updatedDimensions);
            } else {
                for(const renderable of this.renderables) {
                    this.renderOne(renderable, delta, now, camera, false, updatedDimensions);
                }
            }
        }

        renderOne(renderable, delta = 0, now = null, camera = null, clear = false, updateDimensions = false) {
            if(!renderable || renderable.enabled === false || renderable.destroyed) return;

            const hasRenderMethod = typeof renderable.render === "function";

            if(renderable.renderables) {
                if(typeof renderable.rect === "object" || typeof renderable.viewport === "object") {
                    const rect = renderable.viewport || renderable.rect;
                    if(rect.width < 1 || rect.height < 1) return;
                    this.viewport(rect.x, rect.y, rect.width, rect.height);
                }

                renderable = renderable.renderable || renderable.renderables;
            }

            if(Array.isArray(renderable)) {
                for(const r of renderable) {
                    this.renderOne(r, delta, now, camera, clear, updateDimensions);
                }
                return;
            }

            if(!hasRenderMethod) {
                console.warn("Renderable doesn't provide a render method.");
                return;
            }

            const gl = this.gl;
            const cw = this.viewportWidth || this.width;
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

            if(renderable.__bindVAO && renderable.vao) {
                gl.bindVertexArray(renderable.vao);
            }

            renderable.render(delta || 0, now || performance.now(), gl, cw, ch, updateDimensions, renderable.uniforms, renderable.attributes, camera? camera.projectionMatrix: this.activeCamera.projectionMatrix);

            if(renderable.__bindVAO && renderable.vao) {
                gl.bindVertexArray(null);
            }
        }

        renderMany(renderables, delta = 0, now = null, camera = null, clear = false) {
            if(!Array.isArray(renderables)) throw new Error("renderMany expects an array of renderables.");
            for(const renderable of renderables) {
                this.renderOne(renderable, delta, now, camera, clear);
                clear = false; // Only clear on the first renderable
            }
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

        addRenderable(renderable) {
            if(!renderable) return;

            if(renderable.boundingContainer) {
                renderable._resizeObserver = null;
                renderable._resizeObserver = new ResizeObserver(() => {
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

                    this.renderOne(renderable, 0, performance.now(), this.activeCamera, false, true);
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
        }

        destroyRenderable(renderable) {
            if(!renderable) return;

            if(renderable.renderables) {
                for(const r of renderable.renderables) {
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
            super.destroy();

            // Destroy the WebGL context last to ensure all resources are cleaned up first
            if(this.gl) {
                this.gl.getExtension('WEBGL_lose_context')?.loseContext();
                this.gl = null;
            }
        }
    }

    const GL_ENUMS = WebGL2RenderingContext.prototype;
    function bufferFrom(type, size) {
        switch(type.toLowerCase()) {
            case "float":
            case GL_ENUMS.FLOAT:
                return new Float32Array(size);
            case "int":
            case GL_ENUMS.INT:
                return new Int32Array(size);
            case "uint":
            case GL_ENUMS.UNSIGNED_INT:
                return new Uint32Array(size);
            case "short":
            case GL_ENUMS.SHORT:
                return new Int16Array(size);
            case "ushort":
            case GL_ENUMS.UNSIGNED_SHORT:
                return new Uint16Array(size);
            case "byte":
            case GL_ENUMS.BYTE:
                return new Int8Array(size);
            case "ubyte":
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
        constructor(options = {}) {
            this.renderer = options.renderer || options.parent;

            if(!this.renderer || !(this.renderer instanceof Renderer)) throw new Error("Renderable requires a LS.WebGLRenderer instance in options.");
            if(!this.renderer.gl) throw new Error("Renderable requires a GL context.");

            const gl = this.renderer.gl;

            this.program = options.program || (options.vertex && options.fragment ? createProgram(this.renderer, options.vertex, options.fragment) : null);

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
                this.__bindVAO = true;
            }

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

                if(this.__bindVAO && this.vao) {
                    gl.bindVertexArray(null);
                }
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
            if( left !== null ) this.left = left;
            if( right !== null ) this.right = right;
            if( bottom !== null ) this.bottom = bottom;
            if( top !== null ) this.top = top;
            if( near !== null ) this.near = near;
            if( far !== null ) this.far = far;

            Camera.ortho(this.projectionMatrix, this.left, this.right, this.bottom, this.top, this.near, this.far);
        }

        setPerspective(fov = null, aspect = null, near = null, far = null) {
            this.type = Camera.PERSPECTIVE;
            if( fov !== null ) this.fov = fov;
            if( aspect !== null ) this.aspect = aspect;
            if( near !== null ) this.near = near;
            if( far !== null ) this.far = far;

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
            // out[1] = 0;
            // out[2] = 0;
            // out[3] = 0;

            // out[4] = 0;
            out[5] = 2 / (top - bottom);
            // out[6] = 0;
            // out[7] = 0;

            // out[8] = 0;
            // out[9] = 0;
            out[10] = -2 / (far - near);
            // out[11] = 0;

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
            // out[1] = 0;
            // out[2] = 0;
            // out[3] = 0;

            // out[4] = 0;
            out[5] = f;
            // out[6] = 0;
            // out[7] = 0;

            // out[8] = 0;
            // out[9] = 0;
            out[10] = (far + near) * nf;
            // out[11] = -1;

            out[12] = 0;
            out[13] = 0;
            out[14] = (2 * far * near) * nf;
            out[15] = 0;
        }
    }

    const globalFontCache = new Map();

    class WebGLMSDFFont {
        constructor(options = {}) {
            const src = LS.Util.normalizePath(options.fontSrc || ('./assets/fonts/' + (options.fontName || 'JetBrainsMono')));
            if(globalFontCache.has(src)) {
                console.debug(`Font "${src}" is already loaded. Using cached version.`);
                return globalFontCache.get(src);
            }

            this.options = options;
            this.loaded = false;
            this.loading = false;

            this.fontData = null;
            this.fontImage = null;
            this.fontSrc = src;

            this.__promise = null;

            globalFontCache.set(src, this);
        }

        /**
         * Important TODO: Somehow, with the new font map changes (to Chlumsky/msdf-atlas-gen from msdf-bmfont-xml), rendering got really slow (_updateVertex now takes up to 4x the time!!) AND worse quality (scaling issues, bad quality when up close).
         * It has to be refactored at some point.
         */
        async loadFont() {
            if(this.loading) {
                if(this.__promise) {
                    await this.__promise;
                } else {
                    throw new Error("Font is already loading, but no promise is available.");
                }
            }

            if(this.loaded) return;

            const src = this.fontSrc;
            if(!src) throw new Error("Font source not specified.");

            this.loading = true;

            const imgUrl = src + "/" + (this.options.atlasFile || "atlas.png");

            const [fontData, image] = await (this.__promise = Promise.all([
                fetch(src + "/" + (this.options.fontDataFile || "font.json")).then(r => r.json()),

                new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                    img.src = imgUrl;
                })
            ]));

            this.__promise = null;

            // Number of floats per character in the cmap
            const MAP_SLOTS = 13;

            const baseFontSize = fontData.atlas.size || 24;
            const metrics = fontData.metrics || {};

            const version = fontData.version || 1;

            // v1 stores glyphs as an object, v2 stores glyphs as an arraybuffer encoded in base64

            let glyphView = null, glyphStride = fontData.byteStride || 0, glyphCount = fontData.glyphs.length;
            if(version === 2) {
                // Convert the base64 string to an ArrayBuffer
                const glyphsBinaryData = Uint8Array.fromBase64(fontData.glyphs);
                glyphCount = glyphsBinaryData.length / glyphStride;
                glyphView = new DataView(glyphsBinaryData.buffer, glyphsBinaryData.byteOffset, glyphsBinaryData.byteLength);

                // I was lazy so for now we just convert it back to an object

                fontData.glyphs = [];
                for (let i = 0; i < glyphCount; i++) {
                    const offset = i * glyphStride;
                    fontData.glyphs.push({
                        i: glyphView.getUint16(offset),
                        gI: glyphView.getUint16(offset + 2),
                        code: glyphView.getUint16(offset + 4),
                        advance: glyphView.getUint16(offset + 6),
                        planeBounds: {
                            top: glyphView.getFloat32(offset + 8),
                            left: glyphView.getFloat32(offset + 12),
                            bottom: glyphView.getFloat32(offset + 16),
                            right: glyphView.getFloat32(offset + 20)
                        },
                        atlasBounds: {
                            top: glyphView.getFloat32(offset + 24),
                            left: glyphView.getFloat32(offset + 28),
                            bottom: glyphView.getFloat32(offset + 32),
                            right: glyphView.getFloat32(offset + 36)
                        }
                    });
                }
            }

            const lowestCharCode = Math.min(...fontData.glyphs.map(c => c.code || Infinity));
            const highestCharCode = Math.max(...fontData.glyphs.map(c => c.code || 0));

            const hasBottomOrigin = fontData.atlas?.yOrigin === "bottom";
            const baselinePx = (metrics.ascender || 0) * baseFontSize;

            // Pack the font data into a Float32Array
            const map = new Float32Array((highestCharCode - lowestCharCode + 1) * MAP_SLOTS); // +1 for missing glyph

            // Precompute as much as possible
            for (let i = 0; i < glyphCount; i++) {
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
                map[(code - lowestCharCode) * MAP_SLOTS + 11] = xOff;
                map[(code - lowestCharCode) * MAP_SLOTS + 12] = yOff;
            }

            // Font metrics
            const spaceCharData = fontData.glyphs.find(c => c.code === 32) || fontData.glyphs[0];
            const baseCellWidth = (spaceCharData?.advance || 0.6) * baseFontSize;
            const baseCellHeight = baseFontSize;

            this.cmap = map;
            this.stride = MAP_SLOTS;
            this.atlas = fontData.atlas;
            this.fontData = fontData;
            this.baseCellWidth = baseCellWidth;
            this.baseCellHeight = baseCellHeight;
            // this._missingGlyphIndex = (highestCharCode - lowestCharCode + 1) * MAP_SLOTS;
            this._missingGlyphIndex = (32 - lowestCharCode) * MAP_SLOTS; // Use space character as missing glyph
            this._lowestCharCode = lowestCharCode;

            if(fontData.nameMap) {
                this.nameMap = new Map(fontData.nameMap);
            }

            this.image = image;

            this.loaded = true;
            this.loading = false;
        }

        createTexture(renderer) {
            if(this.destroyed) {
                throw new Error("Font has been destroyed. Cannot create texture.");
            }

            if (!this.loaded) {
                throw new Error("Font not loaded yet. Await loadFont() first.");
            }

            const gl = renderer.gl;
            const texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.image);

            if((this.atlas.type === "softmask" || this.atlas.type === "hardmask") && this.options.nearestFilter) {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            } else {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            }

            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.bindTexture(gl.TEXTURE_2D, null);
            return texture;
        }

        setUniforms(gl, uniforms) {
            if(this.destroyed) {
                throw new Error("Font has been destroyed. Cannot set uniforms.");
            }

            if (!this.loaded) {
                throw new Error("Font not loaded yet. Await loadFont() first.");
            }

            gl.uniform1f(uniforms.uPxRange, this.atlas?.distanceRange || 4.0);
            gl.uniform1f(uniforms.uGamma, 1.4);
        }

        destroy() {
            this.cmap = null;
            this.baseCellWidth = null;
            this.baseCellHeight = null;
            this._missingGlyphIndex = null;
            this._lowestCharCode = null;
            this.loaded = false;
            this.image = null;
            this.atlas = null;
            this.options = null;
            this.fontData = null;
            this.loading = false;
            this.destroyed = true;
        }
    }

    /**
     * MSDF/MTSDF text rendering using WebGL2.
     * Note that instancing this is expensive, so I recommend reusing the same instance for multiple text objects.
     * 
     * VERY experimental and not production ready, use at your own risk.
     * Has gotten quite slow so more optimization is needed at some point but I am not doing that now.
     * @experimental
     */

    const fragmentsByType = {
        msdf: msdfFragment,
        mtsdf: mtsdfFragment,
        // sdf: sdfFragment,
        softmask: bitmapFragment
    };

    class WebGLTextEngine extends Renderable {
        constructor(options = {}) {
            super({
                fragment: fragmentsByType[options.type || "msdf"] || msdfFragment,
                vertex: fontVertex,
                uniforms: ["uProjection", "uOffset", "uTexture", "uPxRange", "uGamma"],
                attributes: ["i_pos", "i_size", "i_weight", "i_style", "i_uvRect", "i_color", "glyphDepth"],
                vao: true,
                ...options
            });

            this.font = options.font || new WebGLMSDFFont(options);
            if(!(this.font instanceof WebGLMSDFFont)) throw new Error("TextEngine requires a WebGLMSDFFont instance in options.font.");

            this.instanceCount = 0;
            this.__lowestDirty = 0;
            this.__highestDirty = 0;

            this.defaultFontSize = 16;

            this.cellWidth = 0;
            this.cellHeight = 0;

            this.offsetX = 0;
            this.offsetY = 0;

            this.cellSize  = 0;
            this.cellSizeF = 0;

            if(typeof options.manualRendering === "undefined") {
                // Default to manual rendering (text won't be auto-rendered in the main render loop)
                // Depends on how you plan to use the TextEngine.
                // - If you want to render text automatically as a regular renderable, set manualRendering to false.
                // - If you want to control when and where the text is rendered individually, set manualRendering to true.
                options.manualRendering = true;
            }

            this.lineHeight = 1.2; // Line height multiplier for vertical spacing

            this.nextFree = 0;

            this.setOptions(options);
            this.loadPromise = this.setup(this.renderer.gl, this.program, this.uniforms, this.attributes, options);
        }

        async setup(gl, program, uniforms, attributes, options) {
            if(!this.font.loaded) {
                await this.font.loadFont();
            }

            gl.useProgram(program);
            gl.bindVertexArray(this.vao);

            this.vertexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);

            gl.enableVertexAttribArray(attributes.i_pos);
            gl.vertexAttribDivisor(attributes.i_pos, 1);
            gl.enableVertexAttribArray(attributes.i_size);
            gl.vertexAttribDivisor(attributes.i_size, 1);
            gl.enableVertexAttribArray(attributes.i_uvRect);
            gl.vertexAttribDivisor(attributes.i_uvRect, 1);
            gl.enableVertexAttribArray(attributes.i_weight);
            gl.vertexAttribDivisor(attributes.i_weight, 1);
            gl.enableVertexAttribArray(attributes.i_style);
            gl.vertexAttribDivisor(attributes.i_style, 1);
            gl.enableVertexAttribArray(attributes.i_color);
            gl.vertexAttribDivisor(attributes.i_color, 1);
            gl.enableVertexAttribArray(attributes.glyphDepth);
            gl.vertexAttribDivisor(attributes.glyphDepth, 1);
            this._setArrayOffset(0, true);
            this.setBufferSize(options.bufferSize || 2048);

            // TODO: reuse texture across multiple TextEngine instances for the same renderer
            this.texture = this.font.createTexture(this.renderer);
            this.font.setUniforms(gl, uniforms);

            if(!this.lineHeight) this.lineHeight = options.lineHeight || this.font.metrics.lineHeight || 1.2;

            this.baseScale = 16 / this.font.atlas.size;
            this.cellWidth = this.font.baseCellWidth * this.baseScale;
            this.cellHeight = this.font.baseCellHeight * this.baseScale;

            gl.bindVertexArray(null);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
            gl.useProgram(null);
        }

        setBufferSize(numCells) {
            // Backing buffers to remember grid state for resizing & skipping updates
            this.gridBuffer      = new Uint16Array(numCells);
            this.vertexData      = new Float32Array(numCells * this.cellSizeF);
            this.vertexByteView  = new Uint8Array  (this.vertexData.buffer);
            this.vertexShortView = new Uint16Array (this.vertexData.buffer);

            const gl = this.renderer.gl;
            gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, this.vertexData, gl.DYNAMIC_DRAW);

            this.instanceCount = numCells;
            this.__lowestDirty = this.instanceCount;
            this.__highestDirty = 0;
            this.nextFree = 0;
        }

        clear() {
            if (!this.gridBuffer) return;
            this.gridBuffer.fill(0);
            this.vertexData.fill(0);
            this.__lowestDirty = 0;
            this.__highestDirty = this.instanceCount;
            this.nextFree = 0;
        }

        setOptions(newOptions) {
            if (newOptions.fontSrc && this.gl) {
                this.loadFont(newOptions.fontSrc);
            }

            if (typeof newOptions.manualRendering !== "undefined") {
                this.manualRendering = newOptions.manualRendering;
            }

            if (typeof newOptions.staticColor !== "undefined") {
                this.staticColor = newOptions.staticColor;
            }
        }

        get staticColor() {
            return this._staticColor;
        }

        set staticColor(value) {
            if (value !== null && (!Array.isArray(value))) {
                throw new Error("Invalid staticColor option: expected an array of 4 values [r, g, b, a].");
            }

            const gl = this.renderer.gl;
            gl.bindVertexArray(this.vao);
            gl.disableVertexAttribArray(this.attributes.i_color);
            gl.vertexAttrib4f(this.attributes.i_color, value[0] / 255, value[1] / 255, value[2] / 255, (value[3] || 255) / 255);
            gl.bindVertexArray(null);

            this._staticColor = value;
        }

        render(delta, now, gl, cw, ch, updatedDimensions, uniforms, attributes, projectionMatrix) {
            // if(this.manualRendering || this.nextFree === 0) return;
            if(this.nextFree === 0) return;
            this.updateBuffers();

            // -- Render text grid
            // Scale the MSDF pixel range to keep edges crisp at different font sizes
            if(updatedDimensions) {
                gl.uniformMatrix4fv(uniforms.uProjection, false, projectionMatrix);
            }

            gl.uniform2f(uniforms.uOffset, this.offsetX, this.offsetY);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.uniform1i(uniforms.uTexture, 0);
            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nextFree);
        }

        renderRange(startIdx, endIdx, projectionMatrix) {
            if(endIdx <= startIdx) return;
            const gl = this.renderer.gl;

            // TODO: Check if the program is already in use to avoid unnecessary state changes
            // if (this.renderer.gl.getParameter(gl.CURRENT_PROGRAM) !== this.program) {
            // }

            gl.useProgram(this.program);
            gl.bindVertexArray(this.vao);

            const uniforms = this.uniforms;

            this.updateBuffers();
            this._setArrayOffset(startIdx);

            gl.uniformMatrix4fv(uniforms.uProjection, false, projectionMatrix || this.renderer.activeCamera?.projectionMatrix);

            gl.uniform2f(uniforms.uOffset, this.offsetX, this.offsetY);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.uniform1i(uniforms.uTexture, 0);
            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, endIdx - startIdx);

            gl.bindVertexArray(null);
            gl.useProgram(null);
        }

        /**
         * Sets the vertex attribute pointers for the instanced rendering
         */
        _setArrayOffset(startIdx = 0, force = false) {
            if(!force && startIdx === this.__lastArrayOffset) return;
            this.__lastArrayOffset = startIdx;

            // Shift the whole array since why have a proper range draw call
            const gl = this.renderer.gl;

            const attributes = this.attributes;
            const stride = (8 * 4) + (2 * 2) + (4 * 1) + (4 * 1);

            this.cellSize = stride;      // Number of bytes per instance
            this.cellSizeF = stride / 4; // Number of floats per instance

            let offset = 0;
            gl.vertexAttribPointer (attributes.i_pos,    2, gl.FLOAT,          false, stride, startIdx * stride);
            offset += 8;

            gl.vertexAttribPointer (attributes.i_size,   2, gl.FLOAT,          false, stride, startIdx * stride + offset);
            offset += 8;

            gl.vertexAttribPointer (attributes.i_uvRect, 4, gl.FLOAT,          false, stride, startIdx * stride + offset);
            offset += 16;

            gl.vertexAttribIPointer(attributes.i_weight, 1, gl.UNSIGNED_SHORT,        stride, startIdx * stride + offset);
            offset += 2;

            gl.vertexAttribIPointer(attributes.i_style,  1, gl.UNSIGNED_SHORT,        stride, startIdx * stride + offset);
            offset += 2;

            // TODO: split the color buffer or possibly use palettes
            gl.vertexAttribPointer (attributes.i_color,  4, gl.UNSIGNED_BYTE,  true,  stride, startIdx * stride + offset);
            offset += 4;

            gl.vertexAttribPointer (attributes.glyphDepth, 1, gl.FLOAT,        false, stride, startIdx * stride + offset);

            if(this.staticColor) {
                this.staticColor = this.staticColor;
            }
        }

        /**
         * Updates the vertex data for a single cell in the grid. Does not clamp values or check bounds.
         * @param {number} cellIdx - Index of the cell to update
         * @param {number} x - X position of the cell
         * @param {number} y - Y position of the cell
         * @param {number} charCode - Optional new character code for the cell. If undefined, the character will not be changed.
         * 
         * @param {number} r - Optional new red color component (0-255). If undefined, the red component will not be changed.
         * @param {number} g - Optional new green color component (0-255). If undefined, the green component will not be changed.
         * @param {number} b - Optional new blue color component (0-255). If undefined, the blue component will not be changed.
         * @param {number} a - Optional new alpha component (0-255). If undefined, the alpha component will not be changed.
         * 
         * @param {number} size - Optional new size for the cell.
         * @param {number} style - Optional new style for the cell.
         * @param {number} weight - Optional new weight for the cell.
         * 
         * @returns {number} The xadvance value for the character, which can be used for cursor movement.
         */
        _updateVertex(cellIdx, x, y, charCode, r, g, b, a, size, style, weight, depth) {
            const font = this.font;
            if(!font || !font.cmap) return;

            // Should be optimized, kind of sucks we have to do a lookup for every character
            const map = font.cmap;
            let glyphIdx = font._missingGlyphIndex;
            // if (glyphIdx >= map.length) glyphIdx = 0;
            if (charCode >= font._lowestCharCode) {
                const idx = (charCode - font._lowestCharCode) * font.stride;
                if (idx >= 0 && idx < map.length) glyphIdx = idx;
            }

            const xadvance = (font._missingGlyphIndex === glyphIdx && charCode !== 32)? 0: (map[glyphIdx + 6] || font.baseCellWidth) * size;

            // Dirty glyph (for now we only care to render if glyph changes through this function)

            let updateChar = false;
            const updatePos = x !== undefined || y !== undefined || size !== undefined;
            const updateColor = !this.staticColor && (r !== undefined || g !== undefined || b !== undefined || a !== undefined);
            const updateStyle = style !== undefined || weight !== undefined;

            const f32Idx = cellIdx * this.cellSizeF;
            if(charCode !== undefined) {
                updateChar = this.gridBuffer[cellIdx] !== charCode;
                this.gridBuffer[cellIdx] = charCode;

                // if(charCode === 61 && this.gridBuffer[cellIdx - 1] === 62) {
                //     // Handle => ligature as an example
                //     // TODO
                //     this._updateVertex(cellIdx - 1, x, y, 65536, r, g, b, a, size, style, weight); // Use a char code outside of the normal range to indicate a ligature
                //     return;
                // }
            } else if(!updateColor && !updatePos && !updateStyle) {
                return xadvance; // No updates needed
            }

            // Update color
            if(updateColor) {
                const u8 = this.vertexByteView;
                const u8Idx = f32Idx * 4;
                if(r !== undefined)      u8 [u8Idx + 36] = r; // i_color.r
                if(g !== undefined)      u8 [u8Idx + 37] = g; // i_color.g
                if(b !== undefined)      u8 [u8Idx + 38] = b; // i_color.b
                if(a !== undefined)      u8 [u8Idx + 39] = a; // i_color.a
            }

            // Update weight and style
            if(updateStyle) {
                const u16 = this.vertexShortView;
                const u16Idx = f32Idx * 2;
                if(weight !== undefined) u16[u16Idx + 16] = weight;  // i_weight
                if(style !== undefined)  u16[u16Idx + 17] = style;   // i_style
            }

            this.__lowestDirty = Math.min(this.__lowestDirty || f32Idx - this.cellSizeF, f32Idx - this.cellSizeF);
            this.__highestDirty = Math.max(this.__highestDirty || f32Idx + this.cellSizeF, f32Idx + this.cellSizeF);

            if(depth !== undefined) {
                const f32 = this.vertexData;
                f32[f32Idx + 10] = depth; // glyphDepth
            }

            if(!updateChar && !updatePos) return xadvance;

            const f32 = this.vertexData;

            // Update UVs if the character has changed
            if(updateChar) {
                const u0 = map[glyphIdx + 7];
                const v0 = map[glyphIdx + 8];
                const uWidth = map[glyphIdx + 9] - u0;
                const vHeight = map[glyphIdx + 10] - v0;
                      f32[f32Idx + 4] = u0;               // uv.x
                      f32[f32Idx + 5] = v0;               // uv.y
                      f32[f32Idx + 6] = uWidth;           // uv.w
                      f32[f32Idx + 7] = vHeight;          // uv.h
            }

            // Update position and size if needed
            if(updatePos) {
                const scale = size / font.atlas.size;
                const x0 = x + map[glyphIdx + 11]            * scale;
                const y0 = y + map[glyphIdx + 12]            * scale;
                const halfWidth =  (map[glyphIdx + 2]) * 0.5 * scale;
                const halfHeight = (map[glyphIdx + 3]) * 0.5 * scale;
                    f32[f32Idx] =     x0 + halfWidth;   // i_pos.x (center)
                    f32[f32Idx + 1] = y0 + halfHeight;  // i_pos.y (center)
                    f32[f32Idx + 2] = halfWidth;        // i_size.x (half width)
                    f32[f32Idx + 3] = halfHeight;       // i_size.y (half height)
            }

            // Return the advance for cursor movement
            return xadvance;
        }

        updateBuffers() {
            if (this.__lowestDirty >= this.__highestDirty) return;
            const gl = this.renderer.gl;

            gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);

            if (this.__lastSize !== this.vertexData.byteLength) {
                gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.byteLength, gl.DYNAMIC_DRAW);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertexData);
                this.__lastSize = this.vertexData.byteLength;
            } else {
                this.__lowestDirty = Math.max(Math.min(this.__lowestDirty || this.vertexData.length, this.__highestDirty || 0), 0);
                this.__highestDirty = Math.max(this.__highestDirty || 0, this.__lowestDirty || 0);

                const data = this.vertexData.subarray(this.__lowestDirty, this.__highestDirty);
                gl.bufferSubData(gl.ARRAY_BUFFER, this.__lowestDirty * 4, data);
            }

            this.__lowestDirty = this.__lowestDirty || 0;
            this.__highestDirty = this.__highestDirty || this.nextFree * this.cellSizeF;
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

        destroy(destroyFont = false) {
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

            if(this.font && destroyFont) {
                this.font.destroy();
            }
            this.font = null;

            this.gridBuffer = null;
            this.vertexData = null;
            this.vertexByteView = null;

            super.destroy();
        }
    }

    /**
     * Text block class that represents a reserved block of text in the TextEngine.
     * You can update the text and color of this block at any time.
     * Charactes can be updated (glyph, color and position) individually or as a whole.
     * 
     * This class should not be used directly.
     */
    class TextBlock {
        constructor(engine, size, options = {}, text = "") {
            this.engine = engine;
            this.size = size;
            this.options = options;

            this.startIdx = engine.nextFree;
            engine.nextFree += size;

            this.__clippedStartIdx = this.startIdx;
            this.__clippedEndIdx = this.startIdx + size;

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
         * @param {*} size Font size
         * @param {*} style Font style
         * @param {*} weight Font weight
         */
        setText(text, r = 255, g = 255, b = 255, a = 255, size = this.engine.defaultFontSize, style = 0, weight = 0) {
            const len = text.length;
            let x = this.options.x || 0;
            let y = this.options.y || 0;

            if(r && typeof r !== 'number') {
                [r, g, b, a] = LS.Color.parse(r, g, b, a);
            }

            let idx = 0;
            for (let i = 0; i < this.size; i++) {
                const charCode = i < len ? text.charCodeAt(i) : 0;
                const advance = this.setChar(idx, x, y, charCode, r, g, b, a, size, style, weight);
                idx++;

                if(idx > this.startIdx + this.size) {
                    // console.warn("TextBlock overflow: text exceeds reserved size, truncating. (Reserved size: " + this.size + ", text length: " + len + ")");
                    break;
                }

                x += advance;
                if (charCode === 10) { // Newline
                    x = 0;
                    y += this.engine.cellHeight * this.engine.lineHeight;
                }
            }
        }

        writeTextAt(text, startIdx = 0, len, x, y, r = 255, g = 255, b = 255, a = 255, size = this.engine.defaultFontSize, style, weight, depth) {
            if(r && typeof r !== 'number') {
                [r, g, b, a] = LS.Color.parse(r, g, b, a);
            }

            let idx = startIdx;
            for (let i = 0; i < len; i++) {
                const charCode = i < text.length ? typeof text === 'number' ? text : typeof text === 'string' ? text.charCodeAt(i) : text[i] : 0;
                const advance = this.setChar(idx, x, y, charCode, r, g, b, a, size, style, weight, depth);
                idx++;

                if(idx > this.startIdx + this.size) {
                    // console.warn("TextBlock overflow: text exceeds reserved size, truncating. (Reserved size: " + this.size + ", text length: " + text.length + ")");
                    break;
                }

                x += advance;
            }
            return this;
        }

        clear(startIdx = 0, len = this.size) {
            startIdx = Math.max(0, Math.floor(startIdx));
            len = Math.max(0, Math.floor(len));

            let idx = this.startIdx + startIdx;
            for (let i = this.startIdx + startIdx; i < this.startIdx + startIdx + len; i++) {
                if (i >= this.startIdx + this.size) {
                    break;
                }
                this.setChar(i, undefined, undefined, 0, 0, 0, 0, 0);
            }
        }

        clip(startIdx = 0, len = this.size) {
            startIdx = Math.max(0, Math.floor(startIdx));
            len = Math.max(0, Math.floor(len));
            this.__clippedStartIdx = this.startIdx + startIdx;
            this.__clippedEndIdx = Math.min(this.startIdx + startIdx + len, this.startIdx + this.size);
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

        /**
         * Renders the text block to the screen. This should be called after all updates to the text block have been made.
         */
        render() {
            if(this.__clippedStartIdx >= this.__clippedEndIdx) return;
            this.engine.renderRange(this.__clippedStartIdx, this.__clippedEndIdx);
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
         * @param {number} size - Font size
         * @param {number} style - Font style
         * @param {number} weight - Font weight
         * All values are optional. If a value is not provided, the existing value for that attribute will be retained.
         * @param {number} depth - Glyph depth
         */
        setChar(index, x, y, charCode, r = 255, g = 255, b = 255, a = 255, size = this.engine.defaultFontSize, style, weight, depth) {
            const cellIdx = this.startIdx + index;
            if (cellIdx < this.startIdx || cellIdx >= this.startIdx + this.size) {
                return;
            }

            // Clamp color values to [0, 255]
            if (r < 0) r = 0; else if (r > 255) r = 255;
            if (g < 0) g = 0; else if (g > 255) g = 255;
            if (b < 0) b = 0; else if (b > 255) b = 255;
            if (a < 0) a = 0; else if (a > 255) a = 255;

            return this.engine._updateVertex(cellIdx, x, y, charCode, r, g, b, a, size, style, weight, depth);
        }
    }

    /**
     * A simple GPU buffer wrapper class that manages a WebGL buffer and its associated data.
     * It tracks dirty regions and only updating those regions when necessary.
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
            if(typeof location !== 'number' || location < 0) {
                throw new Error("bindToAttribute expects a valid attribute location (non-negative integer) as the first argument. Got: " + location);
            }

            if(typeof size !== 'number' || size <= 0) {
                throw new Error("bindToAttribute expects a valid size (positive integer) as the second argument. Got: " + size);
            }

            if(typeof type !== 'number') {
                switch(this.data.constructor) {
                    case Uint8Array:    type = this.gl.UNSIGNED_BYTE; break;
                    case Uint16Array:   type = this.gl.UNSIGNED_SHORT; break;
                    case Uint32Array:   type = this.gl.UNSIGNED_INT; break;
                    case Int8Array:     type = this.gl.BYTE; break;
                    case Int16Array:    type = this.gl.SHORT; break;
                    case Int32Array:    type = this.gl.INT; break;
                    case Float32Array:  type = this.gl.FLOAT; break;
                    case Float64Array:  throw new Error("WebGL does not support Float64Array for vertex attributes.");
                    default:
                        throw new Error("bindToAttribute could not determine the correct WebGL type for the provided data. Please specify the 'type' parameter explicitly.");
                }
            }

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
            this.gl.enableVertexAttribArray(location);

            // while (this.gl.getError() !== this.gl.NO_ERROR) {}
            if((this.isInt || this.isUInt) && normalized === false) {
                this.gl.vertexAttribIPointer(location, size, type, stride, offset);
            } else {
                this.gl.vertexAttribPointer(location, size, type, normalized, stride, offset);
            }
            // console.log(this.gl.getError());

            // verify that it is active:
            const isEnabled = this.gl.getVertexAttrib(location, this.gl.VERTEX_ATTRIB_ARRAY_ENABLED);
            if (!isEnabled) {
                console.warn(`bindToAttribute: Failed to enable vertex attribute at location ${location}.`);
            }

            if (divisor !== undefined) {
                this.gl.vertexAttribDivisor(location, divisor); // For instanced rendering
            }
            return this;
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

    LS.LoadComponent({
        v: 2,
        version: "2.0.0-alpha.0",

        htmlParser,

        Camera,

        // WebGL shader utilities
        stripShaderVersion,
        compileShader,
        createProgram,
        getShader,

        // WebGLRenderer class
        WebGLRenderer,
        // VirtualWebGLRenderer,
        Renderable,
        WebGLBuffer,
        WebGLMSDFFont,

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
                LS.prepareEvent("global-composite-layer", { completed: false, data: null });
                LS._compositeLayer?.remove();
                LS._compositeLayer = null;
            }
        },

        // Experimental
        WebGLTextEngine,

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
            msdfVertex: fontVertex,
            msdfFragment,
            mtsdfFragment,

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
in vec3 iColor;
${extra_attributes? extra_attributes.map(attr => `in ${attr.type} i${attr.name};${attr.type === "uint"? "flat ": ""}out ${attr.type} v${attr.name};`).join(""): ""}

out vec2 vUV;
out vec3 vColor;
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
    vColor = iColor;
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
    }, { name: "GL", global: true, dependencies: ["Color"] });

    console.warn("LS.GL is an early stage component. The API is not stable and may change in future releases. This component is not fully tested and may contain bugs.");

    /*@ls-export*/ if (typeof module !== "undefined" && module.exports) {
        module.exports = LS.GL;
    }
})();