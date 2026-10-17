import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { labAccessFor } from "../../../../lib/labAccess";
import { checkLabSync, saveTask, LAB_PLAN_HINT } from "../../../../lib/labPlan";
import { notifyUsers } from "../../../../lib/notifications";
import { writeAuditLog } from "../../../../lib/audit";

const ldb = prisma as unknown as Record<string, any>;

// POST { action, labCourseId, ... }
//   saveTask   { labNumber, title, week, lectureNumbers[] } — Lab Engineer or the instructor
//   removeTask { labNumber } — only while it has no file and no marks
//   review     { versionId, decision: APPROVED | RETURNED, note } — the instructor only
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  const b = await req.json().catch(() => ({}));
  const access = user ? await labAccessFor(user, String(b.labCourseId || "")) : null;
  if (!user || !access) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const labId = access.lab.id;
  try {
    if (b.action === "saveTask") {
      const labNumber = Math.round(Number(b.labNumber));
      if (!(labNumber >= 1 && labNumber <= 40)) return NextResponse.json({ error: "Lab number must be 1–40." }, { status: 400 });
      const title = String(b.title || "").trim().slice(0, 160);
      if (!title) return NextResponse.json({ error: "Give the lab task a name." }, { status: 400 });
      const week = b.week === "" || b.week == null ? null : Math.round(Number(b.week));
      if (week != null && !(week >= 1 && week <= 20)) return NextResponse.json({ error: "Week must be 1–20." }, { status: 400 });
      const nums = (Array.isArray(b.lectureNumbers) ? b.lectureNumbers : []).map((n: unknown) => Math.round(Number(n))).filter((n: number) => n > 0).slice(0, 12);
      await saveTask(labId, access.theory?.id || null, { labNumber, title, week, lectureNumbers: nums }, user.id);
      await checkLabSync(labId, { id: user.id, name: user.name });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "removeTask") {
      const labNumber = Math.round(Number(b.labNumber));
      const m = await prisma.labManual.findUnique({ where: { courseId_labNumber: { courseId: labId, labNumber } }, include: { _count: { select: { versions: true } } } });
      const marks = await prisma.labMark.count({ where: { courseId: labId, labNumber } });
      if ((m?._count.versions || 0) > 0 || marks > 0) return NextResponse.json({ error: "This lab already has files or marks, so it cannot be removed. Rename it instead." }, { status: 400 });
      await ldb.labTaskPlan.deleteMany({ where: { labCourseId: labId, labNumber } });
      if (m) await prisma.labManual.delete({ where: { id: m.id } });
      await checkLabSync(labId, { id: user.id, name: user.name });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "review") {
      if (access.as !== "LEAD") return NextResponse.json({ error: "Only the instructor who teaches the course approves lab files." }, { status: 403 });
      const decision = b.decision === "APPROVED" ? "APPROVED" : "RETURNED";
      const note = String(b.note || "").trim().slice(0, 500);
      if (decision === "RETURNED" && !note) return NextResponse.json({ error: "Say what needs to change." }, { status: 400 });
      const r = await ldb.labFileReview.findUnique({ where: { versionId: String(b.versionId || "") } });
      if (!r || r.labCourseId !== labId) return NextResponse.json({ error: "File not found." }, { status: 404 });
      await ldb.labFileReview.update({ where: { versionId: r.versionId }, data: { status: decision, note: note || null, reviewedById: user.id, reviewedAt: new Date() } });
      const what = `${r.kind === "SOLUTION" ? "solution" : "manual"} of Lab ${r.labNumber}`;
      await notifyUsers([access.lab.labEngineerId], { kind: "LAB_SYNC", title: decision === "APPROVED" ? `${user.name} approved the ${what} — ${access.lab.code}` : `${user.name} sent back the ${what} — ${access.lab.code}`, body: note || undefined, href: `/lab-engineer/labs/${labId}`, exceptId: user.id });
      await writeAuditLog({ actorUserId: user.id, action: decision === "APPROVED" ? "LAB_FILE_APPROVED" : "LAB_FILE_RETURNED", entityType: "LabManualVersion", entityId: r.versionId, metadata: { labNumber: r.labNumber, kind: r.kind } });
      return NextResponse.json({ ok: true });
    }
  } catch (e) {
    const m = String((e as Error)?.message || "");
    return NextResponse.json({ error: /does not exist|relation|undefined/i.test(m) ? LAB_PLAN_HINT : m.slice(0, 200) }, { status: 500 });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
