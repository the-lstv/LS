/**
 * ImageCropper Component for LS
 * Provides an interactive image/video cropping tool with support for animated sources.
 * @version 1.0.1
 */

class ImageCropper extends LS.Component {
    static { LS.register(this, { name: "ImageCropper", global: true }) }

    DEFAULTS = LS.Util.staticDefaults({
        width: 100,
        height: 100,
        styled: true,
        inheritResolution: false,
        animated: false,

        shape: "rect", // "rect" | "circle"
        rotation: 0,

        minScale: 1,
        maxScale: 3,
        initialScale: 1,

        finalWidth: null,
        finalHeight: null,

        outputType: "image/webp",
        outputQuality: 0.92,

        animatedOutputType: null,
        animatedFps: 30,
        videoBitsPerSecond: 1_500_000,
        maxAnimatedLength: 30,

        background: null,
        createURL: false,
        crossOrigin: null,

        // Prevent huge canvases from killing the tab
        maxOutputPixels: 16_777_216 // 4096 * 4096
    });

    constructor(source, options = {}) {
        super();

        this.options = this.constructor.DEFAULTS(options);

        this._validateOptions();

        this._cleanup = [];
        this._ownedSourceURLs = new Set();
        this._ownedResultURLs = new Set();
        this._renderRAF = 0;
        this._processToken = 0;
        this._destroyed = false;

        this.processing = false;
        this.isReady = false;

        this.rotation = this._normalizeRotation(this.options.rotation || 0);
        this.translateX = 0;
        this.translateY = 0;
        this.scale = Number(this.options.initialScale || 1);

        this._sourceInfo = this._normalizeSource(source);
        this.originalFile = this._sourceInfo.file || null;
        this.isAnimatedSource = !!(this._sourceInfo.isVideo || this._sourceInfo.isGif);

        this.image = this._sourceInfo.element;
        this.image.draggable = false;
        this.image.classList.add("ls-image-cropper-image");
        this.image.style.transformOrigin = "center center";
        this.image.style.willChange = "transform";
        this.image.style.userSelect = "none";
        this.image.style.pointerEvents = "none";
        this.image.style.minWidth = `${this.options.width}px`;
        this.image.style.minHeight = `${this.options.height}px`;

        if (this.image instanceof HTMLVideoElement) {
            this.image.muted = true;
            this.image.loop = true;
            this.image.playsInline = true;
        }

        this.overlay = LS.Create({
            class: "ls-image-cropper-overlay",
            style: {
                width: `${this.options.width}px`,
                height: `${this.options.height}px`,
                borderRadius: this.options.shape === "circle" ? "50%" : "0"
            }
        });

        this.container = LS.Create({
            class: "ls-image-cropper",
            inner: [this.image, this.overlay]
        });

        this.scaleInput = LS.Create("ls-range", {
            step: 0.01,
            oninput: (e) => {
                this.setScale(parseFloat(e.target.value));
            }
        });

        this.rotateButton = LS.Create("button", {
            class: "clear square",
            inner: LS.Create("i", { class: "bi-arrow-clockwise" }),
            onclick: () => this.changeRotation(90)
        });

        this.controls = LS.Create({
            class: "ls-image-cropper-controls",
            inner: [this.scaleInput, this.rotateButton]
        });

        this.wrapper = LS.Create({
            class: "ls-image-cropper-wrapper",
            inner: [this.container, this.controls]
        });

        this.wrapper.style.position = "relative";

        this.processingText = LS.Create("div", {
            class: "processing-text",
            textContent: "Processing, please wait..."
        });

        this.processingProgress = LS.Create("progress", {
            class: "processing-progress",
            max: 100,
            value: 0
        });

        this.processingOverlay = LS.Create("div", {
            class: "ls-image-cropper-processing",
            style: { display: "none" },
            inner: [this.processingText, this.processingProgress]
        });

        this.wrapper.appendChild(this.processingOverlay);

        if (this.options.styled !== false) {
            this.container.classList.add("ls-image-cropper-styled");
        }

        if (this.isAnimatedSource) {
            this.wrapper.classList.add("ls-image-cropper-animated");
        }

        this._bindMediaEvents();
        this._bindInteraction();

        this._updateScaleInput();
    }

    _validateOptions() {
        if (this.options.width <= 0 || this.options.height <= 0) {
            throw new Error("Invalid dimensions for ImageCropper: width and height must be positive numbers.");
        }

        if (this.options.minScale <= 0 || this.options.maxScale <= 0) {
            throw new Error("minScale and maxScale must be positive.");
        }

        if (this.options.maxScale < this.options.minScale) {
            this.options.maxScale = this.options.minScale;
        }
    }

    _normalizeSource(source) {
        const info = {
            file: source instanceof File ? source : null,
            url: "",
            element: null,
            isVideo: false,
            isGif: false
        };

        if (source instanceof File) {
            info.url = URL.createObjectURL(source);
            this._ownedSourceURLs.add(info.url);
        } else if (typeof source === "string") {
            info.url = source;
        } else if (source instanceof HTMLImageElement || source instanceof HTMLVideoElement) {
            info.url = source.currentSrc || source.src || "";
        } else {
            throw new TypeError("ImageCropper source must be a File, URL string, HTMLImageElement, or HTMLVideoElement.");
        }

        const mime = (info.file?.type || "").toLowerCase();
        const fileName = (info.file?.name || "").toLowerCase();
        const sniff = `${String(info.url || "").toLowerCase()} ${fileName}`;

        info.isVideo =
            source instanceof HTMLVideoElement ||
            mime.startsWith("video/") ||
            /\.(mp4|webm|m4v|mov|ogv|ogg|mkv)(?=$|[?#\s])/i.test(sniff);

        info.isGif =
            !info.isVideo &&
            (mime === "image/gif" || /\.gif(?=$|[?#\s])/i.test(sniff));

        if (source instanceof HTMLImageElement || source instanceof HTMLVideoElement) {
            info.element = source;
        } else if (info.isVideo) {
            const video = document.createElement("video");
            if (this.options.crossOrigin) video.crossOrigin = this.options.crossOrigin;
            video.preload = "metadata";
            video.muted = true;
            video.loop = true;
            video.playsInline = true;
            video.src = info.url;
            info.element = video;
        } else {
            const img = new Image();
            if (this.options.crossOrigin) img.crossOrigin = this.options.crossOrigin;
            img.src = info.url;
            info.element = img;
        }

        return info;
    }

    _bindMediaEvents() {
        this._on(this.image, "error", (e) => this._emitError(e));

        if (this.image instanceof HTMLVideoElement) {
            if (this.image.readyState >= 1 && this.image.videoWidth > 0) {
                this.prepareImage();
            } else {
                this._once(this.image, "loadedmetadata", () => this.prepareImage());
            }

            this._once(this.image, "loadeddata", () => this._tryAutoPlayPreview());
            this._tryAutoPlayPreview();
        } else {
            if (this.image.complete && this.image.naturalWidth > 0) {
                this.prepareImage();
            } else {
                this._once(this.image, "load", () => this.prepareImage());
            }
        }
    }

    _bindInteraction() {
        this.container.style.touchAction = "none";

        let drag = null;

        this._on(this.container, "pointerdown", (e) => {
            if (!this.isReady || this.processing) return;
            if (e.button !== undefined && e.button !== 0) return;

            e.preventDefault();

            drag = {
                id: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                startTX: this.translateX,
                startTY: this.translateY
            };

            this.container.setPointerCapture?.(e.pointerId);
        });

        this._on(this.container, "pointermove", (e) => {
            if (!drag || e.pointerId !== drag.id || !this.isReady) return;

            const targetX = drag.startTX + (e.clientX - drag.startX);
            const targetY = drag.startTY + (e.clientY - drag.startY);
            const constrained = this._constrainTranslation(targetX, targetY, drag.startTX, drag.startTY);

            this.translateX = constrained.x;
            this.translateY = constrained.y;
            this._scheduleRender();
        });

        const endDrag = (e) => {
            if (!drag) return;
            if (e.pointerId != null && e.pointerId !== drag.id) return;

            try {
                this.container.releasePointerCapture?.(drag.id);
            } catch (_) {}

            drag = null;
        };

        this._on(this.container, "pointerup", endDrag);
        this._on(this.container, "pointercancel", endDrag);

        this._on(this.container, "wheel", (e) => {
            if (!this.isReady) return;

            e.preventDefault();

            const point = this._pointToCropSpace(e.clientX, e.clientY);
            const factor = Math.exp(-e.deltaY * 0.0015);
            this.setScale(this.scale * factor, point);
        }, { passive: false });
    }

    prepareImage() {
        const mediaW = this._mediaWidth(this.image);
        const mediaH = this._mediaHeight(this.image);

        if (!mediaW || !mediaH) return;

        this.fitScale = Math.max(this.options.width / mediaW, this.options.height / mediaH);
        this.baseWidth = mediaW * this.fitScale;
        this.baseHeight = mediaH * this.fitScale;

        this.image.style.width = `${this.baseWidth}px`;
        this.image.style.height = `${this.baseHeight}px`;

        this.isReady = true;
        this.reset(false);

        if (typeof this.options.onReady === "function") {
            this.options.onReady(this);
        }
    }

    reset(includeRotation = true) {
        if (!this.isReady) return;

        if (includeRotation) {
            this.rotation = this._normalizeRotation(this.options.rotation || 0);
        }

        this.translateX = 0;
        this.translateY = 0;

        const bounds = this._getScaleBounds();
        this.scale = this._clamp(
            Number(this.options.initialScale || 1),
            bounds.min,
            bounds.max
        );

        this._updateScaleInput();
        this._scheduleRender();
    }

    setScale(value, anchorPoint = { x: 0, y: 0 }) {
        if (!this.isReady) return;

        const prevScale = this.scale;
        const bounds = this._getScaleBounds();
        const nextScale = this._clamp(Number(value), bounds.min, bounds.max);

        if (!Number.isFinite(nextScale)) return;
        if (Math.abs(nextScale - prevScale) < 0.0001) {
            this._updateScaleInput();
            return;
        }

        const local = this._inverseTransformPoint(
            anchorPoint.x,
            anchorPoint.y,
            this.translateX,
            this.translateY,
            prevScale,
            this.rotation
        );

        const anchored = this._forwardTransformPoint(
            local.x,
            local.y,
            0,
            0,
            nextScale,
            this.rotation
        );

        this.scale = nextScale;

        let targetX = anchorPoint.x - anchored.x;
        let targetY = anchorPoint.y - anchored.y;

        const fallback = this._isCropCovered(this.translateX, this.translateY, this.scale, this.rotation)
            ? { x: this.translateX, y: this.translateY }
            : { x: 0, y: 0 };

        const constrained = this._constrainTranslation(targetX, targetY, fallback.x, fallback.y);

        this.translateX = constrained.x;
        this.translateY = constrained.y;

        this._updateScaleInput();
        this._scheduleRender();
    }

    applyTransform() {
        if (!this.isReady) return;

        const bounds = this._getScaleBounds();
        this.scale = this._clamp(this.scale, bounds.min, bounds.max);

        const constrained = this._constrainTranslation(this.translateX, this.translateY, 0, 0);
        this.translateX = constrained.x;
        this.translateY = constrained.y;

        this._updateScaleInput();
        this._scheduleRender();
    }

    changeRotation(delta) {
        if (!this.isReady) return;

        this.rotation = this._normalizeRotation(this.rotation + delta);

        const bounds = this._getScaleBounds();
        this.scale = this._clamp(this.scale, bounds.min, bounds.max);

        const constrained = this._constrainTranslation(this.translateX, this.translateY, 0, 0);
        this.translateX = constrained.x;
        this.translateY = constrained.y;

        this._updateScaleInput();
        this._scheduleRender();
    }

    _scheduleRender() {
        if (this._renderRAF) return;

        this._renderRAF = requestAnimationFrame(() => {
            this._renderRAF = 0;
            if (!this.image) return;

            this.image.style.transform =
                `translate3d(${this.translateX}px, ${this.translateY}px, 0) ` +
                `rotate(${this.rotation}deg) ` +
                `scale(${this.scale})`;
        });
    }

    _getScaleBounds(rotation = this.rotation) {
        const min = this._getDynamicMinScale(rotation);
        const max = Math.max(Number(this.options.maxScale || 3), min);
        return { min, max };
    }

    _getDynamicMinScale(rotation = this.rotation) {
        if (!this.baseWidth || !this.baseHeight) {
            return Number(this.options.minScale || 1);
        }

        const angle = rotation * Math.PI / 180;
        const cos = Math.abs(Math.cos(angle));
        const sin = Math.abs(Math.sin(angle));

        const requiredX = (this.options.width * cos + this.options.height * sin) / this.baseWidth;
        const requiredY = (this.options.width * sin + this.options.height * cos) / this.baseHeight;

        return Math.max(Number(this.options.minScale || 1), requiredX, requiredY);
    }

    _isCropCovered(tx, ty, scale = this.scale, rotation = this.rotation) {
        if (!this.baseWidth || !this.baseHeight) return false;

        const hw = this.options.width / 2;
        const hh = this.options.height / 2;
        const corners = [
            [-hw, -hh],
            [ hw, -hh],
            [ hw,  hh],
            [-hw,  hh]
        ];

        const halfW = this.baseWidth / 2;
        const halfH = this.baseHeight / 2;

        for (const [x, y] of corners) {
            const local = this._inverseTransformPoint(x, y, tx, ty, scale, rotation);

            if (Math.abs(local.x) > halfW + 0.01 || Math.abs(local.y) > halfH + 0.01) {
                return false;
            }
        }

        return true;
    }

    _constrainTranslation(targetX, targetY, fallbackX = 0, fallbackY = 0) {
        if (this._isCropCovered(targetX, targetY, this.scale, this.rotation)) {
            return { x: targetX, y: targetY };
        }

        if (!this._isCropCovered(fallbackX, fallbackY, this.scale, this.rotation)) {
            fallbackX = 0;
            fallbackY = 0;
        }

        let lo = 0;
        let hi = 1;

        for (let i = 0; i < 18; i++) {
            const mid = (lo + hi) / 2;
            const x = fallbackX + (targetX - fallbackX) * mid;
            const y = fallbackY + (targetY - fallbackY) * mid;

            if (this._isCropCovered(x, y, this.scale, this.rotation)) {
                lo = mid;
            } else {
                hi = mid;
            }
        }

        return {
            x: fallbackX + (targetX - fallbackX) * lo,
            y: fallbackY + (targetY - fallbackY) * lo
        };
    }

    _forwardTransformPoint(x, y, tx = 0, ty = 0, scale = this.scale, rotation = this.rotation) {
        const angle = rotation * Math.PI / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        return {
            x: tx + (x * cos - y * sin) * scale,
            y: ty + (x * sin + y * cos) * scale
        };
    }

    _inverseTransformPoint(x, y, tx = this.translateX, ty = this.translateY, scale = this.scale, rotation = this.rotation) {
        const angle = rotation * Math.PI / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const dx = x - tx;
        const dy = y - ty;

        return {
            x: (dx * cos + dy * sin) / scale,
            y: (-dx * sin + dy * cos) / scale
        };
    }

    _pointToCropSpace(clientX, clientY) {
        const rect = this.overlay.getBoundingClientRect();
        return {
            x: clientX - (rect.left + rect.width / 2),
            y: clientY - (rect.top + rect.height / 2)
        };
    }

    _mediaWidth(media = this.image) {
        return media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
    }

    _mediaHeight(media = this.image) {
        return media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
    }

    _renderCurrentFrameToCanvas(ctx, media, destWidth, destHeight) {
        ctx.clearRect(0, 0, destWidth, destHeight);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        ctx.save();

        if (this.options.shape === "circle") {
            ctx.beginPath();
            ctx.ellipse(destWidth / 2, destHeight / 2, destWidth / 2, destHeight / 2, 0, 0, Math.PI * 2);
            ctx.clip();
        }

        if (this.options.background) {
            ctx.fillStyle = this.options.background;
            ctx.fillRect(0, 0, destWidth, destHeight);
        }

        const scaleX = destWidth / this.options.width;
        const scaleY = destHeight / this.options.height;
        const drawW = this.baseWidth * scaleX;
        const drawH = this.baseHeight * scaleY;

        ctx.translate(
            destWidth / 2 + this.translateX * scaleX,
            destHeight / 2 + this.translateY * scaleY
        );
        ctx.rotate(this.rotation * Math.PI / 180);
        ctx.scale(this.scale, this.scale);

        ctx.drawImage(media, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
    }

    _getOutputSize() {
        let width;
        let height;

        if (this.options.inheritResolution) {
            const effectiveScale = (this.fitScale || 1) * this.scale;
            width = Math.max(1, Math.round(this.options.width / effectiveScale));
            height = Math.max(1, Math.round(this.options.height / effectiveScale));
        } else {
            const aspect = this.options.height / this.options.width;

            if (this.options.finalWidth && this.options.finalHeight) {
                width = this.options.finalWidth;
                height = this.options.finalHeight;
            } else if (this.options.finalWidth) {
                width = this.options.finalWidth;
                height = Math.round(width * aspect);
            } else if (this.options.finalHeight) {
                height = this.options.finalHeight;
                width = Math.round(height / aspect);
            } else {
                width = this.options.width;
                height = this.options.height;
            }
        }

        return this._limitOutputSize(width, height);
    }

    _limitOutputSize(width, height) {
        width = Math.max(1, Math.round(width));
        height = Math.max(1, Math.round(height));

        const maxPixels = Number(this.options.maxOutputPixels || 0);
        if (!maxPixels || width * height <= maxPixels) {
            return { width, height };
        }

        const ratio = Math.sqrt(maxPixels / (width * height));
        return {
            width: Math.max(1, Math.floor(width * ratio)),
            height: Math.max(1, Math.floor(height * ratio))
        };
    }

    async crop() {
        if (this.processing) return null;
        if (!this.isReady) throw new Error("ImageCropper source is not ready yet.");

        if (this.options.animated && this.isAnimatedSource) {
            return this.cropAnimated();
        }

        try {
            const { width, height } = this._getOutputSize();
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext("2d", {
                alpha: true,
                desynchronized: true
            });

            this._renderCurrentFrameToCanvas(ctx, this.image, width, height);

            const blob = await this._canvasToBlob(
                canvas,
                this.options.outputType || "image/webp",
                this.options.outputQuality
            );

            const result = this._getResult(blob, {
                animated: false,
                width,
                height
            });

            if (typeof this.options.onResult === "function") {
                this.options.onResult(result);
            }

            return result;
        } catch (e) {
            this._emitError(e);
            throw e;
        }
    }

    async cropAnimated() {
        if (this.processing) return null;
        if (!this.isReady) throw new Error("ImageCropper source is not ready yet.");
        if (!this.isAnimatedSource) return this.crop();

        const token = ++this._processToken;
        this.processing = true;
        this._setProcessing(true, "Processing, please wait...");

        try {
            let result;

            if (this._sourceInfo.isGif) {
                result = await this._cropAnimatedGif(token);
            } else {
                result = await this._cropAnimatedVideo(token);
            }

            if (typeof this.options.onResult === "function") {
                this.options.onResult(result);
            }

            return result;
        } catch (e) {
            this._emitError(e);
            throw e;
        } finally {
            if (token === this._processToken) {
                this.processing = false;
                this._setProcessing(false);
            }
        }
    }

    async _cropAnimatedVideo(token) {
        if (!window.MediaRecorder) {
            throw new Error("MediaRecorder is not supported in this browser.");
        }

        const { width, height } = this._getOutputSize();
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d", {
            alpha: true,
            desynchronized: true
        });

        const mimeType = this._pickAnimatedMimeType();
        const fps = Math.max(1, Math.min(60, Number(this.options.animatedFps || 30)));
        const stream = canvas.captureStream(fps);

        const recorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: Number(this.options.videoBitsPerSecond || 1_500_000)
        });

        const chunks = [];
        const blobPromise = new Promise((resolve, reject) => {
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size) chunks.push(e.data);
            };
            recorder.onerror = (e) => reject(e.error || e);
            recorder.onstop = () => {
                resolve(new Blob(chunks, { type: mimeType.split(";")[0] || "video/webm" }));
            };
        });

        const media = await this._createExportVideoElement();
        const duration = Math.min(
            Number(this.options.maxAnimatedLength || 30),
            Number.isFinite(media.duration) && media.duration > 0
                ? media.duration
                : Number(this.options.maxAnimatedLength || 30)
        );

        if (media.readyState < 2) {
            await this._waitFor(media, "loadeddata");
        }

        if (media.currentTime !== 0) {
            media.currentTime = 0;
            try { await this._waitFor(media, "seeked"); } catch (_) {}
        }

        this._ensureToken(token);
        this.processingProgress.value = 0;

        this._renderCurrentFrameToCanvas(ctx, media, width, height);
        recorder.start(250);

        let raf = 0;
        let stopped = false;

        const stop = () => {
            if (stopped) return;
            stopped = true;
            cancelAnimationFrame(raf);
            try { media.pause(); } catch (_) {}
            if (recorder.state !== "inactive") recorder.stop();
        };

        try {
            await media.play().catch(() => {});

            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    stop();
                    resolve();
                }, duration * 1000 + 500);

                const step = () => {
                    try {
                        this._ensureToken(token);

                        this._renderCurrentFrameToCanvas(ctx, media, width, height);
                        this.processingProgress.value = Math.min((media.currentTime / duration) * 100, 100);

                        if (media.ended || media.currentTime >= duration) {
                            clearTimeout(timeout);
                            stop();
                            resolve();
                            return;
                        }

                        raf = requestAnimationFrame(step);
                    } catch (e) {
                        clearTimeout(timeout);
                        stop();
                        reject(e);
                    }
                };

                raf = requestAnimationFrame(step);
            });

            const blob = await blobPromise;

            return this._getResult(blob, {
                animated: true,
                width,
                height
            });
        } finally {
            try {
                media.pause();
                media.removeAttribute("src");
                media.load();
            } catch (_) {}
        }
    }

    async _cropAnimatedGif(token) {
        if (!window.omggif?.GifReader) {
            throw new Error("Animated GIF cropping requires window.omggif.GifReader.");
        }

        if (!window.MediaRecorder) {
            throw new Error("MediaRecorder is not supported in this browser.");
        }

        const arrayBuffer = await this._getGifArrayBuffer();
        this._ensureToken(token);

        const reader = new window.omggif.GifReader(new Uint8Array(arrayBuffer));
        const totalFrames = reader.numFrames();
        const maxMs = Number(this.options.maxAnimatedLength || 30) * 1000;

        let framesToEncode = totalFrames;
        let totalMs = 0;

        for (let i = 0; i < totalFrames; i++) {
            totalMs += this._gifDelayMs(reader.frameInfo(i));
            if (totalMs >= maxMs) {
                framesToEncode = i + 1;
                totalMs = maxMs;
                break;
            }
        }

        totalMs = Math.max(totalMs, 1);

        const fullCanvas = document.createElement("canvas");
        fullCanvas.width = reader.width;
        fullCanvas.height = reader.height;

        const fullCtx = fullCanvas.getContext("2d", {
            alpha: true,
            willReadFrequently: true
        });

        const fullImageData = fullCtx.createImageData(reader.width, reader.height);
        const composite = fullImageData.data;

        const { width, height } = this._getOutputSize();

        const outCanvas = document.createElement("canvas");
        outCanvas.width = width;
        outCanvas.height = height;

        const outCtx = outCanvas.getContext("2d", {
            alpha: true,
            desynchronized: true
        });

        const mimeType = this._pickAnimatedMimeType();
        const fps = Math.max(1, Math.min(60, Number(this.options.animatedFps || 30)));
        const recorder = new MediaRecorder(outCanvas.captureStream(fps), {
            mimeType,
            videoBitsPerSecond: Number(this.options.videoBitsPerSecond || 1_500_000)
        });

        const chunks = [];
        const blobPromise = new Promise((resolve, reject) => {
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size) chunks.push(e.data);
            };
            recorder.onerror = (e) => reject(e.error || e);
            recorder.onstop = () => {
                resolve(new Blob(chunks, { type: mimeType.split(";")[0] || "video/webm" }));
            };
        });

        let prevInfo = null;
        let restoreBuffer = null;
        let elapsedMs = 0;

        this.processingProgress.value = 0;
        recorder.start(250);

        for (let i = 0; i < framesToEncode; i++) {
            this._ensureToken(token);

            if (prevInfo) {
                this._applyGifDisposal(composite, reader.width, prevInfo, restoreBuffer);
                if (prevInfo.disposal === 3) {
                    restoreBuffer = null;
                }
            }

            const info = reader.frameInfo(i);

            if (info.disposal === 3) {
                if (!restoreBuffer || restoreBuffer.length !== composite.length) {
                    restoreBuffer = new Uint8ClampedArray(composite.length);
                }
                restoreBuffer.set(composite);
            }

            reader.decodeAndBlitFrameRGBA(i, composite);
            fullCtx.putImageData(fullImageData, 0, 0);
            this._renderCurrentFrameToCanvas(outCtx, fullCanvas, width, height);

            const delayMs = this._gifDelayMs(info);
            elapsedMs = Math.min(totalMs, elapsedMs + delayMs);
            this.processingProgress.value = (elapsedMs / totalMs) * 100;

            prevInfo = info;

            await this._delay(delayMs);
            if ((i & 3) === 3) {
                await this._yieldToUI();
            }
        }

        if (recorder.state !== "inactive") {
            recorder.stop();
        }

        const blob = await blobPromise;

        return this._getResult(blob, {
            animated: true,
            width,
            height
        });
    }

    _applyGifDisposal(buffer, canvasWidth, info, restoreBuffer) {
        if (!info) return;

        if (info.disposal === 2) {
            const startX = info.x;
            const endX = info.x + info.width;

            for (let y = info.y; y < info.y + info.height; y++) {
                const start = (y * canvasWidth + startX) * 4;
                const end = (y * canvasWidth + endX) * 4;
                buffer.fill(0, start, end);
            }
        } else if (info.disposal === 3 && restoreBuffer) {
            buffer.set(restoreBuffer);
        }
    }

    _gifDelayMs(info) {
        return Math.max(20, ((info?.delay || 10) * 10));
    }

    async _getGifArrayBuffer() {
        if (this.originalFile instanceof File) {
            return this.originalFile.arrayBuffer();
        }

        if (this._sourceInfo.url) {
            const res = await fetch(this._sourceInfo.url, {
                mode: this.options.crossOrigin ? "cors" : "same-origin"
            });

            if (!res.ok) {
                throw new Error(`Failed to fetch GIF source: ${res.status} ${res.statusText}`);
            }

            return res.arrayBuffer();
        }

        throw new Error("GIF export requires a File or fetchable URL.");
    }

    async _createExportVideoElement() {
        const video = document.createElement("video");
        if (this.options.crossOrigin) video.crossOrigin = this.options.crossOrigin;
        video.preload = "auto";
        video.muted = true;
        video.playsInline = true;
        video.src = this._sourceInfo.url;

        if (video.readyState >= 1 && video.videoWidth > 0) {
            return video;
        }

        await this._waitFor(video, "loadedmetadata");
        return video;
    }

    _pickAnimatedMimeType() {
        const preferred = [
            this.options.animatedOutputType,
            "video/webm;codecs=vp9",
            "video/webm;codecs=vp8",
            "video/webm"
        ].filter(Boolean);

        for (const type of preferred) {
            if (!window.MediaRecorder?.isTypeSupported || MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }

        return "video/webm";
    }

    _updateScaleInput() {
        if (!this.scaleInput) return;
        const bounds = this._getScaleBounds();
        this.scaleInput.min = String(bounds.min);
        this.scaleInput.max = String(bounds.max);
        this.scaleInput.value = String(this._clamp(this.scale, bounds.min, bounds.max));
    }

    _normalizeRotation(value) {
        return ((value % 360) + 360) % 360;
    }

    _clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    _setProcessing(active, text = "Processing, please wait...") {
        if (!this.processingOverlay) return;
        this.processingOverlay.style.display = active ? "flex" : "none";
        this.processingText.textContent = text;
        this.processingProgress.value = 0;
    }

    _ensureToken(token) {
        if (this._destroyed || token !== this._processToken) {
            throw new DOMException("Operation aborted", "AbortError");
        }
    }

    _tryAutoPlayPreview() {
        if (!(this.image instanceof HTMLVideoElement)) return;
        const p = this.image.play?.();
        if (p && typeof p.catch === "function") {
            p.catch(() => {});
        }
    }

    _canvasToBlob(canvas, type, quality) {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error("Failed to export canvas. The canvas may be tainted or the format may be unsupported."));
                    return;
                }
                resolve(blob);
            }, type, quality);
        });
    }

    _waitFor(target, eventName, errorName = "error") {
        return new Promise((resolve, reject) => {
            const onEvent = () => {
                cleanup();
                resolve();
            };

            const onError = (e) => {
                cleanup();
                reject(e?.error || e);
            };

            const cleanup = () => {
                target.removeEventListener(eventName, onEvent);
                target.removeEventListener(errorName, onError);
            };

            target.addEventListener(eventName, onEvent, { once: true });
            target.addEventListener(errorName, onError, { once: true });
        });
    }

    _delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    _yieldToUI() {
        return new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }

    _getResult(blob, meta = {}) {
        const result = {
            blob,
            type: blob.type,
            animated: !!meta.animated,
            width: meta.width,
            height: meta.height
        };

        if (this.options.createURL) {
            const url = URL.createObjectURL(blob);
            this._ownedResultURLs.add(url);
            result.url = url;
            result.revoke = () => {
                if (this._ownedResultURLs.delete(url)) {
                    URL.revokeObjectURL(url);
                }
            };
        }

        return result;
    }

    _emitError(error) {
        if (typeof this.options.onError === "function") {
            this.options.onError(error);
        } else {
            console.error(error);
        }
    }

    _on(target, type, handler, options) {
        target.addEventListener(type, handler, options);
        this._cleanup.push(() => target.removeEventListener(type, handler, options));
        return handler;
    }

    _once(target, type, handler, options) {
        const wrapped = (...args) => {
            target.removeEventListener(type, wrapped, options);
            handler(...args);
        };

        target.addEventListener(type, wrapped, options);
        this._cleanup.push(() => target.removeEventListener(type, wrapped, options));
        return wrapped;
    }

    destroy() {
        this._destroyed = true;
        this._processToken++;
        this.processing = false;

        this._setProcessing(false);

        if (this._renderRAF) {
            cancelAnimationFrame(this._renderRAF);
            this._renderRAF = 0;
        }

        for (const dispose of this._cleanup.splice(0)) {
            try { dispose(); } catch (_) {}
        }

        if (this.image instanceof HTMLVideoElement) {
            try { this.image.pause(); } catch (_) {}
        }

        if (this.wrapper) {
            this.wrapper.remove();
        }

        for (const url of this._ownedResultURLs) {
            try { URL.revokeObjectURL(url); } catch (_) {}
        }
        this._ownedResultURLs.clear();

        for (const url of this._ownedSourceURLs) {
            try { URL.revokeObjectURL(url); } catch (_) {}
        }
        this._ownedSourceURLs.clear();

        this.image = null;
        this.overlay = null;
        this.container = null;
        this.controls = null;
        this.wrapper = null;
        this.scaleInput = null;
        this.rotateButton = null;
        this.processingOverlay = null;
        this.processingText = null;
        this.processingProgress = null;

        this.flush();
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = ImageCropper;
}


// GIF Encoder
(() => {
    // (c) Dean McNamee <dean@gmail.com>, 2013.
    //
    // https://github.com/deanm/omggif
    //
    // Permission is hereby granted, free of charge, to any person obtaining a copy
    // of this software and associated documentation files (the "Software"), to
    // deal in the Software without restriction, including without limitation the
    // rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
    // sell copies of the Software, and to permit persons to whom the Software is
    // furnished to do so, subject to the following conditions:
    //
    // The above copyright notice and this permission notice shall be included in
    // all copies or substantial portions of the Software.
    //
    // THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    // IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    // FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    // AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    // LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
    // FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
    // IN THE SOFTWARE.
    //
    // omggif is a JavaScript implementation of a GIF 89a encoder and decoder,
    // including animation and compression.  It does not rely on any specific
    // underlying system, so should run in the browser, Node, or Plask.

    "use strict";

    function GifWriter(buf, width, height, gopts) {
        var p = 0;

        var gopts = gopts === undefined ? {} : gopts;
        var loop_count = gopts.loop === undefined ? null : gopts.loop;
        var global_palette = gopts.palette === undefined ? null : gopts.palette;

        if (width <= 0 || height <= 0 || width > 65535 || height > 65535)
            throw new Error("Width/Height invalid.");

        function check_palette_and_num_colors(palette) {
            var num_colors = palette.length;
            if (num_colors < 2 || num_colors > 256 || num_colors & (num_colors - 1)) {
                throw new Error(
                    "Invalid code/color length, must be power of 2 and 2 .. 256.");
            }
            return num_colors;
        }

        // - Header.
        buf[p++] = 0x47; buf[p++] = 0x49; buf[p++] = 0x46;  // GIF
        buf[p++] = 0x38; buf[p++] = 0x39; buf[p++] = 0x61;  // 89a

        // Handling of Global Color Table (palette) and background index.
        var gp_num_colors_pow2 = 0;
        var background = 0;
        if (global_palette !== null) {
            var gp_num_colors = check_palette_and_num_colors(global_palette);
            while (gp_num_colors >>= 1) ++gp_num_colors_pow2;
            gp_num_colors = 1 << gp_num_colors_pow2;
            --gp_num_colors_pow2;
            if (gopts.background !== undefined) {
                background = gopts.background;
                if (background >= gp_num_colors)
                    throw new Error("Background index out of range.");
                // The GIF spec states that a background index of 0 should be ignored, so
                // this is probably a mistake and you really want to set it to another
                // slot in the palette.  But actually in the end most browsers, etc end
                // up ignoring this almost completely (including for dispose background).
                if (background === 0)
                    throw new Error("Background index explicitly passed as 0.");
            }
        }

        // - Logical Screen Descriptor.
        // NOTE(deanm): w/h apparently ignored by implementations, but set anyway.
        buf[p++] = width & 0xff; buf[p++] = width >> 8 & 0xff;
        buf[p++] = height & 0xff; buf[p++] = height >> 8 & 0xff;
        // NOTE: Indicates 0-bpp original color resolution (unused?).
        buf[p++] = (global_palette !== null ? 0x80 : 0) |  // Global Color Table Flag.
            gp_num_colors_pow2;  // NOTE: No sort flag (unused?).
        buf[p++] = background;  // Background Color Index.
        buf[p++] = 0;  // Pixel aspect ratio (unused?).

        // - Global Color Table
        if (global_palette !== null) {
            for (var i = 0, il = global_palette.length; i < il; ++i) {
                var rgb = global_palette[i];
                buf[p++] = rgb >> 16 & 0xff;
                buf[p++] = rgb >> 8 & 0xff;
                buf[p++] = rgb & 0xff;
            }
        }

        if (loop_count !== null) {  // Netscape block for looping.
            if (loop_count < 0 || loop_count > 65535)
                throw new Error("Loop count invalid.");
            // Extension code, label, and length.
            buf[p++] = 0x21; buf[p++] = 0xff; buf[p++] = 0x0b;
            // NETSCAPE2.0
            buf[p++] = 0x4e; buf[p++] = 0x45; buf[p++] = 0x54; buf[p++] = 0x53;
            buf[p++] = 0x43; buf[p++] = 0x41; buf[p++] = 0x50; buf[p++] = 0x45;
            buf[p++] = 0x32; buf[p++] = 0x2e; buf[p++] = 0x30;
            // Sub-block
            buf[p++] = 0x03; buf[p++] = 0x01;
            buf[p++] = loop_count & 0xff; buf[p++] = loop_count >> 8 & 0xff;
            buf[p++] = 0x00;  // Terminator.
        }


        var ended = false;

        this.addFrame = function (x, y, w, h, indexed_pixels, opts) {
            if (ended === true) { --p; ended = false; }  // Un-end.

            opts = opts === undefined ? {} : opts;

            // TODO(deanm): Bounds check x, y.  Do they need to be within the virtual
            // canvas width/height, I imagine?
            if (x < 0 || y < 0 || x > 65535 || y > 65535)
                throw new Error("x/y invalid.");

            if (w <= 0 || h <= 0 || w > 65535 || h > 65535)
                throw new Error("Width/Height invalid.");

            if (indexed_pixels.length < w * h)
                throw new Error("Not enough pixels for the frame size.");

            var using_local_palette = true;
            var palette = opts.palette;
            if (palette === undefined || palette === null) {
                using_local_palette = false;
                palette = global_palette;
            }

            if (palette === undefined || palette === null)
                throw new Error("Must supply either a local or global palette.");

            var num_colors = check_palette_and_num_colors(palette);

            // Compute the min_code_size (power of 2), destroying num_colors.
            var min_code_size = 0;
            while (num_colors >>= 1) ++min_code_size;
            num_colors = 1 << min_code_size;  // Now we can easily get it back.

            var delay = opts.delay === undefined ? 0 : opts.delay;

            // From the spec:
            //     0 -   No disposal specified. The decoder is
            //           not required to take any action.
            //     1 -   Do not dispose. The graphic is to be left
            //           in place.
            //     2 -   Restore to background color. The area used by the
            //           graphic must be restored to the background color.
            //     3 -   Restore to previous. The decoder is required to
            //           restore the area overwritten by the graphic with
            //           what was there prior to rendering the graphic.
            //  4-7 -    To be defined.
            // NOTE(deanm): Dispose background doesn't really work, apparently most
            // browsers ignore the background palette index and clear to transparency.
            var disposal = opts.disposal === undefined ? 0 : opts.disposal;
            if (disposal < 0 || disposal > 3)  // 4-7 is reserved.
                throw new Error("Disposal out of range.");

            var use_transparency = false;
            var transparent_index = 0;
            if (opts.transparent !== undefined && opts.transparent !== null) {
                use_transparency = true;
                transparent_index = opts.transparent;
                if (transparent_index < 0 || transparent_index >= num_colors)
                    throw new Error("Transparent color index.");
            }

            if (disposal !== 0 || use_transparency || delay !== 0) {
                // - Graphics Control Extension
                buf[p++] = 0x21; buf[p++] = 0xf9;  // Extension / Label.
                buf[p++] = 4;  // Byte size.

                buf[p++] = disposal << 2 | (use_transparency === true ? 1 : 0);
                buf[p++] = delay & 0xff; buf[p++] = delay >> 8 & 0xff;
                buf[p++] = transparent_index;  // Transparent color index.
                buf[p++] = 0;  // Block Terminator.
            }

            // - Image Descriptor
            buf[p++] = 0x2c;  // Image Seperator.
            buf[p++] = x & 0xff; buf[p++] = x >> 8 & 0xff;  // Left.
            buf[p++] = y & 0xff; buf[p++] = y >> 8 & 0xff;  // Top.
            buf[p++] = w & 0xff; buf[p++] = w >> 8 & 0xff;
            buf[p++] = h & 0xff; buf[p++] = h >> 8 & 0xff;
            // NOTE: No sort flag (unused?).
            // TODO(deanm): Support interlace.
            buf[p++] = using_local_palette === true ? (0x80 | (min_code_size - 1)) : 0;

            // - Local Color Table
            if (using_local_palette === true) {
                for (var i = 0, il = palette.length; i < il; ++i) {
                    var rgb = palette[i];
                    buf[p++] = rgb >> 16 & 0xff;
                    buf[p++] = rgb >> 8 & 0xff;
                    buf[p++] = rgb & 0xff;
                }
            }

            p = GifWriterOutputLZWCodeStream(
                buf, p, min_code_size < 2 ? 2 : min_code_size, indexed_pixels);

            return p;
        };

        this.end = function () {
            if (ended === false) {
                buf[p++] = 0x3b;  // Trailer.
                ended = true;
            }
            return p;
        };

        this.getOutputBuffer = function () { return buf; };
        this.setOutputBuffer = function (v) { buf = v; };
        this.getOutputBufferPosition = function () { return p; };
        this.setOutputBufferPosition = function (v) { p = v; };
    }

    // Main compression routine, palette indexes -> LZW code stream.
    // |index_stream| must have at least one entry.
    function GifWriterOutputLZWCodeStream(buf, p, min_code_size, index_stream) {
        buf[p++] = min_code_size;
        var cur_subblock = p++;  // Pointing at the length field.

        var clear_code = 1 << min_code_size;
        var code_mask = clear_code - 1;
        var eoi_code = clear_code + 1;
        var next_code = eoi_code + 1;

        var cur_code_size = min_code_size + 1;  // Number of bits per code.
        var cur_shift = 0;
        // We have at most 12-bit codes, so we should have to hold a max of 19
        // bits here (and then we would write out).
        var cur = 0;

        function emit_bytes_to_buffer(bit_block_size) {
            while (cur_shift >= bit_block_size) {
                buf[p++] = cur & 0xff;
                cur >>= 8; cur_shift -= 8;
                if (p === cur_subblock + 256) {  // Finished a subblock.
                    buf[cur_subblock] = 255;
                    cur_subblock = p++;
                }
            }
        }

        function emit_code(c) {
            cur |= c << cur_shift;
            cur_shift += cur_code_size;
            emit_bytes_to_buffer(8);
        }

        // I am not an expert on the topic, and I don't want to write a thesis.
        // However, it is good to outline here the basic algorithm and the few data
        // structures and optimizations here that make this implementation fast.
        // The basic idea behind LZW is to build a table of previously seen runs
        // addressed by a short id (herein called output code).  All data is
        // referenced by a code, which represents one or more values from the
        // original input stream.  All input bytes can be referenced as the same
        // value as an output code.  So if you didn't want any compression, you
        // could more or less just output the original bytes as codes (there are
        // some details to this, but it is the idea).  In order to achieve
        // compression, values greater then the input range (codes can be up to
        // 12-bit while input only 8-bit) represent a sequence of previously seen
        // inputs.  The decompressor is able to build the same mapping while
        // decoding, so there is always a shared common knowledge between the
        // encoding and decoder, which is also important for "timing" aspects like
        // how to handle variable bit width code encoding.
        //
        // One obvious but very important consequence of the table system is there
        // is always a unique id (at most 12-bits) to map the runs.  'A' might be
        // 4, then 'AA' might be 10, 'AAA' 11, 'AAAA' 12, etc.  This relationship
        // can be used for an effecient lookup strategy for the code mapping.  We
        // need to know if a run has been seen before, and be able to map that run
        // to the output code.  Since we start with known unique ids (input bytes),
        // and then from those build more unique ids (table entries), we can
        // continue this chain (almost like a linked list) to always have small
        // integer values that represent the current byte chains in the encoder.
        // This means instead of tracking the input bytes (AAAABCD) to know our
        // current state, we can track the table entry for AAAABC (it is guaranteed
        // to exist by the nature of the algorithm) and the next character D.
        // Therefor the tuple of (table_entry, byte) is guaranteed to be
        // unique.  This allows us to create a simple lookup key for mapping input
        // sequences to codes (table indices) without having to store or search
        // any of the code sequences.  So if 'AAAA' has a table entry of 12, the
        // tuple of ('AAAA', K) for any input byte K will be unique, and can be our
        // key.  This leads to a integer value at most 20-bits, which can always
        // fit in an SMI value and be used as a fast sparse array / object key.

        // Output code for the current contents of the index buffer.
        var ib_code = index_stream[0] & code_mask;  // Load first input index.
        var code_table = {};  // Key'd on our 20-bit "tuple".

        emit_code(clear_code);  // Spec says first code should be a clear code.

        // First index already loaded, process the rest of the stream.
        for (var i = 1, il = index_stream.length; i < il; ++i) {
            var k = index_stream[i] & code_mask;
            var cur_key = ib_code << 8 | k;  // (prev, k) unique tuple.
            var cur_code = code_table[cur_key];  // buffer + k.

            // Check if we have to create a new code table entry.
            if (cur_code === undefined) {  // We don't have buffer + k.
                // Emit index buffer (without k).
                // This is an inline version of emit_code, because this is the core
                // writing routine of the compressor (and V8 cannot inline emit_code
                // because it is a closure here in a different context).  Additionally
                // we can call emit_byte_to_buffer less often, because we can have
                // 30-bits (from our 31-bit signed SMI), and we know our codes will only
                // be 12-bits, so can safely have 18-bits there without overflow.
                // emit_code(ib_code);
                cur |= ib_code << cur_shift;
                cur_shift += cur_code_size;
                while (cur_shift >= 8) {
                    buf[p++] = cur & 0xff;
                    cur >>= 8; cur_shift -= 8;
                    if (p === cur_subblock + 256) {  // Finished a subblock.
                        buf[cur_subblock] = 255;
                        cur_subblock = p++;
                    }
                }

                if (next_code === 4096) {  // Table full, need a clear.
                    emit_code(clear_code);
                    next_code = eoi_code + 1;
                    cur_code_size = min_code_size + 1;
                    code_table = {};
                } else {  // Table not full, insert a new entry.
                    // Increase our variable bit code sizes if necessary.  This is a bit
                    // tricky as it is based on "timing" between the encoding and
                    // decoder.  From the encoders perspective this should happen after
                    // we've already emitted the index buffer and are about to create the
                    // first table entry that would overflow our current code bit size.
                    if (next_code >= (1 << cur_code_size)) ++cur_code_size;
                    code_table[cur_key] = next_code++;  // Insert into code table.
                }

                ib_code = k;  // Index buffer to single input k.
            } else {
                ib_code = cur_code;  // Index buffer to sequence in code table.
            }
        }

        emit_code(ib_code);  // There will still be something in the index buffer.
        emit_code(eoi_code);  // End Of Information.

        // Flush / finalize the sub-blocks stream to the buffer.
        emit_bytes_to_buffer(1);

        // Finish the sub-blocks, writing out any unfinished lengths and
        // terminating with a sub-block of length 0.  If we have already started
        // but not yet used a sub-block it can just become the terminator.
        if (cur_subblock + 1 === p) {  // Started but unused.
            buf[cur_subblock] = 0;
        } else {  // Started and used, write length and additional terminator block.
            buf[cur_subblock] = p - cur_subblock - 1;
            buf[p++] = 0;
        }
        return p;
    }

    function GifReader(buf) {
        var p = 0;

        // - Header (GIF87a or GIF89a).
        if (buf[p++] !== 0x47 || buf[p++] !== 0x49 || buf[p++] !== 0x46 ||
            buf[p++] !== 0x38 || (buf[p++] + 1 & 0xfd) !== 0x38 || buf[p++] !== 0x61) {
            throw new Error("Invalid GIF 87a/89a header.");
        }

        // - Logical Screen Descriptor.
        var width = buf[p++] | buf[p++] << 8;
        var height = buf[p++] | buf[p++] << 8;
        var pf0 = buf[p++];  // <Packed Fields>.
        var global_palette_flag = pf0 >> 7;
        var num_global_colors_pow2 = pf0 & 0x7;
        var num_global_colors = 1 << (num_global_colors_pow2 + 1);
        var background = buf[p++];
        buf[p++];  // Pixel aspect ratio (unused?).

        var global_palette_offset = null;
        var global_palette_size = null;

        if (global_palette_flag) {
            global_palette_offset = p;
            global_palette_size = num_global_colors;
            p += num_global_colors * 3;  // Seek past palette.
        }

        var no_eof = true;

        var frames = [];

        var delay = 0;
        var transparent_index = null;
        var disposal = 0;  // 0 - No disposal specified.
        var loop_count = null;

        this.width = width;
        this.height = height;

        while (no_eof && p < buf.length) {
            switch (buf[p++]) {
                case 0x21:  // Graphics Control Extension Block
                    switch (buf[p++]) {
                        case 0xff:  // Application specific block
                            // Try if it's a Netscape block (with animation loop counter).
                            if (buf[p] !== 0x0b ||  // 21 FF already read, check block size.
                                // NETSCAPE2.0
                                buf[p + 1] == 0x4e && buf[p + 2] == 0x45 && buf[p + 3] == 0x54 &&
                                buf[p + 4] == 0x53 && buf[p + 5] == 0x43 && buf[p + 6] == 0x41 &&
                                buf[p + 7] == 0x50 && buf[p + 8] == 0x45 && buf[p + 9] == 0x32 &&
                                buf[p + 10] == 0x2e && buf[p + 11] == 0x30 &&
                                // Sub-block
                                buf[p + 12] == 0x03 && buf[p + 13] == 0x01 && buf[p + 16] == 0) {
                                p += 14;
                                loop_count = buf[p++] | buf[p++] << 8;
                                p++;  // Skip terminator.
                            } else {  // We don't know what it is, just try to get past it.
                                p += 12;
                                while (true) {  // Seek through subblocks.
                                    var block_size = buf[p++];
                                    // Bad block size (ex: undefined from an out of bounds read).
                                    if (!(block_size >= 0)) throw Error("Invalid block size");
                                    if (block_size === 0) break;  // 0 size is terminator
                                    p += block_size;
                                }
                            }
                            break;

                        case 0xf9:  // Graphics Control Extension
                            if (buf[p++] !== 0x4 || buf[p + 4] !== 0)
                                throw new Error("Invalid graphics extension block.");
                            var pf1 = buf[p++];
                            delay = buf[p++] | buf[p++] << 8;
                            transparent_index = buf[p++];
                            if ((pf1 & 1) === 0) transparent_index = null;
                            disposal = pf1 >> 2 & 0x7;
                            p++;  // Skip terminator.
                            break;

                        // Plain Text Extension could be present and we just want to be able
                        // to parse past it.  It follows the block structure of the comment
                        // extension enough to reuse the path to skip through the blocks.
                        case 0x01:  // Plain Text Extension (fallthrough to Comment Extension)
                        case 0xfe:  // Comment Extension.
                            while (true) {  // Seek through subblocks.
                                var block_size = buf[p++];
                                // Bad block size (ex: undefined from an out of bounds read).
                                if (!(block_size >= 0)) throw Error("Invalid block size");
                                if (block_size === 0) break;  // 0 size is terminator
                                // console.log(buf.slice(p, p+block_size).toString('ascii'));
                                p += block_size;
                            }
                            break;

                        default:
                            throw new Error(
                                "Unknown graphic control label: 0x" + buf[p - 1].toString(16));
                    }
                    break;

                case 0x2c:  // Image Descriptor.
                    var x = buf[p++] | buf[p++] << 8;
                    var y = buf[p++] | buf[p++] << 8;
                    var w = buf[p++] | buf[p++] << 8;
                    var h = buf[p++] | buf[p++] << 8;
                    var pf2 = buf[p++];
                    var local_palette_flag = pf2 >> 7;
                    var interlace_flag = pf2 >> 6 & 1;
                    var num_local_colors_pow2 = pf2 & 0x7;
                    var num_local_colors = 1 << (num_local_colors_pow2 + 1);
                    var palette_offset = global_palette_offset;
                    var palette_size = global_palette_size;
                    var has_local_palette = false;
                    if (local_palette_flag) {
                        var has_local_palette = true;
                        palette_offset = p;  // Override with local palette.
                        palette_size = num_local_colors;
                        p += num_local_colors * 3;  // Seek past palette.
                    }

                    var data_offset = p;

                    p++;  // codesize
                    while (true) {
                        var block_size = buf[p++];
                        // Bad block size (ex: undefined from an out of bounds read).
                        if (!(block_size >= 0)) throw Error("Invalid block size");
                        if (block_size === 0) break;  // 0 size is terminator
                        p += block_size;
                    }

                    frames.push({
                        x: x, y: y, width: w, height: h,
                        has_local_palette: has_local_palette,
                        palette_offset: palette_offset,
                        palette_size: palette_size,
                        data_offset: data_offset,
                        data_length: p - data_offset,
                        transparent_index: transparent_index,
                        interlaced: !!interlace_flag,
                        delay: delay,
                        disposal: disposal
                    });
                    break;

                case 0x3b:  // Trailer Marker (end of file).
                    no_eof = false;
                    break;

                default:
                    throw new Error("Unknown gif block: 0x" + buf[p - 1].toString(16));
                    break;
            }
        }

        this.numFrames = function () {
            return frames.length;
        };

        this.loopCount = function () {
            return loop_count;
        };

        this.frameInfo = function (frame_num) {
            if (frame_num < 0 || frame_num >= frames.length)
                throw new Error("Frame index out of range.");
            return frames[frame_num];
        };

        this.decodeAndBlitFrameBGRA = function (frame_num, pixels) {
            var frame = this.frameInfo(frame_num);
            var num_pixels = frame.width * frame.height;
            var index_stream = new Uint8Array(num_pixels);  // At most 8-bit indices.
            GifReaderLZWOutputIndexStream(
                buf, frame.data_offset, index_stream, num_pixels);
            var palette_offset = frame.palette_offset;

            // NOTE(deanm): It seems to be much faster to compare index to 256 than
            // to === null.  Not sure why, but CompareStub_EQ_STRICT shows up high in
            // the profile, not sure if it's related to using a Uint8Array.
            var trans = frame.transparent_index;
            if (trans === null) trans = 256;

            // We are possibly just blitting to a portion of the entire frame.
            // That is a subrect within the framerect, so the additional pixels
            // must be skipped over after we finished a scanline.
            var framewidth = frame.width;
            var framestride = width - framewidth;
            var xleft = framewidth;  // Number of subrect pixels left in scanline.

            // Output index of the top left corner of the subrect.
            var opbeg = ((frame.y * width) + frame.x) * 4;
            // Output index of what would be the left edge of the subrect, one row
            // below it, i.e. the index at which an interlace pass should wrap.
            var opend = ((frame.y + frame.height) * width + frame.x) * 4;
            var op = opbeg;

            var scanstride = framestride * 4;

            // Use scanstride to skip past the rows when interlacing.  This is skipping
            // 7 rows for the first two passes, then 3 then 1.
            if (frame.interlaced === true) {
                scanstride += width * 4 * 7;  // Pass 1.
            }

            var interlaceskip = 8;  // Tracking the row interval in the current pass.

            for (var i = 0, il = index_stream.length; i < il; ++i) {
                var index = index_stream[i];

                if (xleft === 0) {  // Beginning of new scan line
                    op += scanstride;
                    xleft = framewidth;
                    if (op >= opend) { // Catch the wrap to switch passes when interlacing.
                        scanstride = framestride * 4 + width * 4 * (interlaceskip - 1);
                        // interlaceskip / 2 * 4 is interlaceskip << 1.
                        op = opbeg + (framewidth + framestride) * (interlaceskip << 1);
                        interlaceskip >>= 1;
                    }
                }

                if (index === trans) {
                    op += 4;
                } else {
                    var r = buf[palette_offset + index * 3];
                    var g = buf[palette_offset + index * 3 + 1];
                    var b = buf[palette_offset + index * 3 + 2];
                    pixels[op++] = b;
                    pixels[op++] = g;
                    pixels[op++] = r;
                    pixels[op++] = 255;
                }
                --xleft;
            }
        };

        // I will go to copy and paste hell one day...
        this.decodeAndBlitFrameRGBA = function (frame_num, pixels) {
            var frame = this.frameInfo(frame_num);
            var num_pixels = frame.width * frame.height;
            var index_stream = new Uint8Array(num_pixels);  // At most 8-bit indices.
            GifReaderLZWOutputIndexStream(
                buf, frame.data_offset, index_stream, num_pixels);
            var palette_offset = frame.palette_offset;

            // NOTE(deanm): It seems to be much faster to compare index to 256 than
            // to === null.  Not sure why, but CompareStub_EQ_STRICT shows up high in
            // the profile, not sure if it's related to using a Uint8Array.
            var trans = frame.transparent_index;
            if (trans === null) trans = 256;

            // We are possibly just blitting to a portion of the entire frame.
            // That is a subrect within the framerect, so the additional pixels
            // must be skipped over after we finished a scanline.
            var framewidth = frame.width;
            var framestride = width - framewidth;
            var xleft = framewidth;  // Number of subrect pixels left in scanline.

            // Output index of the top left corner of the subrect.
            var opbeg = ((frame.y * width) + frame.x) * 4;
            // Output index of what would be the left edge of the subrect, one row
            // below it, i.e. the index at which an interlace pass should wrap.
            var opend = ((frame.y + frame.height) * width + frame.x) * 4;
            var op = opbeg;

            var scanstride = framestride * 4;

            // Use scanstride to skip past the rows when interlacing.  This is skipping
            // 7 rows for the first two passes, then 3 then 1.
            if (frame.interlaced === true) {
                scanstride += width * 4 * 7;  // Pass 1.
            }

            var interlaceskip = 8;  // Tracking the row interval in the current pass.

            for (var i = 0, il = index_stream.length; i < il; ++i) {
                var index = index_stream[i];

                if (xleft === 0) {  // Beginning of new scan line
                    op += scanstride;
                    xleft = framewidth;
                    if (op >= opend) { // Catch the wrap to switch passes when interlacing.
                        scanstride = framestride * 4 + width * 4 * (interlaceskip - 1);
                        // interlaceskip / 2 * 4 is interlaceskip << 1.
                        op = opbeg + (framewidth + framestride) * (interlaceskip << 1);
                        interlaceskip >>= 1;
                    }
                }

                if (index === trans) {
                    op += 4;
                } else {
                    var r = buf[palette_offset + index * 3];
                    var g = buf[palette_offset + index * 3 + 1];
                    var b = buf[palette_offset + index * 3 + 2];
                    pixels[op++] = r;
                    pixels[op++] = g;
                    pixels[op++] = b;
                    pixels[op++] = 255;
                }
                --xleft;
            }
        };
    }

    function GifReaderLZWOutputIndexStream(code_stream, p, output, output_length) {
        var min_code_size = code_stream[p++];

        var clear_code = 1 << min_code_size;
        var eoi_code = clear_code + 1;
        var next_code = eoi_code + 1;

        var cur_code_size = min_code_size + 1;  // Number of bits per code.
        // NOTE: This shares the same name as the encoder, but has a different
        // meaning here.  Here this masks each code coming from the code stream.
        var code_mask = (1 << cur_code_size) - 1;
        var cur_shift = 0;
        var cur = 0;

        var op = 0;  // Output pointer.

        var subblock_size = code_stream[p++];

        // TODO(deanm): Would using a TypedArray be any faster?  At least it would
        // solve the fast mode / backing store uncertainty.
        // var code_table = Array(4096);
        var code_table = new Int32Array(4096);  // Can be signed, we only use 20 bits.

        var prev_code = null;  // Track code-1.

        while (true) {
            // Read up to two bytes, making sure we always 12-bits for max sized code.
            while (cur_shift < 16) {
                if (subblock_size === 0) break;  // No more data to be read.

                cur |= code_stream[p++] << cur_shift;
                cur_shift += 8;

                if (subblock_size === 1) {  // Never let it get to 0 to hold logic above.
                    subblock_size = code_stream[p++];  // Next subblock.
                } else {
                    --subblock_size;
                }
            }

            // TODO(deanm): We should never really get here, we should have received
            // and EOI.
            if (cur_shift < cur_code_size)
                break;

            var code = cur & code_mask;
            cur >>= cur_code_size;
            cur_shift -= cur_code_size;

            // TODO(deanm): Maybe should check that the first code was a clear code,
            // at least this is what you're supposed to do.  But actually our encoder
            // now doesn't emit a clear code first anyway.
            if (code === clear_code) {
                // We don't actually have to clear the table.  This could be a good idea
                // for greater error checking, but we don't really do any anyway.  We
                // will just track it with next_code and overwrite old entries.

                next_code = eoi_code + 1;
                cur_code_size = min_code_size + 1;
                code_mask = (1 << cur_code_size) - 1;

                // Don't update prev_code ?
                prev_code = null;
                continue;
            } else if (code === eoi_code) {
                break;
            }

            // We have a similar situation as the decoder, where we want to store
            // variable length entries (code table entries), but we want to do in a
            // faster manner than an array of arrays.  The code below stores sort of a
            // linked list within the code table, and then "chases" through it to
            // construct the dictionary entries.  When a new entry is created, just the
            // last byte is stored, and the rest (prefix) of the entry is only
            // referenced by its table entry.  Then the code chases through the
            // prefixes until it reaches a single byte code.  We have to chase twice,
            // first to compute the length, and then to actually copy the data to the
            // output (backwards, since we know the length).  The alternative would be
            // storing something in an intermediate stack, but that doesn't make any
            // more sense.  I implemented an approach where it also stored the length
            // in the code table, although it's a bit tricky because you run out of
            // bits (12 + 12 + 8), but I didn't measure much improvements (the table
            // entries are generally not the long).  Even when I created benchmarks for
            // very long table entries the complexity did not seem worth it.
            // The code table stores the prefix entry in 12 bits and then the suffix
            // byte in 8 bits, so each entry is 20 bits.

            var chase_code = code < next_code ? code : prev_code;

            // Chase what we will output, either {CODE} or {CODE-1}.
            var chase_length = 0;
            var chase = chase_code;
            while (chase > clear_code) {
                chase = code_table[chase] >> 8;
                ++chase_length;
            }

            var k = chase;

            var op_end = op + chase_length + (chase_code !== code ? 1 : 0);
            if (op_end > output_length) {
                console.log("Warning, gif stream longer than expected.");
                return;
            }

            // Already have the first byte from the chase, might as well write it fast.
            output[op++] = k;

            op += chase_length;
            var b = op;  // Track pointer, writing backwards.

            if (chase_code !== code)  // The case of emitting {CODE-1} + k.
                output[op++] = k;

            chase = chase_code;
            while (chase_length--) {
                chase = code_table[chase];
                output[--b] = chase & 0xff;  // Write backwards.
                chase >>= 8;  // Pull down to the prefix code.
            }

            if (prev_code !== null && next_code < 4096) {
                code_table[next_code++] = prev_code << 8 | k;
                // TODO(deanm): Figure out this clearing vs code growth logic better.  I
                // have an feeling that it should just happen somewhere else, for now it
                // is awkward between when we grow past the max and then hit a clear code.
                // For now just check if we hit the max 12-bits (then a clear code should
                // follow, also of course encoded in 12-bits).
                if (next_code >= code_mask + 1 && cur_code_size < 12) {
                    ++cur_code_size;
                    code_mask = code_mask << 1 | 1;
                }
            }

            prev_code = code;
        }

        if (op !== output_length) {
            console.log("Warning, gif stream shorter than expected.");
        }

        return output;
    }

    // CommonJS.
    try { exports.GifWriter = GifWriter; exports.GifReader = GifReader } catch (e) { window.omggif = { GifWriter, GifReader } }
})();