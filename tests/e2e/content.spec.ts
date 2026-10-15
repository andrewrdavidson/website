import { expect, test } from '@playwright/test';
import { expectHealthy, watchPage } from './helpers';
import { PAGES } from './pages';

/**
 * Every surface the site has, checked for the same handful of guarantees. These are the
 * cross-cutting rules rather than one page's behaviour: the ones that were each got wrong at
 * least once, on a page nobody thought to look at.
 *
 * The page list is shared with accessibility.spec.ts, so a page cannot be added to the site and
 * checked by one pass but not the other. The heading rules are also covered statically and
 * exhaustively by `npm run check:html`; here they are checked in a real browser alongside the
 * policy and console, because that is the only way to see what the browser actually refused to
 * do.
 */

for (const [name, path, status = 200] of PAGES) {
  test(`${name} (${path}) renders cleanly`, async ({ page }) => {
    const health = await watchPage(page);

    const response = await page.goto(path);
    expect(response?.status(), `${path} status`).toBe(status);
    await page.waitForLoadState('load');

    // The policy that holds all of this together has to be on every page, before anything loads.
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
    await expect(page.locator('meta[name="referrer"]')).toHaveCount(1);

    // One title per page, and the language the site claims to be written in.
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');

    await expectHealthy(health, page, name);
  });
}
