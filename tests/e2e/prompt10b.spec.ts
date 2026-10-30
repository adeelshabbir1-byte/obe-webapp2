import { test, expect, type Browser } from "@playwright/test";
import { BROKEN, json, signIn, signInStudent, testDb } from "./helpers";

// Prompt 10 B: teacher calendar & appointments (a Busy-only block hides its details; booking a free slot works end to
// end with accept and .ics), and the Course Catalog (search with matched field, import with preview, edit = version).
test.describe.configure({ mode: "serial" });
const as = async (browser: Browser, u: string) => { const c = await browser.newContext(); await signIn(c, u); return c; };
const pk = (ms: number) => new Date(ms + 5 * 3600e3).toISOString().slice(0, 10);
const today = pk(Date.now());
const monday = (() => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 7 - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); })(); // next week's Monday
const wed = (() => { const d = new Date(`${monday}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 2); return d.toISOString().slice(0, 10); })();

test("a Busy-only block shows others just “Busy”; booking a free slot works and both sides see it", async ({ browser }) => {
  const db = await testDb();
  const t3 = await db.user.findFirstOrThrow({ where: { username: "dream.t3" }, select: { id: true } });
  const teacher = await as(browser, "dream.t3");
  expect((await teacher.request.post("/api/calendar", { data: { action: "settings", open: true, slotMinutes: "30", maxPerDay: 6, start: "08:00", end: "20:00", d0: true, d1: true, d2: true, d3: true, d4: true, d5: true, d6: true } })).ok()).toBeTruthy();
  expect((await teacher.request.post("/api/calendar", { data: { action: "addBlock", repeat: "ONCE", date: wed, start: "10:00", end: "11:00", label: "Dentist visit (private)", privacy: "BUSY" } })).ok()).toBeTruthy();
  expect((await teacher.request.post("/api/calendar", { data: { action: "addBlock", repeat: "ONCE", date: wed, start: "12:00", end: "13:00", label: "Department meeting", privacy: "DETAILS" } })).ok()).toBeTruthy();

  // The teacher sees their own details.
  const own = await teacher.newPage();
  await own.goto(`/my-calendar?week=${monday}`);
  await expect(own.getByText("Dentist visit (private)").first()).toBeVisible();

  // A colleague sees "Busy" for the private block, the details of the open one, and free slots.
  const colleague = await as(browser, "dream.t4");
  const page = await colleague.newPage();
  await page.goto(`/appointments?t=${t3.id}&week=${monday}`);
  await expect(page.locator("body")).not.toContainText(BROKEN);
  await expect(page.locator("body")).not.toContainText("Dentist");
  await expect(page.getByText("Department meeting").first()).toBeVisible();
  await expect(page.locator(".cal-week").getByText("Busy", { exact: true }).first()).toBeVisible();
  // Book the first free slot on Wednesday.
  const select = page.locator("select").filter({ has: page.locator("option") }).last();
  const options = await select.locator("option").evaluateAll((os) => os.map((o) => ({ v: (o as HTMLOptionElement).value, t: o.textContent || "" })));
  const slot = options.find((o) => /^Wed/.test(o.t))!;
  expect(slot).toBeTruthy();
  await select.selectOption(slot.v);
  await page.getByPlaceholder("e.g. Discuss my midterm result").fill("Plan the joint lab session");
  await page.getByRole("button", { name: "Ask for this time" }).click();
  await expect(page.getByText(/Sent — you will be told/)).toBeVisible();
  // The same slot is no longer free for anyone else.
  const again = await colleague.request.post("/api/calendar", { data: { action: "request", teacherId: t3.id, startsAt: slot.v, reason: "Second try" } });
  expect(again.status()).toBe(400);
  expect((await json(again)).error).toMatch(/no longer free/);

  // The teacher accepts (with a note); the colleague sees it accepted and gets the .ics invite.
  await own.goto(`/my-calendar?week=${monday}`);
  await expect(own.getByText("Plan the joint lab session").first()).toBeVisible();
  own.once("dialog", (d) => d.accept("Room B-12"));
  await own.getByRole("button", { name: "Accept" }).first().click();
  await expect(own.getByText(/Upcoming appointments/)).toBeVisible();
  await page.goto("/appointments");
  await expect(page.getByText("Accepted").first()).toBeVisible();
  const a = await db.appointmentRequest.findFirstOrThrow({ where: { teacherId: t3.id, reason: "Plan the joint lab session" } });
  expect(a.status).toBe("ACCEPTED");
  const ics = await colleague.request.get(`/api/appointments/${a.id}/ics`);
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  const body = await ics.text();
  expect(body).toContain(`DTSTART:${new Date(a.startsAt).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`);
  expect(body).toContain("Room B-12");
  const n = await db.notification.count({ where: { userId: a.requesterId, title: { contains: "accepted" } } });
  expect(n).toBeGreaterThan(0);
  // Someone else can't read the invite.
  const other = await as(browser, "dream.t5");
  expect((await other.request.get(`/api/appointments/${a.id}/ics`)).status()).toBe(404);
});

test("a student sees their teachers' free slots", async ({ browser }) => {
  const c = await browser.newContext();
  await signInStudent(c, "DRM-CS-24-001");
  const page = await c.newPage();
  await page.goto("/student/appointments");
  await expect(page.getByRole("heading", { name: "Appointments" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(BROKEN);
  const first = await page.locator("select[name=t] option").nth(1).getAttribute("value");
  expect(first).toBeTruthy();
  await page.goto(`/student/appointments?t=${first}&week=${monday}`);
  await expect(page.locator(".cal-week")).toBeVisible();
});

test("catalog: search shows the matched field; import previews then records “from catalog <code> v<n>”", async ({ browser }) => {
  const db = await testDb();
  const se = await as(browser, "dream.se");
  const page = await se.newPage();
  await page.goto("/course-catalog?q=linked+list");
  await expect(page.locator("body")).not.toContainText(BROKEN);
  const ds = page.locator("tr", { hasText: "Data Structures" }).first();
  await expect(ds.locator("[data-match=topic] mark").first()).toBeVisible();
  const code = await ds.getAttribute("data-code");
  await page.goto(`/course-catalog/${code}`);
  await expect(page.getByRole("heading", { name: "32-lecture plan" })).toBeVisible();

  const cn = await db.catalogCourse.findFirstOrThrow({ where: { title: "Computer Networks" } });
  const target = await db.course.findFirstOrThrow({ where: { code: "CC-313", subjectExpert: { username: "dream.se" } }, select: { id: true } });
  const pv = (await json(await se.request.post("/api/course-catalog", { data: { action: "preview", courseId: target.id, catalogId: cn.id, parts: ["clos", "plan", "books"] } }))).preview;
  expect(pv.blocked).toBe(false);
  expect(pv.plan).toHaveLength(32);
  const approved = await db.course.findFirstOrThrow({ where: { code: "CC-312", subjectExpert: { username: "dream.se" } }, select: { id: true } });
  const blocked = (await json(await se.request.post("/api/course-catalog", { data: { action: "preview", courseId: approved.id, catalogId: cn.id, parts: ["plan"] } }))).preview;
  expect(blocked.blocked).toBe(true);

  // Import through the page.
  await page.goto(`/course-catalog/${cn.code}`);
  await page.locator("select").first().selectOption(target.id);
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByTestId("catalog-preview")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: new RegExp(`Import from ${cn.code} v`) }).click();
  await expect(page.getByText(new RegExp(`from catalog ${cn.code} v\\d`)).first()).toBeVisible();
  const rows = await db.lectureRow.findMany({ where: { courseId: target.id, source: "SE" }, orderBy: { lectureNumber: "asc" }, select: { topic: true } });
  const lectures = JSON.parse(cn.lecturesJson) as { topic: string }[];
  expect(rows.map((r) => r.topic)).toEqual(lectures.map((l) => l.topic));
  expect(await db.catalogImport.count({ where: { courseId: target.id, catalogCode: cn.code } })).toBeGreaterThan(0);
});

test("catalog editing: only the Super Admin / curriculum team; each save is a version that can be restored", async ({ browser }) => {
  const db = await testDb();
  const c = await db.catalogCourse.findFirstOrThrow({ where: { field: "ENGINEERING" }, orderBy: { code: "asc" } });
  const se = await as(browser, "dream.se");
  const no = await se.request.post("/api/course-catalog", { data: { action: "save", id: c.id, patch: { title: "Hacked" }, note: "x" } });
  expect(no.status()).toBe(400);
  expect((await json(no)).error).toMatch(/Super Admin/);
  const su = await as(browser, "e2e.super");
  const ok = await json(await su.request.post("/api/course-catalog", { data: { action: "save", id: c.id, patch: { title: `${c.title} (revised)` }, note: "Title revised" } }));
  expect(ok.version).toBe(c.version + 1);
  const page = await su.newPage();
  await page.goto(`/course-catalog/${c.code}`);
  await expect(page.getByText(`${c.title} (revised)`).first()).toBeVisible();
  await expect(page.getByText("Title revised")).toBeVisible();
  const back = await json(await su.request.post("/api/course-catalog", { data: { action: "restore", id: c.id, version: c.version } }));
  expect(back.version).toBe(c.version + 2);
  expect((await db.catalogCourse.findUniqueOrThrow({ where: { id: c.id } })).title).toBe(c.title);
});

test("samples: the course-file samples PDF is built for the course team and refused to others", async ({ browser }) => {
  const db = await testDb();
  const course = await db.course.findFirstOrThrow({ where: { instructor: { username: "dream.instructor" }, isOffered: true }, select: { id: true } });
  const t = await as(browser, "dream.instructor");
  const r = await t.request.get(`/api/instructor/courses/${course.id}/samples/pdf`);
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toContain("application/pdf");
  expect((await r.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const other = await as(browser, "dream.t5");
  expect((await other.request.get(`/api/instructor/courses/${course.id}/samples/pdf`)).status()).toBe(403);
});
