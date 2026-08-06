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
| LS Core 6.0.0 | ★★★★★ (5/5) | In a stable & maintainable state
| LS.Color/ColorView | ★★★★★ (5/5) | Maybe does a bit too much :)
| LS.EventEmitter (builtin) | ★★★★★ (5/5) | Great event system.
| LS.Tooltips | ★★★★★ (5/5) | Simple and effective, though missing some features
| LS.Util.TouchHandle | ★★★★★ (5/5) | Solid utility for all kinds of touch/mouse interactions.
| LS.Modal | ★★★★☆ (4/5) | Solid, fast, simple. May need some small tweaks.
| LS.Resize | ★★★★☆ (4/5) | Functional and extensive in features.
| LS.Toast | ★★★★☆ (4/5) | Simple
| LS.Multipane | ★★★★☆ (4/5) | Not bad but lacks some features.
| LS.Stack/StackItem | ★★★★☆ (4/5) | Simple
| LS.Knob | ★★★★☆ (4/5) | Extensive feature set, pretty robust
| LS.TimelineGL | ★★★★☆ (4/5) | Recently fully revamped, has a few slight bugs
| LS.Patcher | ★★★★☆ (4/5) | New component, needs rendering optimizations
| LS.Tree | ★★★★☆ (4/5) | Stable, but might still need some polishing.
| LS.Animation | ★★★★☆ (4/5) | Works, but way too few features (being replaced by LS.Animation2)
| LS.Menu | ★★★★☆ (4/5) | Recently refactored (further work could be done to reduce per-instance overhead)
| LS.ShortcutManager (builtin) | ★★★☆☆ (3/5) | Needs API solidification, incomplete
| LS.Reactive | ★★★☆☆ (3/5) | Solid code for what it does, but needs a strategy redesign
| LS.Tabs | ★★★☆☆ (3/5) | Not terrible but could be better.
| LS.AutomationGraph | ★★★☆☆ (3/5) | Recently migrated, possibly unstable
| LS.Context (builtin) | ★★★☆☆ (3/5) | Too opinionated but functional
| LS.CompileTemplate (builtin) | ★★★☆☆ (3/5) | Experimental
| LS.Range | ★★★☆☆ (3/5) | Functional, but code review needed
| LS.ImageCropper | ★★★☆☆ (3/5) | Rushed but functional. Not enough attention has been given.
| LS.GL | ★★★☆☆ (3/5) | Experimental stage
| LS.DragDrop | ★★☆☆☆ (2/5) | Recently migrated from v3, needs refactoration, but is more or less useless now.
| LS.Network | ★★☆☆☆ (2/5) | Just a WebSocket wrapper as of now
| LS.i18n | ★★☆☆☆ (2/5) | Work needs to be done here
| LS.Node | ★☆☆☆☆ (1/5) | Doesn't really do anything yet
| LS.Native | ★☆☆☆☆ (1/5) | Deprecated
| LS.Animation2 | ☆☆☆☆☆ (?) | Incomplete
| LS.Layout | ☆☆☆☆☆ (?) | Incomplete
| LS.WindowManager | ☆☆☆☆☆ (?) | Incomplete
| LS.CommandPalette | ☆☆☆☆☆ (?) | Incomplete
| LS.ColorPicker | ☆☆☆☆☆ (?) | Incomplete
| LS.SPA | ☆☆☆☆☆ (-) | Unreleased. Currently functional only in a specific environment.

Misc utilities or smaller components (all built-in):

| Item  | Quality Rating | Notes |
|----------------|-----------------|----------------|
| LS.Util.FrameScheduler | ★★★★★ (5/5) | Good feature set.
| LS.Util.parseURLParams | ★★★★★ (5/5) | Ridiculously efficient
| LS.Util.emmetParser | ★★★★☆ (4/5) | Works well and is fast enough
| LS.Util.parseJSONC | ★★★★☆ (4/5) | Works, simple and small enough
| LS.Util.clone | ★★★★☆ (4/5) | Faster than klona and has more features. I'm happy.
| LS.Util.staticDefaults | ★★★☆☆ (3/5) | Works but performance could be improved
| LS.Util.sanitize | ★★★☆☆ (3/5) | Works but performance could be improved
| LS.Util.normalizePath | ★★★☆☆ (3/5) | Outdated code, but very simple
| LS.Util.RunOnce | ★★★★★ (5/5) | Stupid simple.
| LS.Util.Switch | ★★★★★ (5/5) | Stupid simple.
| LS.Util.ElementSwitch | ★★★★★ (5/5) | Stupid simple.
| LS.Util.normalize | ★★★★★ (5/5) | Stupid simple.
| LS.Util.copy | ★★★★★ (5/5) | Stupid simple.
| LS.Util.validateUUID | ★★★★★ (5/5) | Fast.
| LS.SPA.Router | ★★★★☆ (4/5) | Nice router and matcher.

<br>
<br>

## How I rate components
I have a certain software engineering standard. I rate components objectively based on how they meet these standards. The variables include:
- Code quality (cleanliness, maintainability, readability, architecture/layout, bloat, coding style)
- Feature set (does it do what it is supposed to do, and does it have all the features one would expect)
- Performance (I have very strict performance & efficiency standards - components must be light, not do unexpected work, and be fast on all devices)
- Test coverage & stability (I test components extensively in various scenarios and edge cases. If a component is not tested enough, it will be rated lower, even if it performs well in other areas.)


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
- LS.Toolbox (crazy ideas (like hello? a full shell emulator, desktop environment, and integrated debugger in a single component?), but never proved to be useful and was discontinued)
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