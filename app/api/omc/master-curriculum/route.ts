import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

// Lists every Master Curriculum with a course/PLO count, for the picker
// on the editing page — not the full detail (see [id]/route.ts for that).
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const curricula = await prisma.masterCurriculum.findMany({
    select: { id: true, title: true, authority: true, version: true, status: true, _count: { select: { courses: true, plos: true } } },
    orderBy: { title: "asc" },
  });

  return NextResponse.json({ curricula });
}
