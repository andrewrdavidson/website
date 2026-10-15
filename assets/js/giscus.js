/* giscus comments thread — the body of what used to be an inline <script> in
 * layouts/partials/comments.html, plus that partial's configuration.
 *
 * Why a file: the site's Content-Security-Policy has no 'unsafe-inline' in `script-src`, so an
 * inline script is blocked. Everything configurable now travels as `data-` attributes on the
 * #giscus-thread element, which the partial renders from the same values it used to write into
 * the script: the repository, the discussion category, and how giscus matches a page to a
 * discussion. Change them there, not here.
 *
 * Two behaviours the partial's comments describe at length, kept intact:
 *
 *   - The theme is chosen for the page as it stands, because giscus reads `data-theme` once,
 *     when client.js runs, and bakes it into the iframe URL. `light` matches the light-mode card
 *     (#ffffff) and `transparent_dark` paints no background at all, so the dark-mode surface
 *     shows through. Getting this wrong gives a light-mode reader a dark thread, which is what
 *     a hard-coded `transparent_dark` used to do (#35).
 *   - A later change is pushed through giscus's documented postMessage API, triggered by the
 *     class change on <html> that both theme.js and the reader's toggle produce, and by the
 *     frame's own load event for a toggle that happened while it was still loading. Do not wait
 *     for a message from giscus instead: it only posts to the parent for metadata and resizing,
 *     so a light page would stay dark indefinitely.
 *
 * Loaded with `defer` from the partial, so the container exists before this runs. Nothing here
 * is required for a page to render: without it the article simply has no comment thread.
 */
(function () {
  'use strict';

  var HOST = document.getElementById('giscus-thread');
  if (!HOST) return;

  var GISCUS_ORIGIN = 'https://giscus.app';
  var config = {
    'data-repo': HOST.getAttribute('data-repo'),
    'data-repo-id': HOST.getAttribute('data-repo-id'),
    'data-category': HOST.getAttribute('data-category'),
    'data-category-id': HOST.getAttribute('data-category-id'),
    'data-mapping': HOST.getAttribute('data-mapping') || 'pathname',
    'data-strict': HOST.getAttribute('data-strict') || '0',
    'data-reactions-enabled': HOST.getAttribute('data-reactions-enabled') || '1',
    'data-emit-metadata': HOST.getAttribute('data-emit-metadata') || '0',
    'data-input-position': HOST.getAttribute('data-input-position') || 'bottom',
    'data-lang': HOST.getAttribute('data-lang') || 'en'
  };

  /* One place decides what giscus is called in each mode. */
  function giscusTheme() {
    return document.documentElement.classList.contains('dark') ? 'transparent_dark' : 'light';
  }

  function pushTheme() {
    var frame = document.querySelector('iframe.giscus-frame');
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage(
      { giscus: { setConfig: { theme: giscusTheme() } } },
      GISCUS_ORIGIN
    );
  }

  function bindFrame(frame) {
    frame.addEventListener('load', pushTheme);
  }

  /* The frame giscus inserts is the only child we ever expect here, so binding every frame that
     appears is enough — and it happens after the element is in the document, which is early
     enough for its load event. */
  new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      Array.prototype.forEach.call(mutation.addedNodes, function (node) {
        if (node.tagName === 'IFRAME') bindFrame(node);
      });
    });
  }).observe(HOST, { childList: true });

  var script = document.createElement('script');
  script.src = GISCUS_ORIGIN + '/client.js';
  config['data-theme'] = giscusTheme();
  Object.keys(config).forEach(function (key) {
    var value = config[key];
    if (value !== null && value !== undefined && value !== '') script.setAttribute(key, value);
  });
  script.crossOrigin = 'anonymous';
  script.async = true;
  HOST.appendChild(script);

  /* Follow the theme toggle: theme.js and the pre-paint script both switch the `dark` class on
     <html>, so watching that one attribute is enough. */
  new MutationObserver(pushTheme)
    .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  /* Covers a toggle that landed before the frame existed. */
  pushTheme();
})();
