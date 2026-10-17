import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { courseChain, canViewBatch } from "../../../../../lib/outcomeFlow";

export const maxDuration = 60;

// GET — one course's CLOs and assessments for the Outcome Flow (opened when a course is clicked).
export async function GET(_req: Request, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chain = await courseChain(params.courseId);
  if (!chain) return NextResponse.json({ error: "not found" }, { status: 404 });
  const own = chain.course.subjectExpertId === user.id || chain.course.instructorId === user.id;
  if (!own && !(await canViewBatch(user, chain.course.coordinatorId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(chain);
}
