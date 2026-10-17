import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { requireInstructorCourse } from "../../../lib/instructorGuard";
import { resultLockMessage } from "../../../lib/resultApproval";
import { writeAuditLog } from "../../../lib/audit";
import { parseLocal, fmt } from "../../../lib/mcq";
import { alertStudents } from "../../../lib/messaging";
import { followersOf, mirrorInstrument } from "../../../lib/sectionLink";
import { chairmanIdFor } from "../../../lib/reportScope";
import { pdb, LEVELS } from "../../../lib/portfolio";

const s = (v: unknown, n = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
type Box = { id: string; courseId: string; instrumentId: string | null };

// Instructor: open hand-in points, grade submissions (score goes to the linked assessment), keep a submission as a work sample.
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  const b = await req.json().catch(() => ({}));
  const course = await requireInstructorCourse(user, String(b.courseId || ""));
  if (!course || !user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    if (b.action === "saveBox") {
      const title = s(b.title, 160), dueAt = parseLocal(b.dueAt);
      if (!title || isNaN(+dueAt)) return NextResponse.json({ error: "Give a title and a due date." }, { status: 400 });
      const inst = b.instrumentId ? await prisma.assessmentInstrument.findFirst({ where: { id: String(b.instrumentId), courseId: course.id } }) : null;
      const data = { title, instructions: s(b.instructions, 4000), dueAt, allowLate: !!b.allowLate, instrumentId: inst?.id || null };
      if (b.id) await pdb.dropbox.updateMany({ where: { id: String(b.id), courseId: course.id }, data });
      else {
        await pdb.dropbox.create({ data: { ...data, courseId: course.id, createdById: user.id } });
        for (const fid of await followersOf(course.id)) await pdb.dropbox.create({ data: { ...data, instrumentId: await mirrorInstrument(data.instrumentId, fid), courseId: fid, createdById: user.id } });
        const ids = (await prisma.studentEnrollment.findMany({ where: { courseId: course.id, status: "ACTIVE" }, select: { studentId: true } })).map((e) => e.studentId);
        await alertStudents(await chairmanIdFor(user), ids, "HANDIN", `${course.code}: ${title}`, `Submit by ${fmt(dueAt)} (PKT). Student portal → Submit Work.`).catch(() => null);
      }
      return NextResponse.json({ ok: true });
    }
    const box = (await pdb.dropbox.findFirst({ where: { id: String(b.boxId || ""), courseId: course.id } })) as Box | null;
    if (!box) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (b.action === "status") { await pdb.dropbox.update({ where: { id: box.id }, data: { status: b.status === "CLOSED" ? "CLOSED" : "OPEN" } }); return NextResponse.json({ ok: true }); }
    if (b.action === "deleteBox") { if (await pdb.submission.count({ where: { dropboxId: box.id } })) return NextResponse.json({ error: "Students have submitted; close it instead." }, { status: 400 }); await pdb.dropbox.delete({ where: { id: box.id } }); return NextResponse.json({ ok: true }); }
    const sub = (await pdb.submission.findFirst({ where: { id: String(b.subId || ""), dropboxId: box.id } })) as { id: string; studentId: string; fileName: string; fileUrl: string } | null;
    if (!sub) return NextResponse.json({ error: "submission not found" }, { status: 404 });
    if (b.action === "grade") {
      const inst = box.instrumentId ? await prisma.assessmentInstrument.findUnique({ where: { id: box.instrumentId } }) : null;
      const score = b.score === "" || b.score === undefined || b.score === null ? null : Number(b.score);
      if (score !== null && (!Number.isFinite(score) || score < 0 || (inst && score > inst.maxScore))) return NextResponse.json({ error: `Score must be between 0 and ${inst?.maxScore ?? "the maximum"}.` }, { status: 400 });
      await pdb.submission.update({ where: { id: sub.id }, data: { score, feedback: s(b.feedback, 4000), gradedAt: new Date() } });
      if (inst && score !== null) {
        const locked = await resultLockMessage(course.id);
        if (locked) return NextResponse.json({ error: `Feedback saved, but marks are locked: ${locked}` }, { status: 409 });
        await prisma.studentMark.upsert({ where: { studentId_instrumentId: { studentId: sub.studentId, instrumentId: inst.id } }, create: { studentId: sub.studentId, courseId: course.id, instrumentId: inst.id, score, enteredById: user.id }, update: { score, enteredById: user.id } });
        await writeAuditLog({ actorUserId: user.id, action: "MARK_ENTERED", entityType: "Submission", entityId: sub.id, metadata: { courseId: course.id, studentId: sub.studentId, instrumentId: inst.id, to: score } });
      }
      return NextResponse.json({ ok: true });
    }
    if (b.action === "sample") {
      if (!box.instrumentId) return NextResponse.json({ error: "Link this hand-in to an assessment first." }, { status: 400 });
      if (!LEVELS.some((l) => l[0] === b.level)) return NextResponse.json({ error: "bad level" }, { status: 400 });
      const mark = await prisma.studentMark.findUnique({ where: { studentId_instrumentId: { studentId: sub.studentId, instrumentId: box.instrumentId } } });
      await pdb.studentWorkSample.create({ data: { courseId: course.id, instrumentId: box.instrumentId, studentId: sub.studentId, level: b.level, score: mark?.score ?? null, fileName: sub.fileName, fileUrl: sub.fileUrl, uploadedById: user.id } });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Online submissions are not set up yet — run prisma/migration_submissions.sql (and migration_portfolio.sql for samples)." }, { status: 500 });
  }
}
