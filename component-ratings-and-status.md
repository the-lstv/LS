# Component Ratings and Migration Status
This file documents the current and past components and rates their code quality, and tracks components that are in the process of being migrated & refactored from older versions.

## Quality Ratings of Built-in Components
Since each component in LS is like a full library on its own, we track their quality rating, since they may vary.
The goal is to have all built-in components reach the highest quality rating so that they are up to our standards.

- 5/5 rating means robust, clean, tested and efficient code. It should work well in many scenarios.
- 4/5 rating means good code, but some areas may have not been fully optimized or there is a lack of features.
- 3/5 rating means average/experimental/incomplete code.
- 2/5 rating needs further improvement, refactoration or rewriting. This does not have to mean the code is non-functional. Code that has been migrated from older versions and not yet fully adapted also gets this rating.
- 1/5 rating means low quality or unfinished code and should be avoided in production.

Builtin = is part of the LS core and is not loaded separately nor is an installable/removable component.

| Component  | Quality Rating | Notes |
|----------------|-----------------|----------------|
| LS.Color/ColorView (builtin) | ★★★★★ (5/5)
| LS.EventEmitter (builtin) | ★★★★★ (5/5)
| LS.Modal | ★★★★☆ (4/5)
| LS.Reactive | ★★★★☆ (4/5) | Solid code, but needs design rework
| LS.Resize | ★★★★☆ (4/5)
| LS.ShortcutManager (builtin) | ★★★★☆ (4/5) | Needs API solidification
| LS.Tabs | ★★★★☆ (4/5)
| LS.Toast | ★★★★☆ (4/5)
| LS.Stack/StackItem | ★★★★☆ (4/5) | Simple
| LS.Tooltips | ★★★★☆ (4/5) | Recently updated
| LS.Knob | ★★★★☆ (4/5) | Extensive feature set, pretty robust, but needs a few touches
| LS.Timeline | ★★★★☆ (4/5) | Recently migrated and stable, bugs may still show up
| LS.Tiny | ★★★★☆ (4/5) | Deprecated remenant of older LS versions, but in parts still used widely
| LS.AutomationGraph | ★★★☆☆ (3/5) | Recently migrated, possibly unstable
| LS.GL | ★★★☆☆ (3/5) | Highly experimental
| LS.Context (builtin) | ★★★☆☆ (3/5) | Experimental/too opinionated
| LS.CompileTemplate (builtin) | ★★★☆☆ (3/5) | Experimental
| LS.GLMultiShader | ★★★☆☆ (3/5) | Incomplete
| LS.ImageCropper | ★★★☆☆ (3/5) | Slightly spaghetti/rushed though functional
| LS.Animation | ★★★☆☆ (3/5) | Incomplete
| LS.Menu | ★★★☆☆ (3/5) | In early development, messy code
| LS.DragDrop | ★★☆☆☆ (2/5) | Recently migrated from v3, needs refactoration
| LS.Network | ★★☆☆☆ (2/5) | Just a WebSocket wrapper as of now
| LS.Node | ★★☆☆☆ (2/5) | Doesn't really do anything yet
| LS.Tree | ★☆☆☆☆ (1/5) | Unfinished, unrelated code mixed in
| LS.Native | ★☆☆☆☆ (1/5) | Unfinished, very experimental and poor code

## Migration Status
Here we track the migration status of old components from LS v3 to v5.<br>
Components marked "Not Started" are not available yet and may be rejected at any point.

| Component  | Progress |
|----------------|-----------------|
| LS.Progress | In *Progress*
| LS.AutomationGraph | In Progress
| LS.Patchbay | In Progress
| LS.List | Not Started
| LS.Sheet | Not Started
| LS.Workspace | Not Started
| LS.Native | Not Started
| LS.GraphGL | Not Started (this one has the worst code of all 😭)

## Deleted Components
These are ***very old*** LS v3 components that have been removed and not considered for migration, either due to very low quality or simply lack of usefulness. Their idea may be re-added in the future.
- LS.Toolbox (crazy ideas, but never proved to be useful)
- LS.Dialog (now a part of LS.Modal)
- LS.Manipulator (deemed unnecessary)
- LS.Notif (low quality, replaced by LS.Toast)
- LS.React (replaced by LS.Reactive)
- LS.Terminal (low quality, robust libraries like xterm.js are better)
- LS.Editor (low quality and unfinished)
- LS.Steps (use LS.Tabs)
- LS.Form (low quality implementation)
- LS.Chips (low quality and quite useless)
- LS.Fragment (not very useful)
- LS.Debugger (never completed)
- LS.Menubar (never completed)
- LS.MultiSelect (currently i am not sure about the implementation)
- LS.Present (may be better to use custom logic)
- LS.Nav (functionally replaced by LS.Menu)