![Logo](/misc/banner.png)
# Note: Documentation is currently work in progress, sorry about that! Stay tuned for updates.

# What's LS?
LS is a lightweight, dependency-free frontend framework for building fast, accessible interfaces in vanilla JS/CSS, from landing pages to full-featured complex applications.<br>


## It features:
- A UI system with modern and accessible controls, an amazing extensive color system, and focus on being developer-friendly and not getting in your way.
- A wide array of built-in components for various use-cases, from basic UI elements to complex interactive components.
- A modern, easy-to-use API that is both powerful and flexible.
- Extremely easy setup - just two files to get started. Even easier with [Akeno](https://github.com/the-lstv/Akeno/).

It's lightweight, *very fast*, efficient, memory-safe and increasingly more robust (see [quality ratings](component-ratings-and-status.md)), and as easy to use as any standard library - just two files for JS and CSS and you're set.
Components can be selectively added via the URL so you only load what you need.<br>

## See it in action
Check out the live [example page/demo](https://lstv.space/tech/ls) to see some LS components in action.<br>
Projects that use LS include [lstv.space](https://lstv.space), [Revie video editor](https://lstv.space/editor), [Extragon](https://extragon.cloud), and hopefully many more in the coming future.

## Key advantages of LS:
- 🦎 **Versatile**
    - We have used it for things starting from simple landing pages to entire complex interfaces (eg. our [video editor](https://lstv.space/editor)) - thanks to that, we have experience using LS in wildly different ways, which helped shape LS into a highly flexible framework.
    - It is modular and extensible. You can use what you need and easily make your own components.
    - No vendor lock-in. You can technically use parts of LS with other frameworks if you really want to. LS is written in vanilla JS and CSS, making it incredibly flexible and easy to setup (no annoying backend build setups, runtimes or whatever - we do offer backend helpers and compilation, but they are fully optional and you can achieve the same things without them. Means that even static HTML files can use LS, without any special backend).
    - LS is designed to be very easy to use, to make it fun and enjoyable to create things with it.

- 🐜 **Light, reliable and ridiculously fast**
    - This has always been the main goal of LS. I was tired (and still am) of the bloated slow framework mess that is the majority of today's web, and wanted to create something that does its job without hogging resources, and ensure it doesn't trade performance for convenience. LS took me much more work to build this way than it should - but the result is worth it.
    - LS uses its own highly optimized implementations of core features instead of 3rd party libraries to ensure it is implemented in the best way possible and consistent with the rest.
    - LS always prefers the fastest way, as to not interfere with your actual code.
    - All components follow a strict internal lifecycle structure to ensure maximal performance, low memory usage and memory safety.
    - See my [design philosophy](#design-philosophy-and-quality-standards) if you want more details about how LS is written.

- :godmode: **Powerful.**
    - LS has a growing wide array of built-in components for various use-cases, from basic UI elements to more complex components. Whenever I make some kind of component for my other projects, I usually later complete and release it as a LS component, so there are some interesting examples, such as LS.Timeline.
    - It's a few years old (4+ years), went through many iterations (survived the horrors of my early coding style), and I am constantly improving it and using it nearly daily. This makes it quite mature and robust despite being new and as of now, a single person effort. I have no intention of abandoning it - it's safe to build with, and I will be providing support for a long time. If you want to help, feel free to contribute <3!

- 📦 **No dependencies, no bloat**
    - LS is fully self-contained, meaning that you don't need to do anything extra to get the full set of features that LS has. Just get it and go. No novel sized `package.json`. Two clicks to set up.

- ✨ **Honest, human and clean code**
    - Every part of LS is written from scratch, purpose-built for efficiency. Many frameworks rely on random third-party libraries out of convenience. We don't.
    - There are only two 3rd party libraries bundled in LS: normalize.css for CSS resets and omggif in the ImageCropper component to decode GIFs.
    - No AI is used to write LS code. It is handcrafted by a human developer and hundreds of hours of work. AI-assisted bug searching or rapid prototyping without automated changes is okay. I personally believe AI coding is harmful to developers and is a threat to software quality and security.
    (Contact me if you want more insight on my stance and use of AI technologies. I will later publish a full article on this topic.)

- 💪 **Open-Source**
    - Licensed under GPL v3.0!


Don't believe me? [See it in action](https://lstv.space) - all of our projects/platforms use it. Feel the snappy interfaces and speedy performance for yourself, and see the difference.
(Note: lstv.space currently runs on an old version of LS (as it is still being worked on). The new version has major core changes that make it even smoother - also, lstv.space uses GPU shaders on the homepage, which may be a slowdown on older devices, that is not LS's fault, blame WebGL 🥲).
<br>


## LS v5.2.9
### What's new?
- ✨ New, modern API remade from scratch
- 📔 Better component system
- 🫧 Insanely efficient and light reactivity system
- 🚀 Significantly improved performance all around
- 💾 Optimized for memory efficiency
- 💼 Smaller size, even more light-weight
- 💻 Reworked design language, UI framework, etc.
- 🐛 Tons of bug fixes and quality improvements

<br>

---

<br>

## Getting started
### With [Akeno](https://github.com/the-lstv/Akeno/)
Using LS with Akeno is the easier way to do it, since LS works closely with Akeno and vice versa. If you are still deciding on a server, check out Akeno - it's also pretty cool.

But there isn't anything that wouldn't work without Akeno - it's not a requirement and you can skip it, it is just not as convenient (see the next section).<br>

All you need to import LS in Akeno is to put this in your `<head>` (the numbers after ":" are the version):
```html
@use (ls:5.2.9);
```
Done - you are using LS! That easy. This imports only the LS core. No need to install anything, because "ls" is a built-in module source in Akeno and will automatically translate to an optimal CDN script/link tag.<br>

Components are added into the square brackets ([]) as a comma separated list.
Akeno will handle optimizing the import, so you don't have to worry about it.<br>
```html
<head>
    <!-- Example of importing some LS components: -->
    @use (ls:5.2.9[flat, color, tooltips, modal]);

    <!-- If you plan to use the design language, don't forget to specify the style: -->
    @page { style: flat; accent: blue }
</head>
```

You can also import a specific component separately, excluding the core:
```html
<!-- Only imports ImageCropper, useful if you only need it sometimes and LS core is already loaded. -->
@use (ls.js.ImageCropper:5.2.9);
```

<br>

### Without Akeno
You can add LS to your app or site easily with just two tags (or one, if you don't need either scripting or styles).<br>

Akeno does the URL building for you, without it you can do it manually with the following syntax.<br>
To import the core and none or more components with it: `/ls/[version]/[?components]/ls.[?min].[js|css]`<br>
Or, to only import a component without the core: `/ls/[version]/[component].[?min].[js|css]`<br>
Or, to import multiple components without the core: `/ls/[version]/[components]/bundle.[?min].[js|css]`

But you need to be careful with what component you place to css/js and ensure that components that need it get both.<br>
In the future I plan to make an URL builder tool to make this cleaner.

Example:
```html
<!-- Imports ls.js core, no components -->
<script src="https://cdn.extragon.cloud/ls/5.2.9/ls.min.js"></script>

<!-- Imports ls.css core and the flat style -->
<link href="https://cdn.extragon.cloud/ls/5.2.9/flat/ls.min.css" rel="stylesheet">
```

And you can start using LS right away!
Time to head to the docs and explore all the awesome things that LS offers!

(If you are a fan of ESM, it is not currently supported as I have no use for it, but please reach out and I will be happy to implement it.)

<br>

---

<br>

## Design philosophy and quality standards
*Skip this section if you don't care and just want to use LS - but if you are interested in how I make sure LS code is of high quality, keep reading!*

### Performance guarantee
v5 is faster in pretty much all fields, and it started a benchmark-driven development approach, meaning that performance is measured and optimized smartly for any potentially high-frequency path.

The idea being that anything that a different codebase may use - any core or reusable feature (that isn't at the highest application level) - should be light and fast. If the core is fast, everything is fast. If the core is slow, making anything fast with it becomes impossible. The real world does not care about "but it runs on my machine" or "this runs fast enough in my isolated microbenchmark, don't overthink it". <br>
For example: if the event system is slow, everything that uses it cannot rely on it being fast and hot loops explode your website.
This extends further; if a component has slow rendering that consumes 50% of the CPU time per frame, it doesn't only disadvantage itself, but anything that uses it AND anything that runs alongside it (and relying on "webworkers will solve it" is bad practice). These things add up as they layer over each other.
This is bad in any more complex application - and modern web apps are complex, and LS should handle it just like any other app.
Performance slowdowns should come from your own usage, not the framework or components itself.

Optimization does not have to add bloat or make usage harder; It is just a code style and mindset choice - if you already think in low level optimizations, you naturally write efficient code whenever you can.
I do somethimes go a bit overboard and over-engineer a simple API (or go the opposite way, I get lazy and glue things together (don't worry, I make that clear and transparent in quality ratings and fix it as soon as I can)), but it's fun :)

This is why LS optimizes anything it can, to give you the **peace of mind** that you can just build with it, and rely on LS to be fast, so you can only worry about your own code.
If you don't care about speed, that's perfectly fine in the context of your app - but if your code is to be reused in other places that may rely on it, you probably should.
And LS does!

Additionally, LS development goes through quality standards for:
- Performance (shouldn't do more work than you expect, best if you don't notice it at all)
- Memory usage (must not leak memory, must be efficient, and must have solid memory management features)
- Accessibility
- Developer experience (must be easy and fun to use, with good documentation (about that...))

### Benchmark and quality driven development
I use a set of benchmarks and performance profiling tools *while* implementing features to get a good understanding of it's performance characteristics. I also *am* the user, and test every feature I implement in many real-world scenarios. (*on a personal note - how do some developers write code they never tested? i couldn't*).

No human is perfect - I sometimes produce non-optimal code and make mistakes.
To ensure this is kept to the absolute minimum, I set transparent and objective [quality ratings](component-ratings-and-status.md) on all components.
Only things that went through intense review and testing get the 5/5 rating, otherwise they are rated based on their current state and I work on improving them over time.
It is unlikely everything will be get that 5/5 rating as it is intentionally a high bar, but it marks the maturity of each component.