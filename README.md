# kelrys.com

Source for [kelrys.com](https://kelrys.com/) — a Hugo blog about DevOps, Windows,
PowerShell, Proxmox and the occasional dead end that turned out to be a driver problem.

Built by Hugo, styled by Tailwind CSS v4, deployed to GitHub Pages by GitHub Actions.
No server-side runtime, no database, no tracking.

## Requirements

| Tool | Version | Why |
| --- | --- | --- |
| Hugo | 0.167.0 (standard) | `css.TailwindCSS` and `js.Build` are in every edition, and so is WebP encoding since v0.153 — the extended edition is not required. CI installs the standard archive; see the "extended edition" note in [docs/BlogIssues-Fixes.md](docs/BlogIssues-Fixes.md) if you have met the older advice |
| Node.js | 24.x | Tailwind CLI, Pagefind, Playwright |
| npm | 11+ (ships with Node 24) | installs the four dev dependencies |

`.github/workflows/hugo.yaml` pins all of these, and is the authority if this table drifts.
Hugo is *not* installed by npm — install it yourself (`winget install Hugo.Hugo.Extended`,
`brew install hugo`, or a release tarball).

## Commands

```bash
npm ci                 # install dev dependencies (Tailwind, Pagefind, Playwright)
npm run dev            # local server on http://localhost:1313, drafts included
npm run build          # what CI runs: hugo --gc --minify, cleaned and pruned → ./public
npm run build:drafts   # same, with content marked `draft = true` included
npm run search         # build the Pagefind index over ./public (see "Search" below)
npm run prune          # drop files the theme ships but this site never serves (see "Deploy")
npm run og:image       # regenerate static/images/og-default.png (the social card)
npm run history        # show each page's git commits and the `history` front matter they imply
npm run history:write  # write that front matter into content/ (see "Post history" below)
npm run history:check  # fail if any page is out of date — CI, or a pre-commit hook
npm run preview        # serve a built ./public on http://localhost:8081 (no index? see Search)
npm run check:html     # static checks over ./public: headings, inline scripts, policy, lang
npm run test:prepare   # build + index exactly what the test suite expects to find
npm test               # Playwright suite against a built site (see tests/README.md)
npm run test:tools     # unit and integration tests for tools/ (node --test, no browser)
npm run test:install   # install the Chromium build the suite needs (once)
```

`npm test` runs against a **built** site, not the dev server — the fingerprinted assets, the
minified markup and the Pagefind index only exist in a build. Run `npm run test:prepare` first, or
let `tests/global-setup.ts` tell you to.

`npm run dev` passes `--disableFastRender` and `--renderToMemory`. The first is deliberate: fast
render can serve a stylesheet Tailwind generated before a newly added utility existed, which looks
exactly like a CSS bug and wastes a debugging session. The second matters because `hugo server`
renders to disk **by default** — it writes straight into `public/`, the same directory a build
writes to, and leaves pages behind that Hugo's next build knows nothing about (a renamed taxonomy
term survives as a stale page, still linked from nowhere and still deployed). Keeping the dev server
in memory is the cheap half of the fix; the other half is `--cleanDestinationDir` on every build
script, so a build always starts from a directory containing only what it produced.

## How the CSS is built

`assets/css/main.css` in the theme is the Tailwind entry point, compiled at build time by
Hugo's `css.TailwindCSS` (vendored Tailwind v4 — no PostCSS config, no `tailwind.config.js`).
Site-level overrides live in `assets/css/site.css`, which is linked *after* the theme
stylesheet so it can retarget tokens on equal specificity.

Class detection has two sources:

1. **`@source "hugo_stats.json"`** in the theme entry — Hugo writes that file because
   `hugo.toml` sets `[build.buildStats] enable = true`. It lists every class, id and tag
   that actually appears in the *rendered* HTML, which is why the entry point is wrapped in
   `templates.Defer`: the stylesheet is compiled after the site has been rendered. This is
   the documented Hugo + Tailwind v4 arrangement.
2. Tailwind's own source detection as a backstop, so a class that only ever appears in
   JavaScript (a state class added by a theme module, say) still gets compiled.

## Search

Full-text search is [Pagefind](https://pagefind.app/), which indexes the *built* site —
so `/search/` only works after `npm run search`, and a plain `hugo server` session
legitimately shows the template's "index is generated at deploy time" notice. CI runs it
between the Hugo build and the artifact upload.

## Post history

Every post can carry a `[[history]]` array — `version`, `date`, `author`, `note` — that
`layouts/_default/single.html` renders as a table at the foot of the page, newest first and only when
there is more than one entry (#7). [tools/post-history.mjs](tools/post-history.mjs) derives it from the
page's own git commits:

```bash
npm run history                       # the report: commits, what the front matter holds, what would change
npm run history:write                 # apply it (add a path to work on one page)
npm run history:check                 # exit 1 instead — the form to put in a pipeline
```

A report looks like this, and the marker on the right of each entry says where the label and the note
came from:

```
content/posts/prune-git-branches/index.md  ·  2 commits, 2 changed the body  ·  front matter has none  ·  would write 2 entries
    1.0  2026-10-08T09:32:14+01:00  Andrew Davidson   Updates with more draft posts  (c9e0a22)
    1.1  2026-10-15T15:46:37+01:00  Andrew Davidson   Fix invalid markdown header level  (ee6e8d1)
```

Two rules are worth knowing before you run it, because both are what make it safe to re-run:

- **A note and a label already in the front matter are kept** when their entry matches a commit by
timestamp, so the hand-written notes on
[content/posts/get-set-ip-address-with-powershell/index.md](content/posts/get-set-ip-address-with-powershell/index.md)
(`First published`, `Added the old-school ipconfig example`) survive every run untouched — the report
marks them `(kept from the front matter)`. Version labels default to `1.0`, `1.1`, …
- **A commit that only changed the front matter is not an entry.** Otherwise the commit that seeds a
page's history becomes an entry in the history it seeded. The comparison is real: the page's body at
that commit against the page's body at its parent.

A page with fewer than two commits that changed its *body* gets no block at all, mirroring the
template, which renders nothing for a lone entry because that is just the publication date the header
already shows. Pages with no `date` (the About page, the section indexes) are skipped, and a page git
cannot see at all is left exactly as it is. `npm run history:write` is the only thing that writes, and
the only thing it touches is the `[[history]]` block.

**`history:write` is a local step, never a build step.** The notes it writes are commit subjects, and a
visitor reads them, so the tool prints a reminder to edit them before committing. Nothing in
`.github/workflows/hugo.yaml` calls it, and nothing should: a build that rewrote front matter would
deploy a site that does not match the repository. `npm run history:check` is the safe shape for a
pipeline — it fails instead of writing.

## Deploy

Push to `main`. `.github/workflows/hugo.yaml` installs the pinned toolchain, builds the
site into `public/`, runs Pagefind over it, uploads the result as a Pages artifact and
deploys it (`actions/deploy-pages`). There is no manual step and no branch to publish from.

`npm run preview` serves a built `public/` on <http://localhost:8081> with
`tests/static-server.mjs` — the same server Playwright starts, so what you look at by hand is
what the suite looks at. It is not part of the deploy path.

Before the artifact is uploaded, `npm run prune` deletes what Hugo copied out of the theme's
`static/` and this site never serves: 6.6 MB of Noto Serif SC slices from a site with no CJK
content, and four unreferenced icons. It also fails if the files the site *does* serve — the Latin
faces, KaTeX, the favicons, the OG image, `robots.txt`, `sitemap.xml` — went missing, so the prune
cannot quietly eat the site. The list is explicit and commented in
[tools/prune-artifact.mjs](tools/prune-artifact.mjs), and `npm run check:html` fails if a pruned path
reappears. Hugo can only filter a theme's static directory by taking over the theme's mounts, which
was tried and reverted — the comment at the foot of [hugo.toml](hugo.toml) records what it broke.

## Repository layout

```
content/            posts, series parts, about, the /search/ stub
layouts/            site overrides — files here shadow the theme's
assets/             site CSS, site JS, the header logo
static/             favicons and self-hosted fonts
themes/void/        the upstream theme, kept as a pristine mirror
i18n/en.toml        site overrides of theme strings (key-by-key merge)
data/               empty; Hugo data files go here
docs/               the site's own fault log and design record
hugo.toml           single config file: menus, taxonomies, markup, security
```

**The theme is a mirror.** `themes/void` is a submodule pointing at upstream
`hugo-theme-void`, so it is never edited: every change lives in this repo's `layouts/`,
`assets/`, `i18n/` or `static/`, where it shadows the theme file of the same path. If you
*do* need to change a theme file, copy it into `layouts/` and add it to the override list in
the docs — a silent edit under `themes/` disappears on the next submodule update.

## Docs

The site has been through several rounds of fixes, and the reasoning is written down rather
than left in commit messages:

- [docs/BlogIssues.md](docs/BlogIssues.md) — the fault log: what is reported, what is
  outstanding, what has been traced.
- [docs/BlogIssues-Fixes.md](docs/BlogIssues-Fixes.md) — the fixes, one section per fault,
  each with the measurements that proved it and the reasoning behind the approach. It also
  carries the theme-override list and the "keep in step on upgrade" notes.

Read the fix document before changing a template that already looks odd — the oddness is
usually load-bearing, and the section says why.

## Tests

Two layers, both run in CI, both against a *built* site rather than a dev server:

- **`npm run check:html`** — 70 pages in about a second: one `<h1>`, no skipped heading levels, no
  inline script or event handler, no repeated attribute, a CSP meta tag, `lang="en-GB"`, a real
  `og:locale` and `og:image`, every internal link and anchor resolving, and nothing pruned back in
  the artifact.
- **`npm test`** — a Playwright suite in two projects (desktop and a phone-width viewport) over
  three specs: every page's health, axe-core accessibility in both colour modes, the disclosures
  with JavaScript disabled, the theme toggle, card hover and parity across list surfaces, search,
  callout icons, the mobile menu, and the absence of the removed CJK face.

See [tests/README.md](tests/README.md) for what each spec covers and how to add to it.
