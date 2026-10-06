import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";

// Full course list for a curriculum, for the Coordinator's "pick which
// courses to import" checklist — grouped client-side by category/domain.
export async function GET(req: Request, { params }: { params: { curriculumId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || (user.role !== "PROGRAM_COORDINATOR" && user.role !== "OMC")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const courses = await prisma.masterCourse.findMany({
    where: { masterCurriculumId: params.curriculumId },
    select: { id: true, code: true, title: true, category: true, domain: true, semesterNumber: true },
    orderBy: [{ category: "asc" }, { domain: "asc" }, { title: "asc" }],
  });

  // A master curriculum can hold the same course more than once (it was seeded,
  // cloned or bulk-imported repeatedly), which showed up as several identical
  // "Fehm-e-Quran – I" boxes to tick. Show each distinct course once.
  const seen = new Set<string>();
  const unique = courses.filter((c) => {
    const key = `${c.code.trim().toLowerCase()}|${c.title.trim().toLowerCase()}|${(c.domain || "").trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json({ courses: unique, duplicatesHidden: courses.length - unique.length });
}
