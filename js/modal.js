/**
 * Modal Component for LS
 * Provides modal dialog functionality with stacking, focus management, and animations.
 * @version 1.0.0
 */

(() => {
    const container = N({
        class: "ls-modal-layer level-1"
    });

    LS.once("body-available", () => {
        LS._topLayer.add(container);
    });

    window.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            LS.Modal.closeTop();
        }
    });

    container.addEventListener("click", (event) => {
        if (event.target === container && LS.Modal.top && LS.Modal.top.options.canClickAway !== false) {
            LS.Modal.closeTop();
        }
    });

    LS._modalStack = LS._modalStack || [];

    LS.LoadComponent(class Modal extends LS.Component {
        constructor(options = {}) {
            super();

            this.options = options;
            this.isOpen = false;

            this.container = N({
                class: "ls-modal",
                inner: options.content || null,
                tabIndex: "0"
            });

            this.container.style.display = "none";

            if (options.styled !== false) {
                this.container.classList.add("ls-modal-styled");
            }

            this.container.style.width = options.width? typeof options.width === "number" ? options.width + "px" : options.width: "450px";

            if (options.height) {
                this.container.style.height = typeof options.height === "number" ? options.height + "px" : options.height;
            }

            container.add(this.container);

            if (options.open) {
                this.open();
            }
        }

        open() {
            if (this.isOpen || this._destroyed) return;
            this.previousFocus = document.activeElement;
            this.isOpen = true;

            if (LS._modalStack.length > 0) {
                const topModal = LS.Modal.top;
                if (topModal && topModal.container) {
                    topModal.container.classList.remove("ls-top-modal");
                }
            }

            LS._modalStack.push(this);
            this.container.classList.add("open");
            this.container.classList.add("ls-top-modal");

            setTimeout(() => {
                const focusable = this.container.querySelector("input, button, select, textarea, [tabindex]:not([tabindex='-1'])");
                if (focusable) {
                    focusable.focus();
                } else {
                    this.container.focus();
                }
            }, 0);

            this.container.style.zIndex = LS._modalStack.length;
            container.classList.add("is-open");

            if (LS.Animation && this.options.animate !== false) {
                LS.Animation.fadeIn(this.container, null, this.options.fadeInDirection || 'forward');
            }

            this.emit("open");
            return this;
        }

        close(focus = true) {
            if (!this.isOpen) return;

            this.isOpen = false;
            this.container.classList.remove("open");
            this.container.classList.remove("ls-top-modal");
            const index = LS._modalStack.indexOf(this);
            if (index > -1) {
                LS._modalStack.splice(index, 1);
            }

            setTimeout(() => {
                if (LS._modalStack.length === 0) {
                    container.classList.remove("is-open");
                    if (focus) (this.previousFocus || document.body).focus();
                } else {
                    const top = LS.Modal.top;
                    if (top && top.container) {
                        if (focus) top.container.classList.add("ls-top-modal");
                        
                        if (focus && this.previousFocus) {
                            this.previousFocus.focus();
                        } else {
                            top.container.focus();
                        }
                    }
                }
            }, 0);

            if (LS.Animation && this.options.animate !== false) {
                LS.Animation.fadeOut(this.container, null, this.options.fadeOutDirection || 'backward');
            }

            if (this.options.ephemeral) {
                setTimeout(() => {
                    this.destroy();
                }, 300);
            }

            this.emit("close");
            return this;
        }

        destroy() {
            if (this.isOpen) {
                this.close(false);
            }

            this.container.remove();
            this.container = null;
            this.emit("destroy");
            this._destroyed = true;
            return this;
        }

        static get top() {
            return LS._modalStack[LS._modalStack.length - 1] || null;
        }

        static closeAll() {
            for (const modal of LS._modalStack) {
                modal.close(false);
            }
            LS._modalStack = [];
            container.classList.remove("is-open");
            document.body.focus();
        }

        static closeTop() {
            if (LS._modalStack.length > 0) {
                const topModal = LS.Modal.top;
                if (topModal.isOpen && topModal.options.closeable !== false) {
                    topModal.close();
                }
            }
        }

        static buildEphemeral(options = {}, modalOptions = {}) {
            modalOptions.ephemeral = true;
            modalOptions.open = true;
            return LS.Modal.build(options, modalOptions);
        }

        static build(options = {}, modalOptions = {}) {
            const content = [];

            if (options.title) {
                content.push(N("h2", { class: "ls-modal-title", inner: options.title }));
            }

            if (options.content) {
                content.push(N("div", { class: "ls-modal-body", inner: options.content }));
            }

            if (options.buttons) {
                content.push(N("div", { class: "ls-modal-footer", inner: options.buttons.map(button => {
                    return N("button", {
                        class: `ls-modal-button ${button.class || ''}`,
                        inner: button.label || 'Button',
                        onclick: button.onClick || button.onclick || (() => modal.close())
                    });
                })}));
            }

            modalOptions.content = content;
            const modal = new LS.Modal(modalOptions);
            return modal;
        }
    }, { name: "Modal", global: true })
})();
