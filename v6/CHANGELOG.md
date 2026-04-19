## Version 6.0.0
Major update (2026 release)!
- New components: LS.Icons, LS.Multipane, LS.Layout
- LS.Create now supports Emmet abbreviations! (eg. LS.Create("#myId>ul>li*3") instead of LS.Create("div", { id: "myId", ... }))
- Added LS.Util.parseEmmet
- [ ] Added UI effects
- Added sanitize option to LS.Create
- Optimized startup and reduced overhead
- Added LS.Icons support
- Added LS.Util.staticDefaults
- LS now has it's own [icon library](https://github.com/the-lstv/ls-icons)!
- Tabs: tab list can now be reordered by dragging with the reordableList option
- Tabs: tabs.add now returns the tab ID
- Enhancements to the default tab handle style
- LS.Tabs change event is now change instead of changed
- Deprecated the ambiguous LS.Color.autoScheme() in favor of LS.Color.autoSchemeEnabled
- Renamed LS.LoadComponent -> LS.register, LS.GetComponent -> LS.getComponentByName, and LS.UnregisterComponent -> LS.unregisterComponent for consistency (methods starting with lowercase).
- API changes: ESM export is now available (using the mjs extension), and browser compatibility level can be specified (?compat=legacy|modern|latest)
- General improvements
- EventEmitter.alias is now EventEmitter.aliasEvent for clarity
- Enhancements to LS.ImageCropper

**Breaking changes:**
- Removed legacy TinyFramework (LS.Tiny, Q, O, S, N, M). Now entirely under the LS namespace! (Temporarily, a "enableV5Compat" option exists that restores this.)
- Removed shared event listeners for lastKey, shiftDown, controlDown, mouseDown!
- Removed legacyEvents from TouchHandle API!
- Removed LS.Util.map
- Removed TinyFactory's isInView, isEntirelyInView, on, off, get, getAll, attr, delAttr, wrapIn and clear methods!
- Removed enforceContextSafety option, replaced with experimental Context.debugEnforceContextSafety() and Context.debugWarnContextSafety() methods intended for debugging purposes.
- Every component now extends LS.Context & DestroyableComponent is deprecated.
- No v5compat component will exist unlike v4compat, but this isn't a problem since the API differences aren't that major and it's mostly solved with aliases.
- LS.Native is deprecated in favor of a future API
- Removed LS.Color.all and LS.Color.randomAccent methods
- [state] attribute is now [data-ls-state]