/**
 * GL Utilities for LS
 * @version 1.0.0
 */

if(!globalThis.PIXI) {
    console.error("LS.GL requires PIXI.js to work")
}

try {
    const animation = {
        // constructor(root) {
        //     if(!(root instanceof Renderer)) {
        //         throw new Error("Root must be a LS.GL.Renderer");
        //     }

        //     this.root = root;
        // }

        fadeIn(container, duration = 500, delay = 0) {
            const scene = getRootElementOf(container);

            container.alpha = 0;
            container.visible = true;

            return scene.simpleAnimation(time => {
                const progress = Math.min((time - delay) / duration, 1);
                container.alpha = progress;

                if (progress < 1) {
                    return true;
                }
            }, true);
        },

        fadeOut(container, duration = 500, delay = 0) {
            const scene = getRootElementOf(container);

            container.alpha = 1;
            container.visible = true;

            return scene.simpleAnimation(time => {
                const progress = Math.min((time - delay) / duration, 1);

                container.alpha = 1 - progress;

                if (progress < 1) {
                    return true;
                } else {
                    container.visible = false;
                }
            }, true);
        },

        create(fn) {
            return (container, options) => {
                const scene = getRootElementOf(container);
                return fn(scene, container, options);
            };
        }
    };

    class Scene extends PIXI.Container {
        constructor (root, options){
            super();

            this.__renderer = root;
            this.eventMode = 'static';

            this.active = false;

            if(typeof options === "function"){
                this.options = {
                    onCreated: options
                }
            } else this.options = options || {};

            this.add = this.addChild;

            if(this.options.onCreated) this.options.onCreated(this);
            this.emit('created');
        }

        simpleAnimation(fn, resetTimer = false){
            return new Promise(resolve => {
                let startTime = null;

                const frame = (time) => {
                    if(!startTime) startTime = time;
                    if(this.active && fn(resetTimer? time - startTime: time)) LS.Context.requestAnimationFrame(frame); else resolve();
                }

                LS.Context.requestAnimationFrame(frame)
            });
        }
    }

    const PADDING_PROPERTIES = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"];
    const MARGIN_PROPERTIES = ["marginTop", "marginRight", "marginBottom", "marginLeft"];

    const defaultStyle = {
        display: "block",
        position: "static",
        padding: [0, 0, 0, 0],
        margin: [0, 0, 0, 0],
    };

    class StyleContext {
        constructor(style = {}, options = {}) {
            this.computedStyle = {};
            this.parent = options.parent || null;
            this.mask = style || {};

            this.style = new Proxy(this.computedStyle, {
                set: (_, prop, value) => {
                    return this.set(prop, value);
                },

                get: (target, prop) => {
                    return target[prop] || this.get(prop);
                }
            });

            this.compile();
        }

        normalizeProp(prop) {
            return prop.trim().replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
        }

        compile(patch) {
            // 1. Apply/normalize mask patch
            if(patch) {
                if (!patch._normalized) {
                    const normalizedPatch = { _normalized: true };

                    for (let prop in patch) {
                        if (!patch.hasOwnProperty(prop)) continue;
                        normalizedPatch[this.normalizeProp(prop)] = patch[prop];
                    }
    
                    return this.compile(normalizedPatch);
                } else if (patch._normalized) {
                    delete patch._normalized;
                    this.mask = Object.assign(this.mask, patch);
                }
            } else {
                // (or refresh current mask)
                patch = this.mask;
            }

            // 2. Compute final styles from patch
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

                this.computedStyle[prop] = this.#normalizeValue(prop, value);
            }
        }

        #normalizeValue(prop, value = null) {
            if(value === "inherit") value = (this.parent && this.parent.style)? (this.parent.get(prop)): (LS.GL.rootStyle? LS.GL.rootStyle.get(prop): undefined);

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

            if(prop === "pointerEvents") {
                value = !value? "none": value === "auto" || value === "all" || value === true? "static": value;
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
            return this.computedStyle[prop] || this?.parent?.get(prop) || (LS?.GL?.rootStyle && this !== LS.GL.rootStyle? LS.GL.rootStyle.get(prop): undefined) || defaultStyle[prop];
        }

        getLocal(prop) {
            return this.computedStyle[prop] || defaultStyle[prop];
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

    function InitElement(node, options) {
        if(!(node instanceof TextNode)) {
            node.styleContext = (options.style instanceof StyleContext)? options.style: new StyleContext(options.style || {});
            node.style = node.styleContext.style;
        }

        node.tagName = node.type? node.type.toUpperCase(): "ELEMENT";

        if(options.tooltip){
            tooltips.set(node, options.tooltip);
        }
    }

    class BlockElement extends PIXI.Container {
        constructor(type, options = {}) {
            super(options);

            if(typeof type === "object") {
                options = type;
                type = "container";
            }

            this.type = type;
            this.graphics = null;
            this.label = null;

            if(options.inner) {
                this.add(options.inner);
            }

            InitElement(this, options);
            if(options.text) this.setText(options.text); else this.draw();
        }

        draw() {
            if(this.style.display === "block" || this.style.display === "inline-block") {
                if(!this.graphics){
                    this.graphics = new PIXI.Graphics;
                    this.addChild(this.graphics);
                    this.graphics.zIndex = -1;
                }

                this.graphics.clear();

                // const actualX = this.style.margin[3];
                // const actualY = this.style.margin[0];

                const setWidth = this.style.width;
                const setHeight = this.style.height;
                const actualWidth = setWidth? setWidth: this.width + this.style.padding[3] + this.style.padding[1];
                const actualHeight = setHeight? setHeight: this.height + this.style.padding[0] + this.style.padding[2];

                const shape = this.style.borderRadius? this.graphics.roundRect: this.graphics.rect;
                shape.call(this.graphics, 0, 0, actualWidth, actualHeight, this.style.borderRadius || undefined);

                if(this.style.background) {
                    this.graphics.fill(this.style.background);
                }

                if(this.style.border) {
                    this.graphics.stroke(this.style.border);
                }
            }

            if(this.style.pointerEvents) {
                this.eventMode = this.style.pointerEvents;
            }

            if(this.style.overflowHidden && this.parent) {
                if(!this.overflow_mask){
                    this.overflow_mask = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.addChild(this.overflow_mask);
                }
        
                this.overflow_mask.width = this.style.clipWidth || actualWidth;
                this.overflow_mask.height = this.style.clipHeight || actualHeight;

                this.mask = this.overflow_mask;
            } else {
                this.mask = null;
            }

            this.layout();
        }

        layout() {
            let y = 0;

            for(const child of this.children){
                if(child === this.graphics || child === this.overflow_mask) {
                    continue;
                }

                const childStyle = child.style;
                if(!(childStyle && childStyle.position === "absolute")){
                    const childMargin = childStyle && childStyle.margin? childStyle.margin: [0, 0, 0, 0];

                    y += childMargin[0] || 0;

                    child.position.set(this.style.margin[3] + childMargin[3] + this.style.padding[3], y + this.style.padding[0]);

                    y += child.height + (childMargin[2] || 0) + (this.style.gap || 0);
                }
            }

            this.__layoutHeight = y + this.style.padding[0] + this.style.padding[2];
        }

        setText(text) {
            if(!this.label) {
                this.label = new TextNode({ text, style: this.styleContext.get("text") });
                this.addChild(this.label);
            } else this.label.text = text;

            // TODO: Avoid drawing when not needed
            this.draw();
        }

        set innerText(text) {
            this.setText(text);
        }

        get innerText() {
            return this.label? this.label.text: "";
        }

        setTooltip(label) {
            tooltips.set(this, label);
            return this
        }

        removeTooltip() {
            tooltips.remove(this);
        }

        get rootElement() {
            return getRootElementOf(this);
        }

        add(nodes) {
            for(let node of Array.isArray(nodes)? nodes: [nodes]){
                if(typeof node === "string") {
                    node = new TextNode({ text: node });
                }

                this.addChild(node);
            }
            return this;
        }
    }

    class ImageElement extends PIXI.Sprite {
        constructor(options = {}) {
            super(options);
            this.type = "image";
            InitElement(this, options);
        }
    }

    class TextNode extends PIXI.Text {
        constructor(options = {}) {
            if(!options.style && LS?.GL?.rootStyle) {
                options.style = LS.GL.rootStyle.get("text");
            }

            super(options);
            this.type = "text";
            InitElement(this, options);
        }
    }

    const context_style = new StyleContext({
        display: "block",
        overflow: "hidden"
    });

    class Context extends BlockElement {
        constructor(options = {}) {
            if(!options.style) options.style = context_style;
            super(options);
        }

        render() {
            this.draw();
            return this;
        }
    }

    class Tooltips extends BlockElement {
        constructor(){
            super("tooltip");
        }

        set(container, label) {
            container.eventMode = 'static';

            if(container.__tooltip) return container.__tooltip = label;
            container.__tooltip = label;

            container.on('pointerenter', () => {
                const root = getRootElementOf(container);

                const renderer = root.__renderer;
                if(!root || !renderer) return console.error("Could not get renderer of container for tooltips");

                root.addChild(this);

                this.setText(container.__tooltip);

                let first = true;
                renderer.currentScene.simpleAnimation(time => {
                    this.x = Math.min(renderer.screen.width - this.width - 10, renderer.input.mouse.x + 10);
                    this.y = renderer.input.mouse.y + 10;

                    if(this.y + this.height > renderer.screen.height){
                        this.y -= this.height + 10
                    }

                    if(first) this.visible = true, first = false;
                    return this.visible
                });
            });
 
            container.on('pointerleave', () => {
                this.visible = false;
            });
        }
    }

    const tooltips = new Tooltips();

    function createElement(type, options = {}) {
        if(typeof type === "object") {
            options = type;
            type = "container";
        }

        switch ((options && options.style && options.style.display) === "block"? "block": type) {
            case "image": case "img":
                return new ImageElement(options);
                
            case "text":
                return new TextNode(options);

            default:
                return new BlockElement(type, options);
        }
    }

    function createSprite(options = {}) {
        return new PIXI.Sprite(options);
    }

    function createContainer(options = {}) {
        return createElement("container", options);
    }

    function getRootElementOf(container) {
        if(container.parentRenderGroup?.root) {
            return container.parentRenderGroup.root;
        }

        while(container.parent) {
            container = container.parent;
        }
        return container;
    }

    class Helpers {
        constructor(renderer) {
            this.renderer = renderer;
        }

        position(base, offsetX = 0, offsetY = 0) {
            return {
                x: base.x + (offsetX || 0),
                y: base.y + (offsetY || 0)
            }
        }

        toPosition(container, base, offsetX = 0, offsetY = 0) {
            const pos = this.position(base, offsetX, offsetY);
            container.x = pos.x;
            container.y = pos.y;
        }

        get CENTER() {
            return {
                x: this.renderer.screen.width / 2,
                y: this.renderer.screen.height / 2
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
                x: this.renderer.screen.width,
                y: 0
            };
        }

        get BOTTOM_LEFT() {
            return {
                x: 0,
                y: this.renderer.screen.height
            };
        }

        get BOTTOM_RIGHT() {
            return {
                x: this.renderer.screen.width,
                y: this.renderer.screen.height
            };
        }
    }

    /**
     * A fast and simple parser to parse HTML-like strings into LS.GL elements.
     * @param {*} code The code string
     * @param {*} root Optional - The root element
     * @param {Function} factory Optional - The element factory function
     * @returns Parsed elements or root element
     */
    function htmlParser(code, root = null, factory = LS.GL.createElement) {
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
     * @experimental
     */
    class Renderer extends LS.EventEmitter {
        constructor(options = {}) {
            super();

            options = LS.Util.defaults({
                tooltips: true,
                ticker: true,
                handleInputEvents: true
            }, options);

            this.options = options;

            this.scenes = new Map();
            this.currentScene = null;

            if(options.ticker) this.ticker = new PIXI.Ticker();

            this.input = {
                keystates: {},
                mouse: {
                    x: 0,
                    y: 0,
                    down: null
                }
            };

            this.animation = animation;
            this.helpers = new Helpers(this);
            this.assets = new Map();
        }

        /**
         * Initializes the renderer.
         */
        async init() {
            this.renderer = await PIXI.autoDetectRenderer(this.options);
            this.emit("ready");

            if(this.options.handleInputEvents) {
                this.setupInputEvents();
            }

            return this.renderer.canvas;
        }

        setRenderingOptions(renderOptions){
            if(renderOptions.pixelated){
                // PIXI.AbstractRenderer.defaultOptions.roundPixels = true;
                PIXI.TextureStyle.defaultOptions.scaleMode = "nearest"
                // PIXI.TextureSource.defaultOptions.mipLevelCount = 0
                PIXI.TextureSource.defaultOptions.antialias = false
            }

            return this;
        }

        render() {
            if(this.currentScene) this.renderer.render(this.currentScene);
        }

        addBundle(name, assets) {
            PIXI.Assets.addBundle(name, assets);
        }

        async getBundle(name) {
            if(this.assets.has(name)) {
                return this.assets.get(name);
            }

            const bundle = await PIXI.Assets.loadBundle(name);
            if(!bundle) return null;

            this.assets.set(name, bundle);
            return bundle;
        }

        /**
         * Sets the current scene.
         * @param {string} id - The ID of the scene to set as current.
         */
        setScene(id){
            if(this.currentScene){
                this.currentScene.active = false;
                if(this.currentScene.options.onDeactivated) this.currentScene.options.onDeactivated();
                this.currentScene.emit("deactivated");
            }

            const scene = this.scenes.get(id);

            if(!scene) return false;

            scene.active = true;
            this.currentScene = scene;

            scene.emit("activated");
            return true;
        }

        /**
         * Creates a new scene.
         * @param {string} id - The ID of the scene to create.
         * @param {object} options - The options for the scene.
         * @returns {Scene} The created scene.
         */
        createScene(id, options){
            const scene = new Scene(this, options);
            this.scenes.set(id, scene);
            return scene;
        }

        getScene(id){
            return this.scenes.get(id);
        }

        get scene(){
            return this.currentScene;
        }

        get screen(){
            return this.renderer.screen;
        }

        get canvas(){
            return this.renderer.canvas;
        }

        /**
         * Sleeps for a given amount of time.
         * @param {number} ms - The number of milliseconds to sleep.
         * @returns {Promise} A promise that resolves after the specified time.
         */
        sleep(ms) {
            return new Promise(resolve => this.ctx.setTimeout(resolve, ms));
        }

        createElement(type, options = {}) {
            return createElement(type, options);
        }

        createContainer(options = {}) {
            return createContainer(options);
        }

        createSprite(options = {}) {
            return createSprite(options);
        }

        parse(code, type = "html-like") {
            switch(type) {
                case "html-like": case "html": case "xml":
                    return htmlParser(code);
                default:
                    throw new Error(`Unknown type: ${type}`);
            }
        }

        mapMouse(x, y){
            const rect = this.renderer.canvas.getBoundingClientRect();
            return [x - rect.x, y - rect.y]
        }

        mouseRelativeTo(relativeContainer){
            const offset = relativeContainer.getGlobalPosition();
            return [this.input.mouse.x - offset.x, this.input.mouse.y - offset.y]
        }

        setupInputEvents() {
            this.input.keystates = {};

            const container = this.options.inputContainer || document;

            container.addEventListener("keydown", this._keydownHandler = event => {
                this.input.keystates[event.code] = true
            })

            container.addEventListener("keyup", this._keyupHandler = event => {
                this.input.keystates[event.code] = false
            })

            this.input.mouse = {
                x: 0,
                y: 0,
                down: null
            }

            container.addEventListener("mousemove", this._mousemoveHandler = event => {
                const [x, y] = this.mapMouse(event.clientX, event.clientY);
                this.input.mouse.x = x
                this.input.mouse.y = y
            })

            container.addEventListener("mousedown", this._mousedownHandler = event => {
                this.input.mouse.down = event.button
            })

            container.addEventListener("mouseup", this._mouseupHandler = event => {
                this.input.mouse.down = null
            })

            return this;
        }

        get centerPosition() {
            return {
                x: this.renderer.screen.width / 2,
                y: this.renderer.screen.height / 2
            };
        }

        destroy() {
            this.emit("destroyed");

            // Clear events
            this.events.clear();

            // Deactivate current scene
            if(this.currentScene) {
                this.currentScene.active = false;
                if(this.currentScene.options.onDeactivated) {
                    this.currentScene.options.onDeactivated();
                }
                this.currentScene.emit("deactivated");
            }

            // Destroy all scenes
            for(const [id, scene] of this.scenes) {
                scene.destroy({ children: true });
            }
            this.scenes.clear();
            this.currentScene = null;

            // Stop and destroy ticker
            if(this.ticker) {
                this.ticker.stop();
                this.ticker.destroy();
                this.ticker = null;
            }

            // Clear assets
            this.assets.clear();

            // Remove input event listeners
            if(this.options.handleInputEvents) {
                const container = this.options.inputContainer || document;
                container.removeEventListener("keydown", this._keydownHandler);
                container.removeEventListener("keyup", this._keyupHandler);
                container.removeEventListener("mousemove", this._mousemoveHandler);
                container.removeEventListener("mousedown", this._mousedownHandler);
                container.removeEventListener("mouseup", this._mouseupHandler);
            }

            // Destroy renderer
            if(this.renderer) {
                this.renderer.destroy();
                this.renderer = null;
            }

            // Clear input state
            this.input = {
                keystates: {},
                mouse: { x: 0, y: 0, down: null }
            };
        }
    }

    LS.LoadComponent({
        BlockElement,
        StyleContext,
        Scene,
        Context,
        Renderer,
        Helpers,
        Tooltips,
        TextNode,

        tooltips,
        animation,
        
        createElement,
        createContainer,
        createSprite,

        htmlParser,

        rootStyle: new StyleContext({}),

        compileShader(vertex, fragment, uniforms){
            return new PIXI.Filter({
                glProgram: new PIXI.GlProgram({ vertex, fragment }),
                resources: uniforms
            });
        }
    }, { name: "GL", global: true });
} catch(e) {
    console.error("Error loading GL component:", e);
}
