import { NextRequest, NextResponse } from "next/server";
import { templateLockResponse } from "../../../../../../../lib/templateLock";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../../lib/subjectExpertGuard";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "../../../../../../../lib/contentSync";
import { writeAuditLog } from "../../../../../../../lib/audit";
import { renumberClos } from "../../../../../../../lib/cloOrdering";
import { ensureCoursePloMapping } from "../../../../../../../lib/coursePloSync";
import { withErrors } from "../../../../../../../lib/apiHandler";

async function PATCH_handler(req: NextRequest, { params }: { params: { courseId: string; cloId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const tplLocked = templateLockResponse(course); if (tplLocked) return tplLocked;

  const blocked = await blockedAsNonBaseCourse(course.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

  const body = await req.json();
  // The page may hold an older id: the course's CLOs can be recreated meanwhile (Load HEC content, Content Sync from
  // the base course, a curriculum import). Fall back to the same CLO by its code so the save still lands.
  let clo = await prisma.cLO.findUnique({ where: { id: params.cloId } });
  if ((!clo || clo.courseId !== course.id || clo.source !== "SE") && typeof body.code === "string" && body.code) clo = await prisma.cLO.findFirst({ where: { courseId: course.id, source: "SE", code: body.code } });
  if (!clo || clo.courseId !== course.id || clo.source !== "SE") return NextResponse.json({ error: "This CLO was replaced since the page opened (the course's CLOs were reloaded). Reload the page and save again.", stale: true }, { status: 404 });
  const cloId = clo.id;

  { const lk = await (await import("../../../../../../../lib/curriculumLibrary")).courseLock(params.courseId, "clo"); if (lk) return NextResponse.json({ error: lk }, { status: 423 }); }
  if (!body.statement || !body.bloomLevel) {
    return NextResponse.json({ error: "statement and bloomLevel are required" }, { status: 400 });
  }

  const updated = await prisma.cLO.update({
    where: { id: cloId },
    data: {
      statement: body.statement,
      bloomLevel: body.bloomLevel,
      mappedPloId: body.mappedPloId || null,
      // Saving from this editor is always a human decision — whether
      // picking a PLO for the first time or re-confirming a prior
      // system suggestion — so it's always tagged MANUAL from here,
      // clearing the "unverified" badge either way.
      ploMappingSource: body.mappedPloId ? "MANUAL" : null,
      ploContributionPct: body.mappedPloId ? (body.ploContributionPct ? parseInt(body.ploContributionPct, 10) : 100) : null,
      targetPct: body.targetPct ? parseInt(body.targetPct, 10) : 60,
    },
  });

  await writeAuditLog({ actorUserId: user.id, action: "CLO_UPDATED", entityType: "CLO", entityId: cloId });
  await syncCourseContentToLinkedCourses(course.id);
  if (body.mappedPloId) await ensureCoursePloMapping(course.id, body.mappedPloId, user.id, "MANUAL");

  return NextResponse.json({ clo: updated });
}

async function DELETE_handler(req: Request, { params }: { params: { courseId: string; cloId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  { const lk = await (await import("../../../../../../../lib/curriculumLibrary")).courseLock(params.courseId, "clo"); if (lk) return NextResponse.json({ error: lk }, { status: 423 }); }
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const tplLocked = templateLockResponse(course); if (tplLocked) return tplLocked;

  const blocked = await blockedAsNonBaseCourse(course.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

  const clo = await prisma.cLO.findUnique({ where: { id: params.cloId } });
  if (!clo || clo.courseId !== course.id || clo.source !== "SE") return NextResponse.json({ error: "not found" }, { status: 404 });

  const inUse = await prisma.lectureRow.count({ where: { cloId: params.cloId } });
  if (inUse > 0) return NextResponse.json({ error: `This CLO is used by ${inUse} lecture topic(s). Move those topics to another CLO first.` }, { status: 409 });
  await prisma.paperDistributionItem.updateMany({ where: { cloId: params.cloId }, data: { cloId: null } });
  await prisma.cLO.delete({ where: { id: params.cloId } });
  await renumberClos(course.id, "SE");
  await writeAuditLog({ actorUserId: user.id, action: "CLO_DELETED", entityType: "CLO", entityId: params.cloId });
  await syncCourseContentToLinkedCourses(course.id);

  return NextResponse.json({ ok: true });
}
export const PATCH = withErrors(PATCH_handler);
export const DELETE = withErrors(DELETE_handler);
