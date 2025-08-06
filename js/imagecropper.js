(() => {
    LS.LoadComponent(class ImageCropper extends LS.Component {
        constructor(image, options = {}) {
            super();

            if (image instanceof File) {
                this.image = new Image();
                const src = URL.createObjectURL(image);

                this.image.onload = () => {
                    URL.revokeObjectURL(src);
                };

                this.image.onerror = () => {
                    console.error("Failed to load image from File object");
                };

                this.image.src = src;
            } else if (typeof image === "string") {
                this.image = new Image();
                this.image.src = image;
            } else if (image instanceof HTMLImageElement) {
                this.image = image;
            } else {
                throw new Error("Invalid image type. Must be a File, string URL, or HTMLImageElement.");
            }

            options = LS.Util.defaults({
                width: 100,
                height: 100,
                styled: true,
                inheritResolution: false
            }, options);


            this.image.classList.add("ls-image-cropper-image");
            this.image.draggable = false;
            this.image.style.minHeight = options.height + "px";
            this.image.style.minWidth = options.width + "px";

            this.image.addEventListener("load", () => this.prepareImage());
            if (this.image.complete) {
                this.prepareImage();
            }

            this.options = options;

            this.container = N({
                class: "ls-image-cropper",
                inner: [
                    this.image,
                    N({
                        class: "ls-image-cropper-overlay",
                        style: {
                            width: options.width + "px",
                            height: options.height + "px",
                            borderRadius: options.shape === "circle" ? "50%" : "0",
                        }
                    }),
                ]
            });

            this.wrapper = N({
                class: "ls-image-cropper-wrapper",
                inner: [
                    this.container,
                    N({
                        class: "ls-image-cropper-controls",
                        inner: [
                            N("input", {
                                type: "range",
                                min: this.options.minScale || 1,
                                max: this.options.maxScale || 3,
                                step: 0.01,
                                value: this.options.initialScale || 1,
                                oninput: (e) => {
                                    this.scale = parseFloat(e.target.value);
                                    this.applyTransform();
                                }
                            }),

                            N("button", {
                                class: "clear square",
                                inner: N("i", { class: "bi-arrow-clockwise" }),
                                onclick: () => this.changeRotation(90)
                            })
                        ]
                    })
                ]
            });

            if (options.styled !== false) {
                this.container.classList.add("ls-image-cropper-styled");
            }

            this.rotation = this.options.rotation || 0;
            this.scale = this.options.initialScale || 1;
            const minScale = this.options.minScale || 1;
            const maxScale = this.options.maxScale || 3;

            let isDragging = false;
            let startX, startY, startTranslateX, startTranslateY;

            const onMouseMove = e => {
                if (!isDragging) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                this.translateX = startTranslateX + dx;
                this.translateY = startTranslateY + dy;
                this.applyTransform();
            };

            const onMouseUp = () => {
                if (!isDragging) return;
                isDragging = false;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            this.container.addEventListener('mousedown', e => {
                e.preventDefault();
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                startTranslateX = this.translateX;
                startTranslateY = this.translateY;
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });

            this.container.addEventListener('wheel', e => {
                e.preventDefault();
                const zoomFactor = 1 - e.deltaY * 0.001;
                this.scale = this.clamp(this.scale * zoomFactor, minScale, maxScale);
                this.applyTransform();
                
                const input = this.wrapper.querySelector('input[type="range"]');
                if (input) {
                    input.value = this.scale;
                }
            });
        }

        prepareImage() {
            const imgW = this.image.naturalWidth;
            const imgH = this.image.naturalHeight;
            const scale = Math.max(this.options.width / imgW, this.options.height / imgH);
            this.image.style.width = imgW * scale + "px";
            this.image.style.height = imgH * scale + "px";

            // Store base dimensions after fitting
            this.baseWidth = parseFloat(this.image.style.width);
            this.baseHeight = parseFloat(this.image.style.height);

            // Center transforms on the element
            this.image.style.transformOrigin = 'center center';

            // start centered
            this.translateX = 0;
            this.translateY = 0;
            this.applyTransform();
        }

        clamp(value, min, max) {
            return Math.max(min, Math.min(max, value));
        }

        applyTransform() {
            // compute current size
            const currentWidth = this.baseWidth * this.scale;
            const currentHeight = this.baseHeight * this.scale;

            // compute rotated bounding box dimensions
            const angleRad = (this.rotation || 0) * Math.PI / 180;
            const cos = Math.abs(Math.cos(angleRad));
            const sin = Math.abs(Math.sin(angleRad));
            const rotWidth = currentWidth * cos + currentHeight * sin;
            const rotHeight = currentWidth * sin + currentHeight * cos;

            // half-difference so that image always covers the centered crop area
            const halfDiffX = (rotWidth - this.options.width) / 2;
            const halfDiffY = (rotHeight - this.options.height) / 2;

            // clamp translation within these rotated bounds
            this.translateX = this.clamp(this.translateX, -halfDiffX, halfDiffX);
            this.translateY = this.clamp(this.translateY, -halfDiffY, halfDiffY);

            this.image.style.transform =
                `translate3d(${this.translateX}px, ${this.translateY}px, 0) ` +
                `rotate(${this.rotation}deg) scale(${this.scale})`;
        }

        crop() {
            const overlay = this.container.querySelector('.ls-image-cropper-overlay');
            const overlayRect = overlay.getBoundingClientRect();
            const imageRect = this.image.getBoundingClientRect();

            const scaleX = this.image.naturalWidth / imageRect.width;
            const scaleY = this.image.naturalHeight / imageRect.height;

            const x = (overlayRect.left - imageRect.left) * scaleX;
            const y = (overlayRect.top - imageRect.top) * scaleY;
            const width = overlayRect.width * scaleX;
            const height = overlayRect.height * scaleY;

            // decide export size: original cropped resolution or target options width/height
            const destWidth = this.options.inheritResolution ? width : this.options.finalWidth || this.options.width;
            const destHeight = this.options.inheritResolution ? height : this.options.finalHeight || this.options.height;

            // draw into canvas at desired resolution with rotation
            const canvas = document.createElement('canvas');
            canvas.width = destWidth;
            canvas.height = destHeight;
            const ctx = canvas.getContext('2d');

            const angle = (this.rotation || 0) * Math.PI / 180;
            ctx.save();
            ctx.translate(destWidth / 2, destHeight / 2);
            ctx.rotate(angle);
            ctx.drawImage(
                this.image,
                x, y, width, height,
                -destWidth / 2, -destHeight / 2, destWidth, destHeight
            );
            ctx.restore();

            canvas.toBlob(blob => {
                if (typeof this.options.onResult === 'function') {
                    this.options.onResult(blob);
                }
            }, 'image/png');
        }

        changeRotation(delta) {
            this.rotation = (this.rotation + delta) % 360;
            this.applyTransform();
        }

        destroy() {
            if (this.image) {
                this.image.onload = null;
                this.image.onerror = null;
                this.image = null;
            }
            if (this.container) {
                this.container.remove();
                this.container = null;
            }
            this.flush();
        }
    }, { name: "ImageCropper", global: true });
})();
