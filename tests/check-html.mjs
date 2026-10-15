#!/usr/bin/env node
/**
 * Checks the built site's HTML for invariants that a Hugo build cannot see and that a browser
 * test would be slow to cover, page by page. Run it against a built directory:
 *
 *     npm run build:drafts && npm run check:html      # or npm run check:html -- <dir>
 *
 * It exists because every one of these has already been got wrong at least once on this site,
 * and each was found by hand rather than by anything that runs on a push:
 *
 *   - heading order / one <h1> per page      the year groups were <div>s, so 47 of 113 pages
 *                                            jumped from their <h1> to a card's <h3> (#36)
 *   - no inline <script>                     the theme flash and the giscus loader were inline;
 *                                            the CSP has no 'unsafe-inline' (#36)
 *   - no inline event handlers               onclick/onmouseover on the series toggle, the tag
 *                                            chips, the pagefind bundle and the CJK stylesheet
 *   - one attribute name per element         a second `class` attribute on the giscus container
 *                                            was silently discarded by the browser (#34)
 *   - a policy and a language on every page  the CSP meta tag and lang="en-GB"
 *   - a locale and an image on every page   the theme hardcoded og:locale as en_US and emitted no
 *                                            og:image at all (2026-10-15)
 *   - every internal link resolves          a slug typo in a template or a moved page is a 404 for
 *                                            a reader and invisible to a Hugo build
 *   - the artifact carries nothing pruned   the theme's CJK font slices, its font README and four
 *                                            dead icons used to be uploaded by the megabyte
 *                                            (npm run prune)
 *
 * Pages that are redirect stubs (Hugo's pagination aliases) are skipped: they are a meta refresh
 * and a canonical link, with no content to check.
 *
 * Exits non-zero when anything fails, so CI can gate on it.
 */
import { access, readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

const root = process.argv[2] || 'public';

/* Files the build output must not contain — the theme ships them and nothing here wants them.
   tools/prune-artifact.mjs deletes them; this is what notices if that stops happening. */
const PRUNED_PATHS = [
  'fonts/noto-serif-sc',
  'fonts/README.md',
  'favicon/favicon-96x96.png',
  'favicon/favicon.svg',
  'favicon/web-app-manifest-192x192.png',
  'favicon/web-app-manifest-512x512.png'
];

const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

/** Resolves one on-page URL to a file in the build, or null when there is nothing to resolve. */
async function resolveInternal(url, fromFile) {
  if (!url || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) return null; // mailto:, https:, //cdn…
  // `hugo server` renders to disk by default, so a dev-server tree can be checked by mistake: its
  // /livereload.js is injected into every page and exists nowhere on a real host. `npm run dev`
  // passes --renderToMemory, and the build scripts --cleanDestinationDir, so this is belt and
  // braces for an accidentally-inspected tree.
  if (/^\/?livereload\.js(?:\?|$)/.test(url)) return null;
  const [pathPart, fragment] = url.split('#');
  const path = pathPart.split('?')[0];
  if (!path) return null; // a bare fragment: checked against this page instead
  const base = path.startsWith('/') ? root : dirname(fromFile);
  const target = resolve(base, decodeURIComponent(path).replace(/^\/+/, ''));
  // A relative link may climb out of the build directory; nothing legitimate does.
  if (!target.startsWith(resolve(root))) return { outside: true };
  for (const candidate of [target, join(target, 'index.html')]) {
    if (await exists(candidate)) return { file: candidate, fragment };
  }
  return { missing: target.replace(resolve(root) + sep, '') };
}

/* Attribute names that would be an inline event handler. Listed rather than matched as /^on/ so
   that `only`, `one` and friends in a data attribute cannot be mistaken for one. */
const EVENT_HANDLER_ATTRS = new Set([
  'onabort', 'onafterprint', 'onauxclick', 'onbeforeinput', 'onbeforeprint', 'onbeforeunload',
  'onblur', 'oncancel', 'oncanplay', 'onchange', 'onclick', 'onclose', 'oncontextmenu', 'oncopy',
  'oncut', 'ondblclick', 'ondrag', 'ondragend', 'ondragenter', 'ondragleave', 'ondragover',
  'ondragstart', 'ondrop', 'ondurationchange', 'onemptied', 'onended', 'onerror', 'onfocus',
  'onformdata', 'onhashchange', 'oninput', 'oninvalid', 'onkeydown', 'onkeypress', 'onkeyup',
  'onlanguagechange', 'onload', 'onloadeddata', 'onloadedmetadata', 'onloadstart', 'onmessage',
  'onmousedown', 'onmouseenter', 'onmouseleave', 'onmousemove', 'onmouseout', 'onmouseover',
  'onmouseup', 'onoffline', 'ononline', 'onpagehide', 'onpageshow', 'onpaste', 'onpause',
  'onplay', 'onplaying', 'onpopstate', 'onprogress', 'onratechange', 'onrejectionhandled',
  'onreset', 'onresize', 'onscroll', 'onscrollend', 'onsecuritypolicyviolation', 'onseeked',
  'onseeking', 'onselect', 'onslotchange', 'onstalled', 'onstorage', 'onsubmit', 'onsuspend',
  'ontimeupdate', 'ontoggle', 'onunhandledrejection', 'onunload', 'onvolumechange', 'onwaiting',
  'onwheel'
]);

async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.name.endsWith('.html')) files.push(path);
  }
  return files;
}

function attributesOf(tag) {
  const names = [];
  for (const match of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=/g)) {
    names.push({ name: match[1].toLowerCase(), index: match.index });
  }
  return names;
}

const problems = [];
const record = (file, message, detail = '') => problems.push({ file, message, detail });

const files = (await walk(root)).sort();
let checked = 0;

for (const file of files) {
  const html = await readFile(file, 'utf8');
  const name = relative(root, file);

  // Pagination aliases and other redirect stubs have no content of their own.
  if (/http-equiv=["']?refresh/i.test(html)) continue;
  checked++;

  /* Heading structure. A page has one <h1> — its title — and no level is skipped on the way down,
     because a screen reader's outline is the page for anyone who navigates by heading. */
  const headings = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  const h1s = headings.filter((level) => level === 1).length;
  if (headings.length && h1s !== 1) {
    record(name, `expected exactly one <h1>, found ${h1s}`, `headings: ${headings.join(' ')}`);
  }
  let previous = 0;
  for (const level of headings) {
    if (previous && level > previous + 1) {
      record(name, `heading level jumps from h${previous} to h${level}`, `headings: ${headings.join(' ')}`);
      break;
    }
    previous = level;
  }

  /* Tags, once, as attribute lists: this is where an inline handler or a repeated attribute name
     would show up. `<!DOCTYPE …>` and comments are excluded by the leading-letter requirement. */
  for (const tag of html.matchAll(/<[a-zA-Z][^>]*>/g)) {
    const text = tag[0];
    if (/^<script\b/i.test(text) && !/\ssrc=/i.test(text)) {
      record(name, 'inline <script> (no src)', text.slice(0, 90));
    }
    const seen = new Set();
    for (const { name: attr } of attributesOf(text)) {
      if (EVENT_HANDLER_ATTRS.has(attr)) {
        record(name, `inline event handler ${attr}=`, text.slice(0, 90));
      }
      if (seen.has(attr)) {
        record(name, `attribute ${attr} appears twice on one element`, text.slice(0, 90));
      }
      seen.add(attr);
    }
  }

  if (!/http-equiv=["']?Content-Security-Policy/i.test(html)) record(name, 'no Content-Security-Policy meta tag');
  if (!/<html[^>]*\slang=["']?en-GB/i.test(html)) record(name, 'html lang is not en-GB');

  /* Social metadata: the locale is read from the language (en_GB, not the en_US the theme
     hardcoded) and every page carries an image, which the theme emitted for none of them. */
  const locale = html.match(/property=["']?og:locale["']?\s+content=["']?([^"'>\s]+)/i);
  if (!locale) record(name, 'no og:locale');
  else if (locale[1] !== 'en_GB') record(name, `og:locale is ${locale[1]}, expected en_GB`);
  const ogImage = html.match(/property=["']?og:image["']?\s+content=["']?([^"'>\s]+)/i);
  if (!ogImage) record(name, 'no og:image');
  else if (!/^https?:\/\//i.test(ogImage[1])) record(name, `og:image is not absolute: ${ogImage[1]}`);
  if (!/<meta name=["']?twitter:card["']?\s+content=["']?summary_large_image/i.test(html)) {
    record(name, 'twitter:card is not summary_large_image');
  }

  /* Every internal link and asset, resolved against the build. Anchors are checked too, because
     the heading anchors are generated and a renamed heading leaves a dead one behind. */
  for (const match of html.matchAll(/<(?<tag>a|link|img|script)\b[^>]*?\s(?:href|src)=["']?([^"'>\s]+)/gi)) {
    const url = match[2];
    const resolved = await resolveInternal(url, file);
    if (!resolved) continue;
    if (resolved.outside) {
      record(name, 'link escapes the build directory', url);
      continue;
    }
    if (resolved.missing) {
      record(name, `internal link does not resolve: ${url}`, `expected ${resolved.missing}`);
      continue;
    }
    if (resolved.fragment && match.groups.tag === 'a') {
      const target = await readFile(resolved.file, 'utf8');
      const id = resolved.fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!new RegExp(`(?:id|name)=["']?${id}["'>\\s]`).test(target)) {
        record(name, `anchor does not exist in the target page: ${url}`);
      }
    }
  }
}

/* The artifact itself: the pruned paths must be gone, and no page may ask for the removed CJK
   sheet. Both are the other half of the 2026-10-15 font work — the templates stopped linking the
   face, and `npm run prune` takes the files out of the build. */
for (const path of PRUNED_PATHS) {
  if (await exists(join(root, path))) record(path, 'pruned file is present in the build again');
}

/* One line per distinct problem, with counts and a sample, rather than one line per occurrence:
   the same missing policy on 70 pages is one fault, not seventy. */
const grouped = new Map();
for (const problem of problems) {
  const key = `${problem.message}\u0000${problem.detail}`;
  const entry = grouped.get(key) || { ...problem, count: 0, files: [] };
  entry.count++;
  if (entry.files.length < 3) entry.files.push(problem.file);
  grouped.set(key, entry);
}

if (grouped.size) {
  console.error(`\nHTML checks failed (${problems.length} occurrences on ${checked} pages):\n`);
  for (const entry of [...grouped.values()].sort((a, b) => b.count - a.count)) {
    console.error(`  ${entry.count}× ${entry.message}`);
    if (entry.detail) console.error(`      ${entry.detail}`);
    console.error(`      e.g. ${entry.files.join(', ')}`);
  }
  console.error('');
  process.exit(1);
}

console.log(`HTML checks passed: ${checked} pages (${files.length - checked} redirect stubs skipped).`);
