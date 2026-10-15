import { devices, expect, test } from '@playwright/test';

/**
 * The behaviour that lives in markup and CSS rather than in a build: disclosures, the theme
 * toggle, hover states, and where a click actually goes. Each of these has been broken on this
 * site by a change that looked harmless and that a build could not catch — a duplicate `class`
 * attribute dropped by the browser, a hover that could only fire over part of a card, a chip
 * handler left over from a layout that no longer nested it, and a disclosure driven by a script
 * the Content-Security-Policy then refused to run.
 *
 * Two of them are deliberately run with JavaScript disabled, because "no JavaScript" is the
 * claim: a `<details>` element that only opens because something listened for a click is not
 * the fix it looks like.
 */

const SERIES_PAGE = '/series/building-a-developer-virtual-machine-using-hyper-v-and-powershell/';
const CALLOUT_PAGE = '/series/building-a-developer-virtual-machine-using-hyper-v-and-powershell/part2/';

test.describe('disclosures, with JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });

  test('the homepage series list opens on its summary alone', async ({ page }) => {
    await page.goto('/');

    const disclosure = page.locator('details.series-disclosure').first();
    await expect(disclosure).not.toHaveAttribute('open', '');

    const summary = disclosure.locator('summary');
    await expect(summary).toHaveText(/Contains \d+ posts?/);
    // The marker is stripped in CSS; the summary is still the control.
    await expect(summary).toHaveCSS('cursor', 'pointer');
    const chevron = disclosure.locator('.series-chevron');
    const closed = await chevron.evaluate((el) => getComputedStyle(el).transform);

    await summary.click();
    await expect(disclosure).toHaveAttribute('open', '');

    const opened = await chevron.evaluate((el) => getComputedStyle(el).transform);
    expect(opened, 'the chevron should turn when the list opens').not.toBe(closed);

    // The parts are real links to real post URLs, not something a script has to build.
    const firstPart = disclosure.locator('.series-parts a').first();
    await expect(firstPart).toBeVisible();
    await expect(firstPart).toHaveAttribute('href', /\/series\/.+\/part\d+\/$/);

    // The series name is still a link to its series page, and — this is the point — it is NOT
    // inside the summary, so opening the list cannot navigate away from the homepage. The first
    // card is whatever series has the newest post, so the href is matched by shape, not by slug;
    // the series page itself is covered in content.spec.ts.
    const title = page.locator('h3 a[href*="/series/"]').first();
    await expect(title).toHaveAttribute('href', /\/series\/[a-z0-9-]+\/$/);
    expect(await page.locator('summary h3').count(), 'a heading inside the summary would make the title part of the toggle').toBe(0);
    await expect(page.locator('h1')).toHaveCount(1);

    // And the card for the series the suite knows about is on the page, with a link to its own
    // page rather than to a post.
    await expect(page.locator(`h3 a[href="${new URL(SERIES_PAGE, page.url()).href}"]`)).toHaveCount(1);
  });

  test('the category index expands to its posts', async ({ page }) => {
    await page.goto('/categories/');

    const group = page.locator('.category-group').first();
    const summary = group.locator('summary');
    await expect(group.locator('details')).not.toHaveAttribute('open', '');

    await summary.click();
    await expect(group.locator('details')).toHaveAttribute('open', '');

    // Every post in the group is a link, where it used to be a div whose click was handled by a
    // script the CSP blocks.
    const links = group.locator('a[href^="/posts/"]');
    expect(await links.count()).toBeGreaterThan(0);
    await expect(links.first()).toBeVisible();
    await expect(links.first()).toHaveAttribute('href', /^\/posts\/.+\/$/);

    // The category name is a heading, so the page reads h1 → category → post.
    await expect(group.locator('summary h2')).toHaveCount(1);
    await expect(group.locator('h3').first()).toBeVisible();
  });
});

test('the theme toggle switches the page and remembers it', async ({ page }) => {
  await page.goto('/');
  const root = page.locator('html');
  const toggle = page.locator('#theme-toggle');

  await toggle.click();
  const afterToggle = await root.getAttribute('class');
  expect(afterToggle, 'the toggle should set the dark class').toContain('dark');
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');

  // The class is applied before the stylesheets, so a reload shows no flash of the wrong mode.
  await page.reload();
  await expect(root).toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');

  await toggle.click();
  await expect(root).not.toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('light');
});

test('no CJK face is fetched, linked or named in the font stack', async ({ page }) => {
  /* The CJK stack was removed on 2026-10-15 (see docs/BlogIssues-Fixes.md): the stylesheet was
     the largest asset on every page — 205 KB, plus a slice of the font itself — on a site with no
     CJK content. This is the regression guard, and it checks the three ways it could come back:
     someone re-links the sheet, someone re-adds a CJK family to `--font-bilingual`, or the theme's
     own default (which still names Noto Serif SC) wins the cascade again. */
  const cjkRequests: string[] = [];
  page.on('request', (request) => {
    if (/noto-serif-sc|noto_serif|source-han|songti/i.test(request.url())) cjkRequests.push(request.url());
  });

  await page.goto('/');
  await page.waitForLoadState('load');

  await expect(page.locator('link[data-defer-stylesheet]')).toHaveCount(0);
  await expect(page.locator('link[href*="noto-serif-sc"]')).toHaveCount(0);
  expect(cjkRequests, 'no CJK font or stylesheet should be fetched').toEqual([]);

  // assets/css/site.css re-declares the variable so the theme's CJK families cannot be reached
  // even by a browser that has the family installed locally.
  const stack = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(stack, 'the body stack should still be the self-hosted serif').toMatch(/Source Serif 4/i);
  expect(stack, 'no CJK family should be named in the body font stack').not.toMatch(/Noto|Source Han|Songti|STSong/i);
});

test('a post card looks the same on every list surface, in both colour modes', async ({ page }) => {
  /* The card has drifted apart twice: the /posts/ cards had rounded borders and a grey dark-mode
     hairline while the homepage's did not (#32, #33). The markup now comes from one partial, so
     this reads the computed style of the first card on each surface — in light and dark — and
     requires the three to agree. Computed styles rather than pixel snapshots on purpose: they are
     the same on every platform, and they name the token that went wrong. */
  const surfaces = ['/', '/posts/', '/categories/articles/'];

  const readCard = () =>
    page
      .locator('.group > div')
      .first()
      .evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          border: style.borderTopColor,
          radius: style.borderTopLeftRadius,
          background: style.backgroundColor
        };
      });

  const light: Record<string, Awaited<ReturnType<typeof readCard>>> = {};
  for (const surface of surfaces) {
    await page.goto(surface);
    light[surface] = await readCard();
  }

  const reference = light[surfaces[0]];
  for (const surface of surfaces.slice(1)) {
    expect(light[surface], `${surface} card should match the homepage card`).toEqual(reference);
  }

  const dark: Record<string, Awaited<ReturnType<typeof readCard>>> = {};
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  for (const surface of surfaces) {
    await page.goto(surface);
    dark[surface] = await readCard();
  }

  const darkReference = dark[surfaces[0]];
  for (const surface of surfaces.slice(1)) {
    expect(dark[surface], `${surface} card should match the homepage card in dark mode`).toEqual(darkReference);
  }

  // And the dark tokens really are different, or the comparison above proves nothing.
  expect(darkReference.border, 'the card hairline should use a dark-mode token').not.toBe(reference.border);
  expect(darkReference.background, 'the card surface should use a dark-mode token').not.toBe(reference.background);
});

test('a post card links to the post and lifts its border on hover', async ({ page }) => {
  await page.goto('/posts/');

  const cover = page.locator('a[aria-label="Using winget on Windows"]').first();
  await expect(cover).toHaveAttribute('href', /\/posts\/using-winget\/$/);

  const card = page.locator('.group').filter({ has: cover }).first().locator('div').first();
  const before = await card.evaluate((el) => getComputedStyle(el).borderTopColor);
  await page.locator('.group').filter({ has: cover }).first().hover();
  const after = await card.evaluate((el) => getComputedStyle(el).borderTopColor);
  expect(after, 'hovering the card should change its border colour').not.toBe(before);

  await cover.click();
  await expect(page).toHaveURL(/\/posts\/using-winget\/$/);
});

test('a tag chip navigates to the tag, not to the post behind it', async ({ page }) => {
  await page.goto('/posts/');

  const chip = page.locator('a.tag-chip[href^="/tags/"]').first();
  const href = await chip.getAttribute('href');
  await chip.click();

  // The chip sits above the card's full-cover link; before the handler was removed for the CSP
  // this could land on the post instead.
  await expect(page).toHaveURL(new RegExp(`${href}/?$`));
  await expect(page.locator('h1')).toHaveCount(1);
});

test('search returns results from the built index', async ({ page }) => {
  await page.goto('/search/');

  await expect(page.locator('#search-unavailable')).toBeHidden();
  const input = page.locator('.pagefind-ui__search-input');
  await input.fill('winget');

  const results = page.locator('.pagefind-ui__result');
  await expect(results.first()).toBeVisible({ timeout: 15_000 });
  expect(await results.count()).toBeGreaterThan(0);
  await expect(page.locator('.pagefind-ui__result-title').first()).toContainText(/winget/i);
});

test('callout icons are inline SVG, the size the stylesheet asks for', async ({ page }) => {
  await page.goto(CALLOUT_PAGE);

  const icons = page.locator('.callout-icon svg.callout-icon-svg');
  expect(await icons.count(), 'the callout page has icons to check').toBeGreaterThan(0);

  const box = await icons.first().boundingBox();
  expect(box?.width, 'icon width').toBeCloseTo(36, 0);
  expect(box?.height, 'icon height').toBeCloseTo(36, 0);

  // Colour comes from the callout palette through currentColor, which is the whole reason these
  // are inlined rather than in an <img>: an image cannot inherit a colour.
  const fill = await icons.first().evaluate((el) => getComputedStyle(el).fill);
  expect(fill).not.toBe('rgb(0, 0, 0)');
  await expect(icons.first().locator('path')).toHaveCount(1);
});

test('the mobile menu opens and closes without leaving the page', async ({ browser }) => {
  // The theme's menu module is the one piece of interactivity that is genuinely script-driven, so
  // it is worth a pass at the width where the button exists.
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  await page.goto('/');

  const toggle = page.locator('#menu-toggle');
  await toggle.click();
  await expect(page.locator('header')).toHaveClass(/menu-open/);
  await toggle.click();
  await expect(page.locator('header')).not.toHaveClass(/menu-open/);

  await context.close();
});

test.describe('the content width', () => {
  /* 84rem for the page column and 69rem for the prose — 1.5x the theme's 56rem/46rem, asked for
     on 2026-10-15 and set in assets/css/site.css by overriding Tailwind's container tokens plus
     `.article-inner`.

     Measured at a viewport wide enough to reach the cap rather than read from the token alone:
     at 1600px the column is not viewport-limited, so a template that asks for a different
     container still fails here. The header and the footer are checked against `main` in the same
     pass because the reason the column is pinned at all is alignment (#30) — widening the page
     and leaving the header behind is the regression this exists to catch. */
  test.use({ viewport: { width: 1600, height: 1000 } });

  test('the column is 84rem, the prose 69rem, and the chrome aligns with it', async ({ page }) => {
    const measure = () =>
      page.evaluate(() => {
        const box = (selector: string) => {
          const el = document.querySelector(selector);
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return { width: Math.round(rect.width), maxWidth: getComputedStyle(el).maxWidth };
        };
        return {
          main: box('main.site-main'),
          header: box('header > div'),
          footer: box('footer'),
          card: box('article'),
          prose: box('.article-inner.article-prose')
        };
      });

    await page.goto('/');
    const home = await measure();
    expect(home.main?.maxWidth, 'page column cap').toBe('1344px');   // 84rem
    expect(home.main?.width, 'page column at 1600px').toBe(1344);
    expect(home.header?.width, 'header aligns with the column').toBe(home.main?.width);
    expect(home.footer?.width, 'footer aligns with the column').toBe(home.main?.width);

    await page.goto('/posts/using-winget/');
    const post = await measure();
    expect(post.card?.maxWidth, 'article card cap').toBe('1344px');
    expect(post.prose?.maxWidth, 'prose measure cap').toBe('1104px'); // 69rem
    expect(post.prose?.width, 'prose at 1600px').toBe(1104);
  });
});
