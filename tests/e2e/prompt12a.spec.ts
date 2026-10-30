import { test, expect, type Browser } from "@playwright/test";
import { BROKEN, json, signIn, testDb } from "./helpers";

// Committee engine and the Board of Studies: full committee needs a quorum and a majority and the Convener finalises;
// the minutes PDF lists the votes; Convener-only mode approves with one click and a signed PDF; an external member's
// guest link shows only that committee's items. (The OMC's own voting runs on the engine — journeys.spec covers it.)
test.describe.configure({ mode: "serial" });
const as = async (browser: Browser, u: string) => { const c = await browser.newContext(); await signIn(c, u); return c; };
const API = "/api/cmt";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
let fullId = "", guestLink = "";
async function pdfText(buf: Buffer) {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs" as string)) as { getDocument: (o: unknown) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str?: string }[] }> }> }> } };
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: false, isEvalSupported: false }).promise;
  let out = "";
  for (let i = 1; i <= doc.numPages; i++) out += (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str || "").join(" ") + " ";
  return out.replace(/\s+/g, " ");
}

test("BOS full committee: quorum and majority, Convener finalises, minutes PDF lists the votes", async ({ browser }) => {
  const db = await testDb();
  const ids = Object.fromEntries((await db.user.findMany({ where: { username: { in: ["dream.hod.cs", "dream.t3", "dream.t4", "dream.t5"] } }, select: { id: true, username: true } })).map((u) => [u.username, u.id]));
  const head = await as(browser, "dream.head");
  fullId = (await json(await head.request.post(API, { data: { action: "save", type: "BOS", scope: "INSTITUTE", name: "Board of Studies — Computing (e2e)", mode: "FULL", quorumPct: 50, majorityPct: 50, convenerId: ids["dream.hod.cs"] } }))).id;
  expect(fullId).toBeTruthy();
  for (const u of ["dream.t3", "dream.t4", "dream.t5"]) expect((await head.request.post(API, { data: { action: "addMember", committeeId: fullId, userId: ids[u] } })).ok()).toBeTruthy();
  const ext = await json(await head.request.post(API, { data: { action: "addMember", committeeId: fullId, name: "Dr. Ayesha Khan", organisation: "NUST" } }));
  guestLink = ext.link;
  expect(guestLink).toMatch(/^\/committee-guest\//);
  const mtg = (await json(await head.request.post(API, { data: { action: "meeting", committeeId: fullId, date: "2026-11-10", venue: "Board Room" } }))).id;
  const itemId = (await json(await head.request.post(API, { data: { action: "item", committeeId: fullId, title: "Approve the revised CS elective list", summary: "Adds AI Ethics.", meetingId: mtg } }))).id;
  const conv = await as(browser, "dream.hod.cs");
  const fin = (o: string) => conv.request.post(API, { multipart: { action: "finalise", itemId, outcome: o } });
  expect((await json(await fin("APPROVED"))).error).toMatch(/No quorum/);
  const t3 = await as(browser, "dream.t3"), t4 = await as(browser, "dream.t4");
  expect((await t3.request.post(API, { data: { action: "vote", committeeId: fullId, itemId, vote: "APPROVE" } })).ok()).toBeTruthy();
  expect((await json(await t4.request.post(API, { data: { action: "vote", committeeId: fullId, itemId, vote: "REJECT" } }))).error).toMatch(/why you reject/);
  expect((await t4.request.post(API, { data: { action: "vote", committeeId: fullId, itemId, vote: "REJECT", comment: "Not enough labs" } })).ok()).toBeTruthy();
  // 2 of 5 voted: quorum (3) not met.
  expect((await json(await fin("APPROVED"))).error).toMatch(/No quorum/);
  const t5 = await as(browser, "dream.t5");
  expect((await t5.request.post(API, { data: { action: "vote", committeeId: fullId, itemId, vote: "APPROVE_WITH_CHANGES", comment: "Add a lab" } })).ok()).toBeTruthy();
  // Not the Convener: refused.
  expect((await json(await t3.request.post(API, { multipart: { action: "finalise", itemId, outcome: "APPROVED" } }))).error).toMatch(/Only the Convener/);
  expect((await json(await fin("REJECTED"))).error).toMatch(/not rejected/);
  expect((await fin("APPROVED_WITH_CHANGES")).ok()).toBeTruthy();
  expect((await db.cmtItem.findUniqueOrThrow({ where: { id: itemId } })).outcome).toBe("APPROVED_WITH_CHANGES");
  const pdf = await head.request.get(`${API}/file?meeting=${mtg}&pdf=1`);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  const text = await pdfText(Buffer.from(await pdf.body()));
  for (const s of ["Approve the revised CS elective list", "Approve with changes", "Not enough labs", "Decision: Approved with changes"]) expect(text).toContain(s);
  const page = await conv.newPage();
  await page.goto(`/boards/${fullId}`);
  await expect(page.locator("body")).not.toContainText(BROKEN);
  await expect(page.locator(`[data-item="Approve the revised CS elective list"]`)).toContainText("Approved with changes");
});

test("Convener-only BOS: one click with the signed minutes PDF approves", async ({ browser }) => {
  const db = await testDb();
  const hod = await db.user.findFirstOrThrow({ where: { username: "dream.hod.cs" }, select: { id: true, departmentId: true } });
  const conv = await as(browser, "dream.hod.cs");
  const id = (await json(await conv.request.post(API, { data: { action: "save", type: "BOS", scope: "DEPARTMENT", scopeId: hod.departmentId, name: "BOS — Convener only (e2e)", mode: "CONVENER_ONLY", convenerId: hod.id } }))).id;
  const itemId = (await json(await conv.request.post(API, { data: { action: "item", committeeId: id, title: "Approve Data Mining outline" } }))).id;
  expect((await json(await conv.request.post(API, { multipart: { action: "finalise", itemId, outcome: "APPROVED", meetingDate: "2026-11-12" } }))).error).toMatch(/signed minutes/);
  const ok = await conv.request.post(API, { multipart: { action: "finalise", itemId, outcome: "APPROVED", meetingDate: "2026-11-12", file: { name: "minutes.pdf", mimeType: "application/pdf", buffer: PDF } } });
  expect(ok.ok()).toBeTruthy();
  const it = await db.cmtItem.findUniqueOrThrow({ where: { id: itemId } });
  expect(it.outcome).toBe("APPROVED"); expect(it.signedRef).toBeTruthy();
  const f = await conv.request.get(`${API}/file?item=${itemId}`);
  expect((await f.body()).subarray(0, 5).toString()).toBe("%PDF-");
  // No voting in Convener-only mode.
  const t3 = await as(browser, "dream.t3");
  expect((await t3.request.post(API, { data: { action: "vote", committeeId: id, itemId, vote: "APPROVE" } })).status()).toBe(400);
});

test("an external member's guest link shows only that BOS's items", async ({ browser }) => {
  const db = await testDb();
  const head = await as(browser, "dream.head");
  const other = (await json(await head.request.post(API, { data: { action: "save", type: "BOS", scope: "INSTITUTE", name: "BOS — Management (e2e)", mode: "FULL" } }))).id;
  await head.request.post(API, { data: { action: "item", committeeId: other, title: "Secret management item" } });
  const mine = (await json(await head.request.post(API, { data: { action: "item", committeeId: fullId, title: "Computing item for the guest" } }))).id;
  const g = await browser.newContext();
  const page = await g.newPage();
  await page.goto(guestLink);
  await expect(page.getByRole("heading", { name: "Board of Studies — Computing (e2e)" })).toBeVisible();
  await expect(page.locator("[data-item='Computing item for the guest']")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Secret management item");
  // The guest votes on his committee's item…
  await page.locator("[data-item='Computing item for the guest']").getByRole("button", { name: "Vote" }).click();
  await expect(page.getByText("Vote recorded.")).toBeVisible();
  const ext = await db.cmtMember.findFirstOrThrow({ where: { committeeId: fullId, external: true } });
  expect(await db.cmtVote.count({ where: { itemId: mine, memberId: ext.id } })).toBe(1);
  // …but not on another committee's, and the link opens nothing else.
  const otherItem = await db.cmtItem.findFirstOrThrow({ where: { committeeId: other } });
  expect((await g.request.post("/api/committee-guest", { data: { token: guestLink.split("/").pop(), itemId: otherItem.id, vote: "APPROVE" } })).status()).toBe(400);
  expect((await g.request.get(`/boards/${fullId}`)).url()).toMatch(/login/);
  expect((await g.request.post("/api/committee-guest", { data: { token: "x".repeat(30), itemId: mine, vote: "APPROVE" } })).status()).toBe(403);
});
