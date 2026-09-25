import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { findOwnInstitutionCurriculum } from "../../../../lib/institutionCurriculum";

const ALLOWED_CATEGORIES = ["Domain Elective", "Domain IDS"];

// Every choosable course from the OMC's own institution's curriculum
// copy, for the "fill this slot" picker on the Course Repositioning
// page — Domain Elective (the default) for an unfilled Elective slot,
// or Domain IDS for an unfilled IDS-III/IV slot. The two pools are
// kept deliberately separate: an IDS slot should only ever offer the
// small, restricted IDS list, never the full elective catalog.
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const requestedCategory = req.nextUrl.searchParams.get("category") || "Domain Elective";
  const category = ALLOWED_CATEGORIES.includes(requestedCategory) ? requestedCategory : "Domain Elective";

  const curriculum = await findOwnInstitutionCurriculum(user.id);
  if (!curriculum) return NextResponse.json({ courses: [] });

  const courses = await prisma.masterCourse.findMany({
    where: { masterCurriculumId: curriculum.id, category },
    select: { id: true, code: true, title: true, domain: true },
    orderBy: [{ domain: "asc" }, { title: "asc" }],
  });

  return NextResponse.json({ courses });
}
