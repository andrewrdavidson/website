# Vendored callout icons

These eight SVGs are the icons `layouts/shortcodes/callout.html` draws beside each callout. They
used to arrive as a web font from a third-party CDN:

```html
<link href="https://cdn.boxicons.com/3.0.8/fonts/basic/boxicons.min.css" rel="stylesheet">
```

...plus two sibling sheets (filled, brands) and the `.woff2`/`.woff`/`.ttf` files those sheets
pulled in — three cross-origin stylesheets on every page, for eight glyphs. They now live here,
which removes a third-party origin from the page, makes the icons part of the repository's own
asset pipeline, and means the Content-Security-Policy no longer has to allow
`https://cdn.boxicons.com` at all. See the security section of `docs/BlogIssues-Fixes.md`.

| File | Used for | Source |
| --- | --- | --- |
| `bx-badge-info.svg` | `type="info"` (and the default, unknown type) | `…/svg/basic/bx-badge-info.svg` |
| `bx-light-bulb-alt.svg` | `type="tip"` | `…/svg/basic/bx-light-bulb-alt.svg` |
| `bx-siren-alt.svg` | `type="warning"` | `…/svg/basic/bx-siren-alt.svg` |
| `bx-alert-triangle.svg` | `type="danger"` (the filled set, `bxf`) | `…/svg/filled/bx-alert-triangle.svg` |
| `bx-pin.svg` | `type="note"` | `…/svg/basic/bx-pin.svg` |
| `bx-light-bulb.svg` | `type="idea"` | `…/svg/basic/bx-light-bulb.svg` |
| `bx-thought-bubble.svg` | `type="thought"` | `…/svg/basic/bx-thought-bubble.svg` |
| `bx-message.svg` | fallback for a `type` the palette does not know | `…/svg/basic/bx-message.svg` |

Full source URL pattern: `https://cdn.boxicons.com/3.0.8/svg/{basic|filled}/<name>.svg`.

**Version and license.** Boxicons **3.0.8**, whose free licence is documented at
<https://docs.boxicons.com/free>. Each file keeps the licence comment boxicons ships inside it
(`<!--Boxicons v3.0.8 https://boxicons.com | License https://docs.boxicons.com/free-->`); do not
strip it when editing a path. Set the fill on the `<svg>` element rather than on the paths — the
vendored files carry no `fill` attribute of their own, which is what lets
`layouts/partials/icon.html` paint them with `currentColor` and lets the callout palette keep
working unchanged.

**Adding one.** Download the file into this directory, add the `type` to the icon map in
`layouts/shortcodes/callout.html`, and add its colour to `assets/css/site.css`. Nothing else
needs to change — there is no font, no build step and no CDN entry to update.
