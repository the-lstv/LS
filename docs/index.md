---
title: animation
---

![Logo](/misc/banner.png)

# What's LS?

LS is a flexible & feature-rich frontend/UI framework, that provides various components, utilities, and more.<br>
It is incredibly lightweight, fast, feature-rich, and designed to make frontend development enjoyable, while making your apps feel super smooth and performant, and significantly reduce bundle size/bloat.<br>

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

Either can be used independently or together, depending on what you need.

# Getting Started

Let's get started with some basics.<br>
There's a lot that LS can do, so there's also many things to look at based on what you are doing at the moment.

## Installation

Adding LS to your project is as easy as just adding any library.

### Method 1 (only when using the Akeno server):

[Akeno](https://github.com/the-lstv/akeno) is a powerful webserver developed by me, and thus works nicely together with LS.<br>If you are not using it, skip to the second method.

If you are using Akeno, all you need to do is to add an @use block like this to your head tag:
```html
<head>
    @use(ls:version[...components]);
</head>
```
Such as:
```html
<head>
    @use(ls:6.0.0[color, flat, animation, modal, tooltips, tabs]);
</head>
```
Akeno takes care of adding the correct tags, version, and sorting components for optimal caching for you automatically. It will also cleverly combine @use directives for an optimal bundle.

### Method 2 (every other environment):
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
> By using this method, you need to manually specify JS/CSS components and ensure they match.
> Want an easier way? Try this [utility](https://lstv.space/tools/ls-loader) that generates the correct tags/URLs for you based on which components/styles you need!

<br>

Also possible using ESM:
```js
import * as LS from "...?esm";
```
Or using require (CommonJS):
```js
const LS = require("...");
```

## Basics

### Creating elements
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

### Selecting elements
LS provides simple utilities (`LS.Select` and `LS.SelectOne`) for selecting elements. They aren't much different from document.querySelector with the exception that Select returns an actual Array rather than an element collection & has a slightly more flexible API.
```js
LS.Select(".myClass"); // Array of all elements with the myClass class.
```

### Deep cloning data
LS has a helper for cloning complex structured objects, that performs faster than the native structuredClone or the popular library "klona".

```js
LS.Util.clone({}); // This accepts any complex (nested) object, array, Map, Set, typed array/array buffer, or primitive. It will return a new clone of that object that doesn't affect the original.
```

### Query parameters
<jsdoc-generate></jsdoc-generate>

LS has a ridiculously fast utility for passing query parameters, either to an object, or getting the value of one parameter. It's ~11x faster & slightly more convenient than native SearchParams (in Chrome) if you aren't expecting multiple values for the same parameter and don't require 100% spec compliance.

```
// To get an object of all parameters, such as { key: "value" }
LS.Util.parseQuery("?key=value");

// To get one value
LS.Util.parseQuery("?key=value", "key");
```

### 