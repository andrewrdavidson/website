#!/usr/bin/env node
/**
 * Makes the Tailwind CSS CLI resolvable by Hugo when the dependencies were installed with pnpm.
 *
 *     npm run tailwind:shim        # runs first in the build, dev and test:prepare scripts
 *
 * ---
 *
 * The fault: since v0.161.0 Hugo's `css.TailwindCSS` no longer runs a standalone `tailwindcss`
 * binary. It invokes the npm-installed CLI *with Node*, under Node's permission model, which means
 * it has to answer "which .mjs file do I hand to node?" before it can run anything. `Npx` in
 * common/hexec/exec.go resolves `node_modules/.bin/tailwindcss` and then reads that file, accepting
 * three shapes (v0.167.0, the version `hugo.toml`'s requirements table and the workflow pin):
 *
 *   1. a symlink whose target is a `.js`/`.mjs`/`.cjs` file or a Node script;
 *   2. a file that *is* a Node script (first line a `#!` line mentioning node);
 *   3. a wrapper script naming a path to the entry point — and, in v0.167.0, only the **first**
 *      path-shaped match in it, found with the regex `[/\\]((?:\.\.|node_modules)[/\\][\w@][\w@./\\-]*)`.
 *
 * If none of those hold, Hugo reports `binary "tailwindcss" is not a Node.js script` and the build
 * dies in layouts/partials/head/css.html — the deferred stylesheet pass, after every page has
 * rendered, which is why the failure looks like a CSS problem rather than a lookup problem.
 *
 * npm's shim satisfies (3): its only path-shaped string is `%dp0%\..\@tailwindcss\cli\dist\index.mjs`
 * (or `$basedir_win/../…` in the shell variant), so the first match is the entry point itself. pnpm's
 * shim does not: it exports a NODE_PATH first — `…\.pnpm\@tailwindcss+cli@4.3.3\node_modules\@tailwindcss\cli\node_modules`,
 * a *flat-store* path of the tool's own dependency directory — and that fragment matches the regex
 * before the `exec node "$basedir_abs/../@tailwindcss/cli/dist/index.mjs"` line ever appears. Hugo
 * stats the fragment, finds nothing, and gives up on the whole file, even though the shim runs the
 * right CLI perfectly well from a shell.
 *
 * This is upstream issue gohugoio/hugo#14852. The fix — walking *every* match instead of only the
 * first — is PR #14856 and is not in a release, and pnpm's other route out, `preferSymlinkedExecutables`
 * (shape 1), is documented as ignored on Windows, which is where this repository is built. So the shim
 * itself is repaired here instead of waiting for Hugo.
 *
 * ---
 *
 * What it does: for `node_modules/.bin/tailwindcss` (POSIX) and `node_modules/.bin/tailwindcss.cmd`
 * (Windows — Go's LookPath prefers it when both exist, and something with a PATHEXT extension over
 * anything without), run Hugo's own three-step test. If the file already passes, it is left exactly
 * as it is, byte for byte. If it fails, it is rewritten as npm's shim — the same text npm's cmd-shim
 * writes, with the entry path read from `@tailwindcss/cli`'s own `package.json` — and the rewrite is
 * verified by running the same test again and comparing the file it resolves to with the CLI the
 * package actually ships. `tailwindcss.ps1` is never touched: PATHEXT does not list `.PS1`, so Hugo
 * cannot end up using it, and rewriting a shim that PowerShell users run would be a change with no
 * upside.
 *
 * The repaired file stays a working shim (`exec node …/index.mjs "$@"`), so `pnpm exec tailwindcss`
 * and a bare `tailwindcss` on a shell's PATH behave exactly as before — the only thing that changes
 * is that Hugo can now read it. Nothing is written when the shim is already readable, which is why
 * npm-installed checkouts (this repository's CI) see this script as a no-op.
 *
 * When Hugo gains pnpm support, delete this file, its `tailwind:shim` script entry and the preludes
 * that call it: the check gets cheaper, and the shims go back to being nobody's business but pnpm's.
 */
import { chmodSync, existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const BIN_DIR = join(root, 'node_modules', '.bin');

/** The two shims Hugo can end up resolving, in Go's LookPath preference order on Windows. */
export const SHIM_NAMES = ['tailwindcss.cmd', 'tailwindcss'];

/** Where the CLI package lives, seen from node_modules — the pnpm symlink is deliberately not
 *  followed: a target that spelled out `.pnpm/@tailwindcss+cli@4.3.3/…` would itself fail Hugo's
 *  regex (`.pnpm` starts with a dot, which the character class after the separator excludes). */
export const CLI_PACKAGE = ['@tailwindcss', 'cli'];

const JS_EXTENSIONS = ['.js', '.mjs', '.cjs'];

/** Hugo's `nodeEntryPointRe` exactly. The character class after the separator is `[\w@]`, so it
 *  cannot start on the dot of pnpm's `node_modules/.pnpm/…` — which is why pnpm's flat store is
 *  invisible to it and only its absolute NODE_PATH preamble matches. */
const ENTRY_RE = /[/\\]((?:\.\.|node_modules)[/\\][\w@][\w@./\\-]*)/;

export function hasJsExtension(path) {
  return JS_EXTENSIONS.some((extension) => path.endsWith(extension));
}

/** Hugo's `isNodeScript`: the first line starts with `#!` and mentions node. */
export function isNodeScript(path) {
  let firstLine;
  try {
    firstLine = readFileSync(path, 'latin1').split('\n', 1)[0];
  } catch {
    return false;
  }
  return firstLine.startsWith('#!') && firstLine.includes('node');
}

/**
 * Hugo v0.167.0's `resolveNodeBin`, in order: a symlink to the entry, a Node script, or the first
 * path-shaped match in a wrapper. Returns the script Hugo would hand to node, or '' for the case
 * that fails the build with `binary "tailwindcss" is not a Node.js script`.
 *
 * Kept as a faithful mirror rather than a "does this look fine" heuristic: the only thing that
 * matters is whether *Hugo* accepts the file, so the check has to be Hugo's, including its
 * first-match-only reading. When #14856 lands here, this function becomes more permissive than
 * Hugo — at which point the tool stops rewriting anything, and the entry can be deleted.
 */
export function resolveNodeBin(path) {
  try {
    if (lstatSync(path).isSymbolicLink()) {
      const real = realpathSync(path);
      return hasJsExtension(real) || isNodeScript(real) ? real : '';
    }
  } catch {
    return '';
  }

  if (isNodeScript(path)) return path;

  let data;
  try {
    data = readFileSync(path, 'latin1');
  } catch {
    return '';
  }
  const match = ENTRY_RE.exec(data);
  if (!match) return '';
  const resolved = join(dirname(path), match[1].replaceAll('\\', '/'));
  if (!existsSync(resolved)) return '';
  if (!hasJsExtension(resolved) && !isNodeScript(resolved)) return '';
  return resolved;
}

/** The CLI entry as `@tailwindcss/cli` itself declares it, or null when the package is not installed. */
export function cliEntry(nodeModules = join(root, 'node_modules')) {
  const packageDir = join(nodeModules, ...CLI_PACKAGE);
  const manifestPath = join(packageDir, 'package.json');
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const { bin } = manifest;
  const entry =
    typeof bin === 'string' ? bin : (bin?.tailwindcss ?? (bin ? Object.values(bin)[0] : undefined)) ?? 'dist/index.mjs';
  return join(packageDir, entry);
}

/** npm's shell shim (`cmd-shim`'s output on POSIX, as a checkout installed with npm has it),
 *  with `target` — `../@tailwindcss/cli/dist/index.mjs` — as the one thing that varies. */
export function posixShim(target) {
  return `#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")
basedir_win="$basedir"

case \`uname -a\` in
  *CYGWIN*|*MINGW*|*MSYS*)
    if command -v cygpath > /dev/null 2>&1; then
      basedir_win=\`cygpath -w "$basedir"\`
    fi
  ;;
  *WSL2*)
    if command -v wslpath > /dev/null 2>&1; then
      basedir_win="$(wslpath -w "$basedir" 2> /dev/null)"
      if [ $? -ne 0 ] || [ -z "$basedir_win" ]; then
        echo "Error: wslpath failed to convert path. WSL environment may be misconfigured." >&2
        exit 1
      fi
    fi
  ;;
esac

PROG_EXE="$basedir/node.exe"
if ! [ -x "$PROG_EXE" ]; then
  PROG_EXE="$basedir/node"
  if ! [ -x "$PROG_EXE" ]; then
    PROG_EXE=node
    if ! [ -x "$PROG_EXE" ]; then
      PROG_EXE=node.exe
    fi
  fi
fi

exec "$PROG_EXE"  "$basedir_win/${target}" "$@"
`;
}

/** npm's Windows shim, CRLF and all, for the same reason. `target` here is the backslash form. */
export function cmdShim(target) {
  const lines = [
    '@ECHO off',
    'GOTO start',
    ':find_dp0',
    'SET dp0=%~dp0',
    'EXIT /b',
    ':start',
    'SETLOCAL',
    'CALL :find_dp0',
    '',
    'IF EXIST "%dp0%\\node.exe" (',
    '  SET "_prog=%dp0%\\node.exe"',
    ') ELSE (',
    '  SET "_prog=node"',
    ')',
    '',
    `endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & set PATHEXT=%PATHEXT:;.JS;=;% & "%_prog%"  "%dp0%\\${target}" %*`
  ];
  return lines.map((line) => `${line}\r\n`).join('');
}

/**
 * Repairs what needs repairing and reports what it found. Writes nothing when every shim Hugo could
 * resolve already resolves — the outcome an npm-installed checkout gets.
 */
export function repairShims({ binDir = BIN_DIR, log = console.log } = {}) {
  const nodeModules = dirname(binDir);
  const shims = SHIM_NAMES.map((name) => join(binDir, name)).filter((path) => existsSync(path));
  const entry = cliEntry(nodeModules);

  if (!entry) {
    log(`tailwind shim: no @tailwindcss/cli under ${relative(root, nodeModules) || '.'}/ — nothing to repair`);
    return { status: 'no-cli', repaired: [], resolved: [] };
  }

  const repaired = [];
  const resolved = [];
  for (const shim of shims) {
    const before = resolveNodeBin(shim);
    if (before) {
      resolved.push({ shim, script: before });
      continue;
    }

    const target = relative(binDir, entry);
    const content = shim.endsWith('.cmd')
      ? cmdShim(target.split('/').join('\\'))
      : posixShim(target.split(sep).join('/'));
    writeFileSync(shim, content);
    if (!shim.endsWith('.cmd')) chmodSync(shim, 0o755);

    const after = resolveNodeBin(shim);
    if (!after || realpathSync(after) !== realpathSync(entry)) {
      throw new Error(
        `rewrote ${relative(root, shim)} but Hugo still cannot resolve the Tailwind CLI through it`
      );
    }
    repaired.push({ shim, script: after });
    log(
      `tailwind shim: rewrote ${relative(root, shim).split(sep).join('/')} in npm's shape — ` +
        'pnpm’s wrapper hides the CLI entry behind a NODE_PATH line that Hugo reads as the entry point ' +
        '(gohugoio/hugo#14852)'
    );
  }

  if (!repaired.length) {
    const what = resolved.length
      ? `${resolved.map(({ shim }) => relative(root, shim).split(sep).join('/')).join(', ')} already resolves`
      : 'no tailwindcss shim exists (Hugo will look on PATH)';
    log(`tailwind shim: ${what}`);
  }

  return { status: repaired.length ? 'repaired' : 'unchanged', repaired, resolved };
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('-h') || argv.includes('--help')) {
    console.log(
      [
        'Makes node_modules/.bin/tailwindcss readable by Hugo when pnpm installed it.',
        '',
        'Usage: node tools/tailwind-shim.mjs',
        '',
        'Repairs the shim in place (npm’s shape) if Hugo cannot resolve the Tailwind CLI through it,',
        'verifies the result, and does nothing at all when the shim is already resolvable.',
        'Runs first in the build, dev and test:prepare scripts; see gohugoio/hugo#14852.'
      ].join('\n')
    );
    return 0;
  }
  repairShims();
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = (await main()) ?? 0;
  } catch (error) {
    console.error(`tailwind shim: ${error.message}`);
    process.exitCode = 1;
  }
}
