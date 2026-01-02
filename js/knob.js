/**
 * Knob Component
 * A rotary knob input component with SVG-based rendering, touch support, and customizable styles.
 * Works as a native custom element <ls-knob> with input-like behavior.
 * 
 * @author lstv.space
 * @license GPL-3.0
 */

(() => {
    const PRESETS = {
        default: {
            pointer: "dot"
        },
        chrome: {
            arcFill: false,
            arcWidth: 5,
            pointer: "line",
            pointerGlow: true
        },
        flat: {
            arcFill: false,
            arcBackground: true
        },
        progress: {
            arcGap: [180, 540],
            arcFill: false,
            pointer: "none"
        }
    };

    const DEFAULT_STYLE = {
        arcGap: [220, 500],
        arc: true,
        arcSpread: 0,
        arcWidth: 15,
        arcRounded: true,
        pointerGlow: false,
        arcBackground: false,
        arcFill: true,
        pointer: "none"
    };

    const DEFAULTS = {
        min: 0,
        max: 100,
        step: 1,
        value: 0,
        preset: "default",
        sensitivity: 0.5,
        disabled: false,
        showTooltip: true,
        valueDisplayFormatter: null,
        label: null,
        bipolar: "auto" // "auto" = true when min < 0 < max, or explicit true/false
    };

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    function polarToCartesian(cx, cy, radius, angleInDegrees) {
        const angleInRadians = (angleInDegrees - 90) * Math.PI / 180;
        return {
            x: cx + radius * Math.cos(angleInRadians),
            y: cy + radius * Math.sin(angleInRadians)
        };
    }

    function describeArc(x, y, radius, spread, startAngle, endAngle, fill) {
        const innerStart = polarToCartesian(x, y, radius, endAngle);
        const innerEnd = polarToCartesian(x, y, radius, startAngle);
        const outerStart = polarToCartesian(x, y, radius + spread, endAngle);
        const outerEnd = polarToCartesian(x, y, radius + spread, startAngle);
        const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

        const d = [
            "M", outerStart.x, outerStart.y,
            "A", radius + spread, radius + spread, 0, largeArcFlag, 0, outerEnd.x, outerEnd.y,
            ...(fill ? [
                "L", innerEnd.x, innerEnd.y,
                "A", radius, radius, 0, largeArcFlag, 1, innerStart.x, innerStart.y,
                "L", outerStart.x, outerStart.y, "Z"
            ] : [])
        ].join(" ");

        return d;
    }

    // Register the Knob component class with LS
    LS.LoadComponent(class Knob extends LS.Component {
        static presets = PRESETS;
        static defaultStyle = DEFAULT_STYLE;

        /**
         * Creates a new Knob instance
         * @param {HTMLElement} element - Container element
         * @param {Object} options - Configuration options
         */
        constructor(element, options = {}) {
            super();

            this.element = element instanceof HTMLElement ? element : O(element);
            if (!this.element) throw new Error("Knob: No valid element provided");

            this.options = LS.Util.defaults(DEFAULTS, options);
            this.style = { ...DEFAULT_STYLE };

            this.#value = clamp(this.options.value, this.options.min, this.options.max);
            this.#percentage = 0;
            this.#arcAngle = 0;
            this.#initialized = false;

            // DOM references
            this.svg = null;
            this.arc = null;
            this.back = null;
            this.rotor = null;
            this.stator = null;
            this.labelElement = null;

            // Frame scheduler for efficient rendering
            this.frameScheduler = new LS.Util.FrameScheduler(() => this.#render());

            // Interaction state
            this.enabled = !this.options.disabled;
            this.handle = null;

            this.#setup();
        }

        // Private state
        #value = 0;
        #rawValue = 0; // Unsnapped value for smooth interpolation during drag
        #percentage = 0;
        #arcAngle = 0;
        #initialized = false;
        #startValue = 0;
        #isDragging = false;

        get value() {
            return this.#value;
        }

        set value(newValue) {
            const clamped = clamp(Number(newValue) || 0, this.options.min, this.options.max);
            // Snap to step
            const stepped = Math.round(clamped / this.options.step) * this.options.step;
            // Clamp again after stepping to handle floating point edge cases
            const final = clamp(stepped, this.options.min, this.options.max);
            // Round to avoid floating point precision issues
            const rounded = Math.round(final * 1e10) / 1e10;
            if (rounded === this.#value) return;
            this.#value = rounded;
            if (!this.#isDragging) {
                this.#rawValue = rounded;
            }
            this.frameScheduler.schedule();
        }

        // Internal setter that bypasses stepping (for smooth drag)
        #setRawValue(newValue) {
            const clamped = clamp(Number(newValue) || 0, this.options.min, this.options.max);
            this.#rawValue = clamped;
            // Snap for the actual value
            const stepped = Math.round(clamped / this.options.step) * this.options.step;
            const final = clamp(stepped, this.options.min, this.options.max);
            const rounded = Math.round(final * 1e10) / 1e10;
            const changed = rounded !== this.#value;
            this.#value = rounded;
            this.frameScheduler.schedule();
            return changed;
        }

        get min() {
            return this.options.min;
        }

        set min(val) {
            this.options.min = Number(val) || 0;
            this.value = this.#value; // Re-clamp
        }

        get max() {
            return this.options.max;
        }

        set max(val) {
            this.options.max = Number(val) || 100;
            this.value = this.#value; // Re-clamp
        }

        get step() {
            return this.options.step;
        }

        set step(val) {
            this.options.step = Math.max(0.001, Number(val) || 1);
        }

        get disabled() {
            return !this.enabled;
        }

        set disabled(val) {
            this.enabled = !val;
            this.element.classList.toggle("ls-knob-disabled", !this.enabled);
            if (this.handle) {
                this.handle.enabled = this.enabled;
            }
        }

        #setup() {
            this.element.classList.add("ls-knob");

            // Create SVG if not present
            if (!this.element.querySelector("svg")) {
                this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                this.element.appendChild(this.svg);
            } else {
                this.svg = this.element.querySelector("svg");
            }

            this.svg.setAttribute("width", "200");
            this.svg.setAttribute("height", "200");
            this.svg.setAttribute("viewBox", "0 0 200 200");

            // Create stator container if not present
            if (!this.element.querySelector(".ls-knob-stator")) {
                this.stator = LS.Create({ class: "ls-knob-stator" });
                this.element.appendChild(this.stator);
            } else {
                this.stator = this.element.querySelector(".ls-knob-stator");
            }

            // Get existing elements or prepare for creation
            this.arc = this.svg.querySelector(".ls-knob-arc");
            this.back = this.svg.querySelector(".ls-knob-back");
            this.rotor = this.element.querySelector(".ls-knob-rotor");

            // Set preset from attribute or options
            const preset = this.element.getAttribute("preset") || this.options.preset;
            this.setPreset(preset, true);

            // Setup touch/mouse interaction
            this.handle = new LS.Util.TouchHandle(this.element, {
                pointerLock: true,
                buttons: [0]
            });

            this.handle.cursor = "none";
            this.handle.enabled = this.enabled;

            this.handle.on("start", (event) => {
                if (!this.enabled) return event.cancel();

                this.#startValue = this.#value;
                this.#rawValue = this.#value;
                this.#isDragging = true;
                this.element.classList.add("ls-knob-active");
                this.#showTooltip();
            });

            this.handle.on("move", (event) => {
                if (!this.enabled || !event.domEvent) return;
                // Proportional movement: scale by range so ~200px drag = full range
                const range = this.options.max - this.options.min;
                const pixelsForFullRange = 200;
                const delta = (-event.domEvent.movementY / pixelsForFullRange) * range * this.options.sensitivity;

                // Accumulate raw value for smooth interpolation
                const newRawValue = this.#rawValue + delta;
                const changed = this.#setRawValue(newRawValue);

                if (changed) {
                    this.#emitInput();
                }
                this.#showTooltip();
            });

            this.handle.on("end", () => {
                this.#isDragging = false;
                this.element.classList.remove("ls-knob-active");
                this.#hideTooltip();
                // Sync raw value to final stepped value
                this.#rawValue = this.#value;
                if (this.#startValue !== this.#value) {
                    this.#emitChange();
                }
            });

            // Keyboard support
            this.element.setAttribute("tabindex", "0");
            this.element.setAttribute("role", "slider");

            this.element.addEventListener("keydown", this.__keydownHandler = (e) => {
                if (!this.enabled) return;

                const largeStep = this.options.step * 10;
                let handled = true;

                switch (e.key) {
                    case "ArrowUp":
                    case "ArrowRight":
                        this.value += e.shiftKey ? largeStep : this.options.step;
                        break;
                    case "ArrowDown":
                    case "ArrowLeft":
                        this.value -= e.shiftKey ? largeStep : this.options.step;
                        break;
                    case "Home":
                        this.value = this.options.min;
                        break;
                    case "End":
                        this.value = this.options.max;
                        break;
                    default:
                        handled = false;
                }

                if (handled) {
                    e.preventDefault();
                    this.#emitInput();
                    this.#emitChange();
                }
            });

            // Wheel support
            this.element.addEventListener("wheel", this.__wheelHandler = (e) => {
                if (!this.enabled) return;
                e.preventDefault();
                const delta = -Math.sign(e.deltaY) * this.options.step;
                this.value += delta;
                this.#emitInput();
                this.#emitChange();
            }, { passive: false });

            this.#initialized = true;
            this.#initializeVisuals();
            this.frameScheduler.schedule();
        }

        #initializeVisuals() {
            // Create/update arc path
            if (this.style.arc) {
                if (!this.arc) {
                    this.arc = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    this.arc.classList.add("ls-knob-arc");
                    this.svg.appendChild(this.arc);
                }

                if (this.style.arcFill) {
                    this.arc.setAttribute("fill", "var(--accent)");
                    this.arc.removeAttribute("stroke");
                } else {
                    this.arc.setAttribute("fill", "transparent");
                    this.arc.setAttribute("stroke", "var(--accent)");
                    this.arc.setAttribute("stroke-linecap", this.style.arcRounded ? "round" : "butt");
                    this.arc.setAttribute("stroke-width", this.style.arcWidth + "%");

                    const rect = this.element.getBoundingClientRect();
                    if (rect.height > 0) {
                        this.element.style.setProperty(
                            "--knob-stroke-width",
                            rect.height * (this.style.arcWidth / 100) + "px"
                        );
                    }
                }
                this.arc.style.display = "";
            } else if (this.arc) {
                this.arc.style.display = "none";
            }

            // Create/update background arc
            if (this.style.arcBackground) {
                if (!this.back) {
                    this.back = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    this.back.classList.add("ls-knob-back");
                    this.back.setAttribute("fill", "transparent");
                    if (this.arc) {
                        this.svg.insertBefore(this.back, this.arc);
                    } else {
                        this.svg.appendChild(this.back);
                    }
                }
                this.back.classList.add("ls-knob-arc-full");
                this.back.setAttribute("d", this.#computeArc(false, this.style.arcGap[1]));
                this.back.style.display = "";
            } else if (this.back) {
                this.back.style.display = "none";
            }

            // Create/update rotor (pointer)
            if (this.style.pointer !== "none") {
                if (!this.rotor) {
                    this.rotor = LS.Create({ class: "ls-knob-rotor" });
                    this.stator.appendChild(this.rotor);
                }
                this.rotor.style.display = "";
            } else if (this.rotor) {
                this.rotor.style.display = "none";
            }

            // Update glow state
            this.stator.classList.toggle("ls-knob-glow", !!this.style.pointerGlow);

            // Update label
            this.#updateLabel();
        }

        #render() {
            if (!this.#initialized) return;

            // Calculate percentage and angle
            const range = this.options.max - this.options.min;
            this.#percentage = range > 0 ? ((this.#value - this.options.min) / range) * 100 : 0;
            this.#arcAngle = this.style.arcGap[0] +
                (this.#percentage / 100) * (this.style.arcGap[1] - this.style.arcGap[0]);

            // Update ARIA attributes
            this.element.setAttribute("aria-valuenow", this.#value);
            this.element.setAttribute("aria-valuemin", this.options.min);
            this.element.setAttribute("aria-valuemax", this.options.max);

            // Update rotor rotation
            if (this.style.pointer !== "none" && this.rotor) {
                this.rotor.style.transform = `rotate(${this.#arcAngle}deg)`;
            }

            // Update arc path
            if (this.style.arc && this.arc) {
                const isBipolar = this.#isBipolar();
                
                if (isBipolar) {
                    // Bipolar mode: arc starts from zero point
                    const zeroPercent = (0 - this.options.min) / range * 100;
                    const zeroAngle = this.style.arcGap[0] +
                        (zeroPercent / 100) * (this.style.arcGap[1] - this.style.arcGap[0]);
                    
                    if (this.#value >= 0) {
                        // Positive: draw from zero to value
                        this.arc.setAttribute("d", this.#computeArc(this.style.arcFill, this.#arcAngle, zeroAngle));
                    } else {
                        // Negative: draw from value to zero
                        this.arc.setAttribute("d", this.#computeArc(this.style.arcFill, zeroAngle, this.#arcAngle));
                    }
                } else {
                    // Normal mode: arc from start to value
                    this.arc.setAttribute("d", this.#computeArc(this.style.arcFill, this.#arcAngle));
                }
            }
        }

        #isBipolar() {
            if (this.options.bipolar === "auto") {
                // Auto-detect: bipolar if range spans zero
                return this.options.min < 0 && this.options.max > 0;
            }
            return !!this.options.bipolar;
        }

        #computeArc(fill = true, endAngle = this.#arcAngle, startAngle = this.style.arcGap[0]) {
            // Prevent SVG rendering issues at exact 180° intervals
            let adjustedEnd = endAngle;
            let adjustedStart = startAngle;
            
            if (Math.abs(adjustedEnd - adjustedStart) % 180 < 0.01) {
                adjustedEnd -= 0.1;
            }
            
            // Handle case where start > end (shouldn't happen, but be safe)
            if (adjustedStart > adjustedEnd) {
                [adjustedStart, adjustedEnd] = [adjustedEnd, adjustedStart];
            }
            
            // Minimum arc size to ensure visibility
            if (Math.abs(adjustedEnd - adjustedStart) < 0.5) {
                return "";
            }

            return describeArc(
                100, 100,
                this.style.arcSpread,
                100 - (this.style.arcFill ? 0 : this.style.arcWidth),
                adjustedStart,
                adjustedEnd,
                fill
            );
        }

        #emitInput() {
            this.emit("input", [this.#value]);
            this.element.dispatchEvent(new Event("input", { bubbles: true }));
        }

        #emitChange() {
            this.emit("change", [this.#value]);
            this.element.dispatchEvent(new Event("change", { bubbles: true }));
        }

        #showTooltip() {
            if (!this.options.showTooltip || !LS.Tooltips) return;
            const displayValue = this.#formatValue(this.#value);
            LS.Tooltips.position(this.element).show(displayValue);
        }

        #hideTooltip() {
            if (!this.options.showTooltip || !LS.Tooltips) return;
            LS.Tooltips.hide();
        }

        #formatValue(value) {
            if (typeof this.options.valueDisplayFormatter === "function") {
                return this.options.valueDisplayFormatter(value);
            }
            // Default: show up to 2 decimal places, trim trailing zeros
            return Number(value.toFixed(2)).toString();
        }

        #updateLabel() {
            if (this.options.label) {
                if (!this.labelElement) {
                    this.labelElement = LS.Create({ class: "ls-knob-label" });
                    this.element.appendChild(this.labelElement);
                }
                this.labelElement.textContent = this.options.label;
                this.labelElement.style.display = "";
            } else if (this.labelElement) {
                this.labelElement.style.display = "none";
            }
        }

        /**
         * Set the knob preset/style
         * @param {string|Object} preset - Preset name or style object
         * @param {boolean} quiet - If true, skip re-render
         */
        setPreset(preset, quiet = false) {
            if (typeof preset === "string") {
                // Skip if already using this preset
                if (this.style.name === preset) return;
                const presetName = preset;
                const presetStyle = PRESETS[preset] || {};
                this.style = { ...DEFAULT_STYLE, ...presetStyle, name: presetName };
            } else if (typeof preset === "object") {
                this.style = { ...DEFAULT_STYLE, ...preset };
            }

            const newPresetName = this.style.name || "custom";
            if (this.element.getAttribute("preset") !== newPresetName) {
                this.element.setAttribute("preset", newPresetName);
            }
            if (this.element.getAttribute("knob-pointer") !== this.style.pointer) {
                this.element.setAttribute("knob-pointer", this.style.pointer);
            }

            if (!quiet && this.#initialized) {
                this.#initializeVisuals();
                this.frameScheduler.schedule();
            }
        }

        /**
         * Update style options
         * @param {Object} styleOptions - Style properties to update
         */
        updateStyle(styleOptions = {}) {
            Object.assign(this.style, styleOptions);
            this.element.setAttribute("knob-pointer", this.style.pointer);
            this.#initializeVisuals();
            this.frameScheduler.schedule();
        }

        /**
         * Update knob options
         * @param {Object} options - Options to update (min, max, step, etc.)
         */
        updateOptions(options = {}) {
            Object.assign(this.options, options);
            this.value = this.#value; // Re-clamp with new bounds
            if ('label' in options) {
                this.#updateLabel();
            }
        }

        get label() {
            return this.options.label;
        }

        set label(val) {
            this.options.label = val;
            this.#updateLabel();
        }

        get bipolar() {
            return this.options.bipolar;
        }

        set bipolar(val) {
            this.options.bipolar = val;
            this.frameScheduler.schedule();
        }

        /**
         * Force a render update
         */
        render() {
            this.#initializeVisuals();
            this.frameScheduler.schedule();
        }

        /**
         * Clean up all resources
         */
        destroy() {
            this.frameScheduler.destroy();

            if (this.handle) {
                this.handle.destroy();
                this.handle = null;
            }

            if (this.__keydownHandler) {
                this.element.removeEventListener("keydown", this.__keydownHandler);
                this.__keydownHandler = null;
            }

            if (this.__wheelHandler) {
                this.element.removeEventListener("wheel", this.__wheelHandler);
                this.__wheelHandler = null;
            }

            this.element.classList.remove("ls-knob", "ls-knob-active", "ls-knob-disabled");
            this.element.removeAttribute("tabindex");
            this.element.removeAttribute("role");
            this.element.removeAttribute("aria-valuenow");
            this.element.removeAttribute("aria-valuemin");
            this.element.removeAttribute("aria-valuemax");
            this.element.removeAttribute("preset");
            this.element.removeAttribute("knob-pointer");

            this.events.clear();

            this.svg = null;
            this.arc = null;
            this.back = null;
            this.rotor = null;
            this.stator = null;
            this.labelElement = null;
            this.element = null;

            this.#initialized = false;
        }
    }, { global: true, name: "Knob" });

    // Custom Element: <ls-knob>
    customElements.define("ls-knob", class LSKnob extends HTMLElement {
        static observedAttributes = ["value", "min", "max", "step", "preset", "disabled", "label", "show-tooltip", "bipolar"];

        constructor() {
            super();
            this.knob = null;
            this.__pendingValue = null;
        }

        connectedCallback() {
            if (this.knob) return;

            // Wait for LS.Knob to be available
            if (!LS.GetComponent("Knob")) {
                LS.on("component-loaded", (name) => {
                    if (name === "Knob") this.connectedCallback();
                    return LS.REMOVE_LISTENER;
                });
                return;
            }

            const options = {
                min: this.hasAttribute("min") ? parseFloat(this.getAttribute("min")) : 0,
                max: this.hasAttribute("max") ? parseFloat(this.getAttribute("max")) : 100,
                step: this.hasAttribute("step") ? parseFloat(this.getAttribute("step")) : 1,
                value: this.__pendingValue ?? (this.hasAttribute("value") ? parseFloat(this.getAttribute("value")) : 0),
                preset: this.getAttribute("preset") || "default",
                disabled: this.hasAttribute("disabled"),
                label: this.getAttribute("label") || null,
                showTooltip: !this.hasAttribute("show-tooltip") || this.getAttribute("show-tooltip") !== "false",
                bipolar: this.hasAttribute("bipolar") 
                    ? (this.getAttribute("bipolar") === "auto" ? "auto" : this.getAttribute("bipolar") !== "false")
                    : "auto"
            };

            this.knob = new LS.Knob(this, options);

            // Forward component events to DOM events
            this.knob.on("input", (value) => {
                this.setAttribute("value", value);
            });

            this.knob.on("change", (value) => {
                this.setAttribute("value", value);
            });

            this.__pendingValue = null;
        }

        disconnectedCallback() {
            // Sadly there is no way (as far as I know) to get a callback once the element is actually destroyed, not just disconnected from DOM.
            // Since most apps may remove the knob temporarily and then re-add it later, I am making it default not to destroy.
            // It's just another unfortunate browser limitation.
            // Of course, don't forget to actually destroy once you aren't going to use the knob anymore
            if(this.knob && this.knob.options.destroyOnDisconnect) this.destroy();
        }

        attributeChangedCallback(name, oldValue, newValue) {
            if (!this.knob) {
                if (name === "value") {
                    this.__pendingValue = parseFloat(newValue) || 0;
                }
                return;
            }

            switch (name) {
                case "value":
                    const numValue = parseFloat(newValue) || 0;
                    if (this.knob.value !== numValue) {
                        this.knob.value = numValue;
                    }
                    break;
                case "min":
                    this.knob.min = parseFloat(newValue) || 0;
                    break;
                case "max":
                    this.knob.max = parseFloat(newValue) || 100;
                    break;
                case "step":
                    this.knob.step = parseFloat(newValue) || 1;
                    break;
                case "preset":
                    // setPreset already guards against same-value updates
                    if (newValue && newValue !== oldValue) {
                        this.knob.setPreset(newValue);
                    }
                    break;
                case "disabled":
                    this.knob.disabled = this.hasAttribute("disabled");
                    break;
                case "label":
                    this.knob.label = newValue || null;
                    break;
                case "show-tooltip":
                    this.knob.options.showTooltip = newValue !== "false";
                    break;
                case "bipolar":
                    this.knob.bipolar = newValue === "auto" ? "auto" : newValue !== "false";
                    break;
            }
        }

        get value() {
            return this.knob?.value ?? this.__pendingValue ?? 0;
        }

        set value(val) {
            if (this.knob) {
                this.knob.value = val;
                this.setAttribute("value", this.knob.value);
            } else {
                this.__pendingValue = parseFloat(val) || 0;
            }
        }

        get min() {
            return this.knob?.min ?? parseFloat(this.getAttribute("min")) ?? 0;
        }

        set min(val) {
            this.setAttribute("min", val);
        }

        get max() {
            return this.knob?.max ?? parseFloat(this.getAttribute("max")) ?? 100;
        }

        set max(val) {
            this.setAttribute("max", val);
        }

        get step() {
            return this.knob?.step ?? parseFloat(this.getAttribute("step")) ?? 1;
        }

        set step(val) {
            this.setAttribute("step", val);
        }

        get disabled() {
            return this.hasAttribute("disabled");
        }

        set disabled(val) {
            if (val) {
                this.setAttribute("disabled", "");
            } else {
                this.removeAttribute("disabled");
            }
        }

        get label() {
            return this.knob?.label ?? this.getAttribute("label");
        }

        set label(val) {
            if (val) {
                this.setAttribute("label", val);
            } else {
                this.removeAttribute("label");
            }
        }

        get showTooltip() {
            return this.knob?.options.showTooltip ?? this.getAttribute("show-tooltip") !== "false";
        }

        set showTooltip(val) {
            this.setAttribute("show-tooltip", val ? "true" : "false");
        }

        get bipolar() {
            return this.knob?.bipolar ?? this.getAttribute("bipolar");
        }

        set bipolar(val) {
            if (val === "auto") {
                this.setAttribute("bipolar", "auto");
            } else {
                this.setAttribute("bipolar", val ? "true" : "false");
            }
        }

        /**
         * Set a custom value formatter for the tooltip
         * @param {Function} formatter - Function that takes value and returns display string
         */
        setValueFormatter(formatter) {
            if (this.knob) {
                this.knob.options.valueDisplayFormatter = formatter;
            }
        }

        /**
         * Set the knob preset
         * @param {string} preset - Preset name
         */
        setPreset(preset) {
            this.knob?.setPreset(preset);
        }

        /**
         * Update style options
         * @param {Object} options - Style options
         */
        updateStyle(options) {
            this.knob?.updateStyle(options);
        }

        /**
         * Destroy the knob instance
         */
        destroy() {
            if (this.knob) {
                this.knob.destroy();
                this.knob = null;
            }
            this.__pendingValue = null;
        }
    });
})();