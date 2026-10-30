import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import JSZip from "jszip";

// Production hardening: CNIC masking and scrubbing, error messages and reference codes, the export guard, the health
// check with the database down. (End-to-end checks are in tests/e2e.)
process.env.DATABASE_URL = "postgresql://nobody:nothing@127.0.0.1:1/none?connect_timeout=1";

test("CNIC masked everywhere but for the Super Admin; text, URLs and objects scrubbed", async () => {
  const { maskCnic, cnicFor, scrubText, scrubUrl, scrubObject, CNIC_RE } = await import("../lib/scrub");
  assert.equal(maskCnic("35202-1234567-3"), "35202-•••••••-3");
  assert.equal(maskCnic("3520212345673"), "35202-•••••••-3");
  assert.equal(cnicFor("35202-1234567-3", "PROGRAM_COORDINATOR"), "35202-•••••••-3");
  assert.equal(cnicFor("35202-1234567-3", "SUPER_USER"), "35202-1234567-3");
  assert.equal(scrubText("student 35202-1234567-3 failed"), "student 35202-•••••••-3 failed");
  assert.equal(scrubUrl("/x/35202-1234567-3?q=Ali"), "/x/35202-•••••••-3");
  const o = scrubObject({ id: "u1", name: "Ali", cnic: "35202-1234567-3", marks: 40, nested: { note: "x", ok: "35202-1234567-3" } }) as Record<string, any>;
  assert.equal(o.id, "u1"); assert.equal(o.name, "[removed]"); assert.equal(o.cnic, "[removed]"); assert.equal(o.marks, "[removed]");
  assert.equal(o.nested.ok, "35202-•••••••-3");
  assert.ok(!new RegExp(CNIC_RE.source).test(JSON.stringify(o)));
});

test("Sentry events keep only the user id, role and institute; no bodies, query strings or cookies", async () => {
  const { scrubEvent } = await import("../lib/scrub");
  const e = scrubEvent({
    message: "failed for 35202-1234567-3",
    request: { url: "https://x/y?roll=123", data: { marks: 5 }, query_string: "roll=123", cookies: { s: "t" }, headers: { cookie: "a", Authorization: "b", "user-agent": "ua" } },
    user: { id: "u1", email: "a@b.c", username: "ali", role: "INSTRUCTOR", institute: "c1" },
    exception: { values: [{ value: "CNIC 3520212345673" }] },
    breadcrumbs: [{ message: "35202-1234567-3", data: { name: "Ali" } }],
  });
  assert.equal(e.request!.url, "https://x/y");
  assert.equal(e.request!.data, undefined); assert.equal(e.request!.query_string, undefined); assert.equal(e.request!.cookies, undefined);
  assert.deepEqual(Object.keys(e.request!.headers!), ["user-agent"]);
  assert.deepEqual(e.user, { id: "u1", role: "INSTRUCTOR", institute: "c1" });
  assert.equal(e.message, "failed for 35202-•••••••-3");
  assert.equal(e.exception!.values![0].value, "CNIC 35202-•••••••-3");
  assert.equal(e.breadcrumbs![0].data!.name, "[removed]");
});

test("API errors: plain message with a reference; missing migration; Next.js signals pass through", async () => {
  const { describeError, isNextSignal, withErrors, MIGRATION_MESSAGE } = await import("../lib/apiHandler");
  assert.deepEqual(describeError({ code: "P2021", message: "The table `public.X` does not exist" }, "E-1"), { status: 503, error: MIGRATION_MESSAGE });
  assert.equal(describeError(new Error('column "foo" does not exist'), "E-1").status, 503);
  assert.equal(describeError({ code: "P2025" }, "E-1").status, 404);
  const g = describeError(new Error("secret internals"), "E-ABC123");
  assert.equal(g.status, 500); assert.match(g.error, /E-ABC123/); assert.doesNotMatch(g.error, /secret/);
  assert.equal(isNextSignal({ digest: "NEXT_REDIRECT;replace;/login" }), true);
  assert.equal(isNextSignal(new Error("boom")), false);
  const h = withErrors(async (_req: Request) => { void _req; throw new Error("database password=hunter2"); });
  const r = (await h(new Request("http://x/api/thing"))) as Response;
  const d = await r.json();
  assert.equal(r.status, 500); assert.match(d.ref, /^E-[A-Z0-9]{6}$/); assert.doesNotMatch(JSON.stringify(d), /hunter2/);
  const redirect = withErrors(async (_req: Request) => { void _req; throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;push;/x" }); });
  await assert.rejects(() => redirect(new Request("http://x/api/y")));
});

test("export guard: CNICs masked in Excel, CSV and ZIP downloads; a regulator file keeps them only on request", async () => {
  const { guardExport } = await import("../lib/exportGuard");
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Students");
  ws.addRow(["Roll No", "Name", "CNIC"]); ws.addRow(["R-1", "Ali", "35202-1234567-3"]); ws.addRow(["R-2", "Sara", 3520212345674]);
  const xlsx = Buffer.from(await wb.xlsx.writeBuffer());
  const res = new Response(xlsx, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="students.xlsx"' } });
  const out = await guardExport(res, new Request("http://x/api/coordinator/students/export"), null);
  const back = new ExcelJS.Workbook(); await back.xlsx.load(Buffer.from(await out.arrayBuffer()) as unknown as ArrayBuffer);
  const cells: string[] = []; back.eachSheet((s) => s.eachRow((r) => r.eachCell((c) => cells.push(String(c.value)))));
  assert.ok(cells.includes("35202-•••••••-3")); assert.ok(cells.includes("35202-•••••••-4"));
  assert.ok(!cells.some((c) => /\d{5}-?\d{7}-?\d/.test(c)));
  const csv = await guardExport(new Response("roll,cnic\nR-1,35202-1234567-3\n", { headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="a.csv"' } }), new Request("http://x/api/a"), null);
  assert.equal(await csv.text(), "roll,cnic\nR-1,35202-•••••••-3\n");
  const z = new JSZip(); z.file("students.csv", "cnic\n35202-1234567-3\n");
  const zr = await guardExport(new Response(await z.generateAsync({ type: "nodebuffer" }), { headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="x.zip"' } }), new Request("http://x/api/institute-export"), null);
  const zz = await JSZip.loadAsync(Buffer.from(await zr.arrayBuffer()));
  assert.equal(await zz.file("students.csv")!.async("string"), "cnic\n35202-•••••••-3\n");
  // The regulator's file: full CNIC only with ?withCnic=1 and a Program Lead or above.
  const mk = () => new Response("cnic\n35202-1234567-3\n", { headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="hemis.csv"' } });
  assert.match(await (await guardExport(mk(), new Request("http://x/api/hemis?withCnic=1"), { id: "u", role: "PROGRAM_COORDINATOR" })).text(), /1234567/);
  assert.doesNotMatch(await (await guardExport(mk(), new Request("http://x/api/hemis?withCnic=1"), { id: "u", role: "INSTRUCTOR" })).text(), /1234567/);
  assert.doesNotMatch(await (await guardExport(mk(), new Request("http://x/api/coordinator/students?withCnic=1"), { id: "u", role: "CHAIRMAN" })).text(), /1234567/);
  // A bulk student export needs the Program Lead role or above.
  const big = "Roll No,Name\n" + Array.from({ length: 400 }, (_, i) => `R-${i},Student ${i}`).join("\n");
  const blocked = await guardExport(new Response(big, { headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="students.csv"' } }), new Request("http://x/api/students/export"), { id: "u", role: "INSTRUCTOR" });
  assert.equal(blocked.status, 403);
  const allowed = await guardExport(new Response(big, { headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="students.csv"' } }), new Request("http://x/api/students/export"), { id: "u", role: "PROGRAM_COORDINATOR" });
  assert.equal(allowed.status, 200);
});

test("health check reports the database down when it can't connect, within 2 seconds", async () => {
  const { GET } = await import("../app/api/health/route");
  const t = Date.now();
  const r = await GET();
  const d = await r.json();
  assert.ok(Date.now() - t < 2000, `took ${Date.now() - t} ms`);
  assert.equal(r.status, 503);
  assert.equal(d.ok, false);
  assert.equal(d.db, "down");
});
