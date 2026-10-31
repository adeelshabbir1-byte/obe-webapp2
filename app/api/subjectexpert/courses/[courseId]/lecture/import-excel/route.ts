import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { withLabSync } from "../../../../../../../lib/labSyncRoute";
import { reconcileLinks } from "../../../../../../../lib/prereqCascade";
import { templateLockResponse } from "../../../../../../../lib/templateLock";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../../lib/subjectExpertGuard";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "../../../../../../../lib/contentSync";
import { writeAuditLog } from "../../../../../../../lib/audit";
import { withErrors } from "../../../../../../../lib/apiHandler";

// The SE uploads a lecture plan from Excel: one row per lecture with Lecture (or Lec), Topic, and optionally Week,
// Sub topic and CLO ("CLO-2" or "2"). The sheet "Lecture topics" is used if present, otherwise the first sheet; headers
// are found by name in the first 10 rows, so the system's own export, the HEC import file and an NCEAC-style sheet all
// work. With apply=0 it only previews. Applying updates existing lectures by number (their CLO and assessment links
// stay) and adds missing ones; lectures not in the file are left as they are.
type Row = { lectureNumber: number; week: number; topic: string; subtopic: string | null; clo: string | null; cloId: string | null };
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const text = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object") { const o = v as { richText?: { text: string }[]; text?: string; result?: unknown }; if (o.richText) return o.richText.map((t) => t.text).join(""); if (o.text) return String(o.text); if (o.result != null) return String(o.result); }
  return String(v).trim();
};

async function POST_handler(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const tplLocked = templateLockResponse(course); if (tplLocked) return tplLocked;
  const blocked = await blockedAsNonBaseCourse(course.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Choose an Excel file." }, { status: 400 });
  const apply = String(form?.get("apply") || "") === "1";
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as never); } catch { return NextResponse.json({ error: "Could not read that file — save it as .xlsx and try again." }, { status: 400 }); }
  const ws = wb.worksheets.find((w) => norm(w.name) === "lecture topics") || wb.worksheets.find((w) => /lecture|plan|topic/i.test(w.name)) || wb.worksheets[0];
  if (!ws) return NextResponse.json({ error: "The file has no sheets." }, { status: 400 });

  // Find the header row and the columns by name.
  let head = -1; const col: Record<string, number> = {};
  for (let r = 1; r <= Math.min(10, ws.rowCount) && head < 0; r++) {
    const vals = (ws.getRow(r).values as unknown[]).map((v) => norm(text(v)));
    const find = (re: RegExp) => vals.findIndex((v) => re.test(v));
    const lec = find(/^(lecture|lec|lecture no|lecture number|lecture #)$/), topic = find(/^topic$/);
    if (lec > 0 && topic > 0) { head = r; col.lec = lec; col.topic = topic; col.week = find(/^week$/); col.sub = find(/^sub ?topic$/); col.clo = find(/^(clo|mapped clo)$/); }
  }
  if (head < 0) return NextResponse.json({ error: 'No header row found — the sheet needs at least the columns "Lecture" (or "Lec") and "Topic".' }, { status: 400 });

  const clos = await prisma.cLO.findMany({ where: { courseId: course.id, source: "SE" }, select: { id: true, code: true } });
  const cloByNum = new Map(clos.map((c) => [parseInt(c.code.replace(/\D+/g, ""), 10), c]));
  const rows: Row[] = []; const problems: string[] = []; const seen = new Set<number>();
  for (let r = head + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const lec = parseInt(text(row.getCell(col.lec).value), 10), topic = text(row.getCell(col.topic).value);
    if (!Number.isFinite(lec) && !topic) continue;
    if (!Number.isFinite(lec) || lec < 1 || lec > 80) { problems.push(`Row ${r}: lecture number "${text(row.getCell(col.lec).value)}" is not valid — skipped`); continue; }
    if (!topic) { problems.push(`Lecture ${lec}: no topic — skipped`); continue; }
    if (seen.has(lec)) { problems.push(`Lecture ${lec} appears twice — the first one is used`); continue; }
    seen.add(lec);
    const wk = col.week > 0 ? parseInt(text(row.getCell(col.week).value), 10) : NaN;
    const cloRaw = col.clo > 0 ? text(row.getCell(col.clo).value) : "";
    const cn = parseInt(cloRaw.replace(/\D+/g, ""), 10);
    const clo = Number.isFinite(cn) ? cloByNum.get(cn) : undefined;
    if (cloRaw && !clo) problems.push(`Lecture ${lec}: ${cloRaw} is not one of this course's CLOs — left unmapped`);
    rows.push({ lectureNumber: lec, week: Number.isFinite(wk) && wk > 0 ? wk : Math.ceil(lec / 2), topic: topic.slice(0, 500), subtopic: (col.sub > 0 ? text(row.getCell(col.sub).value) : "").slice(0, 1000) || null, clo: clo?.code || null, cloId: clo?.id || null });
  }
  if (!rows.length) return NextResponse.json({ error: "No lectures found under the header row.", problems }, { status: 400 });
  rows.sort((a, b) => a.lectureNumber - b.lectureNumber);

  const existing = await prisma.lectureRow.findMany({ where: { courseId: course.id, source: "SE" }, select: { id: true, lectureNumber: true, topic: true } });
  const byNum = new Map(existing.map((e) => [e.lectureNumber, e]));
  const summary = { lectures: rows.length, mapped: rows.filter((r) => r.cloId).length, updated: rows.filter((r) => byNum.has(r.lectureNumber)).length, added: rows.filter((r) => !byNum.has(r.lectureNumber)).length, untouched: existing.filter((e) => !seen.has(e.lectureNumber)).length };
  if (!apply) return NextResponse.json({ preview: true, sheet: ws.name, summary, problems: problems.slice(0, 30), rows: rows.slice(0, 80) });

  for (const r of rows) {
    const e = byNum.get(r.lectureNumber);
    const data = { week: r.week, topic: r.topic, subtopic: r.subtopic, ...(r.cloId ? { cloId: r.cloId } : {}) };
    if (e) await prisma.lectureRow.update({ where: { id: e.id }, data });
    else await prisma.lectureRow.create({ data: { courseId: course.id, source: "SE", lectureNumber: r.lectureNumber, bloomLevel: null, weightPct: 0, cloId: r.cloId, week: r.week, topic: r.topic, subtopic: r.subtopic } });
  }
  await writeAuditLog({ actorUserId: user.id, action: "LECTURE_PLAN_IMPORTED", entityType: "Course", entityId: course.id, metadata: { file: file.name, ...summary } });
  await syncCourseContentToLinkedCourses(course.id);
  await reconcileLinks(course.id, { id: user.id, name: user.name }).catch(() => null);
  return NextResponse.json({ ok: true, summary, problems: problems.slice(0, 30) });
}

export const POST = withErrors(withLabSync(POST_handler));
