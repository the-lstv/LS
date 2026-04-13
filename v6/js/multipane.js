/**
 * Component for managing complex multipane layouts.
 * Originally developed for my Video Editor, but it's so useful I made it into a standalone component.
 * @author Lukas
 */

LS.LoadComponent(class Multipane extends LS.Component {
    constructor(options = {}) {
        super();
    }

    destroy() {
        super.destroy();
    }
}, { name: "Multipane", id: "ls-multipane-layout", global: true });