/**
 * Every surface the site has, in one place: the content checks, the accessibility scan and any
 * future page-level pass all read this list, so a page cannot be added to the site and missed by
 * one of them.
 *
 * Both specs that use it check the same shared guarantees on each page — one <h1>, the policy, the
 * language, no console noise — and the heading rules are covered exhaustively and statically by
 * `npm run check:html` as well. Here they are checked in a real browser, which is the only way to
 * see what the browser actually refused to do.
 */
export const PAGES: [name: string, path: string, status?: number][] = [
  ['homepage', '/'],
  ['post list', '/posts/'],
  ['tag index', '/tags/'],
  ['tag page', '/tags/powershell/'],
  ['category index', '/categories/'],
  ['category page', '/categories/articles/'],
  ['series index', '/series/'],
  ['series page', '/series/building-a-developer-virtual-machine-using-hyper-v-and-powershell/'],
  ['post with a comment thread', '/posts/using-winget/'],
  ['post with callouts', '/series/building-a-developer-virtual-machine-using-hyper-v-and-powershell/part2/'],
  ['about', '/about/'],
  ['search', '/search/'],
  // The 404 is a page like any other here: it has to carry the same policy, language and heading
  // structure, and the test server serves public/404.html with a 404 status the way a host does.
  ['404', '/a-page-that-does-not-exist/', 404]
];
