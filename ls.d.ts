import type * as LSGL       from "./js/gl.mjs";
import type * as LSGLExtras from "./js/gl-extras.mjs";
import type * as LSGLText   from "./js/gl-text.mjs";

/**
 * Extensions for LS.GL
 * 
 * @interface LSGLExtensions
 */
interface LSGLExtensions {
    // --- Extras
    readonly Sprite                : typeof LSGLExtras.Sprite;
    readonly Mesh                  : typeof LSGLExtras.Mesh;
    readonly MeshBuilder           : typeof LSGLExtras.MeshBuilder;
    readonly Vector                : typeof LSGLExtras.Vector;
    readonly VectorView            : typeof LSGLExtras.VectorView;
    readonly InstanceSprite        : typeof LSGLExtras.InstanceSprite;
    readonly Container             : typeof LSGLExtras.Container;
    readonly LayoutContainer       : typeof LSGLExtras.LayoutContainer;
    readonly Scene                 : typeof LSGLExtras.Scene;
    readonly Texture               : typeof LSGLExtras.Texture;
    readonly TextureAtlas          : typeof LSGLExtras.TextureAtlas;
    readonly AssetLoader           : typeof LSGLExtras.AssetLoader;
    readonly GlImage               : typeof LSGLExtras.GlImage;
    readonly BatchedSpriteRenderer : typeof LSGLExtras.BatchedSpriteRenderer;
    readonly htmlParser            : typeof LSGLExtras.htmlParser;

    // --- Text
    readonly WebGLTextEngine       : typeof LSGLText.WebGLTextEngine;
    readonly WebGLMSDFFont         : typeof LSGLText.WebGLMSDFFont;
}

type LSGLType = LSGLExtensions & typeof import("./js/gl.mjs").default;

/**
 * LS Modules
 * 
 * @interface LSModules
 */
interface LSModules {
    // readonly ColorPicker      : typeof import("./js/colorpicker.mjs").default;
    readonly Animation       : typeof import("./js/animation.mjs").default;
    readonly Animation2      : typeof import("./js/animation2.mjs").default;
    readonly AutomationGraph : typeof import("./js/automationgraph.mjs").default;
    readonly Color           : typeof import("./js/color.mjs").default;
    readonly CommandPalette  : typeof import("./js/commandpalette.mjs").default;
    readonly CompileTemplate : typeof import("./js/compiletemplate.mjs").default;
    readonly Effect          : InstanceType<typeof import("./js/effect.mjs").default>;
    readonly GL              : LSGLType;
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

declare const LS   : typeof import("./ls.mjs").default & LSModules;
declare const LSGL : typeof LS.GL;

declare global {
    const LS   : typeof import("./ls.mjs").default & LSModules;
    const LSGL : typeof LS.GL;
}

// type LSMain = typeof import("./ls.mjs").default & LSModules;

// export type { LSMain };