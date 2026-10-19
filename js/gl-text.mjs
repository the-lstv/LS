/**
 * Text rendering extension for LS.GL
 * 
 * @namespace LS.GL
 * @version 2.0.0-alpha.0
 * 
 * ! This is an early stage component.
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
in float v_weight;

flat in uint v_style;

uniform sampler2D uTexture;
uniform float uPxRange;

uniform float uOpacity;

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

    alpha *= uOpacity;

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

uniform float uOpacity;

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

    alpha *= uOpacity;

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
uniform float uOpacity;

out vec4 outColor;

void main() {
    float coverage = texture(uTexture, v_texCoord).r;

    outColor = vec4(
        v_color.rgb,
        (v_color.a * coverage) * uOpacity
    );
}`;

/**
 * Vertex shader for rendering MSDF text.
 * Optionally THREE.js compatible.
 * @version 1.0.0
 */
const fontVertex = `#version 300 es

${LS.GL.utils.quad}

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

            const oOffset = glyphStride === 42? 0: 2;

            for (let i = 0; i < glyphCount; i++) {
                const offset = i * glyphStride;
                fontData.glyphs.push({
                    i: glyphView.getUint16(offset),
                    gI: glyphView.getUint16(offset + 2),
                    code: glyphView.getUint16(offset + 4),
                    advance: glyphStride === 42? glyphView.getFloat32(offset + 6): glyphView.getUint16(offset + 6), // There was previously a faulty type
                    planeBounds: {
                        top: glyphView.getFloat32(offset + 10 - oOffset),
                        left: glyphView.getFloat32(offset + 14 - oOffset),
                        bottom: glyphView.getFloat32(offset + 18 - oOffset),
                        right: glyphView.getFloat32(offset + 22 - oOffset)
                    },
                    atlasBounds: {
                        top: glyphView.getFloat32(offset + 26 - oOffset),
                        left: glyphView.getFloat32(offset + 30 - oOffset),
                        bottom: glyphView.getFloat32(offset + 34 - oOffset),
                        right: glyphView.getFloat32(offset + 38 - oOffset)
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

        if((this.atlas.type === "softmask" || this.atlas.type === "hardmask")) {// && this.options.nearestFilter) {
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

class WebGLTextEngine extends LS.GL.Renderable {
    constructor(options = {}) {
        super({
            fragment: fragmentsByType[options.type || "msdf"] || msdfFragment,
            vertex: fontVertex,
            uniforms: ["uProjection", "uOffset", "uTexture", "uPxRange", "uGamma", "uOpacity"],
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

        this.opacity = 1.0;

        if(typeof options.manualRendering === "undefined") {
            // Default to manual rendering (text won't be auto-rendered in the main render loop)
            // Depends on how you plan to use the TextEngine.
            // - If you want to render text automatically as a regular renderable, set manualRendering to false.
            // - If you want to control when and where the text is rendered individually, set manualRendering to true.
            options.manualRendering = true;
        }

        this.lineHeight = 1.2; // Line height multiplier for vertical spacing

        this.nextFree = 0;

        // forward set in case a block is created before setup
        this.instanceCount = options.bufferSize || 2048;

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

        if(this.defaultFontSize === null) {
            this.defaultFontSize = options.defaultFontSize || this.font.baseCellHeight;
        }

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

    free(start = 0, end = this.instanceCount) {
        if (!this.gridBuffer) return;
        this.gridBuffer.fill(0, start, end);
        this.vertexData.fill(0, start * this.cellSizeF, end * this.cellSizeF);
        this.__lowestDirty = start;
        this.__highestDirty = end;
        this.nextFree = start;
    }

    alloc(size = 1) {
        if (!this.gridBuffer) return -1;

        const start = Math.max(this.nextFree, 0);

        let idx = -1;
        // todo
        for (let i = start; i < this.instanceCount; i++) {
            if (this.gridBuffer[i] === 0) {
                idx = i;
                break;
            }
        }

        if (idx === -1) {
            console.warn("No free cells available in the text engine.");
            return -1;
        }

        this.gridBuffer[idx] = 1;
        this.__lowestDirty = Math.min(this.__lowestDirty, idx);
        this.__highestDirty = Math.max(this.__highestDirty, idx + size);
        this.nextFree = Math.max(this.nextFree, idx + size);

        return idx;
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

        if(typeof newOptions.opacity === "number") {
            this.opacity = newOptions.opacity;
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

    renderCallback(delta, now, gl, cw, ch, updatedDimensions, uniforms, attributes, projectionMatrix) {
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
        gl.uniform1f(uniforms.uOpacity, this.opacity);
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

        gl.uniform1f(uniforms.uOpacity, this.opacity);

        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(uniforms.uTexture, 0);

        gl.bindTexture(gl.TEXTURE_2D, this.texture);

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
        text_or_size ??= this.instanceCount - this.nextFree; // max

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
 * -> This class should not be constructed directly, don't export it.
 */
class TextBlock {
    /**
     * @type {WebGLTextEngine}
     */
    engine;

    constructor(engine, size, options = {}, text = "") {
        this.engine = engine;
        this.startIdx = this.engine.alloc(size);

        if(this.startIdx === -1) {
            throw new Error("Failed to allocate text block.");
        }
        
        this.size = Math.min(size, this.engine.instanceCount - this.startIdx);
        this.options = options;

        if(this.size !== size) {
            const message = "TextBlock out of memory: requested " + size + ", allocated " + this.size + ", total " + this.engine.instanceCount;
            if(options.strict) throw new Error(message);
            console.warn(message + ". This may lead to text truncation.");
        }

        this.__clippedStartIdx = this.startIdx;
        this.__clippedEndIdx = this.startIdx + this.size;

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

        const startX = x ?? this.options.x ?? 0;
        const startY = y ?? this.options.y ?? 0;

        let maxX = x;

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
                x = startX;
                y += this.engine.lineHeight * size;
            }

            maxX = Math.max(maxX, x);
        }

        return { width: maxX - startX, height: y - startY + size };
    }

    /**
     * Write text to the text block at a specific position with specific color and style.
     * @param {*} text
     * @param {*} startIdx 
     * @param {*} len 
     * @param {*} x 
     * @param {*} y 
     * @param {*} r 
     * @param {*} g 
     * @param {*} b 
     * @param {*} a 
     * @param {*} size 
     * @param {*} style 
     * @param {*} weight 
     * @param {*} depth 
     * @param {*} breakLines 
     * @returns {Object} An object containing the width, height, and cell count of the written text.
     */
    writeTextAt(text, startIdx = 0, len = null, x, y, r = 255, g = 255, b = 255, a = 255, size = this.engine.defaultFontSize, style, weight, depth, breakLines = true) {
        if(r && typeof r !== 'number') {
            [r, g, b, a] = LS.Color.parse(r, g, b, a);
        }

        len ??= text.length;

        const startX = x ?? this.options.x ?? 0;
        const startY = y ?? this.options.y ?? 0;

        let maxX = x;

        let idx = startIdx, i = 0;
        for (; i < len; i++) {
            const charCode = i < text.length ? typeof text === 'number' ? text : typeof text === 'string' ? text.charCodeAt(i) : text[i] : 0;
            const advance = this.setChar(idx, x, y, charCode, r, g, b, a, size, style, weight, depth);
            idx++;

            if(idx > this.startIdx + this.size) {
                // console.warn("TextBlock overflow: text exceeds reserved size, truncating. (Reserved size: " + this.size + ", text length: " + text.length + ")");
                break;
            }

            x += advance;

            if (breakLines && charCode === 10) { // Newline
                x = startX;
                y += this.engine.lineHeight * size;
            }

            maxX = Math.max(maxX, x);
        }

        return { width: maxX - startX, height: y - startY + size, cells: i, startIdx: this.startIdx + startIdx, endIdx: this.startIdx + idx };
    }

    /**
     * @typedef {Object} TextOptions
     * @property {number} [x] - The x position to start writing the text.
     * @property {number} [y] - The y position to start writing the text.
     * @property {number} [r=255] - Red color component (0-255).
     * @property {number} [g=255] - Green color component (0-255).
     * @property {number} [b=255] - Blue color component (0-255).
     * @property {number} [a=255] - Alpha component (0-255).
     * @property {any} [color] - Color in any format accepted by LS.Color.parse (e.g., hex string, array, etc.). Overrides r, g, b, a if provided.
     * @property {number} [size=this.engine.defaultFontSize] - Font size.
     * @property {number} [style] - Font style.
     * @property {number} [weight] - Font weight.
     * @property {number} [depth] - Glyph depth.
     * @property {boolean} [breakLines=true] - Whether to break lines on newline characters.
     */

    /**
     * Writes text to the text block at the specified position with the given options.
     * @param {string|Array|TypedArray} text Text to write
     * @param {*} startIdx Start cell index
     * @param {*} len Length of text to write
     * @param {TextOptions} options 
     * @returns {Object} An object containing the width, height, and other information about the written text.
     */
    writeText(text, startIdx = 0, len = null, { x, y, r = 255, g = 255, b = 255, a = 255, color, size = this.engine.defaultFontSize, style, weight, depth, breakLines = true } = {}) {
        if(color) {
            [r, g, b, a] = LS.Color.parse(color);
        }

        return this.writeTextAt(text, startIdx, len, x, y, r, g, b, a, size, style, weight, depth, breakLines);
    }

    get cellHeight() {
        return this.engine.cellHeight;
    }

    clear(startIdx = 0, len = this.size) {
        startIdx = Math.max(0, Math.floor(startIdx));
        len = Math.max(0, Math.floor(len));

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

    renderCallback(delta, now, gl, cw, ch, updatedDimensions, uniforms, attributes, projectionMatrix) {
        if(this.__clippedStartIdx >= this.__clippedEndIdx) return;
        this.engine.renderRange(this.__clippedStartIdx, this.__clippedEndIdx, projectionMatrix);
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

        if (typeof charCode === 'string') {
            charCode = charCode.charCodeAt(0);
        }

        return this.engine._updateVertex(cellIdx, x, y, charCode, r, g, b, a, size, style, weight, depth);
    }

    /**
     * A higher-level method for updating a specific character's individual data.
     */
    updateChar(index, options = {}) {
        if(typeof index === "object") {
            options = index;
            index = options.index;
        }

        const cellIdx = this.startIdx + index;
        if (cellIdx < this.startIdx || cellIdx >= this.startIdx + this.size) {
            return;
        }

        let { x, y, charCode, color, r, g, b, a, size, style, weight, depth } = options;

        if(color) {
            if(color.data) color = color.data;

            r = color[0];
            g = color[1];
            b = color[2];
            a = color[3] ?? 255;
        }

        r        ??= undefined;
        g        ??= undefined;
        b        ??= undefined;
        a        ??= undefined;

        x        ??= undefined;
        y        ??= undefined;
        charCode ??= undefined;
        size     ??= this.readCharData(index, "size") || this.engine.defaultFontSize;
        style    ??= undefined;
        weight   ??= undefined;
        depth    ??= undefined;

        return this.engine._updateVertex(cellIdx, x, y, charCode, r, g, b, a, size, style, weight, depth);
    }

    /**
     * A high-level method for obtaining character data.
     * Don't use too frequently.
     */
    readCharData(index, property = null) {
        if(property === null) {
            return {
                x:        this.readCharData(index, "x"),
                y:        this.readCharData(index, "y"),
                charCode: this.readCharData(index, "charCode"),
                r:        this.readCharData(index, "r"),
                g:        this.readCharData(index, "g"),
                b:        this.readCharData(index, "b"),
                a:        this.readCharData(index, "a"),
                size:     this.readCharData(index, "size"),
                style:    this.readCharData(index, "style"),
                weight:   this.readCharData(index, "weight"),
                depth:    this.readCharData(index, "depth")
            };
        }

        switch(property) {
            case "x":        return this.engine.vertexData[(this.startIdx + index) * this.engine.cellSizeF];
            case "y":        return this.engine.vertexData[(this.startIdx + index) * this.engine.cellSizeF + 1];
            case "charCode": return this.engine.gridBuffer[this.startIdx + index];
            case "r":        return this.engine.vertexByteView[(this.startIdx + index) * this.engine.cellSizeF * 4 + 36];
            case "g":        return this.engine.vertexByteView[(this.startIdx + index) * this.engine.cellSizeF * 4 + 37];
            case "b":        return this.engine.vertexByteView[(this.startIdx + index) * this.engine.cellSizeF * 4 + 38];
            case "a":        return this.engine.vertexByteView[(this.startIdx + index) * this.engine.cellSizeF * 4 + 39];
            case "size":     return this.engine.vertexData[(this.startIdx + index) * this.engine.cellSizeF + 2] * 2; // half width to full width
            case "style":    return this.engine.vertexShortView[(this.startIdx + index) * this.engine.cellSizeF * 2 + 17];
            case "weight":   return this.engine.vertexShortView[(this.startIdx + index) * this.engine.cellSizeF * 2 + 16];
            case "depth":    return this.engine.vertexData[(this.startIdx + index) * this.engine.cellSizeF + 10];
        };
    }

    destroy() {
        if(this.destroyed) return;
        if(this.engine && !this.engine.destroyed) this.engine.free(this.startIdx, this.startIdx + this.size);
        this.engine = null;
        this.size = 0;
        this.options = null;
        this.startIdx = 0;
        this.__clippedStartIdx = 0;
        this.__clippedEndIdx = 0;
        this.destroyed = true;
    }
}

LS.GL.WebGLMSDFFont   = WebGLMSDFFont;
LS.GL.WebGLTextEngine = WebGLTextEngine;

/*@ls-export*/ if(typeof module !== "undefined"){
    module.exports = {
        WebGLTextEngine,
        WebGLMSDFFont
    };
}

export { WebGLTextEngine, WebGLMSDFFont };