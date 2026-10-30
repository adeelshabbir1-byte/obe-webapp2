import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { requireInstructorCourse } from "../../../../../../lib/instructorGuard";
import { generateCourseEvaluationForm } from "../../../../../../lib/courseEvaluationGenerator";
import { buildDocxResponse } from "../../../../../../lib/docxExport";
import { withErrors } from "../../../../../../lib/apiHandler";

async function GET_handler(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const doc = await generateCourseEvaluationForm(course.id, user);
    return buildDocxResponse(`${course.code}-Course-Evaluation-Form.docx`, doc);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "something went wrong generating the document" }, { status: 500 });
  }
}
export const GET = withErrors(GET_handler);
