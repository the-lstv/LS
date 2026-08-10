/**
 * Author: Lukas (thelstv)
 * Copyright: (c) https://lstv.space
 *
 * Last modified: 2026
 *
 * @description Extensive color library and theme utilities
 * @copyright 2026 Lukas (thelstv) <https://lstv.space>
 * @see https://github.com/thelstv/LS
 * @license GPL-3.0
 * 
 * TODO: Split advanced color features into a separate module, this has grown too big
*/

(() => {
const fast = LS.Util.fast;
const fasth2i = fast.h2i;
const fasttwoh2i = fast.twoh2i;

LS.Color = class Color {
    constructor(r, g, b, a) {
        if (r && (r instanceof Uint8Array || r instanceof Uint8ClampedArray || r instanceof ArrayBuffer)) {
            this.data = (r instanceof ArrayBuffer) ? new Uint8Array(r) : r;
            this.offset = (typeof g === "number") ? g : 0;
            return;
        }

        if (Array.isArray(r) && r.length >= 3) {
            this.data = r;
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

    /**
     * Get or set red channel value (0-255)
     */
    get r() { return this.data[this.offset] }
    set r(value) { this.data[this.offset] = value }
    
    /**
     * Get or set green channel value (0-255)
     */
    get g() { return this.data[this.offset + 1] }
    set g(value) { this.data[this.offset + 1] = value }
    
    /**
     * Get or set blue channel value (0-255)
     */
    get b() { return this.data[this.offset + 2] }
    set b(value) { this.data[this.offset + 2] = value }
    
    
    /**
     * Get or set alpha channel value (0-1)
     */
    get a() { return this.data[this.offset + 3] / 255 }
    set a(value) { this.data[this.offset + 3] = Math.round(value * 255) }

    /**
     * Get the color as an integer in 0xRRGGBB format
     */
    get int(){
        return ((this.data[this.offset] << 16) | (this.data[this.offset + 1] << 8) | this.data[this.offset + 2]) >>> 0;
    }

    /**
     * Get the color as an integer in 0xAARRGGBB format
     */
    get hexInt() {
        return (this.data[this.offset] << 16) | (this.data[this.offset + 1] << 8) | this.data[this.offset + 2] | (1 << 24);
    }

    /**
     * Get the color as a hex string in #RRGGBB format
     */
    get hex() {
        return "#" + this.hexInt.toString(16).slice(1);
    }

    /**
     * Get the color as rgb(r, g, b) string
     */
    get rgb() {
        return `rgb(${this.data[this.offset]}, ${this.data[this.offset + 1]}, ${this.data[this.offset + 2]})`;
    }

    /**
     * Get the color as rgba(r, g, b, a) string
     */
    get rgba() {
        return `rgba(${this.data[this.offset]}, ${this.data[this.offset + 1]}, ${this.data[this.offset + 2]}, ${this.data[this.offset + 3] / 255})`;
    }

    /**
     * Get the color as an HSL array [hue (0-360), saturation (0-100), lightness (0-100)]
     * @param {array} out Optional array to store the result in
     * @returns {array} HSL array
     */
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

    /**
     * Get the color as an HSL array
     */
    get hsl() {
        return this.getHSL([0, 0, 0]);
    }

    /**
     * Get the color as an HSB array
     */
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

    /**
     * Get the color as an RGBA array with alpha normalized to 0-1
     */
    get color() {
        return [this.data[this.offset], this.data[this.offset + 1], this.data[this.offset + 2], this.data[this.offset + 3] / 255];
    }

    /**
     * Get the color as an RGBA array with alpha in 0-255
     */
    get pixel() {
        return [this.data[this.offset], this.data[this.offset + 1], this.data[this.offset + 2], this.data[this.offset + 3]];
    }

    /**
     * Get the value of a specific channel (0 = red, 1 = green, 2 = blue, 3 = alpha)
     */
    browse(channel = 0) {
        return this.data[this.offset + channel];
    }

    /**
     * Copy the color values to a target array at the given offset
     * @param {*} target Target array to copy the color into
     * @param {*} offset Optional offset in the target array
     * @returns Target array with copied color values
     */
    copyTo(target, offset = 0) {
        target[offset] = this.data[this.offset];
        target[offset + 1] = this.data[this.offset + 1];
        target[offset + 2] = this.data[this.offset + 2];
        target[offset + 3] = this.data[this.offset + 3];
        return target;
    }

    /**
     * Get the color as an RGBA array with values normalized to 0-1 and rounded to the nearest float32 representation (useful for WebGL shaders)
     */
    get floatPixel() {
        return [Math.fround(this.data[this.offset] / 255), Math.fround(this.data[this.offset + 1] / 255), Math.fround(this.data[this.offset + 2] / 255), Math.fround(this.data[this.offset + 3] / 255)];
    }

    /**
     * Get the perceived brightness of the color using the Rec. 709 formula
     */
    get luma() {
        return 0.2126 * this.data[this.offset] + 0.7152 * this.data[this.offset + 1] + 0.0722 * this.data[this.offset + 2];
    }

    /**
     * Get the perceived brightness of the color using the HSP color model
     */
    get brightness() {
        return Math.sqrt(
            0.299 * (this.data[this.offset] * this.data[this.offset]) +
            0.587 * (this.data[this.offset + 1] * this.data[this.offset + 1]) +
            0.114 * (this.data[this.offset + 2] * this.data[this.offset + 2])
        );
    }

    /**
     * Get a binary value representing whether the color is closer to black (0) or white (1) based on its brightness, using a threshold of 127.5
     */
    get bit() {
        return this.brightness >= 127.5 ? 1 : 0;
    }

    /**
     * Get a boolean value indicating whether the color is considered dark (true) or light (false) based on its brightness, using a threshold of 127.5
     */
    get isDark() {
        return this.brightness < 127.5;
    }

    /**
     * Set the hue of the color while preserving saturation and lightness
     * @param {*} hue New hue value (0-360)
     * @returns {Color} Self
     */
    hue(hue) {
        let [h, s, l] = this.hsl;
        h = Math.max(Math.min(hue, 360), 0);
        this.setHSL(h, s, l);
        return this;
    }

    /**
     * Set the saturation of the color while preserving hue and lightness
     * @param {*} percent New saturation value (0-100)
     * @returns {Color} Self
     */
    saturation(percent) {
        let [h, s, l] = this.hsl;
        s = Math.max(Math.min(percent, 100), 0);
        this.setHSL(h, s, l);
        return this;
    }

    /**
     * Set the lightness of the color while preserving hue and saturation
     * @param {*} percent New lightness value (0-100)
     * @returns {Color} Self
     */
    lightness(percent) {
        let [h, s, l] = this.hsl;
        l = Math.max(Math.min(percent, 100), 0);
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

    /**
     * Sets the tone of the color by adjusting its hue, saturation, and lightness
     * @param {*} hue New hue value (0-360)
     * @param {*} saturation New saturation value (0-100)
     * @param {*} lightness New lightness value (0-100)
     * @returns {Color} Self
     */
    tone(hue, saturation, lightness) {
        let [h, s, l] = this.hsl;
        this.setHSL(hue || h, (s / 100) * saturation, typeof lightness === "number" ? lightness : l);
        return this;
    }

    /**
     * Lightens the color by increasing its lightness by the given percentage (0-100)
     * @param {*} percent Percentage to lighten the color by
     * @return {Color} Self
     */
    lighten(percent) {
        let [h, s, l] = this.hsl;
        l = Math.max(Math.min(l + percent, 100), 0);
        this.setHSL(h, s, l);
        return this;
    }

    /**
     * Saturates the color by increasing its saturation by the given percentage (0-100)
     * @param {*} percent Percentage to saturate the color by
     * @return {Color} Self
     */
    saturate(percent) {
        let [h, s, l] = this.hsl;
        s = Math.max(Math.min(s + percent, 100), 0);
        this.setHSL(h, s, l);
        return this;
    }

    /**
     * Darkens the color by decreasing its lightness by the given percentage (0-100)
     * @param {*} percent Percentage to darken the color by
     * @return {Color} Self
     */
    darken(percent) {
        let [h, s, l] = this.hsl;
        l = Math.max(Math.min(l - percent, 100), 0);
        this.setHSL(h, s, l);
        return this;
    }

    /**
     * Shifts the hue of the color by the given degrees (positive or negative)
     * @param {*} deg Degrees to shift the hue by
     * @return {Color} Self
     */
    hueShift(deg) {
        let [h, s, l] = this.hsl;
        h = (h + deg) % 360;
        this.setHSL(h, s, l);
        return this;
    }

    /**
     * Multiplies each channel by the given factor
     * Provide null to skip a channel
     * @param {number|null} factorR Factor to multiply the red channel by (or null to skip)
     * @param {number|null} factorG Factor to multiply the green channel by (or null to skip)
     * @param {number|null} factorB Factor to multiply the blue channel by (or null to skip)
     * @param {number|null} factorA Factor to multiply the alpha channel by (or null to skip)
     * @return {Color} Self
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
     * @param {number|null} factorR Factor to divide the red channel by (or null to skip)
     * @param {number|null} factorG Factor to divide the green channel by (or null to skip)
     * @param {number|null} factorB Factor to divide the blue channel by (or null to skip)
     * @param {number|null} factorA Factor to divide the alpha channel by (or null to skip)
     * @return {Color} Self
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

    /**
     * Adds the given color values to the current color
     * @param {number} r2 Red value to add (0-255)
     * @param {number} g2 Green value to add (0-255)
     * @param {number} b2 Blue value to add (0-255)
     * @param {number} a2 Alpha value to add (0-1)
     * @return {Color} Self
     */
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

    /**
     * Subtracts the given color values from the current color
     * @param {number} r2 Red value to subtract (0-255)
     * @param {number} g2 Green value to subtract (0-255)
     * @param {number} b2 Blue value to subtract (0-255)
     * @param {number} a2 Alpha value to subtract (0-1)
     * @return {Color} Self
     */
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
     * @param {Color|array|number|string} val Color to mix with (can be a Color instance, an array of RGBA values, or any valid color input)
     * @param {number} weight Weight to mix by (0 to 1)
     * @return {Color} Self
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
     * @param {number} v Alpha value to set (0-1)
     * @return {Color} Self
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

    /**
     * Sets the color in HSL format
     * @param {number} h Hue (0-360)
     * @param {number} s Saturation (0-100)
     * @param {number} l Lightness (0-100)
     * @param {number} alpha Alpha (0-1)
     * @return {Color} Self
     */
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

    /**
     * Sets the color in HSB/HSV format
     * @param {number} h Hue (0-360)
     * @param {number} s Saturation (0-100)
     * @param {number} b Brightness/Value (0-100)
     * @param {number} alpha Alpha (0-1)
     * @return {Color} Self
     */
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
     * Provide null or NaN to skip a channel
     * @param {number|null} r Red value to set (0-255)
     * @param {number|null} g Green value to set (0-255)
     * @param {number|null} b Blue value to set (0-255)
     * @param {number|null} a Alpha value to set (0-1)
     * @return {Color} Self
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
     * Accepts the same inputs as the Color.parse() method
     */
    set(r, g, b, a) {
        Color.parse(r, g, b, a, this.data, this.offset);
        return this;
    }

    /**
     * Sets the color from a hex string, faster for hex inputs than the generic set() method
     * @param {string} hex Hex color string in #RRGGBB or #RGB format
     * @return {Color} Self
     */
    setHex(hex) {
        Color.parseHex(hex, this.data, this.offset);
        return this;
    }

    /**
     * Creates a copy of this color, optionally into a provided target and offset
     * @param {Uint8Array|Array} target Optional target array to copy the color into (if not provided, a new array will be created)
     * @param {number} offset Optional offset in the target array (default is 0)
     * @returns {Color} New Color instance with copied values
     */
    clone(target = undefined, offset = 0) {
        const c = new Color(target, offset);
        this.copyTo(c.data, c.offset);
        return c;
    }

    /** Returns a string representation of the color, which is the rgba() format */
    toString() {
        return this.rgba;
    }

    /** Returns an array representation of the color in [r, g, b, a] format with alpha in 0-255 */
    toArray() {
        return [this.data[this.offset], this.data[this.offset+1], this.data[this.offset+2], this.data[this.offset+3]];
    }

    /** Returns a JSON representation of the color with r, g, b, a properties (alpha in 0-1) */
    toJSON() {
        return {
            r: this.data[this.offset],
            g: this.data[this.offset + 1],
            b: this.data[this.offset + 2],
            a: this.data[this.offset + 3]
        };
    }

    *[Symbol.iterator]() {
        yield this.data[this.offset];
        yield this.data[this.offset + 1];
        yield this.data[this.offset + 2];
        yield this.data[this.offset + 3];
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
        if(!Color.context) Color.#createProcessingCanvas();
        const imageData = Color.context.createImageData(1, 1);
        this.copyTo(imageData.data);
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
     * @returns {Color} Self
     */
    applyAsAccent() {
        if(!LS.isWeb) return;
        Color.setAccent(this);
        return this;
    }

    /**
     * Creates or updates a sitewide named accent
     * @param {string} name Name of the accent to create or update (default is "default")
     * @returns {Color} Self
     */
    toAccent(name = "default") {
        if(!LS.isWeb) return;
        Color.update(name, this);
        return this;
    }

    /**
     * Generates a CSS accent from this color
     * @return {string} CSS color string that can be used in accent-color properties
     */
    toAccentCSS() {
        return Color.generate(this);
    }

    // --- Special methods for multiple pixels

    /**
     * Set offset by pixel index
     * @param {number} index Pixel index to set the offset to (0-based)
     * @returns {Color} Self
     */
    at(index) {
        this.offset = index * 4;
        return this;
    }

    /**
     * Set offset by raw index (snapped to pixel index)
     * @param {number} index Raw index to set the offset to
     * @returns {Color} Self
     */
    setOffset(index) {
        // Why 
        this.at(Math.floor(index / 4));
        return this;
    }

    /**
     * Move to the next pixel by incrementing the offset by 4
     * @param {number} by Number of pixels to move forward (default is 1)
     * @returns {Color} Self
     */
    next(by = 1) {
        this.offset += by * 4;
        return this;
    }

    /**
     * Returns the pixel count
     */
    get pixelCount() {
        return this.data.length / 4;
    }

    /**
     * Returns whether the current offset is at or beyond the last pixel
     */
    get atEnd() {
        return this.offset +4 >= this.data.length;
    }

    /**
     * Fills the color data with the given color starting from the current offset. If limit is provided, fills up to that many pixels, otherwise fills to the end of the array.
     * @param {*} r
     * @param {number} g
     * @param {number} b
     * @param {number} a
     * @param {number} offset Optional offset in pixels
     * @param {number} limit Optional maximum number of pixels to fill
    */
    fill(r, g, b, a, offset = 0, limit = -1) {
        Color.parse(r, g, b, a, this.data, offset);

        const sub = Array.isArray(this.data)? null: this.data.subarray(offset, offset + 4);
        const length = this.data.length;

        for (let i = offset + 4; i < (limit === -1? length: Math.min(limit * 4 || length, length)); i += 4) {
            if(sub) {
                this.data.set(sub, i);
            } else {
                this.data[i] = this.data[offset];
                this.data[i + 1] = this.data[offset + 1];
                this.data[i + 2] = this.data[offset + 2];
                this.data[i + 3] = this.data[offset + 3];
            }
        }
        return this;
    }

    // --- Special methods for theme management

    static #settingAccent = null;
    static #settingTheme = null;
    static autoSchemeEnabled = false;
    static {
        this.events = new LS.EventEmitter;
        this.colors = new Map;

        if(LS.isWeb) {
            // Style tag to manage
            this.style = document.createElement("style");
            document.head.appendChild(this.style);
            this.sheet = this.style.sheet;

            this.style.id = "ls-colors-style";

            if(window.matchMedia) {
                window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', thing => {
                    if(this.autoSchemeEnabled) {
                        this.setAdaptiveTheme();
                    }

                    this.events.emit("scheme-changed", [thing.matches]);
                });
            }

            if(LS.__deferedColorOptions) {
                this.initOptions(LS.__deferedColorOptions);
                delete LS.__deferedColorOptions;
            }

            this.currentAccent = [0, 0, 0, 255];
            LS.once("ready", () => {
                this.getAccentColorValueOf(document.body, this.currentAccent);
            });
        }
    }

    static initOptions(options) {
        if(options.theme) this.setTheme(options.theme, false, false);
        if(options.accent) this.setAccent(options.accent, false, false);
        if(options.autoAccent) this.autoAccent();

        if(options.autoScheme) {
            this.autoSchemeEnabled = true;
            this.setAdaptiveTheme();
        }
    }

    static on(event, listener) {
        this.events.on(event, listener);
    }

    static once(event, listener) {
        this.events.once(event, listener);
    }

    static off(event, listener) {
        this.events.off(event, listener);
    }

    /**
     * Parses a color from various input formats and writes it into the target array at the given offset. Strings are case-insensitive and trimmed.
     * Supports:
     * - Hex strings (#RGB, #RGBA, #RRGGBB, #RRGGBBAA)
     * - Integer RGB/RGBA (0xRRGGBB, 0xRRGGBBAA)
     * - RGB/RGBA strings (rgb(255, 0, 0), rgba(255, 0, 0, 0.5))
     * - HSL/HSLA strings (hsl(120, 100%, 50%), hsla(120, 100%, 50%, 0.5))
     * - HSB/HSBA strings (hsb(120, 100%, 100%), hsba(120, 100%, 100%, 0.5))
     * - Named CSS colors
     * - Arrays [r, g, b], [r, g, b, a]
     * - Objects { r, g, b }, { r, g, b, a }
     * - Another Color instance
     * - Integer values for r, g, b, a (0-255 for r, g, b and 0-1 for a)
     * - Any valid CSS color string (as a fallback, using the browser's parser)
     * 
     * @param {*} r
     * @param {number} g
     * @param {number} b
     * @param {number} a
     * @param {Array} target
     * @param {number} offset
     * @returns {Array} Target array with parsed color
     * @throws {Error} If the input string cannot be parsed as a color
     * 
     * @example
     * // Note: if you only parse hex colors, use Color.parseHex for better performance
     * Color.parse("#ff0000");
     * Color.parse("rgba(255, 0, 0, 0.5)");
     * Color.parse("hsl(120, 100%, 50%)");
     * Color.parse("hsb(120, 100%, 100%)");
     * Color.parse("red");
     * Color.parse([255, 0, 0]);
     * Color.parse({ r: 255, g: 0, b: 0 });
     * Color.parse(new Color());
     * Color.parse(255, 0, 0, 0.5);
     * Color.parse(0xff0000);
     */

    static parse(r, g, b, a, target, offset = 0) {
        target ??= [0, 0, 0, 1];

        if (typeof r === "string") {
            r = r.trim().toLowerCase();

            if(r.length === 0) {
                target[offset] = 0; target[offset + 1] = 0; target[offset + 2] = 0; target[offset + 3] = 255;
                return target;
            }

            // Hex
            if(r.charCodeAt(0) === 35) {
                return Color.parseHex(r, target, offset);
            }

            // RGB
            // Parsing this is currently quite slow and should be avoided if another format can be used
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
                    throw new Error("Color " + r + " could not be parsed.");
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
                    throw new Error("Color " + r + " could not be parsed.");
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
                    throw new Error("Color " + r + " could not be parsed.");
                }
            }

            else if(Color.accentColors.has(r)) {
                [r, g, b, a] = Color.accentColors.get(r);
                target[offset] = r;
                target[offset + 1] = g;
                target[offset + 2] = b;
                target[offset + 3] = a !== undefined ? a : 255;
                return target;
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
                    Color.#createProcessingCanvas();
                }

                Color.context.fillStyle = "#000000"; // If the following fails, this ensures we don't fallback to the last successful color
                Color.context.fillStyle = r;
                return Color.parseHex(Color.context.fillStyle, target, offset);
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

    /**
     * Parses a hex code string to a RGB array.
     * Pretty much as fast as JavaScript can realistically get.
     * 
     * Note: invalid hex characters result in -1 rather than an error. To validate, check for -1 in any channel. Invalid string length will throw an error, however.
     * This library will automatically treat such as 0 after clamping; you may or may not want that behavior (eg. #ggg => #000, and the opposite for typed arrays as there -1 flips to 255!).
     * https://jsbm.dev/YUQagaiMDfxOv
     * 
     * Note: This does not check the first character for '#', it assumes it's already checked
     * 
     * @param {string} hex Hex string in the format #RGB, #RGBA, #RRGGBB or #RRGGBBAA
     * @param {Array|Uint8Array} target Optional target array to write the result to (default: [0, 0, 0, 255])
     * @param {number} offset Optional offset in the target array to write to (default: 0)
     * @returns {Array} [r, g, b, a] with r, g, b in 0-255 and a in 0-255
     */
    static parseHex(hex, target, offset = 0) {
        const len = hex.length;
        if(len < 4 || len > 9) {
            throw new Error("Invalid hex string: " + hex.slice(0, 10) + (len > 10 ? "..." : ""));
        }

        target ??= [0, 0, 0, 255];

        if (len <= 5) {
            // Single hex digit
            target[offset] = fasth2i(hex.charCodeAt(1)) * 0x11;
            target[offset + 1] = fasth2i(hex.charCodeAt(2)) * 0x11;
            target[offset + 2] = fasth2i(hex.charCodeAt(3)) * 0x11;
            if(len === 5) target[offset + 3] = fasth2i(hex.charCodeAt(4)) * 0x11;
        } else {
            // Two hex digits
            target[offset] = fasttwoh2i(hex.charCodeAt(1), hex.charCodeAt(2));
            target[offset + 1] = fasttwoh2i(hex.charCodeAt(3), hex.charCodeAt(4));
            target[offset + 2] = fasttwoh2i(hex.charCodeAt(5), hex.charCodeAt(6));
            if(len === 9) target[offset + 3] = fasttwoh2i(hex.charCodeAt(7), hex.charCodeAt(8));
        }
        return target;
    }

    static validateHex(hex) {
        const len = hex.length;
        if(hex.charCodeAt(0) !== 35 || (len !== 4 && len !== 5 && len !== 7 && len !== 9)) {
            return false;
        }

        for(let i = 1; i < len; i++) {
            const c = hex.charCodeAt(i);
            if(!(c >= 48 && c <= 57) || // 0-9
                (c >= 65 && c <= 70) || // A-F
                (c >= 97 && c <= 102))  // a-f
            return false;
        }

        return true;
    }

    /**
     * Creates a color from HSL values.
     * @param {number} h - Hue (0-360)
     * @param {number} s - Saturation (0-1)
     * @param {number} l - Lightness (0-1)
     * @returns {Color} The created color
     */
    static fromHSL(h, s, l) {
        return new Color().setHSL(h, s, l);
    }

    /**
     * Creates a color from HSB/HSV values.
     * @param {number} h - Hue (0-360)
     * @param {number} s - Saturation (0-1)
     * @param {number} b - Brightness/Value (0-1)
     * @returns {Color} The created color
     */
    static fromHSB(h, s, b) {
        return new Color().setHSB(h, s, b);
    }

    /**
     * Creates a color from a hex string.
     * @param {string} hex - The hex string in the format #RGB, #RGBA, #RRGGBB or #RRGGBBAA
     * @returns {Color} The created color
     */
    static fromHex(hex) {
        return new Color(Color.parseHex(hex));
    }

    /**
     * Creates a color from a 32-bit integer.
     * @param {number} int - The integer in the format 0xRRGGBB
     * @returns {Color} The created color
     */
    static fromInt(int) {
        let r = (int >> 16) & 0xFF;
        let g = (int >> 8) & 0xFF;
        let b = int & 0xFF;
        return new Color(r, g, b);
    }

    /**
     * Creates a color from a pixel array.
     * @param {Array} pixel - The pixel array in the format [r, g, b, a]
     * @returns {Color} The created color
     */
    static fromPixel(pixel) {
        return new Color(pixel[0], pixel[1], pixel[2], pixel[3] / 255);
    }

    /**
     * Creates a colorview from a buffer. This does not copy and reflects changes to the buffer.
     * @param {*} buffer Buffer containing color data
     * @param {*} offset Offset into the buffer
     * @returns {Color} The created color instance
     */
    static fromBuffer(buffer, offset = 0) {
        return new Color(buffer, offset);
    }

    /**
     * Creates a color from an image by sampling pixels to obtain a representative color.
     * @param {*} image Image element to sample
     * @param {*} sampleGap Gap between sampled pixels
     * @param {*} maxResolution Maximum resolution of the processed image
     * @returns {Color} The created color instance
     */
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
            Color.#createProcessingCanvas();
        }

        // Set willReadFrequently for better performance on some browsers
        // This forces CPU, and since we only process small amounts of data, read speeds are more important than GPU acceleration
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

    /**
     * Creates a color (not a ColorView) from a Uint8Array.
     * @param {Uint8Array} data - The array containing color data
     * @param {number} offset - The starting index in the array
     * @param {boolean} alpha - Whether to include alpha channel
     * @returns {Color} The created color
     * 
     * @note This cleates a standalone color instance with the color data copied in. If you want a view into the array, use the constructor directly: new Color(data, offset), or fromBuffer.
     */
    static fromUint8(data, offset = 0, alpha = true) {
        return new Color(data[offset], data[offset + 1], data[offset + 2], alpha ? data[offset + 3] / 255 : 1);
    }

    /**
     * Creates a color from an object with r, g, b, and a properties.
     * @param {Object} obj - The object containing color properties
     * @returns {Color} The created color
     */
    static fromObject(obj) {
        return new Color(obj.r, obj.g, obj.b, obj.a);
    }

    /**
     * Creates a color from an array of color values.
     * @param {Array} arr - The array containing color values in the format [r, g, b, a]
     * @returns {Color} The created color
     */
    static fromArray(arr) {
        return new Color(arr[0], arr[1], arr[2], arr[3]);
    }

    /**
     * Creates a color from a named CSS color.
     * @param {string} name - The name of the CSS color (case-insensitive)
     * @returns {Color} The created color
     */
    static fromNamed(name) {
        name = name.toLowerCase();
        if(Color.namedColors.has(name)) {
            return Color.fromArray(Color.namedColors.get(name));
        }
        throw new Error("Unknown color name: " + name);
    }

    /**
     * Creates a color from a CSS color string.
     * @param {string} colorString - The CSS color string
     * @returns {Color} The created color
     * @experimental
     */
    static fromCSS(colorString) {
        if(!Color.context) {
            Color.#createProcessingCanvas();
        }

        Color.context.fillStyle = "#000000";
        Color.context.fillStyle = colorString;

        // fillStyle result is weirdly inconsistent; color names become hex, rgb/rgba stay as is, so we still parse it
        return new Color(Color.context.fillStyle);
    }

    /**
     * Creates a random color using a pseudorandom number generator.
     * @returns {Color} The created random color
     */
    static random() {
        return new Color(Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256));
    }

    /**
     * Creates a random color using a cryptographically secure random number generator. Requires crypto.
     * @returns {Color} The created random color
     */
    static trueRandom() {
        return new Color([...crypto.getRandomValues(new Uint8Array(3))]);
    }

    /**
     * Checks if the user has a light color scheme preference.
     * @return {boolean} True if the user prefers a light color scheme, false otherwise
     */
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

    static generate(r, g, b, options = {}) {
        const color = (r instanceof Color)? r.clone(): new Color(r, g, b);
        let style = '';

        // Cache HSL once
        let hsl = color.getHSL();
        let h = hsl[0];
        const s = hsl[1];
        const sat = (s * 0.12) * (options.saturationBoost ?? 1);

        // Accents: 10..90 and 35, 45, 55, 95
        for(let i = 1; i <= 9; i++){
            if(options.hueShift) {
                h += (100 / 9) * options.hueShift;
                if(h > 360) h -= 360;
            }

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
            if(options.hueShift) {
                h += (100 / 9) * options.hueShift;
                if(h > 360) h -= 360;
            }

            const v = i * 10;
            const tone = color.setHSL(h, sat, v).hex;
            const midTone = color.setHSL(h, sat, v + 5).hex;

            style += `--base-${v}:${tone};--base-${v + 5}:${midTone};`;
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

        if (!accent.selector) {
            const safeName = typeof CSS !== "undefined" && typeof CSS.escape === "function"
                ? CSS.escape(String(name))
                : String(name).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
            accent.selector = `[ls-accent="${safeName}"]`;
            const ruleIndex = this.sheet.insertRule(`${accent.selector} {}`, this.sheet.cssRules.length);
            accent.ruleIndex = ruleIndex;
        }

        return accent;
    }

    static update(name, r, g, b, options = {}) {
        const accent = this.ensureRule(name);

        const color = (r instanceof Color) ? r : new Color(r, g, b);
        accent.color = color;

        const rule = this.sheet.cssRules[accent.ruleIndex];
        if (!(rule instanceof CSSStyleRule)) {
            throw new Error(`Rule at index ${accent.ruleIndex} is not a CSSStyleRule.`);
        }

        rule.style.cssText = this.generate(color, null, null, options);

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

        this.colors.delete(name);

        let cssText = "";
        for (const entry of this.colors.values()) {
            if (entry.selector && entry.cssText) {
                cssText += `${entry.selector}{${entry.cssText}}`;
            }
        }
        this.style.textContent = cssText;
        return true;
    }

    /**
     * Sets the sitewide accent color.
     * @param {*} accent Accent color
     * @param {*} store Whether to store the accent in localStorage (default: true)
     * @param {*} doBatch Whether to batch the change to the next animation frame (default: true)
     * @returns {Color} Self
     */
    static setAccent(accent, store = true, doBatch = true){
        if(this.#settingAccent) {
            this.#settingAccent = accent;
            return this;
        }

        this.#settingAccent = accent;

        // Changes are defered until the body is available and batched to the next animation frame
        if(!LS.ready) {
            LS.once("ready", () => this.#applyPendingAccent(store));
            return this;
        }

        if(!doBatch) {
            this.#applyPendingAccent(store);
            return this;
        }

        // Queue for next animation frame
        LS.Context.requestAnimationFrame(() => this.#applyPendingAccent(store));
        return this;
    }

    static #applyPendingAccent(store) {
        if(!this.#settingAccent) return;

        let accent = this.#settingAccent;

        document.body.classList.add("no-transitions");

        if(typeof accent !== "string" || (accent[0] === "#" || accent.startsWith("rgb") || accent.startsWith("hsl"))) {
            const color = accent instanceof Color ? accent : new Color(accent);

            accent = color.hex;

            Color.update('custom', color);
            document.body.setAttribute("ls-accent", "custom");
        } else {
            document.body.setAttribute("ls-accent", accent);
        }

        this.events.emit("accent-changed", [accent]);
        LS.Color.getAccentColorValueOf(document.body, LS.Color.currentAccent);

        if(store) {
            if(accent === "white") {
                localStorage.removeItem("ls-accent");
            } else {
                localStorage.setItem("ls-accent", accent);
            }
        }

        this.#settingAccent = null;

        LS.Context.setTimeout(() => {
            if(this.#settingAccent) return;
            document.body.classList.remove("no-transitions");
        }, 0);
    }

    static getAccentColorValueOf(element, target) {
        const name = element.getAttribute("ls-accent");
        // const level = (name === "yellow" || name === "orange") ? "10" : "40";
        return LS.Color.parse(getComputedStyle(element).getPropertyValue("--accent-40"), null, null, null, target);
    }

    /**
     * Sets the sitewide theme.
     * @param {string} theme Name of the theme to set
     * @param {boolean} store Whether to store the theme in localStorage (default: true)
     * @param {boolean} doBatch Whether to batch the change to the next animation frame (default: true)
     * @returns {Color} Self
     */
    static setTheme(theme, store = true, doBatch = true){
        if(this.#settingTheme) {
            this.#settingTheme = theme;
            return this;
        }

        this.#settingTheme = theme;

        // Changes are defered until the body is available and batched to the next animation frame
        if(!LS.ready) {
            LS.once("ready", () => this.#applyPendingTheme(store));
            return this;
        }

        if(!doBatch) {
            this.#applyPendingTheme(store);
            return this;
        }

        LS.Context.requestAnimationFrame(() => this.#applyPendingTheme(store));
        return this;
    }

    static #applyPendingTheme(store) {
        if(!this.#settingTheme) return;
        const theme = this.#settingTheme;

        document.body.setAttribute("ls-theme", theme);
        document.body.classList.add("no-transitions");
        this.events.emit("theme-changed", [theme]);

        if(store) localStorage.setItem("ls-theme", theme);

        this.#settingTheme = null;

        LS.Context.setTimeout(() => {
            if(this.#settingTheme) return;
            document.body.classList.remove("no-transitions");
        }, 0);
    }

    static setAdaptiveTheme(){
        Color.setTheme(localStorage.getItem("ls-theme") || (this.lightModePreffered? "light": "dark"), false);
        return this;
    }

    /**
     * @deprecated
     */
    static autoScheme(){
        this.setAdaptiveTheme();
        this.autoSchemeEnabled = true;
        return this;
    }

    static autoAccent(){
        if(localStorage.hasOwnProperty("ls-accent")){
            const accent = localStorage.getItem("ls-accent");
            Color.setAccent(accent, false);
        }

        return this;
    }

    static #createProcessingCanvas() {
        if(!Color.canvas) {
            const canvas = document.createElement('canvas');
            Color.canvas = canvas;
            Color.context = canvas.getContext('2d');
        }
    }

    /**
     * A map of named CSS colors to their RGB values.
     */
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
};

// const colorConversion = new LS.Color();
// function colorToAccent(color, tone = 40) {
//     colorConversion.set(color);
//     const hsl = colorConversion.getHSL();
//     const h = hsl[0];
//     const s = hsl[1];
//     colorConversion.setHSL(h, s, tone);
//     return colorConversion.color; // Copy
//     return Number.isFinite(value)? value: fallback;
// }
// const accents = [
//     ["navy",          [40, 28, 108]],
//     ["blue",          [0, 133, 255]],
//     ["pastel-indigo", [70, 118, 181]],
//     ["lapis",         [34, 114, 154]],
//     ["teal",          [0, 128, 128]],
//     ["pastel-teal",   [69, 195, 205]],
//     ["aquamarine",    [58, 160, 125]],
//     ["green",         [25, 135, 84]],
//     ["lime",          [133, 210, 50]],
//     ["neon",          [173, 255, 110]],
//     ["yellow",        [255, 236, 32]],
//     ["orange",        [255, 140, 32]],
//     ["deep-orange",   [255, 112, 52]],
//     ["red",           [245, 47, 47]],
//     ["rusty-red",     [220, 53, 69]],
//     ["pink",          [230, 52, 164]],
//     ["hotpink",       [245, 100, 169]],
//     ["purple",        [155, 77, 175]],
//     ["soap",          [210, 190, 235]],
//     ["burple",        [81, 101, 246]],
//     ["white",         [255, 255, 255]],
// ];
// const c = [];
// for(const [name, color] of accents) {
//     const a = colorToAccent(color);
//     c.push([name, a]);
// }
// JSON.stringify(c);

const LS_ACCENTS_MAP = new Map([["navy",[60,42,162,1]],["blue",[0,105,204,1]],["pastel-indigo",[57,96,147,1]],["lapis",[37,124,167,1]],["teal",[0,204,204,1]],["pastel-teal",[43,153,161,1]],["aquamarine",[54,150,116,1]],["green",[32,172,107,1]],["lime",[104,167,37,1]],["neon",[88,204,0,1]],["yellow",[204,187,0,1]],["orange",[204,99,0,1]],["deep-orange",[204,61,0,1]],["red",[195,9,9,1]],["rusty-red",[173,31,45,1]],["pink",[182,22,123,1]],["hotpink",[192,12,99,1]],["purple",[126,62,142,1]],["soap",[97,48,156,1]],["burple",[10,32,194,1]],["white",[102,102,102,1]]]);
LS.Color.accentColors = LS_ACCENTS_MAP;

/*@ls-export*/ if (typeof module !== "undefined" && module.exports) {
    module.exports = LS.Color;
}
})();