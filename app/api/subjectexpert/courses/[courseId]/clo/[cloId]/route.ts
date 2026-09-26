import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../../lib/subjectExpertGuard";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "../../../../../../../lib/contentSync";
import { writeAuditLog } from "../../../../../../../lib/audit";
import { renumberClos } from "../../../../../../../lib/cloOrdering";
import { ensureCoursePloMapping } from "../../../../../../../lib/coursePloSync";

export async function PATCH(req: NextRequest, { params }: { params: { courseId: string; cloId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const blocked = await blockedAsNonBaseCourse(course.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

  const clo = await prisma.cLO.findUnique({ where: { id: params.cloId } });
  if (!clo || clo.courseId !== course.id || clo.source !== "SE") return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  if (!body.statement || !body.bloomLevel) {
    return NextResponse.json({ error: "statement and bloomLevel are required" }, { status: 400 });
  }

  const updated = await prisma.cLO.update({
    where: { id: params.cloId },
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

  await writeAuditLog({ actorUserId: user.id, action: "CLO_UPDATED", entityType: "CLO", entityId: params.cloId });
  await syncCourseContentToLinkedCourses(course.id);
  if (body.mappedPloId) await ensureCoursePloMapping(course.id, body.mappedPloId, user.id);

  return NextResponse.json({ clo: updated });
}

export async function DELETE(req: Request, { params }: { params: { courseId: string; cloId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const blocked = await blockedAsNonBaseCourse(course.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

  const clo = await prisma.cLO.findUnique({ where: { id: params.cloId } });
  if (!clo || clo.courseId !== course.id || clo.source !== "SE") return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.cLO.delete({ where: { id: params.cloId } });
  await renumberClos(course.id, "SE");
  await writeAuditLog({ actorUserId: user.id, action: "CLO_DELETED", entityType: "CLO", entityId: params.cloId });
  await syncCourseContentToLinkedCourses(course.id);

  return NextResponse.json({ ok: true });
}
