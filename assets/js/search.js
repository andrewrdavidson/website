/* Pagefind user interface — the body of what used to be an inline <script> in the theme's
 * layouts/_default/search.html, now a site override (layouts/_default/search.html).
 *
 * Why a file: the site's Content-Security-Policy has no 'unsafe-inline' in `script-src`, so an
 * inline script is blocked. The strings that used to be interpolated into that script — the
 * placeholder and the four UI messages — travel as `data-` attributes on #search, which the
 * template renders from i18n. Change them there, not here.
 *
 * The `onerror` attribute the theme's <script src="…/pagefind-ui.js"> element carried is gone
 * with it: it was an inline handler (same CSP problem), and the check below already covers the
 * case it handled. Pagefind's bundle only exists after `npm run search`, so a plain
 * `hugo server` session — or a deploy where the index step failed — renders the notice instead
 * of an empty box.
 *
 * Loaded with `defer` from the override, after pagefind-ui.js has been parsed, so PagefindUI is
 * defined by the time this runs when the bundle is there at all.
 */
(function () {
  'use strict';

  var host = document.getElementById('search');
  var notice = document.getElementById('search-unavailable');
  if (!host || !notice) return;

  function unavailable() {
    notice.classList.remove('hidden');
  }

  function translations() {
    var out = {};
    if (host.dataset.placeholder) out.placeholder = host.dataset.placeholder;
    if (host.dataset.zeroResults) out.zero_results = host.dataset.zeroResults;
    if (host.dataset.clearSearch) out.clear_search = host.dataset.clearSearch;
    if (host.dataset.loadMore) out.load_more = host.dataset.loadMore;
    return out;
  }

  function start() {
    if (typeof window.PagefindUI === 'undefined') {
      unavailable();
      return;
    }
    new window.PagefindUI({
      element: '#search',
      showSubResults: true,
      showImages: false,
      autofocus: true,
      translations: translations()
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
