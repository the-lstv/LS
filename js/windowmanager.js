class WindowManager extends LS.Component {
    static { LS.register(this, { name: "WindowManager", global: true }) }

    constructor(options = {}){
        super();
    }
}

/*@ls-export*/ if (typeof module !== "undefined" && module.exports) {
    module.exports = WindowManager;
}
