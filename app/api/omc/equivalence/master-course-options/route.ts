import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { findOwningChairmanId } from "../../../../../lib/institutionCurriculum";
import { curriculaWhere } from "../../../../../lib/curriculumLibrary";
import { withErrors } from "../../../../../lib/apiHandler";

// The "HEC course" picker (Content Sync, Course Equivalence): courses of EVERY curriculum the institute may use —
// its own published copies, the official curricula assigned to it, and (for a college) its university's — newest
// edition first, each labelled with its curriculum. Not every institute's clones (those repeat the same titles).
async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await findOwningChairmanId(user.id);
  const curricula = chairmanId
    ? await prisma.masterCurriculum.findMany({ where: { AND: [await curriculaWhere(chairmanId), { status: "PUBLISHED" }] }, select: { id: true, authority: true, title: true, version: true, createdAt: true }, orderBy: [{ version: "desc" }, { createdAt: "desc" }] })
    : [];
  const [masterCourses, hecCodes] = await Promise.all([
    prisma.masterCourse.findMany({ where: { masterCurriculumId: { in: curricula.map((c) => c.id).concat("none") } }, select: { id: true, code: true, title: true, masterCurriculumId: true }, orderBy: [{ code: "asc" }] }),
    prisma.hecPloSuggestion.findMany({ select: { courseCode: true }, distinct: ["courseCode"] }),
  ]);
  const hecCodeSet = new Set(hecCodes.map((h) => h.courseCode));
  const label = new Map(curricula.map((c) => [c.id, `${c.authority} ${c.title} ${c.version}`]));
  const rank = new Map(curricula.map((c, i) => [c.id, i]));
  return NextResponse.json({
    curricula: curricula.map((c) => ({ id: c.id, label: label.get(c.id) })),
    options: masterCourses
      .sort((a, b) => (rank.get(a.masterCurriculumId)! - rank.get(b.masterCurriculumId)!) || a.code.localeCompare(b.code))
      .map((mc) => ({ id: mc.id, code: mc.code, title: mc.title, curriculumId: mc.masterCurriculumId, degreeProgram: label.get(mc.masterCurriculumId) || "", hasPloSuggestions: hecCodeSet.has(mc.code) })),
  });
}
export const GET = withErrors(GET_handler);
