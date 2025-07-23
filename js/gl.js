/**
 * GL Utilities for LS
 * @version 1.0.0
 */

if(!globalThis.PIXI) {
    console.error("LS.GL requires PIXI.js to work")
}

(() => {
    class GLElement extends PIXI.Container {
        constructor(options = {}) {
            super();

            this.graphics = null;
            this.label = null;

            this.styleContext = (options.style instanceof StyleContext)? options.style: new StyleContext(options.style || {});
            this.computedStyle = this.styleContext.computedStyle;

            if(options.tooltip){
                tooltips.set(this, options.tooltip)
            }

            if(options.inner) {
                this.add(options.inner);
            }

            // if (options.onClick) {
            //     this.on("click", options.onClick);
            // }

            // if (options.onPointerDown) {
            //     this.on("pointerdown", options.onPointerDown);
            // }

            // if (options.onPointerUp) {
            //     this.on("pointerup", options.onPointerUp);
            // }

            // if (options.onPointerEnter) {
            //     this.on("pointerenter", options.onPointerEnter);
            // }

            // if (options.onPointerLeave) {
            //     this.on("pointerleave", options.onPointerLeave);
            // }

            // if (options.onPointerMove) {
            //     this.on("pointermove", options.onPointerMove);
            // }

            this.x = options.x || 0;
            this.y = options.y || 0;


            if(options.text) this.setText(options.text); else this.draw();
        }

        draw() {
            if(this.computedStyle.display === "block"){
                if(!this.graphics){
                    this.graphics = new PIXI.Graphics;
                    this.addChild(this.graphics);
                    this.graphics.zIndex = -1;
                }

                this.graphics.clear();

                const actualX = this.computedStyle.margin[3];
                const actualY = this.computedStyle.margin[0];
                const actualWidth = this.width + this.computedStyle.padding[3] + this.computedStyle.padding[1];
                const actualHeight = this.height + this.computedStyle.padding[0] + this.computedStyle.padding[2];

                const shape = this.computedStyle.borderRadius? this.graphics.roundRect: this.graphics.rect;
                shape.call(this.graphics, actualX, actualY, actualWidth, actualHeight, this.computedStyle.borderRadius || undefined);

                if(this.computedStyle.background) {
                    this.graphics.fill(this.computedStyle.background);
                }
                
                if(this.computedStyle.border) {
                    this.graphics.stroke(this.computedStyle.border);
                }
            }

            if(this.computedStyle.overflowHidden && this.parent) {
                if(!this.overflow_mask){
                    this.overflow_mask = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.addChild(this.overflow_mask);
                }
        
                this.overflow_mask.width = this.computedStyle.clipWidth || actualWidth;
                this.overflow_mask.height = this.computedStyle.clipHeight || actualHeight;

                this.mask = this.overflow_mask;
            } else {
                this.mask = null;
            }

            this.layout();
        }

        layout() {
            let y = 0;
            for(const child of this.children){
                if(child !== this.graphics && child !== this.overflow_mask && !(child.style && child.style.position === "absolute")){
                    const childMargin = child.style && child.style.margin? child.style.margin: [0, 0, 0, 0];

                    y += childMargin[0] || 0;
                    child.position.set(childMargin[3] + this.computedStyle.padding[3], y + this.computedStyle.padding[0]);

                    y += child.height + (childMargin[2] || 0) + (this.computedStyle.gap || 0);
                }
            }

            this.__layoutHeight = y + this.computedStyle.padding[0] + this.computedStyle.padding[2];
        }

        setText(text) {
            if(!this.label) {
                this.label = new PIXI.Text({ text, style: this.styleContext.get("text") });
                this.addChild(this.label)
            } else this.label.text = text;

            this.draw();
        }

        set innerText(text) {
            this.setText(text)
        }

        get innerText() {
            return this.label? this.label.text: ""
        }

        setTooltip(label) {
            tooltips.set(this, label)
            return this
        }

        removeTooltip() {
            
        }
    
        add(nodes) {
            for(let node of Array.isArray(nodes)? nodes: [nodes]){
                this.addChild(node)
            }
            return this
        }
    }

    const PADDING_PROPERTIES = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"];
    const MARGIN_PROPERTIES = ["marginTop", "marginRight", "marginBottom", "marginLeft"];

    class StyleContext {
        constructor(style = {}, options = {}) {
            this.computedStyle = {
                display: "block",
                position: "static",
                padding: [0, 0, 0, 0],
                margin: [0, 0, 0, 0],
            }

            this.parent = options.parent || null;

            this.mask = style || {};
            this.compile();
        }

        compile(patch) {
            if(!patch) patch = this.mask; else if (!patch._normalized) {
                const normalizedPatch = { _normalized: true };

                for (let prop in patch) {
                    if (!patch.hasOwnProperty(prop)) continue;
                    normalizedPatch[prop.trim().replace(/-([a-z])/g, (match, letter) => letter.toUpperCase())] = patch[prop];
                }

                return this.compile(normalizedPatch);
            } else if (patch._normalized) {
                delete patch._normalized;
                this.mask = Object.assign(this.mask, patch);
            }

            for (let prop in patch) {
                if (!patch.hasOwnProperty(prop)) continue;

                const value = patch[prop];

                const index_padding = PADDING_PROPERTIES.indexOf(prop);
                if(index_padding !== -1) {
                    if(!this.computedStyle.padding) this.computedStyle.padding = [0, 0, 0, 0];
                    this.computedStyle.padding[index_padding] = parseInt(value) || 0;
                    continue;
                }

                const index_margin = MARGIN_PROPERTIES.indexOf(prop);
                if(index_margin !== -1) {
                    if(!this.computedStyle.margin) this.computedStyle.margin = [0, 0, 0, 0];
                    this.computedStyle.margin[index_margin] = parseInt(value) || 0;
                    continue;
                }

                this.computedStyle[prop] = value === "inherit" ? this.#normalizeValue(prop) : this.#normalizeValue(prop, value);
            }

            if (this.parent && this.parent.style) {
                for (let prop in this.parent.style) {
                    if (this.parent.style.hasOwnProperty(prop) && !patch.hasOwnProperty(prop)) {
                        this.computedStyle[prop] = this.#normalizeValue(prop, this.parent.get(prop));
                    }
                }
            }
        }

        #normalizeValue(prop, value = null) {
            if(!value) value = (this.parent && this.parent.style)? (this.parent.get(prop)): (LS.GL.rootStyle? LS.GL.rootStyle.style[prop]: undefined);

            if((prop === "padding" || prop === "margin" || prop === "borderRadius") && (!Array.isArray(value) || value.length < 4)) {
                if (typeof value === "string") {
                    value = value.split(" ").map(v => parseInt(v) || 0);
                }

                if (!Array.isArray(value)) {
                    value = [value, value, value, value];
                } else if (value.length === 2) {
                    value = [value[0], value[1], value[0], value[1]];
                } else if (value.length === 3) {
                    value = [value[0], value[1], value[2], value[1]];
                } else {
                    while (value.length < 4) {
                        value.push(value[value.length - 1]);
                    }
                }
            }

            return value;
        }

        fork(style) {
            const newStyle = new StyleContext(style, { parent: this });
            return newStyle;
        }

        set(prop, value) {
            if (typeof prop === "object") {
                this.compile(prop);
                return this;
            }

            this.compile({ [prop]: value });
            return this;
        }

        /**
         * @warning Values set with this method may be overridden by the parent context and aren't normalized.
         */
        setRaw(prop, value) {
            if (typeof prop === "object") {
                for (let key in prop) {
                    if (prop.hasOwnProperty(key)) {
                        this.computedStyle[key] = prop[key];
                    }
                }
                return this;
            }

            this.computedStyle[prop] = value;
            return this;
        }

        get(prop) {
            return this.computedStyle[prop];
        }

        static textStyleFromCSS(style) {
            if(!style) return undefined;

            if(style instanceof PIXI.TextStyle) {
                return style;
            }

            if(style instanceof Element) {
                style = window.getComputedStyle(style);
            }

            const textStyle = {};

            textStyle.align = style.textAlign || "left";
            textStyle.breakWords = style.overflowWrap === "break-word";
            if (style.textShadow) textStyle.dropShadow = style.textShadow;
            if (style.color) textStyle.fill = style.color;
            textStyle.fontFamily = style.fontFamily || "monospace";
            textStyle.fontSize = parseInt(style.fontSize) || 16;
            if (style.fontStyle) textStyle.fontStyle = style.fontStyle;
            if (style.fontVariant) textStyle.fontVariant = style.fontVariant;
            if (style.fontWeight) textStyle.fontWeight = style.fontWeight;
            if (style.letterSpacing) textStyle.letterSpacing = parseInt(style.letterSpacing);
            if (style.lineHeight) textStyle.lineHeight = parseInt(style.lineHeight);
            if (style.textStroke) textStyle.stroke = style.textStroke;
            if (style.verticalAlign) textStyle.textBaseline = style.verticalAlign;
            if (style.whiteSpace) textStyle.whiteSpace = style.whiteSpace;
            textStyle.wordWrap = style.wordWrap || (style.whiteSpace === "normal");
            if (style.wordWrapWidth) textStyle.wordWrapWidth = parseInt(style.wordWrapWidth);

            return new PIXI.TextStyle(textStyle)
        }
    }

    const context_style = new StyleContext({
        display: "block",
        overflow: "hidden"
    });

    class Context extends GLElement {
        constructor(options = {}) {
            if(!options.style) options.style = context_style;
            super(options);
        }

        render() {
            this.draw();
            return this;
        }
    }

    class Renderer {
        constructor(options = {}) {
            this.options = options;
        }

        async init() {
            this.renderer = await PIXI.autoDetectRenderer(this.options);
        }
    }

    LS.LoadComponent({ GLElement: Element, StyleContext, Context, Renderer }, { name: "GL", global: true });
})();
