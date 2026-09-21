import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { findOwnInstitutionCurriculum } from "../../../../../lib/institutionCurriculum";

// Every MasterCourse from the OMC's OWN institution's curriculum copy
// (the "HEC course" picker on the Course Equivalence page), not every
// MasterCourse across every institution's clone — each institute now
// has its own full clone of the grand curriculum with identical course
// titles, so an unscoped query would offer the same course repeated
// once per institution that happens to have a clone.
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const curriculum = await findOwnInstitutionCurriculum(user.id);

  const [masterCourses, hecCodes] = await Promise.all([
    curriculum
      ? prisma.masterCourse.findMany({
          where: { masterCurriculumId: curriculum.id },
          select: { id: true, code: true, title: true, masterCurriculum: { select: { title: true } } },
          orderBy: [{ code: "asc" }],
        })
      : Promise.resolve([]),
    prisma.hecPloSuggestion.findMany({ select: { courseCode: true }, distinct: ["courseCode"] }),
  ]);
  const hecCodeSet = new Set(hecCodes.map((h) => h.courseCode));

  return NextResponse.json({
    options: masterCourses.map((mc) => ({
      id: mc.id, code: mc.code, title: mc.title, degreeProgram: mc.masterCurriculum.title,
      hasPloSuggestions: hecCodeSet.has(mc.code),
    })),
  });
}


