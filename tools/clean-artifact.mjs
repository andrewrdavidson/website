#!/usr/bin/env node
/**
 * Empties the build output before Hugo writes into it.
 *
 *     npm run clean:artifact              # ./public — runs first in every build script
 *     npm run clean                       # public/, resources/_gen/, hugo_stats.json (a full reset)
 *     node tools/clean-artifact.mjs public   # any paths you name
 *
 * Why, when `hugo --cleanDestinationDir` already exists: that flag cleans up at the *end* of a build
 * that succeeds — it deletes what is in the destination and not in the artifact this build produced
 * (checked on 2026-10-16: a stale post directory, a moved taxonomy term, a stray root file and a
 * previous Pagefind index were all gone after `hugo --gc --minify --cleanDestinationDir`). What it
 * cannot do is tidy up after a build that *dies*, and the destination is shared with anything else
 * that writes into it:
 *
 *   - the pnpm build failure this script was added beside. The build got as far as every page
 *     rendered, then failed in the deferred stylesheet pass and exited 1, leaving a public/ holding
 *     output from an older, different build;
 *   - `hugo server`, which renders to disk by default. `npm run dev` passes `--renderToMemory` to
 *     avoid exactly this, but a plain `hugo server` in this directory does not;
 *   - `npm run search`, whose index belongs to the build that preceded it.
 *
 * Removing the directory first makes "this artifact is what this build produced" true from the first
 * byte rather than at the end, so no state can survive a failure to be mistaken for output, and the
 * wipe is also the reason the build scripts no longer pass `--cleanDestinationDir`.
 *
 * Paths are resolved against the repository root and refused if they name the root itself or land
 * outside it, so the tool cannot be talked into deleting anything that isn't inside the checkout.
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Files and bytes in a directory tree, for the one line this prints. */
export function measure(path) {
  const info = statSync(path);
  if (!info.isDirectory()) return { files: 1, bytes: info.size };
  return readdirSync(path, { withFileTypes: true }).reduce(
    (total, entry) => {
      const child = measure(join(path, entry.name));
      return { files: total.files + child.files, bytes: total.bytes + child.bytes };
    },
    { files: 0, bytes: 0 }
  );
}

export function cleanPaths(paths, { base = root, log = console.log } = {}) {
  const emptied = [];
  for (const path of paths) {
    const absolute = resolve(base, path);
    if (absolute === base || !absolute.startsWith(base + sep)) {
      throw new Error(`refusing to delete ${path}: outside the repository`);
    }
    if (!existsSync(absolute)) continue;
    const { files, bytes } = measure(absolute);
    rmSync(absolute, { recursive: true, force: true });
    emptied.push({ path, files, bytes });
    log(`emptied ${relative(base, absolute).split(sep).join('/')}/ — ${files} file(s), ${(bytes / 1048576).toFixed(1)} MB`);
  }
  return emptied;
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('-h') || argv.includes('--help')) {
    console.log(
      [
        'Empties build output directories before a build, inside the repository only.',
        '',
        'Usage: node tools/clean-artifact.mjs [path …]',
        '',
        'Defaults to public/, the Hugo build output. `npm run clean` passes the three paths a full',
        'reset wants (public/, resources/_gen/, hugo_stats.json); `npm run clean:artifact` is the',
        'pre-build form. Missing paths are not an error — a fresh checkout has nothing to remove.'
      ].join('\n')
    );
    return 0;
  }
  cleanPaths(argv.length ? argv : ['public']);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = (await main()) ?? 0;
  } catch (error) {
    console.error(`clean-artifact: ${error.message}`);
    process.exitCode = 1;
  }
}
