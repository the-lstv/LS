/**
 * Lightweight component for creating responsive layouts.
 * 
 * @author Lukas
 * @version 1.0
 */

class Layout extends LS.Component {
    static { LS.register(this, { name: "Layout", id: "ls-layout", global: true }) }

    constructor(options = {}) {
        super();
    }

    static {
    }

    static sketch(layout) {
    }

    destroy() {
        super.destroy();
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = Layout;
}