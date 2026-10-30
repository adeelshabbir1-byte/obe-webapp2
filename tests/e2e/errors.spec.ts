import { test, expect } from "@playwright/test";
import { signIn, testDb } from "./helpers";

// A crashed page shows the friendly page with a reference code; the same code is filed in the error report
// (and the log / Sentry). API errors return { error, ref }; a missing migration says so plainly. The health check works.

test("a page that throws shows the friendly page with a reference code, filed under the same code", async ({ browser }) => {
  const ctx = await browser.newContext();
  await signIn(ctx, "dream.instructor");
  const page = await ctx.newPage();
  await page.goto("/e2e-check/throw");
  await expect(page.getByRole("heading", { name: "Something went wrong on this page" })).toBeVisible();
  for (const b of ["Try again", "Go to my home", "Report a problem"]) await expect(page.getByText(b, { exact: true }).first()).toBeVisible();
  const ref = (await page.locator("text=Reference code:").locator("b").innerText()).trim();
  expect(ref).toMatch(/^E-[A-Za-z0-9]{4,12}$/);
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/at \w+ \(|node_modules|prisma|35202-1234567-3/i); // no stack trace, no database text, no CNIC
  await expect(page.getByText("has been reported")).toBeVisible();
  const db = await testDb();
  const filed = await db.systemFeedback.findFirst({ where: { title: { contains: ref } }, orderBy: { createdAt: "desc" } });
  expect(filed, `a report filed under ${ref}`).toBeTruthy();
  expect(filed!.body).not.toContain("35202-1234567-3");
  await page.getByText("Report a problem", { exact: true }).click();
  await page.getByLabel("What you were doing").fill("Opening the test page.");
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("Sent — thank you")).toBeVisible();
});

test("API errors: plain message and reference; a missing migration says so", async ({ request }) => {
  const a = await request.get("/api/e2e-check/throw");
  expect(a.status()).toBe(500);
  const d = await a.json();
  expect(d.ref).toMatch(/^E-/);
  expect(d.error).toContain(d.ref);
  expect(JSON.stringify(d)).not.toMatch(/fails on purpose|stack/);
  const m = await request.get("/api/e2e-check/throw?kind=migration");
  expect(m.status()).toBe(503);
  expect((await m.json()).error).toMatch(/needs a database update — ask the administrator to run migrations \(System Health\)/);
});

test("health check: ok with the database up, within 2 seconds", async ({ request }) => {
  const t = Date.now();
  const r = await request.get("/api/health");
  expect(Date.now() - t).toBeLessThan(2000);
  expect(r.status()).toBe(200);
  const d = await r.json();
  expect(d).toMatchObject({ ok: true, db: "up" });
  expect(typeof d.version).toBe("string");
});

test("not found: the friendly 404 page", async ({ page }) => {
  await page.goto("/this-page-does-not-exist-e2e");
  await expect(page.getByText("This page could not be found")).toBeVisible();
  await expect(page.getByText("Go to my home")).toBeVisible();
});
