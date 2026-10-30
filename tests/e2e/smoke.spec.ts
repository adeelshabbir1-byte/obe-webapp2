import { test, expect, type Page } from "@playwright/test";
import { BROKEN, BROKEN_HTML, signIn, signInStudent } from "./helpers";
import { CNIC_RE } from "../../lib/scrub";

// Every role's home page opens without an error, and every link of its menu opens without an error page.
// No link or page address carries a CNIC.
const ROLES: [string, string][] = [
  ["CHAIRMAN", "dream.head"], ["PROGRAM_COORDINATOR", "dream.lead.cs"], ["SUBJECT_EXPERT", "dream.se"], ["INSTRUCTOR", "dream.instructor"],
  ["OMC", "dream.omc"], ["DEPARTMENT_COORDINATOR", "dream.dc"], ["HEAD_OF_DEPARTMENT", "dream.hod.cs"], ["SUPER_USER", "e2e.super"],
];

async function menuLinks(page: Page) {
  const hrefs = await page.locator("nav a[href^='/'], aside a[href^='/'], .sidebar a[href^='/']").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") || ""));
  return Array.from(new Set(hrefs.filter((h) => h && !h.startsWith("/api/") && !/logout|sign-?out/i.test(h)).map((h) => h.split("#")[0])));
}
async function crawl(page: Page, home: string) {
  await page.goto(home);
  await page.waitForLoadState("networkidle").catch(() => null);
  // Someone with two roles first chooses which one to work as.
  const choose = page.getByRole("button", { name: /^Continue as / }).first();
  if (await choose.isVisible().catch(() => false)) { await choose.click(); await page.waitForLoadState("networkidle").catch(() => null); await page.goto(home); await page.waitForLoadState("networkidle").catch(() => null); }
  await expect(page.locator("body")).not.toContainText(BROKEN);
  const expand = page.getByRole("button", { name: "Expand all" }).first();
  if (await expand.isVisible().catch(() => false)) await expand.click();
  const links = await menuLinks(page);
  expect(links.length, "the menu has links").toBeGreaterThan(3);
  const bad: string[] = [];
  for (const href of links) {
    if (CNIC_RE.test(href)) bad.push(`${href}: CNIC in the address`);
    CNIC_RE.lastIndex = 0;
    const r = await page.request.get(href);
    const body = r.status() < 400 ? await r.text() : "";
    if (r.status() >= 500 || BROKEN_HTML.test(body)) bad.push(`${href}: ${r.status()}${BROKEN_HTML.test(body) ? ` error page (${BROKEN_HTML.exec(body)![0].slice(0, 40)})` : ""}`);
    for (const m of body.matchAll(/href="([^"]+)"/g)) { if (new RegExp(CNIC_RE.source).test(m[1])) bad.push(`${href}: link with a CNIC`); }
  }
  return { links, bad };
}

for (const [role, username] of ROLES) {
  test(`${role}: home and every menu link open without errors`, async ({ browser }) => {
    test.setTimeout(600_000);
    const ctx = await browser.newContext();
    await signIn(ctx, username);
    const page = await ctx.newPage();
    const { links, bad } = await crawl(page, "/dashboard");
    expect(bad, `${bad.length} of ${links.length} links failed:\n${bad.join("\n")}`).toEqual([]);
    await ctx.close();
  });
}

test("STUDENT: home and every menu link open without errors", async ({ browser }) => {
  test.setTimeout(600_000);
  const ctx = await browser.newContext();
  await signInStudent(ctx, "DRM-CS-24-001");
  const page = await ctx.newPage();
  const { links, bad } = await crawl(page, "/student/dashboard");
  expect(bad, `${bad.length} of ${links.length} links failed:\n${bad.join("\n")}`).toEqual([]);
  await ctx.close();
});
