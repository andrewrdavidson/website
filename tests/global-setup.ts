import { request } from '@playwright/test';

/**
 * Fails before any test runs if `public/` was not built the way the suite expects, so a stale or
 * production-flavoured build reports "run npm run test:prepare" instead of a screenful of
 * confusing assertion failures.
 *
 * The three markers are the ones that actually change the results: the series disclosure and the
 * callout page need draft content (drafts are excluded from a plain build), and the search test
 * needs the Pagefind index, which only exists after `npm run search`.
 */
const PORT = Number(process.env.TEST_PORT || 8081);
const baseURL = `http://localhost:${PORT}/`;

export default async function globalSetup() {
  const api = await request.newContext({ baseURL });
  const problems: string[] = [];

  const home = await api.get('/');
  if (!home.ok()) problems.push(`GET / returned ${home.status()}`);
  else if (!(await home.text()).includes('series-disclosure')) {
    problems.push('the homepage has no series disclosure — the build looks like a published-only build');
  }

  const index = await api.get('/pagefind/pagefind-ui.js');
  if (!index.ok()) problems.push(`GET /pagefind/pagefind-ui.js returned ${index.status()} — the search index is missing`);

  const callouts = await api.get('/series/building-a-developer-virtual-machine-using-hyper-v-and-powershell/part2/');
  if (!callouts.ok()) {
    problems.push(`GET the callout test page returned ${callouts.status()} — draft content is missing`);
  }

  await api.dispose();

  if (problems.length) {
    throw new Error(
      `The site in public/ is not the build these tests need:\n  - ${problems.join('\n  - ')}\n\n` +
        'Run:  npm run test:prepare\n'
    );
  }
}
