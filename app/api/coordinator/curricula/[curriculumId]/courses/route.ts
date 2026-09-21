import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";

// Full course list for a curriculum, for the Coordinator's "pick which
// courses to import" checklist — grouped client-side by category/domain.
export async function GET(req: Request, { params }: { params: { curriculumId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const courses = await prisma.masterCourse.findMany({
    where: { masterCurriculumId: params.curriculumId },
    select: { id: true, code: true, title: true, category: true, domain: true, semesterNumber: true },
    orderBy: [{ category: "asc" }, { domain: "asc" }, { title: "asc" }],
  });

  return NextResponse.json({ courses });
}
