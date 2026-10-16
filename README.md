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
| npm | 11+ (ships with Node 24) | installs the four dev dependencies. pnpm 12 installs them too, but not in a shape Hugo can read — see [pnpm and the Tailwind CLI](#pnpm-and-the-tailwind-cli) |

`.github/workflows/hugo.yaml` pins all of these, and is the authority if this table drifts.
Hugo is *not* installed by npm — install it yourself (`winget install Hugo.Hugo.Extended`,
`brew install hugo`, or a release tarball).

## Commands

```bash
npm ci                 # install dev dependencies (Tailwind, Pagefind, Playwright)
npm run dev            # local server on http://localhost:1313, drafts included
npm run build          # hugo --gc --minify into an emptied ./public, then indexed and pruned
npm run build:drafts   # same, with content marked `draft = true` included
npm run search         # build the Pagefind index over ./public — the build scripts run it too
npm run prune          # drop files the theme ships but this site never serves (see "Deploy")
npm run clean:artifact # empty ./public — the first step of every build script
npm run tailwind:shim  # make the Tailwind CLI readable by Hugo — also a first step (see below)
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
in memory is the cheap half of the fix; the other half is `npm run clean:artifact` as the first step
of every build script, which empties `public/` before Hugo writes into it, so a build always starts
from a directory containing only what it produced — and a build that *fails* half way through cannot
hand the next one a directory of pages it will never rewrite. (`hugo --cleanDestinationDir`, which
the build scripts used to pass, does remove stale pages and static-file copies, but only at the end
of a build that finishes; the reason it was replaced is in
[tools/clean-artifact.mjs](tools/clean-artifact.mjs).)

That default is why a hand-typed `hugo server` is worth avoiding: it renders into `public/` and
copies the theme's whole `static/` directory, so it leaves a tree that is not an artifact — no prune,
the dev origin in `sitemap.xml`, drafts that a build never renders. `npm run check:html` recognises
such a tree (by the `/livereload.js` script a served page carries) and says so instead of reporting
the theme's static files as regressions; the checks it skips are the ones only a build can pass.
There is no `hugo.toml` setting for this — `[server] renderToMemory` is silently ignored in 0.167, as
tested — which is what makes the flag in `npm run dev`, and this paragraph, the whole of the fix.

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

## pnpm and the Tailwind CLI

npm and pnpm both work here, but pnpm needs one repair before `hugo` can run the Tailwind CLI at all,
which is what `npm run tailwind:shim` does — automatically, as the first step of the build, dev and
test scripts, and as a no-op on a checkout installed with npm.

The fault is in the lookup, not in the stylesheet. Since Hugo v0.161.0 `css.TailwindCSS` runs the
npm-installed CLI *with Node*, so it first has to work out which file to hand to node: it resolves
`node_modules/.bin/tailwindcss` and then reads it, accepting a symlink to a `.mjs` file, a file whose
first line is a node shebang, or — in v0.167.0 — the **first** path-shaped string inside a wrapper
script. npm's wrapper's only such string is the entry point itself. pnpm's wrapper exports a
`NODE_PATH` first, and the first path-shaped string in it is a directory from pnpm's flat store that
does not exist, so Hugo gives up on the whole file and reports `binary "tailwindcss" is not a Node.js
script`. The build dies in the deferred stylesheet pass, after every page has rendered, which is why
it reads like a CSS problem. That is [gohugoio/hugo#14852](https://github.com/gohugoio/hugo/issues/14852); the fix,
[#14856](https://github.com/gohugoio/hugo/pull/14856), is not in a release. pnpm's other way out,
`preferSymlinkedExecutables`, is documented as ignored on Windows, and the shims this repository was
installed from on Windows are wrappers.

[tools/tailwind-shim.mjs](tools/tailwind-shim.mjs) therefore tests the wrapper with Hugo's own three
rules and, only when it fails them, rewrites it as npm's shim — the entry path read out of
`@tailwindcss/cli`'s own `package.json` — then verifies the rewrite resolves to the CLI that package
ships. The result is still a working shim, so `pnpm exec tailwindcss` behaves as before. Nothing is
written when the wrapper already passes, so an npm-installed checkout (CI) sees a no-op; when Hugo
supports pnpm, delete the tool, its script entry and the preludes that call it.

## Search

Full-text search is [Pagefind](https://pagefind.app/), which indexes the *built* site —
so `/search/` only works after `npm run search`, and a plain `hugo server` session
legitimately shows the template's "index is generated at deploy time" notice. CI runs it
between the Hugo build and the artifact upload, and both build scripts run it for the same
reason: without the index, `/search/` links `pagefind-ui.css` and `pagefind-ui.js` and nothing
answers, so the artifact is not deployable and `npm run check:html` says so — correctly, which is
what makes an indexed build the thing to check.

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

**The table is a note to the author, so it follows the build.** Left unset it renders where you are
working — `hugo server` and the drafts build `npm run test:prepare` makes — and not in a deploy build
(`npm run build`, and the same job in CI), so a reader never sees a post's change log. Setting
`showPostHistory` under `[params]` in [hugo.toml](hugo.toml) decides it outright instead, in either
direction. The front matter itself is untouched either way, so `history:write` and `history:check` do
not care what this says.

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
  `og:locale` and `og:image`, every rendered date in one of the two formats a partial produces,
  every internal link and anchor resolving, and nothing pruned back in the artifact.
- **`npm test`** — a Playwright suite in two projects (desktop and a phone-width viewport) over
  three specs: every page's health, axe-core accessibility in both colour modes, the disclosures
  with JavaScript disabled, the theme toggle, card hover and parity across list surfaces, the
  series card's own link and where its count sits, search, callout icons, the mobile menu, and the
  absence of the removed CJK face.

See [tests/README.md](tests/README.md) for what each spec covers and how to add to it.
