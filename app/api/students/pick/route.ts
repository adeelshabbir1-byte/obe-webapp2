import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { visibleBatchIds } from "../../../../lib/studentScope";
import { bestAttemptTotals } from "../../../../lib/cgpaMath";
import { withErrors } from "../../../../lib/apiHandler";

// GET ?q=2510 → matching students (as you type)
//     ?batches=1 → batches the person may open
//     ?batchId=… → the whole batch in roll-number order (with CGPA and status)
//     ?around=<studentId> → that student's batch list and position, for Previous / Next
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ids = await visibleBatchIds(user);
  const p = req.nextUrl.searchParams;
  const sel = { id: true, name: true, rollNumber: true, status: true, batchId: true, batch: { select: { degreeProgram: true, batchName: true } } } as const;
  if (p.get("batches")) {
    const bs = await prisma.batch.findMany({ where: { id: { in: ids.concat("none") } }, select: { id: true, degreeProgram: true, batchName: true, _count: { select: { students: true } } }, orderBy: [{ degreeProgram: "asc" }, { startYear: "desc" }] });
    return NextResponse.json({ batches: bs.map((b) => ({ id: b.id, label: `${b.degreeProgram} — ${b.batchName}`, n: b._count.students })) });
  }
  const q = (p.get("q") || "").trim();
  if (q) {
    const xs = await prisma.student.findMany({ where: { batchId: { in: ids.concat("none") }, OR: [{ rollNumber: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] }, select: sel, orderBy: { rollNumber: "asc" }, take: 30 });
    return NextResponse.json({ students: xs });
  }
  let batchId = p.get("batchId") || "";
  const around = p.get("around");
  if (around) batchId = (await prisma.student.findFirst({ where: { id: around, batchId: { in: ids.concat("none") } }, select: { batchId: true } }))?.batchId || "";
  if (!batchId || !ids.includes(batchId)) return NextResponse.json({ students: [] });
  const xs = await prisma.student.findMany({ where: { batchId }, select: sel, orderBy: { rollNumber: "asc" } });
  const recs = p.get("cgpa") ? await prisma.studentTranscriptRecord.findMany({ where: { studentId: { in: xs.map((x) => x.id) } }, select: { studentId: true, courseCode: true, creditHours: true, gpaPoints: true, grade: true } }) : [];
  const cg = (id: string) => { const t = bestAttemptTotals(recs.filter((r) => r.studentId === id) as never); return t.credits ? Math.round((100 * t.points) / t.credits) / 100 : null; };
  return NextResponse.json({ students: xs.map((x) => ({ ...x, cgpa: p.get("cgpa") ? cg(x.id) : undefined })), index: around ? xs.findIndex((x) => x.id === around) : -1 });
}
export const GET = withErrors(GET_handler);
