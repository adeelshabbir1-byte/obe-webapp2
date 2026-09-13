import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { requireOwnedCourse } from "../../../../../../lib/subjectExpertGuard";
import { generateCourseWeeklyPlan } from "../../../../../../lib/courseLogAndPlanGenerator";
import { buildDocxResponse } from "../../../../../../lib/docxExport";

export async function GET(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const doc = await generateCourseWeeklyPlan(course.id);
    return buildDocxResponse(`${course.code}-Tentative-Weekly-Plan.docx`, doc);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "something went wrong generating the document" }, { status: 500 });
  }
}
