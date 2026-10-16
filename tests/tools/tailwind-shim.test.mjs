/**
 * Unit and integration tests for tools/tailwind-shim.mjs — run with `npm run test:tools`
 * (`node --test tests/tools/`), Node's own runner, no build and no browser.
 *
 * The unit cases pin the one thing that decides whether a build works: Hugo's own three-step lookup
 * (`resolveNodeBin` in common/hexec/exec.go, v0.167.0), applied to the four shapes a `.bin/tailwindcss`
 * can have — npm's wrapper, pnpm's wrapper, a symlink, a Node script. The pnpm fixtures are trimmed
 * copies of what pnpm 12.9.1 actually wrote for @tailwindcss/cli@4.3.3 on Windows, keeping the lines
 * that matter: the NODE_PATH preamble, which is why Hugo rejects the file.
 *
 * The last case is the integration one, against a throwaway layout rather than this repository's real
 * node_modules: it builds a fake `@tailwindcss/cli` (a package.json and an index.mjs that prints its
 * arguments), writes pnpm's wrappers over it, runs the repair, and then *runs* the CLI through the
 * repaired shim — so the test fails if the tool ever produces something Hugo accepts but a shell
 * cannot execute.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

import { cliEntry, cmdShim, posixShim, repairShims, resolveNodeBin } from '../../tools/tailwind-shim.mjs';

const ENTRY = '../@tailwindcss/cli/dist/index.mjs';

/** pnpm's shell wrapper, trimmed to the shape that breaks the lookup: the absolute NODE_PATH line
 *  comes first, and `\node_modules\@tailwindcss\cli\node_modules` inside it is the first thing
 *  Hugo's regex matches — a directory that does not exist. */
const PNPM_SH = [
  '#!/bin/sh',
  '# Resolve $0 through symlinks so basedir is the shim’s real directory.',
  'basedir=/d/source/website/node_modules/.bin',
  "new_node_path='/mnt/d/source/website/node_modules/.pnpm/@tailwindcss+cli@4.3.3/node_modules/@tailwindcss/cli/node_modules:/mnt/d/source/website/node_modules/.pnpm/@tailwindcss+cli@4.3.3/node_modules'",
  'export NODE_PATH="$new_node_path"',
  'exec node  "$basedir/../@tailwindcss/cli/dist/index.mjs" "$@"',
  ''
].join('\n');

/** pnpm's Windows wrapper, same story: the NODE_PATH assignment is the first match. */
const PNPM_CMD = [
  '@SETLOCAL',
  '@IF NOT DEFINED NODE_PATH (',
  '  @SET "NODE_PATH=D:\\source\\website\\node_modules\\.pnpm\\@tailwindcss+cli@4.3.3\\node_modules\\@tailwindcss\\cli\\node_modules;D:\\source\\website\\node_modules\\.pnpm\\node_modules"',
  ') ELSE (',
  '  @SET "NODE_PATH=D:\\source\\website\\node_modules\\.pnpm\\node_modules;%NODE_PATH%"',
  ')',
  '@IF EXIST "%~dp0\\node.exe" (',
  '  "%~dp0\\node.exe"  "%~dp0\\..\\@tailwindcss\\cli\\dist\\index.mjs" %*',
  ') ELSE (',
  '  node  "%~dp0\\..\\@tailwindcss\\cli\\dist\\index.mjs" %*',
  ')',
  ''
].join('\r\n');

/** A fake @tailwindcss/cli inside a throwaway node_modules/.bin, with a CLI that echoes its args. */
function layout({ bin = 'object' } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'tailwind-shim-'));
  const nodeModules = join(base, 'node_modules');
  const binDir = join(nodeModules, '.bin');
  const packageDir = join(nodeModules, '@tailwindcss', 'cli');
  mkdirSync(join(packageDir, 'dist'), { recursive: true });
  mkdirSync(binDir, { recursive: true });
  writeFileSync(
    join(packageDir, 'package.json'),
    JSON.stringify({ name: '@tailwindcss/cli', bin: bin === 'object' ? { tailwindcss: 'dist/index.mjs' } : 'dist/index.mjs' })
  );
  writeFileSync(join(packageDir, 'dist', 'index.mjs'), "#!/usr/bin/env node\nconsole.log('fake cli', process.argv.slice(2).join(' '));\n");
  return {
    binDir,
    packageDir,
    entry: join(packageDir, 'dist', 'index.mjs'),
    cleanup: () => rmSync(base, { recursive: true, force: true })
  };
}

test('Hugo’s lookup accepts npm’s shell shim and rejects pnpm’s wrapper', (t) => {
  const { binDir, entry, cleanup } = layout();
  t.after(cleanup);

  const npmShim = join(binDir, 'tailwindcss');
  writeFileSync(npmShim, posixShim(ENTRY));
  assert.equal(resolveNodeBin(npmShim), entry, 'the first path-shaped match in npm’s shim is the entry');

  writeFileSync(npmShim, PNPM_SH);
  assert.equal(resolveNodeBin(npmShim), '', 'pnpm’s NODE_PATH line wins the first match, so nothing resolves');
});

test('Hugo’s lookup reads npm’s .cmd shim and rejects pnpm’s, for the same reason', (t) => {
  const { binDir, entry, cleanup } = layout();
  t.after(cleanup);

  const cmdShimPath = join(binDir, 'tailwindcss.cmd');
  writeFileSync(cmdShimPath, cmdShim('..\\@tailwindcss\\cli\\dist\\index.mjs'));
  assert.equal(resolveNodeBin(cmdShimPath), entry);

  writeFileSync(cmdShimPath, PNPM_CMD);
  assert.equal(resolveNodeBin(cmdShimPath), '');
});

test('a symlinked bin and a Node script are accepted on their own', (t) => {
  const { binDir, entry, cleanup } = layout();
  t.after(cleanup);

  const link = join(binDir, 'tailwindcss');
  try {
    symlinkSync(entry, link, 'file');
  } catch (error) {
    // Creating symlinks on Windows needs Developer Mode or elevation; pnpm-managed checkouts have it.
    t.skip(`symlinks unavailable here: ${error.code}`);
    return;
  }
  assert.equal(resolveNodeBin(link), entry);

  const script = join(binDir, 'tailwindcss-script');
  writeFileSync(script, '#!/usr/bin/env node\nconsole.log(1);\n');
  assert.equal(resolveNodeBin(script), script, 'a shebang is enough — npm’s global installs look like this');
});

test('a missing file, and a wrapper with no entry point at all, resolve to nothing', (t) => {
  const { binDir, cleanup } = layout();
  t.after(cleanup);

  assert.equal(resolveNodeBin(join(binDir, 'tailwindcss')), '');
  const empty = join(binDir, 'tailwindcss-empty');
  writeFileSync(empty, '#!/bin/sh\nexec node "$basedir/somewhere/else.js" "$@"\n');
  assert.equal(resolveNodeBin(empty), '', 'a path that does not exist is not accepted');
});

test('cliEntry comes from the package’s own bin field', (t) => {
  const asObject = layout();
  t.after(asObject.cleanup);
  assert.equal(cliEntry(join(asObject.binDir, '..')), asObject.entry);

  const asString = layout({ bin: 'string' });
  t.after(asString.cleanup);
  assert.equal(cliEntry(join(asString.binDir, '..')), asString.entry);

  const missing = layout();
  t.after(missing.cleanup);
  rmSync(join(missing.binDir, '..', '@tailwindcss'), { recursive: true, force: true });
  assert.equal(cliEntry(join(missing.binDir, '..')), null);
});

test('repairShims rewrites pnpm’s wrappers, verifies them, runs the CLI, and then stops', (t) => {
  const { binDir, entry, cleanup } = layout();
  t.after(cleanup);

  const shell = join(binDir, 'tailwindcss');
  const cmd = join(binDir, 'tailwindcss.cmd');
  writeFileSync(shell, PNPM_SH);
  writeFileSync(cmd, PNPM_CMD);

  const first = repairShims({ binDir, log: () => {} });
  assert.equal(first.status, 'repaired');
  assert.deepEqual(
    first.repaired.map(({ shim }) => shim).sort(),
    [cmd, shell].sort(),
    'both wrappers Hugo could pick are rewritten'
  );
  assert.equal(resolveNodeBin(shell), entry);
  assert.equal(resolveNodeBin(cmd), entry);
  assert.ok(!readFileSync(shell, 'utf8').includes('.pnpm'), 'pnpm’s absolute NODE_PATH is gone');
  assert.ok(!readFileSync(cmd, 'utf8').includes('.pnpm'));

  // The point of the exercise: Hugo hands the resolved file to node, so it has to be the CLI.
  assert.equal(execFileSync(process.execPath, [entry, '--probe'], { encoding: 'utf8' }).trim(), 'fake cli --probe');

  if (process.platform !== 'win32') {
    // And the shim is still a shim: a shell can run it, which is what `pnpm exec tailwindcss` does.
    assert.equal(execFileSync('sh', [shell, '--probe'], { encoding: 'utf8' }).trim(), 'fake cli --probe');
  }

  const second = repairShims({ binDir, log: () => {} });
  assert.equal(second.status, 'unchanged', 'a second run finds nothing to do');
  assert.equal(second.resolved.length, 2);
});

test('repairShims leaves an npm-installed checkout untouched', (t) => {
  const { binDir, entry, cleanup } = layout();
  t.after(cleanup);

  const shell = join(binDir, 'tailwindcss');
  writeFileSync(shell, posixShim(ENTRY));
  const before = readFileSync(shell, 'utf8');

  const result = repairShims({ binDir, log: () => {} });

  assert.equal(result.status, 'unchanged');
  assert.deepEqual(result.repaired, []);
  assert.equal(readFileSync(shell, 'utf8'), before, 'byte for byte');
  assert.equal(resolveNodeBin(shell), entry);
});
