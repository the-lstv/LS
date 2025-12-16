/**
 * Provides draggable elements and droppable zones with preview, snapping,
 * constraints, optional cloning, and auto-scrolling.
 * 
 * Based on the original LSv3 implementation.
 * 
 * @author lstv.space
 * @license GPL-3.0
 */

LS.LoadComponent(class DragDrop extends LS.Component {
    #handlers = new Map();
    #state = {
        moving: false,
        engaged: false,
        current: null,
        parent: null,
        previewBox: null,
        dragArea: null,
        target: null,
        prevMargin: "",
        prevX: 0,
        prevY: 0,
        currentX: 0,
        currentY: 0,
        velocityX: 0,
        velocityY: 0,
        initialX: 0,
        initialY: 0,
        boundX: 0,
        boundY: 0,
        relative: null,
        scrollAllowed: false,
        snapValues: null
    };

    constructor(){
        super();
        this.draggables = new Set();
        this.dropzones = new Set();

        this.frameScheduler = new LS.Util.FrameScheduler(() => this.#render());

        // Top-layer drag area and preview box
        LS.once("body-available", () => {
            this.#state.dragArea = LS.Create({ class: "ls-drag-area", style: "position: fixed; pointer-events: none; transition: transform 0.1s" });
            LS._topLayer.add(this.#state.dragArea);
        });

        this.#state.previewBox = LS.Create({ class: "ls-drop-preview" });
    }

    set(target, options = {}){
        const el = LS.Tiny.O(target);
        const opts = LS.Util.defaults({
            outsideParent: false,
            relativeMouse: false,
            animate: true,
            dropPreview: true,
            absoluteX: false,
            absoluteY: false,
            preserveHeight: true,
            overflow: false,
            container: null,
            scrollContainer: null,
            sameParent: false,
            strictDrop: true,
            movementOnly: false,
            lockX: false,
            lockY: false,
            scrollY: true,
            scrollX: true,
            clone: false,
            allowedTargets: [],
            getters: {},
            snapArea: 5,
            tolerance: 5,
            swap: false,
            handle: null
        }, options);

        el.lsDragEnabled = true;
        el._lsDragOpts = opts;
        this.draggables.add(el);

        // Enable scrolling once hovered over scroll container
        const scrollParent = this.#getParent(true, el, opts);
        if(scrollParent) scrollParent.on("mouseenter", () => { this.#state.scrollAllowed = true; });

        const handle = LS.Tiny.O(opts.handle || el);
        
        const touchHandler = LS.Util.touchHandle(handle, {
            onStart: (ev, cancel, x, y) => this.#onInputStart(el, ev, cancel, x, y),
            onMove: (x, y) => this.#onInputMove(x, y),
            onEnd: () => this.#onInputEnd()
        });

        this.#handlers.set(el, touchHandler);
        return el;
    }

    remove(target){
        const el = LS.Tiny.O(target);
        if (this.#handlers.has(el)) {
            this.#handlers.get(el).destroy();
            this.#handlers.delete(el);
        }
        this.draggables.delete(el);
        delete el.lsDragEnabled;
        delete el._lsDragOpts;
    }

    dropZone(zone, options = {}){
        const el = LS.Tiny.O(zone);
        el.lsDrop = true;
        el.classList.add("ls-drop");
        this.dropzones.add(el);

        el.on("mouseenter", () => {
            if(!this.#state.moving || (this.#state.current && this.#state.current._lsDragOpts?.movementOnly)) return;
            this.#dropHover(el);
        });

        return el;
    }

    #onInputStart(el, evt, cancel, x, y) {
        // Only left click or touch
        if (evt.type === "mousedown" && evt.button !== 0) {
            cancel();
            return;
        }

        let enable = true;
        this.emit("dragStart", [el, evt, () => { enable = false; }]);
        if(!el.lsDragEnabled || !enable) {
            cancel();
            return;
        }

        const s = this.#state;
        s.prevX = s.initialX = x;
        s.velocityX = 0;
        s.initialY = y;
        s.prevY = s.initialY;
        s.velocityY = 0;
        s.currentX = x;
        s.currentY = y;

        const box = el.getBoundingClientRect();
        s.relative = { box, x: s.initialX - box.left, y: s.initialY - box.top };

        if(s.dragArea){
            s.dragArea.style.transform = `translate3d(${box.left}px, ${box.top}px, 0)`;
            if(el._lsDragOpts.preserveHeight) s.dragArea.style.height = box.height + "px";
        }

        s.prevMargin = getComputedStyle(el).margin;
        s.parent = LS.Tiny.O(el.parentElement);
        s.engaged = true;
        s.current = el;
        s.moving = false; // Waiting for tolerance
    }

    #onInputMove(x, y) {
        const s = this.#state;
        if (!s.engaged) return;

        s.currentX = x;
        s.currentY = y;

        if (!s.moving) {
            const opts = s.current._lsDragOpts;
            if (Math.abs(s.initialX - x) >= opts.tolerance || Math.abs(s.initialY - y) >= opts.tolerance) {
                this.#startDrag();
            }
        } else {
            this.frameScheduler.schedule();
        }
    }

    #onInputEnd() {
        const s = this.#state;
        s.engaged = false;
        this.#end();
    }

    #startDrag() {
        const s = this.#state;
        const opts = s.current._lsDragOpts;

        if (opts.outsideParent && s.current.parentElement.matches(":hover")) {
            return; // Wait until outside parent if required
        }

        this.#dropHover(opts.sameParent? this.#getParent(false, s.current, opts) : LS.Tiny.O(s.current.parentElement));

        s.scrollAllowed = this.#getParent(false, s.current, opts).matches(":hover");

        s.moving = true;
        s.dragArea.clear();
        
        if(opts.clone){
            s.current = LS.Tiny.O(s.current.cloneNode(true));
        } else {
            s.current.style.margin = "0";
        }

        s.current.classList.add("ls-held");

        const snap = opts.getters?.snapAt;
        if(Array.isArray(snap)){
            s.snapValues = [];
            for(const element of snap){
                const box = element.getBoundingClientRect();
                s.snapValues.push(box.left, box.right, box.left - s.current.clientWidth, box.right - s.current.clientWidth);
            }
        }

        s.dragArea.add(s.current);
        if(opts.sameParent){ this.#dropHover(this.#getParent(false, s.current, opts)); }

        s.dragArea.show();
        this.emit("drag", [s.current]);
        this.frameScheduler.schedule();
    }

    #render(){
        const s = this.#state;
        if (!s.moving || !s.current) return;

        const opts = s.current._lsDragOpts;
        
        let x = s.currentX, y = s.currentY;
        const parentBox = this.#getParentBox(false, s.current, opts);
        const scrollBox = this.#getParentBox(true, s.current, opts);

        if(opts.relativeMouse && s.relative){ x -= s.relative.x; y -= s.relative.y; }

        if((LS.Tiny.M.ShiftDown && s.prevX !== null) || opts.lockX) x = s.prevX;
        if(opts.lockY) y = s.prevY;

        const snapValues = s.snapValues;
        if(Array.isArray(snapValues)){
            for(const value of snapValues){
                if(value - x > -opts.snapArea && value - x < opts.snapArea) { x = value; break; }
            }
        }

        let transform = `translate3d(${x}px, ${y}px, 0)`;

        if(opts.animate){
            if(x !== s.prevX) { s.velocityX = x - s.prevX; } else { s.velocityX += (s.velocityX > 0? -1 : 1); }
            if(y !== s.prevY) { s.velocityY = s.prevY - y; } else { s.velocityY += (s.velocityY > 0? -1 : 1); }
            transform += ` translate3d(${opts.relativeMouse? "0" : "-50%"}, ${s.velocityY}px, 0) rotate(${s.velocityX}deg)`;
        } else {
            transform += ` translate3d(${opts.relativeMouse? "0" : "-50%"}, 0, 0)`;
        }

        s.dragArea.style.transform = transform;

        s.prevX = x; s.prevY = y;

        if(opts.absoluteX) {
            s.boundX = (s.current.getBoundingClientRect().left - parentBox.left) + this.#getParent(false, s.current, opts).scrollLeft;
            if(!opts.overflow && s.boundX < 0) s.boundX = 0;
            if(opts.dropPreview) s.previewBox.style.left = s.boundX + "px";
        }

        if(opts.absoluteY) {
            s.boundY = (s.current.getBoundingClientRect().top - parentBox.top) + this.#getParent(false, s.current, opts).scrollTop;
            if(!opts.overflow && s.boundY < 0) s.boundY = 0;
            if(opts.dropPreview) s.previewBox.style.top = s.boundY + "px";
        }

        if(s.scrollAllowed){
            const sp = this.#getParent(true, s.current, opts);
            if(opts.scrollY){
                if(s.currentY > scrollBox.bottom) sp.scrollBy(null, Math.min(40, s.currentY - scrollBox.bottom));
                if(s.currentY < scrollBox.top) sp.scrollBy(null, Math.min(40, -(scrollBox.top - s.currentY)));
            }
            if(opts.scrollX){
                if(s.currentX > (scrollBox.right - 20)) sp.scrollBy(Math.min(40, (s.currentX - (scrollBox.right - 20))/2), null);
                if(s.currentX < (scrollBox.left + 20)) sp.scrollBy(Math.min(40, -(((scrollBox.left + 20)) - s.currentX)/2), null);
            }
        }

        if(s.moving && s.dragArea) requestAnimationFrame(() => this.frameScheduler.schedule());
    }

    render(){
        this.frameScheduler.schedule();
    }

    #getParentBox(scrollBox, current, opts){
        return this.#getParent(scrollBox, current, opts).getBoundingClientRect();
    }

    #getParent(scroll, current, opts){
        const container = (scroll? opts.scrollContainer : opts.container) || opts.container || (current? current.parentElement: null);
        return LS.Tiny.O(container || document.body);
    }

    #isAllowed(source, target){
        const opts = source? source._lsDragOpts: {};
        return target.lsDrop === true || opts.allowedTargets.includes(target.lsDropTarget) || target === this.#getParent(false, source, opts);
    }

    #dropHover(drop){
        const s = this.#state;
        const opts = s.current? s.current._lsDragOpts: {};

        if(!this.#isAllowed(s.current, drop)) return;

        s.target = drop;

        if(s.moving && s.dragArea && opts.dropPreview){
            const cs = getComputedStyle(s.current);
            const style = {
                height: s.current.clientHeight + "px",
                width: s.current.clientWidth + "px",
                margin: s.prevMargin,
                display: cs.display,
                position: "absolute",
                borderRadius: cs.borderRadius
            };

            LS.TinyFactory.applyStyle.call(s.previewBox, style);

            if(opts.absoluteX){ s.previewBox.style.marginRight = s.previewBox.style.marginLeft = "0px"; }
            if(opts.absoluteY){ s.previewBox.style.marginTop = s.previewBox.style.marginBottom = "0px"; }

            drop.add(s.previewBox);
        }
    }

    #end(){
        const s = this.#state;
        const opts = s.current? s.current._lsDragOpts: null;

        if(!s.moving || !s.dragArea || !opts) return;
        s.moving = false;

        // Use currentX/Y for drop detection
        const strictTarget = LS.Tiny.O(document.elementsFromPoint(s.currentX, s.currentY).reverse().find(e => e.lsDrop));
        const drop = opts.movementOnly? s.parent : (!opts.strictDrop ? s.target : strictTarget);

        if(drop && drop.lsDrop && this.#isAllowed(s.current, drop)){
            const event = {
                source: s.current,
                target: drop,
                boundX: s.boundX,
                boundY: s.boundY,
                boundWidth: s.current.clientWidth,
                boundHeight: s.current.clientHeight
            };

            this.emit("drop", [s.current, drop, event]);
        } else if(!opts.clone){
            this.emit("cancel", [s.current]);
            s.parent.add(s.current);
        } else {
            this.emit("cancel", []);
            s.current.remove();
        }

        s.current.style.margin = s.prevMargin;
        s.current.classList.remove("ls-held");
        s.previewBox.remove();
        s.moving = false;
        s.engaged = false;
        s.dragArea.hide();
    }

    destroy(){
        for (const [el, handler] of this.#handlers) {
            if(el.lsDragEnabled) {
                el.lsDragEnabled = false;
                delete el._lsDragOpts;
            }

            handler.destroy();
        }
        this.#handlers.clear();
        this.draggables.clear();
        this.dropzones.clear();
        if(this.#state.dragArea) this.#state.dragArea.remove();
        if(this.#state.previewBox) this.#state.previewBox.remove();
        this.frameScheduler.cancel();
        this.frameScheduler = null;
    }
}, { name: "DragDrop", global: true });
