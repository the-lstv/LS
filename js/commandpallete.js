class CommandPalette extends LS.Component {
    static { LS.register(this, { name: "CommandPalette", global: true }) }

    constructor(options = {}){
        super();
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = CommandPalette;
}