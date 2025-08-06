/**
 * Animation utilities for LS
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

    LS.LoadComponent({
        DEFAULT_DURATION: 300,

        fadeOut(element, duration = LS.Animation.DEFAULT_DURATION, direction = null) {
            duration = duration ?? LS.Animation.DEFAULT_DURATION;

            element.style.transition = `opacity ${duration}ms, transform ${duration}ms`;
            element.style.opacity = 0;
            element.style.pointerEvents = 'none';

            if (direction) {
                element.style.transform = transforms[direction] || '';
            }

            if (element._fadeOutTimeout) clearTimeout(element._fadeOutTimeout);
            element._fadeOutTimeout = setTimeout(() => {
                element.style.display = 'none';
            }, duration);
        },
    
        fadeIn(element, duration = LS.Animation.DEFAULT_DURATION, direction = null) {
            duration = duration ?? LS.Animation.DEFAULT_DURATION;

            element.style.display = '';

            if (direction) {
                element.style.transform = transforms[direction] || '';
            }
        
            if (element._fadeOutTimeout) clearTimeout(element._fadeOutTimeout);
            setTimeout(() => {
                element.style.transition = `opacity ${duration}ms, transform ${duration}ms`;
                element.style.opacity = 1;
                element.style.pointerEvents = 'auto';
                if (direction) element.style.transform = 'translateY(0) translateX(0) scale(1)';
            }, 0);
        },

        slideInToggle(newElement, oldElement = null, duration = LS.Animation.DEFAULT_DURATION) {
            if (oldElement) {
                oldElement.classList.remove('visible');
                oldElement.classList.add('leaving');
    
                if (oldElement._leavingTimeout) clearTimeout(oldElement._leavingTimeout);
                if (newElement._enteringTimeout) clearTimeout(newElement._enteringTimeout);
                oldElement._leavingTimeout = setTimeout(() => {
                    oldElement.classList.remove('leaving');
                }, duration);
            }
    
            if (newElement._leavingTimeout) clearTimeout(newElement._leavingTimeout);
            if (newElement._enteringTimeout) clearTimeout(newElement._enteringTimeout);

            newElement.classList.add("entering");
            setTimeout(() => {
                newElement.classList.remove('leaving');
                newElement.classList.add("visible");

                newElement._enteringTimeout = setTimeout(() => {
                    newElement.classList.remove("entering");
                }, duration);
            }, 0);
        },

        transforms
    }, { name: "Animation", global: true });
})();
