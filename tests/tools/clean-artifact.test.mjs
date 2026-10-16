/**
 * Unit tests for tools/clean-artifact.mjs — run with `npm run test:tools`.
 *
 * Small on purpose: the tool is a `rmSync` with two opinions worth pinning, both about *not*
 * deleting the wrong thing. It refuses a path that is the base itself or lands outside it, and it
 * reports what it removed, so a build log says whether the previous artifact was there at all.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

import { cleanPaths } from '../../tools/clean-artifact.mjs';

function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'clean-artifact-'));
  mkdirSync(join(base, 'public', 'posts', 'a-post'), { recursive: true });
  writeFileSync(join(base, 'public', 'index.html'), '<html></html>');
  writeFileSync(join(base, 'public', 'posts', 'a-post', 'index.html'), '<html></html>');
  mkdirSync(join(base, 'content'), { recursive: true });
  writeFileSync(join(base, 'content', 'index.md'), '+++\n+++\n');
  return { base, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

test('cleanPaths empties a tree, reports what it held, and leaves its siblings alone', (t) => {
  const { base, cleanup } = fixture();
  t.after(cleanup);

  const lines = [];
  const emptied = cleanPaths(['public'], { base, log: (line) => lines.push(line) });

  assert.deepEqual(emptied, [{ path: 'public', files: 2, bytes: 26 }], 'two 13-byte files');
  assert.equal(existsSync(join(base, 'public')), false);
  assert.equal(existsSync(join(base, 'content', 'index.md')), true, 'paths that were not asked for survive');
  assert.deepEqual(lines, ['emptied public/ — 2 file(s), 0.0 MB']);
});

test('a path that does not exist is skipped, not an error', (t) => {
  const { base, cleanup } = fixture();
  t.after(cleanup);

  const emptied = cleanPaths(['public', 'resources/_gen', 'hugo_stats.json'], { base, log: () => {} });
  assert.deepEqual(
    emptied.map(({ path }) => path),
    ['public'],
    'a fresh checkout has nothing to remove, and that is not a failure'
  );
});

test('it refuses the base itself and anything outside it', (t) => {
  const { base, cleanup } = fixture();
  t.after(cleanup);

  for (const path of ['.', '', '..', '../elsewhere', join(base, '..', 'sibling')]) {
    assert.throws(
      () => cleanPaths([path], { base, log: () => {} }),
      /outside the repository/,
      `${JSON.stringify(path)} must be refused`
    );
  }
  assert.equal(existsSync(join(base, 'public', 'index.html')), true, 'a refused run deleted nothing');
});
