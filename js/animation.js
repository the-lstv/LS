/**
 * Animation library for LS (legacy).
 * An updated version is being worked at, but will be released later on as it needs a lot more time to mature.
 * 
 * @version 1.0.0
 */

(() => {
    const transforms = {
        up: 'translateY(10px)',
        down: 'translateY(-10px)',
        left: 'translateX(10px)',
        right: 'translateX(-10px)',
        forward: 'scale(1.1)',
        backward: 'scale(0.9)',
    };

    function _applyImmediate(el, finalStyles = {}) {
        Object.assign(el.style, {
            transition: 'none',
            ...finalStyles
        });
        // Force style flush, then allow future transitions
        LS.Context.requestAnimationFrame(() => { el.style.transition = ''; });
    }

    function _isObject(object) {
        return object !== null && typeof object === 'object';
    }

    LS.LoadComponent({
        DEFAULT_DURATION: 300,
        DEFAULT_EASING: 'ease',

        // Users should have the choice to turn this setting on/off per-site.
        get prefersReducedMotion() {
            const saved = localStorage.getItem('ls-reduced-motion');
            return saved === 'true' ? true : saved === 'false' ? false : window.matchMedia? window.matchMedia('(prefers-reduced-motion: reduce)').matches: false;
        },

        set prefersReducedMotion(value) {
            if(value === null) {
                localStorage.removeItem('ls-reduced-motion');
            } else {
                localStorage.setItem('ls-reduced-motion', String(!!value));
            }
        },
        
        nextFrame() {
            return new Promise(r => LS.Context.requestAnimationFrame(() => LS.Context.requestAnimationFrame(r)));
        },

        clearTimers(element) {
            if (element && element._animationTimeouts) {
                for(let timeout of element._animationTimeouts) {
                    LS.Context.clearTimeout(timeout);
                }
                element._animationTimeouts.length = 0;
            }
        },

        clearTimer(element, timeout) {
            if (element && element._animationTimeouts) {
                LS.Context.clearTimeout(timeout);
                element._animationTimeouts.splice(element._animationTimeouts.indexOf(timeout), 1);
            }
        },

        addTimer(element, callback, delay) {
            if (!element) return;
            if (!element._animationTimeouts) element._animationTimeouts = [];

            const timeout = this.ctx.setTimeout(() => {
                callback();
                LS.Animation.clearTimer(element, timeout);
            }, delay);

            element._animationTimeouts.push(timeout);

            return timeout;
        },

        async transition(element, {
            from = {},
            to = {},
            duration = LS.Animation.DEFAULT_DURATION,
            easing = LS.Animation.DEFAULT_EASING,
            cleanup = null
        } = {}) {
            if (!element) return;
            LS.Animation.clearTimers(element);

            const animationId = Symbol();
            element._currentAnimationId = animationId;

            if (LS.Animation.prefersReducedMotion || duration === 0) {
                _applyImmediate(element, to);
                if (cleanup) cleanup();
                return;
            }

            // Apply start styles if any
            if(from) {
                element.style.transition = 'none';
                Object.assign(element.style, from);
                await LS.Animation.nextFrame();
                if (element._currentAnimationId !== animationId) return;
            }

            // Apply transition
            element.style.transition = Object.keys(to).map(prop => `${prop} ${duration}ms ${easing}`).join(', ');

            // Apply end styles
            Object.assign(element.style, to);

            return new Promise(resolve => {
                LS.Animation.addTimer(element, () => {
                    // Double check if we are still the active animation
                    if (element._currentAnimationId !== animationId) return;

                    if (cleanup) cleanup();
                    resolve();
                }, duration);
            });
        },

        fadeOut(element, duration = LS.Animation.DEFAULT_DURATION, direction = null) {
            if (!element) return Promise.resolve();

            const options = _isObject(duration) ? duration : { duration, direction };

            const from = { pointerEvents: 'none' };
            const to = { opacity: "0" };

            if (options.direction) {
                from.transform = 'translateY(0) translateX(0) scale(1)';
                to.transform = transforms[options.direction] || options.direction;
            }

            return LS.Animation.transition(element, {
                from, to,
                duration: options.duration ?? LS.Animation.DEFAULT_DURATION,
                easing: options.easing ?? LS.Animation.DEFAULT_EASING,
                cleanup(){
                    element.style.display = 'none';
                }
            });
        },

        fadeIn(element, duration = LS.Animation.DEFAULT_DURATION, direction = null) {
            if (!element) return Promise.resolve();

            const options = _isObject(duration) ? duration : { duration, direction };

            const from = { display: '', transform: '' };
            const to = { opacity: "1" };

            if (options.direction) {
                from.transform = transforms[options.direction] || options.direction;
                to.transform = 'translateY(0) translateX(0) scale(1)';
            }

            return LS.Animation.transition(element, {
                from, to,
                duration: options.duration ?? LS.Animation.DEFAULT_DURATION,
                easing: options.easing ?? LS.Animation.DEFAULT_EASING,
                cleanup() {
                    element.style.pointerEvents = 'auto';
                }
            });
        },

        slideInToggle(newElement, oldElement = null, duration = LS.Animation.DEFAULT_DURATION) {
            if (!newElement) return;

            if (oldElement) {
                oldElement.classList.remove('visible');
                oldElement.classList.add('leaving');

                if (oldElement._leavingTimeout) LS.Context.clearTimeout(oldElement._leavingTimeout);
                if (newElement._enteringTimeout) LS.Context.clearTimeout(newElement._enteringTimeout);
                oldElement._leavingTimeout = this.ctx.setTimeout(() => {
                    oldElement.classList.remove('leaving');
                }, duration);
            }

            if (newElement._leavingTimeout) LS.Context.clearTimeout(newElement._leavingTimeout);
            if (newElement._enteringTimeout) LS.Context.clearTimeout(newElement._enteringTimeout);

            newElement.classList.add("entering");
            LS.Context.requestAnimationFrame(() => {
                newElement.classList.remove('leaving');
                newElement.classList.add("visible");

                newElement._enteringTimeout = this.ctx.setTimeout(() => {
                    newElement.classList.remove("entering");
                }, duration);
            });
        },

        transforms
    }, { name: "Animation", global: true });
})();
