/**
 * This file is responsible for rendering the LS demo page ("unified demo experience"),
 * consistently across all versions of LS via adaptors.
 * 
 * It's not a demo or example in itself, though I will do my best to keep it clean and well commented to be a good reference
 */

const LS_VERSION = LS.v; // Major version

const banners = {
    5: "https://cdn.extragon.cloud/file/9d35fb2c1bd2482b.webp",
    6: "https://cdn.extragon.cloud/file/19613b60f986c5f6.webp"
}

function section(title, inner) {
    return {
        tag: "section",
        class: "demo-section",
        inner: [{ tag: "h1", inner: title }, inner]
    }
}

function divider(inner, options = {}) {
    return {
        tag: "ls-div",
        inner,
        ...options
    }
}

// I'm keeping this separate in case I'll make it possible to hot-swap LS versions
// ffs i just realized my comments sound like AI, i swear they are not
// í need to start recording my keystrokes or something
function render() {
    // Render the sidebar

    const sidebar = document.querySelector(".ls-sidebar-items");
    const root = LS.Create(".ls-sidebar-content", {
        inner: [
            section([(banners[LS_VERSION] && { tag: "img", src: banners[LS_VERSION], alt: "Banner" }), { tag: "br" }, "LS", { tag: "span", style: "color: var(--accent)", inner: "v" + LS_VERSION }], [

                { tag: "h2", inner: "Buttons" },

                divider([
                    { emmet: "button>i.fa.fa-floppy-disk+{Button}" },
                    { emmet: "button[%loading]{Loading button}" },
                    { emmet: "button.elevated{Elevated button}" },
                    { emmet: "button.outline{Outlined button}" },
                    { emmet: "button.clear{Clear button}" },
                ]),

                divider([
                    { emmet: "button.pill{Pill button}" },
                    { emmet: "button.pill[%loading]{Loading button}" },
                    { emmet: "button.pill.elevated{Elevated button}" },
                    { emmet: "button.pill.outline{Outlined button}" },
                    { emmet: "button.pill.clear{Clear button}" },
                ]),

                divider([
                    { emmet: "button.circle>i.fa.fa-plus" },
                    { emmet: "button.circle[%loading]>i.fa.fa-plus" },
                    { emmet: "button.circle.elevated>i.fa.fa-plus" },
                    { emmet: "button.circle.outline>i.fa.fa-plus" },
                    { emmet: "button.circle.clear>i.fa.fa-plus" },
                ]),

                divider([
                    { emmet: "button.square>i.fa.fa-plus" },
                    { emmet: "button.square[%loading]>i.fa.fa-plus" },
                    { emmet: "button.square.elevated>i.fa.fa-plus" },
                    { emmet: "button.square.outline>i.fa.fa-plus" },
                    { emmet: "button.square.clear>i.fa.fa-plus" },
                ]),

                { tag: "h2", inner: "Inputs" },

                divider([
                    { emmet: "input[placeholder='Text input']" },
                ]),

                divider([
                    { tag: "textarea", placeholder: "Textarea" },
                ]),

                divider([
                    { emmet: "label.ls-checkbox{Checkbox}>input[type=checkbox]+span" },
                ]),

                divider([
                    { emmet: "label.ls-switch{Switch}>input[type=checkbox]+span" },
                ]),

                divider([
                    { emmet: "label.ls-radio{Radio}>input[type=radio name=radio]+span" },
                    { emmet: "label.ls-radio{Radio}>input[type=radio name=radio]+span" },
                ]),

                divider([
                    { tag: "ls-select", options: [
                        { value: "option1", text: "Option 1" },
                        { value: "option2", text: "Option 2" },
                        { value: "option3", text: "Option 3" }
                    ] },
                ])
            ])
        ]
    });
    
    document.querySelector(".ls-sidebar-content").replaceWith(root);

}

// Global one-time main function
function init() {
    render();
}

init();