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

    const activeAnimations = new WeakMap();

    LS.LoadComponent({
        DEFAULT_DURATION: 400,
        DEFAULT_EASING: 'cubic-bezier(0.33, 1, 0.68, 1)',

        // Users should have the choice to turn this setting on/off per-site.
        get prefersReducedMotion() {
            const saved = localStorage.getItem('ls-reduced-motion');
            return saved === 'true' ? true : saved === 'false' ? false : window.matchMedia? window.matchMedia('(prefers-reduced-motion: reduce)').matches: false;
        },

        isRendered(element) {
            if (!element || !element.isConnected) return false;
            if (getComputedStyle(element).display === 'none') return false;
            return element.getClientRects().length > 0;
        },

        set prefersReducedMotion(value) {
            if(value === null) {
                localStorage.removeItem('ls-reduced-motion');
            } else {
                localStorage.setItem('ls-reduced-motion', String(!!value));
            }
        },

        _cancelAll(element) {
            if (!element) return;
            element?.getAnimations?.().forEach(anim => anim.cancel());
            const pending = activeAnimations.get(element);
            if (pending) {
                pending.cancelled = true;
                activeAnimations.delete(element);
            }
        },

        async fadeOut(element, duration = LS.Animation.DEFAULT_DURATION, direction = null) {
            if (!element) return Promise.resolve();
            const options = typeof duration === 'object' && duration !== null ? duration : { duration, direction };

            this._cancelAll(element);

            const tracker = { cancelled: false };
            activeAnimations.set(element, tracker);

            element.classList.add('animating');

            const animation = element.animate([
                { opacity: 1, transform: 'translateY(0) translateX(0) scale(1)' },
                { opacity: 0, transform: direction ? (transforms[direction] || direction) : '' }
            ], {
                duration: options.duration ?? LS.Animation.DEFAULT_DURATION,
                easing: options.easing ?? LS.Animation.DEFAULT_EASING,
                fill: 'forwards'
            });

            try {
                await animation.finished;
                if (!tracker.cancelled && element.isConnected && this.isRendered(element)) {
                    animation.commitStyles();
                }
            } catch (e) {
                if (e.name !== 'AbortError') throw e;
            } finally {
                animation.cancel();
                element.classList.remove('animating');
                if (activeAnimations.get(element) === tracker) {
                    activeAnimations.delete(element);
                    if (!tracker.cancelled && element.isConnected) {
                        element.style.display = 'none';
                    }
                }
            }
        },

        async fadeIn(element, duration = LS.Animation.DEFAULT_DURATION, direction = null) {
            if (!element) return Promise.resolve();
            const options = typeof duration === 'object' && duration !== null ? duration : { duration, direction };

            this._cancelAll(element);

            const tracker = { cancelled: false };
            activeAnimations.set(element, tracker);

            element.style.display = '';
            element.classList.add('animating');

            const animation = element.animate([
                { opacity: 0, transform: direction ? (transforms[direction] || direction) : '' },
                { opacity: 1, transform: 'translateY(0) translateX(0) scale(1)' }
            ], {
                duration: options.duration ?? LS.Animation.DEFAULT_DURATION,
                easing: options.easing ?? LS.Animation.DEFAULT_EASING,
                fill: 'forwards'
            });

            try {
                await animation.finished;
                if (!tracker.cancelled && this.isRendered(element)) animation.commitStyles();
            } catch (e) {
                if (e.name !== 'AbortError') throw e;
            } finally {
                animation.cancel();
                element.classList.remove('animating');
                if (activeAnimations.get(element) === tracker) {
                    activeAnimations.delete(element);
                }
            }
        },

        async slideInToggle(newElement, oldElement = null, duration = LS.Animation.DEFAULT_DURATION) {
            if (!newElement) return;
            
            if (newElement === oldElement) {
                this._cancelAll(newElement);
                const tracker = { cancelled: false };
                activeAnimations.set(newElement, tracker);
                
                newElement.style.display = '';
                newElement.classList.add('animating');
                const animation = newElement.animate([
                    { opacity: 0 },
                    { opacity: 1 }
                ], {
                    duration,
                    easing: LS.Animation.DEFAULT_EASING,
                    fill: 'forwards'
                });
                
                try {
                    await animation.finished;
                    if (!tracker.cancelled && this.isRendered(newElement)) animation.commitStyles();
                } catch (e) {
                    if (e.name !== 'AbortError') throw e;
                } finally {
                    animation.cancel();
                    newElement.classList.remove('animating');
                    if (activeAnimations.get(newElement) === tracker) {
                        activeAnimations.delete(newElement);
                    }
                }
                return;
            }
            
            this._cancelAll(newElement);
            this._cancelAll(oldElement);

            const newTracker = { cancelled: false };
            const oldTracker = oldElement ? { cancelled: false } : null;
            
            activeAnimations.set(newElement, newTracker);
            if (oldElement) activeAnimations.set(oldElement, oldTracker);

            let oldAnimation;

            if (oldElement && oldElement.isConnected) {
                oldElement.classList.add('animating');
                oldAnimation = oldElement.animate([
                    { transform: 'translateX(0)', opacity: 1 },
                    { transform: 'translateX(-20px)', opacity: 0 }
                ], {
                    duration,
                    easing: LS.Animation.DEFAULT_EASING,
                    fill: 'forwards'
                });
            }

            newElement.style.display = '';
            newElement.classList.add('animating');
            const newAnimation = newElement.animate([
                { transform: 'translateX(20px)', opacity: 0 },
                { transform: 'translateX(0)',  opacity: 1 }
            ], {
                duration,
                easing: LS.Animation.DEFAULT_EASING,
                fill: 'forwards'
            });

            try {
                await Promise.all([
                    newAnimation.finished.catch(e => { if (e.name !== 'AbortError') throw e; }),
                    oldAnimation ? oldAnimation.finished.catch(e => { if (e.name !== 'AbortError') throw e; }) : Promise.resolve()
                ]);

                if (oldElement && oldElement.isConnected && !oldTracker.cancelled) {
                    if (this.isRendered(oldElement)) oldAnimation.commitStyles();
                    oldElement.style.display = 'none';
                }

                if (newElement.isConnected && !newTracker.cancelled && this.isRendered(newElement)) {
                    newAnimation.commitStyles();
                }
            } catch (e) {
                if (e.name !== 'AbortError') throw e;
            } finally {
                oldAnimation?.cancel();
                newAnimation.cancel();
                
                oldElement?.classList.remove('animating');
                newElement.classList.remove('animating');
                
                if (activeAnimations.get(newElement) === newTracker) {
                    activeAnimations.delete(newElement);
                }
                if (oldElement && activeAnimations.get(oldElement) === oldTracker) {
                    activeAnimations.delete(oldElement);
                }
            }
        },

        transforms
    }, { name: "Animation", global: true });
})();
