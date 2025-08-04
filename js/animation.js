/**
 * Animation utilities for LS
 * @version 1.0.0
 */

(() => {
    const transforms = {
        up: 'translateY(10px)',
        down: 'translateY(-10px)',
        left: 'translateX(10px)',
        right: 'translateX(-10px)'
    };

    LS.LoadComponent({
        fadeOut(element, duration = 300, direction = null) {
            duration = duration ?? 300;
        
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
    
        fadeIn(element, duration = 300, direction = null) {
            duration = duration ?? 300;
    
            element.style.display = '';
            
            if (direction) {
                element.style.transform = transforms[direction] || '';
            }
        
            if (element._fadeOutTimeout) clearTimeout(element._fadeOutTimeout);
            setTimeout(() => {
                element.style.transition = `opacity ${duration}ms, transform ${duration}ms`;
                element.style.opacity = 1;
                element.style.pointerEvents = 'auto';
                if (direction) element.style.transform = 'translateY(0) translateX(0)';
            }, 0);
        },
    
        slideInToggle(newElement, oldElement = null, duration = 300) {
            if (oldElement) {
                oldElement.classList.remove('visible');
                oldElement.classList.add('leaving');
    
                if (oldElement._leavingTimeout) clearTimeout(oldElement._leavingTimeout);
                oldElement._leavingTimeout = setTimeout(() => {
                    oldElement.classList.remove('leaving');
                }, duration);
            }
    
            if (newElement._leavingTimeout) clearTimeout(newElement._leavingTimeout);
            newElement.classList.remove('leaving');
            newElement.classList.add("visible");
        },

        transforms
    }, { name: "Animation", global: true });
})();