![Logo](/misc/banner.png)

# What's LS?
LS is a lightweight, dependency-free framework/library collection for building very fast and accessible interfaces, anything from websites and webapps to full-featured complex software. It has a rich set of UI components and utilities that are quite useful for nearly any web project.

It features things like an UI framework, color system, utilities, parsers, etc., but also advanced features, including a WebGL renderer, sound manager, animation system, window manager, multipane layout, etc.

It supports modern web standards, is modular, easy to use, has first-class support for Emmet, and is designed with accessibility and customization in mind.

It's lightweight, **very fast**, efficient, memory-safe and increasingly more robust (see [quality ratings](component-ratings-and-status.md)), and as easy to use as any standard library - just two files for JS/CSS and you're set. Components are added selectively, you only load what you need.

It is also fully dependency-free and platform/framework agnostic.

## LS v6.0.0-alpha.5

### What's new?
- ✨ New APIs, Emmet support, **13+ new components**, and overal polish.
- 🚀 Improved performance all around
- 💾 Optimized for memory efficiency and lifecycle management
- 💻 Enhanced design language, UI/UX, etc.
- 💼 Smaller size
- 🐛 Tons of bug fixes and quality improvements
- See more details in the [changelog](changelog.md).

---

<img src=https://cdn.extragon.cloud/file/a771e02dfb37f618.svg> <br>
LS is made entirely by a human, not by AI.

<br>

```js
// Example of creating elements with LS & Emmet syntax:
const element = LS.Create("button.my-class#my-id{Hello world!}");
```

### Go see the [docs](docs/index.md) to get started!
### For a quick start on importing the library, check out [https://lstv.space/tools/ls-loader](https://lstv.space/tools/ls-loader)
### Or do you perhaps want to [try it first](https://lstv.space/tech/ls/demo)?

<br>

## Main advantages:
- 🦎 **Very versatile**
    - It can be used for things starting with simple landing pages to entire complex, professional interfaces.
    - It's written in vanilla JS/CSS, so it works anywhere and is platform/framework agnostic, and doesn't bother you with additional setup or build steps.
    - No vendor lock-in or namespace pollution. LS has a lot to offer, but it can just do that within it's own scope and leave the rest to your own code.
    - It is modular and extensible. You can use what you need and easily make your own components. All components also offer robust lifecycle management.

- 🐜 **Light, reliable and ridiculously fast**
    - The main focus of LS is performance and stability/memory usage. I got tired of the bloated, low quality and slow framework mess that is the majority of today's web, and wanted to create something that just does its job without hogging resources, and ensure it doesn't trade performance for convenience. That is why I spend a lot of time and effort optimizing LS to be as fast and efficient as it can be.
    - LS uses its own optimized implementations of core features instead of relying on 3rd party libraries, and as a result has some of the fastest implementations for many common functions in the whole industry.
    - See my [design philosophy](#design-philosophy-and-quality-standards) if you want more details about how LS is written.

- :godmode: **Reliable.**
    - It's relatively mature (maintained for 4+ years with very regular updates), doesn't run on any AI slop, went through several iterations, and I am constantly improving it.
    - It is robust and well tested despite being a single person effort.
    - I will keep providing support for a long time to come. If you want to help, feel free to contribute (please)! <3

- 📦 **No dependencies**
    - LS is fully self-contained, meaning that you don't need to do or setup anything else to get the full set of features. Just get it and go.

- ✨ **Honest, human-written and clean code**
    - Every part of LS is written from scratch and purpose-built for efficiency. Many frameworks rely on cheap solutions for convenience or trade quality for development speed. LS does not.
    - No AI is used to write LS code. It is made by a human developer and hundreds of hours of work.
    - There are only two pieces of 3rd party code bundled in LS: normalize.css for CSS resets and omggif in the ImageCropper component to decode GIFs.

## See it in action
Check out the live [example page/demo](https://lstv.space/tech/ls) to see some LS components in action.<br>
Projects that use LS include [lstv.space](https://lstv.space), [our video editor/DAW/game engine](https://github.com/the-lstv/videoeditor), QuickSand game engine, [Extragon](https://extragon.cloud), and many more.

<br>

---

<br>

<details>
<summary>Design philosophy and quality standards</summary>

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

</details>

## License/terms
This project was formerly open-source. Now, not by choice, it is no longer open-source but partially source-available to at least slightly prevent license removal and theft (look up AI code laundering if you want to know why).<br>
You can read the code and make contributions, but you are forbidden from using it for any AI training or analysis or source redistribution.<br>
This is a temporary measure to protect the project from ill-minded plagiarism.<br>
Comercial use is allowed as long as the terms are met and you are not making profit or redistributing the code itself.