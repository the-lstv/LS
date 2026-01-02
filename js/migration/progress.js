(() => {
    const { N, O } = LS.Tiny;

    class ProgressBar extends LS.Component {
        constructor(element, options = {}) {
            super();

            this.element = O(element);
            if (!this.element) {
                throw new Error("ProgressBar: No valid element provided");
            }

            const tagName = this.element.tagName;

            this.options = LS.Util.defaults({
                seeker: tagName === "LS-SEEKER",
                styled: true,
                vertical: false,
                padding: options.vertical ? 16 : 0,
                separator: tagName === "LS-SEEKER" ? "" : "/",
                label: true,
                min: null,
                max: null,
                step: null,
                value: null,
                progress: null,
                metric: null
            }, options);

            // Internal state
            this._min = (this.options.min ?? Number(this.element.attr("min"))) || 0;
            this._max = (this.options.max ?? Number(this.element.attr("max"))) || 100;
            this._step = (this.options.step ?? Number(this.element.attr("step"))) || 1;
            this._value = this._clampValue(
                (this.options.value ?? Number(this.element.attr("value"))) || 0
            );
            this._progress = this.options.progress ?? 0;
            this._seeking = false;

            if (!this.options.metric && this.element.attr("metric")) {
                this.options.metric = this.element.attr("metric");
            }

            if (this.options.progress != null && this.options.value != null) {
                console.warn("ProgressBar: Both progress and value defined; using value.");
            }

            this._buildDOM();
            this._setupProperties();
            this._init();
        }

        _clampValue(value) {
            return Math.min(this._max, Math.max(this._min, value));
        }

        _buildDOM() {
            const { element, options } = this;

            element.class("ls-progress");
            element.attrAssign("chv");

            if (options.seeker) element.class("ls-seek");
            if (options.styled) element.class("ls-progress-styled");

            // Build child elements
            const children = [N({ class: "ls-progress-bar" })];

            if (options.seeker) {
                children.push(N({ class: "ls-seeker-thumb" }));
            }

            if (options.label) {
                children.push(
                    N({
                        class: "ls-progress-label",
                        inner: [
                            N("span", { class: "ls-progress-label-left" }),
                            N("span", { class: "ls-progress-label-separator" }),
                            N("span", { class: "ls-progress-label-right" })
                        ]
                    })
                );
            }

            element.add(...children.filter(Boolean));

            // Cache DOM references
            this.bar = element.get(".ls-progress-bar");

            if (options.label) {
                this.label = element.get(".ls-progress-label");
                this.labelLeft = element.get(".ls-progress-label-left");
                this.labelRight = element.get(".ls-progress-label-right");
                this.labelSeparator = element.get(".ls-progress-label-separator");
            }

            if (options.seeker) {
                this.thumb = element.get(".ls-seeker-thumb");
            }
        }

        _setupProperties() {
            Object.defineProperties(this, {
                progress: {
                    get: () => this._progress,
                    set: (value) => {
                        this._progress = value;
                        this._update(true);
                    }
                },
                value: {
                    get: () => this._value,
                    set: (value) => {
                        this._value = this._clampValue(value);
                        this._update(false);
                    }
                },
                max: {
                    get: () => this._max,
                    set: (value) => {
                        this._max = value;
                        this._value = this._clampValue(this._value);
                        this._update(false);
                    }
                },
                min: {
                    get: () => this._min,
                    set: (value) => {
                        this._min = value;
                        this._value = this._clampValue(this._value);
                        this._update(false);
                    }
                },
                step: {
                    get: () => this._step,
                    set: (value) => {
                        this._step = value;
                    }
                },
                seeking: {
                    get: () => this._seeking
                }
            });
        }

        _init() {
            const { options } = this;

            if (options.seeker) {
                this._setupSeeker();
            }

            // Initial update
            this._update(options.progress != null && options.value == null);
        }

        _setupSeeker() {
            const { options } = this;

            if (options.label) {
                this._setupEditableLabel();
            }

            this.handle = new LS.Util.TouchHandle(this.element, {
                exclude: options.label ? ".ls-progress-label-left" : null
            });

            this.handle.on("start", (event) => {
                if (this.element.hasAttribute("disabled")) {
                    event.cancel();
                    return;
                }
                this._seeking = true;
                this.emit("seekstart", [this._value, this._max, this._progress]);
                if (LS.Tooltips) LS.Tooltips.show();
            });

            this.handle.on("move", (event) => {
                const rect = this.element.getBoundingClientRect();
                const isVertical = options.vertical;
                
                const size = isVertical ? rect.height : rect.width;
                const offset = isVertical ? (event.y - rect.top) : (event.x - rect.left);
                const normalizedOffset = isVertical ? (size - offset) : offset;
                
                const range = this._max - this._min;
                const rawValue = (normalizedOffset / size) * range + this._min;
                
                // Apply step quantization
                const steppedValue = Math.round(rawValue / this._step) * this._step;
                const newValue = this._clampValue(steppedValue);

                if (newValue !== this._value) {
                    this._value = newValue;
                    
                    if (LS.Tooltips) {
                        LS.Tooltips.set(String(newValue));
                        LS.Tooltips.position(this.thumb);
                    }

                    this._update(false, true);
                }
            });

            this.handle.on("end", () => {
                this._seeking = false;
                this.emit("seekend", [this._value, this._max, this._progress]);
                if (LS.Tooltips) LS.Tooltips.hide();
            });
        }

        _setupEditableLabel() {
            const { labelLeft } = this;

            labelLeft.style.userSelect = "";

            labelLeft.on("dblclick", () => {
                labelLeft.attrAssign({ contenteditable: "true", tabindex: "5" });
                labelLeft.focus();
                
                // Select all text
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(labelLeft);
                selection.removeAllRanges();
                selection.addRange(range);
            });

            labelLeft.on("blur", () => {
                labelLeft.delAttr("contenteditable", "tabindex");
                
                const parsed = Number(labelLeft.innerText);
                
                if (isNaN(parsed)) {
                    labelLeft.textContent = String(this._value);
                    return;
                }

                this._value = this._clampValue(parsed);
                this._update(false, true);
            });

            labelLeft.on("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    labelLeft.blur();
                } else if (e.key === "Escape") {
                    labelLeft.textContent = String(this._value);
                    labelLeft.blur();
                }
            });
        }

        _update(setPercentage = false, isSeeking = false) {
            // Don't update during external changes while seeking
            if (this._seeking && !isSeeking) return;

            const range = this._max - this._min;
            
            if (range <= 0) {
                console.warn("ProgressBar: Invalid range (max must be greater than min)");
                return;
            }

            if (setPercentage) {
                // Calculate value from progress percentage
                this._value = this._clampValue(
                    (this._progress / 100) * range + this._min
                );
            } else {
                // Calculate progress from value
                this._progress = ((this._value - this._min) / range) * 100;
            }

            const { options, _progress: progress } = this;
            const positionProp = options.vertical ? "bottom" : "left";
            const sizeProp = options.vertical ? "height" : "width";

            // Update progress bar
            this.bar.style[sizeProp] = `${progress}%`;

            // Update seeker thumb position
            if (options.seeker && this.thumb) {
                this.thumb.style[positionProp] = options.padding
                    ? `calc(${progress}%)`
                    : `${progress}%`;

                if (isSeeking) {
                    this.emit("seek", [this._value, this._max, this._progress]);
                }
            }

            // Emit change event
            this.emit("change", [this._value, this._max, this._progress]);

            // Update labels
            if (options.label) {
                this.labelLeft.textContent = String(this._value);
                this.labelSeparator.textContent = options.separator;
                this.labelRight.textContent = options.metric
                    ? `${this._max} ${options.metric}`
                    : String(this._max);
            }
        }

        setRange(min, max) {
            this._min = min;
            this._max = max;
            this._value = this._clampValue(this._value);
            this._update(false);
            return this;
        }

        disable() {
            this.element.setAttribute("disabled", "");
            return this;
        }

        enable() {
            this.element.removeAttribute("disabled");
            return this;
        }

        destroy() {
            if (this.handle) {
                this.handle.destroy();
                this.handle = null;
            }

            this.element.class("ls-progress ls-seek ls-progress-styled", "remove");
            this.element.delAttr("chv");
            this.element.clear();

            // Clear references
            this.bar = null;
            this.thumb = null;
            this.label = null;
            this.labelLeft = null;
            this.labelRight = null;
            this.labelSeparator = null;

            this.flush();
            return true;
        }
    }

    // Register as a component
    LS.LoadComponent(ProgressBar, {
        name: "ProgressBar",
        global: true,
        singular: false
    });

    // Also expose a factory function for convenience
    LS.Progress = (element, options) => new ProgressBar(element, options);
})();