# Tests

Two layers, both run against a **built** site rather than a dev server — the fingerprinted assets,
the minified markup and the Pagefind index are all part of what is being checked, and none of them
exist under `hugo server`.

```bash
npm run test:prepare     # build into public/ with drafts, at http://localhost:8081/, index, prune
                         # (the two build scripts index and prune too — see check-html.mjs below)
npm test                 # the Playwright suite (starts its own static server on 8081)
npm run check:html       # the static checks over the same public/ directory
npm run test:tools       # node --test over tools/ — no build, no browser, a second or so
```

`npm run test:prepare` matters for three reasons: most content is still `draft = true` (every series
and the callout pages the suite needs are drafts), `/search/` has no index until Pagefind has run
over the build, and the artifact is pruned of the files the site does not serve.
`tests/global-setup.ts` checks the first two markers before any test starts and tells you to run it
rather than failing 20 assertions down the line.

## `check-html.mjs` — the whole site, every push

A dependency-free pass over every built page for the faults a browser test would be too slow to
find exhaustively, and a Hugo build cannot see at all:

| Check | Why it is here |
| --- | --- |
| exactly one `<h1>`, no skipped heading levels | the year groupings were `<div>`s, so 47 of 113 pages jumped from the page title to a card's `<h3>` (#36) |
| no inline `<script>` | the theme-flash and giscus loaders were inline; the CSP has no `'unsafe-inline'` (#36) |
| no inline event handlers (`onclick=`, `onmouseover=`, …) | on the series toggle, the tag chips, the Pagefind bundle and the CJK stylesheet |
| no attribute name twice on one element | a second `class` attribute on the giscus container was discarded by the browser, padding and all (#34) |
| a Content-Security-Policy meta tag on every page | it is the page's only policy: a static host cannot send headers |
| `lang="en-GB"` on every page | the site is UK English end to end, feeds included |
| `og:locale` is `en_GB` and `og:image` is present and absolute | the theme hardcoded `en_US` and emitted no image at all; both are read from the site now |
| every rendered date is in one of the two shared formats | the homepage's series parts printed the old i18n string (`Sep 03 2026`) and the series page printed that beside the shared partial, so a series showed its span of dates twice in two styles (2026-10-16) |
| every internal link, asset and anchor resolves | a slug typo or a moved page is a 404 for a reader and invisible to a Hugo build |
| no pruned path is back in the build | 6.6 MB of CJK slices and four icons the theme ships were being deployed; `npm run prune` removes them and this is what notices if that stops |
| `robots.txt` declares an absolute sitemap, and `sitemap.xml` agrees with it | the two are only worth anything as a pair: Hugo's built-in robots.txt names no sitemap, and the sitemap is generated with no template of its own, so nothing else here would notice it listing a dead URL or a different origin than the one robots advertises |
| links and sitemap entries are read the way a browser reads them | a URL arrives here as text, and Go's html/template escapes a literal `+` as `&#43;`: the `Visual C++` tag's link is written `/tags/visual-c&#43;&#43;/`, and read undecoded its `#` split the path at `tags/visual-c&`, reporting eleven links and a sitemap entry that a reader can follow (2026-10-16) |

The tree it runs on has to be an *indexed* build: `/search/` links Pagefind's stylesheet and script,
which `npm run search` writes after Hugo has rendered, so a bare `hugo` tree fails those two links —
correctly, since that tree's search box does not work either. The build scripts run the index for that
reason, which is what makes `npm run build:drafts && npm run check:html` an honest pair.

Pagination aliases (`…/page/1/`) are meta-refresh stubs and are skipped. `hugo server` writes to
`public/` by default and injects `/livereload.js` into every page — the link check ignores that one
URL so an accidentally-inspected dev-server tree does not look like a site defect. A served tree can
be *recognised* too: it copies the theme's whole `static/` directory and runs no prune, so the six
pruned paths are expected in it rather than a regression, and its sitemap is written at the dev
origin. When livereload gives one away, those artifact checks are skipped and the tree is named
instead — one line that says what to run, not six that say the site has broken. The run still exits
non-zero, because a tree that is not an artifact must not be reported as a clean one.

## `e2e/` — the Playwright suite

Two projects: `chromium` (desktop) and `mobile` (a 390×844 viewport, no touch emulation, so a
`hover()` means the same thing in both). Anything that only broke below the `sm:` breakpoint used to
be caught by one test that resized a context inside itself.

**`content.spec.ts`** visits every surface in `e2e/pages.ts` — homepage, `/posts/`, the tag and
category indexes and their term pages, the series index and a series page, a post with a comment
thread, a post with callouts, `/about/`, `/search/` and the 404 — and checks the same guarantees on
each: one `<h1>`, `lang="en-GB"`, the policy in place, no Content-Security-Policy violation reported
by the browser, no unexpected console error, and no failed same-origin request. Violations are
collected from `securitypolicyviolation` events inside the page rather than scraped from the
console, so a failure names the directive and the blocked URL.

**`accessibility.spec.ts`** runs axe-core (WCAG 2.0/2.1 A and AA) over the same page list, plus two
pages in dark mode — a separate palette with separate contrast ratios, and one that had three
failures of its own. It found and fixed four real faults on its first run: a footer link whose only
cue was colour, a 2.5:1 footnote on the homepage, a series-count label at 2.4:1, and a code block
whose line numbers were unreadable in both modes — see the "accessibility" section of
`docs/BlogIssues-Fixes.md`. Third-party frames (giscus) and best-practice-only rules are excluded;
everything else has to pass with no baseline.

**`interactions.spec.ts`** covers the behaviour that lives in markup and CSS:

- the homepage series list and the `/categories/` accordion — both with **JavaScript disabled**,
  because "a `<details>` element needs no script" is the claim and a test with JS on cannot tell
  the difference. The same test pins where a series card's count sits (the title row's right-hand
  cell, above the parts) and that the whole card — not only its title — links to the series;
- the theme toggle: the `dark` class, the stored preference, and that a reload starts dark;
- a post card: hover lifts the border, clicking goes to the post, and the *first card on every
  list surface* has the same computed border, radius and fill in light **and** dark — the parity
  that has drifted twice (#32, #33);
- a tag chip: clicking goes to the *tag*, not to the post card underneath it;
- search: a real query returns real results from the built index;
- callout icons: inline `<svg>` at the size the stylesheet asks for, coloured by `currentColor`;
- the mobile menu at phone width;
- no CJK face: no request for one, no `data-defer-stylesheet` link, and no CJK family named in the
  computed body font stack — the three ways the removed stack could come back.

Third-party noise is filtered in `e2e/helpers.ts` (giscus, and Pagefind's autofocus notice); a
cross-origin failure is ignored, a same-origin one is not.

## `tools/` — the unit layer

`npm run test:tools` runs Node's own test runner over `tests/tools/`, for the code that is neither
markup nor browser behaviour: the helpers the repository's build tools are made of. It needs no build
and no browser, which is the point — a tool that decides what goes into the front matter of every
content file should be checkable in a second on any machine.

**`post-history.test.mjs`** covers [tools/post-history.mjs](../tools/post-history.mjs), which seeds
and refreshes each page's `[[history]]` front matter from its git commits. The unit cases pin the parts
that are invisible in a diff: the byte-range replacement that must leave CRLF endings and the rest of
the front matter untouched, the merge that must keep a hand-written note rather than replace it with a
commit subject, and the rule that a commit changing only the front matter is not an entry. The last case
is an integration test against a **throwaway repository** it creates, commits to and deletes — three
commits, one of which only seeds the history — because asserting against this repository's own history
would fail the first time anyone edits a post.

**`tailwind-shim.test.mjs`** covers [tools/tailwind-shim.mjs](../tools/tailwind-shim.mjs), the repair
that lets Hugo run the Tailwind CLI on a pnpm-installed checkout. Its unit cases apply Hugo's own
three-step lookup to the shapes a `node_modules/.bin/tailwindcss` can have — npm's wrapper, pnpm's
wrapper (trimmed copies of what pnpm 12.9.1 wrote, NODE_PATH line and all), a symlink and a Node
shebang script — so a change to either package manager's output shows up as a failing test here rather
than as `binary "tailwindcss" is not a Node.js script` after every page has rendered. Its integration
case builds a fake `@tailwindcss/cli`, repairs it, and then *runs* the CLI through the repaired shim,
because a wrapper Hugo accepts but a shell cannot execute would be a worse bug than the one being
fixed. The symlink case skips on Windows, where creating a file symlink needs Developer Mode.

**`clean-artifact.test.mjs`** covers the pre-build wipe: that it empties the tree it was given, leaves
its siblings alone, reports what it removed, and refuses a path that names the repository root or lands
outside it.

## Adding a test

Add the page to `e2e/pages.ts` and both page-level specs pick it up. Put behaviour in
`interactions.spec.ts`. Call `watchPage(page)` before `page.goto()` and `expectHealthy(...)` after
the final assertion — that ordering is what catches a violation that fires during load.

If a check belongs to neither the whole site (static) nor a real browser (interactive), it is
usually a `check-html.mjs` rule: it costs milliseconds per page and covers all of them.
