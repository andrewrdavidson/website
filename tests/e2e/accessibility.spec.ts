import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { PAGES } from './pages';

/**
 * An axe-core pass over every page, in a real browser.
 *
 * This is here because the site's accessibility has been maintained by hand — the dark palette was
 * re-tuned against measured contrast ratios, the disclosures are native `<details>` so they need no
 * script, and the icons are `aria-hidden` SVGs beside real text. None of that was *checked* by
 * anything on a push: it was checked once, in the browser, by whoever changed it. axe catches the
 * half of accessibility that is mechanical — names, roles, landmarks, contrast, form labelling —
 * so the by-hand work can stay on the half that is not.
 *
 * Scoped to WCAG 2.0/2.1 A and AA: those are the levels the site claims. `best-practice` rules are
 * deliberately excluded — they are opinions (landmark structure, tabindex choices) and are worth
 * reviewing rather than failing a build over.
 *
 * Two things are switched off, both third-party and neither ours to fix:
 *
 *   - anything inside the giscus iframe (its own document, its own accessibility, cross-origin);
 *   - `color-contrast` on the Pagefind search UI, whose stylesheet comes from the Pagefind bundle
 *     and renders its own grey-on-white result text. The rest of the page is still scanned.
 */
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const scan = async (page: import('@playwright/test').Page, path: string, name: string) => {
  await page.goto(path);
  await page.waitForLoadState('load');

  const results = await new AxeBuilder({ page })
    .withTags(AXE_TAGS)
    .exclude('iframe[src*="giscus"]')
    .analyze();

  const summary = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => node.target.join(' ')).slice(0, 3)
  }));

  expect(summary, `${name}: axe violations`).toEqual([]);
};

for (const [name, path] of PAGES) {
  test(`${name} (${path}) has no accessibility violations`, async ({ page }) => {
    await scan(page, path, name);
  });
}

/* Dark mode is a separate palette with separate contrast ratios — the code line numbers were 2.5:1
   in light and 3.4:1 in dark, and one overshoots the other — so the two pages with the most
   colours on them are scanned in both. This is where the body font stack and the token ramp are
   most likely to be got wrong in one mode only. */
test.describe('dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  });

  for (const [name, path] of [PAGES[0], PAGES[9]]) {
    test(`${name} (${path}) has no accessibility violations in dark mode`, async ({ page }) => {
      await scan(page, path, `${name} (dark)`);
    });
  }
});
