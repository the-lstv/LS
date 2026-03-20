/**
 * Range Component
 * 
 * @author lstv.space
 * @license GPL-3.0
 */

LS.LoadComponent(class Range extends LS.Component {
    constructor(target = null, options = {}) {
        super();

        this.options = Object.assign({
            slider: true,
            style: null,
            vertical: false,
            tooltip: false
        }, options);

        this.element = target || LS.Create("ls-range");
        this.dots = LS.Create({ class: "ls-range-dots" }).addTo(this.element);
        this.handle = this.options.slider === false? null : LS.Create({ class: "ls-range-handle" }).addTo(this.element);
        this.element.appendChild(LS.Create({ class: "ls-range-progress", inner: (this.bar = LS.Create({ class: "ls-range-bar" })) }));

        this.element.classList.add("ls-range");

        if(this.options.style) {
            this.element.classList.add(this.options.style);
        }

        if(this.options.vertical) {
            this.element.classList.add("ls-range-vertical");
        }

        if(this.options.slider === false) {
            this.element.classList.add("ls-range-no-slider");
        }

        this._dotDensity = 8;
        this._renderedDotCount = -1;

        this._value = 0;

        this.element.setAttribute("tabindex", "0");
        this.element.setAttribute("role", "slider");
        this.element.setAttribute("aria-orientation", this.options.vertical? "vertical" : "horizontal");

        const min = this.toNumber(this.element.getAttribute("min"), 0);
        const max = this.toNumber(this.element.getAttribute("max"), 100);
        this._min = Math.min(min, max);
        this._max = Math.max(min, max);
        this._step = this.normalizeStep(this.element.getAttribute("step"));

        this.element.setAttribute("aria-valuemin", this._min);
        this.element.setAttribute("aria-valuemax", this._max);

        let box;
        this.touchHandle = new LS.Util.TouchHandle(this.element, {
            onStart: (event) => {
                this.element.focus();
                box = this.element.getBoundingClientRect();
            },

            onMove: (event) => {
                const percentage = this.options.vertical
                    ? Math.min(1, Math.max(0, 1 - ((event.y - box.top) / box.height)))
                    : Math.min(1, Math.max(0, (event.x - box.left) / box.width));
                this.value = this.min + percentage * (this.max - this.min);

                if(this.options.tooltip) {
                    LS.Tooltips.position(this.handle).set(String(this.value)).show();
                }

                this.quickEmit("input", this.value);
            },

            onEnd: (event) => {
                if(this.options.tooltip) {
                    LS.Tooltips.hide();
                }
                this.quickEmit("change", this.value);
            }
        });

        this.onKeyDown = this.#handleKeyDown.bind(this);
        this.element.addEventListener("keydown", this.onKeyDown);

        if(typeof ResizeObserver !== "undefined") {
            this.resizeObserver = new ResizeObserver(() => this.renderDots());
            this.resizeObserver.observe(this.element);
        }

        this.value = this.element.getAttribute("value") || 0;
    }

    getStep() {
        const range = this.max - this.min;
        const fallback = range > 0? range / 100 : 1;
        const unit = this.step > 0? this.step : fallback;
        return unit;
    }

    #handleKeyDown(event) {
        const key = event.key;
        const step = this.getStep();
        let nextValue = this.value;
        let handled = true;

        switch(key) {
            case "ArrowRight":
                nextValue += this.options.vertical? 0 : step;
                break;

            case "ArrowLeft":
                nextValue -= this.options.vertical? 0 : step;
                break;

            case "ArrowUp":
                nextValue += step;
                break;

            case "ArrowDown":
                nextValue -= step;
                break;

            case "PageUp":
                nextValue += step * 10;
                break;

            case "PageDown":
                nextValue -= step * 10;
                break;

            case "Home":
                nextValue = this.min;
                break;

            case "End":
                nextValue = this.max;
                break;

            default:
                handled = false;
        }

        if(!handled) {
            return;
        }

        event.preventDefault();
        const previousValue = this.value;
        this.value = nextValue;

        if(this.value !== previousValue) {
            // if(this.options.tooltip) {
            //     LS.Tooltips.position(this.handle).set(this.value).show();
            // }

            this.quickEmit("input", this.value);
            this.quickEmit("change", this.value);
        }
    }

    set value(val) {
        this._value = this.snapToStep(val);
        this.element.setAttribute("aria-valuenow", this._value);
        this.render();
    }

    get value() {
        return this._value;
    }

    set min(val) {
        this._min = this.toNumber(val, 0);

        if(this._max < this._min) {
            this._max = this._min;
        }

        this.element.setAttribute("aria-valuemin", this._min);
        this.value = this._value;
    }

    get min() {
        return this._min;
    }

    set max(val) {
        this._max = this.toNumber(val, 100);

        if(this._min > this._max) {
            this._min = this._max;
        }

        this.element.setAttribute("aria-valuemax", this._max);
        this.value = this._value;
    }

    get max() {
        return this._max;
    }

    set step(val) {
        this._step = this.normalizeStep(val);
        this.value = this._value;
    }

    get step() {
        return this._step;
    }

    toNumber(val, fallback = 0) {
        const number = Number(val);
        return Number.isFinite(number)? number : fallback;
    }

    normalizeStep(val) {
        const step = this.toNumber(val, 0);
        return step > 0? step : 0;
    }

    getStepPrecision() {
        if(!this.step) return 0;

        const stepString = String(this.step);

        if(stepString.includes("e-")) {
            return Number(stepString.split("e-")[1]) || 0;
        }

        const decimals = stepString.split(".")[1];
        return decimals? decimals.length : 0;
    }

    snapToStep(val) {
        let result = this.toNumber(val, this.min);
        result = Math.min(this.max, Math.max(this.min, result));

        if(this.step > 0) {
            const steps = Math.round((result - this.min) / this.step);
            const snapped = this.min + (steps * this.step);
            result = Number(snapped.toFixed(this.getStepPrecision()));
            result = Math.min(this.max, Math.max(this.min, result));
        }

        return result;
    }

    /**
     * Needs work.
     */
    renderDots() {
        if(!this.step || this.max <= this.min) {
            if(this._renderedDotCount !== 0) {
                this.dots.innerHTML = "";
                this._renderedDotCount = 0;
            }

            return;
        }

        const steps = Math.floor((this.max - this.min) / this.step);
        const dotCount = steps + 1;
        const width = this.element.clientWidth || this.element.getBoundingClientRect().width;

        if(width <= 0) {
            if(this._renderedDotCount !== 0) {
                this.dots.innerHTML = "";
                this._renderedDotCount = 0;
            }

            return;
        }

        const maxDots = Math.floor(width / this._dotDensity) + 1;

        if(dotCount <= 1 || dotCount > maxDots) {
            if(this._renderedDotCount !== 0) {
                this.dots.innerHTML = "";
                this._renderedDotCount = 0;
            }

            return;
        }

        if(this._renderedDotCount === dotCount) {
            return;
        }

        const fragment = document.createDocumentFragment();

        for(let index = 0; index < dotCount; index++) {
            const dot = document.createElement("span");
            if(index !== 0 && index !== dotCount - 1) {
                dot.classList.add("ls-range-dot");
            }
            fragment.appendChild(dot);
        }

        this.dots.replaceChildren(fragment);
        this._renderedDotCount = dotCount;
    }

    render() {
        const range = this.max - this.min;
        const percentage = range > 0? (this._value - this.min) / range : 0;
        this.element.style.setProperty("--range-value", percentage * 100 + "%");
        this.renderDots();
    }

    destroy() {
        if(this.resizeObserver) {
            this.resizeObserver.disconnect();
        }

        if(this.onKeyDown) {
            this.element.removeEventListener("keydown", this.onKeyDown);
        }

        this.touchHandle.destroy();
    }
}, { global: true, name: "Range" });

customElements.define('ls-range', class LSRange extends HTMLElement {
    constructor() {
        super();
    }

    getBooleanAttribute(name, fallback = false) {
        const value = this.getAttribute(name);

        if(value === null) {
            return fallback;
        }

        if(value === "" || value === name) {
            return true;
        }

        const normalized = String(value).toLowerCase();
        if(["0", "false", "off", "no"].includes(normalized)) {
            return false;
        }

        return true;
    }

    connectedCallback() {
        this.lsRange = new LS.Range(this, {
            slider: this.getBooleanAttribute("slider", true),
            style: this.getAttribute("style-class") || this.getAttribute("range-style") || null,
            vertical: this.getBooleanAttribute("vertical", false),
            tooltip: this.getBooleanAttribute("tooltip", false)
        });

        const onConnected = this.getAttribute("onconnected");
        if(onConnected) {
            new Function(onConnected).call(this);
        }

        this.lsRange.on("input", (value) => {
            this.dispatchEvent(new InputEvent("input", { detail: value }));
        });

        this.lsRange.on("change", (value) => {
            this.dispatchEvent(new InputEvent("change", { detail: value }));
        });
    }

    set value(val) {
        this.lsRange.value = val;
    }

    get value() {
        return this.lsRange.value;
    }

    set min(val) {
        this.lsRange.min = val;
    }

    get min() {
        return this.lsRange.min;
    }
    
    set max(val) {
        this.lsRange.max = val;
    }

    get max() {
        return this.lsRange.max;
    }

    set step(val) {
        this.lsRange.step = val;
    }

    get step() {
        return this.lsRange.step;
    }

    set vertical(val) {
        this.setAttribute("vertical", val? "true" : "false");
    }

    get vertical() {
        return this.getBooleanAttribute("vertical", false);
    }

    set slider(val) {
        this.setAttribute("slider", val? "true" : "false");
    }

    get slider() {
        return this.getBooleanAttribute("slider", true);
    }

    set tooltip(val) {
        this.setAttribute("tooltip", val? "true" : "false");
    }

    get tooltip() {
        return this.getBooleanAttribute("tooltip", false);
    }
});