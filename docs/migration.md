## Migrating from 5.x.x to 6.x.x

There are quite some breaking changes since v5. Here is how to migrate when upgrading to v6:

### Removed the legacy TinyFramework
The long deprecated helpers such as LS.Tiny, Q, O, S, N, M have all been removed.
Most of them now live under the LS namespace:
- Q -> LS.Select (fully compatible)
- O -> LS.SelectOne (fully compatible)
- S -> *removed; you can now use Element.applyStyle or the style property of LS.Create*
- N -> LS.Create (fully compatible, though there are now some new modern ways of using this API, which may be considered when migrating)
- M -> LS.Misc (compatible though deprecated)
- LS.Tiny -> *removed*

### Removed shared event listeners for lastKey, shiftDown, controlDown, mouseDown (under LS.Misc)
Any usage of APIs like LS.Misc.mouseDown should be replaced.

### Removed v4 legacyEvents from the TouchHandle API
If you did not use legacy events, you can ignore this

### Removed LS.Util.map
This API wasn't really used nor documented anywhere.

### Removed many TinyFramework helper methods
Element.isInView, Element.isEntirelyInView, Element.on, Element.off, Element.get, Element.getAll, Element.attr, Element.delAttr, Element.wrapIn and Element.clear

### Removed enforceContextSafety option
Replaced with experimental Context.debugEnforceContextSafety() and Context.debugWarnContextSafety() methods intended for debugging purposes.

### Every component now extends LS.Context, and DestroyableComponent is deprecated.
Unless you have been defining custom components, this should not affect you, and you can now use the Context API anywhere.
Additionally, due to this, Component.ctx is now deprecated as all components now are their own "ctx", so all usage such as this.ctx.setTimeout should now be replaced with a direct this.setTimeout call, for example.

### Removed LS.Color.all and LS.Color.randomAccent methods
- Replacement for LS.Color.randomAccent is LS.Color.setAccent(LS.Color.random());
- LS.Color.all is removed without replacement (colors are now fully dynamic), but LS.Color.colors still exists holding manually defined colors.

### [state] attribute is now [data-ls-state]
- Replace all occurrences of [state] with [data-ls-state] in your HTML and CSS. This change was made to avoid conflicts with the HTML standards and for better clarity.