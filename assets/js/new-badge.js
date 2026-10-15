/* "New since your last visit" (#28) — see docs/BlogIssues-Fixes.md.
 *
 * The site is static (GitHub Pages: no server, no accounts, no cookies), so "your last visit"
 * can only live in this browser. The whole flow is three steps and reads nothing but its own
 * storage:
 *
 *   1. take the stamp the previous session left in localStorage — this session's reference
 *      point, remembered in sessionStorage so later page views compare against that same value;
 *   2. on the first page of the session, stamp now, once, for the next visit to read;
 *   3. un-hide the "New" chip on every card whose publication date is newer than the stamp.
 *
 * The behaviour those steps add up to, stated because each is a choice:
 *
 *   - The first-ever visit badges nothing. There is no earlier stamp, so it only records one;
 *     a site that greeted a new reader with "New" on everything would be saying nothing.
 *   - The stamp is written once per session, not once per page view, so clicking through a few
 *     posts cannot mark the rest read before the reader has seen them.
 *   - The comparison uses the publication date, never the last-modified date, so editing an old
 *     post does not re-badge it (`enableGitInfo` makes .Lastmod commit-derived site-wide).
 *   - Nothing is bounded by a window as well as the stamp: after a long absence, everything
 *     published since really is new, which is what "since your last visit" means.
 *   - Any page counts as a visit, not just the homepage, because the stamp is the moment the
 *     reader next looks at the site, and every page is a look.
 *   - No storage (blocked, or a partitioned/private window) means no badges, which is exactly
 *     this page as it was before this script existed: the chips ship hidden in the HTML, so they
 *     cannot appear without it. Nothing here is required for a page to render.
 *
 * Loaded with `defer` from layouts/partials/head.html, so the chips exist by the time it runs.
 */
(function () {
  'use strict';

  var VISIT_KEY = 'kelrys.lastVisit';            // the reader's last visit, ms since epoch
  var REFERENCE_KEY = 'kelrys.lastVisit.reference'; // the value this session compares against
  var STAMPED_KEY = 'kelrys.stamped';            // has this session written its stamp yet?
  var CHIP_SELECTOR = '.chip-new[data-post-date]';

  /* Both stores can throw on access as well as on read/write, so resolve them defensively. */
  function store(name) {
    try { return window[name]; } catch (err) { return null; }
  }

  function read(store, key) {
    if (!store) return null;
    try { return store.getItem(key); } catch (err) { return null; }
  }

  function write(store, key, value) {
    if (!store) return;
    try { store.setItem(key, value); } catch (err) { /* storage blocked: badges stay off */ }
  }

  var local = store('localStorage');
  var session = store('sessionStorage');

  var previous = read(session, REFERENCE_KEY);
  if (previous === null) {
    previous = read(local, VISIT_KEY);
    /* Remember the value even when it is absent (as ''), so later page views in this session
       cannot pick up the stamp this one is about to write. */
    write(session, REFERENCE_KEY, previous === null ? '' : previous);
  }

  if (read(session, STAMPED_KEY) === null) {
    write(local, VISIT_KEY, String(Date.now()));
    write(session, STAMPED_KEY, '1');
  }

  var lastVisit = Number(previous);
  if (!isFinite(lastVisit) || lastVisit <= 0) return; // first-ever visit: record it, badge nothing

  var chips = document.querySelectorAll(CHIP_SELECTOR);
  for (var i = 0; i < chips.length; i++) {
    var chip = chips[i];
    var published = Date.parse(chip.getAttribute('data-post-date'));
    if (!isNaN(published) && published > lastVisit) {
      chip.removeAttribute('hidden');
      chip.setAttribute('data-new', '');
    }
  }
})();
