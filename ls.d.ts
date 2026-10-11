/**
 * Extensions for LS.GL
 * 
 * @interface LSGLExtensions
 */
interface LSGLExtensions {
    // --- Extras
    readonly Sprite                : typeof import("./js/gl-extras.mjs").Sprite;
    readonly Mesh                  : typeof import("./js/gl-extras.mjs").Mesh;
    readonly MeshBuilder           : typeof import("./js/gl-extras.mjs").MeshBuilder;
    readonly Vector                : typeof import("./js/gl-extras.mjs").Vector;
    readonly VectorView            : typeof import("./js/gl-extras.mjs").VectorView;
    readonly Container             : typeof import("./js/gl-extras.mjs").Container;
    readonly LayoutContainer       : typeof import("./js/gl-extras.mjs").LayoutContainer;
    readonly Scene                 : typeof import("./js/gl-extras.mjs").Scene;
    readonly SDi                   : typeof import("./js/gl-extras.mjs").SDi;
    readonly Texture               : typeof import("./js/gl-extras.mjs").Texture;
    readonly TextureAtlas          : typeof import("./js/gl-extras.mjs").TextureAtlas;
    readonly AssetLoader           : typeof import("./js/gl-extras.mjs").AssetLoader;
    readonly GlImage               : typeof import("./js/gl-extras.mjs").GlImage;
    readonly BatchedSpriteRenderer : typeof import("./js/gl-extras.mjs").BatchedSpriteRenderer;
    readonly htmlParser            : typeof import("./js/gl-extras.mjs").htmlParser;

    // --- Text
    readonly WebGLTextEngine       : typeof import("./js/gl-text.mjs").WebGLTextEngine;
    readonly WebGLMSDFFont         : typeof import("./js/gl-text.mjs").WebGLMSDFFont;
}

/**
 * LS Modules
 * 
 * @interface LSModules
 */
interface LSModules {
    readonly Animation       : typeof import("./js/animation.mjs").default;
    readonly Animation2      : typeof import("./js/animation2.mjs").default;
    readonly AutomationGraph : typeof import("./js/automationgraph.mjs").default;
    readonly Color           : typeof import("./js/color.mjs").default;
    // readonly ColorPickr      : typeof import("./js/colorpickr.mjs").default;
    readonly CommandPalette  : typeof import("./js/commandpalette.mjs").default;
    readonly CompileTemplate : typeof import("./js/compiletemplate.mjs").default;
    readonly Effect          : InstanceType<typeof import("./js/effect.mjs").default>;
    readonly GL              : typeof import("./js/gl.mjs").default & LSGLExtensions;
    readonly i18n            : typeof import("./js/i18n.mjs").default;
    readonly ImageCropper    : typeof import("./js/imagecropper.mjs").default;
    readonly Knob            : typeof import("./js/knob.mjs").default;
    readonly Layout          : typeof import("./js/layout.mjs").default;
    readonly List            : typeof import("./js/list.mjs").default;
    readonly Menu            : typeof import("./js/menu.mjs").default;
    readonly Modal           : typeof import("./js/modal.mjs").default;
    readonly Multipane       : typeof import("./js/multipane.mjs").default;
    readonly Network         : typeof import("./js/network.mjs").default;
    readonly Patcher         : typeof import("./js/patcher.mjs").default;
    readonly Range           : typeof import("./js/range.mjs").default;
    readonly Reactive        : typeof import("./js/reactive.mjs").Reactive;
    readonly Resize          : typeof import("./js/resize.mjs").default;
    readonly ShortcutManager : typeof import("./js/shortcutmanager.mjs").default;
    readonly SoundBox        : typeof import("./js/soundbox.mjs").SoundBox;
    readonly SPA             : typeof import("./js/spa.mjs").default;
    readonly Tabs            : typeof import("./js/tabs.mjs").default;
    readonly Timeline        : typeof import("./js/timeline.mjs").default;
    readonly Toast           : typeof import("./js/toast.mjs").default;
    readonly Tooltips        : typeof import("./js/tooltips.mjs").default;
    readonly Tree            : typeof import("./js/tree.mjs").default;
    readonly WindowManager   : typeof import("./js/windowmanager.mjs").WindowManager;
    readonly Window          : typeof import("./js/windowmanager.mjs").Window;
}

declare const LS   : typeof import("./ls.mjs").default    & LSModules;
declare const LSGL : typeof import("./js/gl.mjs").default & LSGLExtensions;