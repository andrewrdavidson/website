# Tests

Two layers, both run against a **built** site rather than a dev server — the fingerprinted assets,
the minified markup and the Pagefind index are all part of what is being checked, and none of them
exist under `hugo server`.

```bash
npm run test:prepare     # build into public/ with drafts, at http://localhost:8081/, index, prune
npm test                 # the Playwright suite (starts its own static server on 8081)
npm run check:html       # the static checks over the same public/ directory
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
| every internal link, asset and anchor resolves | a slug typo or a moved page is a 404 for a reader and invisible to a Hugo build |
| no pruned path is back in the build | 6.6 MB of CJK slices and four icons the theme ships were being deployed; `npm run prune` removes them and this is what notices if that stops |

Pagination aliases (`…/page/1/`) are meta-refresh stubs and are skipped. `hugo server` writes to
`public/` by default and injects `/livereload.js` into every page — the link check ignores that one
URL so an accidentally-inspected dev-server tree does not look like a site defect.

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
  the difference;
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

## Adding a test

Add the page to `e2e/pages.ts` and both page-level specs pick it up. Put behaviour in
`interactions.spec.ts`. Call `watchPage(page)` before `page.goto()` and `expectHealthy(...)` after
the final assertion — that ordering is what catches a violation that fires during load.

If a check belongs to neither the whole site (static) nor a real browser (interactive), it is
usually a `check-html.mjs` rule: it costs milliseconds per page and covers all of them.
