#!/usr/bin/env node
/**
 * A minimal static file server for a built site directory. It exists so that the Playwright suite
 * can be pointed at exactly what the deploy step uploads — minified HTML, fingerprinted assets,
 * the Pagefind index — rather than at a dev server, which neither fingerprints anything nor has a
 * search index at all.
 *
 *     node tests/static-server.mjs [root] [port]
 *     npm run preview            # → public/, port 8081
 *
 * The MIME map is the short version of what a static host serves; `.pagefind`, `.pf_fragment`
 * and friends are Pagefind's own formats, which have no registered type and must not be sniffed
 * as text.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const root = resolve(process.argv[2] || 'public');
const port = Number(process.argv[3] || 8081);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.wasm': 'application/wasm',
  '.pagefind': 'application/octet-stream',
  '.pf_fragment': 'application/octet-stream',
  '.pf_index': 'application/octet-stream',
  '.pf_meta': 'application/octet-stream',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let filePath = join(root, urlPath);
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    /* fall through to readFile's ENOENT */
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { 'content-type': types[extname(filePath)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    // 404.html, with a 404 status, the way a static host serves it — the suite checks that page
    // like any other, and a plain "Not found" would test nothing.
    try {
      const body = await readFile(join(root, '404.html'));
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Serving ${root} on http://localhost:${port}/`);
});
