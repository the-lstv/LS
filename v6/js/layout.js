/**
 * Lightweight component for creating layouts.
 * @author Lukas
 */

LS.LoadComponent(class Layout extends LS.Component {
    constructor(options = {}) {
        super();
    }

    static sketch(layout) {
    }

    destroy() {
        super.destroy();
    }
}, { name: "Layout", id: "ls-layout", global: true });