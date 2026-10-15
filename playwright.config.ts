import { defineConfig, devices } from '@playwright/test';

/**
 * The suite runs against a *built* site, served statically, rather than against `hugo server`.
 * That is deliberate: the things most worth testing here only exist in a production build — the
 * fingerprinted assets and their integrity hashes, the minified markup the HTML checks read, and
 * the Pagefind index, which a dev server has no equivalent of.
 *
 * Build it first, then run:
 *
 *     npm run test:prepare     # hugo --buildDrafts --baseURL http://localhost:8081/ && pagefind
 *     npm test
 *
 * tests/global-setup.ts fails loudly if the directory it finds was not built that way.
 */
const PORT = Number(process.env.TEST_PORT || 8081);
const BASE_URL = `http://localhost:${PORT}/`;

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  },
  /* Two projects, and the second is the point: the header, the menu button and the card's action
     row are laid out differently below the `sm:` breakpoint, and until this existed exactly one
     test exercised that — by resizing a desktop context inside itself. The viewport is a phone's
     without touch or mobile-keyboard emulation, so a `hover()` in the suite still means the same
     thing in both projects and a hover regression cannot hide behind emulation. */
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } }
  ],
  webServer: {
    command: `node tests/static-server.mjs public ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
