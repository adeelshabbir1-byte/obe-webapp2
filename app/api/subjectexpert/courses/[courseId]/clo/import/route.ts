import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { templateLockResponse } from "../../../../../../../lib/templateLock";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../../lib/subjectExpertGuard";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "../../../../../../../lib/contentSync";
import { writeAuditLog } from "../../../../../../../lib/audit";
import { ensureCoursePloMapping } from "../../../../../../../lib/coursePloSync";

export const maxDuration = 60;

const BLOOM = ["C1", "C2", "C3", "C4", "C5", "C6"];

// Reads the first sheet of an Excel (or CSV) file in the same layout the Export produces:
// CLO | Statement | Bloom level | PLO number | Contribution % | Target %.
// A row whose CLO code already exists updates that CLO; any other row is added as a new CLO. Nothing is ever deleted.
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const tplLocked = templateLockResponse(course); if (tplLocked) return tplLocked;
  const blocked = await blockedAsNonBaseCourse(course.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "choose a file first" }, { status: 400 });

  const lines: string[][] = [];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    if (file.name.toLowerCase().endsWith(".csv")) {
      for (const l of buf.toString("utf-8").split(/\r?\n/)) lines.push(l.split(",").map((x) => x.trim()));
    } else {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as any);
      const ws = wb.worksheets[0];
      if (!ws) return NextResponse.json({ error: "the file has no sheet" }, { status: 400 });
      ws.eachRow((row) => { lines.push([1, 2, 3, 4, 5, 6].map((i) => (row.getCell(i).text || "").trim())); });
    }
  } catch { return NextResponse.json({ error: "could not read that file — use the Excel file from Export" }, { status: 400 }); }

  // Skip a header row if present.
  const rows = lines.filter((r) => r.some((c) => c)).filter((r, i) => !(i === 0 && /statement/i.test(r[1] || "")));
  if (rows.length === 0) return NextResponse.json({ error: "no CLO rows found" }, { status: 400 });

  const plos = course.batchId ? await prisma.pLO.findMany({ where: { batchId: course.batchId } }) : [];
  const ploByNumber = new Map(plos.map((p) => [p.number, p]));
  const existing = await prisma.cLO.findMany({ where: { courseId: course.id, source: "SE" }, orderBy: { orderIndex: "asc" } });
  const byCode = new Map(existing.map((c) => [c.code.toUpperCase(), c]));
  let count = existing.length, added = 0, updated = 0;
  const errors: string[] = [];
  const blankPctPlos = new Set<string>(); // PLOs where a row left the contribution blank: split them equally afterwards

  for (let i = 0; i < rows.length; i++) {
    const [codeRaw, statement, bloomRaw, ploRaw, pctRaw, targetRaw] = rows[i];
    const rowNo = i + 1;
    const bloom = (bloomRaw || "").toUpperCase().replace(/\s+/g, "");
    if (!statement) { errors.push(`Row ${rowNo}: statement is empty`); continue; }
    if (!BLOOM.includes(bloom)) { errors.push(`Row ${rowNo}: Bloom level must be C1 to C6`); continue; }
    let plo = null as null | { id: string; number: number };
    if (ploRaw) {
      const n = parseInt(String(ploRaw).replace(/\D+/g, ""), 10);
      plo = ploByNumber.get(n) || null;
      if (!plo) { errors.push(`Row ${rowNo}: PLO ${ploRaw} does not exist for this batch`); continue; }
    }
    const pct = pctRaw ? Math.min(100, Math.max(0, parseInt(pctRaw, 10) || 0)) : plo ? 100 : null;
    if (plo && !pctRaw) blankPctPlos.add(plo.id);
    const target = targetRaw ? Math.min(100, Math.max(1, parseInt(targetRaw, 10) || 60)) : undefined;
    const data = { statement, bloomLevel: bloom, mappedPloId: plo?.id || null, ploMappingSource: plo ? "MANUAL" : null, ploContributionPct: plo ? pct : null, ...(target ? { targetPct: target } : {}) };
    const match = codeRaw ? byCode.get(codeRaw.toUpperCase()) : undefined;
    if (match) { await prisma.cLO.update({ where: { id: match.id }, data }); updated++; }
    else { await prisma.cLO.create({ data: { courseId: course.id, source: "SE", code: `CLO-${count + 1}`, orderIndex: count, ...data } }); count++; added++; }
    if (plo) await ensureCoursePloMapping(course.id, plo.id, user.id, "MANUAL");
  }

  // CLOs sharing a PLO with no contribution given in the file share it equally (e.g. 3 CLOs -> 34, 33, 33).
  for (const ploId of Array.from(blankPctPlos)) {
    const on = await prisma.cLO.findMany({ where: { courseId: course.id, source: "SE", mappedPloId: ploId }, orderBy: { orderIndex: "asc" }, select: { id: true } });
    const base = Math.floor(100 / on.length), extra = 100 - base * on.length;
    for (let i = 0; i < on.length; i++) await prisma.cLO.update({ where: { id: on[i].id }, data: { ploContributionPct: base + (i < extra ? 1 : 0) } });
  }

  await writeAuditLog({ actorUserId: user.id, action: "CLOS_IMPORTED_FROM_FILE", entityType: "Course", entityId: course.id, metadata: { added, updated, errors: errors.length } });
  if (added + updated > 0) await syncCourseContentToLinkedCourses(course.id);
  return NextResponse.json({ added, updated, errors });
}
