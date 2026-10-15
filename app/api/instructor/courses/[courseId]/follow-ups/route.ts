import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { requireInstructorCourse } from "../../../../../../lib/instructorGuard";
import { writeAuditLog } from "../../../../../../lib/audit";
import { sendFollowUps } from "../../../../../../lib/topicLinks";

export const maxDuration = 60;

// The course's results by topic raise follow-ups: to the teacher of the course that depends on a weak topic, and to
// whoever teaches this course next. Sending again only updates the numbers of ones already sent.
export async function POST(_req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const r = await sendFollowUps(course.id, user);
    await writeAuditLog({ actorUserId: user.id, action: "TOPIC_FOLLOW_UPS_SENT", entityType: "Course", entityId: course.id, metadata: { created: r.created, updated: r.updated } });
    return NextResponse.json(r);
  } catch {
    return NextResponse.json({ error: "The follow-up table is not in the database yet — run prisma/migration_oct2026_features.sql in Supabase." }, { status: 500 });
  }
}
