/**
 * Unit and integration tests for tools/post-history.mjs — run with `npm run test:tools`
 * (`node --test tests/tools/`), which is also the check the CI workflow can call.
 *
 * The unit cases pin the parts that are easy to get subtly wrong and impossible to see in a diff: the
 * byte-range replacement that must leave CRLF endings and the rest of the front matter untouched, the
 * merge that must keep a hand-written note, and the rule that a front-matter-only commit is not an entry.
 *
 * The last case is an integration test against a *throwaway* repository rather than this one: it makes
 * three commits — a page, a body edit, and a front-matter-only edit — and asserts what the tool derives
 * from them. Asserting against this repository's own history would make the test fail the first time
 * anyone edits a post.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analysePage,
  commitsFor,
  formatHistoryEntry,
  formatVersion,
  mergeHistory,
  parseHistory,
  quoteTomlString,
  replaceHistory,
  sameInstant,
  scanLines,
  splitFrontMatter
} from '../../tools/post-history.mjs';

const FRONT_MATTER = [
  "+++",
  "title = 'A post'",
  "date = '2026-10-06T20:12:00+01:00'",
  "+++",
  '',
  'The body.',
  ''
].join('\n');

test('scanLines keeps offsets and hides the carriage return of a CRLF file', () => {
  const lines = scanLines('one\r\ntwo\r\n');
  assert.deepEqual(
    lines.map((line) => ({ text: line.text, start: line.start, end: line.end, eolEnd: line.eolEnd })),
    [
      { text: 'one', start: 0, end: 3, eolEnd: 5 },
      { text: 'two', start: 5, end: 8, eolEnd: 10 }
    ]
  );
});

test('splitFrontMatter separates TOML front matter from the body, and refuses anything else', () => {
  const found = splitFrontMatter(FRONT_MATTER);
  assert.equal(found.frontMatter, "title = 'A post'\ndate = '2026-10-06T20:12:00+01:00'\n");
  assert.equal(found.body, '\nThe body.\n');
  assert.equal(found.eol, '\n');

  const crlf = splitFrontMatter('+++\r\ntitle = "x"\r\n+++\r\nbody');
  assert.equal(crlf.eol, '\r\n');
  assert.equal(crlf.frontMatter, 'title = "x"\r\n');
  assert.equal(crlf.body, 'body');

  assert.equal(splitFrontMatter('---\ntitle: x\n---\n'), null, 'YAML is not guessed at');
  assert.equal(splitFrontMatter('just prose'), null);
});

test('parseHistory reads the entries, their byte range, and the opt-out', () => {
  const frontMatter = [
    "title = 'A post'",
    '',
    '# Version history, seeded from this file’s git commits.',
    '[[history]]',
    "version = '1.0'",
    'date = 2026-10-08T09:32:14+01:00',
    "author = 'Andrew Davidson'",
    "note = 'First published'",
    '',
    '[[history]]',
    "version = '1.1'",
    'date = 2026-10-08T09:46:53+01:00',
    "author = 'Andrew Davidson'",
    "note = 'Added the old-school ipconfig example'",
    ''
  ].join('\n');

  const parsed = parseHistory(frontMatter);
  assert.equal(parsed.entries.length, 2);
  assert.deepEqual(parsed.entries[0], {
    version: '1.0',
    date: '2026-10-08T09:32:14+01:00',
    author: 'Andrew Davidson',
    note: 'First published'
  });
  assert.equal(parsed.entries[1].note, 'Added the old-school ipconfig example');
  assert.equal(parsed.hasComment, false, 'a hand-written comment above the block is not ours to move');
  assert.equal(frontMatter.slice(parsed.regionStart, parsed.regionEnd).startsWith('[[history]]'), true);
  assert.equal(frontMatter.slice(parsed.regionStart, parsed.regionEnd).endsWith("note = 'Added the old-school ipconfig example'"), true);

  assert.equal(parseHistory('history = false\n').optedOut, true);
  assert.equal(parseHistory('[[history]]\n').optedOut, false, 'the table itself is not the opt-out');
});

test('replaceHistory appends a labelled block, replaces one in place, and is idempotent', () => {
  const entry = { version: '1.0', date: '2026-10-08T09:32:14+01:00', author: 'Andrew Davidson', note: 'First published' };

  const withBlock = replaceHistory("title = 'A post'\ndate = '2026-10-06T20:12:00+01:00'\n", [entry]);
  assert.equal(withBlock, [
    "title = 'A post'",
    "date = '2026-10-06T20:12:00+01:00'",
    '',
    "# Version history, seeded from this file's git commits — tools/post-history.mjs (npm run history). Edit the notes and labels freely; a re-run keeps them.",
    '[[history]]',
    "version = '1.0'",
    'date = 2026-10-08T09:32:14+01:00',
    "author = 'Andrew Davidson'",
    "note = 'First published'",
    ''
  ].join('\n'));

  /* Re-running over its own output changes nothing: no second comment, no blank line drift. */
  assert.equal(replaceHistory(withBlock, [entry]), withBlock);

  /* A hand-written comment stays put, and is not joined by ours. */
  const handWritten = replaceHistory(
    "title = 'A post'\n\n# Notes are mine\n[[history]]\nversion = '9.9'\ndate = 2026-10-08T09:32:14+01:00\n",
    [entry]
  );
  assert.equal(handWritten, "title = 'A post'\n\n# Notes are mine\n[[history]]\nversion = '1.0'\ndate = 2026-10-08T09:32:14+01:00\nauthor = 'Andrew Davidson'\nnote = 'First published'\n");

  /* Removal takes our marker with it, and leaves the rest of the front matter alone. */
  const removed = replaceHistory(withBlock, []);
  assert.ok(!removed.includes('[[history]]'), 'the block is gone');
  assert.ok(!removed.includes('Version history'), 'and so is the label this tool wrote above it');
  assert.ok(removed.startsWith("title = 'A post'\n") && removed.endsWith('\n'), 'the rest of the front matter is untouched');

  /* CRLF files keep CRLF, including the blank line the block is introduced with. */
  const crlf = replaceHistory('title = "x"\r\n', [entry], '\r\n');
  assert.ok(crlf.includes('\r\n\r\n# Version history'), 'the block is introduced by a CRLF blank line');
  assert.ok(!/[^\r]\n/.test(crlf), 'no bare LF was introduced');
});

test('quoting round-trips a commit subject that contains an apostrophe', () => {
  assert.equal(quoteTomlString('First published'), "'First published'");
  assert.equal(quoteTomlString("Don't panic"), '"Don\'t panic"');
  assert.equal(quoteTomlString('  Collapsed   whitespace  '), "'Collapsed whitespace'");
  assert.equal(quoteTomlString('a "quoted" note'), `'a "quoted" note'`);
  assert.equal(parseHistory(`x = ${quoteTomlString("Don't panic")}\n`).entries.length, 0);
});

test('formatHistoryEntry writes the shape the template reads', () => {
  assert.deepEqual(
    formatHistoryEntry({ version: '1.1', date: '2026-10-08T09:46:53+01:00', author: 'Andrew Davidson', note: "Don't" }),
    [
      '[[history]]',
      "version = '1.1'",
      'date = 2026-10-08T09:46:53+01:00',
      "author = 'Andrew Davidson'",
      'note = "Don\'t"'
    ]
  );
  assert.equal(formatVersion(0), '1.0');
  assert.equal(formatVersion(11), '1.11');
});

test('mergeHistory keeps a hand-written note, numbers the rest, and reports what it drops', () => {
  const commits = [
    { short: 'aaaaaaa', date: '2026-10-08T09:32:14+01:00', author: 'Andrew Davidson', subject: 'Updates with more draft posts', bodyChanged: true },
    { short: 'bbbbbbb', date: '2026-10-08T09:46:53+01:00', author: 'Andrew Davidson', subject: 'Update to add about old school ways', bodyChanged: true },
    { short: 'ccccccc', date: '2026-10-15T08:19:35+01:00', author: 'Andrew Davidson', subject: 'Updated to include version history data', bodyChanged: false }
  ];
  const existing = [
    { version: '1.0', date: '2026-10-08T09:32:14+01:00', author: 'Andrew Davidson', note: 'First published' }
  ];

  const merged = mergeHistory(existing, commits);
  assert.equal(merged.listed.length, 2, 'a front-matter-only commit is not listed');
  assert.equal(merged.belowMin, false);
  assert.deepEqual(
    merged.entries.map(({ version, note, kept, sha }) => ({ version, note, kept, sha })),
    [
      { version: '1.0', note: 'First published', kept: true, sha: 'aaaaaaa' },
      { version: '1.1', note: 'Update to add about old school ways', kept: false, sha: 'bbbbbbb' }
    ]
  );

  const below = mergeHistory(existing, [commits[0]]);
  assert.equal(below.belowMin, true);
  assert.deepEqual(below.entries, []);
  assert.deepEqual(below.dropped, existing, 'nothing is dropped when nothing is written');

  const orphan = mergeHistory([{ version: '1.0', date: '2020-01-01T00:00:00Z', note: 'Hand-added' }], commits);
  assert.equal(orphan.dropped.length, 1);
  assert.equal(orphan.entries[0].version, '1.0', 'the orphan did not consume the first slot');

  assert.equal(sameInstant('2026-10-08T09:32:14+01:00', '2026-10-08T08:32:14Z'), true);
  assert.equal(sameInstant('2026-10-08T09:32:14+01:00', '2026-10-08T09:32:15+01:00'), false);
});

test('commitsFor reads paths through a rename and ignores front-matter-only commits', () => {
  /* The shape `git log --name-status --format=…` actually emits — newest commit first, as git
     prints it — with a rename in the middle. */
  const log = [
    '\x1eccc\x1f2026-10-07T10:00:00+01:00\x1fAndrew Davidson\x1fRename and add history',
    'R100\tcontent/posts/old-name/index.md\tcontent/posts/new-name/index.md',
    '\x1ebbb\x1f2026-10-06T10:00:00+01:00\x1fAndrew Davidson\x1fEdit the body',
    'M\tcontent/posts/old-name/index.md',
    '\x1eaaa\x1f2026-10-05T10:00:00+01:00\x1fAndrew Davidson\x1fFirst commit',
    'A\tcontent/posts/old-name/index.md',
    ''
  ].join('\n');

  const bodies = {
    'aaa:content/posts/old-name/index.md': "+++\ntitle = 'x'\n+++\n\nThe body.\n",
    'bbb:content/posts/old-name/index.md': "+++\ntitle = 'x'\n+++\n\nThe body, edited.\n",
    'bbb^:content/posts/old-name/index.md': "+++\ntitle = 'x'\n+++\n\nThe body.\n",
    'ccc:content/posts/new-name/index.md': "+++\ntitle = 'x'\n[[history]]\nversion = '1.0'\n+++\n\nThe body, edited.\n",
    'ccc^:content/posts/old-name/index.md': "+++\ntitle = 'x'\n+++\n\nThe body, edited.\n"
  };

  const run = (args) => {
    if (args[0] === 'log') return log;
    const [show, rev, file] = [args[0], args[1].slice(0, args[1].indexOf(':')), args[1].slice(args[1].indexOf(':') + 1)];
    assert.equal(show, 'show');
    const body = bodies[`${rev}:${file}`];
    if (body === undefined) throw new Error(`unknown revision ${rev}:${file}`);
    return body;
  };

  const commits = commitsFor('content/posts/new-name/index.md', run);
  assert.deepEqual(
    commits.map(({ short, path, bodyChanged }) => ({ short, path, bodyChanged })),
    [
      { short: 'aaa', path: 'content/posts/old-name/index.md', bodyChanged: true },
      { short: 'bbb', path: 'content/posts/old-name/index.md', bodyChanged: true },
      { short: 'ccc', path: 'content/posts/new-name/index.md', bodyChanged: false }
    ],
    'oldest first, the path each commit knew the file by, and the front-matter-only edit excluded'
  );
});

test('against a throwaway repository: three commits, one of which only seeds the history', () => {
  const repo = mkdtempSync(join(tmpdir(), 'post-history-'));
  const git = (args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const config = ['-c', 'user.name=Andrew Davidson', '-c', 'user.email=andrew@example.com', '-c', 'commit.gpgsign=false'];

  try {
    git(['init', '-q', '-b', 'main']);
    mkdirSync(join(repo, 'content', 'posts', 'example'), { recursive: true });
    const page = join(repo, 'content', 'posts', 'example', 'index.md');

    const commit = (message, body) => {
      writeFileSync(page, `+++\ntitle = 'Example'\ndate = '2026-10-05T10:00:00+01:00'\n+++\n\n${body}\n`);
      git(['add', '.']);
      git([...config, 'commit', '-q', '-m', message]);
    };

    commit('First publish', 'The body.');
    commit('Add the second example', 'The body, with a second example.');
    /* The commit that adds the history table is not itself an entry — as with the hand-written one. */
    writeFileSync(
      page,
      `+++\ntitle = 'Example'\ndate = '2026-10-05T10:00:00+01:00'\n[[history]]\nversion = '1.0'\ndate = 2026-10-05T10:00:00+01:00\nnote = 'Mine, edited by hand'\n+++\n\nThe body, with a second example.\n`
    );
    git(['add', '.']);
    git([...config, 'commit', '-q', '-m', 'Seed the version history']);

    /* A real runner over the throwaway repo — the same interface the tool uses in production. */
    const run = (args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

    const result = analysePage(page, { run });

    assert.equal(result.commits.length, 3);
    assert.equal(result.listed.length, 2, 'the history-seeding commit changed no words');
    assert.equal(result.entries.length, 2);
    assert.equal(result.entries[0].kept, false, 'three commits, but the first entry is not in the front matter');
    assert.equal(result.entries[0].note, 'First publish');
    assert.equal(result.entries[1].note, 'Add the second example');
    assert.equal(result.changed, true, 'the block the seeding commit wrote is replaced by one built from both commits');
    assert.ok(result.updated.startsWith('+++'), 'the whole file is returned, front matter first');

    /* Kept notes are the point: give the two entries hand-written labels and notes, dated like the
       commits they belong to, and they survive — the dates have to be the commits' own, which is how
       an entry is matched at all, so they are read back out of the repository rather than invented. */
    const [firstDate, secondDate] = git(['log', '--reverse', '--format=%aI']).trim().split('\n');
    writeFileSync(
      page,
      `+++\ntitle = 'Example'\ndate = '2026-10-05T10:00:00+01:00'\n[[history]]\nversion = '2.0'\ndate = ${firstDate}\nauthor = 'Andrew Davidson'\nnote = 'Mine, edited by hand'\n\n[[history]]\nversion = '2.1'\ndate = ${secondDate}\nauthor = 'Andrew Davidson'\nnote = 'Also mine'\n+++\n\nThe body, with a second example.\n`
    );
    const kept = analysePage(page, { run });
    assert.deepEqual(
      kept.entries.map(({ version, note, kept: keptEntry }) => ({ version, note, kept: keptEntry })),
      [
        { version: '2.0', note: 'Mine, edited by hand', kept: true },
        { version: '2.1', note: 'Also mine', kept: true }
      ]
    );
    assert.equal(kept.changed, false, 'a second run over hand-written entries is a no-op');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
