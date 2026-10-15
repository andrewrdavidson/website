#!/usr/bin/env node
/**
 * Removes files that Hugo copies from the theme's `static/` into the build output but this site
 * never serves — 6.8 MB of CJK font slices, the theme's font README, and four unreferenced icons
 * on every deploy.
 *
 *     npm run build   # hugo … && npm run prune
 *     npm run prune   # over an existing public/
 *
 * Why this exists at the *output* rather than in Hugo's configuration: a theme's static directory
 * is copied wholesale, and the only supported way to filter it is to stop naming the theme with
 * `theme =` and import it with `noMounts = true`, re-mounting every component by hand. That was
 * tried and measured — it does drop the files, and it also changed which template renders the home
 * page (the site's layouts/index.html stopped winning and the theme's own _default/home.html
 * rendered instead). The full record is the comment block at the foot of hugo.toml. Deleting the
 * paths here is duller and has no opinion about lookup order.
 *
 * The list is deliberately explicit rather than a glob: a pattern like "every file under fonts/
 * that no stylesheet references" would start deleting KaTeX's fonts, or a Latin face the moment a
 * selector moved. Each entry names one file (or one directory) and says who ships it and why it is
 * safe to drop.
 *
 * Needed files are checked for *after* the deletions, so a change to the theme — or a typo here —
 * fails the build rather than shipping a site with no KaTeX or no body face.
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public');

if (!existsSync(out)) {
  console.error('public/ does not exist — build the site first (npm run build)');
  process.exit(1);
}

/** @type {{ path: string, why: string }[]} */
const unwanted = [
  {
    path: 'fonts/noto-serif-sc',
    why: 'the Noto Serif SC slices (211 files, ~6.6 MB) — the CJK face was removed from the site on 2026-10-15; nothing loads or declares it'
  },
  {
    path: 'fonts/README.md',
    why: "the theme's note about its font files — served to nobody, and its Noto Serif SC section describes a face this site no longer ships"
  },
  {
    path: 'favicon/favicon-96x96.png',
    why: 'theme favicon; static/favicon/ shadows the folder and nothing references this size'
  },
  {
    path: 'favicon/favicon.svg',
    why: 'theme favicon (103 KB); the site uses the K PNG/ICO set in static/favicon/'
  },
  {
    path: 'favicon/web-app-manifest-192x192.png',
    why: "theme manifest icon; static/favicon/site.webmanifest points at android-chrome-192x192.png"
  },
  {
    path: 'favicon/web-app-manifest-512x512.png',
    why: "theme manifest icon; static/favicon/site.webmanifest points at android-chrome-512x512.png"
  }
];

let removed = 0;
let bytes = 0;
const sizeOf = (path) => {
  if (!existsSync(path)) return 0;
  const info = statSync(path);
  if (!info.isDirectory()) return info.size;
  return readdirSync(path, { withFileTypes: true }).reduce((total, entry) => {
    const child = join(path, entry.name);
    return total + (entry.isDirectory() ? sizeOf(child) : statSync(child).size);
  }, 0);
};

for (const { path, why } of unwanted) {
  const target = join(out, path);
  if (!existsSync(target)) continue; // the theme moved it: check-html.mjs will notice if it matters
  bytes += sizeOf(target);
  rmSync(target, { recursive: true, force: true });
  removed++;
  console.log(`pruned public/${path} — ${why}`);
}

/* The other half of the job: the files the site *does* serve must survive whatever just happened
   above. These are the ones whose loss would be invisible until a visitor's font or a formula
   failed to load. */
const required = [
  'fonts/source-serif-4-400.woff2',
  'fonts/jetbrains-mono-400.woff2',
  'katex/katex.min.css',
  'favicon/favicon.ico',
  'favicon/site.webmanifest',
  'images/og-default.png',
  'robots.txt',
  'sitemap.xml'
];

const missing = required.filter((path) => !existsSync(join(out, path)));
if (missing.length) {
  console.error(`prune removed or never found files the site needs: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`artifact pruned: ${removed} path(s), ${(bytes / 1048576).toFixed(1)} MB removed`);
