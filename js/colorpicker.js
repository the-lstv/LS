class ColorPicker extends LS.Component {
    static { LS.register(this, { name: "ColorPicker", global: true }) }

    constructor(options = {}){
        super();
    }
}

/*@ls-export*/ if (typeof module !== "undefined" && module.exports) {
    module.exports = ColorPicker;
}