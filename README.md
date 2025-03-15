![Logo](https://github.com/user-attachments/assets/5dbb7603-9f18-4871-8c15-991833d6661f)

# LS v5.1.0
v5 is by far the largest update ever released to LS.<br>
### What's new?
- ✨ New, modern API remade from scratch
- 📔 New component system
- 🚀 Significantly improved performance all around
- 💾 Optimized for memory efficiency
- 💼 Smaller size
- 💻 Reworked UI framework

<br>

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
| Color string parser     | --              | --                    | A lot faster      |

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
