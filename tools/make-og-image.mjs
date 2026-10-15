#!/usr/bin/env node
/**
 * Renders static/images/og-default.png — the 1200x630 card every page falls back to when it has
 * no share image of its own (layouts/partials/social-meta.html).
 *
 *     npm run og:image
 *
 * Why a generator rather than a hand-made PNG: the card has to match the site's dark palette and
 * typeface, and both are already in this repository — the colours are the theme's dark tokens
 * (`#0b1220` canvas, `#a9c583` accent, `#f9fafb` foreground) and the typeface is the same
 * self-hosted Source Serif 4 the pages use. Re-drawing it by hand would drift the moment either
 * changes. Chromium is already a dependency of the test suite, so this needs no new toolchain and
 * the output is byte-for-byte reproducible on any machine.
 *
 * The logo and the two font faces are inlined as data URIs so the render does not depend on file
 * paths resolving inside the headless browser.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'static', 'images', 'og-default.png');

const dataUri = (path, mime) =>
  `data:${mime};base64,${readFileSync(join(root, path)).toString('base64')}`;

const logo = dataUri('assets/images/k2.png', 'image/png');
const serifBold = dataUri('themes/void/static/fonts/source-serif-4-700.woff2', 'font/woff2');
const serifRegular = dataUri('themes/void/static/fonts/source-serif-4-400.woff2', 'font/woff2');

const html = `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <style>
    @font-face {
      font-family: 'Source Serif 4';
      font-style: normal;
      font-weight: 700;
      src: url(${serifBold}) format('woff2');
    }
    @font-face {
      font-family: 'Source Serif 4';
      font-style: normal;
      font-weight: 400;
      src: url(${serifRegular}) format('woff2');
    }
    * { margin: 0; box-sizing: border-box; }
    body {
      width: 1200px;
      height: 630px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 96px;
      background: #0b1220;
      color: #f9fafb;
      font-family: 'Source Serif 4', ui-serif, serif;
      /* The radial accent wash behind the text, kept subtle enough to stay legible. */
      background-image: radial-gradient(circle at 88% 12%, rgba(169, 197, 131, 0.16), transparent 55%);
    }
    .brand { display: flex; align-items: center; gap: 20px; }
    .brand img { width: 72px; height: 72px; }
    .domain { font-size: 34px; font-weight: 400; color: #a9c583; letter-spacing: 0.01em; }
    h1 { font-size: 84px; font-weight: 700; line-height: 1.05; margin: 44px 0 0; letter-spacing: -0.01em; }
    .rule { width: 120px; height: 6px; background: #a9c583; border-radius: 3px; margin: 40px 0 32px; }
    p { font-size: 32px; font-weight: 400; color: #b6bcc9; }
  </style>
</head>
<body>
  <div class="brand">
    <img src="${logo}" alt="">
    <span class="domain">kelrys.com</span>
  </div>
  <h1>DevOps, Windows and<br>PowerShell notes</h1>
  <div class="rule"></div>
  <p>Working series, handy tips, and the occasional rabbit hole</p>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out, type: 'png' });
await browser.close();

console.log(`wrote ${out} (1200x630)`);
