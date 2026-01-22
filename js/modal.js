/**
 * Modal Component for LS
 * Provides modal dialog functionality with stacking, focus management, and animations.
 * @version 1.0.0
 */

(() => {
    function closeModal() {
        if(this instanceof HTMLElement) this.closest(".ls-modal").lsComponent.close(); else {
            LS.Stack.pop();
        }
    }

    LS.LoadComponent(class Modal extends LS.Component {
        static DEFAULTS = {
            styled: true,
            fadeInDuration: 300,
            fadeOutDuration: 300
        }

        constructor(options = {}, template = {}) {
            super();

            this.options = LS.Util.defaults(this.constructor.DEFAULTS, options);
            this.isOpen = false;

            this.container = this.constructor.TEMPLATE({
                inner: this.options.content || null,

                // Template
                title: template.title || null,
                content: template.content || null,
                buttons: template.buttons || null,

                closeModal
            }).root;

            this.container.lsComponent = this;

            if(template.onOpen) {
                this.on("open", template.onOpen);
            }

            if(template.onClose) {
                this.on("close", template.onClose);
            }

            template = null;

            this.container.style.display = "none";

            if (this.options.styled !== false) {
                this.container.classList.add("ls-modal-styled");
            }

            this.container.style.width = this.options.width? typeof this.options.width === "number" ? this.options.width + "px" : this.options.width: "450px";
            if (this.options.height) {
                this.container.style.height = typeof this.options.height === "number" ? this.options.height + "px" : this.options.height;
            }

            LS.Stack.container.add(this.container);

            if (this.options.open) {
                this.open();
            }
        }

        get isCloseable() {
            return this.options.closeable !== false;
        }

        get hasShade() {
            return this.options.shade !== false;
        }

        open() {
            if (this.isOpen || this.destroyed) return;
            this.previousFocus = document.activeElement;
            this.isOpen = true;

            if (LS.Stack.length > 0) {
                const topModal = LS.Modal.top;
                if (topModal && topModal.container) {
                    topModal.container.classList.remove("ls-top-modal");
                }
            }

            LS.Stack.push(this);
            this.container.classList.add("open");
            this.container.classList.add("ls-top-modal");

            LS.Context.setTimeout(() => {
                if(!this.isOpen || this.destroyed) return;

                const focusable = this.container.querySelector("input, button, select, textarea, [tabindex]:not([tabindex='-1'])");
                if (focusable) {
                    focusable.focus();
                } else {
                    this.container.focus();
                }
            }, 0);

            this.container.style.zIndex = LS.Stack.length;

            if (LS.Animation && this.options.animate !== false) {
                LS.Animation.fadeIn(this.container, this.options.fadeInDuration || 300, this.options.fadeInDirection || 'forward');
            }

            this.emit("open");
            return this;
        }

        close(refocus = true) {
            if (!this.isOpen || this.destroyed) return;

            this.isOpen = false;
            this.container.classList.remove("open");
            this.container.classList.remove("ls-top-modal");
            LS.Stack.remove(this);

            this.ctx.setTimeout(() => {
                if(this.isOpen || this.destroyed) return;

                if (LS.Stack.length === 0) {
                    if (refocus) (this.previousFocus || document.body).focus();
                } else {
                    const top = LS.Modal.top;
                    if (top && top.container) {
                        if (refocus) top.container.classList.add("ls-top-modal");

                        if (refocus && this.previousFocus) {
                            this.previousFocus.focus();
                        } else {
                            top.container.focus();
                        }
                    }
                }
            }, 0);

            if (LS.Animation && this.options.animate !== false) {
                LS.Animation.fadeOut(this.container, this.options.fadeOutDuration || 300, this.options.fadeOutDirection || 'backward');
            }

            if (this.options.ephemeral) {
                this.destroy(true);
            }

            this.emit("close");
            return this;
        }

        destroy(delayed = false) {
            if(this.destroyed) return;

            if (this.isOpen) {
                this.close(false);
            }

            LS.Stack.remove(this);

            if (delayed) {
                LS.Context.setTimeout(() => {
                    this.container.remove();
                    this.container = null;
                }, this.options.fadeOutDuration || 300);
            } else {
                this.container.remove();
                this.container = null;
            }

            this.options = null;
            this.previousFocus = null;
            this.emit("destroy");
            this.events.clear();
            this.destroyed = true;
            return;
        }

        static get top() {
            return LS.Stack.top;
        }

        static closeAll() {
            for (const modal of LS.Stack.items) {
                if(modal instanceof LS.Modal) modal.close(false);
            }

            document.body.focus();
        }

        static closeTop() {
            return LS.Stack.pop();
        }

        static buildEphemeral(options = {}, modalOptions = {}) {
            modalOptions.ephemeral = true;
            modalOptions.open = true;
            return LS.Modal.build(options, modalOptions);
        }

        static TEMPLATE(d){'use strict';var e0=document.createElement("div");e0.tabIndex="0";e0.className="ls-modal";if(!!(d.inner)){e0.appendChild(LS.__dynamicInnerToNode(d.inner));}else{if(!!(d.title)){var e1=document.createElement("h2");e1.className="ls-modal-title";e1.append(LS.__dynamicInnerToNode(d.title));e0.appendChild(e1);}if(!!(d.content)){var e2=document.createElement("div");e2.className="ls-modal-body";e2.append(LS.__dynamicInnerToNode(d.content));e0.appendChild(e2);}if(!!(d.buttons)){var e3=document.createElement("div");e3.className="ls-modal-footer";var a4=d.buttons||[];for(const i5 of a4){var e6=document.createElement("button");e6.textContent=(i5.label) || ("Button");e6.onclick=(i5.onClick) || (i5.onclick) || (d.closeModal);e6.setAttribute("ls-accent",(i5.accent) || (null));e6.className=["ls-modal-button",i5.class].filter(Boolean).join(" ");e3.appendChild(e6);}e0.appendChild(e3);}}var __rootValue=e0;return{root:__rootValue};}

        // static TEMPLATE = /* @BUILD compile-template */ LS.CompileTemplate((data, logic) => ({
        //     class: "ls-modal",
        //     tabIndex: "0",
        //     inner: logic.if(data.inner, data.inner, [
        //         logic.if(data.title, { tag: "h2", class: "ls-modal-title", inner: data.title }),

        //         logic.if(data.content, { tag: "div", class: "ls-modal-body", inner: data.content }),

        //         logic.if(data.buttons, {
        //             tag: "div",
        //             class: "ls-modal-footer",
        //             inner: logic.map(data.buttons, (button) => ({
        //                 tag: "button",
        //                 class: logic.join(" ", `ls-modal-button`, button.class),
        //                 accent: logic.or(button.accent, null),
        //                 textContent: logic.or(button.label, 'Button'),
        //                 onclick: logic.or(button.onClick, button.onclick, data.closeModal)
        //             }))
        //         })
        //     ])
        // }));

        static build(template = {}, modalOptions = {}) {
            return new LS.Modal(modalOptions, template);
        }
    }, { name: "Modal", global: true })
})();
