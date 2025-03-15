![Logo](https://github.com/user-attachments/assets/5dbb7603-9f18-4871-8c15-991833d6661f)

# What's LS?
LS is a fresh frontend framework, both for building complete UI/UX or general utility. It is one of the most light-weight while powerful and full-featured frameworks out there!<br>
It is one of the few frameworks that won't waste 20x more RAM than it should and flood your website with all that unnecesary bloat causing it to get slow *(ahem, MS Teams)* - It's as simple as just adding any other library. Two files, that's it. Components can be tree-shaken via the URL so you only load what you need.<br> 
LS features a wide selection of useful components for all kinds of usecases.

- 🦎 **Versatile**
    - We have used it for things starting from simple landing pages to entire complex interfaces (eg. our [video editor](https://github.com/the-lstv/VideoEditor))
- 🐜 **Light**
    - This was the main goal of LS from even its earliest days. We were tired of the bulky mess, and wanted to create something that just does its job properly.
- :godmode: **Powerful.**
    - It really is - being over half a decade mature, undergoing multiple renovations, it is robust, fast, and does not lack in features.
- 💪 **Open-Source**
    - Licensed under the GPL v3.0!

Don't believe me? [See it in action](https://lstv.space) - all of our platforms use it. Just take a look at the lack of bloat and feel some of those snappy interfaces yourself.
<br>


## LS v5.1.0
v5 is by far the largest update ever released to LS.<br>
### What's new?
- ✨ New, modern API remade from scratch
- 📔 New, better component system
- 🫧 Insanely efficient and light reactivity system
- 🚀 Significantly improved performance all around
- 💾 Optimized for memory efficiency
- 💼 Smaller size, even more light-weight
- 💻 Reworked design language, UI framework, etc.



> [!WARNING]
> If you are migrating from earlier LS versions, please review the migration notes. As this is a major release of LS, API compatibility is not guaranteed and a lot of things were changed or removed. Namely all previously deprecated methods were removed and many methods have changed.
> CSS variables and API usage has also been changed!

> [!NOTE]
> Normalize.css is now bundled with ls.css by default!

## v4 vs v5 Performance

v5 is faster and more memory efficient in various fields.

| Operation               | v4 (Ops/s)      | v5 (Ops/s)            | Speed Improvement |
|-------------------------|-----------------|-----------------------|-------------------|
| **Event Handling**      |                 |                       |                   |
| Event `emit`            | 1,011,971       | 120,960,480           | ~120x faster      |
| Event `on`              | 666,207         | 4,310,638             | ~6x faster        |
| Event `once`            | 295,046         | 4,418,975             | ~14x faster       |
| **Elements selector**   |                 |                       |                   |
| Simple selector         | --              | --                    | ~4.5x faster      |
| Complex selector        | --              | --                    | ~2x faster        |
More on performance enhancements in the docs :)

## Getting started
### With [Akeno](https://github.com/the-lstv/Akeno/)!
Getting started with LS combined with Akeno is the best possible experience, since Akeno comes with built-in LS support and works closely with it.

All you need is:
```
<head>
    @use (ls:5.0.0[]);
</head>
```
And you are using LS! Components are added into the square brackets ([]) as a comma separated list - it will also automatically manage CSS/JS pairs, so you don't have to think about which part to place where! Akeno will also optimize the URL for best shared caching practices to reduce load times.<br>
If you plan to use the design language, don't forget to specify the style (default to flat if you are unsure):
```
<head>
    @use (ls:5.0.0[ flat ]);

    @page { theme: dark; style: flat; accent: blue }
</head>
```
### Without Akeno
You can add LS to your app or site easily with just two tags (or one, if you don't need either scripting or styles - it will work):
```html
<!-- syntax: /ls/[version]/[?components]/ls.[?min].[js|css] -->
<!-- or, to only import a component without the core: /ls/[version]/[component].[?min].[js|css] -->
<!-- or, to import multiple components without the core: /ls/[version]/[components]/bundle.[?min].[js|css] -->

<script src="https://cdn.extragon.cloud/ls/5.0.0/ls.min.js"></script>
<link href="https://cdn.extragon.cloud/ls/5.0.0/flat/ls.min.css" rel="stylesheet">
```

And you can start using LS right away!

Time to head to the docs and explore all the awesome things that LS offers!


## Hosting the API
You can use the static files in /dist/ - but if you want the same full-featured API as the official CDN (includes version management, on-the-fly code minification, and tree-shaking modules from an URL), you can!<br>
You can host your own server for the LS cdn API, for example for local development, or any other use you may have for it.<br>
The backend API code is open-source, located at /backend/api.js in this repository.<br>
To host the API, you will need [Akeno](https://github.com/the-lstv/Akeno/).
