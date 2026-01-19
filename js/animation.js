/**
 * Fast animation library for LS.
 * Supports any animatable object (primarily DOM) and hardware-accelerated CSS animations.
 * @version 2.1.0
 */

(() => {
    // Properties where we expect color values
    const COLOR_PROPERTIES = new Set([
        'color', 'background-color', 'background', 'border-color', 'border-top-color', 'border-right-color',
        'border-bottom-color', 'border-left-color', 'outline-color', 'fill', 'stroke'
    ]);

    const TRANSFORM_ALIASES = {
        'x': ['translateX', 'px'],
        'y': ['translateY', 'px'],
        'z': ['translateZ', 'px'],
        'rotate': ['rotate', 'deg'],
        'rotateX': ['rotateX', 'deg'],
        'rotateY': ['rotateY', 'deg'],
        'scale': ['scale', ''],
        'scaleX': ['scaleX', ''],
        'scaleY': ['scaleY', ''],
        'skewX': ['skewX', 'deg'],
        'skewY': ['skewY', 'deg']
    };

    class AnimationInstance {
        constructor(parent, animationData) {
            this.parent = parent;
            this.data = animationData;
            this.data[9] = this; // Store wrapper reference
            this.id = null;
            this._resolver = null;
            this.promise = new Promise(resolve => { this._resolver = resolve; });
            this.data[15] = this._resolver; // Store resolver
        }

        pause() {
            if(this.id !== null) this.parent.pause(this.id);
            return this;
        }

        resume() {
            if(this.id !== null) this.parent.resume(this.id);
            return this;
        }

        stop() {
            if(this.id !== null) this.parent.stop(this.id);
            return this;
        }

        reverse() {
            this.data[7] = !this.data[7];
            return this;
        }

        restart() {
            // Reset time to -delay (index 10)
            this.data[1] = -this.data[10];
            this.data[14] = 0; // Reset loop count
            
            // Re-create promise
            this.promise = new Promise(resolve => { this._resolver = resolve; });
            this.data[15] = this._resolver;

            if(this.id !== null) this.parent.resume(this.id);
            else this.parent.run(this);
            return this;
        }

        seek(time) {
            this.data[1] = time;
            return this;
        }

        progress(progress) {
            progress = Math.min(Math.max(progress, 0), 1);
            this.data[1] = progress * this.data[3];
            return this;
        }

        replay() {
            return this.restart();
        }

        then(onFulfilled) {
            return this.promise.then(onFulfilled);
        }

        destroy() {
            this.data[0] = null;
            this.data = null;
            this.id = null;
            this.parent = null;
        }
    }

    class Timeline {
        constructor() {
            this.animations = [];
            this.promise = Promise.all([]);
        }

        add(target, properties, options) {
            const anim = LS.Animation2.global.animate(target, properties, options);
            if (anim) {
                if (anim instanceof Timeline) {
                     this.animations.push(...anim.animations);
                } else {
                    this.animations.push(anim);
                }
            }
            this.promise = Promise.all(this.animations.map(a => a.promise));
            return this;
        }

        play() { this.animations.forEach(a => a.resume()); return this; }
        pause() { this.animations.forEach(a => a.pause()); return this; }
        stop() { this.animations.forEach(a => a.stop()); return this; }
        restart() { this.animations.forEach(a => a.restart()); return this; }
        reverse() { this.animations.forEach(a => a.reverse()); return this; }
        then(fn) { return this.promise.then(fn); }
    }

    LS.LoadComponent(class Animation extends LS.Component {
        DEFAULT_DURATION = 300
        DEFAULT_EASING = 'ease'

        constructor() {
            super();
            this.scheduler = new LS.Util.FrameScheduler(this.render.bind(this), {
                deltaTime: true
            });
        }

        // Users have the choice to turn this setting on/off per-site.
        static get prefersReducedMotion() {
            const saved = localStorage.getItem('ls-reduced-motion');
            return saved === 'true' ? true : saved === 'false' ? false : window.matchMedia? window.matchMedia('(prefers-reduced-motion: reduce)').matches: false;
        }

        static set prefersReducedMotion(value) {
            if(value === null) {
                localStorage.removeItem('ls-reduced-motion');
            } else {
                localStorage.setItem('ls-reduced-motion', String(!!value));
            }
        }

        static EASING = {
            'linear': t => t,
            'ease': t => t<.5 ? 2*t*t : -1+(4-2*t)*t,
            'ease-in': t => t*t,
            'ease-out': t => t*(2-t),
            'ease-in-out': t => t<.5 ? 2*t*t : -1+(4-2*t)*t
        };

        static Context = class AnimationContext {
            constructor(animationInstance) {
                this.animationInstance = animationInstance;
                this.activeAnimations = new Set();
            }

            animate(target, properties = {}, options = {}) {
                const anim = this.animationInstance.animate(target, properties, options);
                // Handle timeline/array return
                const list = (anim instanceof Timeline) ? anim.animations : [anim];
                for(let a of list) {
                     if(a && a.id !== null) this.activeAnimations.add(a.id);
                }
                return anim;
            }

            stop(id) {
                // Not fully compatible with Timelines via ID, use object methods instead
                this.activeAnimations.delete(id);
                this.animationInstance.stop(id);
            }

            pause(id) {
                this.animationInstance.pause(id);
            }

            resume(id) {
                this.animationInstance.resume(id);
            }

            stopAll() {
                for (let id of this.activeAnimations) {
                    this.animationInstance.stop(id);
                }
            }

            destroy() {
                this.stopAll();
                this.activeAnimations.clear();
            }
        };

        static Timeline = Timeline;

        scheduled = [];

        createAnimation(properties = {}, options = {}, group = null) {
            const animationTargets = Array.isArray(properties) ? properties : Object.entries(properties);
            const duration = options.duration || 300;
            const ease = options.easing || 'ease';
            const cutGroup = options.cutGroup;
            
            const delay = options.delay || 0;
            const repeat = options.repeat === true ? -1 : (options.repeat || 0);
            const yoyo = !!options.yoyo;
            const removeOnComplete = !!options.removeOnComplete;
            const onComplete = options.onComplete || null;

            for (let i = 0; i < animationTargets.length; i++) {
                const prop = animationTargets[i];
                let key = prop[0];
                let isTransform = false;
                let unit = '';

                if (TRANSFORM_ALIASES[key]) {
                    unit = TRANSFORM_ALIASES[key][1];
                    key = TRANSFORM_ALIASES[key][0];
                    isTransform = true;
                }

                if(!Array.isArray(prop[1])) {
                    // pre-check for color string to ensure correct wrapping
                    if(typeof prop[1] === 'string' && COLOR_PROPERTIES.has(key)) {
                         try { prop[1] = new LS.Color(prop[1]); } catch(e){}
                    }
                    prop[1] = [null, prop[1]];
                }

                if(!Array.isArray(prop[1]) || prop[1].length !== 2) {
                    throw new Error(`Invalid property format for "${key}". Expected [from, to].`);
                }

                // Flatten values
                animationTargets[i] = [key, this.resolveValue(key, prop[1][0]), this.resolveValue(key, prop[1][1]), isTransform, unit];
            }

            // Data Structure:
            // 0: target (single)
            // 1: time (starts at -delay)
            // 2: properties
            // 3: duration
            // 4: easing
            // 5: isDOM
            // 6: paused
            // 7: reversed
            // 8: cutGroup
            // 9: wrapper (Instance)
            // 10: delay
            // 11: repeat (-1 infinite)
            // 12: yoyo (bool)
            // 13: removeOnComplete (bool)
            // 14: loopCount
            // 15: resolver
            // 16: onComplete (callback)

            return new AnimationInstance(this, [null, -delay, animationTargets, duration, ease === "linear" ? null : this.constructor.EASING[ease] || null, null, false, false, cutGroup, null, delay, repeat, yoyo, removeOnComplete, 0, null, onComplete]);
        }

        /**
         * Creates a new animation for the target object.
         * Note: Animations are short-lived and removed once completed.
         * @param {object|Array|NodeList|string|function} target The target object to animate. Optionally a selector, function or array.
         * @param {object|Array} properties The properties to animate, either as an object or entries ([[property, [from, to]]]).
         * @param {object} [properties.property] The property to animate. Value can be a number or instance of LS.Color. Optionally you can set an initial value as [from, to].
         * @param {object} options The animation options
         * @param {string} options.easing The easing function to use (linear, ease-in, ease-out, ease-in-out)
         * @param {number} options.duration The duration of the animation in milliseconds
         * @param {number} options.cutGroup The cut group ID. Animating with this ID stops any other animations with the same ID.
         * @param {string} group The animation group
         */
        animate(target, properties = {}, options = {}, group = null) {
            if(typeof target === 'string') {
                target = document.querySelectorAll(target);
            }

            // Handle multiple targets by returning a Timeline
            if (NodeList.prototype.isPrototypeOf(target) || Array.isArray(target)) {
                const tl = new Timeline();
                for (let el of target) {
                    tl.add(el, properties, options);
                }
                return tl;
            }

            const isDOM = target instanceof HTMLElement || target instanceof SVGElement;

            const animation = this.createAnimation(properties, options, group);
            animation.data[0] = target;
            animation.data[5] = isDOM;

            this.run(animation);
            return animation;
        }

        run(animation) {
            if (animation.data[8] !== undefined) {
                for (let i = this.scheduled.length - 1; i >= 0; i--) {
                    if (this.scheduled[i][8] === animation.data[8]) {
                        this.stop(i);
                    }
                }
            }

            const id = this.scheduled.push(animation.data) - 1;
            animation.id = id;
            if(!this.scheduler.running) {
                this.scheduler.start();
            }
            return id;
        }

        stop(id) {
            if (!this.scheduled[id]) return;
            const lastIndex = this.scheduled.length - 1;
            const item = this.scheduled[lastIndex];

            // If we are not removing the last item, we act as swap-pop and must update ID of moved item
            if (id !== lastIndex) {
                this.scheduled[id] = item;
                if (item[9]) item[9].id = id;
            }
            this.scheduled.pop();
        }

        pause(id) {
            if(this.scheduled[id]) this.scheduled[id][6] = true;
        }

        resume(id) {
            if(this.scheduled[id]) this.scheduled[id][6] = false;
        }

        resolveValue(key, value) {
            if (value === null || value === undefined) return null;

            // Fix: Syntax error in instanceof check
            if (COLOR_PROPERTIES.has(key) && !(value instanceof LS.Color)) {
                return new LS.Color(value);
            }

            if (value instanceof LS.Color) {
                return value.clone();
            }

            if (typeof value === 'number') {
                return value;
            }

            if (typeof value === 'string') {
                if (value.charCodeAt(0) === 35) { // Probably hex color
                    return LS.Color.fromHex(value);
                }

                const parsed = parseFloat(value);
                if (isNaN(parsed)) {
                     // If it fails to parse as float but we are here, it might be a color string not caught earlier or invalid
                     // Try color one last time if it looks like rgb/hsl
                     if (value.startsWith('rgb') || value.startsWith('hsl')) return new LS.Color(value);
                     return 0; // Fallback
                }
    
                return parsed;
            }
        }

        getInitialValue(target, property, isTransform) {
            if (target instanceof HTMLElement || target instanceof SVGElement) {
                if (isTransform) {
                    if (target._transforms && target._transforms[property] !== undefined) return target._transforms[property].value;
                    if (property.startsWith('scale')) return 1;
                    return 0;
                }

                const style = getComputedStyle(target);
                const value = style.getPropertyValue(property);
                // Return 1 for opacity if not set
                if(property === 'opacity' && value === '') return 1;
                return this.resolveValue(property, value);
            }

            if (typeof target[property] === 'function') {
                return target[property]();
            }

            return this.resolveValue(property, target[property]);
        }

        render(deltaTime) {
            const scheduled = this.scheduled;

            for (let i = 0; i < scheduled.length; i++) {
                const item = scheduled[i];
                if (!item || item[6]) continue;

                // Handle delay
                item[1] += deltaTime;
                if (item[1] < 0) continue; // Waiting start

                const duration = item[3];
                const baseReversed = item[7];
                const repeat = item[11];
                const yoyo = item[12];
                let loopCount = item[14];
                
                let time = item[1];
                let isComplete = false;

                // Loop logic
                if (time >= duration) {
                    if (repeat === -1 || loopCount < repeat) {
                        item[1] -= duration; // mod time
                        time = item[1];
                        item[14]++; // loopCount++
                        loopCount++;
                    } else {
                        time = duration; 
                        isComplete = true;
                    }
                }

                let isEffectiveReverse = baseReversed;
                if (yoyo && (loopCount % 2 !== 0)) {
                    isEffectiveReverse = !isEffectiveReverse;
                }

                // Calculate progress
                let effectiveTime = isEffectiveReverse ? (duration - time) : time;
                let progress = duration === 0 ? 1 : effectiveTime / duration;

                // Clamp
                if (progress < 0) progress = 0;
                if (progress > 1) progress = 1;

                const ease = item[4];
                if(ease !== null) progress = ease(progress);

                const target = item[0];
                const animationTargets = item[2];
                const isDOM = item[5];

                if(isDOM) {
                    const style = target.style;
                    let hasTransform = false;

                    for (let j = 0; j < animationTargets.length; j++) {
                        const prop = animationTargets[j];
                        const property = prop[0];
                        const isTransform = prop[3];
                        const unit = prop[4];

                        let from = prop[1];
                        const to = prop[2];

                        if(from === null) {
                            from = prop[1] = this.getInitialValue(target, property, isTransform);
                        }

                        let value;
                        if (from instanceof LS.Color) {
                            value = from.lerp(to, progress, from);
                            style[property] = value.toString();
                        } else if (typeof from === 'number' && typeof to === 'number') {
                            value = from + (to - from) * progress;

                            if (isTransform) {
                                if (!target._transforms) target._transforms = {};
                                target._transforms[property] = { value, unit };
                                hasTransform = true;
                            } else {
                                style[property] = value;
                            }
                        }
                    }

                    if (hasTransform) {
                        let transformStr = '';
                        for (const key in target._transforms) {
                            const t = target._transforms[key];
                            transformStr += `${key}(${t.value}${t.unit}) `;
                        }
                        style.transform = transformStr;
                    }
                } else {
                    for (let j = 0; j < animationTargets.length; j++) {
                        const prop = animationTargets[j];
                        const property = prop[0];
                        let from = prop[1]; 
                        const to = prop[2];
                        
                        if(from === null) from = prop[1] = this.getInitialValue(target, property, false);

                        let value;
                        if (from instanceof LS.Color) {
                            value = from.lerp(to, progress);
                        } else {
                            value = from + (to - from) * progress;
                        }

                        const slot = target[property];
                        if (typeof slot === "function") slot.call(target, value);
                        else target[property] = value;
                    }
                }

                if (isComplete) {
                    this.stop(i);
                    i--;
                    
                    // onComplete handler
                    if(item[16]) try { item[16](); } catch(e) { console.error(e); }
                    // Promise resolve
                    if(item[15]) item[15]();
                    // Remove on complete
                    if(item[13] && isDOM && target.parentNode) {
                        target.parentNode.removeChild(target);
                    }
                }
            }

            if (scheduled.length === 0) {
                this.scheduler.stop();
            }
        }

        /**
         * Helper method for quick fade out, backwards compatibile with Animation 1.x; animates opacity to 0 and moves in a direction.
         * @example
         * LS.Animation.fadeOut(element, { duration: 500, direction: 'down' }).then(() => { console.log("Faded out!"); });
         * LS.Animation.fadeOut(element, 500, 'down').then(() => { console.log("Faded out!"); });
         */
        static fadeOut(target, duration = 300, direction = null, options = {}) {
            if(typeof duration === 'object') {
                options = duration;
            }

            return this.global.animate(target, {
                opacity: 0,
                // Assumes 'transforms' map exists in scope or is not used. 
                // Providing fix: direction is just alias usage in standard CSS usually.
                transform: direction ? (TRANSFORM_ALIASES[direction] ? undefined : direction) : undefined // Simply pass undefined if not resolved, user code seems to rely on external 'transforms' object for directions
            }, typeof duration === 'object' ? duration : {
                duration,
                easing: 'ease',
                cutGroup: 1,
                ...options
            });
        }

        /**
         * Helper method for quick fade in, backwards compatibile with Animation 1.x; animates opacity to 1 and moves in a direction.
         */
        static fadeIn(target, duration = 300, direction = null, options = {}) {
            if(typeof duration === 'object') {
                options = duration;
            }

            return this.global.animate(target, {
                opacity: 1,
                transform: direction ? (TRANSFORM_ALIASES[direction] ? undefined : direction) : undefined
            }, typeof duration === 'object' ? duration : {
                duration,
                easing: 'ease',
                cutGroup: 1,
                ...options
            });
        }

        destroy() {
            this.scheduler.stop();
            this.scheduled.length = 0;
        }
    }, { name: "Animation2", global: true });

    LS.Animation2.global = new LS.Animation2();
})();
