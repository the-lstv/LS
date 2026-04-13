/**
 * This file is responsible for rendering the LS demo page ("unified demo experience"),
 * consistently across all versions of LS via adaptors.
 * 
 * It's not a demo or example in itself, though I will do my best to keep it clean and well commented to be a good reference
 */

const LS_VERSION = LS.v; // Major version

const demo = {
    /**
     * Sidebar contents
     */
    tree: [
        {
            label: "Introduction",
            
        }
    ]
}

// I'm keeping this separate in case I'll make it possible to hot-swap LS versions
function render() {
    // Render the sidebar

    
}

// Global one-time main function
function init() {
    render();
}

init();