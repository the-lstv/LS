![Logo](https://github.com/user-attachments/assets/d2800b99-d5e9-4474-b8e0-22f563237bfa)

# LS v5.0.0
Welcome the next big iteration of LS, LS v5.<br>
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
Add LS to your app or site with
```html
<!-- Note this imports *all* default parts and components. -->
<!-- LS V5 IS NOT RELEASED ON THE CDN YET! -->
<script src="https://cdn.extragon.cloud/ls/5.0.0/*/ls.min.js"></script>
<link href="https://cdn.extragon.cloud/ls/5.0.0/*/ls.min.css" rel="stylesheet">
```

And you can start using LS right away!
```js
// Make LS-Tiny's HTMLElement custom methods available globally (use with caution!)
LS.prototypeTiny()

const myDiv = LS.Create({
  inner: [N("img", { width: 120, src: "https://lstv.space/assets/image/prism_light.webp" }), "<br> Hello world!"],
  class: "myDiv"
})

document.body.add(myDiv)
```

## Creating components
You can register components to use across your code!
```js
LS.LoadComponent(class myComponent extends LS.Component {
  constructor() {
    super()
  }
}, { global: true })
```

```js
const instance = new LS.myComponent()

// Events are available on all components by default
instance.on("event", console.log)
instance.emit("event", ["Hello world!"])
```
> [!NOTE]
> Components are no longer stored uniquely with an ID in LS version 5 and up - previously, you were required to supply an ID when creating an instance and LS would manage instances for you. This is no longer the case and you need to manage your own component references now.

## Hosting
You can either simply use the static files in /dist/, but if you want version management, on-the-fly code compression, and tree-shaking modules from an URL, you can host the API in /backend/api.js, which is the same API hosted by the official ExtraGon CDN (https://cdn.extragon.cloud/ls/).<br>

To host it, you will need [akeno](https://github.com/the-lstv/Akeno) on your server.