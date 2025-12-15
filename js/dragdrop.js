/**
 * DragDrop (v5) - "ported" from v3 migration/dragdrop.js
 * Provides draggable elements and droppable zones with preview, snapping,
 * constraints, optional cloning, and auto-scrolling.
 *
 * Code quality warning: This is based on an old component and is not considered as a high-quality
 * implementation yet. Possible full refactoration may be needed in the future.
 * Quality rating: 2/5 - Needs improvement
 */

LS.LoadComponent(class DragDrop extends LS.Component {
    constructor(){
        super();
        this.draggables = new Set();
        this.dropzones = new Set();
        this.state = {
            moving: false,
            engaged: false,
            firstFrame: false,
            current: null,
            parent: null,
            previewBox: null,
            dragArea: null,
            target: null,
            prevMargin: "",
            prevX: 0,
            prevY: 0,
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

        // Top-layer drag area and preview box
        LS.once("body-available", () => {
            this.state.dragArea = LS.Create({ class: "ls-drag-area" });
            LS._topLayer.add(this.state.dragArea);
        });

        this.state.previewBox = LS.Create({ class: "ls-drop-preview" });

        // End drag on mouseup globally
        LS.Tiny.M.on("mouseup", () => {
            this.state.engaged = false;
            this._end();
        });
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
            swap: false
        }, options);

        el.lsDrag = true;
        el._lsDragOpts = opts;
        this.draggables.add(el);

        // Enable scrolling once hovered over scroll container
        const scrollParent = this._getParent(true, el, opts);
        if(scrollParent) scrollParent.on("mouseenter", () => { this.state.scrollAllowed = true; });

        LS.Tiny.O(opts.handle || el).on("mousedown", async (evt) => {
            if(evt.button !== 0) return;

            let enable = true;
            await this.emit("dragStart", [el, evt, () => { enable = false; }]);
            if(!el.lsDrag || !enable) return;

            const M = LS.Tiny.M;
            this.state.prevX = this.state.initialX = M.x;
            this.state.velocityX = 0;
            this.state.initialY = M.y;
            this.state.prevY = this.state.initialY;
            this.state.velocityY = 0;

            const box = el.getBoundingClientRect();
            this.state.relative = { box, x: this.state.initialX - box.left, y: this.state.initialY - box.top };

            if(this.state.dragArea){
                this.state.dragArea.style.top = box.top + "px";
                this.state.dragArea.style.left = box.left + "px";
                if(opts.preserveHeight) this.state.dragArea.style.height = box.height + "px";
            }

            this.state.prevMargin = getComputedStyle(el).margin;
            this.state.parent = LS.Tiny.O(el.parentElement);
            this.state.engaged = true;
            this.state.current = el;
            this.state.firstFrame = true;

            // Start when pointer moves beyond tolerance
            this._waitForStart();
        });

        return el;
    }

    dropZone(zone, options = {}){
        const el = LS.Tiny.O(zone);
        el.lsDrop = true;
        el.class("ls-drop");
        this.dropzones.add(el);

        el.on("mouseenter", () => {
            if(!this.state.moving || (this.state.current && this.state.current._lsDragOpts?.movementOnly)) return;
            this._dropHover(el);
        });

        return el;
    }

    _frame(){
        const s = this.state;
        const opts = s.current? s.current._lsDragOpts: {};
        const M = LS.Tiny.M;

        let x = M.x, y = M.y;
        const parentBox = this._getParentBox(false, s.current, opts);
        const scrollBox = this._getParentBox(true, s.current, opts);

        if(opts.relativeMouse && s.relative){ x -= s.relative.x; y -= s.relative.y; }

        if(s.firstFrame){ s.firstFrame = false; s.prevX = x; s.prevY = y; }

        if((M.ShiftDown && s.prevX !== null) || opts.lockX) x = s.prevX;
        if(opts.lockY) y = s.prevY;

        const snapValues = s.snapValues;
        if(Array.isArray(snapValues)){
            for(const value of snapValues){
                if(value - x > -opts.snapArea && value - x < opts.snapArea) { x = value; break; }
            }
        }

        if(!opts.lockX) this.state.dragArea.style.left = x + "px";
        if(!opts.lockY) this.state.dragArea.style.top = y + "px";

        if(opts.animate){
            if(x !== s.prevX) { s.velocityX = x - s.prevX; } else { s.velocityX += (s.velocityX > 0? -1 : 1); }
            if(y !== s.prevY) { s.velocityY = s.prevY - y; } else { s.velocityY += (s.velocityY > 0? -1 : 1); }
            this.state.dragArea.style.transform = `translate(${opts.relativeMouse? "0" : "-50%"}, ${s.velocityY}px) rotate(${s.velocityX}deg)`;
        }

        s.prevX = x; s.prevY = y;

        if(opts.absoluteX) {
            s.boundX = (s.current.getBoundingClientRect().left - parentBox.left) + this._getParent(false, s.current, opts).scrollLeft;
            if(!opts.overflow && s.boundX < 0) s.boundX = 0;
            if(opts.dropPreview) this.state.previewBox.style.left = s.boundX + "px";
        }

        if(opts.absoluteY) {
            s.boundY = (s.current.getBoundingClientRect().top - parentBox.top) + this._getParent(false, s.current, opts).scrollTop;
            if(!opts.overflow && s.boundY < 0) s.boundY = 0;
            if(opts.dropPreview) this.state.previewBox.style.top = s.boundY + "px";
        }

        if(s.scrollAllowed){
            const sp = this._getParent(true, s.current, opts);
            if(opts.scrollY){
                if(M.y > scrollBox.bottom) sp.scrollBy(null, Math.min(40, M.y - scrollBox.bottom));
                if(M.y < scrollBox.top) sp.scrollBy(null, Math.min(40, -(scrollBox.top - M.y)));
            }
            if(opts.scrollX){
                if(M.x > (scrollBox.right - 20)) sp.scrollBy(Math.min(40, (M.x - (scrollBox.right - 20))/2), null);
                if(M.x < (scrollBox.left + 20)) sp.scrollBy(Math.min(40, -(((scrollBox.left + 20)) - M.x)/2), null);
            }
        }

        if(this.state.moving && this.state.dragArea) requestAnimationFrame(() => this._frame());
    }

    _getParentBox(scrollBox, current, opts){
        return this._getParent(scrollBox, current, opts).getBoundingClientRect();
    }

    _getParent(scroll, current, opts){
        const container = (scroll? opts.scrollContainer : opts.container) || opts.container || (current? current.parentElement: null);
        return LS.Tiny.O(container || document.body);
    }

    _isAllowed(source, target){
        const opts = source? source._lsDragOpts: {};
        return target.lsDrop === true || opts.allowedTargets.includes(target.lsDropTarget) || target === this._getParent(false, source, opts);
    }

    _dropHover(drop){
        const s = this.state;
        const opts = s.current? s.current._lsDragOpts: {};

        if(!this._isAllowed(s.current, drop)) return;

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
            LS.TinyFactory.applyStyle.call(this.state.previewBox, style);

            if(opts.absoluteX){ this.state.previewBox.style.marginRight = this.state.previewBox.style.marginLeft = "0px"; }
            if(opts.absoluteY){ this.state.previewBox.style.marginTop = this.state.previewBox.style.marginBottom = "0px"; }

            drop.add(this.state.previewBox);
        }
    }

    _waitForStart(){
        const s = this.state;
        const opts = s.current? s.current._lsDragOpts: {};
        const M = LS.Tiny.M;

        if(!s.engaged) return;

        if(Math.abs(s.initialX - M.x) < opts.tolerance && Math.abs(s.initialY - M.y) < opts.tolerance){
            return setTimeout(() => this._waitForStart(), 1);
        }

        if(opts.outsideParent && s.current.parentElement.matches(":hover")){
            return setTimeout(() => this._waitForStart(), 1);
        }

        this._dropHover(opts.sameParent? this._getParent(false, s.current, opts) : LS.Tiny.O(s.current.parentElement));

        s.scrollAllowed = this._getParent(false, s.current, opts).matches(":hover");

        s.moving = true;
        s.dragArea.clear();
        s.dragArea.style.transform = "";

        if(opts.clone){
            s.current = LS.Tiny.N({ innerHTML: s.current.outerHTML }).get("*");
        } else {
            s.current.style.margin = "0";
        }

        s.current.class("ls-held");

        const snap = opts.getters?.snapAt;
        if(Array.isArray(snap)){
            s.snapValues = [];
            for(const element of snap){
                const box = element.getBoundingClientRect();
                s.snapValues.push(box.left, box.right, box.left - s.current.clientWidth, box.right - s.current.clientWidth);
            }
        }

        requestAnimationFrame(() => this._frame());

        s.dragArea.add(s.current);
        if(opts.absoluteX) s.current.style.left = "0";

        if(opts.sameParent){ this._dropHover(this._getParent(false, s.current, opts)); }

        s.dragArea.show();
        this.emit("drag", [s.current]);
    }

    async _end(){
        const s = this.state;
        const opts = s.current? s.current._lsDragOpts: null;

        if(!s.moving || !s.dragArea || !opts) return;
        s.moving = false;

        const M = LS.Tiny.M;
        const strictTarget = LS.Tiny.O(document.elementsFromPoint(M.x, M.y).reverse().find(e => e.lsDrop));
        const drop = opts.movementOnly? s.parent : (!opts.strictDrop ? s.target : strictTarget);

        if(drop && drop.lsDrop && this._isAllowed(s.current, drop)){
            let push = true, morph = true;
            const event = {
                cancelPush(){ push = false; },
                cancelMorph(){ morph = false; },
                source: s.current,
                target: drop,
                boundX: s.boundX,
                boundY: s.boundY,
                boundWidth: s.current.clientWidth,
                boundHeight: s.current.clientHeight
            };

            await this.emit("drop", [s.current, drop, event]);

            if(morph && opts.absoluteX) s.current.style.left = s.boundX + "px";
            if(morph && opts.absoluteY) s.current.style.top = s.boundY + "px";

            if(push){
                if(opts.swap){
                    drop.add(s.current);
                    const swap = drop.getAll("*").find(e => e.lsDrag);
                    if(swap) s.parent.add(swap);
                } else {
                    drop.add(s.current);
                }
            }

            delete event.cancelPush;
            this.emit("dropDone", [s.current, drop, event]);
        } else if(!opts.clone){
            this.emit("cancel", [s.current]);
            s.parent.add(s.current);
        } else {
            this.emit("cancel", []);
            s.current.remove();
        }

        s.current.style.margin = s.prevMargin;
        s.current.class("ls-held", 0);
        this.state.previewBox.remove();
        s.moving = false;
        s.engaged = false;
        s.dragArea.hide();
    }
}, { name: "DragDrop", global: true });
