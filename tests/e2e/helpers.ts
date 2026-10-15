import { expect, type Page } from '@playwright/test';

/**
 * Everything the snippets below report as a failure, collected per page so one test can assert the
 * whole lot at once.
 */
export type PageHealth = {
  /** Content-Security-Policy violations the browser refused to carry out. */
  cspViolations: { directive: string; blockedURI: string; source: string }[];
  /** Console errors, minus the third-party noise the ignore list covers. */
  consoleErrors: string[];
  /** Same-origin responses with a 4xx/5xx status: a missing asset or a broken link. */
  badResponses: { url: string; status: number }[];
  /** Status of the navigation itself, so the 404 page can be checked like any other. */
  documentStatus: number;
};

/**
 * Third-party chatter that is not ours to fix and does not mean the page is broken:
 *
 *   - giscus has no internet-dependent behaviour worth asserting, it warns rather than errors
 *     when a page has no discussion yet, and its origin is the one thing on the site a network
 *     sandbox cannot provide.
 *   - Pagefind's autofocus notice appears whenever anything else already has focus.
 */
const IGNORED_CONSOLE = [/giscus/i, /Discussion not found/i, /Autofocus processing was blocked/i];

export async function watchPage(page: Page): Promise<PageHealth> {
  const health: PageHealth = { cspViolations: [], consoleErrors: [], badResponses: [], documentStatus: 0 };

  /* Reported from inside the page rather than scraped out of the console, because a
     `securitypolicyviolation` event names the directive and the blocked URL. */
  await page.addInitScript(() => {
    (window as unknown as { __cspViolations: unknown[] }).__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      (window as unknown as { __cspViolations: unknown[] }).__cspViolations.push({
        directive: event.violatedDirective,
        blockedURI: event.blockedURI,
        source: event.sourceFile || ''
      });
    });
  });

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
    health.consoleErrors.push(text);
  });

  page.on('response', (response) => {
    const isDocument = response.request().resourceType() === 'document';
    // The navigation's own status is the spec's business, not this helper's: the 404 page is a
    // page like any other, and it is *supposed* to answer 404. What must not be ignored is a
    // missing subresource, which is what the rest of this handler is for.
    if (isDocument) health.documentStatus = response.status();
    if (response.status() < 400 || isDocument) return;
    const url = new URL(response.url());
    // Only this origin: a third-party CDN being unreachable is not a site defect, and in CI it
    // may simply be blocked.
    if (url.origin !== new URL(page.url() || 'http://localhost').origin) return;
    health.badResponses.push({ url: url.pathname, status: response.status() });
  });

  return health;
}

/** Reads back what `watchPage` recorded from inside the document. */
export async function cspViolations(page: Page) {
  return page.evaluate(
    () =>
      ((window as unknown as { __cspViolations?: { directive: string; blockedURI: string }[] })
        .__cspViolations || []) as { directive: string; blockedURI: string }[]
  );
}

export async function expectHealthy(health: PageHealth, page: Page, context: string) {
  const violations = await cspViolations(page);
  expect(violations, `${context}: Content-Security-Policy violations`).toEqual([]);

  // Chromium mirrors a failed navigation into the console as "Failed to load resource". On a page
  // whose status the spec has already asserted — the 404 — that message is the expectation, not a
  // fault, and a subresource failure is still caught by badResponses below.
  const consoleErrors =
    health.documentStatus >= 400
      ? health.consoleErrors.filter((text) => !/Failed to load resource/.test(text))
      : health.consoleErrors;

  expect(consoleErrors, `${context}: console errors`).toEqual([]);
  expect(health.badResponses, `${context}: failed same-origin requests`).toEqual([]);
}
