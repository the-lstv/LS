/**
 * Extensive color library and theme utilities
 * TODO: Split advanced color features into a separate module, this has grown too big
 */
LS.Color = class Color {
    constructor(r, g, b, a) {
        if (r && (r instanceof Uint8Array || r instanceof Uint8ClampedArray || r instanceof ArrayBuffer)) {
            this.data = (r instanceof ArrayBuffer) ? new Uint8Array(r) : r;
            this.offset = (typeof g === "number") ? g : 0;
            return;
        }

        // this.data = new Uint8Array(4);
        // this.offset = 0;
        // this.data[3] = 255;
        this.data = [0, 0, 0, 255];
        this.offset = 0;

        if (typeof r !== "undefined") {
            Color.parse(r, g, b, a, this.data, this.offset);
        }
    }

    // Direct Buffer Access
    get r() { return this.data[this.offset] }
    set r(value) { this.data[this.offset] = value }

    get g() { return this.data[this.offset + 1] }
    set g(value) { this.data[this.offset + 1] = value }

    get b() { return this.data[this.offset + 2] }
    set b(value) { this.data[this.offset + 2] = value }

    get a() { return this.data[this.offset + 3] / 255 }
    set a(value) { this.data[this.offset + 3] = Math.round(value * 255) }

    get int(){
        return ((this.data[this.offset] << 16) | (this.data[this.offset + 1] << 8) | this.data[this.offset + 2]) >>> 0;
    }

    get hexInt() {
        return (this.data[this.offset] << 16) | (this.data[this.offset + 1] << 8) | this.data[this.offset + 2] | (1 << 24);
    }

    get hex() {
        return "#" + this.hexInt.toString(16).slice(1);
    }

    get rgb() {
        return `rgb(${this.data[this.offset]}, ${this.data[this.offset + 1]}, ${this.data[this.offset + 2]})`;
    }

    get rgba() {
        return `rgba(${this.data[this.offset]}, ${this.data[this.offset + 1]}, ${this.data[this.offset + 2]}, ${this.data[this.offset + 3] / 255})`;
    }

    getHSL(out = [0, 0, 0]) {
        const data = this.data;
        const o = this.offset;

        const r = data[o] * (1 / 255);
        const g = data[o + 1] * (1 / 255);
        const b = data[o + 2] * (1 / 255);

        const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
        const min = r < g ? (r < b ? r : b) : (g < b ? g : b);

        const l = (max + min) * 0.5;

        let h = 0, s = 0;

        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

            if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;

            h *= (1 / 6);
        }

        out[0] = Math.round(h * 360);
        out[1] = Math.round(s * 100);
        out[2] = Math.round(l * 100);
        return out;
    }

    get hsl() {
        return this.getHSL([0, 0, 0]);
    }

    get hsb() {
        let r = this.data[this.offset] / 255;
        let g = this.data[this.offset + 1] / 255;
        let b = this.data[this.offset + 2] / 255;

        let max = Math.max(r, g, b);
        let min = Math.min(r, g, b);

        let v = max;
        let h, s;

        let delta = max - min;
        s = max === 0 ? 0 : delta / max;

        if (max === min) {
            h = 0;
        } else {
            switch (max) {
                case r:
                    h = (g - b) / delta + (g < b ? 6 : 0);
                    break;
                case g:
                    h = (b - r) / delta + 2;
                    break;
                case b:
                    h = (r - g) / delta + 4;
                    break;
            }
            h /= 6;
        }

        h = Math.round(h * 360);
        s = Math.round(s * 100);
        v = Math.round(v * 100);

        return [h, s, v];
    }

    get color() {
        return [this.data[this.offset], this.data[this.offset + 1], this.data[this.offset + 2], this.data[this.offset + 3] / 255];
    }

    get pixel() {
        return [this.data[this.offset], this.data[this.offset + 1], this.data[this.offset + 2], this.data[this.offset + 3]];
    }

    get brightness() {
        return Math.sqrt(
            0.299 * (this.data[this.offset] * this.data[this.offset]) +
            0.587 * (this.data[this.offset + 1] * this.data[this.offset + 1]) +
            0.114 * (this.data[this.offset + 2] * this.data[this.offset + 2])
        );
    }

    get isDark() {
        return this.brightness < 127.5;
    }

    hue(hue) {
        let [h, s, l] = this.hsl;
        h = Math.max(Math.min(hue, 360), 0);
        this.setHSL(h, s, l);
        return this;
    }

    /**
     * Linear interpolation between current color and target color by a given ratio
     * @param {Color|array|number|string} target Target color
     * @param {number} progress Interpolation factor (0-1)
     * @param {Color|array} source Optional source color (otherwise uses and mutates current color)
     */
    lerp(target, progress = 0.5, source = null) {
        if(progress <= 0) {
            return this;
        } else if(progress >= 1) {
            return this.set(target);
        }

        let r2, g2, b2, a2;
        if (target instanceof Color) {
            r2 = target.r; g2 = target.g; b2 = target.b; a2 = target.a;
        } else if (Array.isArray(target)) {
            r2 = target[0]; g2 = target[1]; b2 = target[2]; a2 = target[3] !== undefined ? (target[3] > 1 ? target[3]/255 : target[3]) : 1;
        } else {
            const c = new Color(target);
            r2 = c.r; g2 = c.g; b2 = c.b; a2 = c.a;
        }

        const d = this.data, o = this.offset;
        const p = Math.max(0, Math.min(1, progress));
        const q = 1 - p;

        const r = source ? source.data[o] : d[o];
        const g = source ? source.data[o+1] : d[o+1];
        const b = source ? source.data[o+2] : d[o+2];
        const a = source ? source.data[o+3] : d[o+3];

        d[o] = Math.round(r * q + r2 * p);
        d[o+1] = Math.round(g * q + g2 * p);
        d[o+2] = Math.round(b * q + b2 * p);

        const currentA = d[o+3] / 255;
        d[o+3] = Math.round((currentA * q + a2 * p) * 255);
        
        return this;
    }

    saturation(percent) {
        let [h, s, l] = this.hsl;
        s = Math.max(Math.min(percent, 100), 0);
        this.setHSL(h, s, l);
        return this;
    }

    lightness(percent) {
        let [h, s, l] = this.hsl;
        l = Math.max(Math.min(percent, 100), 0);
        this.setHSL(h, s, l);
        return this;
    }

    tone(hue, saturation, lightness) {
        let [h, s, l] = this.hsl;
        this.setHSL(hue || h, (s / 100) * saturation, typeof lightness === "number" ? lightness : l);
        return this;
    }

    lighten(percent) {
        let [h, s, l] = this.hsl;
        l = Math.max(Math.min(l + percent, 100), 0);
        this.setHSL(h, s, l);
        return this;
    }

    saturate(percent) {
        let [h, s, l] = this.hsl;
        s = Math.max(Math.min(s + percent, 100), 0);
        this.setHSL(h, s, l);
        return this;
    }

    darken(percent) {
        let [h, s, l] = this.hsl;
        l = Math.max(Math.min(l - percent, 100), 0);
        this.setHSL(h, s, l);
        return this;
    }

    hueShift(deg) {
        let [h, s, l] = this.hsl;
        h = (h + deg) % 360;
        this.setHSL(h, s, l);
        return this;
    }

    /**
     * Multiplies each channel by the given factor
     * Provide null to skip a channel
     */
    multiply(factorR, factorG, factorB, factorA) {
        const d = this.data, o = this.offset;
        return this.setClamped(
            factorR === null ? null : Math.round(d[o] * factorR),
            factorG === null ? null : Math.round(d[o+1] * factorG),
            factorB === null ? null : Math.round(d[o+2] * factorB),
            factorA === null ? null : (d[o+3] / 255) * factorA
        );
    }

    /**
     * Divides each channel by the given factor
     * Provide null to skip a channel
     */
    divide(factorR, factorG, factorB, factorA) {
        const d = this.data, o = this.offset;
        return this.setClamped(
            factorR === null ? null : Math.round(d[o] / factorR),
            factorG === null ? null : Math.round(d[o+1] / factorG),
            factorB === null ? null : Math.round(d[o+2] / factorB),
            factorA === null ? null : (d[o+3] / 255) / factorA
        );
    }

    add(r2, g2, b2, a2) {
        let color = new Color(r2, g2, b2, a2);
        const d = this.data, o = this.offset;
        return this.setClamped(
            d[o] + color.r,
            d[o+1] + color.g,
            d[o+2] + color.b,
            (d[o+3] / 255) + color.a
        );
    }

    subtract(r2, g2, b2, a2) {
        let color = new Color(r2, g2, b2, a2);
        const d = this.data, o = this.offset;
        return this.setClamped(
            d[o] - color.r,
            d[o+1] - color.g,
            d[o+2] - color.b,
            (d[o+3] / 255) - color.a
        );
    }

    /**
     * Mixes this color with another one by the given weight (0 to 1)
     */
    mix(val, weight = 0.5) {
        let r2, g2, b2, a2;
        if (val instanceof Color) {
            r2 = val.r; g2 = val.g; b2 = val.b; a2 = val.a;
        } else if (Array.isArray(val)) {
            r2 = val[0]; g2 = val[1]; b2 = val[2]; a2 = val[3] !== undefined ? (val[3] > 1 ? val[3]/255 : val[3]) : 1;
        } else {
            const c = new Color(val);
            r2 = c.r; g2 = c.g; b2 = c.b; a2 = c.a;
        }

        const d = this.data, o = this.offset;
        
        d[o] = Math.round(d[o] * (1 - weight) + r2 * weight);
        d[o+1] = Math.round(d[o+1] * (1 - weight) + g2 * weight);
        d[o+2] = Math.round(d[o+2] * (1 - weight) + b2 * weight);
        
        let currentA = d[o+3] / 255;
        d[o+3] = Math.round((currentA * (1 - weight) + a2 * weight) * 255);
        
        return this;
    }

    /**
     * Sets the alpha channel to a value
     */
    alpha(v) {
        this.data[this.offset + 3] = Math.min(Math.max(v, 0), 1) * 255;
        return this;
    }

    #f(n, h, a, l) {
        const kn = (n + h / 30) % 12;
        const t = Math.min(kn - 3, 9 - kn);
        return l - a * Math.max(-1, Math.min(t, 1));
    }

    setHSL(h, s, l, alpha) {
        let hsl;
        if (h == null || Number.isNaN(h)) h = (hsl ??= this.hsl)[0];
        if (s == null || Number.isNaN(s)) s = (hsl ??= this.hsl)[1];
        if (l == null || Number.isNaN(l)) l = (hsl ??= this.hsl)[2];

        s *= 0.01;
        l *= 0.01;

        const a = s * Math.min(l, 1 - l);

        const data = this.data;
        const o = this.offset;

        data[o] = Math.round(255 * this.#f(0, h, a, l));
        data[o + 1] = Math.round(255 * this.#f(8, h, a, l));
        data[o + 2] = Math.round(255 * this.#f(4, h, a, l));

        if (Number.isFinite(alpha)) {
            const clamped = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha;
            data[o + 3] = Math.round(clamped * 255);
        }
        return this;
    }

    setHSB(h, s, b, alpha) {
        let hsb; // Defer calculation if we don't need it
        if(h === null || typeof h === "undefined" || isNaN(h)) h = hsb? hsb[0]: (hsb = this.hsb)[0];
        if(s === null || typeof s === "undefined" || isNaN(s)) s = hsb? hsb[1]: (hsb = this.hsb)[1];
        if(b === null || typeof b === "undefined" || isNaN(b)) b = hsb? hsb[2]: (hsb = this.hsb)[2];

        s /= 100;
        b /= 100;
        h = ((h % 360) + 360) % 360;

        let i = Math.floor(h / 60) % 6;
        let f = h / 60 - i;
        let p = b * (1 - s);
        let q = b * (1 - f * s);
        let t = b * (1 - (1 - f) * s);

        let r, g, b2;
        switch (i) {
            case 0:
                r = b; g = t; b2 = p; break;
            case 1:
                r = q; g = b; b2 = p; break;
            case 2:
                r = p; g = b; b2 = t; break;
            case 3:
                r = p; g = q; b2 = b; break;
            case 4:
                r = t; g = p; b2 = b; break;
            case 5:
                r = b; g = p; b2 = q; break;
        }

        this.data[this.offset] = Math.round(r * 255);
        this.data[this.offset+1] = Math.round(g * 255);
        this.data[this.offset+2] = Math.round(b2 * 255);

        if (typeof alpha === "number" && !isNaN(alpha)) {
            this.data[this.offset+3] = Math.round(Math.min(Math.max(alpha, 0), 1) * 255);
        }
        return this;
    }

    /**
     * Sets the color channels and clamps them to valid ranges
     */
    setClamped(r, g, b, a) {
        const d = this.data, o = this.offset;
        
        if (typeof r !== "number" || isNaN(r)) r = d[o];
        if (typeof g !== "number" || isNaN(g)) g = d[o+1];
        if (typeof b !== "number" || isNaN(b)) b = d[o+2];
        if (typeof a !== "number" || isNaN(a)) a = d[o+3] / 255;

        // Manual clamping before Uint8 wrapping happens
        d[o] = Math.max(0, Math.min(255, r));
        d[o+1] = Math.max(0, Math.min(255, g));
        d[o+2] = Math.max(0, Math.min(255, b));
        d[o+3] = Math.max(0, Math.min(1, a)) * 255;
        
        return this;
    }

    /**
     * Sets the color from any valid input
     */
    set(r, g, b, a) {
        Color.parse(r, g, b, a, this.data, this.offset);
        return this;
    }

    /**
     * Creates a copy of this color
     */
    clone() {
        const c = new Color();
        const d = this.data, o = this.offset;
        c.data[0] = d[o];
        c.data[1] = d[o+1];
        c.data[2] = d[o+2];
        c.data[3] = d[o+3];
        return c;
    }

    toString() {
        return this.rgba;
    }

    toArray() {
        return [this.data[this.offset], this.data[this.offset+1], this.data[this.offset+2], this.data[this.offset+3] / 255];
    }

    toJSON() {
        return {
            r: this.data[this.offset],
            g: this.data[this.offset+1],
            b: this.data[this.offset+2],
            a: this.data[this.offset+3] / 255
        };
    }

    *[Symbol.iterator]() {
        yield this.data[this.offset];
        yield this.data[this.offset+1];
        yield this.data[this.offset+2];
        yield this.data[this.offset+3] / 255;
    }

    [Symbol.toPrimitive](hint) {
        if (hint === "number") {
            return this.int;
        }
        return this.rgba;
    }

    get [Symbol.toStringTag]() {
        return 'Color';
    }

    valueOf() {
        return this.int;
    }

    /**
     * Creates a Uint8Array pixel with RGBA values
     * @returns {Uint8Array}
     */
    toUint8Array() {
        return new Uint8Array(this.data.slice(this.offset, this.offset + 4));
    }

    /**
     * Creates a WebGL texture with this color
     * @param {WebGLRenderingContext} gl WebGL context
     * @returns {WebGLTexture}
     */
    toTexture(gl) {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);

        gl.texImage2D(
            gl.TEXTURE_2D,
            0,                  // level
            gl.RGBA,            // internal format
            1, 1,               // width, height
            0,                  // border
            gl.RGBA,            // format
            gl.UNSIGNED_BYTE,   // type
            this.toUint8Array() // pixel data
        );

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return texture;
    }

    /**
     * Creates an ImageData object with this color
     * @returns {ImageData}
     */
    toImageData() {
        if(!Color.context) Color._createProcessingCanvas();
        const imageData = Color.context.createImageData(1, 1);
        imageData.data[0] = this.data[this.offset];
        imageData.data[1] = this.data[this.offset+1];
        imageData.data[2] = this.data[this.offset+2];
        imageData.data[3] = this.data[this.offset+3];
        return imageData;
    }

    /**
     * Creates a div element with this color as background
     * @param {number|string} w Optional width
     * @param {number|string} h Optional height
     * @returns {Element}
     */
    toDiv(w, h) {
        const div = document.createElement('div');
        div.style.backgroundColor = this.rgba;
        if(w !== null && w !== undefined) div.style.width = typeof w === "number" ? w + 'px' : w;
        if(h !== null && h !== undefined) div.style.height = typeof h === "number" ? h + 'px' : h;
        return LS.Select(div);
    }

    /**
     * Sets the sitewide accent from this color
     */
    applyAsAccent() {
        if(!LS.isWeb) return;
        Color.setAccent(this);
        return this;
    }

    /**
     * Creates or updates a sitewide named accent
     */
    toAccent(name = "default") {
        if(!LS.isWeb) return;
        Color.update(name, this);
        return this;
    }

    /**
     * Generates a CSS accent from this color
     */
    toAccentCSS() {
        return Color.generate(this);
    }

    // --- Special methods for multiple pixels

    /**
     * Set offset by pixel index
     */
    at(index) {
        this.offset = index * 4;
        return this;
    }

    /**
     * Set offset by raw index (snapped to pixel index)
     */
    setOffset(index) {
        this.at(Math.floor(index / 4));
        return this;
    }

    next(by = 1) {
        this.offset += by * 4;
        return this;
    }

    get pixelCount() {
        return this.data.length / 4;
    }

    get atEnd() {
        return this.offset +4 >= this.data.length;
    }

    fill(r, g, b, a, offset = 0, limit = 0) {
        Color.parse(r, g, b, a, this.data, offset);

        const length = this.data.length;
        for (let i = offset + 4; i < (Math.min(limit * 4 || length, length)); i += 4) {
            this.data[i] = this.data[offset];
            this.data[i + 1] = this.data[offset + 1];
            this.data[i + 2] = this.data[offset + 2];
            this.data[i + 3] = this.data[offset + 3];
        }
        return this;
    }

    static #settingAccent = null;
    static #settingTheme = null;
    static {
        this.events = new LS.EventEmitter(this);

        this.colors = new Map;
        this.themes = new Set([ "light", "dark", "amoled" ]);

        if(LS.isWeb) {
            // Style tag to manage
            this.style = document.createElement("style");
            document.head.appendChild(this.style);
            this.sheet = this.style.sheet;

            this.style.id = "ls-colors-style";

            if(window.matchMedia) {
                window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', thing => {
                    this.emit("scheme-changed", [thing.matches]);
                });
            }

            if(LS.__colorInitOptions) {
                if(LS.__colorInitOptions.theme) this.setTheme(LS.__colorInitOptions.theme);
                if(LS.__colorInitOptions.accent) this.setAccent(LS.__colorInitOptions.accent);
                if(LS.__colorInitOptions.autoScheme) this.autoScheme(LS.__colorInitOptions.adaptiveTheme);
                if(LS.__colorInitOptions.autoAccent) this.autoAccent();
                delete LS.__colorInitOptions;
            }
        }
    }

    static parse(r, g, b, a, target, offset = 0) {
        if(!target) target = [0, 0, 0, 1];

        if (typeof r === "string") {
            r = r.trim().toLowerCase();

            if(r.length === 0) {
                target[offset] = 0; target[offset + 1] = 0; target[offset + 2] = 0; target[offset + 3] = 255;
                return target;
            }

            // Hex
            if(r.charCodeAt(0) === 35) {
                [r, g, b, a] = Color.parseHex(r);
            }

            // RGB
            else if(r.startsWith("rgb(") || r.startsWith("rgba(")) {
                let match = r.match(/rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*([0-9.]+%?))?\s*\)/);

                if(match) {
                    [r, g, b] = match.slice(1, 4).map(Number);
                    let alpha = match[4];
                    if (alpha) {
                        a = Math.max(0, Math.min(1, alpha.endsWith('%') ? parseFloat(alpha) / 100 : parseFloat(alpha)));
                    } else {
                        a = 1;
                    }
                } else {
                    throw new Error("Colour " + r + " could not be parsed.");
                }
            }

            // HSL
            else if (r.startsWith("hsl(") || r.startsWith("hsla(")) {
                let match = r.match(/hsla?\(\s*([0-9.]+)(?:deg)?\s*[, ]\s*([0-9.]+)%?\s*[, ]\s*([0-9.]+)%?\s*(?:[,/]\s*([0-9.]+%?))?\s*\)/);

                if(match) {
                    const temp = new Color();
                    const alpha = match[4] ? (match[4].endsWith('%') ? parseFloat(match[4]) / 100 : parseFloat(match[4])) : 1;
                    temp.setHSL(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]), alpha);

                    target[offset] = temp.data[0];
                    target[offset + 1] = temp.data[1];
                    target[offset + 2] = temp.data[2];
                    target[offset + 3] = temp.data[3];
                    return target;
                } else {
                    throw new Error("Colour " + r + " could not be parsed.");
                }
            }

            // HSB
            // This is non-CSS-standard but is widely supported
            else if (r.startsWith("hsb(") || r.startsWith("hsba(")) {
                let match = r.match(/hsba?\(\s*([0-9.]+)(?:deg)?\s*[, ]\s*([0-9.]+)%?\s*[, ]\s*([0-9.]+)%?\s*(?:[,/]\s*([0-9.]+%?))?\s*\)/);

                if(match) {
                    const temp = new Color();
                    const alpha = match[4] ? (match[4].endsWith('%') ? parseFloat(match[4]) / 100 : parseFloat(match[4])) : 1;
                    temp.setHSB(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]), alpha);
                    
                    target[offset] = temp.data[0];
                    target[offset + 1] = temp.data[1];
                    target[offset + 2] = temp.data[2];
                    target[offset + 3] = temp.data[3];
                    return target;
                } else {
                    throw new Error("Colour " + r + " could not be parsed.");
                }
            }

            else if(Color.namedColors.has(r)) {
                [r, g, b, a] = Color.namedColors.get(r);
                target[offset] = r;
                target[offset + 1] = g;
                target[offset + 2] = b;
                target[offset + 3] = a !== undefined ? a : 255;
                return target;
            }

            // As a last resort, we use fillStyle to let the browser parse any valid CSS color
            else {
                if(!Color.context) {
                    Color._createProcessingCanvas();
                }

                Color.context.fillStyle = "#000000";
                Color.context.fillStyle = r;
                [r, g, b, a] = Color.parseHex(Color.context.fillStyle);
            }
        } else if (r instanceof Color) {
            const d = r.data, o = r.offset;
            target[offset] = d[o];
            target[offset + 1] = d[o + 1];
            target[offset + 2] = d[o + 2];
            target[offset + 3] = d[o + 3];
            return target;
        } else if (Array.isArray(r)) {
            [r, g, b, a] = r;
        } else if (typeof r === "object" && r !== null) {
            ({ r = 255, g = 255, b = 255, a = 1 } = r);
        }

        target[offset] = (typeof r === "number" && !isNaN(r)) ? r : 0;
        target[offset + 1] = (typeof g === "number" && !isNaN(g)) ? g : 0;
        target[offset + 2] = (typeof b === "number" && !isNaN(b)) ? b : 0;

        let alpha = 255;
        if (typeof a === "number" && !isNaN(a)) {
            alpha = Math.round(a * 255);
        }

        target[offset + 3] = alpha;
        return target;
    }

    static clamp(target) {
        if (typeof target[0] !== "number" || isNaN(target[0])) target[0] = 0;
        if (typeof target[1] !== "number" || isNaN(target[1])) target[1] = 0;
        if (typeof target[2] !== "number" || isNaN(target[2])) target[2] = 0;
        if (typeof target[3] !== "number" || isNaN(target[3])) target[3] = 255;

        target[0] = Math.round(Math.min(255, Math.max(0, target[0])));
        target[1] = Math.round(Math.min(255, Math.max(0, target[1])));
        target[2] = Math.round(Math.min(255, Math.max(0, target[2])));
        target[3] = Math.round(Math.min(255, Math.max(0, target[3])));
        return target;
    }

    static parseHex(hex) {
        if(hex.length < 4 || hex.length > 9) {
            throw new Error("Invalid hex string: " + hex.slice(0, 10) + (hex.length > 10 ? "..." : ""));
        }

        if (hex.length <= 5) {
            return [ parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16), parseInt(hex[3] + hex[3], 16), hex.length === 5? parseInt(hex[4] + hex[4], 16) / 255: 1 ];
        } else {
            return [ parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), hex.length === 9? parseInt(hex.slice(7, 9), 16) / 255: 1 ];
        }
    }

    static fromHSL(h, s, l) {
        return new Color().setHSL(h, s, l);
    }

    static fromHSB(h, s, b) {
        return new Color().setHSB(h, s, b);
    }

    static fromHex(hex) {
        let [r, g, b, a] = Color.parseHex(hex);
        return new Color(r, g, b, a);
    }

    static fromInt(int) {
        let r = (int >> 16) & 0xFF;
        let g = (int >> 8) & 0xFF;
        let b = int & 0xFF;
        return new Color(r, g, b);
    }

    static fromPixel(pixel) {
        return new Color(pixel[0], pixel[1], pixel[2], pixel[3] / 255);
    }

    static fromUint8(data, offset = 0, alpha = true) {
        return new Color(data[offset], data[offset + 1], data[offset + 2], alpha ? data[offset + 3] / 255 : 1);
    }

    static fromObject(obj) {
        return new Color(obj.r, obj.g, obj.b, obj.a);
    }

    static fromArray(arr) {
        return new Color(arr[0], arr[1], arr[2], arr[3]);
    }

    static fromBuffer(buffer, offset = 0, alpha = true) {
        const view = new Uint8Array(buffer, offset, alpha ? 4 : 3);
        return Object.setPrototypeOf(view, Color.prototype);
    }

    static fromNamed(name) {
        if(Color.namedColors.has(name)) {
            return Color.fromArray(Color.namedColors.get(name));
        }
        throw new Error("Unknown color name: " + name);
    }

    static fromCSS(colorString) {
        if(!Color.context) {
            Color._createProcessingCanvas();
        }

        Color.context.fillStyle = "#000000";
        Color.context.fillStyle = colorString;

        // fillStyle result is weirdly inconsistent; color names become hex, rgb/rgba stay as is, so we still parse it
        return new Color(Color.context.fillStyle);
    }

    static random() {
        return new Color(Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256));
    }

    static trueRandom() {
        return new Color([...crypto.getRandomValues(new Uint8Array(3))]);
    }

    static get lightModePreffered() {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    }

    static get theme(){
        return document.body.getAttribute("ls-theme");
    }

    static set theme(theme){
        this.setTheme(theme);
    }

    static get accent(){
        return document.body.getAttribute("ls-accent");
    }

    static set accent(color){
        this.setAccent(color);
    }

    static generate(r, g, b) {
        const color = (r instanceof Color)? r.clone(): new Color(r, g, b);
        let style = '';

        // Cache HSL once
        const hsl = color.getHSL();
        const h = hsl[0];
        const s = hsl[1];
        const sat = s * 0.12;

        // Accents: 10..90 and 35, 45, 55, 95
        for(let i = 1; i <= 9; i++){
            const v = i * 10;
            color.setHSL(h, s, v);
            style += `--accent-${v}:${color.hex};`;

            if(i === 3 || i === 4 || i === 5 || i === 9){
                const vv = v + 5;
                color.setHSL(h, s, vv);
                style += `--accent-${vv}:${color.hex};`;
            }
        }

        // Bases: 6, 8
        color.setHSL(h, sat, 6);
        style += `--base-6:${color.hex};`;
        color.setHSL(h, sat, 8);
        style += `--base-8:${color.hex};`;

        // Bases: 10..90 and 15..95
        for(let i = 1; i <= 9; i++){
            const v = i * 10;
            const tone = color.setHSL(h, sat, v).hex;
            const midTone = color.setHSL(h, sat, v + 5).hex;
            
            style += `--base-${v}:${tone};--base-${v+5}:${midTone};`;
        }

        // Bases: 98
        color.setHSL(h, sat, 98);
        style += `--base-98:${color.hex};`; 

        return style;
    }

    static add(name, r, g, b){
        if(this.colors.has(name)) return false;
        return this.update(name, r, g, b);
    }

    static ensureRule(name) {
        let accent = this.colors.get(name);
        if (!accent) {
            accent = {};
            this.colors.set(name, accent);
        }

        if (accent.ruleIndex === undefined) {
            const selector = `[ls-accent="${CSS.escape(name)}"]`;
            const index = this.sheet.cssRules.length;
            this.sheet.insertRule(`${selector}{}`, index);
            accent.ruleIndex = index;
        }

        return accent;
    }

    static update(name, r, g, b) {
        const accent = this.ensureRule(name);

        // Keep your Color handling as-is
        const color = (r instanceof Color) ? r : new Color(r, g, b);
        accent.color = color;

        const rule = this.sheet.cssRules[accent.ruleIndex];
        if (!(rule instanceof CSSStyleRule)) {
            throw new Error(`Rule at index ${accent.ruleIndex} is not a CSSStyleRule.`);
        }

        // Mutate in place; no delete/insert, no index shifting
        rule.style.cssText = this.generate(color);

        return accent;
    }

    static apply(element, r, g, b){
        let color = (r instanceof Color)? r: new Color(r, g, b);
        element.style.cssText += this.generate(color);
        element.setAttribute("ls-accent", "");
    }

    static remove(name){
        let color = this.colors.get(name);

        if(!color) return false;

        this.style.removeChild(color.style);
        this.colors.delete(name);
    }

    static setAccent(accent, store = true){
        if(this.#settingAccent) {
            this.#settingAccent = accent;
            return this;
        }

        this.#settingAccent = accent;

        // Changes are defered until the body is available and batched to the next animation frame
        LS.once("ready", () => {
            LS.Context.requestAnimationFrame(() => {
                if(!this.#settingAccent) return;

                document.body.classList.add("no-transitions");

                if(typeof this.#settingAccent !== "string" || (this.#settingAccent.startsWith("#") || this.#settingAccent.startsWith("rgb") || this.#settingAccent.startsWith("hsl"))) {
                    const color = new Color(this.#settingAccent);

                    this.#settingAccent = color.hex;
                    Color.update('custom', color);
                    document.body.setAttribute("ls-accent", "custom");
                } else {
                    document.body.setAttribute("ls-accent", this.#settingAccent);
                }

                this.emit("accent-changed", [this.#settingAccent]);

                if(store) {
                    if(accent === "white") {
                        localStorage.removeItem("ls-accent");
                    } else {
                        localStorage.setItem("ls-accent", this.#settingAccent);
                    }
                }

                this.#settingAccent = null;

                LS.Context.setTimeout(() => {
                    if(this.#settingAccent) return;
                    document.body.classList.remove("no-transitions");
                }, 0);
            });
        });

        return this;
    }

    static setTheme(theme, store = true){
        if(this.#settingTheme) {
            this.#settingTheme = theme;
            return this;
        }

        this.#settingTheme = theme;

        // Changes are defered until the body is available and batched to the next animation frame
        LS.once("ready", () => {
            LS.Context.requestAnimationFrame(() => {
                if(!this.#settingTheme) return;
                document.body.setAttribute("ls-theme", this.#settingTheme);
                document.body.classList.add("no-transitions");
                this.emit("theme-changed", [this.#settingTheme]);

                if(store) localStorage.setItem("ls-theme", this.#settingTheme);

                this.#settingTheme = null;

                LS.Context.setTimeout(() => {
                    if(this.#settingTheme) return;
                    document.body.classList.remove("no-transitions");
                }, 0);
            });
        });

        return this;
    }

    static setAdaptiveTheme(amoled){
        Color.setTheme(localStorage.getItem("ls-theme") || (this.lightModePreffered? "light": amoled? "amoled" : "dark"), false);
        return this;
    }

    static autoScheme(amoled){
        this.setAdaptiveTheme(amoled);
        this.on("scheme-changed", () => this.setAdaptiveTheme(amoled));
        return this;
    }

    static autoAccent(){
        if(localStorage.hasOwnProperty("ls-accent")){
            const accent = localStorage.getItem("ls-accent");
            Color.setAccent(accent, false);
        }

        return this;
    }

    static all(){
        return [...this.colors.keys()];
    }

    static randomAccent(){
        let colors = this.all();
        return colors[Math.floor(Math.random() * colors.length)];
    }

    static fromBuffer(buffer, offset = 0) {
        return new ColorView(buffer, offset);
    }

    static fromImage(image, sampleGap = 16, maxResolution = 200){
        if(!(image instanceof HTMLImageElement)) {
            throw new TypeError("The first argument must be an image element");
        }

        image.crossOrigin = "Anonymous";

        sampleGap += sampleGap % 4;

        let pixelIndex = -4,
            sum = [0, 0, 0],
            sampleCount = 0
        ;

        if(!Color.canvas) {
            Color._createProcessingCanvas();
        }

        // Set willReadFrequently for better performance on some browsers
        // This forces software rendering, and since we only process small amounts of data, read speeds are more important
        if (Color.context && Color.context.getImageData) {
            Color.context.willReadFrequently = true;
        }

        if (!Color.context) return new Color(0, 0, 0);

        const scale = Math.min(1, maxResolution / Math.max(image.naturalWidth, image.naturalHeight));

        Color.canvas.width = Math.ceil(image.naturalWidth * scale);
        Color.canvas.height = Math.ceil(image.naturalHeight * scale);

        Color.context.drawImage(image, 0, 0, Color.canvas.width, Color.canvas.height);

        let imageData;
        try {
            imageData = Color.context.getImageData(0, 0, Color.canvas.width, Color.canvas.height);
        } catch (error) {
            console.error(error);
            return new Color(0, 0, 0);
        }

        for (let i = imageData.data.length; (pixelIndex += sampleGap) < i; ) {
            ++sampleCount
            sum[0] += imageData.data[pixelIndex]
            sum[1] += imageData.data[pixelIndex + 1]
            sum[2] += imageData.data[pixelIndex + 2]
        }
    
        return new Color((sum[0] = ~~(sum[0] / sampleCount)), (sum[1] = ~~(sum[1] / sampleCount)), (sum[2] = ~~(sum[2] / sampleCount)));
    }

    static _createProcessingCanvas() {
        if(!Color.canvas) {
            const canvas = document.createElement('canvas');
            Color.canvas = canvas;
            Color.context = canvas.getContext('2d');
        }
    }

    static namedColors = new Map([
        ["aliceblue", [240, 248, 255]],
        ["antiquewhite", [250, 235, 215]],
        ["aqua", [0, 255, 255]],
        ["aquamarine", [127, 255, 212]],
        ["azure", [240, 255, 255]],
        ["beige", [245, 245, 220]],
        ["bisque", [255, 228, 196]],
        ["black", [0, 0, 0]],
        ["blanchedalmond", [255, 235, 205]],
        ["blue", [0, 0, 255]],
        ["blueviolet", [138, 43, 226]],
        ["brown", [165, 42, 42]],
        ["burlywood", [222, 184, 135]],
        ["cadetblue", [95, 158, 160]],
        ["chartreuse", [127, 255, 0]],
        ["chocolate", [210, 105, 30]],
        ["coral", [255, 127, 80]],
        ["cornflowerblue", [100, 149, 237]],
        ["cornsilk", [255, 248, 220]],
        ["crimson", [220, 20, 60]],
        ["cyan", [0, 255, 255]],
        ["darkblue", [0, 0, 139]],
        ["darkcyan", [0, 139, 139]],
        ["darkgoldenrod", [184, 134, 11]],
        ["darkgray", [169, 169, 169]],
        ["darkgreen", [0, 100, 0]],
        ["darkgrey", [169, 169, 169]],
        ["darkkhaki", [189, 183, 107]],
        ["darkmagenta", [139, 0, 139]],
        ["darkolivegreen", [85, 107, 47]],
        ["darkorange", [255, 140, 0]],
        ["darkorchid", [153, 50, 204]],
        ["darkred", [139, 0, 0]],
        ["darksalmon", [233, 150, 122]],
        ["darkseagreen", [143, 188, 143]],
        ["darkslateblue", [72, 61, 139]],
        ["darkslategray", [47, 79, 79]],
        ["darkslategrey", [47, 79, 79]],
        ["darkturquoise", [0, 206, 209]],
        ["darkviolet", [148, 0, 211]],
        ["deeppink", [255, 20, 147]],
        ["deepskyblue", [0, 191, 255]],
        ["dimgray", [105, 105, 105]],
        ["dimgrey", [105, 105, 105]],
        ["dodgerblue", [30, 144, 255]],
        ["firebrick", [178, 34, 34]],
        ["floralwhite", [255, 250, 240]],
        ["forestgreen", [34, 139, 34]],
        ["fuchsia", [255, 0, 255]],
        ["gainsboro", [220, 220, 220]],
        ["ghostwhite", [248, 248, 255]],
        ["gold", [255, 215, 0]],
        ["goldenrod", [218, 165, 32]],
        ["gray", [128, 128, 128]],
        ["green", [0, 128, 0]],
        ["greenyellow", [173, 255, 47]],
        ["grey", [128, 128, 128]],
        ["honeydew", [240, 255, 240]],
        ["hotpink", [255, 105, 180]],
        ["indianred", [205, 92, 92]],
        ["indigo", [75, 0, 130]],
        ["ivory", [255, 255, 240]],
        ["khaki", [240, 230, 140]],
        ["lavender", [230, 230, 250]],
        ["lavenderblush", [255, 240, 245]],
        ["lawngreen", [124, 252, 0]],
        ["lemonchiffon", [255, 250, 205]],
        ["lightblue", [173, 216, 230]],
        ["lightcoral", [240, 128, 128]],
        ["lightcyan", [224, 255, 255]],
        ["lightgoldenrodyellow", [250, 250, 210]],
        ["lightgray", [211, 211, 211]],
        ["lightgreen", [144, 238, 144]],
        ["lightgrey", [211, 211, 211]],
        ["lightpink", [255, 182, 193]],
        ["lightsalmon", [255, 160, 122]],
        ["lightseagreen", [32, 178, 170]],
        ["lightskyblue", [135, 206, 250]],
        ["lightslategray", [119, 136, 153]],
        ["lightslategrey", [119, 136, 153]],
        ["lightsteelblue", [176, 196, 222]],
        ["lightyellow", [255, 255, 224]],
        ["lime", [0, 255, 0]],
        ["limegreen", [50, 205, 50]],
        ["linen", [250, 240, 230]],
        ["magenta", [255, 0, 255]],
        ["maroon", [128, 0, 0]],
        ["mediumaquamarine", [102, 205, 170]],
        ["mediumblue", [0, 0, 205]],
        ["mediumorchid", [186, 85, 211]],
        ["mediumpurple", [147, 112, 219]],
        ["mediumseagreen", [60, 179, 113]],
        ["mediumslateblue", [123, 104, 238]],
        ["mediumspringgreen", [0, 250, 154]],
        ["mediumturquoise", [72, 209, 204]],
        ["mediumvioletred", [199, 21, 133]],
        ["midnightblue", [25, 25, 112]],
        ["mintcream", [245, 255, 250]],
        ["mistyrose", [255, 228, 225]],
        ["moccasin", [255, 228, 181]],
        ["navajowhite", [255, 222, 173]],
        ["navy", [0, 0, 128]],
        ["oldlace", [253, 245, 230]],
        ["olive", [128, 128, 0]],
        ["olivedrab", [107, 142, 35]],
        ["orange", [255, 165, 0]],
        ["orangered", [255, 69, 0]],
        ["orchid", [218, 112, 214]],
        ["palegoldenrod", [238, 232, 170]],
        ["palegreen", [152, 251, 152]],
        ["paleturquoise", [175, 238, 238]],
        ["palevioletred", [219, 112, 147]],
        ["papayawhip", [255, 239, 213]],
        ["peachpuff", [255, 218, 185]],
        ["peru", [205, 133, 63]],
        ["pink", [255, 192, 203]],
        ["plum", [221, 160, 221]],
        ["powderblue", [176, 224, 230]],
        ["purple", [128, 0, 128]],
        ["rebeccapurple", [102, 51, 153]],
        ["red", [255, 0, 0]],
        ["rosybrown", [188, 143, 143]],
        ["royalblue", [65, 105, 225]],
        ["saddlebrown", [139, 69, 19]],
        ["salmon", [250, 128, 114]],
        ["sandybrown", [244, 164, 96]],
        ["seagreen", [46, 139, 87]],
        ["seashell", [255, 245, 238]],
        ["sienna", [160, 82, 45]],
        ["silver", [192, 192, 192]],
        ["skyblue", [135, 206, 235]],
        ["slateblue", [106, 90, 205]],
        ["slategray", [112, 128, 144]],
        ["slategrey", [112, 128, 144]],
        ["snow", [255, 250, 250]],
        ["springgreen", [0, 255, 127]],
        ["steelblue", [70, 130, 180]],
        ["tan", [210, 180, 140]],
        ["teal", [0, 128, 128]],
        ["thistle", [216, 191, 216]],
        ["tomato", [255, 99, 71]],
        ["turquoise", [64, 224, 208]],
        ["violet", [238, 130, 238]],
        ["wheat", [245, 222, 179]],
        ["white", [255, 255, 255]],
        ["whitesmoke", [245, 245, 245]],
        ["yellow", [255, 255, 0]],
        ["yellowgreen", [154, 205, 50]],
        ["transparent", [0, 0, 0, 0]]
    ]);
}