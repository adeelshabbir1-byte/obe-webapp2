import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../lib/instructorGuard";
import { getLinkedSections } from "../../../../../../lib/linkedSections";
import { writeAuditLog } from "../../../../../../lib/audit";

// Copies this course's actual weights (and, if requested, CLOs) onto every
// other section of the same course this same Instructor teaches this
// semester. Explicit, one-click action — never automatic/silent, so a
// diverging section is never overwritten without the Instructor asking for it.
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const linked = await getLinkedSections(user.id, course.id);
  if (linked.length === 0) return NextResponse.json({ error: "no linked sections found" }, { status: 400 });

  const body = await req.json();
  const syncWeights = body.syncWeights !== false;
  const syncClos = !!body.syncClos;

  const weightFields = {
    instructorAssignmentPct: course.instructorAssignmentPct, instructorQuizPct: course.instructorQuizPct,
    instructorProjectPct: course.instructorProjectPct, instructorLabPct: course.instructorLabPct,
    instructorMidtermPct: course.instructorMidtermPct, instructorFinalPct: course.instructorFinalPct,
  };

  for (const target of linked) {
    if (syncWeights) {
      await prisma.course.update({ where: { id: target.id }, data: weightFields });
    }
    if (syncClos) {
      const sourceClos = await prisma.cLO.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" } });
      await prisma.cLO.deleteMany({ where: { courseId: target.id, source: "INSTRUCTOR" } });
      if (sourceClos.length > 0) {
        await prisma.cLO.createMany({
          data: sourceClos.map((c) => ({
            courseId: target.id, source: "INSTRUCTOR", code: c.code, statement: c.statement,
            bloomLevel: c.bloomLevel, mappedPloId: c.mappedPloId, ploContributionPct: c.ploContributionPct,
          })),
        });
      }
    }
  }

  await writeAuditLog({ actorUserId: user.id, action: "SYNCED_TO_LINKED_SECTIONS", entityType: "Course", entityId: course.id, metadata: { linkedCount: linked.length, syncWeights, syncClos } });

  return NextResponse.json({ syncedCount: linked.length });
}
