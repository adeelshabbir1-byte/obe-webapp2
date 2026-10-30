import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";
import { adminCan, adminCurriculum, inTeamScope, teamCurriculumWhere } from "../../../../../../lib/platformTeam";
import { withErrors } from "../../../../../../lib/apiHandler";

// Assign (or clear) the platform Subject Expert who designs a Master Curriculum course.
async function PATCH_handler(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !(await adminCan(user, "CURRICULUM"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const course = await prisma.masterCourse.findUnique({ where: { id: params.id }, include: { masterCurriculum: true } });
  if (course && !(await inTeamScope(user, course.masterCurriculum))) return NextResponse.json({ error: "Outside your national curriculum team's area." }, { status: 403 });
  if (!course || course.masterCurriculum.chairmanId !== null) return NextResponse.json({ error: "only courses of an official (shared) curriculum can be assigned" }, { status: 404 });

  const body = await req.json();
  let designerId: string | null = null;
  if (body?.designerId) {
    const expert = await prisma.user.findUnique({ where: { id: body.designerId } });
    if (!expert || !expert.isPlatformExpert || expert.role !== "SUBJECT_EXPERT") return NextResponse.json({ error: "that isn't a platform expert" }, { status: 400 });
    designerId = expert.id;
  }
  await prisma.masterCourse.update({ where: { id: course.id }, data: { designerId } });
  await writeAuditLog({ actorUserId: user.id, action: "MASTER_COURSE_DESIGNER_SET", entityType: "MasterCourse", entityId: course.id, metadata: { designerId } });
  return NextResponse.json({ ok: true });
}
export const PATCH = withErrors(PATCH_handler);
