import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

// Every MasterCourse (HEC/standard-curriculum template), for the "equate
// with HEC course" picker on the Course Equivalence page. Not scoped to
// the course's own program's curriculum — a general-education or shared
// course can legitimately match a MasterCourse from a different
// program's curriculum, so every option across every curriculum is
// offered rather than narrowed. Each is flagged with whether it
// actually has HEC PLO suggestion data, since linking to one that
// doesn't wouldn't help with PLO copying (though the link itself is
// still valid as general traceability).
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [masterCourses, hecCodes] = await Promise.all([
    prisma.masterCourse.findMany({
      select: { id: true, code: true, title: true, masterCurriculum: { select: { degreeProgram: true } } },
      orderBy: [{ code: "asc" }],
    }),
    prisma.hecPloSuggestion.findMany({ select: { courseCode: true }, distinct: ["courseCode"] }),
  ]);
  const hecCodeSet = new Set(hecCodes.map((h) => h.courseCode));

  return NextResponse.json({
    options: masterCourses.map((mc) => ({
      id: mc.id, code: mc.code, title: mc.title, degreeProgram: mc.masterCurriculum.degreeProgram,
      hasPloSuggestions: hecCodeSet.has(mc.code),
    })),
  });
}
