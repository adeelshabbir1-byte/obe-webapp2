import { NextRequest, NextResponse } from "next/server";
import { pickerCourses, pickerGroups } from "../../../../../lib/topicPlan";
import { forbidden, wsUser } from "../../../../../lib/topicApi";
import { withErrors } from "../../../../../lib/apiHandler";

// The course picker: any course of the institute, by code, title, program or batch.
async function GET_handler(req: NextRequest) {
  const user = await wsUser();
  if (!user) return forbidden();
  const q = (req.nextUrl.searchParams.get("q") || "").slice(0, 80);
  // ?flat=1: one row per course of each batch (older callers); otherwise one row per course with its versions.
  if (req.nextUrl.searchParams.get("flat")) return NextResponse.json({ courses: await pickerCourses(user, q) });
  return NextResponse.json({ groups: await pickerGroups(user, q) });
}
export const GET = withErrors(GET_handler);
