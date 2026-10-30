import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { labAccessFor } from "../../../../../lib/labAccess";
import { labMarksLocked } from "../../../../../lib/labTheory";
import { parseLabMarks } from "../../../../../lib/labMarksSheet";
import { writeAuditLog } from "../../../../../lib/audit";
import { withErrors } from "../../../../../lib/apiHandler";

// POST form { courseId, file, commit? } — the Lab Engineer uploads lab marks. Without commit it only previews.
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  const form = await req.formData();
  const courseId = String(form.get("courseId") || "");
  const file = form.get("file") as File | null;
  const access = user ? await labAccessFor(user, courseId) : null;
  if (!user || !access || access.as !== "ENGINEER") return NextResponse.json({ error: "Only the Lab Engineer of this lab can upload lab marks." }, { status: 403 });
  { const lk = await labMarksLocked(access.lab.id); if (lk) return NextResponse.json({ error: lk }, { status: 409 }); }
  if (!file || file.size === 0) return NextResponse.json({ error: "Choose the filled-in sheet." }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "The file is larger than 5 MB." }, { status: 400 });
  const p = await parseLabMarks(access.lab.id, file);
  if ("error" in p) return NextResponse.json({ error: p.error }, { status: 400 });
  const summary = { labs: p.labs, unknown: p.unknown.slice(0, 40), unknownCount: p.unknown.length, errors: p.errors.slice(0, 40), errorCount: p.errors.length, changes: p.writes.length };
  if (form.get("commit") !== "1") return NextResponse.json({ ok: true, preview: true, ...summary });
  if (p.errors.length) return NextResponse.json({ error: "Fix the marks listed and upload again; nothing was saved.", ...summary }, { status: 400 });
  for (const w of p.writes) {
    await prisma.labMark.upsert({
      where: { courseId_studentId_labNumber: { courseId: access.lab.id, studentId: w.studentId, labNumber: w.labNumber } },
      create: { courseId: access.lab.id, studentId: w.studentId, labNumber: w.labNumber, score: w.score, maxScore: w.maxScore, enteredById: user.id },
      update: { score: w.score, maxScore: w.maxScore, enteredById: user.id, levelsJson: null },
    });
  }
  // A changed "out of" applies to the whole lab, so the other students' marks of that lab carry the same maximum.
  for (const a of p.absents || []) await prisma.labMark.deleteMany({ where: { courseId: access.lab.id, studentId: a.studentId, labNumber: a.labNumber } });
  for (const l of p.labs) await prisma.labMark.updateMany({ where: { courseId: access.lab.id, labNumber: l.labNumber, NOT: { maxScore: l.maxScore } }, data: { maxScore: l.maxScore } });
  await writeAuditLog({ actorUserId: user.id, action: "LAB_MARKS_UPLOADED", entityType: "Course", entityId: access.lab.id, metadata: { changes: p.writes.length, labs: p.labs.length, file: file.name } });
  return NextResponse.json({ ok: true, saved: p.writes.length, ...summary });
}
export const POST = withErrors(POST_handler);
