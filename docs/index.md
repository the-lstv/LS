---
title: LS Documentation
description: Comprehensive documentation for LS, a flexible and feature-rich frontend/UI framework. Learn about its components, utilities, and how to get started with LS for your frontend development projects.
---

![Logo](https://cdn.extragon.cloud/file/19613b60f986c5f6.webp)

# What's LS?

LS is a flexible & feature-rich frontend/UI framework, that provides various components, utilities, and more.<br>
It is incredibly lightweight, fast, feature-rich, and designed to make frontend development enjoyable, while making your apps feel super smooth and performant, and significantly reduce bundle size/bloat.

<br>

## Quick feature overview:

- JS
    - Flexible UI components & component system
    - Performant event system (`LS.EventEmitter`) and lifecycle/context management (`LS.Context`)
    - Robust utilities (eg. `LS.Util.TouchHandle`, `LS.Util.FrameScheduler`, ...)
    - DOM manipulation tools (eg. `LS.Create`, `LS.Select`, ...)
    - Additional fully-featured libraries (`LS.Color`, ...)
    - & Much more, all while staying small in size and super fast!
- CSS
    - Dynamic color system with common variables, automatic light/dark mode, etc.
    - Full-featured UI styles

Either can be used independently or together (Eg. JS only, CSS only, or just include components you want to use. But, of course, they work the best together).

# Getting Started

Let's get started with some basics.<br>
There's a lot that LS can do, so there's also many things to look at based on what you need.

## Installation

Adding LS to your project is as easy as just adding any library.

### Method 1 (only when using the Akeno server):

[Akeno](https://github.com/the-lstv/akeno) is a powerful webserver developed by me, and thus works nicely together with LS.<br>

> [!NOTE]
> If you are not using Akeno, *skip to the second installation method* - if you are using a different server or environment, everything will work just fine, Akeno just makes it a bit more convenient.

All you need to do is to add an @use block like this to your HTML head tag:
```html
<head>
    <!-- Components are added into the square brackets ([]) as a comma separated list. -->
    <!-- Minimal import is @use(ls:version);, which adds just the core. Or @use(ls:version[*]); for all components. -->
    @use(ls:version[...components]);
</head>
```
Such as:
```html
<head>
    @use(ls:6.0.0-alpha.0[color, flat, animation, modal, tooltips, tabs]);
</head>
```

You can also import a specific component separately, excluding the core:
```html
@use (ls.js.ImageCropper:5.2.9);
```

Done - you are using LS! That easy.<br>
Akeno takes care of adding the correct tags, version, and sorting components for optimal caching for you automatically. It will also combine @use directives for an optimal bundle.

### Method 2 (for every other environment):
If not using Akeno, you can add LS to your project by using regular script and link tags using the CDN, such as:
```html
<head>
    <!-- Syntax: version/...components/ls.css -->
    <link rel="stylesheet" href="https://cdn.extragon.cloud/ls/6.0.0-alpha.0/flat/ls.css">
    <!-- Syntax: version/...components/ls.js -->
    <script src="https://cdn.extragon.cloud/ls/6.0.0-alpha.0/tabs,tooltips,modal,animation/ls.js"></script>
    <!-- I recommend using the utility to get the links: https://lstv.space/tools/ls-loader -->
</head>
```
These expose LS as a global.

> [!WARNING]
> By using this method, you need to manually specify JS/CSS components.
> I highly recommend using this [utility](https://lstv.space/tools/ls-loader) that generates the correct tags/URLs for you based on which components/styles you need!

<br>

Also possible using ESM:
```js
import * as LS from "...?esm";
```
Or using require (CommonJS):
```js
const LS = require("...");
```

## Setup
LS has a minimal, mostly optional setup process. The most important thing is to add the `ls` attribute when using LS styles.

### UI Setup
If you are using LS.css for UI & styles, there is some minimal boilerplate you should add to wherever you want LS styles to apply. For example:
```html
<body ls ls-theme="dark" ls-accent="blue" ls-style="flat"></body>
```

In detail:
- `ls` attribute scopes where LS styles apply. LS will style things including default HTML elements (such as buttons & inputs) within this element.
- `ls-style` sets the overall base UI style. The default style is "flat", which sets the default look & feel of LS. Don't forget to include that theme as a component!
- `ls-theme` sets the theme. Included are light and dark. Default is dark.
- `ls-accent` sets the accent color. See more in the color system section. Default is blue.


### JS Setup (optional)
It is not required, but LS can be configured with some options before startup. For example:

```js
// The following must be set before LS is initialized.
window.LS_INIT_OPTIONS = {
    autoScheme: true, // Automatically set the theme based on the user's system preference
    autoAccent: true, // Automatically set the accent color, eg. reading "ls-accent" from localStorage.
    theme: null, // Default theme
    accent: null, // Default accent color
    optimizeEvents: true, // Whether to compile events. See the EventEmitter documentation for more details.
};

// You can also set "window.LS_DEFER_INIT = true" to defer the initialization.
// In that case, you can then call "LS.init(options)" manually whenever you're ready.
```

# Helpers & Utilities

### Creating elements #sym:LS.Create
LS provides a rich utility for creating HTML elements.
Let's see how it works:
```js
// The following creates a plain div.
// Equivalent to document.createElement("div");
LS.Create();

// The following creates a span.
// Equivalent to document.createElement("span");
LS.Create("span");

// Now, let's spice it up a bit.

// We can write Emmet abbreviations:
LS.Create("div.myClass#myId"); // -> <div class="myClass" id="myId"></div>
LS.Create("ul>li*3"); // -> <ul><li></li><li></li><li></li></ul>

// Or, use the object notation (it's possible to mix and match both):
LS.Create("div", {
    id: "myId",
    class: "myClass",
});

// Not specifying the tag name defaults to div:
LS.Create({ class: "myDiv" });


// Now let's look at how to add content & children:

// Either simply textContent:
LS.Create("div", "Hello World"); // -> <div>Hello World</div>

// Or an array of children:
LS.Create("div", ["Hello ", "World"]); // -> <div>Hello World</div>

// Or via the following properties:
LS.Create({
    text: "Hello World", // textContent (plain text, safe from HTML injection)
});

LS.Create({
    html: "<h1>Hello World</h1>", // innerHTML (HTML content as a string)
});

// And finally, the most powerful, the inner property:
LS.Create({
    inner: [
        "Hello ", // text node
        { tag: "span", text: "World" }, // Recursive element node!
        { emmet: "ul>li*3" }, // Node created from an Emmet abbreviation!

        [], // <- an array turns into a <div> wrapper with it's content as children
        {}, // <- an object turns into a <div> with the specified options

        [ { tag: "div", class: "myClass" } ] // <- <div><div class="myClass"></div></div>

        // The nested object is equivalent to LS.Create(...), so all properties are supported.
        // This allows creating complex nested structures cleanly in one call!
    ],
});

// If you want a multi-root Emmet abbreviation:
LS.Util.parseEmmet("div+span"); // -> DocumentFragment[<div></div>, <span></span>]

// 99% of Emmet is supported, as of now only numbering ($) is not supported, but is planned soon.

// There's more that LS.Create can do, such as sanitizing your HTML (sanitize option).
```

### Selecting elements #sym:LS.Select #sym:LS.SelectOne
LS provides simple utilities (`LS.Select` and `LS.SelectOne`) for selecting elements. Though they aren't much different from document.querySelector.

```js
LS.Select(".myClass"); // Array of all elements with the myClass class, from the whole document.
LS.SelectOne("#myId"); // The first element with the id "myId" or null.

// Both also support selecting within a specific parent:
LS.Select(someParentElement, ".myClass"); // Search only within someParentElement.
LS.SelectOne(someParentElement, "#myId"); // Search only within someParentElement.
```

### Deep cloning data #sym:LS.Util.clone
LS has a helper for cloning complex structured objects, that performs faster than the native `structuredClone` or even the popular library "klona" ([benchmark](https://jsbm.dev/wFkz6UCGJevxw)).
It accepts any complex object, array, Map, Set, typed array/array buffer, all primitives, and some other types like RegExp or Date. Note: currently it does not support cloning functions or classes.

```js
// Returns a new clone of that object that doesn't affect the original.
LS.Util.clone({});
```

### Parsing query parameters #sym:LS.Util.parseQuery

LS has a ridiculously fast utility for passing query parameters, either to an object, or getting the value of one parameter. It's ~11x faster & slightly more convenient than native URLSearchParams (in Chrome) if you aren't expecting multiple values for the same parameter and don't require 100% spec compliance.

```js
// To get an object of all parameters
LS.Util.parseQuery("?key=value"); // -> { key: "value" }

// To get one value
LS.Util.parseQuery("?key=value", "key"); // -> "value"
```

### Parsing Emmet abbreviations #sym:LS.Util.parseEmmet
LS has a light Emmet abbreviation parser that supports most of the Emmet syntax.<br>
See: https://docs.emmet.io/abbreviations/syntax/ to see what you can do.<br>

```js
// Returns a DocumentFragment containing the parsed elements.
LS.Util.parseEmmet("div.myClass#myId"); // -> DocumentFragment[<div class="myClass" id="myId"></div>]

// If you want a single element (and discard any other top-level siblings):
LS.Util.parseEmmet("{I am kept}+{I am discarded}", { singleNode: true });

// Additionally, a custom namespace can be passed.
// This is the the utility that LS.Create uses; for more options, you can use LS.Create.
```

### Sanitize HTML #sym:LS.Util.sanitize
A very simple utility for sanitizing/cleaning an element.<br>
It removes all child elements not on a whitelist and removing unsafe attributes.<br>
Note; this mutates the element you pass.
```js
const myElement = LS.Create("span{Hello World}>script{alert('XSS')}");
LS.Util.sanitize(myElement); // myElement is now <span>Hello World</span>.

// LS.Create also supports this, eg.:
LS.Create("span", { html: "<script>alert('XSS')</script><span onclick='alert(\\\"XSS\\\")'>Hello World</span>", sanitize: true });

// Allowlist is in LS.Util.allowedTags
```

### Copy to clipboard #sym:LS.Util.copy
A very simple utility for copying text to the clipboard.
```js
LS.Util.copy("Text to copy");
```

### Normalizing text #sym:LS.Util.normalize
A function that normalizes text by performing the following operations:
- Converting to lowercase
- NFD Unicode normalization (eg. converts "é" to "e")
- Replacing everything that isn't a letter or number
- Normalizing whitespace
- Trimming whitespace

```js
// Second argument is an optional space character to use for replacing whitespace.
LS.Util.normalize("  Héllo   Wórld!  "); // -> "hello world"
```

### 