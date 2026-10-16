import { devices, expect, test, type Page } from '@playwright/test';

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
      .locator('.post-card > div')
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

test('the card date sits at the top right of the card, above the READ POST button', async ({ page }) => {
  /* Asked for on 2026-10-15: the date had been floated left under the title since #14, which read
     as the first line of the description once the cards grew to 1.5x — a stray line of text on the
     left of a wide card. It is the card's top-right cell now, so this pins the three things that
     make it that: on the right, its right edge on the card's padding edge, and above the READ POST
     button. Checked on every surface that renders a card, because all three share the partial and
     that is exactly why a position can drift on one of them without anyone noticing — and at both
     project widths, since a narrow card is where "top right" is most likely to fall apart. */
  for (const surface of ['/', '/posts/', '/categories/articles/']) {
    await page.goto(surface);

    const geometry = await page.locator('.post-card').first().evaluate((card) => {
      const body = card.querySelector(':scope > div')!;
      const rect = (el: Element) => el.getBoundingClientRect();
      const bodyRect = rect(body);
      const date = card.querySelector('.card-date');
      const button = card.querySelector('.btn-read-more');
      const summary = card.querySelector('p');
      const style = getComputedStyle(body);
      return {
        // The card's content edge: its border box less the 1px hairline and the p-6 padding. The
        // date's right edge is asserted against this rather than against the padding alone, which
        // is 1px short of it and made this read as a 1px misalignment when it was right.
        contentRight: bodyRect.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight),
        body: { left: bodyRect.left, right: bodyRect.right, width: bodyRect.width },
        date: date && { right: rect(date).right, bottom: rect(date).bottom },
        button: button && { top: rect(button).top },
        summary: summary && { top: rect(summary).top },
        label: date?.textContent?.trim().replace(/\s+/g, ' ')
      };
    });

    expect(geometry.date, `${surface}: the card has a date`).toBeTruthy();
    expect(geometry.button, `${surface}: the card has a READ POST button`).toBeTruthy();
    expect(geometry.summary, `${surface}: the card has a description`).toBeTruthy();
    // The cell also holds the "New" badge (#28), which is in the DOM whether or not it is shown.
    expect(geometry.label, `${surface}: the date is the post's date`).toMatch(/^\w{3} \d{2} \d{4}( New)?$/);

    const date = geometry.date!;
    expect(
      date.bottom,
      `${surface}: the date should be in the card's top block, above the description`
    ).toBeLessThanOrEqual(geometry.summary!.top + 1);
    expect(
      Math.abs(date.right - geometry.contentRight),
      `${surface}: the date should sit on the card's right content edge`
    ).toBeLessThanOrEqual(1);
    expect(
      date.bottom,
      `${surface}: the date should be above the READ POST button`
    ).toBeLessThanOrEqual(geometry.button!.top + 1);
  }
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

test.describe('the share button’s copied flash', () => {
  /* Asked for on 2026-10-15. The article header's share button copies the link and flashes a
     "Copied!" pill for 1.6s; that pill was still the theme's mint/emerald pair — `#047857` on a
     10% `#10b981` tint, `#86efac` on 16% `#16a34a` in dark — after the accent ramp went olive,
     because the colour is a literal in the theme's own stylesheet (main.css
     `.share-trigger.is-success`) rather than a token the ramp moves. The green sweep of #9/#10
     recorded it as a known leftover and left it; this is it being closed.

     The assertion compares the flash against a probe element painted from `--accent-strong` and
     `--accent-soft` rather than against two hard-coded rgb triples, so it keeps passing when the
     ramp is re-tuned and fails only if the flash stops using the tokens. Both modes are checked:
     the theme's dark rule is `.dark .share-trigger.is-success` (0,3,0), one specificity step above
     the light one, which is exactly the kind of override that silently keeps the old colour in one
     mode — the fault `#9/#10` hit twice. */
  test.use({ permissions: ['clipboard-write'] });

  const POST = '/posts/using-winget/';

  const flash = (page: Page) => {
    const button = page.locator('.share-trigger');
    return button.evaluate(async (el) => {
      (el as HTMLElement).click();
      // Wait out the button's 150ms `transition-colors` — read mid-transition, the colour is an
      // interpolated one and a computed value can land a unit away from the token.
      await new Promise((resolve) => setTimeout(resolve, 500));
      const style = getComputedStyle(el);

      // A probe painted from the ramp's own tokens, inside the same `.dark` scope as the button.
      const probe = document.createElement('span');
      probe.style.color = 'var(--accent-strong)';
      probe.style.backgroundColor = 'var(--accent-soft)';
      (el.parentElement as HTMLElement).appendChild(probe);
      const probeStyle = getComputedStyle(probe);

      const read = {
        success: el.classList.contains('is-success'),
        error: el.classList.contains('is-error'),
        label: (el.textContent || '').replace(/\s+/g, ' ').trim(),
        color: style.color,
        background: style.backgroundColor,
        tokenColor: probeStyle.color,
        tokenBackground: probeStyle.backgroundColor
      };
      probe.remove();
      return read;
    });
  };

  test('paints the accent pill, not the theme’s mint, in both colour modes', async ({ page }) => {
    const modes: Record<string, Awaited<ReturnType<typeof flash>>> = {};

    await page.goto(POST);
    modes.light = await flash(page);

    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
    await page.goto(POST);
    modes.dark = await flash(page);

    // The theme's mint/emerald literals this replaced: the light text and the dark text/fill.
    const MINT = ['rgb(4, 120, 87)', 'rgb(134, 239, 172)', 'rgba(22, 163, 74, 0.16)'];

    for (const [mode, state] of Object.entries(modes)) {
      expect(state.error, `${mode}: the copy should have succeeded`).toBe(false);
      expect(state.success, `${mode}: the flash should be the success state`).toBe(true);
      expect(state.label, `${mode}: the flash should say it copied`).toMatch(/copied/i);
      expect(state.color, `${mode}: the flash text should be the accent text token`).toBe(state.tokenColor);
      expect(state.background, `${mode}: the flash fill should be the accent fill token`).toBe(state.tokenBackground);
      expect(MINT, `${mode}: the flash should carry none of the theme's mint`).not.toContain(state.color);
      expect(MINT, `${mode}: the flash fill should carry none of the theme's mint`).not.toContain(state.background);
    }

    // And the two modes really are different, or checking both proves nothing.
    expect(modes.dark.color, 'the dark flash should use the dark token').not.toBe(modes.light.color);
  });
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

test.describe('the content width', () => {  /* 84rem for the page column — 1.5x the theme's 56rem, asked for on 2026-10-15 and set in
     assets/css/site.css by overriding Tailwind's container tokens — with the article's text
     filling its card rather than being centred in a narrower measure inside it.

     Measured at a viewport wide enough to reach the cap rather than read from the token alone:
     at 1600px the column is not viewport-limited, so a template that asks for a different
     container still fails here. The header and the footer are checked against `main` in the same
     pass because the reason the column is pinned at all is alignment (#30) — widening the page
     and leaving the header behind is the regression this exists to catch.

     The article half pins the second half of the same request: a post's text fills its card
     rather than sitting 112px inside it while its title sits 25px from the top, so the text's
     left inset is asserted against the title's top inset. That comparison is the actual
     complaint, and it is the one a `max-width` put back on `.article-inner` would break. */
  test.use({ viewport: { width: 1600, height: 1000 } });

  test('the column is 84rem, the chrome aligns with it, and a post\'s text fills its card', async ({ page }) => {
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
    const post = await page.evaluate(() => {
      const rect = (el: Element) => el.getBoundingClientRect();
      const card = document.querySelector('article')!;
      const prose = document.querySelector('.article-inner.article-prose')!;
      const title = card.querySelector('h1')!;
      const paragraph = prose.querySelector('p')!;
      return {
        cardLeft: Math.round(rect(card).left),
        cardMaxWidth: getComputedStyle(card).maxWidth,
        proseMaxWidth: getComputedStyle(prose).maxWidth,
        textLeft: Math.round(rect(paragraph).left),
        titleLeft: Math.round(rect(title).left),
        titleTopInset: Math.round(rect(title).top - rect(card).top)
      };
    });
    expect(post.cardMaxWidth, 'article card cap').toBe('1344px');
    expect(post.proseMaxWidth, 'the text fills its card').toBe('none');
    expect(post.textLeft, 'text and title share a left edge').toBe(post.titleLeft);
    expect(
      Math.abs(post.textLeft - post.cardLeft - post.titleTopInset),
      `left inset (${post.textLeft - post.cardLeft}px) against the title's top inset (${post.titleTopInset}px)`
    ).toBeLessThanOrEqual(16);
  });
});
test.describe('the post header’s meta row', () => {
  /* Asked for on 2026-10-16: "The items under the title: Post, Last update, Author, Read time and
     not aligned horizontally - fix".

     Four facts sat at three different offsets on one line. The date was a bare text node beside a
     bare icon, so the row's own `gap-4` (1rem) landed *between an icon and its own text* while
     every other icon sat 4–6px from the text it belonged to. The "Last updated" group carried
     `pb-2`, which made its flex item 0.5rem taller than its neighbours, so `items-center` centred
     its text 4px higher than the rest of the row — the one that reads as "not aligned". And the
     date and author icons were sized and spaced by an inline `style` where the others used classes.

     The row is now one `inline-flex items-center gap-1.5` group per fact (`.article-meta`), so the
     0.375rem inside a group is uniform and the 1rem between groups belongs to the row. Measured on
     the built page, before → after: the "Last updated" text centred at 177 with the other three at
     181 → all four at 181; the date icon 20px from its text against 4/6/6px → 6/6/6/6; a 28px-tall
     group among 20px ones → all four 20px.

     Asserted rather than eyeballed, in both projects. The row wraps at 390px, so the centre
     comparison is made per visual line: a wrapped row must not fail for being wrapped. */
  const POST = '/posts/using-winget/';

  const measure = (page: Page) =>
    page.evaluate(() => {
      const row = document.querySelector('.article-meta') as HTMLElement;
      const share = row.querySelector('[data-share-widget]') as HTMLElement;
      const groups = ([...row.children] as HTMLElement[]).filter((el) => el !== share);

      return groups.map((group) => {
        const box = group.getBoundingClientRect();
        const iconEl = group.querySelector('svg') as SVGElement;
        const icon = iconEl.getBoundingClientRect();

        /* The group's first piece of content after its icon: a text node in three of the four, the
           `<time>` element in the date group. Measured with a Range, so both come back as a box
           rather than as a node type the assertions have to branch on.

           The icon is excluded by reference and not by tag name: in an HTML document an SVG
           element's `tagName` is the lowercase `svg`, so a `tagName !== 'SVG'` test matches the
           icon itself — which reports an empty `textContent` and a zero gap, and would have made
           the gap and centre assertions below pass for the wrong reason. */
        const content = [...group.childNodes].find((node) => {
          if (node === iconEl) return false;
          if (node.nodeType === 3) return node.textContent!.trim() !== '';
          return node.nodeType === 1;
        }) as Node;
        const range = document.createRange();
        range.selectNodeContents(content);
        const text = range.getBoundingClientRect();

        return {
          text: (content.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 45),
          height: +box.height.toFixed(2),
          textCentre: +((text.top + text.bottom) / 2).toFixed(2),
          iconHeight: +icon.height.toFixed(2),
          iconCentre: +((icon.top + icon.bottom) / 2).toFixed(2),
          iconGap: +(text.left - icon.right).toFixed(2)
        };
      });
    });

  test('keeps every fact on the same line, centred, with one icon gap', async ({ page }) => {
    await page.goto(POST);
    const groups = await measure(page);

    expect(groups.map((group) => group.text), 'the four facts the row carries').toEqual([
      '6th October 2026 at 7:39pm',
      'Last updated on 15th October 2026 at 3:46pm',
      'By Andrew Davidson',
      '2 min read'
    ]);

    /* Every group is a whole number of line boxes tall, so none of them can be carrying padding
       that lifts its contents off the row's centre line. The line box itself is taken from the
       shortest group rather than hard-coded: at 390px one fact wraps inside its own group (20px →
       40px), which is the wrapper's business, but the 8px `pb-2` this replaced is a height no
       number of line boxes can account for. */
    const line = Math.min(...groups.map((group) => group.height));
    for (const group of groups) {
      expect(
        group.height % line,
        `"${group.text}": ${group.height}px is not a whole number of ${line}px line boxes`
      ).toBe(0);
    }

    // The icon and the text of each fact share a centre: the `pb-2` that lifted the "Last updated"
    // text 4px was invisible to the group's own box, which stayed aligned.
    for (const group of groups) {
      expect(
        Math.abs(group.iconCentre - group.textCentre),
        `"${group.text}": icon centre ${group.iconCentre} against text centre ${group.textCentre}`
      ).toBeLessThanOrEqual(0.51);
      expect(group.iconHeight, `"${group.text}": icon height`).toBe(16);
    }

    // One gap everywhere. It was 20px for the date — the row's 1rem gap landing between an icon and
    // its own text — against 4–6px for the rest.
    const gaps = [...new Set(groups.map((group) => group.iconGap))];
    expect(gaps, `icon-to-text gaps: ${gaps.join(', ')}`).toHaveLength(1);

    // On a narrow viewport the row wraps; the facts on any one line still share a centre line, which
    // is the same guarantee stated for however many lines there are.
    const lines = new Map<number, typeof groups>();
    for (const group of groups) {
      const line = [...lines.keys()].find((centre) => Math.abs(centre - group.textCentre) <= 0.51);
      if (line === undefined) lines.set(group.textCentre, [group]);
      else lines.get(line)!.push(group);
    }
    expect(lines.size, 'the row is at least one line').toBeGreaterThan(0);
    for (const [centre, line] of lines) {
      const centres = line.map((group) => group.textCentre);
      expect(new Set(centres).size, `line at ${centre}: ${centres.join(', ')}`).toBe(1);
    }
  });
});

test('the series index groups each card under the year its series started', async ({ page }) => {
  /* Asked for on 2026-10-16: "the series page http://localhost:1313/series has the year marker on
     it but it's wrong, it should show once for each year showing the series' whose first post
     starts in that year under it, similar to this page http://localhost:1313/posts/".

     The old template emitted one badge per series and filled it from `{{ .Key }}` read off a dict
     that has no `Key`, so every series carried an empty circle. This asserts the real rule — and it
     does so from the parts rather than from the index's own date line: each card is followed to its
     series page, the earliest part's date is read there, and its year has to be the year of the
     heading the card sits under. A test that read the index's own "Published:" text would agree
     with the template even if both were wrong. */
  await page.goto('/series/');

  const groups = await page.evaluate(() =>
    [...document.querySelectorAll('.series-year-group')].map((group) => ({
      year: (group.querySelector('h2 .year-indicator-badge')?.textContent || '').trim(),
      cards: [...group.querySelectorAll('a[href^="/series/"]')].map((card) => ({
        href: card.getAttribute('href') || '',
        title: (card.querySelector('h3')?.textContent || '').trim()
      }))
    }))
  );

  expect(groups.length, 'the index has at least one year group').toBeGreaterThan(0);
  for (const group of groups) {
    expect(group.year, 'every heading is a year, not an empty badge').toMatch(/^\d{4}$/);
    expect(group.cards.length, `the ${group.year} group is not empty`).toBeGreaterThan(0);
  }

  const years = groups.map((group) => group.year);
  expect(new Set(years).size, `one heading per year: ${years.join(', ')}`).toBe(years.length);
  expect(years, 'newest year first, as on /posts/').toEqual([...years].sort().reverse());

  // Every card, checked against the parts on its own series page.
  let seen = 0;
  for (const group of groups) {
    for (const card of group.cards) {
      await page.goto(card.href);
      const parts = await page.evaluate(() =>
        [...document.querySelectorAll('time[datetime]')].map((time) => time.getAttribute('datetime') || '')
      );
      expect(parts.length, `${card.href}: the series page lists its parts`).toBeGreaterThan(0);
      const firstYear = parts.map((date) => date.slice(0, 4)).sort()[0];
      expect(firstYear, `"${card.title}" starts in the year of its heading`).toBe(group.year);
      seen++;
    }
  }

  const total = groups.reduce((count, group) => count + group.cards.length, 0);
  expect(seen, 'every card on the index was checked').toBe(total);
});

test('the about page has no back-to-home link', async ({ page }) => {
  /* Asked for on 2026-10-16: "remove the 'back to home' link from the about page". It was the last
     thing in the article, under the prose. The page resolves to a project-level copy of the theme's
     template (themes/void is a submodule), so the assertion covers the whole page for the link —
     anywhere, not just where it used to be — and then checks that the page's own parts came with
     the copy. */
  await page.goto('/about/');

  expect(await page.locator('a', { hasText: /back to home/i }).count()).toBe(0);
  await expect(page.locator('header a', { hasText: /^Home$/ })).toHaveCount(1);

  await expect(page.locator('h1')).toHaveText('About');
  await expect(page.locator('h2')).toHaveCount(2);
  await expect(page.locator('article > .about-card')).toHaveCount(1);
  await expect(page.locator('main .theme-card')).toHaveCount(1);
});
test('each card on a series page shows that part’s own table of contents', async ({ page }) => {
  /* Asked for on 2026-10-16: "on the series page that shows the articles for that series:
     http://localhost:1313/series/building-vm-labs-with-proxmox-and-terraform/ show the toc for that
     article in each articles card".

     The card list already carried each part's title, date and summary; the outline came next. It is
     built from the part's `.Fragments` rather than from `.TableOfContents`, because Hugo's TOC emits
     bare `#id` fragments and those headings are on another page — the links have to carry the part's
     URL, which is the part of this a regex over generated HTML would get wrong. See
     layouts/partials/toc-tree.html.

     Then, asked for on the same day: "make the table of contents [...] non-interactive - a header
     with a bulleted list of parts". So the outline is checked as static content too — a header, a
     real `<ul>` with markers, every entry visible without touching anything, and no disclosure left
     anywhere in a card.

     Checked against the parts themselves rather than against the markup: for each card, the entries
     must be *exactly* that part's own content headings, in order — so a card listing the wrong part's
     outline, losing its nesting or carrying a stale anchor fails here, and so does a part with no
     headings that grew a TOC anyway. `.article-prose` is what makes "its own content" precise: the
     comment thread's heading is an `<h2>` too, and is deliberately not part of an outline. */
  await page.goto(SERIES_PAGE);

  const cards = await page.evaluate(() =>
    [...document.querySelectorAll('main ol > li')].map((card) => {
      const toc = card.querySelector('.toc-card');
      return {
        href: card.querySelector('a[href^="/series/"]')?.getAttribute('href') || '',
        label: (toc?.querySelector('.toc-card-title')?.textContent || '').trim(),
        entries: [...(toc?.querySelectorAll('a') || [])].map((a) => a.getAttribute('href') || ''),
        texts: [...(toc?.querySelectorAll('a') || [])].map((a) =>
          (a.textContent || '').replace(/\s+/g, ' ').trim()
        ),
        nested: (toc?.querySelectorAll('li > ul') || []).length
      };
    })
  );

  expect(cards.length, 'the series page has cards to check').toBeGreaterThan(0);
  expect(
    cards.filter((card) => card.entries.length > 0).length,
    'at least one part on this series page has an outline'
  ).toBeGreaterThan(0);

  for (const card of cards) {
    await page.goto(card.href);
    const part = await page.evaluate(() => {
      const headings = [
        ...document.querySelectorAll(
          '.article-prose h1, .article-prose h2, .article-prose h3, .article-prose h4, .article-prose h5, .article-prose h6'
        )
      ];
      /* Each heading's text without the copy-link button the render hook puts inside it, so the
         comparison is heading-to-entry and not heading-plus-button-to-entry. */
      const items = headings
        .filter((heading) => heading.id)
        .map((heading) => {
          const clone = heading.cloneNode(true);
          clone.querySelectorAll('.heading-anchor').forEach((a) => a.remove());
          return { id: heading.id, text: (clone.textContent || '').replace(/\s+/g, ' ').trim() };
        });
      return {
        ids: items.map((item) => item.id),
        texts: items.map((item) => item.text),
        levels: headings.map((heading) => Number(heading.tagName.slice(1)))
      };
    });

    const fragments = card.entries.map((href) => `#${decodeURIComponent(href.split('#')[1] || '')}`);
    const expected = part.ids.map((id) => `#${id}`);
    expect(fragments, `${card.href}: the card lists exactly this part's headings, in order`).toEqual(expected);

    /* Text as well as target. A card that double-escapes an entity (`x32 &amp; x64`, where the page
       says `x32 & x64`) links to the right place and reads wrong, which is the defect this check
       was added for. */
    expect(card.texts, `${card.href}: each entry names the heading it links to`).toEqual(part.texts);

    for (const entry of card.entries) {
      expect(entry.startsWith(card.href), `"${entry}" should link into ${card.href}`).toBe(true);
    }

    // A part with headings below its top level is listed as a tree, not flattened — and one without
    // them must not be.
    const nests = part.levels.length > 0 && part.levels.some((level) => level > part.levels[0]);
    expect(card.nested > 0, `${card.href}: nested headings should nest in the card (${card.nested})`).toBe(nests);

    if (card.entries.length) {
      expect(card.label, `${card.href}: the contents are headed`).toMatch(/contents/i);
    }
  }

  /* Static content, and stated as such: no disclosure anywhere in a card, a header, a real bulleted
     list, and entries that are on screen with nothing clicked. The bullets come from `list-disc` —
     Tailwind's preflight removes markers from every `ul` — and the theme's `.toc-nav` is
     deliberately not used here, since its links are full-width blocks with their own padding (a
     chip list, which is right for a sidebar and wrong for this). */
  await page.goto(SERIES_PAGE);
  await expect(page.locator('main ol > li details.toc-card'), 'no disclosure in the cards')
    .toHaveCount(0);

  const first = page.locator('main ol > li .toc-card').first();
  await expect(first.locator('.toc-card-title')).toBeVisible();
  await expect(first.locator('.toc-card-title')).toHaveText(/contents/i);

  const markers = await first.locator('ul.toc-list').first().evaluate((el) => getComputedStyle(el).listStyleType);
  expect(markers, 'the parts are a bulleted list').toBe('disc');

  const link = first.locator('.toc-list a').first();
  await expect(link, 'every entry is visible without any interaction').toBeVisible();
  const target = (await link.getAttribute('href')) || '';
  expect(target, 'the first entry points at a heading').toContain('#');

  /* And it is reachable. The card is covered by its own full-cover link (an absolutely positioned
     `inset-0 z-10` sibling), so an entry that did not outrank it would navigate to the same part
     *without* the fragment it stands for. Stated before the click, so a covered entry fails as
     "something is on top of it" rather than as a 30s click timeout. */
  const hit = await link.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const at = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return at?.closest('a') === el ? 'the entry itself' : at?.tagName || 'nothing';
  });
  expect(hit, 'nothing may cover the parts list').toBe('the entry itself');

  await link.click();
  await expect(page).toHaveURL(new RegExp(`${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
});
