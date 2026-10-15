/* Pre-paint work that used to be an inline <script> in layouts/partials/head.html.
 *
 * It lives in a file rather than in the markup for one reason: the site ships a
 * Content-Security-Policy meta tag (see layouts/partials/head.html) whose `script-src` has no
 * 'unsafe-inline'. An inline script would either be blocked outright or force 'unsafe-inline'
 * back into the policy, which would let any injected markup run code. A file on this origin is
 * covered by `script-src 'self'`, fingerprinted and hashed in production like every other
 * script the site loads.
 *
 * Timing is the whole point of this file, so it is loaded *without* `defer` and before the
 * stylesheets: applying the reader's theme has to happen before the first paint or it is
 * visible. The `theme` key and the `dark`/`light` values are the same ones
 * themes/void/assets/js/modules/theme.js reads and writes, so the button and this file never
 * disagree about what the reader chose.
 *
 * It used to do a second job — switching the deferred CJK stylesheet from media="print" to
 * media="all" once the document was parsed (the marker was `data-defer-stylesheet`). That
 * stylesheet is gone (2026-10-15: ~205 KB on every page of a site with no CJK content), so this
 * file is now a single, narrower piece of work. If a deferred stylesheet is ever reintroduced,
 * search the templates for `data-defer-stylesheet` and reinstate that half — do not do it with
 * an `onload` attribute, which the Content-Security-Policy blocks along with every other inline
 * handler (#36).
 */
(function () {
  'use strict';

  try {
    var stored = localStorage.getItem('theme');
    var dark = stored
      ? stored === 'dark'
      : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
  } catch (err) {
    /* Storage blocked (private window, partitioned storage): fall through to the light
       default the stylesheet already assumes. */
  }
})();
