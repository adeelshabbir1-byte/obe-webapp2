import { test, expect } from "@playwright/test";
import { overflowX, signIn, signInStudent, testDb } from "./helpers";

// Student and instructor pages at phone size (360 × 740): no horizontal scroll of the page; screenshots kept as artifacts.
test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

const STUDENT = ["/student/dashboard", "/student/timetable", "/student/registration", "/student/transcript", "/student/attendance", "/student/exams"];

test("student pages fit a phone", async ({ browser }, info) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  await signInStudent(ctx, "DRM-CS-24-001");
  const page = await ctx.newPage();
  const bad: string[] = [];
  for (const url of STUDENT) {
    await page.goto(url);
    await page.waitForLoadState("networkidle").catch(() => null);
    const o = await overflowX(page);
    await info.attach(`student${url.replace(/\//g, "-")}.png`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
    if (o.page > 1) bad.push(`${url}: ${o.page}px too wide (${o.offenders.join(", ")})`);
  }
  expect(bad, bad.join("\n")).toEqual([]);
});

test("instructor pages fit a phone (dashboard, marks entry, course plan, notifications, Report a problem)", async ({ browser }, info) => {
  test.setTimeout(300_000);
  const db = await testDb();
  const course = await db.course.findFirstOrThrow({ where: { instructor: { username: "dream.instructor" }, isOffered: true, semesterNumber: 5 }, select: { id: true } });
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  await signIn(ctx, "dream.instructor");
  const page = await ctx.newPage();
  const urls = ["/dashboard", `/instructor/courses/${course.id}/marks`, `/instructor/courses/${course.id}/schedule`, "/notifications", "/e2e-check/throw"];
  const bad: string[] = [];
  for (const url of urls) {
    await page.goto(url);
    await page.waitForLoadState("networkidle").catch(() => null);
    const o = await overflowX(page);
    await info.attach(`instructor${url.replace(/[/?=&]/g, "-").slice(0, 60)}.png`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
    if (o.page > 1) bad.push(`${url}: ${o.page}px too wide (${o.offenders.join(", ")})`);
  }
  expect(bad, bad.join("\n")).toEqual([]);
  // Marks entry on a phone: one student at a time with previous / next.
  await page.goto(`/instructor/courses/${course.id}/marks`);
  await expect(page.getByRole("button", { name: /Next student/ })).toBeVisible();
});
