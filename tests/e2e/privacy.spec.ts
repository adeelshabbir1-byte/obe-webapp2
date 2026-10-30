import { test, expect, type BrowserContext } from "@playwright/test";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { signIn, signInStudent, testDb } from "./helpers";

// No CNIC in any export (masked 35202-•••••••-3 instead), except a regulator's upload file asked for on purpose by a
// Program Lead or above — which is logged. Every export is logged. CNICs are masked on screen.
const FULL = /\b\d{5}-?\d{7}-?\d\b/;

async function fileText(ctx: BrowserContext, url: string) {
  const r = await ctx.request.get(url);
  const ct = r.headers()["content-type"] || "";
  const buf = await r.body();
  if (r.status() !== 200) return { status: r.status(), text: buf.toString("utf8") };
  if (ct.includes("spreadsheetml")) {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const out: string[] = [];
    wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => out.push(String(c.value ?? "")))));
    return { status: 200, text: out.join("\n") };
  }
  if (ct.includes("zip")) {
    const z = await JSZip.loadAsync(buf);
    const parts = await Promise.all(Object.values(z.files).filter((f) => !f.dir).map((f) => f.async("string")));
    return { status: 200, text: parts.join("\n") };
  }
  return { status: 200, text: buf.toString("utf8") };
}

test("exports never contain a full CNIC; each export is logged", async ({ browser }) => {
  test.setTimeout(300_000);
  const db = await testDb();
  const cs = await db.batch.findFirstOrThrow({ where: { batchName: "BSCS Fall 2024" }, select: { id: true } });
  const pl = await browser.newContext(); await signIn(pl, "dream.lead.cs");
  const head = await browser.newContext(); await signIn(head, "dream.head");
  const since = new Date();
  const checks: [BrowserContext, string][] = [
    [pl, `/api/accreditation/nceac-portal?file=students&program=${encodeURIComponent("BS Computer Science")}&batch=${cs.id}`],
    [pl, `/api/accreditation/nceac-portal?file=faculty&program=${encodeURIComponent("BS Computer Science")}`],
    [head, "/api/hemis?dataset=all"],
    [head, "/api/institute-export"],
  ];
  let checked = 0;
  for (const [ctx, url] of checks) {
    const f = await fileText(ctx, url);
    if (f.status !== 200) continue; // a feature not set up in the test institute
    checked++;
    expect(f.text, `${url} contains a full CNIC`).not.toMatch(FULL);
  }
  expect(checked).toBeGreaterThan(0);
  // The student's own data download.
  const st = await browser.newContext(); await signInStudent(st, "DRM-CS-24-001");
  const mine = await fileText(st, "/api/student/my-data");
  expect(mine.text).not.toMatch(FULL);
  const logged = await db.auditLog.count({ where: { action: "DATA_EXPORTED", createdAt: { gte: since } } });
  expect(logged).toBeGreaterThanOrEqual(checked);
});

test("a regulator's upload file has the full CNIC only on request, for a Program Lead, and it is logged", async ({ browser }) => {
  const db = await testDb();
  const cs = await db.batch.findFirstOrThrow({ where: { batchName: "BSCS Fall 2024" }, select: { id: true } });
  const url = `/api/accreditation/nceac-portal?file=students&program=${encodeURIComponent("BS Computer Science")}&batch=${cs.id}&withCnic=1`;
  const pl = await browser.newContext(); await signIn(pl, "dream.lead.cs");
  const since = new Date();
  const f = await fileText(pl, url);
  test.skip(f.status !== 200, "NCEAC export not set up in this database");
  expect(f.text).toMatch(FULL);
  expect(await db.auditLog.count({ where: { action: "CNIC_EXPORTED", createdAt: { gte: since } } })).toBeGreaterThan(0);
  const ins = await browser.newContext(); await signIn(ins, "dream.instructor");
  const g = await fileText(ins, url);
  expect(g.text).not.toMatch(FULL);
});

test("CNIC is masked on screen (own profile)", async ({ browser }) => {
  const ctx = await browser.newContext(); await signIn(ctx, "dream.instructor");
  const page = await ctx.newPage();
  await page.goto("/faculty/profile");
  const html = await page.content();
  expect(html).not.toContain("7654321");
  expect(html).toContain("35202-•••••••-9");
});
