import { NextRequest, NextResponse } from "next/server";
import { pickerCourses } from "../../../../../lib/topicPlan";
import { forbidden, wsUser } from "../../../../../lib/topicApi";
import { withErrors } from "../../../../../lib/apiHandler";

// The course picker: any course of the institute, by code, title, program or batch.
async function GET_handler(req: NextRequest) {
  const user = await wsUser();
  if (!user) return forbidden();
  return NextResponse.json({ courses: await pickerCourses(user, (req.nextUrl.searchParams.get("q") || "").slice(0, 80)) });
}
export const GET = withErrors(GET_handler);
