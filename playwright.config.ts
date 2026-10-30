import { defineConfig, devices } from "@playwright/test";

// End-to-end tests (tests/e2e) against the seeded demo institute in a TEST database — never production.
//   Local:  E2E_DATABASE_URL=… npx tsx tests/e2e/seed.ts && E2E_DATABASE_URL=… npx playwright test
//   CI:     .github/workflows/e2e.yml (Postgres service, seed, production build, then the tests)
// E2E_BASE_URL points the tests at a running app (e.g. a Vercel preview that uses a test database) instead of starting one.
const port = Number(process.env.E2E_PORT || 3200);
const external = !!process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /.*\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]] : "list",
  outputDir: "test-results",
  use: {
    baseURL: process.env.E2E_BASE_URL || `http://localhost:${port}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },
  // Locally E2E_CHROME_CHANNEL=chrome uses the installed Google Chrome; CI installs Playwright's own Chromium.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], ...(process.env.E2E_CHROME_CHANNEL ? { channel: process.env.E2E_CHROME_CHANNEL } : {}) } }],
  webServer: external ? undefined : {
    command: process.env.E2E_DEV ? `npx next dev -p ${port}` : `npx next start -p ${port}`,
    port,
    timeout: 240_000,
    reuseExistingServer: true,
    env: { DATABASE_URL: process.env.E2E_DATABASE_URL || "", DIRECT_URL: process.env.E2E_DATABASE_URL || "", E2E_TEST_ROUTES: "1", CRON_SECRET: process.env.CRON_SECRET || "e2e-cron-secret" },
    stdout: "pipe",
  },
});
