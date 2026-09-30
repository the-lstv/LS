const lerp = (a, b, t) => a + (b - a) * t;

console.warn("LS.Animation2 is experimental");

/**
 * CPU animations for animating basically anything.
 * 
 * Todo: blending, groups, initial values, sync with parent time, & optimize advancing
 * 
 * For CSS animations, you should use WAAPI methods instead.
 */
class Animation {
    // Global animations
    static animations = new Set;

    static {
        LS.register(this, { name: "Animation2", global: true });

        this.GlobalTicker = new LS.Util.FrameScheduler((delta) => {
            // Update all active animations
            for(const animation of Animation.animations) {
                animation.advance(delta);
            }
        });

        this.GlobalTicker.start();
    }

    static DEFAULT_DURATION = 450;
    static DEFAULT_EASING   = 'linear(0, 0.0018, 0.007 1.17%, 0.0334, 0.0758, 0.1306 5.54%, 0.2505 8.16%, 0.6477 16.03%, 0.7622 18.65%, 0.8498, 0.9229 23.32%, 0.9878 25.94%, 1.0308 28.27%, 1.0643 30.9%, 1.0791, 1.0886 34.39%, 1.094, 1.0944 38.48%, 1.0903 40.81%, 1.0814 43.43%, 1.0362 53.05%, 1.0184 57.42%, 1.0059, 0.9976 65.58%, 0.9925 70.25%, 0.991 75.79%, 0.9996 99.98%)';

    keyframes = [];
    state     = [/*Time*/0, /*Duration*/0, /*Easing*/0, /*Speed (negative = reverse, 0 = paused, positive = forwards)*/0, /*Repeat*/0, /*Repeat mode*/0, /*Ephemeral*/true, /*State running, paused, stopped*/2];

    /**
     * @type {Promise}
     */
    promise   = null;
    resolve   = null;

    parent = null;

    target = null;

    constructor(keyframes = [], options = {}, target = null, parent = Animation) {
        this.keyframes = keyframes;
        this.parent    = parent;

        if(parent) {
            parent.animations.add(this);
        }

        this.target = options.target || target;

        if(options) {
            this.state[0] = (-options.delay      || 0) + (options.offset || 0);
            this.state[1] =   options.duration   || 0;
            this.state[2] =   options.easing     || 0;
            this.state[3] =   options.speed      || 1;
            this.state[4] =   options.repeat     || 0;
            this.state[5] =   options.repeatMode || 0;
            this.state[6] =   options.ephemeral  !== false;
        }
    }

    /**
     * Animate something with an ephemeral animation.
     * 
     * @example
     * Animation.animate((value) => console.log(value), [{ value: 0 }, { value: 1, at: 0.5 }], { duration: 1000, easing: "ease-in" });
     * 
     * @example
     * const animation = Animation.animate({ opacity: 0 }, [{ opacity: 0 }, { opacity: 1 }, { opacity: 0.5, easing: "ease-out" }], { duration: 1000, easing: "ease-in" });
     * await animation.promise;
     * 
     * @returns {Animation} Ephemeral animation
     */
    static animate(target, keyframes = [], options = {}) {
        options.ephemeral ??= true;

        const animation = new Animation(keyframes, options, target, this);
        animation.start();
        return animation;
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

        const duration = stateObj[1];
        const repeat = stateObj[4];
        const repeatMode = stateObj[5];
        const state = stateObj[7];

        if(!parentState && state > 0) {
            // Paused
            return;
        }

        stateObj[0] = (parentState? parentState[0]: stateObj[0] + delta) * stateObj[3];

        let time = stateObj[0];
        if(time < 0) {
            // Delay
            return;
        }

        console.log("advancing timeline", time);

        if(this.isTimeline) {
            for(const animation of this.animations) {
                animation.advance(delta, stateObj);
            }
            return;
        }

        if(time >= duration) {
            if(repeat > 0) {
                time = stateObj[0] = 0;
                stateObj[4]--;
            } else {
                this.stop();
                return;
            }
        }

        // Calculate progress
        let progress = Math.min(1, Math.max(0, time / duration));

        // Apply easing
        const globalEasing = stateObj[2];
        if(typeof globalEasing === "function") progress = globalEasing(progress);

        // Update keyframes
        // todo: optimize this & add initial values/forward fill/different modes etc.

        let keyframeIndex = 0;

        for (let i = 0; i < this.keyframes.length - 1; i++) {
            const at = this.keyframes[i].at         ??  i      / (this.keyframes.length - 1);
            const nextAt = this.keyframes[i + 1].at ?? (i + 1) / (this.keyframes.length - 1);

            if (progress >= at && progress <= nextAt) {
                keyframeIndex = i;
                break;
            }
        }

        const keyframe       = this.keyframes[keyframeIndex];
        const nextKeyframe   = this.keyframes[keyframeIndex + 1];
        const keyframeAt     =     keyframe?.at ??  keyframeIndex      / (this.keyframes.length - 1);
        const nextKeyframeAt = nextKeyframe?.at ?? (keyframeIndex + 1) / (this.keyframes.length - 1);

        let keyframeProgress = (progress - keyframeAt) / (nextKeyframeAt - keyframeAt);
        const keyframeType = typeof keyframe;

        if (keyframeType === "function") {
            keyframe(keyframeProgress, progress);
        }

        else if (keyframeType === "object" && keyframe !== null) {
            if(this.target) {
                if (keyframe?.easing) {
                    const easingFn = typeof keyframe.easing === "string"? Animation.EASING[keyframe.easing]: keyframe.easing;
                    if(typeof easingFn === "function") keyframeProgress = easingFn(keyframeProgress);
                }

                for(const prop in keyframe) {
                    if (prop === "easing" || prop === "at") continue;

                    const value = lerp(keyframe[prop], nextKeyframe[prop], keyframeProgress);

                    if(typeof this.target === "function") {
                        this.target(prop, value, keyframeProgress, progress);
                    } else if(this.target instanceof HTMLElement) {
                        // We could process CSS values, but CSS animations should use WAAPI anyways
                        this.target.style[prop] = value;
                    } else {
                        this.target[prop] = value;
                    }
                }
            }
        }
        
        else if (keyframeType === "number") {
            if(typeof this.target === "function") {
                this.target(lerp(keyframe, nextKeyframe, keyframeProgress), keyframeProgress, progress);
            }
        }

        if(time >= duration) {
            this.stop();
        }
    }

    start(time = 0) {
        if(time !== null) this.state[0] = time;
        this.state[7] = 0;

        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
        });

        if(this.parent && this.parent instanceof AnimationTimeline) {
            this.parent.ref++;
        }

        if(typeof this.state[2] === "string") {
            this.state[2] = Animation.EASING[this.state[2]] || Animation.EASING.linear;
        }
    }

    stop() {
        this.state[7] = 2;
        if(this.resolve) this.resolve();
        this.resolve = null;

        if(this.parent && this.parent.destroyed) this.parent = null;

        // We can stop the ticker if no animations are running
        if(this.parent && this.parent instanceof AnimationTimeline) {
            this.parent.ref--;
            if(this.parent.ref <= 0) this.parent.stop();
        }

        if(this.state[6]) {
            this.destroy(false);
        }
    }

    pause() {
        this.state[7] = 1;
    }

    resume() {
        if(this.state[7] === 2) return this.start();
        this.state[7] = 0;
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

    get duration() { return this.state[1] }

    set progress(value) {
        this.state[0] = value * this.state[1];
    }

    get progress() { return this.state[0] / this.state[1] }

    set time(value) {
        this.state[0] = value;
    }

    get time() { return this.state[0] }

    renderCallback(delta, now) {
        this.advance(delta);
    }

    destroy(_stop = true) {
        if(this.destroyed) return;
        this.destroyed = true;

        if(_stop) this.stop();

        if(this.parent) {
            this.parent.animations.delete(this);
        }

        this.keyframes = null;
        this.state     = null;
        this.promise   = null;
        this.resolve   = null;
        this.parent    = null;
        this.target    = null;
    }

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

class AnimationTimeline extends Animation {
    /**
     * @type {Animation[]}
     */
    animations = new Set;
    ref = 0;

    isTimeline = true;

    constructor(animations) {
        super();
        this.addAnimations(animations);
        this.keyframes = null;
    }

    addAnimations(animations) {
        if(!Array.isArray(animations)) throw new Error("Animations to add must be an Array");

        for(let animation of animations) {
            if(!(animation instanceof Animation)) {
                if(Array.isArray(animation)) {
                    animation = new Animation(animation[0], animation[1], animation[2]);
                } else {
                    animation = new Animation(animation.keyframes, animation.options, animation.target);
                }
            }

            animation.parent = this;
            this.animations.add(animation);
        }
    }

    removeAnimation(animation, destroy = true) {
        this.animations.delete(animation);
        animation.pause();
        animation.parent = null;
        if(destroy) animation.destroy();
    }

    allFinished() {
        return Promise.all(this.animations.map(a => a.promise));
    }

    destroy() {
        super.destroy();

        if(this.destroyed) return;

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