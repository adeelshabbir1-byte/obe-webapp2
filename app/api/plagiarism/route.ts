import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedUser } from "../../../lib/session";
import { writeAuditLog } from "../../../lib/audit";
import { notifyUsers } from "../../../lib/notifications";
import { whoIs, rdb, str, num, dateOrNull, staffOf } from "../../../lib/registers";
import { PLAG_HINT, KINDS, DECISIONS, HEC_LIMIT, overLimit, plagOf, plagSummary, canSeeAllPlag } from "../../../lib/plagiarism";

const STAFF = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "OMC", "DEPARTMENT_COORDINATOR", "INSTRUCTOR", "SUBJECT_EXPERT"];

/** GET ?file=<id> — a record's report; GET ?summary=xlsx — the summary per year and kind (for the councils' forms). */
export async function GET(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || !STAFF.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const w = await whoIs(user as never);
  if (!w) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const id = q.get("file");
  if (id) {
    const r = await rdb.plagiarismRecord.findUnique({ where: { id } }).catch(() => null);
    if (!r || r.chairmanId !== w.chairmanId || (!canSeeAllPlag(w) && r.createdById !== w.id && r.supervisorId !== w.id) || !r.reportData) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(Buffer.from(r.reportData, "base64"), { headers: { "Content-Type": r.reportMime || "application/pdf", "Content-Disposition": `attachment; filename="${String(r.reportFileName || "report.pdf").replace(/[^\w .()-]+/g, "")}"` } });
  }
  const rows = (await plagOf(w)) || [];
  const wb = new ExcelJS.Workbook();
  const s = wb.addWorksheet("Summary");
  s.addRow(["Year", "Kind", "Checked", "Average similarity %", `Over the limit (${HEC_LIMIT}% overall / 5% one source)`, "Returned for revision", "Rejected", "Referred as misconduct"]).font = { bold: true };
  for (const r of plagSummary(rows)) s.addRow([r.year, KINDS[r.kind] || r.kind, r.checked, r.average, r.over, r.revised, r.rejected, r.misconduct]);
  const d = wb.addWorksheet("Records");
  d.addRow(["Checked on", "Kind", "Title", "Program", "Authors", "Tool", "Similarity %", "Largest single source %", "Limit %", "Decision", "Action taken"]).font = { bold: true };
  for (const r of rows) d.addRow([new Date(r.checkedAt), KINDS[r.kind] || r.kind, r.title, r.program || "", r.authors, r.tool, r.similarityPct, r.singleSourcePct ?? "", r.thresholdPct, DECISIONS[r.decision] || r.decision, r.actionTaken || ""]);
  [s, d].forEach((ws) => ws.columns.forEach((c) => { c.width = 18; }));
  return new NextResponse((await wb.xlsx.writeBuffer()) as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="Plagiarism records ${new Date().toISOString().slice(0, 10)}.xlsx"` } });
}

/** POST multipart { kind, title, program, authors, supervisorId, tool, similarityPct, singleSourcePct, thresholdPct, decision, actionTaken, checkedAt, report } — add a record.
 *  POST JSON { action: "decide", id, decision, actionTaken } — change the decision. */
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || !STAFF.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const w = await whoIs(user as never);
  if (!w) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    if ((req.headers.get("content-type") || "").includes("application/json")) {
      const b = await req.json().catch(() => ({}));
      const r = await rdb.plagiarismRecord.findUnique({ where: { id: String(b.id || "") } });
      if (!r || r.chairmanId !== w.chairmanId || (!canSeeAllPlag(w) && r.createdById !== w.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      const decision = DECISIONS[String(b.decision)] ? String(b.decision) : r.decision;
      await rdb.plagiarismRecord.update({ where: { id: r.id }, data: { decision, actionTaken: str(b.actionTaken, 3000) || r.actionTaken } });
      await writeAuditLog({ actorUserId: w.id, action: "PLAGIARISM_DECISION", entityType: "PlagiarismRecord", entityId: r.id, metadata: { decision } });
      return NextResponse.json({ ok: true });
    }
    const f = await req.formData();
    const g = (k: string) => (typeof f.get(k) === "string" ? String(f.get(k)) : "");
    const kind = KINDS[g("kind")] ? g("kind") : "FYP";
    const title = str(g("title"), 300), authors = str(g("authors"), 400);
    const sim = num(g("similarityPct"));
    if (!title || !authors || sim === null || sim < 0 || sim > 100) return NextResponse.json({ error: "Give the title, the author(s) and the similarity % (0–100)." }, { status: 400 });
    const single = num(g("singleSourcePct"));
    const threshold = num(g("thresholdPct")) ?? HEC_LIMIT;
    const file = f.get("report") as File | null;
    let data: string | null = null, fileName: string | null = null, mime: string | null = null;
    if (file && file.size) {
      if (file.size > 3 * 1024 * 1024) return NextResponse.json({ error: "The report is larger than 3 MB." }, { status: 400 });
      if (!/\.(pdf|html?|docx?)$/i.test(file.name)) return NextResponse.json({ error: "Upload the report as PDF, Word or HTML." }, { status: 400 });
      data = Buffer.from(await file.arrayBuffer()).toString("base64"); fileName = file.name.slice(0, 160); mime = file.type || "application/pdf";
    }
    const supervisorId = (await staffOf(w.chairmanId)).find((s) => s.id === g("supervisorId"))?.id || (user.role === "INSTRUCTOR" ? w.id : null);
    const overall = { similarityPct: sim, singleSourcePct: single, thresholdPct: threshold };
    const decision = DECISIONS[g("decision")] ? g("decision") : overLimit(overall) ? "REVISE" : "ACCEPTED";
    const id = randomUUID();
    await rdb.plagiarismRecord.create({ data: { id, chairmanId: w.chairmanId, kind, title, program: str(g("program"), 120) || null, authors, supervisorId, tool: str(g("tool"), 60) || "Turnitin", similarityPct: sim, singleSourcePct: single, thresholdPct: threshold, decision, actionTaken: str(g("actionTaken"), 3000) || null, reportFileName: fileName, reportMime: mime, reportData: data, checkedAt: dateOrNull(g("checkedAt")) || new Date(), createdById: w.id } });
    await writeAuditLog({ actorUserId: w.id, action: "PLAGIARISM_RECORDED", entityType: "PlagiarismRecord", entityId: id, metadata: { kind, similarity: sim, decision } });
    if (overLimit(overall)) { const qec = await rdb.user.findMany({ where: { extraRoles: { has: "QEC_INCHARGE" }, OR: [{ id: w.chairmanId }, { managedById: w.chairmanId }, { managedBy: { managedById: w.chairmanId } }] }, select: { id: true } }).catch(() => []); await notifyUsers([...qec.map((u: { id: string }) => u.id), supervisorId], { kind: "PLAGIARISM", title: `Similarity ${sim}% on “${title.slice(0, 60)}” — above the limit`, href: "/plagiarism", exceptId: w.id }); }
    return NextResponse.json({ ok: true, id, decision });
  } catch (e) {
    const m = String((e as Error)?.message || "");
    return NextResponse.json({ error: /does not exist|relation|undefined/i.test(m) ? PLAG_HINT : m.slice(0, 200) }, { status: 500 });
  }
}
