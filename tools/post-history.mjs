#!/usr/bin/env node
/**
 * Seeds and refreshes each page's `[[history]]` front-matter array from that page's own git commits —
 * the version table layouts/_default/single.html renders at the foot of a post (#7).
 *
 *     npm run history          # report only: every page's commits, what the front matter holds, what would change
 *     npm run history:write    # apply it under content/
 *     npm run history:check    # exit 1 if any page is out of date — the CI / pre-commit form
 *
 *     node tools/post-history.mjs content/posts/using-winget/index.md   # one page, same options
 *
 * Why a tool rather than a template: Hugo can already see a file's last commit (`enableGitInfo`,
 * `.GitInfo`), and that is precisely why the site's own "Last updated" line spent a long time being
 * wrong — one commit date is not a history, it cannot tell a typo fix from a rewrite, and it carries no
 * note a reader could use. The `history` array is authored data: version labels and prose notes. What
 * git *can* supply is the skeleton — when the file changed, who changed it, and what the commit said —
 * so that is all this derives, and everything else is left alone.
 *
 * Two things it deliberately preserves, both learned from the one hand-written example
 * (content/posts/get-set-ip-address-with-powershell/index.md):
 *
 *   - A note and a version label already in the front matter survive when their entry matches a commit
 *     by timestamp. That is what makes the tool safe to re-run over hand-written entries: 'First
 *     published' and 'Added the old-school ipconfig example' are the author's words, and a regeneration
 *     must not replace them with 'Updates with more draft posts'.
 *   - A commit whose only change is *inside the front matter* is not an entry. Otherwise the commit
 *     that seeds a page's history becomes an entry in the history it seeded — which is exactly the
 *     entry the hand-written example does not have. Bodies are compared (`git show <rev>:<path>` with
 *     the front matter stripped), so this is the real question asked: did this commit change what the
 *     page says, not merely what it declares?
 *
 * A page with fewer than `--min-commits` (default 2) body-changing commits gets no block at all, which
 * mirrors the template: `{{ if gt (len .Params.history) 1 }}` renders nothing for a lone entry, because
 * a single entry is just the publication date the header already shows.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Written above a generated block, and recognised on a re-run so it is never duplicated. */
export const HISTORY_COMMENT =
  "# Version history, seeded from this file's git commits — tools/post-history.mjs (npm run history)." +
  ' Edit the notes and labels freely; a re-run keeps them.';

const FIELD_SEPARATOR = '\x1f';
const RECORD_SEPARATOR = '\x1e';
const DEFAULT_MIN_COMMITS = 2;

/* ------------------------------------------------------------------ text handling */

/**
 * Lines with their offsets, so a replacement touches only the bytes it means to and leaves the rest of
 * the file — comments, spacing, CRLF endings — exactly as it found it. `end` excludes the line's own
 * end-of-line; `eolEnd` includes it.
 */
export function scanLines(text) {
  const lines = [];
  let start = 0;
  for (;;) {
    const newline = text.indexOf('\n', start);
    if (newline === -1) {
      if (start < text.length) lines.push({ start, end: text.length, eolEnd: text.length, text: text.slice(start) });
      return lines;
    }
    const end = newline > start && text[newline - 1] === '\r' ? newline - 1 : newline;
    lines.push({ start, end, eolEnd: newline + 1, text: text.slice(start, end) });
    start = newline + 1;
  }
}

/**
 * The TOML front matter of a page, or null when the file is not delimited by `+++` (none of this site's
 * content is YAML, and guessing at it would be worse than saying so).
 */
export function splitFrontMatter(text) {
  const lines = scanLines(text);
  if (!lines.length) return null;
  if (lines[0].text.replace(/^\uFEFF/, '').trim() !== '+++') return null;
  const close = lines.find((line, index) => index > 0 && line.text.trim() === '+++');
  if (!close) return null;
  return {
    frontMatter: text.slice(lines[0].eolEnd, close.start),
    body: text.slice(close.eolEnd),
    start: lines[0].eolEnd,
    end: close.start,
    eol: text.includes('\r\n') ? '\r\n' : '\n'
  };
}

export function parseTomlScalar(raw) {
  const text = String(raw).trim();
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1);
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
  }
  return text; // dates, numbers, booleans, inline arrays: kept verbatim
}

/** A TOML string that round-trips: single-quoted unless the value contains one. */
export function quoteTomlString(value) {
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (!text.includes("'")) return `'${text}'`;
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/* ------------------------------------------------------------------ history front matter */

/** The `[[history]]` arrays in a front-matter block, and the byte range they occupy. */
export function parseHistory(frontMatter) {
  const lines = scanLines(frontMatter);
  const entries = [];
  let regionStart = -1;
  let regionEnd = -1;
  let hasComment = false;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.text.trim() !== '[[history]]') {
      index++;
      continue;
    }
    if (regionStart === -1) {
      regionStart = line.start;
      const above = lines[index - 1];
      if (above && above.text.trim() === HISTORY_COMMENT && above.text === above.text.trim()) {
        regionStart = above.start; // our own marker: removing the block removes its label too
        hasComment = true;
      }
    }
    const fields = {};
    let field = index + 1;
    while (field < lines.length && /^\s*[A-Za-z_][A-Za-z0-9_-]*\s*=/.test(lines[field].text)) {
      const text = lines[field].text;
      fields[text.slice(0, text.indexOf('=')).trim()] = parseTomlScalar(text.slice(text.indexOf('=') + 1));
      regionEnd = lines[field].end;
      field++;
    }
    entries.push(fields);
    index = field;
  }

  return {
    entries,
    regionStart,
    regionEnd,
    hasComment,
    /* `history = false` (or any scalar) is the opt-out: Hugo's `with` skips the block, and so do we. */
    optedOut: /^\s*history\s*=/m.test(frontMatter)
  };
}

export function formatHistoryEntry(entry) {
  return [
    '[[history]]',
    `version = ${quoteTomlString(entry.version)}`,
    `date = ${entry.date}`,
    `author = ${quoteTomlString(entry.author)}`,
    `note = ${quoteTomlString(entry.note)}`
  ];
}

/**
 * The front matter with its history block replaced by `entries`. Everything outside the block is copied
 * byte for byte — including the blank line that separates entries, whichever way the file already ends
 * its lines.
 */
export function replaceHistory(frontMatter, entries, eol = '\n') {
  const current = parseHistory(frontMatter);
  const block = [];
  if (entries.length) {
    /* Our marker goes above a block this tool owns — a new one, or one it has already labelled. A
       hand-written comment above a block is left exactly where it is, in the prefix below. */
    if (current.regionStart === -1 || current.hasComment) block.push(HISTORY_COMMENT);
    entries.forEach((entry, index) => {
      if (index) block.push('');
      block.push(...formatHistoryEntry(entry));
    });
  }

  if (current.regionStart === -1) {
    if (!block.length) return frontMatter;
    const head = frontMatter.endsWith(eol) ? frontMatter : frontMatter + eol;
    return `${head}${eol}${block.join(eol)}${eol}`;
  }

  return frontMatter.slice(0, current.regionStart) + block.join(eol) + frontMatter.slice(current.regionEnd);
}

/* ------------------------------------------------------------------ git */

/**
 * git with its complaints captured rather than printed: a missing `<rev>:<path>` is expected on a page's
 * first commit, and git's `fatal:` line for it is noise in a report. The text is kept on the error so
 * the one failure that must never be swallowed — no repository, so no history to read — can be told
 * apart from the ones that are routine.
 */
function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    error.gitStderr = error.stderr ? String(error.stderr) : '';
    throw error;
  }
}

const NO_REPOSITORY = /not a git repository|not recognized as an internal or external command|command not found|ENOENT/i;

/**
 * The path of the work tree git would use from here, or null when there is none. Compared against this
 * directory rather than merely asking whether *a* work tree is visible: a copy of the project sitting
 * inside another repository would otherwise be answered with the parent's history for paths that only
 * look the same, which is worse than failing.
 */
export function workTree(run = git) {
  try {
    const top = run(['rev-parse', '--show-toplevel']).trim();
    if (!top) return null;
    const normalise = (path) => resolve(path).replace(/\\/g, '/').toLowerCase();
    return normalise(top) === normalise(root) ? top : null;
  } catch {
    return null;
  }
}

/**
 * Every commit that touched a file, oldest first, each with the path the file had in that commit (so a
 * rename does not break the body comparison) and whether the commit changed anything outside the front
 * matter.
 */
export function commitsFor(path, run = git) {
  const tracked = path.split(/[\\/]/).join('/');
  let output;
  try {
    /* `%aI` is the author date, which is what the hand-written example's entries carry. */
    output = run([
      'log',
      '--follow',
      '--name-status',
      `--format=${RECORD_SEPARATOR}%H${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%aN${FIELD_SEPARATOR}%s`,
      '--',
      tracked
    ]);
  } catch (error) {
    /* Swallowing "there is no repository here" would report every page as having no commits, which in
       --write mode would delete the history of every page. That case has to stay loud. */
    if (NO_REPOSITORY.test(`${error.gitStderr || ''}${error.message}`)) throw error;
    return [];
  }

  const commits = [];
  for (const record of output.split(RECORD_SEPARATOR)) {
    const lines = record.split('\n').filter((line) => line.trim() !== '');
    if (!lines.length) continue;
    const [sha, date, author, ...subject] = lines[0].split(FIELD_SEPARATOR);
    if (!sha || !date) continue;

    let path = tracked;
    let parentPath = tracked;
    let deleted = false;
    for (const line of lines.slice(1)) {
      const [status, first, second] = line.split('\t');
      if (!status) continue;
      if (status.startsWith('R') || status.startsWith('C')) {
        parentPath = first;
        path = second;
      } else if (status.startsWith('D')) {
        deleted = true;
      } else {
        path = first;
        parentPath = first;
      }
    }

    /* The page's own words at a revision, or null when the file did not exist there. */
    const bodyAt = (rev, file) => {
      try {
        const raw = run(['show', `${rev}:${file}`]);
        const found = splitFrontMatter(raw);
        return found ? found.body : raw;
      } catch {
        return null;
      }
    };
    const at = bodyAt(sha, path);
    const before = bodyAt(`${sha}^`, parentPath);

    commits.push({
      sha,
      short: sha.slice(0, 7),
      date,
      author,
      subject: subject.join(FIELD_SEPARATOR).trim(),
      path,
      deleted,
      /* A commit that created the page, or one whose parent had no such file, counts as a change. */
      bodyChanged: !deleted && at !== null && (before === null || at !== before)
    });
  }

  return commits.reverse();
}

/* ------------------------------------------------------------------ merging */

export function formatVersion(index) {
  return `1.${index}`;
}

export function sameInstant(a, b) {
  const left = Date.parse(a);
  const right = Date.parse(b);
  return Number.isFinite(left) && left === right;
}

/**
 * The entries a page should carry: one per body-changing commit, in order, with an existing entry's
 * version and note kept wherever a commit matches it. `dropped` is what that leaves behind — entries in
 * the front matter dated like no commit — which is reported rather than silently discarded, since a
 * hand-edited date is the one way to get one.
 */
export function mergeHistory(existing, commits, { minCommits = DEFAULT_MIN_COMMITS } = {}) {
  const listed = commits.filter((commit) => commit.bodyChanged);
  if (listed.length < minCommits) {
    return { entries: [], dropped: existing, listed, belowMin: true };
  }

  const pool = [...existing];
  const entries = listed.map((commit, index) => {
    const at = pool.findIndex((entry) => entry.date && sameInstant(entry.date, commit.date));
    const kept = at === -1 ? null : pool.splice(at, 1)[0];
    return {
      version: kept?.version || formatVersion(index),
      date: commit.date,
      author: kept?.author || commit.author,
      note: kept?.note || commit.subject,
      sha: commit.short,
      kept: Boolean(kept)
    };
  });

  return { entries, dropped: pool, listed, belowMin: false };
}

/* ------------------------------------------------------------------ the pages */

export function listContentFiles(targets = ['content']) {
  const files = [];
  const walk = (absolute) => {
    if (!existsSync(absolute)) return;
    if (statSync(absolute).isFile()) {
      if (absolute.endsWith('.md')) files.push(absolute);
      return;
    }
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(join(absolute, entry.name));
    }
  };
  for (const target of targets) walk(join(root, target));
  return [...new Set(files)].sort();
}

export function analysePage(absolute, { minCommits = DEFAULT_MIN_COMMITS, run = git } = {}) {
  const path = relative(root, absolute).split('\\').join('/');
  const text = readFileSync(absolute, 'utf8');
  const found = splitFrontMatter(text);
  if (!found) return { path, skip: 'no TOML front matter' };

  const current = parseHistory(found.frontMatter);
  if (current.optedOut) return { path, skip: 'opted out (`history = …` set as a value)' };
  /* Only dated pages: the table lives in the post template's single-page branch, and a section index
     has no publication date to anchor a version to. */
  if (!/^\s*date\s*=/m.test(found.frontMatter)) return { path, skip: 'no `date` in front matter' };

  const commits = commitsFor(path, run);
  /* A page with no commits at all is a page git cannot see — uncommitted, or added after a checkout.
     Its front matter is the only record of its history, so it is left exactly as it is. */
  if (!commits.length && current.entries.length) {
    return { path, skip: 'no commits in git for this path — leaving its history alone', commits };
  }
  const merged = mergeHistory(current.entries, commits, { minCommits });
  const frontMatter = replaceHistory(found.frontMatter, merged.entries, found.eol);
  const updated = text.slice(0, found.start) + frontMatter + text.slice(found.end);

  return {
    path,
    absolute,
    commits,
    existing: current.entries,
    ...merged,
    frontMatter,
    updated,
    changed: updated !== text
  };
}

/* ------------------------------------------------------------------ the report */

const pad = (text, width) => String(text).padEnd(width);

function report(result, { minCommits }) {
  if (result.skip) {
    console.log(`${result.path}\n  skipped — ${result.skip}\n`);
    return;
  }

  const changedBodies = result.listed.length;
  const state = result.changed
    ? result.entries.length
      ? `would write ${result.entries.length} entr${result.entries.length === 1 ? 'y' : 'ies'}`
      : 'would remove the history block'
    : 'up to date';
  const current = result.existing.length
    ? `front matter has ${result.existing.length}`
    : 'front matter has none';

  console.log(
    `${result.path}  ·  ${result.commits.length} commit${result.commits.length === 1 ? '' : 's'}, ` +
      `${changedBodies} changed the body  ·  ${current}  ·  ${state}`
  );

  const width = result.entries.length ? Math.max(...result.entries.map((entry) => entry.version.length)) : 1;
  for (const entry of result.entries) {
    console.log(
      `    ${pad(entry.version, width)}  ${entry.date}  ${pad(entry.author, 16)}  ${entry.note}` +
        `${entry.kept ? '  (kept from the front matter)' : `  (${entry.sha})`}`
    );
  }

  if (result.belowMin) {
    console.log(`    fewer than ${minCommits} body-changing commits — no block is written`);
  }

  for (const commit of result.commits) {
    if (commit.bodyChanged) continue;
    console.log(
      `    ·  ${commit.short} ${commit.date} "${commit.subject}" — ` +
        `${commit.deleted ? 'the file was deleted' : 'front matter only'}, not listed`
    );
  }

  for (const entry of result.dropped) {
    console.log(
      `    !  front matter entry dated ${entry.date || '(none)'} matches no commit` +
        `${entry.note ? ` ("${entry.note}")` : ''} — it would be dropped`
    );
  }

  console.log('');
}

function usage() {
  console.log(`Usage: node tools/post-history.mjs [options] [paths...]

Seeds each page's [[history]] front matter from its own git commits.

  (no options)          report what each page's history would be — nothing is written
  --write               write the front matter back into the files
  --check               exit 1 if any page is out of date (CI, or a pre-commit hook)
  --json                emit the report as JSON instead of prose
  --min-commits <n>     commits needed before a block is written (default ${DEFAULT_MIN_COMMITS})
  --paths <a,b,...>     what to scan (default content/); positional paths work too

  npm run history | npm run history:write | npm run history:check`);
}

export async function main(argv = process.argv.slice(2)) {
  const options = { write: false, check: false, json: false, minCommits: DEFAULT_MIN_COMMITS, targets: [] };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--write') options.write = true;
    else if (argument === '--check') options.check = true;
    else if (argument === '--json') options.json = true;
    else if (argument === '--min-commits') options.minCommits = Number(argv[++index]);
    else if (argument === '--paths') options.targets.push(...String(argv[++index]).split(','));
    else if (argument === '--help' || argument === '-h') return usage();
    else if (argument.startsWith('-')) {
      console.error(`unknown option: ${argument}`);
      usage();
      return 2;
    } else options.targets.push(argument);
  }
  if (options.write && options.check) {
    console.error('--write and --check are alternatives: --check never writes');
    return 2;
  }

  const files = listContentFiles(options.targets.length ? options.targets : ['content']);
  if (!files.length) {
    console.error(`nothing to check under ${options.targets.join(', ') || 'content/'} — run this from the repository root`);
    return 2;
  }
  if (!workTree()) {
    console.error(`${root} is not a git work tree of its own — the history comes from git, so there is nothing to read`);
    return 2;
  }

  const results = files.map((file) => analysePage(file, { minCommits: options.minCommits }));
  const considered = results.filter((result) => !result.skip);
  const changed = considered.filter((result) => result.changed);

  if (options.json) {
    /* Deliberately not the whole result: `frontMatter` and `updated` are the file's own text, which a
       pipeline does not need and a log should not carry. */
    console.log(
      JSON.stringify(
        {
          pages: results.map(({ absolute, listed, frontMatter, updated, ...result }) => result),
          total: results.length,
          considered: considered.length,
          changed: changed.length
        },
        null,
        2
      )
    );
  } else {
    console.log(`Post history — ${considered.length} dated page(s) under ${options.targets.join(', ') || 'content/'}\n`);
    for (const result of results) report(result, { minCommits: options.minCommits });
  }

  if (options.write) {
    for (const result of changed) {
      writeFileSync(result.absolute, result.updated);
      if (!options.json) console.log(`wrote ${result.path} (${result.entries.length} entr${result.entries.length === 1 ? 'y' : 'ies'})`);
    }
    if (!options.json) {
      console.log(`\n${changed.length} of ${considered.length} page(s) updated.`);
      if (changed.some((result) => result.entries.some((entry) => !entry.kept))) {
        console.log(
          'Entries marked with a commit id have a commit subject as their note — edit those before\n' +
            'committing, they are read by people. A later run keeps whatever you write.'
        );
      }
    }
    return 0;
  }

  if (options.check) {
    if (changed.length) {
      console.error(`${changed.length} page(s) have a stale history block:`);
      for (const result of changed) console.error(`  ${result.path}`);
      console.error('\nRun `npm run history:write` and commit the result.');
      return 1;
    }
    if (!options.json) console.log('every page’s history matches its git commits');
    return 0;
  }

  if (!options.json) {
    console.log(
      `${changed.length} of ${considered.length} page(s) would change — nothing written. ` +
        'Use --write to update them, or --check to fail instead.'
    );
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = (await main()) ?? 0;
}
