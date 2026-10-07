const lerp = (a, b, t) => a + (b - a) * t;

console.warn("LS.Animation2 is experimental");

/**
 * @typedef {Object} AnimationOptions
 * @property {number} [offset=0] - The initial time offset of the animation.
 * @property {number} [duration=1000] - The duration of the animation in milliseconds.
 * @property {string|function} [easing=0] - The easing function or name to use for the animation.
 * @property {number} [speed=1] - The speed multiplier for the animation (negative for reverse).
 * @property {number} [repeat=0] - The number of times to repeat the animation (0 for no repeat).
 * @property {number} [repeatMode=0] - The repeat mode (0 for normal, 1 for reverse, 2 for alternate).
 * @property {boolean} [ephemeral=true] - Whether the animation is ephemeral (auto-destroy after completion).
 * @property {number} [delay=0] - The delay before the animation starts in milliseconds
 * @property {function|object|HTMLElement} [target] - Target element or function to animate.
 */

/**
 * @typedef {function|object|HTMLElement} AnimationTarget
 * @description The target of the animation. It can be a function that receives the animated value, an object whose properties will be animated, or an HTML element whose style properties will be animated.
 */

/**
 * Lighteight and efficient CPU animation library for animating basically anything.
 * Supports keyframes, easing, timelines, and more.
 * 
 * Todo: blending, groups, initial values, sync with parent time, & optimize advancing
 * 
 * For CSS animations, you should use WAAPI methods instead.
 * 
 * Animations can be used as renderables, advancd manually, via a timeline, or via the global ticker, and can be ephemeral or persistent.
 */
class Animation {
    keyframes = [];
    state     = [/*Time*/0, /*Duration*/1000, /*Easing*/0, /*Speed (negative = reverse, 0 = paused, positive = forwards)*/0, /*Repeat*/0, /*Repeat mode*/0, /*Ephemeral*/true, /*State running, paused, stopped*/2, /*Delay*/0];

    /**
     * @type {Promise}
     */
    promise = null;
    resolve = null;

    target = null;

    /**
     * @type {AnimationTimeline}
     */
    parent = null;

    /**
     * @type {string|number|null}
     * An optional animation group identifier.
     */
    group = null;

    /**
     * Creates a new Animation instance.
     * 
     * @param {Array|Object} keyframes - Array of keyframes, or a single keyframe object as a destination state.
     * @param {AnimationOptions} options - Animation options.
     * @param {AnimationTarget} target - Target element or function to animate.
     * @param {AnimationTimeline|Animation} parent - Managing parent (for timelines).
     */
    constructor(keyframes = [], options = {}, target = null, parent = Animation, _isTimeline = false) {
        if(options) {
            this.state[0] =   options.offset     || 0;
            this.state[1] =   options.duration   || 1000;
            this.state[2] =   options.easing     || 0;
            this.state[3] =   options.speed      || 1;
            this.state[4] =   options.repeat     || 0;
            this.state[5] =   options.repeatMode || 0;
            this.state[6] =   options.ephemeral  !== false;
            this.state[8] =   options.delay      || 0;
        }

        if(parent === Animation) {
            parent.animations.add(this);
        }

        this.parent = parent;
        this.group  = options.group || null;

        if(!_isTimeline) {
            if(!Array.isArray(keyframes) && typeof keyframes === "object" && keyframes !== null) {
                keyframes = [keyframes];
            } else if(!Array.isArray(keyframes)) {
                throw new Error("Keyframes must be an array or an object");
            }

            target ??= options.target || null;
            if(typeof target === "string") {
                target = document.querySelectorAll(target);
            }

            this.keyframes = keyframes;
            this.target = target;
        }
    }

    /**
     * Animate something with an ephemeral animation.
     * @param {AnimationTarget} target - Target element or function to animate.
     * @param {Array|Object} keyframes - Array of keyframes, or a single keyframe object as a destination state.
     * @param {AnimationOptions} options - Animation options.
     * 
     * @example // Animation with a callback
     * Animation.animate((value) => console.log(value), [{ value: 0 }, { value: 1, at: 0.5 }], { duration: 1000, easing: "ease-in" });
     * 
     * @example // Animating object properties
     * const animation = Animation.animate({ opacity: 0 }, [{ opacity: 0 }, { opacity: 0.5 }], { duration: 500, easing: "ease-out" });
     * 
     * animation.progress = 0.5;
     * animation.reverse();
     * // ...
     * await animation.promise;
     * 
     * @returns {Animation} Ephemeral animation
     */
    static animate(target, keyframes = [], options = {}) {
        options.ephemeral ??= true;
        options.group ??= null;

        const animation = new Animation(keyframes, options, target, this);
        animation.start();
        return animation;
    }

    static to(target, keyframe = {}, options = {}) {
        return this.animate(target, keyframe, options);
    }

    static sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    /**
     * Advance the animation by the given delta time.
     * @param {number} delta - The time to advance the animation by.
     * @param {Animation} parentState - The parent animation container's state.
     */
    advance(delta, parentState = null) {
        const stateObj = this.state;
        if(!stateObj) return;

        const state = stateObj[7];
        const delay = stateObj[8];

        const direction = stateObj[3];

        // Paused
        if(!parentState && state > 0) {
            return;
        }

        let time = stateObj[0] = parentState? parentState[0]: stateObj[0] + (delta * direction);

        // Delay
        if(time < delay) {
            return;
        }

        time -= delay;

        if(this.isTimeline) {
            for(const animation of this.animations) {
                animation.advance(delta, stateObj);
            }
            return;
        }

        // Calculate progress
        const rawProgress = this.progress;

        // Apply easing
        const globalEasing = stateObj[2];
        let progress = Math.min(1, Math.max(0, rawProgress));
        if(typeof globalEasing === "function") progress = globalEasing(progress);

        // Update keyframes
        // todo: optimize this & add initial values/forward fill/different modes etc.

        const keyframeCount = this.keyframes.length;

        let keyframeIndex = 0;
        if (keyframeCount < 2) return;

        for (let i = 0; i < keyframeCount - 1; i++) {
            const at = this.keyframes[i].at         ??  i      / (keyframeCount - 1);
            const nextAt = this.keyframes[i + 1].at ?? (i + 1) / (keyframeCount - 1);

            if (progress >= at && progress <= nextAt) {
                keyframeIndex = i;
                break;
            }
        }

        const keyframe       = this.keyframes[keyframeIndex];
        const nextKeyframe   = this.keyframes[keyframeIndex + 1];
        const keyframeAt     =     keyframe?.at ??  keyframeIndex      / (keyframeCount - 1);
        const nextKeyframeAt = nextKeyframe?.at ?? (keyframeIndex + 1) / (keyframeCount - 1);

        // Calculate keyframe progress
        let keyframeProgress = (progress - keyframeAt) / (nextKeyframeAt - keyframeAt);

        const keyframeType = typeof keyframe;

        if (keyframeType === "object" && keyframe !== null) {
            // Per-keyframe easing
            if (keyframe.easing) {
                if(typeof keyframe.easing === "function") keyframeProgress = keyframe.easing(keyframeProgress);
            }

            for(const prop in keyframe) {
                if (prop === "easing" || prop === "at") continue;

                const baseFrom = keyframe[prop];
                const baseTo   = nextKeyframe[prop];

                const staticValue = (typeof baseFrom !== "object" && typeof baseTo !== "object")? lerp(baseFrom, baseTo, keyframeProgress): null;

                let i = 0;
                for(const target of this.targetIterator()) {
                    let value = staticValue;
                    
                    if(!staticValue) {
                        const from = baseFrom?.values? baseFrom.values[i]: baseFrom;
                        const to   = baseTo?.values?   baseTo.values[i]:   baseTo;
                        value = lerp(from, to, keyframeProgress);
                        i++;
                    }

                    if(typeof target === "function") {
                        target(prop, value, keyframeProgress, progress);
                        continue;
                    }

                    this.setValueForProperty(prop, value, target);
                }
            }
        }

        else if (keyframeType === "function") {
            keyframe(keyframeProgress, progress);
        }

        else if (keyframeType === "number") {
            for(const target of this.targetIterator()) {
                if(typeof target === "function") {
                    target(null, lerp(keyframe, nextKeyframe, keyframeProgress), keyframeProgress, progress);
                }
            }
        }

        const repeat = stateObj[4];
        const repeatMode = stateObj[5];

        if(rawProgress >= 1 && direction > 0 || rawProgress <= 0 && direction < 0) {
            if(repeat > 1) {
                stateObj[4]--;

                if(repeatMode === 1) {
                    stateObj[3] *= -1; // Reverse direction on repeat
                } else {
                    stateObj[0] = 0;   // Reset time on repeat
                }
            } else {
                this.stop();
            }
        }
    }

    getDefaultValueForProperty(prop, target) {
        if(target instanceof HTMLElement) {
            const computedStyle = getComputedStyle(target);
            return parseFloat(computedStyle[prop]) || 0;
        }

        return target[prop] || 0;
    }

    setValueForProperty(prop, value, target) {
        if(target instanceof HTMLElement) {
            target.style[prop] = value;
        } else {
            target[prop] = value;
        }
    }

    *targetIterator() {
        if(!this.target) return;

        if(Array.isArray(this.target) || this.target instanceof Set || this.target instanceof NodeList) {
            for(const item of this.target) {
                yield item;
            }
        }

        yield this.target;
    }

    start(time = 0) {
        if(time !== null) this.state[0] = time;
        this.state[7] = 0;

        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
        });

        if(typeof this.state[2] === "string") {
            this.state[2] = Animation.EASING[this.state[2]] || Animation.EASING.linear;
        }

        if(!this.isTimeline) {
            if(!this.keyframes || this.keyframes.length === 0) {
                this.stop();

                console.warn("Animation has no keyframes, cannot start", this);    
                return this.promise;
            }

            console.log(this.keyframes[0])

            if(this.keyframes.length === 1 || this.keyframes[0]?.at > 0) {
                // Generate a default keyframe at the start with the current values of the target
                const defaultKeyframe = {};
                for(const prop in this.keyframes[0]) {
                    if (prop === "easing" || prop === "at") continue;
                    defaultKeyframe[prop] = null;
                }
                this.keyframes.unshift(defaultKeyframe);

                console.warn("Animation has no starting keyframe, generating default keyframe", this.keyframes);
            }

            for(const keyframe of this.keyframes) {
                if(typeof keyframe.easing === "string") {
                    keyframe.easing = Animation.EASING[keyframe.easing] || Animation.EASING.linear;
                }
    
                for(const prop in keyframe) {
                    if (prop === "easing" || prop === "at") continue;
    
                    if(keyframe[prop] === null || (typeof keyframe[prop] === "object" && keyframe[prop]?.isDefaults)) {
                        keyframe[prop] = {
                            isDefaults: true,
                            values: []
                        };
    
                        for(const target of this.targetIterator()) {
                            keyframe[prop].values.push(this.getDefaultValueForProperty(prop, target));
                        }
                    }
                }
            }
        } else {
            for(const animation of this.animations) {
                animation.start(time);
            }
        }

        if(this.parent && this.parent.destroyed) this.parent = null;

        if(this.parent) {
            if(this.parent === Animation) {
                Animation.GlobalTicker.start();
            } else if(this.parent instanceof AnimationTimeline) {
                this.parent.ref++;
            }
        }

        return this.promise;
    }

    stop(destroy = this.state[6]) {
        if(this.destroyed) return;

        this.state[7] = 2;
        if(this.resolve) this.resolve();
        this.resolve = null;

        if(this.parent && this.parent.destroyed) this.parent = null;

        // We can stop the ticker if no animations are running
        if(this.parent && this.parent instanceof AnimationTimeline) {
            this.parent.ref--;
            if(this.parent.ref <= 0) this.parent.stop();
        }

        if(destroy) {
            if(this.parent) {
                this.parent.animations.delete(this);
            }

            this.keyframes = null;
            this.state     = null;
            this.promise   = null;
            this.resolve   = null;
            this.parent    = null;
            this.target    = null;

            this.destroyed = true;
        }
    }

    pause() {
        this.state[7] = 1;
    }

    resume() {
        if(this.state[7] === 2) return this.start();
        this.state[7] = 0;
        return this.promise;
    }

    play() {
        return this.resume();
    }

    reverse() {
        this.state[3] = -this.state[3];
    }

    set speed(value) {
        this.state[3] = value;
    }

    get speed() { return this.state[3] }

    set duration(value) {
        this.state[1] = value;
    }

    get duration() {
        if(this.isTimeline) {
            let maxDuration = 0;
            for(const animation of this.animations) {
                maxDuration = Math.max(maxDuration, animation.duration);
            }
            return maxDuration;
        }

        return this.state[1];
    }

    get finished() {
        return this.state[7] === 2;
    }

    get running() {
        return this.state[7] === 0;
    }

    get paused() {
        return this.state[7] === 1;
    }

    set progress(value) {
        this.state[0] = value * this.duration;
    }

    get progress() { return Math.min(1, Math.max(0, (this.state[0] - this.delay) / this.duration)); }

    set delay(value) {
        this.state[8] = value;
    }

    get delay() { return this.state[8] }

    set time(value) {
        this.state[0] = value;
    }

    get time() { return this.state[0] }

    renderCallback(delta, now) {
        this.advance(delta);
    }

    destroy() {
        this.stop(true);
    }

    static {
        LS.register(this, { name: "Animation2", global: true });

        this.GlobalTicker = new LS.Util.FrameScheduler((delta) => {
            // Update all active animations
            for(const animation of Animation.animations) {
                animation.advance(delta);
            }

            if(Animation.animations.size === 0) {
                Animation.GlobalTicker.stop();
            }
        });
    }

    static DEFAULT_DURATION = 450;
    static DEFAULT_EASING   = 'linear(0, 0.0018, 0.007 1.17%, 0.0334, 0.0758, 0.1306 5.54%, 0.2505 8.16%, 0.6477 16.03%, 0.7622 18.65%, 0.8498, 0.9229 23.32%, 0.9878 25.94%, 1.0308 28.27%, 1.0643 30.9%, 1.0791, 1.0886 34.39%, 1.094, 1.0944 38.48%, 1.0903 40.81%, 1.0814 43.43%, 1.0362 53.05%, 1.0184 57.42%, 1.0059, 0.9976 65.58%, 0.9925 70.25%, 0.991 75.79%, 0.9996 99.98%)';

    // Global animations
    /** @type {Set<Animation>} */
    static animations = new Set;

    // Active DOM animations
    static activeAnimations = new WeakMap();

    // --- Animation 1 API

    static async fadeIn(target, direction = null, duration = LS.Animation2.DEFAULT_DURATION, preserveTransform = false) {
        if(!target) return;

        let existing = this.activeAnimations.get(target);
        if(!existing) {
            this.activeAnimations.set(target, (existing = {}));
        }

        if(existing.fade) existing.fade.cancel(), existing.fade = null;

        if(duration < 1) {
            target.style.display = 'none';
            return;
        }

        target.classList.add('animating');

        // todo...
    }
    
    static async fadeOut(target, direction = null, duration = LS.Animation2.DEFAULT_DURATION, preserveTransform = false) {
        if(!target) return;

        // todo...
    }

    static directions = {
        up: { translate: "0 10px" },
        down: { translate: "0 -10px" },
        left: { translate: "-10px 0" },
        right: { translate: "10px 0" },
        forward: { scale: 1.1 },
        backward: { scale: 0.9 },
        upForward: { translate: "0 10px", scale: 1.1 },
        upBackward: { translate: "0 10px", scale: 0.9 },
        downForward: { translate: "0 -10px", scale: 1.1 },
        downBackward: { translate: "0 -10px", scale: 0.9 },
        leftForward: { translate: "-10px 0", scale: 1.1 },
        leftBackward: { translate: "-10px 0", scale: 0.9 },
        rightForward: { translate: "10px 0", scale: 1.1 },
        rightBackward: { translate: "10px 0", scale: 0.9 }
    };

    static EASING = {
        'linear': t => t,
        'ease': t => t<.5 ? 2*t*t : -1+(4-2*t)*t,
        'ease-in': t => t*t,
        'ease-out': t => t*(2-t),
        'ease-in-out': t => t<.5 ? 2*t*t : -1+(4-2*t)*t,
        'ease-in-sine': t => 1 - Math.cos((t * Math.PI) / 2),
        'ease-out-sine': t => Math.sin((t * Math.PI) / 2),
        'ease-in-out-sine': t => -(Math.cos(Math.PI * t) - 1) / 2,
        'ease-in-cubic': t => t*t*t,
        'ease-out-cubic': t => 1 - Math.pow(1 - t, 3),
        'ease-in-out-cubic': t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2,
        'ease-in-quart': t => t*t*t*t,
        'ease-out-quart': t => 1 - Math.pow(1 - t, 4),
        'ease-in-out-quart': t => t < 0.5 ? 8*Math.pow(t,4) : 1 - Math.pow(-2*t + 2, 4) / 2,
        'ease-in-quint': t => t*t*t*t*t,
        'ease-out-quint': t => 1 - Math.pow(1 - t, 5),
        'ease-in-out-quint': t => t < 0.5 ? 16*Math.pow(t,5) : 1 - Math.pow(-2*t + 2, 5) / 2,
        'ease-in-expo': t => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
        'ease-out-expo': t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
        'ease-in-out-expo': t => t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20*t - 10) / 2 : (2 - Math.pow(2, -20*t + 10)) / 2,
        'ease-in-circ': t => 1 - Math.sqrt(1 - Math.pow(t, 2)),
        'ease-out-circ': t => Math.sqrt(1 - Math.pow(t - 1, 2)),
        'ease-in-out-circ': t => t < 0.5 ? (1 - Math.sqrt(1 - Math.pow(2*t, 2))) / 2 : (Math.sqrt(1 - Math.pow(-2*t + 2, 2)) + 1) / 2,
        'ease-in-back': t => (2.70158 * t * t * t) - (1.70158 * t * t),
        'ease-out-back': t => 1 + (2.70158 * Math.pow(t - 1, 3)) + (1.70158 * Math.pow(t - 1, 2)),
        'ease-in-out-back': t => t < 0.5 ? (Math.pow(2 * t, 2) * ((2.5949095) * 2 * t - 2.5949095)) / 2 : (Math.pow(2 * t - 2, 2) * ((2.5949095) * (t * 2 - 2) + 2.5949095) + 2) / 2,
        'ease-in-bounce': t => 1 - Animation.EASING['ease-out-bounce'](1 - t),
        'ease-out-bounce': t => {
            const n1 = 7.5625, d1 = 2.75;
            if (t < 1 / d1) return n1 * t * t;
            else if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
            else if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
            return n1 * (t -= 2.625 / d1) * t + 0.984375;
        },
        'ease-in-out-bounce': t => t < 0.5? (1 - Animation.EASING['ease-out-bounce'](1 - 2*t)) / 2: (1 + Animation.EASING['ease-out-bounce'](2*t - 1)) / 2,
        'spring': t => 1 - Math.cos(t * Math.PI * (0.2 + 2.5 * t * t * t)) * Math.exp(-t * 6),
    }
}

/**
 * Timeline that can contain multiple animations.
 * Has the same controls as Animation.
 * 
 * @example
 * const timeline = new Animation.Timeline([
 *     new Animation([{ value: 0 }, { value: 1 }], { duration: 1000 }),
 *     new Animation([{ value: 1 }, { value: 0 }], { duration: 1000, delay: 500 })
 * ]);
 * 
 * timeline.start();
 * 
 * // Await all animations
 * await timeline.promise;
 * 
 * @extends Animation
 */
class AnimationTimeline extends Animation {
    /** @type {Set<Animation>} */
    animations = new Set;
    ref = 0;

    isTimeline = true;

    constructor(animations, options = {}, parent = Animation) {
        super(null, options, null, parent, true);
        this.addAnimations(animations);
        this.keyframes = null;
    }

    addAnimations(animations) {
        if(!Array.isArray(animations)) throw new Error("Animations to add must be an Array");

        for(let animation of animations) {
            if(!(animation instanceof Animation)) {
                if(Array.isArray(animation)) {
                    animation = new Animation(animation[0], animation[1], animation[2], this);
                } else {
                    animation = new Animation(animation.keyframes, animation.options, animation.target, this);
                }
            }

            animation.parent = this;
            this.animations.add(animation);
        }
    }

    /**
     * Remove an animation from the timeline.
     * @param {Animation} animation - The animation to remove.
     * @param {boolean} destroy - Whether to destroy the animation.
     */
    removeAnimation(animation, destroy = true) {
        this.animations.delete(animation);
        animation.pause();
        animation.parent = null;
        if(destroy) animation.destroy();
    }

    destroy() {
        super.destroy();

        for(const animation of this.animations) {
            if(animation) animation.destroy();
        }

        this.animations = null;
        this.ref = null;
    }
}

Animation.Timeline = AnimationTimeline;

/*@ls-export*/ if (typeof module !== "undefined" && module.exports) {
    module.exports = Animation;
}