import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../lib/subjectExpertGuard";
import { termIndex } from "../../../../../../lib/termLogic";

// Tells the SE, right on the course page (not just as an error when they
// try to save), whether this course is linked into a Content Sync
// group — and if so, which course actually holds the real data (the
// base) and which other courses/batches share it. Content Sync is
// exactly the "same course, offered again in a later batch" case — this
// answers "which course has the data, and which are equivalent to it"
// without having to go dig through the OMC's Content Sync page.
export async function GET(req: Request, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const membership = await prisma.courseContentSyncMember.findUnique({
    where: { courseId: course.id },
    include: {
      group: {
        include: {
          members: { include: { course: { include: { batch: true } } } },
        },
      },
    },
  });
  if (!membership) return NextResponse.json({ inGroup: false });

  const members = membership.group.members
    .map((m) => ({
      courseId: m.courseId,
      isBase: m.isBase,
      isSelf: m.courseId === course.id,
      code: m.course.code,
      title: m.course.title,
      degreeProgram: m.course.batch?.degreeProgram || "",
      batchName: m.course.batch?.batchName || "",
      termOrder: m.course.batch ? termIndex(m.course.batch.startTerm, m.course.batch.startYear) : 0,
    }))
    .sort((a, b) => a.termOrder - b.termOrder);

  const base = members.find((m) => m.isBase) || null;

  return NextResponse.json({ inGroup: true, isBase: membership.isBase, base, members });
}
