import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { courseChain, canViewBatch } from "../../../../../lib/outcomeFlow";
import { withErrors } from "../../../../../lib/apiHandler";

export const maxDuration = 60;

// GET — one course's CLOs and assessments for the Outcome Flow (opened when a course is clicked).
async function GET_handler(_req: Request, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chain = await courseChain(params.courseId);
  if (!chain) return NextResponse.json({ error: "not found" }, { status: 404 });
  const own = chain.course.subjectExpertId === user.id || chain.course.instructorId === user.id;
  if (!own && !(await canViewBatch(user, chain.course.coordinatorId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(chain);
}
export const GET = withErrors(GET_handler);
