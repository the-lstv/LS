# Component Ratings and Migration Status
This file documents the current and past components and rates their code quality, and tracks components that are in the process of being migrated & refactored from older versions.

## Quality Ratings of Built-in Components
Since each component in LS is like a full library on its own, we track their quality rating, since they may vary.
The goal is to have all built-in components reach the highest quality rating so that they are up to our standards.

#### TIP: v6 is comming sometime soon (sometime in 2026)! This will feature a huge refactor of the whole codebase, a rethink of the structure, and many optimizations/features, new UI system & cleaner code.

## Rating meaning
- **★★★★★ (5/5)** — Robust, clean, tested, and efficient. Suitable for production.
- **★★★★☆ (4/5)** — Solid and usable. May have some missing features, optimization work remaining, or parts of the API still settling. Or just not fully tested enough yet. Generally stable and reliable in production.
- **★★★☆☆ (3/5)** — Functional but experimental/incomplete. API may change and may have minor edge-case bugs. Use with caution in production.
- **★★☆☆☆ (2/5)** — Needs refactor or rewrite. Often migrated from older versions and not yet fully adapted, not recommended for production.
- **★☆☆☆☆ (1/5)** — Low quality / unfinished. Always avoid in production.
- **☆☆☆☆☆ (-/-)** — Work in progress, not rated yet.

**Builtin** = part of LS core and is not a separate component.

| Component  | Quality Rating | Notes |
|----------------|-----------------|----------------|
| LS.Color/ColorView | ★★★★★ (5/5) | Maybe does a bit too much :)
| LS.EventEmitter (builtin) | ★★★★★ (5/5) | Great event system.
| LS.Tooltips | ★★★★★ (5/5) | Simple and effective, though missing some features
| LS.Modal | ★★★★☆ (4/5) | Solid, fast, simple. May need some small tweaks.
| LS.Resize | ★★★★☆ (4/5) | Functional and extensive in features.
| LS.Toast | ★★★★☆ (4/5) | Simple
| LS.Multipane | ★★★★☆ (4/5) | Not bad but lacks some features.
| LS.Stack/StackItem | ★★★★☆ (4/5) | Simple
| LS.Knob | ★★★★☆ (4/5) | Extensive feature set, pretty robust
| LS.Timeline | ★★★★☆ (4/5) | Recently migrated and stable, bugs may still show up
| LS.Tree | ★★★★☆ (4/5) | Stable, but might still need some polishing.
| LS.Animation | ★★★★☆ (4/5) | Works, but way too few features (being replaced by LS.Animation2)
| LS.ShortcutManager (builtin) | ★★★☆☆ (3/5) | Needs API solidification, incomplete
| LS.Reactive | ★★★☆☆ (3/5) | Solid code for what it does, but needs a strategy redesign
| LS.Tabs | ★★★☆☆ (3/5) | Not terrible but could be better.
| LS.AutomationGraph | ★★★☆☆ (3/5) | Recently migrated, possibly unstable
| LS.Context (builtin) | ★★★☆☆ (3/5) | Too opinionated but functional
| LS.CompileTemplate (builtin) | ★★★☆☆ (3/5) | Experimental
| LS.Range | ★★★☆☆ (3/5) | Functional, but code review needed
| LS.ImageCropper | ★★★☆☆ (3/5) | Spaghetti/rushed but functional. Not much attention has been given to this component, but it works.
| LS.Menu | ★★★☆☆ (3/5) | In early development, requires some polishing and bug fixes
| LS.GL | ★★★☆☆ (3/5) | Experimental stage
| LS.DragDrop | ★★☆☆☆ (2/5) | Recently migrated from v3, needs refactoration, but is more or less useless now.
| LS.Network | ★★☆☆☆ (2/5) | Just a WebSocket wrapper as of now
| LS.i18n | ★★☆☆☆ (2/5) | Work needs to be done here
| LS.Node | ★☆☆☆☆ (1/5) | Doesn't really do anything yet
| LS.Native | ★☆☆☆☆ (1/5) | Deprecated
| LS.TimelineGL | ☆☆☆☆☆ (?) | Work in progress
| LS.Animation2 | ☆☆☆☆☆ (?) | Incomplete
| LS.Layout | ☆☆☆☆☆ (?) | Incomplete
| LS.Patcher | ☆☆☆☆☆ (?) | Incomplete
| LS.WindowManager | ☆☆☆☆☆ (?) | Incomplete
| LS.CommandPalette | ☆☆☆☆☆ (?) | Incomplete
| LS.ColorPicker | ☆☆☆☆☆ (?) | Incomplete
| LS.GLMultiShader | ☆☆☆☆☆ (-) | Moved to LS.GL

## Migration Status
Migration progress of older LS v3 components into v5.  
Components marked **Not Started** are not available yet and may be rejected.

| Component | Progress |
|---|---|
| LS.Sheet | Not Started
| LS.Workspace | Not Started
| LS.GraphGL | Not Started (worst code 😭)

## Deleted Components
These are ***very old*** LS v3 components that have been removed and not considered for migration, either due to very low quality or simply lack of usefulness. Their idea may be re-added in the future. Otherwise they have no significance other than historical purposes.
- LS.Toolbox (crazy ideas, but never proved to be useful)
- LS.Dialog (now a part of LS.Modal)
- LS.Manipulator (deemed unnecessary, was supposed to be "regex" for string manipulation)
- LS.Notif (low quality (incomplete, intrusive), replaced by LS.Toast)
- LS.React (replaced by LS.Reactive)
- LS.Terminal (low quality, robust libraries like xterm.js are better and well maintained)
- LS.Editor (low quality and unfinished, may be re-added in some way in the future, if time ever allows)
- LS.Steps (it was just tabs but with index controls. use LS.Tabs.)
- LS.Form (low quality implementation, internally LS.Steps with added form validation/collection.)
- LS.Chips (low quality and honestly quite useless)
- LS.Fragment (not very useful nor well implemented)
- LS.Debugger (never completed)
- LS.Menubar (never completed)
- LS.MultiSelect (implementation uncertain)
- LS.Present (yes, it was a DOM based presentation library. i made it in one evening for a school project out of hate for powerpoint)
- LS.Nav (functionally replaced by LS.Menu)